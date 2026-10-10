import SwiftUI
import WebSpendKit

@MainActor
@Observable
final class AppStore {
    enum Phase: Equatable { case booting, signedOut, signedIn }

    enum Filter: String, CaseIterable, Identifiable {
        case all = "All"
        case needsCategory = "Needs a category"
        case unsure = "Unsure"
        case expenses = "Expenses"
        case income = "Income"
        case transfers = "Transfers"
        var id: String { rawValue }
    }

    enum MacSection: String, CaseIterable, Identifiable {
        case summary = "Summary"
        case transactions = "Transactions"
        case categories = "Categories"
        case `import` = "Import"
        case accounts = "Accounts"
        case settings = "Settings"
        var id: String { rawValue }
        var systemImage: String {
            switch self {
            case .summary: "chart.pie"
            case .transactions: "list.bullet.rectangle"
            case .categories: "tag"
            case .import: "square.and.arrow.down"
            case .accounts: "building.columns"
            case .settings: "gearshape"
            }
        }
    }

    #if os(iOS)
    static let clientName = "iphone"
    #else
    static let clientName = "mac"
    #endif

    private(set) var api: any WebSpendAPI
    private(set) var phase: Phase = .booting
    private(set) var isDemo = false
    var user: User?
    var meta: Meta?
    var metaError: String?
    var serverURLString: String
    var isSigningIn = false
    var signInError: String?
    var toast: String?

    var month: String = Dates.monthID()
    var summary: Loadable<Summary> = .idle
    var latest: Loadable<[Transaction]> = .idle
    var transactions: Loadable<[Transaction]> = .idle
    var hasMoreTransactions = false
    var isLoadingMore = false
    var searchText = ""
    var filter: Filter = .all
    /// Limits the activity list to one month. Nil shows every month.
    var activityMonth: String?
    var categories: Loadable<[Category]> = .idle
    var accounts: Loadable<[Account]> = .idle
    var rates: [FxRate] = []

    var macSection: MacSection = .summary
    /// Shows the add-a-transaction sheet. Set from any screen's Add button.
    var isAddingTransaction = false
    /// Shows the export sheet, started from the month on show.
    var isExporting = false

    init() {
        let url = SessionStorage.serverURL
        serverURLString = url.absoluteString
        api = APIClient(baseURL: url, token: SessionStorage.loadToken())
    }

    static func demo() -> AppStore {
        let store = AppStore()
        store.startDemo()
        return store
    }

    // MARK: Derived

    var showUsd: Bool { user?.showsUsdLine ?? true }
    var defaultCurrency: Currency { user?.defaultCurrency ?? .ngn }

    var preferredColorScheme: ColorScheme? {
        switch user?.theme ?? .auto {
        case .auto: nil
        case .light: .light
        case .dark: .dark
        }
    }

    var todayPerUsd: Double? {
        if let rate = summary.value?.todayPerUsd { return rate }
        return rates.first { $0.currency == defaultCurrency }?.perUsd
    }

    var lastAlertText: String {
        if let relative = Dates.relative(iso: summary.value?.lastAlertAt) { return "Last alert \(relative)" }
        return "No alerts yet"
    }

    var monthTitle: String { Dates.monthTitle(month) }

    // MARK: Session

    func bootstrap() async {
        guard phase == .booting else { return }
        // `--demo` (an Xcode scheme argument or `open --args --demo`) skips sign-in and uses MockAPI.
        if CommandLine.arguments.contains("--demo") {
            startDemo()
            return
        }
        await loadMeta()
        guard SessionStorage.loadToken() != nil else {
            phase = .signedOut
            return
        }
        do {
            user = try await api.me()
            phase = .signedIn
            await refreshAll()
        } catch {
            if (error as? APIClientError)?.isUnauthorized == true {
                SessionStorage.deleteToken()
                api = APIClient(baseURL: SessionStorage.serverURL, token: nil)
            } else {
                signInError = describe(error)
            }
            phase = .signedOut
        }
    }

    func loadMeta() async {
        guard !isDemo else { return }
        do {
            meta = try await api.meta()
            metaError = nil
        } catch {
            meta = nil
            metaError = describe(error)
        }
    }

    @discardableResult
    func applyServerURL() -> Bool {
        let trimmed = serverURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), let scheme = url.scheme, ["http", "https"].contains(scheme), url.host != nil else {
            signInError = "Enter a server address like http://localhost:8787"
            return false
        }
        SessionStorage.serverURL = url
        serverURLString = url.absoluteString
        if !isDemo {
            api = APIClient(baseURL: url, token: SessionStorage.loadToken())
        }
        signInError = nil
        return true
    }

    var googleSignInURL: URL? {
        SessionStorage.googleSignInURL(server: SessionStorage.serverURL, client: AppStore.clientName)
    }

    func handleCallback(_ url: URL) async {
        guard let token = SessionStorage.token(fromCallback: url) else {
            signInError = "The sign-in reply did not include a token."
            return
        }
        await completeSignIn(token: token)
    }

    func devSignIn(email: String) async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.contains("@") else {
            signInError = "Enter the email address that receives your bank alerts."
            return
        }
        guard applyServerURL() else { return }
        isSigningIn = true
        defer { isSigningIn = false }
        do {
            let response = try await api.devSignIn(email: trimmed)
            await completeSignIn(token: response.token, user: response.user)
        } catch {
            signInError = describe(error)
        }
    }

    private func completeSignIn(token: String, user known: User? = nil) async {
        do {
            try SessionStorage.saveToken(token)
        } catch {
            signInError = "Could not store the session: \(error.localizedDescription)"
            return
        }
        let client = APIClient(baseURL: SessionStorage.serverURL, token: token)
        api = client
        isDemo = false
        do {
            if let known {
                user = known
            } else {
                user = try await client.me()
            }
            signInError = nil
            phase = .signedIn
            await refreshAll()
        } catch {
            signInError = describe(error)
        }
    }

    func startDemo() {
        api = MockAPI()
        isDemo = true
        user = Fixtures.user
        meta = Fixtures.meta
        signInError = nil
        phase = .signedIn
        resetData()
        Task { await refreshAll() }
    }

    func signOut() async {
        if !isDemo {
            try? await api.logout()
            SessionStorage.deleteToken()
        }
        api = APIClient(baseURL: SessionStorage.serverURL, token: nil)
        isDemo = false
        user = nil
        resetData()
        phase = .signedOut
        await loadMeta()
    }

    private func resetData() {
        summary = .idle
        latest = .idle
        transactions = .idle
        categories = .idle
        accounts = .idle
        rates = []
        hasMoreTransactions = false
        searchText = ""
        filter = .all
        month = Dates.monthID()
        macSection = .summary
    }

    // MARK: Loading

    func refreshAll() async {
        async let a: Void = loadSummary()
        async let b: Void = loadTransactions()
        async let c: Void = loadCategories()
        async let d: Void = loadAccounts()
        async let e: Void = loadRates()
        _ = await (a, b, c, d, e)
    }

    func loadSummary() async {
        if summary.value == nil { summary = .loading }
        if latest.value == nil { latest = .loading }
        let month = month
        do {
            async let s = api.summary(month: month)
            async let l = api.transactions(TransactionQuery(month: month, limit: 6))
            let (loadedSummary, loadedLatest) = try await (s, l)
            guard month == self.month else { return }
            summary = .loaded(loadedSummary)
            latest = .loaded(loadedLatest.transactions)
        } catch {
            guard month == self.month else { return }
            summary = .failed(describe(error))
            latest = .failed(describe(error))
        }
    }

    /// Months after the current one cannot be opened.
    var canGoToNextMonth: Bool { month < Dates.monthID() }

    func goToPreviousMonth() {
        goToMonth(Dates.shiftMonth(month, by: -1))
    }

    func goToNextMonth() {
        goToMonth(Dates.shiftMonth(month, by: 1))
    }

    func goToMonth(_ id: String) {
        let target = min(id, Dates.monthID())
        guard target != month else { return }
        month = target
        summary = .loading
        latest = .loading
        Task { await loadSummary() }
    }

    private var transactionQuery: TransactionQuery {
        var query = TransactionQuery(limit: 50)
        query.month = activityMonth
        query.q = searchText.isEmpty ? nil : searchText
        switch filter {
        case .all: break
        case .needsCategory: query.categoryId = TransactionQuery.uncategorised
        case .unsure: query.unsure = true
        case .expenses: query.type = .expense
        case .income: query.type = .income
        case .transfers: query.type = .transfer
        }
        return query
    }

    func loadTransactions() async {
        if transactions.value == nil { transactions = .loading }
        let query = transactionQuery
        do {
            let page = try await api.transactions(query)
            guard query == transactionQuery else { return }
            transactions = .loaded(page.transactions)
            hasMoreTransactions = page.hasMore
        } catch {
            guard query == transactionQuery else { return }
            transactions = .failed(describe(error))
        }
    }

    func loadMoreTransactions() async {
        guard hasMoreTransactions, !isLoadingMore, let current = transactions.value, let last = current.last else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        var query = transactionQuery
        query.before = last.occurredAt
        do {
            let page = try await api.transactions(query)
            transactions = .loaded(current + page.transactions)
            hasMoreTransactions = page.hasMore
        } catch {
            toast = describe(error)
        }
    }

    func loadCategories() async {
        if categories.value == nil { categories = .loading }
        do {
            categories = .loaded(try await api.categories())
        } catch {
            categories = .failed(describe(error))
        }
    }

    func loadAccounts() async {
        if accounts.value == nil { accounts = .loading }
        do {
            accounts = .loaded(try await api.accounts())
        } catch {
            accounts = .failed(describe(error))
        }
    }

    func loadRates() async {
        rates = (try? await api.rates(day: nil)) ?? []
    }

    // MARK: Transactions

    @discardableResult
    func updateTransaction(id: String, _ request: UpdateTransactionRequest) async throws -> Transaction {
        let updated = try await api.updateTransaction(id: id, request)
        replace(updated)
        Task { await loadSummary() }
        return updated
    }

    /// Records a transaction entered by hand and returns the account it went on. A nil
    /// `accountId` means cash: the Cash account is used, and created if there is none yet.
    @discardableResult
    func addTransaction(accountId: String?, occurredAt: String, type: TransactionType, amountMinor: Int, description: String, categoryId: String?) async throws -> String {
        let account: Account
        if let accountId, let known = accounts.value?.first(where: { $0.id == accountId }) {
            account = known
        } else if let cash = accounts.value?.first(where: { $0.bank == .cash }) {
            account = cash
        } else {
            account = try await api.createAccount(CreateAccountRequest(bank: .cash, name: "Cash", accountNumber: nil, currency: defaultCurrency, isOwn: true))
        }
        _ = try await api.createTransaction(CreateTransactionRequest(accountId: account.id, occurredAt: occurredAt, type: type, amountMinor: amountMinor, currency: account.currency, userDescription: description, categoryId: categoryId))
        async let a: Void = loadSummary()
        async let b: Void = loadTransactions()
        async let c: Void = loadAccounts()
        _ = await (a, b, c)
        return account.id
    }

    func deleteTransaction(id: String) async throws {
        try await api.deleteTransaction(id: id)
        if var list = transactions.value {
            list.removeAll { $0.id == id }
            transactions = .loaded(list)
        }
        if var list = latest.value {
            list.removeAll { $0.id == id }
            latest = .loaded(list)
        }
        Task { await loadSummary() }
    }

    private func replace(_ transaction: Transaction) {
        if var list = transactions.value, let index = list.firstIndex(where: { $0.id == transaction.id }) {
            list[index] = transaction
            transactions = .loaded(list)
        }
        if var list = latest.value, let index = list.firstIndex(where: { $0.id == transaction.id }) {
            list[index] = transaction
            latest = .loaded(list)
        }
    }

    // MARK: Categories

    func createCategory(name: String) async {
        do {
            _ = try await api.createCategory(name: name)
            await loadCategories()
        } catch {
            toast = describe(error)
        }
    }

    func renameCategory(id: String, name: String) async {
        do {
            _ = try await api.updateCategory(id: id, UpdateCategoryRequest(name: name))
            await loadCategories()
            await loadTransactions()
        } catch {
            toast = describe(error)
        }
    }

    func deleteCategory(id: String) async {
        do {
            try await api.deleteCategory(id: id)
            await loadCategories()
            await loadTransactions()
            await loadSummary()
        } catch {
            toast = describe(error)
        }
    }

    // MARK: Settings

    func updateSettings(_ request: UpdateSettingsRequest) async {
        do {
            user = try await api.updateSettings(request)
            if request.defaultCurrency != nil || request.monthlyBudgetMinor != nil {
                await loadSummary()
            }
        } catch {
            toast = describe(error)
        }
    }

    // MARK: Accounts

    func setTracking(bank: Bank, on: Bool) async {
        do {
            let existing = accounts.value?.first { $0.bank == bank }
            let account: Account
            if let existing {
                account = existing
            } else {
                account = try await api.createAccount(CreateAccountRequest(bank: bank, name: bank.label, accountNumber: nil, currency: bank == .grey ? .usd : defaultCurrency, isOwn: true))
            }
            _ = try await api.updateAccount(id: account.id, UpdateAccountRequest(tracked: on))
            await loadAccounts()
            await loadSummary()
        } catch {
            toast = describe(error)
        }
    }

    func createAccount(_ request: CreateAccountRequest) async {
        do {
            _ = try await api.createAccount(request)
            await loadAccounts()
        } catch {
            toast = describe(error)
        }
    }

    func updateAccount(id: String, name: String, accountNumber: String?) async {
        do {
            _ = try await api.updateAccount(id: id, UpdateAccountRequest(name: name, accountNumber: .some(accountNumber)))
            await loadAccounts()
            await loadTransactions()
            await loadSummary()
        } catch {
            toast = describe(error)
        }
    }

    func deleteAccount(id: String) async {
        do {
            try await api.deleteAccount(id: id)
            await loadAccounts()
        } catch {
            toast = describe(error)
        }
    }

    // MARK: Import

    func importPreview(_ request: ImportPreviewRequest) async throws -> ImportPreviewResponse {
        try await api.importPreview(request)
    }

    func importCommit(_ request: ImportCommitRequest) async throws -> ImportCommitResponse {
        let result = try await api.importCommit(request)
        await refreshAll()
        return result
    }

    // MARK: Errors

    func describe(_ error: Error) -> String {
        if let apiError = error as? APIClientError { return apiError.errorDescription ?? "Unknown error" }
        if let localized = error as? LocalizedError, let text = localized.errorDescription { return text }
        return error.localizedDescription
    }
}
