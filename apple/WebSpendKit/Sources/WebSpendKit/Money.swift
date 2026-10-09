import Foundation

/// Formatting rules mirrored from `shared/src/money.ts`. Amounts are integers in minor units.
public enum Money {
    public static func formatMinor(_ minor: Int, _ currency: Currency) -> String {
        let abs = minor.magnitude
        let whole = abs / 100
        let fraction = String(abs % 100)
        let paddedFraction = fraction.count < 2 ? "0" + fraction : fraction
        return "\(minor < 0 ? "−" : "")\(currency.symbol)\(group(whole)).\(paddedFraction)"
    }

    public static func formatSigned(_ minor: Int, _ currency: Currency, _ type: TransactionType) -> String {
        let sign: String
        switch type {
        case .expense: sign = "−"
        case .income: sign = "+"
        case .transfer: sign = ""
        }
        return sign + formatMinor(Int(minor.magnitude), currency)
    }

    public static func formatApprox(_ minor: Int?, _ currency: Currency) -> String? {
        guard let minor else { return nil }
        return "≈ " + formatMinor(minor, currency)
    }

    public static func formatRate(_ perUsd: Double, _ currency: Currency) -> String {
        "$1 = " + formatMinor(Int((perUsd * 100).rounded(.toNearestOrAwayFromZero)), currency)
    }

    /// Converts between currencies through US dollars. `perUsd` values are units of each
    /// currency per one dollar. Rounds half away from zero.
    public static func convertMinor(_ minor: Int, fromPerUsd: Double, toPerUsd: Double) -> Int {
        let usd = Double(minor) / fromPerUsd
        return roundHalfAway(usd * toPerUsd)
    }

    public static func toUsdMinor(_ minor: Int, perUsd: Double) -> Int {
        roundHalfAway(Double(minor) / perUsd)
    }

    public static func parseMinor(_ input: String) -> Int? {
        let cleaned = input.filter { $0.isNumber && $0.isASCII || $0 == "." || $0 == "-" }
        if cleaned.isEmpty || cleaned == "-" { return nil }
        let negative = cleaned.hasPrefix("-")
        let unsigned = negative ? String(cleaned.dropFirst()) : cleaned
        if unsigned.contains("-") { return nil }
        let parts = unsigned.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2 else { return nil }
        let whole = parts.first.map(String.init) ?? ""
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        guard fraction.count <= 2 else { return nil }
        guard whole.allSatisfy(\.isNumber), fraction.allSatisfy(\.isNumber) else { return nil }
        let wholeValue = Int(whole.isEmpty ? "0" : whole) ?? 0
        let paddedFraction = fraction.padding(toLength: 2, withPad: "0", startingAt: 0)
        let minor = wholeValue * 100 + (Int(paddedFraction) ?? 0)
        return negative ? -minor : minor
    }

    private static func roundHalfAway(_ value: Double) -> Int {
        Int(value.rounded(.toNearestOrAwayFromZero))
    }

    private static func group(_ value: UInt) -> String {
        let digits = Array(String(value))
        var out: [Character] = []
        for (index, digit) in digits.enumerated() {
            let remaining = digits.count - index
            if index > 0, remaining % 3 == 0 { out.append(",") }
            out.append(digit)
        }
        return String(out)
    }
}
