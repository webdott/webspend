import Foundation

public struct User: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var email: String
    public var defaultCurrency: Currency
    public var showUsdEquivalent: Bool
    public var theme: Theme
    public var monthlyBudgetMinor: Int?

    public init(id: String, email: String, defaultCurrency: Currency, showUsdEquivalent: Bool, theme: Theme, monthlyBudgetMinor: Int?) {
        self.id = id
        self.email = email
        self.defaultCurrency = defaultCurrency
        self.showUsdEquivalent = showUsdEquivalent
        self.theme = theme
        self.monthlyBudgetMinor = monthlyBudgetMinor
    }

    public var showsUsdLine: Bool { defaultCurrency != .usd && showUsdEquivalent }
}

public struct Account: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var bank: Bank
    public var name: String
    public var accountNumber: String?
    public var currency: Currency
    public var isOwn: Bool
    public var tracked: Bool
    public var trackingFrom: String?
    public var status: AccountStatus
    public var lastBalanceMinor: Int?
    public var lastBalanceAt: String?
    public var lastAlertAt: String?

    public init(id: String, bank: Bank, name: String, accountNumber: String?, currency: Currency, isOwn: Bool, tracked: Bool, trackingFrom: String?, status: AccountStatus, lastBalanceMinor: Int?, lastBalanceAt: String?, lastAlertAt: String?) {
        self.id = id
        self.bank = bank
        self.name = name
        self.accountNumber = accountNumber
        self.currency = currency
        self.isOwn = isOwn
        self.tracked = tracked
        self.trackingFrom = trackingFrom
        self.status = status
        self.lastBalanceMinor = lastBalanceMinor
        self.lastBalanceAt = lastBalanceAt
        self.lastAlertAt = lastAlertAt
    }
}

public struct Category: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var name: String
    public var sortOrder: Int

    public init(id: String, name: String, sortOrder: Int) {
        self.id = id
        self.name = name
        self.sortOrder = sortOrder
    }
}

public struct Transaction: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var occurredAt: String
    public var type: TransactionType
    public var amountMinor: Int
    public var currency: Currency
    public var defaultMinor: Int?
    public var defaultCurrency: Currency
    public var usdMinor: Int?
    public var fxPerUsd: Double?
    public var accountId: String
    public var accountName: String
    public var bank: Bank
    public var title: String
    public var counterpartyName: String?
    public var counterpartyBank: String?
    public var counterpartyAccount: String?
    public var bankDescription: String?
    public var userDescription: String?
    public var categoryId: String?
    public var categoryName: String?
    public var source: TransactionSource
    public var bankReference: String?
    public var transferGroupId: String?
    public var isFee: Bool
    public var createdAt: String

    public init(id: String, occurredAt: String, type: TransactionType, amountMinor: Int, currency: Currency, defaultMinor: Int?, defaultCurrency: Currency, usdMinor: Int?, fxPerUsd: Double?, accountId: String, accountName: String, bank: Bank, title: String, counterpartyName: String?, counterpartyBank: String?, counterpartyAccount: String?, bankDescription: String?, userDescription: String?, categoryId: String?, categoryName: String?, source: TransactionSource, bankReference: String?, transferGroupId: String?, isFee: Bool, createdAt: String) {
        self.id = id
        self.occurredAt = occurredAt
        self.type = type
        self.amountMinor = amountMinor
        self.currency = currency
        self.defaultMinor = defaultMinor
        self.defaultCurrency = defaultCurrency
        self.usdMinor = usdMinor
        self.fxPerUsd = fxPerUsd
        self.accountId = accountId
        self.accountName = accountName
        self.bank = bank
        self.title = title
        self.counterpartyName = counterpartyName
        self.counterpartyBank = counterpartyBank
        self.counterpartyAccount = counterpartyAccount
        self.bankDescription = bankDescription
        self.userDescription = userDescription
        self.categoryId = categoryId
        self.categoryName = categoryName
        self.source = source
        self.bankReference = bankReference
        self.transferGroupId = transferGroupId
        self.isFee = isFee
        self.createdAt = createdAt
    }

    public var occurredDate: Date? { ISO8601.parse(occurredAt) }
    public var needsCategory: Bool { type == .expense && categoryId == nil }
}

public struct CategoryTotal: Codable, Sendable, Hashable, Identifiable {
    public var categoryId: String?
    public var name: String
    public var minor: Int
    public var usdMinor: Int?
    public var count: Int

    public init(categoryId: String?, name: String, minor: Int, usdMinor: Int?, count: Int) {
        self.categoryId = categoryId
        self.name = name
        self.minor = minor
        self.usdMinor = usdMinor
        self.count = count
    }

    public var id: String { categoryId ?? "none" }
}

public struct Summary: Codable, Sendable, Hashable {
    public var month: String
    public var currency: Currency
    public var budgetMinor: Int?
    public var spentMinor: Int
    public var incomeMinor: Int
    public var leftMinor: Int?
    public var spentUsdMinor: Int?
    public var incomeUsdMinor: Int?
    public var leftUsdMinor: Int?
    public var todayPerUsd: Double?
    public var byCategory: [CategoryTotal]
    public var uncategorisedCount: Int
    public var openGapCount: Int
    public var lastAlertAt: String?
    public var trackedBanks: [Bank]

    public init(month: String, currency: Currency, budgetMinor: Int?, spentMinor: Int, incomeMinor: Int, leftMinor: Int?, spentUsdMinor: Int?, incomeUsdMinor: Int?, leftUsdMinor: Int?, todayPerUsd: Double?, byCategory: [CategoryTotal], uncategorisedCount: Int, openGapCount: Int, lastAlertAt: String?, trackedBanks: [Bank]) {
        self.month = month
        self.currency = currency
        self.budgetMinor = budgetMinor
        self.spentMinor = spentMinor
        self.incomeMinor = incomeMinor
        self.leftMinor = leftMinor
        self.spentUsdMinor = spentUsdMinor
        self.incomeUsdMinor = incomeUsdMinor
        self.leftUsdMinor = leftUsdMinor
        self.todayPerUsd = todayPerUsd
        self.byCategory = byCategory
        self.uncategorisedCount = uncategorisedCount
        self.openGapCount = openGapCount
        self.lastAlertAt = lastAlertAt
        self.trackedBanks = trackedBanks
    }

    public var spentFraction: Double? {
        guard let budgetMinor, budgetMinor > 0 else { return nil }
        return min(1, max(0, Double(spentMinor) / Double(budgetMinor)))
    }
}

public struct Gap: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var accountId: String
    public var accountName: String
    public var bank: Bank
    public var fromAt: String
    public var toAt: String
    public var expectedBalanceMinor: Int
    public var actualBalanceMinor: Int
    public var differenceMinor: Int
    public var currency: Currency
    public var status: GapStatus
    public var createdAt: String

    public init(id: String, accountId: String, accountName: String, bank: Bank, fromAt: String, toAt: String, expectedBalanceMinor: Int, actualBalanceMinor: Int, differenceMinor: Int, currency: Currency, status: GapStatus, createdAt: String) {
        self.id = id
        self.accountId = accountId
        self.accountName = accountName
        self.bank = bank
        self.fromAt = fromAt
        self.toAt = toAt
        self.expectedBalanceMinor = expectedBalanceMinor
        self.actualBalanceMinor = actualBalanceMinor
        self.differenceMinor = differenceMinor
        self.currency = currency
        self.status = status
        self.createdAt = createdAt
    }
}

public struct RawAlert: Codable, Sendable, Hashable, Identifiable {
    public var id: String
    public var receivedAt: String
    public var sender: String
    public var subject: String
    public var status: RawAlertStatus
    public var detail: String?
    public var transactionId: String?

    public init(id: String, receivedAt: String, sender: String, subject: String, status: RawAlertStatus, detail: String?, transactionId: String?) {
        self.id = id
        self.receivedAt = receivedAt
        self.sender = sender
        self.subject = subject
        self.status = status
        self.detail = detail
        self.transactionId = transactionId
    }
}

public struct FxRate: Codable, Sendable, Hashable, Identifiable {
    public var day: String
    public var currency: Currency
    public var perUsd: Double
    public var source: String

    public init(day: String, currency: Currency, perUsd: Double, source: String) {
        self.day = day
        self.currency = currency
        self.perUsd = perUsd
        self.source = source
    }

    public var id: String { "\(day)-\(currency.rawValue)" }
}

public struct Meta: Codable, Sendable, Hashable {
    public var version: String
    public var googleAuth: Bool
    public var devAuth: Bool

    public init(version: String, googleAuth: Bool, devAuth: Bool) {
        self.version = version
        self.googleAuth = googleAuth
        self.devAuth = devAuth
    }
}

public struct ApiError: Codable, Sendable, Hashable, Error {
    public struct Body: Codable, Sendable, Hashable {
        public var code: String
        public var message: String
        public init(code: String, message: String) {
            self.code = code
            self.message = message
        }
    }

    public var error: Body
    public init(error: Body) { self.error = error }
}

public enum ISO8601 {
    public static func parse(_ string: String) -> Date? {
        if let date = try? Date(string, strategy: .iso8601) { return date }
        if let date = try? Date(string, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true).timeZone(separator: .colon)) { return date }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }

    public static func string(_ date: Date) -> String {
        date.formatted(.iso8601)
    }
}
