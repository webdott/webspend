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
    private var gapsStore = Fixtures.gaps
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
        summary.openGapCount = gapsStore.filter { $0.status == .open }.count
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
            t.title = t.userDescription ?? t.counterpartyName ?? t.bankDescription ?? t.title
        }
        if let type = request.type {
            t.type = type
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
        let t = Transaction(
            id: "t_\(UUID().uuidString.prefix(8))", occurredAt: request.occurredAt, type: request.type,
            amountMinor: request.amountMinor, currency: request.currency, defaultMinor: request.amountMinor,
            defaultCurrency: user.defaultCurrency, usdMinor: Money.toUsdMinor(request.amountMinor, perUsd: Fixtures.rate),
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

    // MARK: Gaps, alerts, rates

    public func gaps(status: GapStatus?) async throws -> [Gap] {
        await pause()
        guard let status else { return gapsStore }
        return gapsStore.filter { $0.status == status }
    }

    public func updateGap(id: String, _ request: UpdateGapRequest) async throws -> Gap {
        await pause()
        guard let index = gapsStore.firstIndex(where: { $0.id == id }) else {
            throw Failure(message: "No gap with id \(id).")
        }
        gapsStore[index].status = request.status == .open ? .open : .dismissed
        return gapsStore[index]
    }

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

    public func importCommit(_ request: ImportCommitRequest) async throws -> ImportCommitResponse {
        await pause()
        let rows = parseRows(ImportPreviewRequest(accountId: request.accountId, format: request.format, content: request.content))
        let count = max(0, rows.count - 1)
        let skipped = min(count, 1)
        if let gapId = request.gapId, let index = gapsStore.firstIndex(where: { $0.id == gapId }) {
            gapsStore[index].status = .filled
        }
        return ImportCommitResponse(importId: "imp_\(UUID().uuidString.prefix(8))", added: count - skipped, skipped: skipped, errors: [])
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
