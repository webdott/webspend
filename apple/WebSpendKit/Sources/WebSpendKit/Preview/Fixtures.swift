import Foundation

/// Fixture data mirroring the approved mockups. Dates are relative to now so the day headings
/// ("Today", "Yesterday") read correctly in the demo.
public enum Fixtures {
    public static let rate: Double = 1500

    public static let user = User(
        id: "u_demo",
        email: "demo@webspend.app",
        defaultCurrency: .ngn,
        showUsdEquivalent: true,
        theme: .auto,
        monthlyBudgetMinor: 120_000_000
    )

    public static let meta = Meta(version: "0.1.0-demo", googleAuth: false, devAuth: true)

    public static let categories: [Category] = [
        Category(id: "c_rent", name: "Rent & housing", sortOrder: 0),
        Category(id: "c_food", name: "Food & groceries", sortOrder: 1),
        Category(id: "c_transport", name: "Transport", sortOrder: 2),
        Category(id: "c_subs", name: "Subscriptions", sortOrder: 3),
        Category(id: "c_data", name: "Data & airtime", sortOrder: 4),
        Category(id: "c_health", name: "Health", sortOrder: 5),
        Category(id: "c_eating", name: "Eating out", sortOrder: 6),
    ]

    public static var currentMonth: String {
        let components = Calendar.current.dateComponents([.year, .month], from: Date())
        return String(format: "%04d-%02d", components.year ?? 2026, components.month ?? 10)
    }

    public static func summary(month: String = currentMonth) -> Summary {
        Summary(
            month: month,
            currency: .ngn,
            budgetMinor: 120_000_000,
            spentMinor: 78_000_000,
            incomeMinor: 300_000_000,
            leftMinor: 42_000_000,
            spentUsdMinor: 52_000,
            incomeUsdMinor: 200_000,
            leftUsdMinor: 28_000,
            todayPerUsd: rate,
            byCategory: [
                CategoryTotal(categoryId: "c_rent", name: "Rent & housing", minor: 45_000_000, usdMinor: 30_000, count: 1),
                CategoryTotal(categoryId: "c_food", name: "Food & groceries", minor: 18_650_000, usdMinor: 12_433, count: 6),
                CategoryTotal(categoryId: "c_transport", name: "Transport", minor: 7_420_000, usdMinor: 4_947, count: 9),
                CategoryTotal(categoryId: "c_subs", name: "Subscriptions", minor: 4_130_000, usdMinor: 2_753, count: 3),
                CategoryTotal(categoryId: "c_data", name: "Data & airtime", minor: 2_800_000, usdMinor: 1_867, count: 4),
            ],
            uncategorisedCount: 2,
            lastAlertAt: iso(minutesAgo: 12),
            trackedBanks: [.grey, .opay, .moniepoint, .gtbank]
        )
    }

    public static let accounts: [Account] = [
        Account(id: "a_grey", bank: .grey, name: "Grey", accountNumber: nil, currency: .usd, isOwn: true, tracked: true, trackingFrom: iso(daysAgo: 30), status: .tracking, lastBalanceMinor: 412_500, lastBalanceAt: iso(daysAgo: 8), lastAlertAt: iso(daysAgo: 8)),
        Account(id: "a_opay", bank: .opay, name: "OPay wallet", accountNumber: "8012345678", currency: .ngn, isOwn: true, tracked: true, trackingFrom: iso(daysAgo: 30), status: .tracking, lastBalanceMinor: 6_244_000, lastBalanceAt: iso(hoursAgo: 1), lastAlertAt: iso(minutesAgo: 12)),
        Account(id: "a_moniepoint", bank: .moniepoint, name: "Moniepoint", accountNumber: "5067891234", currency: .ngn, isOwn: true, tracked: true, trackingFrom: iso(daysAgo: 30), status: .tracking, lastBalanceMinor: 18_920_000, lastBalanceAt: iso(daysAgo: 1), lastAlertAt: iso(daysAgo: 1)),
        Account(id: "a_gtbank", bank: .gtbank, name: "GTBank savings", accountNumber: "0123456789", currency: .ngn, isOwn: true, tracked: true, trackingFrom: iso(daysAgo: 30), status: .tracking, lastBalanceMinor: 143_200_000, lastBalanceAt: iso(hoursAgo: 2), lastAlertAt: iso(hoursAgo: 2)),
        Account(id: "a_uba", bank: .uba, name: "UBA", accountNumber: "2098765432", currency: .ngn, isOwn: true, tracked: true, trackingFrom: iso(daysAgo: 2), status: .waiting, lastBalanceMinor: nil, lastBalanceAt: nil, lastAlertAt: nil),
        Account(id: "a_kuda", bank: .other, name: "Kuda", accountNumber: "2001234567", currency: .ngn, isOwn: true, tracked: false, trackingFrom: nil, status: .off, lastBalanceMinor: nil, lastBalanceAt: nil, lastAlertAt: nil),
        Account(id: "a_cash", bank: .cash, name: "Cash", accountNumber: nil, currency: .ngn, isOwn: true, tracked: false, trackingFrom: nil, status: .off, lastBalanceMinor: nil, lastBalanceAt: nil, lastAlertAt: nil),
    ]

    public static let transactions: [Transaction] = [
        ngn("t_corner", at: iso(daysAgo: 0, hour: 9, minute: 12), type: .expense, minor: 1_850_000, account: "a_gtbank", name: "GTBank savings", bank: .gtbank, title: "Corner Mart", counterparty: "CORNER MART LAGOS", bankDescription: "POS purchase at CORNER MART LAGOS NG. Ref 000123456789", category: ("c_food", "Food & groceries"), reference: "000123456789"),
        ngn("t_paystack", at: iso(daysAgo: 0, hour: 8, minute: 40), type: .expense, minor: 4_380_000, account: "a_opay", name: "OPay wallet", bank: .opay, title: "Paystack payment", counterparty: "Paystack Payments Ltd", counterpartyBank: "Titan Trust Bank", bankDescription: "Transfer to PAYSTACK PAYMENTS LIMITED 9876543210 Titan Trust Bank", category: nil, reference: "OP2510090840"),
        ngn("t_ride", at: iso(daysAgo: 1, hour: 18, minute: 5), type: .expense, minor: 650_000, account: "a_moniepoint", name: "Moniepoint", bank: .moniepoint, title: "Ride to Ikeja", counterparty: "Bolt Operations", counterpartyBank: "Providus Bank", bankDescription: "Transfer to BOLT OPERATIONS NG 1234567890 Providus Bank", userDescription: "Ride to Ikeja", category: ("c_transport", "Transport"), reference: "MP2510081805"),
        ngn("t_airtime", at: iso(daysAgo: 1, hour: 12, minute: 30), type: .expense, minor: 200_000, account: "a_opay", name: "OPay wallet", bank: .opay, title: "Airtime top-up", counterparty: "MTN", bankDescription: "Airtime purchase MTN 0803***4567", userDescription: "Airtime top-up", category: ("c_data", "Data & airtime"), reference: "OP2510081230"),
        ngn("t_jumia", at: iso(daysAgo: 2, hour: 13, minute: 15), type: .expense, minor: 1_250_000, account: "a_opay", name: "OPay wallet", bank: .opay, title: "Jumia Food", counterparty: "JUMIA FOOD", bankDescription: "Payment to JUMIA FOOD NG", category: nil, reference: "OP2510071315"),
        ngn("t_hosting", at: iso(daysAgo: 3, hour: 9, minute: 0), type: .expense, minor: 2_413_000, account: "a_gtbank", name: "GTBank savings", bank: .gtbank, title: "Cloud hosting", counterparty: "HETZNER ONLINE GMBH", bankDescription: "Card payment HETZNER ONLINE GMBH EUR 14.50", userDescription: "Cloud hosting", category: ("c_subs", "Subscriptions"), reference: "GT2510060900"),
        ngn("t_fuel", at: iso(daysAgo: 3, hour: 17, minute: 40), type: .expense, minor: 2_500_000, account: "a_moniepoint", name: "Moniepoint", bank: .moniepoint, title: "Fuel station", counterparty: "TOTAL ENERGIES IKEJA", bankDescription: "POS purchase TOTAL ENERGIES IKEJA", userDescription: "Fuel station", category: ("c_transport", "Transport"), reference: "MP2510061740"),
        ngn("t_transfer_gt", at: iso(daysAgo: 7, hour: 10, minute: 2), type: .transfer, minor: 50_000_000, account: "a_gtbank", name: "GTBank savings", bank: .gtbank, title: "From Grey", counterparty: "Grey", bankDescription: "Transfer from GREY FINANCE", category: nil, reference: "GT2510021002", transferGroup: "tg_1"),
        ngn("t_rent", at: iso(daysAgo: 8, hour: 11, minute: 20), type: .expense, minor: 45_000_000, account: "a_gtbank", name: "GTBank savings", bank: .gtbank, title: "October rent", counterparty: "ADEYEMI O.", counterpartyBank: "Access Bank", bankDescription: "Transfer to ADEYEMI O. 0987654321 Access Bank — October rent", userDescription: "October rent", category: ("c_rent", "Rent & housing"), reference: "GT2510011120"),
        Transaction(id: "t_salary", occurredAt: iso(daysAgo: 8, hour: 9, minute: 0), type: .income, amountMinor: 200_000, currency: .usd, defaultMinor: 300_000_000, defaultCurrency: .ngn, usdMinor: 200_000, fxPerUsd: 1, accountId: "a_grey", accountName: "Grey", bank: .grey, title: "Acme Ltd", counterpartyName: "Acme Ltd", counterpartyBank: nil, counterpartyAccount: nil, bankDescription: "You received $2,000.00 from ACME LTD", userDescription: nil, categoryId: nil, categoryName: nil, source: .alert, bankReference: "GREY-88213", transferGroupId: nil, isFee: false, createdAt: iso(daysAgo: 8, hour: 9, minute: 1)),
    ]

    public static let rates: [FxRate] = [
        FxRate(day: today, currency: .ngn, perUsd: rate, source: "cbn"),
        FxRate(day: today, currency: .usd, perUsd: 1, source: "cbn"),
        FxRate(day: today, currency: .gbp, perUsd: 0.78, source: "cbn"),
        FxRate(day: today, currency: .eur, perUsd: 0.92, source: "cbn"),
    ]

    public static let failedAlerts: [RawAlert] = [
        RawAlert(id: "ra_1", receivedAt: iso(daysAgo: 1, hour: 7, minute: 3), sender: "alerts@uba.com", subject: "Transaction notification", status: .unrecognisedLayout, detail: "No amount found in the body.", transactionId: nil),
    ]

    public static let sampleCSV = """
    Date,Description,Debit,Credit,Balance,Reference
    03/04/2026,POS PURCHASE SHOPRITE,12500.00,,143200.00,GT0001
    04/04/2026,TRANSFER FROM GREY,,50000.00,193200.00,GT0002
    05/04/2026,AIRTIME MTN,2000.00,,191200.00,GT0003
    """

    // MARK: Helpers

    public static var today: String {
        let components = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", components.year ?? 2026, components.month ?? 10, components.day ?? 9)
    }

    static func iso(daysAgo: Int = 0, hour: Int? = nil, minute: Int? = nil) -> String {
        let calendar = Calendar.current
        var date = calendar.date(byAdding: .day, value: -daysAgo, to: Date()) ?? Date()
        if let hour, let minute {
            date = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: date) ?? date
        }
        return ISO8601.string(date)
    }

    static func iso(hoursAgo: Int) -> String {
        ISO8601.string(Calendar.current.date(byAdding: .hour, value: -hoursAgo, to: Date()) ?? Date())
    }

    static func iso(minutesAgo: Int) -> String {
        ISO8601.string(Calendar.current.date(byAdding: .minute, value: -minutesAgo, to: Date()) ?? Date())
    }

    private static func ngn(_ id: String, at: String, type: TransactionType, minor: Int, account: String, name: String, bank: Bank, title: String, counterparty: String?, counterpartyBank: String? = nil, bankDescription: String?, userDescription: String? = nil, category: (String, String)?, reference: String?, transferGroup: String? = nil, source: TransactionSource = .alert) -> Transaction {
        Transaction(
            id: id, occurredAt: at, type: type, amountMinor: minor, currency: .ngn, defaultMinor: minor, defaultCurrency: .ngn,
            usdMinor: Money.toUsdMinor(minor, perUsd: rate), fxPerUsd: rate, accountId: account, accountName: name, bank: bank,
            title: title, counterpartyName: counterparty, counterpartyBank: counterpartyBank, counterpartyAccount: nil,
            bankDescription: bankDescription, userDescription: userDescription, categoryId: category?.0, categoryName: category?.1,
            source: source, bankReference: reference, transferGroupId: transferGroup, isFee: false, createdAt: at
        )
    }
}
