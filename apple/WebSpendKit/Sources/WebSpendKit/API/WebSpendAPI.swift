import Foundation

public protocol WebSpendAPI: Sendable {
    func meta() async throws -> Meta
    func devSignIn(email: String) async throws -> SessionResponse
    func logout() async throws
    func me() async throws -> User
    func updateSettings(_ request: UpdateSettingsRequest) async throws -> User

    func summary(month: String?) async throws -> Summary
    func transactions(_ query: TransactionQuery) async throws -> TransactionsResponse
    func transaction(id: String) async throws -> Transaction
    func updateTransaction(id: String, _ request: UpdateTransactionRequest) async throws -> Transaction
    func createTransaction(_ request: CreateTransactionRequest) async throws -> Transaction
    func deleteTransaction(id: String) async throws

    func categories() async throws -> [Category]
    func createCategory(name: String) async throws -> Category
    func updateCategory(id: String, _ request: UpdateCategoryRequest) async throws -> Category
    func deleteCategory(id: String) async throws

    func accounts() async throws -> [Account]
    func createAccount(_ request: CreateAccountRequest) async throws -> Account
    func updateAccount(id: String, _ request: UpdateAccountRequest) async throws -> Account
    func deleteAccount(id: String) async throws

    func failedAlerts() async throws -> [RawAlert]
    func rates(day: String?) async throws -> [FxRate]
    func refreshRates() async throws -> [FxRate]

    func importPreview(_ request: ImportPreviewRequest) async throws -> ImportPreviewResponse
    func importCommit(_ request: ImportCommitRequest) async throws -> ImportCommitResponse

    // Intake relay (needs the intake secret, not a session token)
    func intakeEmail(_ request: IntakeEmailRequest, secret: String) async throws -> RawAlert
}

public extension WebSpendAPI {
    func summary() async throws -> Summary { try await summary(month: nil) }
    func rates() async throws -> [FxRate] { try await rates(day: nil) }
}
