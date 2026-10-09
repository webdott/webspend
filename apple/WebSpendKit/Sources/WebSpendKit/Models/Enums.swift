import Foundation

// Mirrors `shared/src/api.ts`. Every shape here matches the contract field for field.

public enum Currency: String, Codable, CaseIterable, Sendable, Hashable {
    case ngn = "NGN"
    case usd = "USD"
    case gbp = "GBP"
    case eur = "EUR"

    public static let all: [Currency] = [.ngn, .usd, .gbp, .eur]

    public var symbol: String {
        switch self {
        case .ngn: "₦"
        case .usd: "$"
        case .gbp: "£"
        case .eur: "€"
        }
    }

    public var displayName: String {
        switch self {
        case .ngn: "Nigerian naira"
        case .usd: "US dollar"
        case .gbp: "British pound"
        case .eur: "Euro"
        }
    }
}

public enum Bank: String, Codable, CaseIterable, Sendable, Hashable {
    case grey, opay, moniepoint, gtbank, uba, cash, other

    public static let tracked: [Bank] = [.grey, .opay, .moniepoint, .gtbank, .uba]

    public var label: String {
        switch self {
        case .grey: "Grey"
        case .opay: "OPay"
        case .moniepoint: "Moniepoint"
        case .gtbank: "GTBank"
        case .uba: "UBA"
        case .cash: "Cash"
        case .other: "Other"
        }
    }

    public var isTracked: Bool { Bank.tracked.contains(self) }
}

public enum TransactionType: String, Codable, CaseIterable, Sendable, Hashable {
    case expense, income, transfer
}

public enum TransactionSource: String, Codable, CaseIterable, Sendable, Hashable {
    case alert, `import`, manual

    public var phrase: String {
        switch self {
        case .alert: "from email alert"
        case .import: "imported"
        case .manual: "entered by hand"
        }
    }
}

public enum Theme: String, Codable, CaseIterable, Sendable, Hashable {
    case auto, light, dark
}

public enum AccountStatus: String, Codable, CaseIterable, Sendable, Hashable {
    case off
    case waiting
    case tracking
}

public enum GapStatus: String, Codable, CaseIterable, Sendable, Hashable {
    case open, filled, dismissed
}

public enum RawAlertStatus: String, Codable, CaseIterable, Sendable, Hashable {
    case parsed
    case unknownSender = "unknown_sender"
    case notATransaction = "not_a_transaction"
    case unrecognisedLayout = "unrecognised_layout"
    case beforeTrackingFrom = "before_tracking_from"
    case failedAuthentication = "failed_authentication"
    case duplicate
}

public enum ImportFormat: String, Codable, CaseIterable, Sendable, Hashable {
    case csv, json
}

public enum ImportField: String, Codable, CaseIterable, Sendable, Hashable {
    case date, amount, debit, credit, description, counterparty, reference, balance, ignore

    public static let all: [ImportField] = [
        .date, .amount, .debit, .credit, .description, .counterparty, .reference, .balance, .ignore,
    ]

    public var label: String {
        switch self {
        case .date: "Date"
        case .amount: "Amount"
        case .debit: "Debit"
        case .credit: "Credit"
        case .description: "Description"
        case .counterparty: "Counterparty"
        case .reference: "Reference"
        case .balance: "Balance"
        case .ignore: "Ignore"
        }
    }
}

public enum DateOrder: String, Codable, CaseIterable, Sendable, Hashable {
    case dmy, mdy, ymd

    public var label: String {
        switch self {
        case .dmy: "Day / Month / Year"
        case .mdy: "Month / Day / Year"
        case .ymd: "Year / Month / Day"
        }
    }
}
