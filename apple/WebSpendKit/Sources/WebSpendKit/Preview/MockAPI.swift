import Foundation

public actor MockAPI: WebSpendAPI {
    public struct Failure: Error, LocalizedError, Sendable {
        public let message: String
        public var errorDescription: String? { message }
    }

    private var user = Fixtures.user
    private var categoriesStore = Fixtures.categories
    private var accountsStore = Fixtures.accounts
    private var transactionsStore = Fixtures.transactions
    private var payeeRules: [String: String] = [:]
    private let latency: Duration

    public init(latency: Duration = .milliseconds(120)) {
        self.latency = latency
    }

    private func pause() async {
        if latency > .zero { try? await Task.sleep(for: latency) }
    }

    // MARK: Meta and sign-in

    public func meta() async throws -> Meta { Fixtures.meta }

    public func devSignIn(email: String) async throws -> SessionResponse {
        await pause()
        user.email = email
        return SessionResponse(token: "demo-token", user: user)
    }

    public func logout() async throws {}

    public func me() async throws -> User { user }

    public func updateSettings(_ request: UpdateSettingsRequest) async throws -> User {
        await pause()
        if let value = request.defaultCurrency { user.defaultCurrency = value }
        if let value = request.showUsdEquivalent { user.showUsdEquivalent = value }
        if let value = request.theme { user.theme = value }
        if let value = request.monthlyBudgetMinor { user.monthlyBudgetMinor = value }
        return user
    }

    // MARK: Summary and transactions

    public func summary(month: String?) async throws -> Summary {
        await pause()
        let month = month ?? Fixtures.currentMonth
        var summary = Fixtures.summary(month: month)
        summary.currency = user.defaultCurrency
        summary.budgetMinor = user.monthlyBudgetMinor
        summary.leftMinor = user.monthlyBudgetMinor.map { $0 - summary.spentMinor }
        summary.leftUsdMinor = summary.leftMinor.map { Money.toUsdMinor($0, perUsd: Fixtures.rate) }
        summary.todayPerUsd = user.defaultCurrency == .usd ? nil : Fixtures.rate
        summary.carryOverMinor = month == Fixtures.currentMonth ? 64_000_000 : 0
        summary.uncategorisedCount = transactionsStore.filter { $0.needsCategory && $0.occurredAt.hasPrefix(month) }.count
        if month != Fixtures.currentMonth {
            summary.spentMinor = 0
            summary.incomeMinor = 0
            summary.spentUsdMinor = 0
            summary.incomeUsdMinor = 0
            summary.leftMinor = user.monthlyBudgetMinor
            summary.leftUsdMinor = summary.leftMinor.map { Money.toUsdMinor($0, perUsd: Fixtures.rate) }
            summary.byCategory = []
        }
        summary.availableMinor = summary.carriedOver + summary.incomeMinor - summary.spentMinor
        summary.carryOverUsdMinor = Money.toUsdMinor(summary.carriedOver, perUsd: Fixtures.rate)
        summary.availableUsdMinor = Money.toUsdMinor(summary.available, perUsd: Fixtures.rate)
        return summary
    }

    public func transactions(_ query: TransactionQuery) async throws -> TransactionsResponse {
        await pause()
        var items = transactionsStore.sorted { $0.occurredAt > $1.occurredAt }
        if let month = query.month { items = items.filter { $0.occurredAt.hasPrefix(month) } }
        if let q = query.q?.trimmingCharacters(in: .whitespaces), !q.isEmpty {
            items = items.filter { t in
                [t.title, t.userDescription, t.bankDescription, t.counterpartyName, t.categoryName]
                    .compactMap { $0 }
                    .contains { $0.localizedCaseInsensitiveContains(q) }
            }
        }
        if let categoryId = query.categoryId {
            items = categoryId == TransactionQuery.uncategorised
                ? items.filter { $0.needsCategory }
                : items.filter { $0.categoryId == categoryId }
        }
        if let accountId = query.accountId { items = items.filter { $0.accountId == accountId } }
        if let type = query.type { items = items.filter { $0.type == type } }
        if query.unsure { items = items.filter { $0.unsureTransfer } }
        if let before = query.before { items = items.filter { $0.occurredAt < before } }
        let limit = query.limit ?? 100
        let page = Array(items.prefix(limit))
        return TransactionsResponse(transactions: page, hasMore: items.count > limit)
    }

    public func transaction(id: String) async throws -> Transaction {
        guard let t = transactionsStore.first(where: { $0.id == id }) else {
            throw Failure(message: "No transaction with id \(id).")
        }
        return t
    }

    public func updateTransaction(id: String, _ request: UpdateTransactionRequest) async throws -> Transaction {
        await pause()
        guard let index = transactionsStore.firstIndex(where: { $0.id == id }) else {
            throw Failure(message: "No transaction with id \(id).")
        }
        var t = transactionsStore[index]
        if let categoryId = request.categoryId {
            t.categoryId = categoryId
            t.categoryName = categoryId.flatMap { id in categoriesStore.first { $0.id == id }?.name }
            if request.rememberForPayee == true, let payee = t.counterpartyName, let categoryId {
                payeeRules[payee] = categoryId
            }
        }
        if let description = request.userDescription {
            t.userDescription = description?.isEmpty == true ? nil : description
        }
        if let title = request.title {
            t.userTitle = title?.isEmpty == true ? nil : title
        }
        if let payee = request.counterpartyName {
            t.counterpartyName = payee?.isEmpty == true ? nil : payee
        }
        if let amountMinor = request.amountMinor {
            t.amountMinor = amountMinor
            t.defaultMinor = t.currency == .usd ? Int((Double(amountMinor) * Fixtures.rate).rounded()) : amountMinor
            t.usdMinor = t.currency == .usd ? amountMinor : Money.toUsdMinor(amountMinor, perUsd: Fixtures.rate)
        }
        if let occurredAt = request.occurredAt { t.occurredAt = occurredAt }
        if request.title != nil || request.userDescription != nil || request.counterpartyName != nil {
            t.title = t.userTitle ?? t.userDescription ?? t.counterpartyName ?? t.bankDescription ?? "Transaction"
        }
        if let type = request.type {
            t.type = type
            t.unsureTransfer = false
            if let group = t.transferGroupId {
                for i in transactionsStore.indices where transactionsStore[i].transferGroupId == group && transactionsStore[i].id != id {
                    transactionsStore[i].type = type
                }
            }
        }
        transactionsStore[index] = t
        return t
    }

    public func createTransaction(_ request: CreateTransactionRequest) async throws -> Transaction {
        await pause()
        guard let account = accountsStore.first(where: { $0.id == request.accountId }) else {
            throw Failure(message: "No account with id \(request.accountId).")
        }
        let category = request.categoryId.flatMap { id in categoriesStore.first { $0.id == id } }
        let isUsd = request.currency == .usd
        let t = Transaction(
            id: "t_\(UUID().uuidString.prefix(8))", occurredAt: request.occurredAt, type: request.type,
            amountMinor: request.amountMinor, currency: request.currency,
            defaultMinor: isUsd ? Int((Double(request.amountMinor) * Fixtures.rate).rounded()) : request.amountMinor,
            defaultCurrency: user.defaultCurrency,
            usdMinor: isUsd ? request.amountMinor : Money.toUsdMinor(request.amountMinor, perUsd: Fixtures.rate),
            fxPerUsd: Fixtures.rate, accountId: account.id, accountName: account.name, bank: account.bank,
            title: request.userDescription, counterpartyName: request.counterpartyName, counterpartyBank: nil,
            counterpartyAccount: nil, bankDescription: nil, userDescription: request.userDescription,
            categoryId: category?.id, categoryName: category?.name, source: .manual, bankReference: nil,
            transferGroupId: nil, isFee: false, createdAt: ISO8601.string(Date())
        )
        transactionsStore.append(t)
        return t
    }

    public func deleteTransaction(id: String) async throws {
        await pause()
        guard let t = transactionsStore.first(where: { $0.id == id }) else {
            throw Failure(message: "No transaction with id \(id).")
        }
        guard t.source != .alert else {
            throw Failure(message: "Transactions from alerts cannot be deleted.")
        }
        transactionsStore.removeAll { $0.id == id }
    }

    // MARK: Categories

    public func categories() async throws -> [Category] {
        await pause()
        return categoriesStore.sorted { $0.sortOrder < $1.sortOrder }
    }

    public func createCategory(name: String) async throws -> Category {
        await pause()
        let category = Category(id: "c_\(UUID().uuidString.prefix(8))", name: name, sortOrder: (categoriesStore.map(\.sortOrder).max() ?? -1) + 1)
        categoriesStore.append(category)
        return category
    }

    public func updateCategory(id: String, _ request: UpdateCategoryRequest) async throws -> Category {
        await pause()
        guard let index = categoriesStore.firstIndex(where: { $0.id == id }) else {
            throw Failure(message: "No category with id \(id).")
        }
        if let name = request.name {
            categoriesStore[index].name = name
            for i in transactionsStore.indices where transactionsStore[i].categoryId == id {
                transactionsStore[i].categoryName = name
            }
        }
        if let sortOrder = request.sortOrder { categoriesStore[index].sortOrder = sortOrder }
        return categoriesStore[index]
    }

    public func deleteCategory(id: String) async throws {
        await pause()
        categoriesStore.removeAll { $0.id == id }
        for i in transactionsStore.indices where transactionsStore[i].categoryId == id {
            transactionsStore[i].categoryId = nil
            transactionsStore[i].categoryName = nil
        }
    }

    // MARK: Accounts

    public func accounts() async throws -> [Account] {
        await pause()
        return accountsStore
    }

    public func createAccount(_ request: CreateAccountRequest) async throws -> Account {
        await pause()
        let account = Account(
            id: "a_\(UUID().uuidString.prefix(8))", bank: request.bank, name: request.name,
            accountNumber: request.accountNumber, currency: request.currency ?? user.defaultCurrency,
            isOwn: request.isOwn ?? true, tracked: false, trackingFrom: nil, status: .off,
            lastBalanceMinor: nil, lastBalanceAt: nil, lastAlertAt: nil
        )
        accountsStore.append(account)
        return account
    }

    public func updateAccount(id: String, _ request: UpdateAccountRequest) async throws -> Account {
        await pause()
        guard let index = accountsStore.firstIndex(where: { $0.id == id }) else {
            throw Failure(message: "No account with id \(id).")
        }
        var account = accountsStore[index]
        if let name = request.name { account.name = name }
        if let number = request.accountNumber { account.accountNumber = number }
        if let isOwn = request.isOwn { account.isOwn = isOwn }
        if let tracked = request.tracked {
            account.tracked = tracked
            if tracked {
                account.trackingFrom = ISO8601.string(Date())
                account.status = account.lastAlertAt == nil ? .waiting : .tracking
            } else {
                account.status = .off
            }
        }
        accountsStore[index] = account
        return account
    }

    public func deleteAccount(id: String) async throws {
        await pause()
        guard !transactionsStore.contains(where: { $0.accountId == id }) else {
            throw Failure(message: "This account still has transactions.")
        }
        accountsStore.removeAll { $0.id == id }
    }

    // MARK: Alerts, rates

    public func failedAlerts() async throws -> [RawAlert] { Fixtures.failedAlerts }

    public func rates(day: String?) async throws -> [FxRate] { Fixtures.rates }

    public func refreshRates() async throws -> [FxRate] {
        await pause()
        return Fixtures.rates
    }

    // MARK: Import

    public func importPreview(_ request: ImportPreviewRequest) async throws -> ImportPreviewResponse {
        await pause()
        let rows = parseRows(request)
        guard let header = rows.first else { throw Failure(message: "The file is empty.") }
        let body = rows.dropFirst()
        let sample = body.prefix(5).map { row in
            Dictionary(uniqueKeysWithValues: zip(header, row + Array(repeating: "", count: max(0, header.count - row.count))))
        }
        var columns: [String: ImportField] = [:]
        for column in header {
            let key = column.lowercased()
            if key.contains("date") { columns[column] = .date }
            else if key.contains("debit") || key.contains("withdraw") { columns[column] = .debit }
            else if key.contains("credit") || key.contains("deposit") { columns[column] = .credit }
            else if key.contains("amount") { columns[column] = .amount }
            else if key.contains("desc") || key.contains("narr") || key.contains("memo") { columns[column] = .description }
            else if key.contains("categ") { columns[column] = .category }
            else if key.contains("ref") { columns[column] = .reference }
            else if key.contains("balance") { columns[column] = .balance }
            else if key.contains("payee") || key.contains("counter") || key.contains("beneficiary") { columns[column] = .counterparty }
            else { columns[column] = .ignore }
        }
        let dateColumn = columns.first { $0.value == .date }?.key
        let ambiguous = body.contains { row in
            guard let dateColumn, let index = header.firstIndex(of: dateColumn), index < row.count else { return false }
            let parts = row[index].split(whereSeparator: { "/-.".contains($0) })
            guard parts.count == 3, let a = Int(parts[0]), let b = Int(parts[1]) else { return false }
            return a <= 12 && b <= 12
        }
        return ImportPreviewResponse(
            columns: header, sampleRows: sample, rowCount: body.count,
            suggestedMapping: ImportMapping(columns: columns, dateOrder: .dmy, negativeIsExpense: true),
            dateAmbiguous: ambiguous
        )
    }

    /// Mirrors the server's rules closely enough for the demo: rows are mapped by `mapping`, a
    /// `category` column creates names that are not on the list, a row matching a logged
    /// transaction (same account, amount, day and description) is skipped and hands its category
    /// to that transaction when it has none.
    public func importCommit(_ request: ImportCommitRequest) async throws -> ImportCommitResponse {
        await pause()
        guard let account = accountsStore.first(where: { $0.id == request.accountId }) else {
            throw Failure(message: "No account with id \(request.accountId).")
        }
        let rows = parseRows(ImportPreviewRequest(accountId: request.accountId, format: request.format, content: request.content))
        guard let header = rows.first else { throw Failure(message: "The file is empty.") }
        let mapping = request.mapping
        func column(_ field: ImportField) -> Int? {
            mapping.columns.first { $0.value == field }.flatMap { header.firstIndex(of: $0.key) }
        }

        var added = 0, skipped = 0, categoriesCreated = 0, categorised = 0
        var errors: [ImportRowError] = []
        for (offset, row) in rows.dropFirst().enumerated() {
            func cell(_ field: ImportField) -> String? {
                guard let index = column(field), index < row.count else { return nil }
                let value = row[index].trimmingCharacters(in: .whitespaces)
                return value.isEmpty ? nil : value
            }
            guard let date = cell(.date).flatMap({ Self.importDate($0, order: mapping.dateOrder) }) else {
                errors.append(ImportRowError(row: offset + 1, reason: "unreadable date \"\(cell(.date) ?? "")\""))
                continue
            }
            let amountMinor: Int
            let type: TransactionType
            if let debit = cell(.debit).flatMap(Money.parseMinor), debit > 0 {
                (amountMinor, type) = (debit, .expense)
            } else if let credit = cell(.credit).flatMap(Money.parseMinor), credit > 0 {
                (amountMinor, type) = (credit, .income)
            } else if let amount = cell(.amount).flatMap(Money.parseMinor), amount != 0 {
                (amountMinor, type) = (abs(amount), (amount < 0) == mapping.negativeIsExpense ? .expense : .income)
            } else {
                errors.append(ImportRowError(row: offset + 1, reason: "no amount"))
                continue
            }
            let description = cell(.description)
            let categoryId: String? = cell(.category).map { name in
                if let existing = categoriesStore.first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                    return existing.id
                }
                let created = Category(id: "c_\(UUID().uuidString.prefix(8))", name: name, sortOrder: categoriesStore.count)
                categoriesStore.append(created)
                categoriesCreated += 1
                return created.id
            }
            let categoryName = categoryId.flatMap { id in categoriesStore.first { $0.id == id }?.name }

            let day = String(ISO8601.string(date).prefix(10))
            let wording = (description ?? "").lowercased()
            if let index = transactionsStore.firstIndex(where: {
                $0.accountId == account.id && $0.amountMinor == amountMinor && $0.occurredAt.hasPrefix(day)
                    && ($0.bankDescription ?? $0.title).lowercased() == wording
            }) {
                skipped += 1
                if transactionsStore[index].categoryId == nil, let categoryId {
                    transactionsStore[index].categoryId = categoryId
                    transactionsStore[index].categoryName = categoryName
                    categorised += 1
                }
                continue
            }

            let isUsd = account.currency == .usd
            transactionsStore.append(Transaction(
                id: "t_\(UUID().uuidString.prefix(8))", occurredAt: ISO8601.string(date), type: type,
                amountMinor: amountMinor, currency: account.currency,
                defaultMinor: isUsd ? Int((Double(amountMinor) * Fixtures.rate).rounded()) : amountMinor,
                defaultCurrency: user.defaultCurrency,
                usdMinor: isUsd ? amountMinor : Money.toUsdMinor(amountMinor, perUsd: Fixtures.rate),
                fxPerUsd: Fixtures.rate, accountId: account.id, accountName: account.name, bank: account.bank,
                title: description ?? cell(.counterparty) ?? "Imported transaction", counterpartyName: cell(.counterparty),
                counterpartyBank: nil, counterpartyAccount: nil, bankDescription: description, userDescription: nil,
                categoryId: categoryId, categoryName: categoryName, source: .import, bankReference: cell(.reference),
                transferGroupId: nil, isFee: false, createdAt: ISO8601.string(Date())
            ))
            added += 1
        }
        return ImportCommitResponse(
            importId: "imp_\(UUID().uuidString.prefix(8))", added: added, skipped: skipped, errors: errors,
            categoriesCreated: categoriesCreated, categorised: categorised
        )
    }

    /// ISO 8601, or three numeric parts read in `order`. Numeric dates land at noon UTC so the
    /// calendar day never shifts.
    static func importDate(_ raw: String, order: DateOrder) -> Date? {
        if let date = ISO8601.parse(raw) { return date }
        let parts = raw.split(whereSeparator: { "/-. ".contains($0) }).prefix(3).compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let (year, month, day): (Int, Int, Int) = switch order {
        case .dmy: (parts[2], parts[1], parts[0])
        case .mdy: (parts[2], parts[0], parts[1])
        case .ymd: (parts[0], parts[1], parts[2])
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: DateComponents(year: year < 100 ? 2000 + year : year, month: month, day: day, hour: 12))
    }

    /// A CSV shaped like the server's, from the in-memory ledger. PDF needs the real server.
    public func export(_ query: ExportQuery) async throws -> ExportedFile {
        await pause()
        guard query.format == .csv else { throw Failure(message: "PDF export needs the real server.") }
        let today = String(ISO8601.string(Date()).prefix(10))
        let to = query.to ?? today
        let from = query.from ?? "\(to.prefix(7))-01"
        var rows = transactionsStore
            .filter { let day = String($0.occurredAt.prefix(10)); return day >= from && day <= to }
            .sorted { $0.occurredAt > $1.occurredAt }
        if let accountId = query.accountId { rows = rows.filter { $0.accountId == accountId } }
        if let type = query.type { rows = rows.filter { $0.type == type } }
        let header = ["Date", "Time", "Type", "Title", "Description", "Category", "Account", "Bank", "Amount", "Currency", "Amount (\(user.defaultCurrency.rawValue))", "USD equivalent", "Counterparty", "Reference", "Source"]
        func decimal(_ minor: Int?, _ type: TransactionType) -> String {
            guard let minor else { return "" }
            return (type == .expense ? "-" : "") + String(format: "%d.%02d", abs(minor) / 100, abs(minor) % 100)
        }
        func cell(_ value: String) -> String {
            value.contains(where: { $0 == "," || $0 == "\"" || $0.isNewline }) ? "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : value
        }
        let lines = [header] + rows.map { t in [
            String(t.occurredAt.prefix(10)), String(t.occurredAt.dropFirst(11).prefix(5)),
            t.type == .transfer ? "Transfer to self" : t.type == .expense ? "Expense" : "Income",
            t.title, t.userDescription ?? "", t.categoryName ?? "", t.accountName, t.bank.label,
            decimal(t.amountMinor, t.type), t.currency.rawValue, decimal(t.defaultMinor, t.type), decimal(t.usdMinor, t.type),
            t.counterpartyName ?? "", t.bankReference ?? "",
            t.source == .alert ? "Bank alert" : t.source == .import ? "Statement import" : "Entered by hand",
        ] }
        let csv = "\u{FEFF}" + lines.map { $0.map(cell).joined(separator: ",") }.joined(separator: "\r\n") + "\r\n"
        return ExportedFile(filename: query.filename(from: from, to: to), contentType: "text/csv; charset=utf-8", data: Data(csv.utf8))
    }

    public func intakeEmail(_ request: IntakeEmailRequest, secret: String) async throws -> RawAlert {
        RawAlert(id: "ra_\(UUID().uuidString.prefix(8))", receivedAt: request.receivedAt, sender: request.from, subject: request.subject, status: .parsed, detail: nil, transactionId: nil)
    }

    private func parseRows(_ request: ImportPreviewRequest) -> [[String]] {
        switch request.format {
        case .csv:
            return request.content
                .split(whereSeparator: \.isNewline)
                .map { line in line.split(separator: ",", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) } }
        case .json:
            guard let data = request.content.data(using: .utf8),
                  let objects = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
                  let first = objects.first else { return [] }
            let keys = first.keys.sorted()
            return [keys] + objects.map { object in keys.map { key in object[key].map { "\($0)" } ?? "" } }
        }
    }
}
