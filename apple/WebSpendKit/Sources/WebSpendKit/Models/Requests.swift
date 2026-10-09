import Foundation

public struct DevSignInRequest: Codable, Sendable, Hashable {
    public var email: String
    public init(email: String) { self.email = email }
}

public struct SessionResponse: Codable, Sendable, Hashable {
    public var token: String
    public var user: User
    public init(token: String, user: User) {
        self.token = token
        self.user = user
    }
}

public struct MeResponse: Codable, Sendable, Hashable {
    public var user: User
    public init(user: User) { self.user = user }
}

/// Distinguishes "leave the field alone" (`nil`) from "set it to null" (`.some(nil)`) in PATCH bodies.
private func encodeNullable<T: Encodable, K: CodingKey>(_ value: T??, forKey key: K, into container: inout KeyedEncodingContainer<K>) throws {
    guard let value else { return }
    if let inner = value {
        try container.encode(inner, forKey: key)
    } else {
        try container.encodeNil(forKey: key)
    }
}

private func decodeNullable<T: Decodable, K: CodingKey>(_ type: T.Type, forKey key: K, from container: KeyedDecodingContainer<K>) throws -> T?? {
    guard container.contains(key) else { return nil }
    if try container.decodeNil(forKey: key) { return .some(nil) }
    return .some(try container.decode(T.self, forKey: key))
}

public struct UpdateSettingsRequest: Codable, Sendable, Hashable {
    public var defaultCurrency: Currency?
    public var showUsdEquivalent: Bool?
    public var theme: Theme?
    public var monthlyBudgetMinor: Int??

    public init(defaultCurrency: Currency? = nil, showUsdEquivalent: Bool? = nil, theme: Theme? = nil, monthlyBudgetMinor: Int?? = nil) {
        self.defaultCurrency = defaultCurrency
        self.showUsdEquivalent = showUsdEquivalent
        self.theme = theme
        self.monthlyBudgetMinor = monthlyBudgetMinor
    }

    enum CodingKeys: String, CodingKey { case defaultCurrency, showUsdEquivalent, theme, monthlyBudgetMinor }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(defaultCurrency, forKey: .defaultCurrency)
        try c.encodeIfPresent(showUsdEquivalent, forKey: .showUsdEquivalent)
        try c.encodeIfPresent(theme, forKey: .theme)
        try encodeNullable(monthlyBudgetMinor, forKey: .monthlyBudgetMinor, into: &c)
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        defaultCurrency = try c.decodeIfPresent(Currency.self, forKey: .defaultCurrency)
        showUsdEquivalent = try c.decodeIfPresent(Bool.self, forKey: .showUsdEquivalent)
        theme = try c.decodeIfPresent(Theme.self, forKey: .theme)
        monthlyBudgetMinor = try decodeNullable(Int.self, forKey: .monthlyBudgetMinor, from: c)
    }
}

public struct UpdateSettingsResponse: Codable, Sendable, Hashable {
    public var user: User
    public init(user: User) { self.user = user }
}

public typealias SummaryResponse = Summary

public struct TransactionQuery: Sendable, Hashable {
    public var month: String?
    public var q: String?
    public var categoryId: String?
    public var accountId: String?
    public var type: TransactionType?
    public var limit: Int?
    public var before: String?
    public var unsure: Bool

    public init(month: String? = nil, q: String? = nil, categoryId: String? = nil, accountId: String? = nil, type: TransactionType? = nil, limit: Int? = nil, before: String? = nil, unsure: Bool = false) {
        self.month = month
        self.q = q
        self.categoryId = categoryId
        self.accountId = accountId
        self.type = type
        self.limit = limit
        self.before = before
        self.unsure = unsure
    }

    public static let uncategorised = "none"

    public var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = []
        if let month { items.append(.init(name: "month", value: month)) }
        if let q, !q.isEmpty { items.append(.init(name: "q", value: q)) }
        if let categoryId { items.append(.init(name: "categoryId", value: categoryId)) }
        if let accountId { items.append(.init(name: "accountId", value: accountId)) }
        if let type { items.append(.init(name: "type", value: type.rawValue)) }
        if let limit { items.append(.init(name: "limit", value: String(limit))) }
        if let before { items.append(.init(name: "before", value: before)) }
        if unsure { items.append(.init(name: "unsure", value: "true")) }
        return items
    }
}

public struct TransactionsResponse: Codable, Sendable, Hashable {
    public var transactions: [Transaction]
    public var hasMore: Bool
    public init(transactions: [Transaction], hasMore: Bool) {
        self.transactions = transactions
        self.hasMore = hasMore
    }
}

public struct TransactionResponse: Codable, Sendable, Hashable {
    public var transaction: Transaction
    public init(transaction: Transaction) { self.transaction = transaction }
}

public struct UpdateTransactionRequest: Codable, Sendable, Hashable {
    public var categoryId: String??
    public var rememberForPayee: Bool?
    public var userDescription: String??
    public var type: TransactionType?
    /// The headline. `.some(nil)` goes back to the fallback title.
    public var title: String??
    public var occurredAt: String?
    public var amountMinor: Int?
    public var counterpartyName: String??

    public init(categoryId: String?? = nil, rememberForPayee: Bool? = nil, userDescription: String?? = nil, type: TransactionType? = nil, title: String?? = nil, occurredAt: String? = nil, amountMinor: Int? = nil, counterpartyName: String?? = nil) {
        self.categoryId = categoryId
        self.rememberForPayee = rememberForPayee
        self.userDescription = userDescription
        self.type = type
        self.title = title
        self.occurredAt = occurredAt
        self.amountMinor = amountMinor
        self.counterpartyName = counterpartyName
    }

    public var isEmpty: Bool { self == UpdateTransactionRequest() }

    enum CodingKeys: String, CodingKey { case categoryId, rememberForPayee, userDescription, type, title, occurredAt, amountMinor, counterpartyName }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try encodeNullable(categoryId, forKey: .categoryId, into: &c)
        try c.encodeIfPresent(rememberForPayee, forKey: .rememberForPayee)
        try encodeNullable(userDescription, forKey: .userDescription, into: &c)
        try c.encodeIfPresent(type, forKey: .type)
        try encodeNullable(title, forKey: .title, into: &c)
        try c.encodeIfPresent(occurredAt, forKey: .occurredAt)
        try c.encodeIfPresent(amountMinor, forKey: .amountMinor)
        try encodeNullable(counterpartyName, forKey: .counterpartyName, into: &c)
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        categoryId = try decodeNullable(String.self, forKey: .categoryId, from: c)
        rememberForPayee = try c.decodeIfPresent(Bool.self, forKey: .rememberForPayee)
        userDescription = try decodeNullable(String.self, forKey: .userDescription, from: c)
        type = try c.decodeIfPresent(TransactionType.self, forKey: .type)
        title = try decodeNullable(String.self, forKey: .title, from: c)
        occurredAt = try c.decodeIfPresent(String.self, forKey: .occurredAt)
        amountMinor = try c.decodeIfPresent(Int.self, forKey: .amountMinor)
        counterpartyName = try decodeNullable(String.self, forKey: .counterpartyName, from: c)
    }
}

public typealias UpdateTransactionResponse = TransactionResponse

public struct CreateTransactionRequest: Codable, Sendable, Hashable {
    public var accountId: String
    public var occurredAt: String
    public var type: TransactionType
    public var amountMinor: Int
    public var currency: Currency
    public var userDescription: String
    public var categoryId: String?
    public var counterpartyName: String?

    public init(accountId: String, occurredAt: String, type: TransactionType, amountMinor: Int, currency: Currency, userDescription: String, categoryId: String? = nil, counterpartyName: String? = nil) {
        self.accountId = accountId
        self.occurredAt = occurredAt
        self.type = type
        self.amountMinor = amountMinor
        self.currency = currency
        self.userDescription = userDescription
        self.categoryId = categoryId
        self.counterpartyName = counterpartyName
    }
}

public typealias CreateTransactionResponse = TransactionResponse

public struct CategoriesResponse: Codable, Sendable, Hashable {
    public var categories: [Category]
    public init(categories: [Category]) { self.categories = categories }
}

public struct CreateCategoryRequest: Codable, Sendable, Hashable {
    public var name: String
    public init(name: String) { self.name = name }
}

public struct UpdateCategoryRequest: Codable, Sendable, Hashable {
    public var name: String?
    public var sortOrder: Int?
    public init(name: String? = nil, sortOrder: Int? = nil) {
        self.name = name
        self.sortOrder = sortOrder
    }
}

public struct CategoryResponse: Codable, Sendable, Hashable {
    public var category: Category
    public init(category: Category) { self.category = category }
}

public struct AccountsResponse: Codable, Sendable, Hashable {
    public var accounts: [Account]
    public init(accounts: [Account]) { self.accounts = accounts }
}

public struct CreateAccountRequest: Codable, Sendable, Hashable {
    public var bank: Bank
    public var name: String
    public var accountNumber: String?
    public var currency: Currency?
    public var isOwn: Bool?

    public init(bank: Bank, name: String, accountNumber: String? = nil, currency: Currency? = nil, isOwn: Bool? = nil) {
        self.bank = bank
        self.name = name
        self.accountNumber = accountNumber
        self.currency = currency
        self.isOwn = isOwn
    }
}

public struct UpdateAccountRequest: Codable, Sendable, Hashable {
    public var name: String?
    public var accountNumber: String??
    public var isOwn: Bool?
    public var tracked: Bool?

    public init(name: String? = nil, accountNumber: String?? = nil, isOwn: Bool? = nil, tracked: Bool? = nil) {
        self.name = name
        self.accountNumber = accountNumber
        self.isOwn = isOwn
        self.tracked = tracked
    }

    enum CodingKeys: String, CodingKey { case name, accountNumber, isOwn, tracked }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(name, forKey: .name)
        try encodeNullable(accountNumber, forKey: .accountNumber, into: &c)
        try c.encodeIfPresent(isOwn, forKey: .isOwn)
        try c.encodeIfPresent(tracked, forKey: .tracked)
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        accountNumber = try decodeNullable(String.self, forKey: .accountNumber, from: c)
        isOwn = try c.decodeIfPresent(Bool.self, forKey: .isOwn)
        tracked = try c.decodeIfPresent(Bool.self, forKey: .tracked)
    }
}

public struct AccountResponse: Codable, Sendable, Hashable {
    public var account: Account
    public init(account: Account) { self.account = account }
}

public struct AlertsResponse: Codable, Sendable, Hashable {
    public var alerts: [RawAlert]
    public init(alerts: [RawAlert]) { self.alerts = alerts }
}

public struct RatesResponse: Codable, Sendable, Hashable {
    public var rates: [FxRate]
    public init(rates: [FxRate]) { self.rates = rates }
}

public struct ImportMapping: Codable, Sendable, Hashable {
    public var columns: [String: ImportField]
    public var dateOrder: DateOrder
    public var negativeIsExpense: Bool

    public init(columns: [String: ImportField], dateOrder: DateOrder, negativeIsExpense: Bool) {
        self.columns = columns
        self.dateOrder = dateOrder
        self.negativeIsExpense = negativeIsExpense
    }
}

public struct ImportPreviewRequest: Codable, Sendable, Hashable {
    /// Send as `accountId` for a file that belongs to no particular account; the server files it
    /// under a catch-all account named "Unassigned".
    public static let noAccount = "none"

    public var accountId: String
    public var format: ImportFormat
    public var content: String
    public init(accountId: String, format: ImportFormat, content: String) {
        self.accountId = accountId
        self.format = format
        self.content = content
    }
}

public struct ImportPreviewResponse: Codable, Sendable, Hashable {
    public var columns: [String]
    public var sampleRows: [[String: String]]
    public var rowCount: Int
    public var suggestedMapping: ImportMapping
    public var dateAmbiguous: Bool

    public init(columns: [String], sampleRows: [[String: String]], rowCount: Int, suggestedMapping: ImportMapping, dateAmbiguous: Bool) {
        self.columns = columns
        self.sampleRows = sampleRows
        self.rowCount = rowCount
        self.suggestedMapping = suggestedMapping
        self.dateAmbiguous = dateAmbiguous
    }
}

public struct ImportCommitRequest: Codable, Sendable, Hashable {
    public var accountId: String
    public var format: ImportFormat
    public var content: String
    public var mapping: ImportMapping

    public init(accountId: String, format: ImportFormat, content: String, mapping: ImportMapping) {
        self.accountId = accountId
        self.format = format
        self.content = content
        self.mapping = mapping
    }
}

public struct ImportRowError: Codable, Sendable, Hashable, Identifiable {
    public var row: Int
    public var reason: String
    public init(row: Int, reason: String) {
        self.row = row
        self.reason = reason
    }
    public var id: Int { row }
}

public struct ImportCommitResponse: Codable, Sendable, Hashable {
    public var importId: String
    public var added: Int
    public var skipped: Int
    public var errors: [ImportRowError]
    /// Categories this import added to the user's list.
    public var categoriesCreated: Int?
    /// Transactions already logged that this import gave a category.
    public var categorised: Int?
    public init(importId: String, added: Int, skipped: Int, errors: [ImportRowError], categoriesCreated: Int? = nil, categorised: Int? = nil) {
        self.importId = importId
        self.added = added
        self.skipped = skipped
        self.errors = errors
        self.categoriesCreated = categoriesCreated
        self.categorised = categorised
    }
}

public struct IntakeEmailRequest: Codable, Sendable, Hashable {
    public var userEmail: String
    public var messageId: String
    public var from: String
    public var subject: String
    public var text: String
    public var receivedAt: String
    public var authenticated: Bool

    public init(userEmail: String, messageId: String, from: String, subject: String, text: String, receivedAt: String, authenticated: Bool) {
        self.userEmail = userEmail
        self.messageId = messageId
        self.from = from
        self.subject = subject
        self.text = text
        self.receivedAt = receivedAt
        self.authenticated = authenticated
    }
}

public struct IntakeEmailResponse: Codable, Sendable, Hashable {
    public var alert: RawAlert
    public init(alert: RawAlert) { self.alert = alert }
}

// MARK: Export

public enum ExportFormat: String, Codable, CaseIterable, Sendable, Hashable, Identifiable {
    case csv, pdf

    public var id: String { rawValue }
    public var label: String { rawValue.uppercased() }
    public var contentType: String {
        switch self {
        case .csv: "text/csv"
        case .pdf: "application/pdf"
        }
    }
}

/// `GET /api/exports`. Days are `YYYY-MM-DD`, both inclusive; the server fills in a missing end
/// with today and a missing start with the first of that month.
public struct ExportQuery: Sendable, Hashable {
    public var format: ExportFormat
    public var from: String?
    public var to: String?
    public var accountId: String?
    public var categoryId: String?
    public var type: TransactionType?

    public init(format: ExportFormat, from: String? = nil, to: String? = nil, accountId: String? = nil, categoryId: String? = nil, type: TransactionType? = nil) {
        self.format = format
        self.from = from
        self.to = to
        self.accountId = accountId
        self.categoryId = categoryId
        self.type = type
    }

    public var queryItems: [URLQueryItem] {
        var items = [URLQueryItem(name: "format", value: format.rawValue)]
        if let from { items.append(URLQueryItem(name: "from", value: from)) }
        if let to { items.append(URLQueryItem(name: "to", value: to)) }
        if let accountId { items.append(URLQueryItem(name: "accountId", value: accountId)) }
        if let categoryId { items.append(URLQueryItem(name: "categoryId", value: categoryId)) }
        if let type { items.append(URLQueryItem(name: "type", value: type.rawValue)) }
        return items
    }

    /// The name the server gives the file for this range.
    public func filename(from: String, to: String) -> String {
        "webspend-\(from)-to-\(to).\(format.rawValue)"
    }
}

/// A file the server built, ready to save or share.
public struct ExportedFile: Sendable, Hashable {
    public var filename: String
    public var contentType: String
    public var data: Data

    public init(filename: String, contentType: String, data: Data) {
        self.filename = filename
        self.contentType = contentType
        self.data = data
    }
}
