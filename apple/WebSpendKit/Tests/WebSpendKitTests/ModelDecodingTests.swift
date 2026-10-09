import Foundation
import Testing
@testable import WebSpendKit

@Suite struct ModelDecodingTests {
    let decoder = JSONDecoder()
    let encoder = JSONEncoder()

    @Test func decodesTransactionShapedLikeTheContract() throws {
        let json = """
        {
          "transactions": [{
            "id": "t_1",
            "occurredAt": "2026-10-09T09:12:00+01:00",
            "type": "expense",
            "amountMinor": 1850000,
            "currency": "NGN",
            "defaultMinor": 1850000,
            "defaultCurrency": "NGN",
            "usdMinor": 1233,
            "fxPerUsd": 1500,
            "accountId": "a_gt",
            "accountName": "GTBank savings",
            "bank": "gtbank",
            "title": "Corner Mart",
            "counterpartyName": "CORNER MART LAGOS",
            "counterpartyBank": null,
            "counterpartyAccount": null,
            "bankDescription": "POS purchase at CORNER MART LAGOS NG",
            "userDescription": null,
            "categoryId": "c_food",
            "categoryName": "Food & groceries",
            "source": "alert",
            "bankReference": "000123456789",
            "transferGroupId": null,
            "isFee": false,
            "createdAt": "2026-10-09T09:12:30.123+01:00"
          }],
          "hasMore": false
        }
        """
        let response = try decoder.decode(TransactionsResponse.self, from: Data(json.utf8))
        let t = try #require(response.transactions.first)
        #expect(t.bank == .gtbank)
        #expect(t.type == .expense)
        #expect(t.usdMinor == 1233)
        #expect(t.fxPerUsd == 1500)
        #expect(t.counterpartyBank == nil)
        #expect(t.source == .alert)
        #expect(!t.needsCategory)
        #expect(response.hasMore == false)
        let date = try #require(t.occurredDate)
        #expect(Int(date.timeIntervalSince1970) == 1_791_533_520)
        #expect(ISO8601.parse(t.createdAt) != nil)
        #expect(ISO8601.parse("2026-10-09T08:12:00Z") != nil)
    }

    @Test func decodesSummaryAndNullableFields() throws {
        let json = """
        {
          "month": "2026-10", "currency": "NGN", "budgetMinor": 120000000, "spentMinor": 78000000,
          "incomeMinor": 300000000, "leftMinor": 42000000, "spentUsdMinor": 52000, "incomeUsdMinor": 200000,
          "leftUsdMinor": 28000, "todayPerUsd": 1500,
          "byCategory": [
            { "categoryId": "c_rent", "name": "Rent & housing", "minor": 45000000, "usdMinor": 30000, "count": 1 },
            { "categoryId": null, "name": "Needs a category", "minor": 5630000, "usdMinor": null, "count": 2 }
          ],
          "uncategorisedCount": 2, "openGapCount": 1, "lastAlertAt": null, "trackedBanks": ["grey", "opay"]
        }
        """
        let summary = try decoder.decode(Summary.self, from: Data(json.utf8))
        #expect(summary.leftMinor == 42_000_000)
        #expect(summary.byCategory.count == 2)
        #expect(summary.byCategory[1].categoryId == nil)
        #expect(summary.byCategory[1].usdMinor == nil)
        #expect(summary.trackedBanks == [.grey, .opay])
        #expect(summary.spentFraction == 0.65)
    }

    @Test func decodesAccountsGapsMetaAndErrors() throws {
        let account = try decoder.decode(Account.self, from: Data("""
        { "id": "a_1", "bank": "uba", "name": "UBA", "accountNumber": "2098765432", "currency": "NGN", "isOwn": true,
          "tracked": true, "trackingFrom": "2026-10-07T10:00:00+01:00", "status": "waiting",
          "lastBalanceMinor": null, "lastBalanceAt": null, "lastAlertAt": null }
        """.utf8))
        #expect(account.status == .waiting)
        #expect(account.lastBalanceMinor == nil)

        let gap = try decoder.decode(Gap.self, from: Data("""
        { "id": "g_1", "accountId": "a_1", "accountName": "Moniepoint", "bank": "moniepoint",
          "fromAt": "2026-10-04T08:00:00+01:00", "toAt": "2026-10-05T20:00:00+01:00",
          "expectedBalanceMinor": 20120000, "actualBalanceMinor": 18920000, "differenceMinor": -1200000,
          "currency": "NGN", "status": "open", "createdAt": "2026-10-05T20:01:00+01:00" }
        """.utf8))
        #expect(gap.status == .open)
        #expect(gap.differenceMinor == -1_200_000)

        let meta = try decoder.decode(Meta.self, from: Data(#"{ "version": "0.1.0", "googleAuth": true, "devAuth": false }"#.utf8))
        #expect(meta.googleAuth && !meta.devAuth)

        let error = try decoder.decode(ApiError.self, from: Data(#"{ "error": { "code": "not_found", "message": "No such transaction." } }"#.utf8))
        #expect(error.error.code == "not_found")

        let alert = try decoder.decode(RawAlert.self, from: Data(#"{ "id": "r", "receivedAt": "2026-10-08T07:03:00+01:00", "sender": "a@b.c", "subject": "s", "status": "unrecognised_layout", "detail": null, "transactionId": null }"#.utf8))
        #expect(alert.status == .unrecognisedLayout)
    }

    @Test func decodesImportShapes() throws {
        let preview = try decoder.decode(ImportPreviewResponse.self, from: Data("""
        { "columns": ["Date", "Amount"], "sampleRows": [{ "Date": "03/04/2026", "Amount": "-1200" }], "rowCount": 1,
          "suggestedMapping": { "columns": { "Date": "date", "Amount": "amount" }, "dateOrder": "dmy", "negativeIsExpense": true },
          "dateAmbiguous": true }
        """.utf8))
        #expect(preview.suggestedMapping.columns["Amount"] == .amount)
        #expect(preview.dateAmbiguous)

        let commit = try decoder.decode(ImportCommitResponse.self, from: Data(#"{ "importId": "i", "added": 3, "skipped": 1, "errors": [{ "row": 2, "reason": "bad date" }] }"#.utf8))
        #expect(commit.added == 3 && commit.errors.first?.row == 2)
    }

    @Test func patchBodiesDistinguishAbsentFromNull() throws {
        encoder.outputFormatting = [.sortedKeys]

        let clearCategory = UpdateTransactionRequest(categoryId: .some(nil), rememberForPayee: true)
        #expect(String(decoding: try encoder.encode(clearCategory), as: UTF8.self) == #"{"categoryId":null,"rememberForPayee":true}"#)

        let setCategory = UpdateTransactionRequest(categoryId: "c_food", type: .expense)
        #expect(String(decoding: try encoder.encode(setCategory), as: UTF8.self) == #"{"categoryId":"c_food","type":"expense"}"#)

        let untouched = UpdateTransactionRequest(userDescription: "Lunch")
        #expect(String(decoding: try encoder.encode(untouched), as: UTF8.self) == #"{"userDescription":"Lunch"}"#)

        let clearBudget = UpdateSettingsRequest(monthlyBudgetMinor: .some(nil))
        #expect(String(decoding: try encoder.encode(clearBudget), as: UTF8.self) == #"{"monthlyBudgetMinor":null}"#)

        let settings = UpdateSettingsRequest(defaultCurrency: .usd, showUsdEquivalent: false, theme: .dark, monthlyBudgetMinor: 5000)
        #expect(String(decoding: try encoder.encode(settings), as: UTF8.self) == #"{"defaultCurrency":"USD","monthlyBudgetMinor":5000,"showUsdEquivalent":false,"theme":"dark"}"#)

        let account = UpdateAccountRequest(accountNumber: .some(nil), tracked: true)
        #expect(String(decoding: try encoder.encode(account), as: UTF8.self) == #"{"accountNumber":null,"tracked":true}"#)

        let roundTrip = try decoder.decode(UpdateTransactionRequest.self, from: try encoder.encode(clearCategory))
        #expect(roundTrip.categoryId == .some(nil))
        #expect(roundTrip.userDescription == nil)
    }

    @Test func callbackTokenParsing() {
        #expect(SessionStorage.token(fromCallback: URL(string: "webspend://signed-in#token=abc.def")!) == "abc.def")
        #expect(SessionStorage.token(fromCallback: URL(string: "webspend://signed-in?token=xyz")!) == "xyz")
        #expect(SessionStorage.token(fromCallback: URL(string: "https://example.com/#token=xyz")!) == nil)
        #expect(SessionStorage.googleSignInURL(server: URL(string: "http://localhost:8787")!, client: "iphone")?.absoluteString == "http://localhost:8787/auth/google?client=iphone")
    }

    @Test func mockAPIServesFixtures() async throws {
        let api = MockAPI(latency: .zero)
        let summary = try await api.summary(month: nil)
        #expect(Money.formatMinor(summary.leftMinor ?? 0, summary.currency) == "₦420,000.00")
        #expect(Money.formatMinor(summary.spentMinor, summary.currency) == "₦780,000.00")
        #expect(Money.formatMinor(summary.incomeMinor, summary.currency) == "₦3,000,000.00")
        #expect(summary.byCategory.map(\.name) == ["Rent & housing", "Food & groceries", "Transport", "Subscriptions", "Data & airtime"])

        let page = try await api.transactions(TransactionQuery(q: "Corner"))
        #expect(page.transactions.count == 1)
        let updated = try await api.updateTransaction(id: "t_paystack", UpdateTransactionRequest(categoryId: "c_subs"))
        #expect(updated.categoryName == "Subscriptions")
        let uncategorised = try await api.transactions(TransactionQuery(categoryId: TransactionQuery.uncategorised))
        #expect(uncategorised.transactions.map(\.id) == ["t_jumia"])

        let preview = try await api.importPreview(ImportPreviewRequest(accountId: "a_gtbank", format: .csv, content: Fixtures.sampleCSV))
        #expect(preview.columns.first == "Date")
        #expect(preview.dateAmbiguous)
        #expect(preview.suggestedMapping.columns["Debit"] == .debit)
    }
}
