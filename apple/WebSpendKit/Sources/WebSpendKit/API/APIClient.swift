import Foundation

public enum APIClientError: Error, LocalizedError, Sendable {
    case api(code: String, message: String, status: Int)
    case http(status: Int)
    case unauthorized
    case invalidURL
    case transport(String)
    case decoding(String)

    public var errorDescription: String? {
        switch self {
        case let .api(_, message, _): message
        case let .http(status): "The server answered with status \(status)."
        case .unauthorized: "Your session has expired. Sign in again."
        case .invalidURL: "The server address is not a valid URL."
        case let .transport(message): message
        case let .decoding(message): "Could not read the server's reply: \(message)"
        }
    }

    public var isUnauthorized: Bool {
        if case .unauthorized = self { return true }
        if case let .api(_, _, status) = self, status == 401 { return true }
        return false
    }
}

public actor APIClient: WebSpendAPI {
    public let baseURL: URL
    private var token: String?
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(baseURL: URL, token: String? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
    }

    public func setToken(_ token: String?) { self.token = token }
    public var currentToken: String? { token }

    // MARK: Meta and sign-in

    public func meta() async throws -> Meta {
        try await get("/api/meta")
    }

    public func devSignIn(email: String) async throws -> SessionResponse {
        let response: SessionResponse = try await send("POST", "/auth/dev", body: DevSignInRequest(email: email))
        token = response.token
        return response
    }

    public func logout() async throws {
        try await sendIgnoringBody("POST", "/auth/logout")
        token = nil
    }

    public func me() async throws -> User {
        let response: MeResponse = try await get("/api/me")
        return response.user
    }

    public func updateSettings(_ request: UpdateSettingsRequest) async throws -> User {
        let response: UpdateSettingsResponse = try await send("PATCH", "/api/settings", body: request)
        return response.user
    }

    // MARK: Summary and transactions

    public func summary(month: String?) async throws -> Summary {
        var items: [URLQueryItem] = []
        if let month { items.append(.init(name: "month", value: month)) }
        return try await get("/api/summary", query: items)
    }

    public func transactions(_ query: TransactionQuery) async throws -> TransactionsResponse {
        try await get("/api/transactions", query: query.queryItems)
    }

    public func transaction(id: String) async throws -> Transaction {
        let response: TransactionResponse = try await get("/api/transactions/\(encoded(id))")
        return response.transaction
    }

    public func updateTransaction(id: String, _ request: UpdateTransactionRequest) async throws -> Transaction {
        let response: UpdateTransactionResponse = try await send("PATCH", "/api/transactions/\(encoded(id))", body: request)
        return response.transaction
    }

    public func createTransaction(_ request: CreateTransactionRequest) async throws -> Transaction {
        let response: CreateTransactionResponse = try await send("POST", "/api/transactions", body: request)
        return response.transaction
    }

    public func deleteTransaction(id: String) async throws {
        try await sendIgnoringBody("DELETE", "/api/transactions/\(encoded(id))")
    }

    // MARK: Categories

    public func categories() async throws -> [Category] {
        let response: CategoriesResponse = try await get("/api/categories")
        return response.categories
    }

    public func createCategory(name: String) async throws -> Category {
        let response: CategoryResponse = try await send("POST", "/api/categories", body: CreateCategoryRequest(name: name))
        return response.category
    }

    public func updateCategory(id: String, _ request: UpdateCategoryRequest) async throws -> Category {
        let response: CategoryResponse = try await send("PATCH", "/api/categories/\(encoded(id))", body: request)
        return response.category
    }

    public func deleteCategory(id: String) async throws {
        try await sendIgnoringBody("DELETE", "/api/categories/\(encoded(id))")
    }

    // MARK: Accounts

    public func accounts() async throws -> [Account] {
        let response: AccountsResponse = try await get("/api/accounts")
        return response.accounts
    }

    public func createAccount(_ request: CreateAccountRequest) async throws -> Account {
        let response: AccountResponse = try await send("POST", "/api/accounts", body: request)
        return response.account
    }

    public func updateAccount(id: String, _ request: UpdateAccountRequest) async throws -> Account {
        let response: AccountResponse = try await send("PATCH", "/api/accounts/\(encoded(id))", body: request)
        return response.account
    }

    public func deleteAccount(id: String) async throws {
        try await sendIgnoringBody("DELETE", "/api/accounts/\(encoded(id))")
    }

    // MARK: Alerts, rates

    public func failedAlerts() async throws -> [RawAlert] {
        let response: AlertsResponse = try await get("/api/alerts", query: [.init(name: "status", value: "failed")])
        return response.alerts
    }

    public func rates(day: String?) async throws -> [FxRate] {
        var items: [URLQueryItem] = []
        if let day { items.append(.init(name: "day", value: day)) }
        let response: RatesResponse = try await get("/api/rates", query: items)
        return response.rates
    }

    public func refreshRates() async throws -> [FxRate] {
        let response: RatesResponse = try await send("POST", "/api/rates/refresh")
        return response.rates
    }

    // MARK: Import

    public func importPreview(_ request: ImportPreviewRequest) async throws -> ImportPreviewResponse {
        try await send("POST", "/api/imports/preview", body: request)
    }

    public func importCommit(_ request: ImportCommitRequest) async throws -> ImportCommitResponse {
        try await send("POST", "/api/imports", body: request)
    }

    // MARK: Intake

    public func export(_ query: ExportQuery) async throws -> ExportedFile {
        let (data, response) = try await perform("GET", "/api/exports", query: query.queryItems, body: nil, headers: ["Accept": "*/*"])
        let disposition = response.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        let named = disposition.firstMatch(of: /filename="([^"]+)"/).map { String($0.1) }
        let today = ISO8601.string(Date()).prefix(10)
        let fallback = query.filename(from: query.from ?? "\(today.prefix(7))-01", to: query.to ?? String(today))
        return ExportedFile(
            filename: named ?? fallback,
            contentType: response.value(forHTTPHeaderField: "Content-Type") ?? query.format.contentType,
            data: data
        )
    }

    public func intakeEmail(_ request: IntakeEmailRequest, secret: String) async throws -> RawAlert {
        let response: IntakeEmailResponse = try await send("POST", "/api/intake/email", body: request, headers: ["X-Intake-Secret": secret])
        return response.alert
    }

    // MARK: Plumbing

    private func encoded(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await send("GET", path, query: query)
    }

    private func send<T: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = [], body: (any Encodable)? = nil, headers: [String: String] = [:]) async throws -> T {
        let (data, _) = try await perform(method, path, query: query, body: body, headers: headers)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIClientError.decoding(String(describing: error))
        }
    }

    private func sendIgnoringBody(_ method: String, _ path: String, body: (any Encodable)? = nil) async throws {
        _ = try await perform(method, path, query: [], body: body, headers: [:])
    }

    private func perform(_ method: String, _ path: String, query: [URLQueryItem], body: (any Encodable)?, headers: [String: String]) async throws -> (Data, HTTPURLResponse) {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIClientError.invalidURL
        }
        let basePath = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
        components.path = basePath + path
        components.queryItems = query.isEmpty ? nil : query
        guard let url = components.url else { throw APIClientError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIClientError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw APIClientError.transport("Not an HTTP response.") }
        if (200..<300).contains(http.statusCode) { return (data, http) }
        if let apiError = try? decoder.decode(ApiError.self, from: data) {
            if http.statusCode == 401 { throw APIClientError.unauthorized }
            throw APIClientError.api(code: apiError.error.code, message: apiError.error.message, status: http.statusCode)
        }
        if http.statusCode == 401 { throw APIClientError.unauthorized }
        throw APIClientError.http(status: http.statusCode)
    }
}

private struct AnyEncodable: Encodable {
    let value: any Encodable
    init(_ value: any Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
