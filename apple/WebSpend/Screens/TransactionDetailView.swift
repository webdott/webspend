import SwiftUI
import WebSpendKit

struct TransactionDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var transaction: Transaction
    @State private var description: String
    @State private var remember: Bool
    @State private var saving = false
    @State private var error: String?
    @State private var showCategories = false
    @State private var confirmDelete = false
    @State private var showEdit = false
    @FocusState private var descriptionFocused: Bool

    init(transaction: Transaction) {
        _transaction = State(initialValue: transaction)
        _description = State(initialValue: transaction.userDescription ?? "")
        _remember = State(initialValue: !Self.looksLikeProcessor(transaction.counterpartyName))
    }

    private static let processors = ["paystack", "flutterwave", "interswitch", "remita", "paga", "monnify", "squad"]

    private static func looksLikeProcessor(_ name: String?) -> Bool {
        guard let name = name?.lowercased() else { return false }
        return processors.contains { name.contains($0) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if transaction.unsureTransfer { unsureSection }
                facts
                categorySection
                descriptionSection
                markAsSection
                if transaction.source != .alert { deleteSection }
                if let error {
                    Text(error).font(.ws(13)).foregroundStyle(WS.danger)
                }
            }
            .padding(WSLayout.pagePadding)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
        .wsPage()
        .navigationTitle("")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .sheet(isPresented: $showCategories) {
            NavigationStack { CategoriesView(isSheet: true) }
                .environment(store)
                #if os(macOS)
                .frame(minWidth: 420, minHeight: 520)
                #endif
        }
        .sheet(isPresented: $showEdit) {
            EditTransactionSheet(transaction: transaction) { request in
                await save(request)
                return error == nil
            }
        }
        .confirmationDialog("Delete this transaction?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await deleteTransaction() } }
        } message: {
            Text("Only transactions you imported or entered by hand can be deleted.")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                BankBadge(bank: transaction.bank, type: transaction.type, size: 32)
                Text(transaction.title).font(.ws(22, .bold)).tracking(-0.4).foregroundStyle(WS.ink)
                Spacer(minLength: 8)
                Button("Edit") { showEdit = true }.buttonStyle(LinkButtonStyle())
            }
            AmountText(transaction: transaction, size: 34)
                .padding(.top, 4)
            if store.showUsd, let approx = Money.formatApprox(transaction.usdMinor, .usd) {
                Text(approx).font(.wsMono(14)).foregroundStyle(WS.muted)
            }
            if transaction.currency != transaction.defaultCurrency {
                Text("\(Money.formatMinor(transaction.amountMinor, transaction.currency)) in \(transaction.currency.rawValue)")
                    .font(.ws(13)).foregroundStyle(WS.muted)
            }
        }
    }

    private var facts: some View {
        VStack(spacing: 0) {
            FactRow(label: "Date", value: Dates.full(iso: transaction.occurredAt))
            Hairline()
            FactRow(label: "Account", value: "\(transaction.accountName) · \(transaction.source.phrase)")
            if let counterparty = transaction.counterpartyName {
                Hairline()
                FactRow(label: transaction.type == .income ? "From" : "To", value: [counterparty, transaction.counterpartyBank].compactMap { $0 }.joined(separator: " · "))
            }
            if let bankText = transaction.bankDescription {
                Hairline()
                FactRow(label: "Bank says", value: bankText)
            }
            if let reference = transaction.bankReference {
                Hairline()
                FactRow(label: "Reference", value: reference, mono: true)
            }
            if transaction.isFee {
                Hairline()
                FactRow(label: "Note", value: "Added by WebSpend when pairing a conversion.")
            }
        }
        .wsCard(padding: 14)
    }

    private var categorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Category") {
                Button("Edit list") { showCategories = true }.buttonStyle(LinkButtonStyle())
            }
            switch store.categories {
            case .idle, .loading:
                LoadingState()
            case let .failed(message):
                ErrorState(message: message) { Task { await store.loadCategories() } }
            case let .loaded(categories):
                FlowLayout(spacing: 8) {
                    Pill(title: "None", selected: transaction.categoryId == nil, small: true) {
                        Task { await setCategory(nil) }
                    }
                    ForEach(categories) { category in
                        Pill(title: category.name, selected: transaction.categoryId == category.id, small: true) {
                            Task { await setCategory(category.id) }
                        }
                    }
                }
                .scrollsWhenLong(maxHeight: 180)
            }
            Hairline()
            SwitchRow(title: "Remember for this payee", subtitle: "Starts off for processors like Paystack", isOn: $remember)
                .onChange(of: remember) { _, newValue in
                    guard newValue, let categoryId = transaction.categoryId else { return }
                    Task { await save(UpdateTransactionRequest(categoryId: categoryId, rememberForPayee: true)) }
                }
        }
        .wsCard()
    }

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle("Your description")
            TextField("What was this for?", text: $description, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.ws(15))
                .foregroundStyle(WS.ink)
                .lineLimit(2...5)
                .focused($descriptionFocused)
                .padding(12)
                .background(WS.chip, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .onSubmit { Task { await saveDescription() } }
            HStack {
                Text("Kept separate from the bank's own wording.").font(.ws(12)).foregroundStyle(WS.muted)
                Spacer()
                Button(saving ? "Saving…" : "Save") { Task { await saveDescription() } }
                    .buttonStyle(.borderedProminent)
                    .tint(WS.accent)
                    .controlSize(.small)
                    .disabled(!descriptionChanged || saving)
            }
        }
        .wsCard()
    }

    private var descriptionChanged: Bool {
        description.trimmingCharacters(in: .whitespacesAndNewlines) != (transaction.userDescription ?? "")
    }

    private var unsureSection: some View {
        let kept = transaction.type == .income ? "income" : "an expense"
        return VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Is this a transfer to yourself?")
            Text("The other account ends in the same digits as one of yours. It counts as \(kept) until you say.")
                .font(.ws(13)).foregroundStyle(WS.muted)
            HStack(spacing: 16) {
                Button("Yes, it is mine") { Task { await save(UpdateTransactionRequest(type: .transfer)) } }
                    .buttonStyle(LinkButtonStyle())
                Button("No, keep as \(kept)") { Task { await save(UpdateTransactionRequest(type: transaction.type)) } }
                    .buttonStyle(LinkButtonStyle())
                    .tint(WS.muted)
            }
        }
        .wsCard()
    }

    private var markAsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Mark as")
            Picker("Mark as", selection: Binding(get: { transaction.type }, set: { newType in
                guard newType != transaction.type else { return }
                Task { await save(UpdateTransactionRequest(type: newType)) }
            })) {
                Text("Expense").tag(TransactionType.expense)
                Text("Income").tag(TransactionType.income)
                Text("Transfer to self").tag(TransactionType.transfer)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            Text(markAsHint).font(.ws(12)).foregroundStyle(WS.muted)
        }
        .wsCard()
    }

    private var markAsHint: String {
        switch transaction.type {
        case .expense: "Counted in what you spent this month."
        case .income: "Counted in what came in this month."
        case .transfer: "Between your own accounts, left out of the totals."
        }
    }

    private var deleteSection: some View {
        Button(role: .destructive) { confirmDelete = true } label: {
            HStack { Spacer(); Text("Delete transaction"); Spacer() }
        }
        .font(.ws(15, .medium))
        .foregroundStyle(WS.danger)
        .padding(.vertical, 12)
        .background(WS.card, in: RoundedRectangle(cornerRadius: WSLayout.cardRadius, style: .continuous))
        .buttonStyle(.plain)
    }

    // MARK: Actions

    private func setCategory(_ id: String?) async {
        guard id != transaction.categoryId else { return }
        await save(UpdateTransactionRequest(categoryId: .some(id), rememberForPayee: id == nil ? nil : remember))
    }

    private func saveDescription() async {
        guard descriptionChanged else { return }
        let trimmed = description.trimmingCharacters(in: .whitespacesAndNewlines)
        await save(UpdateTransactionRequest(userDescription: .some(trimmed.isEmpty ? nil : trimmed)))
        descriptionFocused = false
        if error == nil { store.toast = "Description saved" }
    }

    private func save(_ request: UpdateTransactionRequest) async {
        saving = true
        defer { saving = false }
        do {
            transaction = try await store.updateTransaction(id: transaction.id, request)
            description = transaction.userDescription ?? ""
            error = nil
        } catch {
            self.error = store.describe(error)
        }
    }

    private func deleteTransaction() async {
        do {
            try await store.deleteTransaction(id: transaction.id)
            dismiss()
        } catch {
            self.error = store.describe(error)
        }
    }
}

/// Title, amount, date and payee in one form. Only the fields that changed are sent.
struct EditTransactionSheet: View {
    let transaction: Transaction
    /// Saves the changes and says whether they went through.
    var onSave: @MainActor (UpdateTransactionRequest) async -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var amount: String
    @State private var date: Date
    @State private var payee: String
    @State private var problem: String?
    @State private var saving = false

    private let originalDate: Date

    init(transaction: Transaction, onSave: @escaping @MainActor (UpdateTransactionRequest) async -> Bool) {
        self.transaction = transaction
        self.onSave = onSave
        let occurred = transaction.occurredDate ?? Date()
        originalDate = occurred
        _title = State(initialValue: transaction.userTitle ?? "")
        _amount = State(initialValue: Self.plainAmount(transaction.amountMinor))
        _date = State(initialValue: occurred)
        _payee = State(initialValue: transaction.counterpartyName ?? "")
    }

    /// Minor units as the plain number a person would type: 4380000 → "43800.00".
    private static func plainAmount(_ minor: Int) -> String {
        let kobo = minor % 100
        return "\(minor / 100).\(kobo < 10 ? "0" : "")\(kobo)"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(transaction.userTitle == nil ? transaction.title : "Title", text: $title)
                } header: {
                    Text("Title")
                } footer: {
                    Text("Leave blank to use the payee or the bank's text.")
                }
                Section("Amount (\(transaction.currency.rawValue))") {
                    TextField("0.00", text: $amount)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                }
                Section("Date and time") {
                    DatePicker("Date and time", selection: $date, in: ...Date())
                        .labelsHidden()
                }
                Section {
                    TextField("Payee", text: $payee)
                } header: {
                    Text(transaction.type == .income ? "From" : "To")
                } footer: {
                    if transaction.source == .alert {
                        Text("This came from a bank alert. Change the amount or date only if the alert was wrong.")
                    }
                }
                if let problem {
                    Text(problem).foregroundStyle(WS.danger)
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Edit transaction")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await submit() } }.disabled(saving)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 440)
        #endif
    }

    private func submit() async {
        guard let amountMinor = Money.parseMinor(amount), amountMinor > 0 else {
            problem = "Enter an amount above zero."
            return
        }
        let newTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let newPayee = payee.trimmingCharacters(in: .whitespacesAndNewlines)

        var request = UpdateTransactionRequest()
        if newTitle != (transaction.userTitle ?? "") { request.title = .some(newTitle.isEmpty ? nil : newTitle) }
        if amountMinor != transaction.amountMinor { request.amountMinor = amountMinor }
        if date != originalDate { request.occurredAt = ISO8601.string(date) }
        if newPayee != (transaction.counterpartyName ?? "") { request.counterpartyName = .some(newPayee.isEmpty ? nil : newPayee) }
        if request.isEmpty {
            dismiss()
            return
        }

        saving = true
        defer { saving = false }
        if await onSave(request) {
            dismiss()
        } else {
            problem = "Could not save. Check your connection and try again."
        }
    }
}

#Preview {
    NavigationStack { TransactionDetailView(transaction: Fixtures.transactions[1]) }.environment(AppStore.demo())
}
