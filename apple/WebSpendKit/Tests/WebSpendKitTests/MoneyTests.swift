import Testing
@testable import WebSpendKit

@Suite struct MoneyTests {
    @Test func formatsMinorUnits() {
        #expect(Money.formatMinor(1_850_000, .ngn) == "₦18,500.00")
        #expect(Money.formatMinor(5, .usd) == "$0.05")
        #expect(Money.formatMinor(-120_000_000, .ngn) == "−₦1,200,000.00")
        #expect(Money.formatMinor(0, .gbp) == "£0.00")
        #expect(Money.formatMinor(100_000, .eur) == "€1,000.00")
    }

    @Test func signsByType() {
        #expect(Money.formatSigned(4_380_000, .ngn, .expense) == "−₦43,800.00")
        #expect(Money.formatSigned(300_000_000, .ngn, .income) == "+₦3,000,000.00")
        #expect(Money.formatSigned(5_000_000, .ngn, .transfer) == "₦50,000.00")
    }

    @Test func approxAndRateLines() {
        #expect(Money.formatApprox(1233, .usd) == "≈ $12.33")
        #expect(Money.formatApprox(nil, .usd) == nil)
        #expect(Money.formatRate(1500, .ngn) == "$1 = ₦1,500.00")
    }

    @Test func convertsThroughDollars() {
        #expect(Money.toUsdMinor(1_850_000, perUsd: 1500) == 1233)
        #expect(Money.convertMinor(1_850_000, fromPerUsd: 1500, toPerUsd: 0.78) == 962)
    }

    @Test func parsesTypedAmounts() {
        #expect(Money.parseMinor("1,200,000") == 120_000_000)
        #expect(Money.parseMinor("18500.5") == 1_850_050)
        #expect(Money.parseMinor("₦2,413.00") == 241_300)
        #expect(Money.parseMinor("abc") == nil)
        #expect(Money.parseMinor("") == nil)
        #expect(Money.parseMinor("1.234") == nil)
        #expect(Money.parseMinor("-50") == -5000)
    }
}
