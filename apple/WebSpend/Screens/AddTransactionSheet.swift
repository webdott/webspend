import SwiftUI
import WebSpendKit

/// Adds a transaction by hand, for anything the bank did not email about (airtime, cash).
struct AddTransactionSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    /// An account id, or `Self.cash` for a Cash account that is created on saving.
    @State private var accountId = ""
    @State private var what = ""
    @State private var amount = ""
    @State private var type: TransactionType = .expense
    @State private var date = Date()
    @State private var categoryId: String?
    @State private var problem: String?
    @State private var saving = false

    private static let cash = "cash"
    private static let lastAccountKey = "addTransaction.account"

    private var accounts: [Account] { store.accounts.value ?? [] }
    private var hasCash: Bool { accounts.contains { $0.bank == .cash } }
    private var currency: Currency { accounts.first { $0.id == accountId }?.currency ?? store.defaultCurrency }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Account", selection: $accountId) {
                        ForEach(accounts) { account in
                            Text(account.name == account.bank.label ? account.name : "\(account.name) · \(account.bank.label)").tag(account.id)
                        }
                        if !hasCash { Text("Cash").tag(Self.cash) }
                    }
                } footer: {
                    Text("For anything your bank did not email about, like airtime, or cash you spent.")
                }
                Section("What was it") {
                    TextField("Airtime top-up", text: $what)
                }
                Section("Amount (\(currency.rawValue))") {
                    TextField("0.00", text: $amount)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                }
                Section {
                    Picker("Type", selection: $type) {
                        Text("Expense").tag(TransactionType.expense)
                        Text("Income").tag(TransactionType.income)
                        Text("Transfer to self").tag(TransactionType.transfer)
                    }
                    DatePicker("When", selection: $date, in: ...Date())
                    if type != .transfer {
                        Picker("Category", selection: $categoryId) {
                            Text("Needs a category").tag(String?.none)
                            ForEach(store.categories.value ?? []) { category in
                                Text(category.name).tag(String?.some(category.id))
                            }
                        }
                    }
                }
                if let problem {
                    Text(problem).foregroundStyle(WS.danger)
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Add a transaction")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await submit() } }.disabled(saving || accountId.isEmpty)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 440, minHeight: 520)
        #endif
        .task {
            if store.accounts.value == nil { await store.loadAccounts() }
            if store.categories.value == nil { await store.loadCategories() }
            if accountId.isEmpty { accountId = defaultAccount }
        }
    }

    /// The account used last time if it still exists, else the first tracked one, else the first.
    private var defaultAccount: String {
        if let last = UserDefaults.standard.string(forKey: Self.lastAccountKey), accounts.contains(where: { $0.id == last }) {
            return last
        }
        return (accounts.first { $0.tracked } ?? accounts.first)?.id ?? Self.cash
    }

    private func submit() async {
        let description = what.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !description.isEmpty else {
            problem = "Say what it was."
            return
        }
        guard let amountMinor = Money.parseMinor(amount), amountMinor > 0 else {
            problem = "Enter an amount above zero."
            return
        }
        saving = true
        defer { saving = false }
        do {
            let used = try await store.addTransaction(
                accountId: accountId == Self.cash ? nil : accountId,
                occurredAt: ISO8601.string(date),
                type: type,
                amountMinor: amountMinor,
                description: description,
                categoryId: type == .transfer ? nil : categoryId
            )
            UserDefaults.standard.set(used, forKey: Self.lastAccountKey)
            dismiss()
        } catch {
            problem = store.describe(error)
        }
    }
}

#Preview {
    AddTransactionSheet().environment(AppStore.demo())
}
