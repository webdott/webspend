import SwiftUI
import WebSpendKit

struct AccountsView: View {
    @Environment(AppStore.self) private var store
    @State private var showAdd = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                #if os(macOS)
                Text("Accounts").font(.ws(28, .bold)).tracking(-0.56).foregroundStyle(WS.ink)
                #endif
                trackedBanks
                myAccounts
                openGaps
            }
            .padding(WSLayout.pagePadding)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .wsPage()
        .navigationTitle("Accounts")
        .refreshable {
            await store.loadAccounts()
            await store.loadGaps()
        }
        .sheet(isPresented: $showAdd) {
            AddAccountSheet().environment(store)
        }
        #if os(iOS)
        .navigationDestination(for: Gap.self) { gap in ImportView(gap: gap) }
        #endif
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
                    .wsCard(padding: 14)
                }
            }
        }
    }

    // MARK: Gaps

    @ViewBuilder private var openGaps: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Open gaps")
            switch store.gaps {
            case .idle, .loading:
                LoadingState().wsCard()
            case let .failed(message):
                ErrorState(message: message) { Task { await store.loadGaps() } }.wsCard()
            case let .loaded(gaps):
                if gaps.isEmpty {
                    EmptyState(title: "Balances add up", message: "When an alert is missed, the gap shows here with an option to import a statement.", systemImage: "checkmark.circle").wsCard()
                } else {
                    ForEach(gaps) { gap in GapCard(gap: gap) }
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

struct GapCard: View {
    @Environment(AppStore.self) private var store
    let gap: Gap

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(gap.accountName).font(.ws(15, .semibold)).foregroundStyle(WS.ink)
                Spacer()
                Text(Money.formatSigned(gap.differenceMinor, gap.currency, gap.differenceMinor < 0 ? .expense : .income))
                    .font(.wsMono(14)).foregroundStyle(WS.ink)
            }
            Text("\(Dates.short(iso: gap.fromAt)) – \(Dates.short(iso: gap.toAt)) · expected \(Money.formatMinor(gap.expectedBalanceMinor, gap.currency)), saw \(Money.formatMinor(gap.actualBalanceMinor, gap.currency))")
                .font(.ws(13)).foregroundStyle(WS.muted)
            HStack(spacing: 16) {
                #if os(iOS)
                NavigationLink(value: gap) { Text("Import a statement") }.buttonStyle(LinkButtonStyle())
                #else
                Button("Import a statement") {
                    store.pendingImportGap = gap
                    store.macSection = .import
                }.buttonStyle(LinkButtonStyle())
                #endif
                Button("Dismiss") { Task { await store.dismissGap(id: gap.id) } }
                    .buttonStyle(LinkButtonStyle())
                    .tint(WS.muted)
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

#Preview {
    NavigationStack { AccountsView() }.environment(AppStore.demo())
}
