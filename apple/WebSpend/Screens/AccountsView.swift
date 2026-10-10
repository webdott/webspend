import SwiftUI
import WebSpendKit

struct AccountsView: View {
    @Environment(AppStore.self) private var store
    @State private var showAdd = false
    @State private var editing: Account?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                #if os(macOS)
                Text("Accounts").font(.ws(28, .bold)).tracking(-0.56).foregroundStyle(WS.ink)
                #endif
                trackedBanks
                myAccounts
                #if os(iOS)
                NavigationLink { ImportView() } label: { Text("Import a statement") }
                    .buttonStyle(LinkButtonStyle())
                #endif
            }
            .padding(WSLayout.pagePadding)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .wsPage()
        .navigationTitle("Accounts")
        .refreshable {
            await store.loadAccounts()
        }
        .sheet(isPresented: $showAdd) {
            AddAccountSheet().environment(store)
        }
        .sheet(item: $editing) { account in
            EditAccountSheet(account: account).environment(store)
        }
    }

    // MARK: Tracked banks

    @ViewBuilder private var trackedBanks: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Tracked banks")
            switch store.accounts {
            case .idle, .loading:
                LoadingState().wsCard()
            case let .failed(message):
                ErrorState(message: message) { Task { await store.loadAccounts() } }.wsCard()
            case let .loaded(accounts):
                ForEach(Bank.tracked, id: \.self) { bank in
                    BankCard(bank: bank, account: accounts.first { $0.bank == bank })
                }
            }
        }
    }

    // MARK: My accounts

    @ViewBuilder private var myAccounts: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("My accounts") {
                Button("Add") { showAdd = true }.buttonStyle(LinkButtonStyle())
            }
            Text("Money moving between these is a transfer to self and stays out of the totals.")
                .font(.ws(13)).foregroundStyle(WS.muted)
            if let accounts = store.accounts.value {
                let own = accounts.filter(\.isOwn)
                if own.isEmpty {
                    EmptyState(title: "No accounts listed", message: "Add the account numbers you own, including ones that are not tracked.").wsCard()
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(own.enumerated()), id: \.element.id) { index, account in
                            HStack(spacing: 12) {
                                BankBadge(bank: account.bank, size: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(account.name).font(.ws(15, .medium)).foregroundStyle(WS.ink)
                                    Text([account.bank.label, account.accountNumber].compactMap { $0 }.joined(separator: " · "))
                                        .font(.wsMono(12, .regular)).foregroundStyle(WS.muted)
                                }
                                Spacer()
                                Button {
                                    editing = account
                                } label: {
                                    Image(systemName: "pencil").foregroundStyle(WS.accentText)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Edit \(account.name)")
                                if !account.tracked {
                                    Button {
                                        Task { await store.deleteAccount(id: account.id) }
                                    } label: {
                                        Image(systemName: "minus.circle").foregroundStyle(WS.danger)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Remove \(account.name)")
                                }
                            }
                            .padding(.vertical, 8)
                            if index < own.count - 1 { Hairline() }
                        }
                    }
                    .scrollsWhenLong()
                    .wsCard(padding: 14)
                }
            }
        }
    }
}

struct BankCard: View {
    @Environment(AppStore.self) private var store
    let bank: Bank
    let account: Account?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                BankBadge(bank: bank, size: 36)
                VStack(alignment: .leading, spacing: 3) {
                    Text(account?.name ?? bank.label).font(.ws(16, .semibold)).foregroundStyle(WS.ink)
                    StatusPill(status: account?.tracked == true ? (account?.status ?? .waiting) : .off, since: account?.trackingFrom.map { Dates.shortYear(iso: $0) })
                }
                Spacer()
                Toggle("Tracking", isOn: Binding(get: { account?.tracked ?? false }, set: { on in
                    busy = true
                    Task {
                        await store.setTracking(bank: bank, on: on)
                        busy = false
                    }
                }))
                .labelsHidden()
                .tint(WS.accent)
                .disabled(busy)
                #if os(macOS)
                .toggleStyle(.switch)
                #endif
            }
            if account?.tracked != true {
                VStack(alignment: .leading, spacing: 3) {
                    Text("1. Turn on email alerts in the bank's app").font(.ws(13)).foregroundStyle(WS.muted)
                    Text("2. Switch tracking on here").font(.ws(13)).foregroundStyle(WS.muted)
                }
            } else if let account {
                HStack(spacing: 6) {
                    if let balance = account.lastBalanceMinor {
                        Text("Last balance \(Money.formatMinor(balance, account.currency))").font(.wsMono(12, .regular)).foregroundStyle(WS.ink)
                        if let relative = Dates.relative(iso: account.lastBalanceAt) {
                            Text("· \(relative)").font(.ws(12)).foregroundStyle(WS.muted)
                        }
                    } else {
                        Text("The first alert supplies the opening balance.").font(.ws(12)).foregroundStyle(WS.muted)
                    }
                }
            }
        }
        .wsCard()
    }
}

struct AddAccountSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var bank: Bank = .gtbank
    @State private var name = ""
    @State private var number = ""

    var body: some View {
        NavigationStack {
            Form {
                Picker("Bank", selection: $bank) {
                    ForEach(Bank.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                TextField("Name (e.g. GTBank savings)", text: $name)
                TextField("Account number", text: $number)
                    #if os(iOS)
                    .keyboardType(.numberPad)
                    #endif
            }
            .formStyle(.grouped)
            .navigationTitle("Add account")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let trimmedName = name.trimmingCharacters(in: .whitespaces)
                        let trimmedNumber = number.trimmingCharacters(in: .whitespaces)
                        Task {
                            await store.createAccount(CreateAccountRequest(bank: bank, name: trimmedName.isEmpty ? bank.label : trimmedName, accountNumber: trimmedNumber.isEmpty ? nil : trimmedNumber, currency: nil, isOwn: true))
                        }
                        dismiss()
                    }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 260)
        #endif
    }
}

struct EditAccountSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let account: Account
    @State private var name: String
    @State private var number: String

    init(account: Account) {
        self.account = account
        _name = State(initialValue: account.name)
        _number = State(initialValue: account.accountNumber ?? "")
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        NavigationStack {
            Form {
                Section(account.bank.label) {
                    TextField("Name", text: $name)
                    TextField("Account number", text: $number)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Edit account")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let trimmedNumber = number.trimmingCharacters(in: .whitespaces)
                        Task {
                            await store.updateAccount(id: account.id, name: trimmedName, accountNumber: trimmedNumber.isEmpty ? nil : trimmedNumber)
                        }
                        dismiss()
                    }
                    .disabled(trimmedName.isEmpty)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 240)
        #endif
    }
}

#Preview {
    NavigationStack { AccountsView() }.environment(AppStore.demo())
}
