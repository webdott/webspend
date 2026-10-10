#if os(macOS)
import SwiftUI
import WebSpendKit

struct TransactionsTableView: View {
    @Environment(AppStore.self) private var store
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        @Bindable var store = store
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                Text("Transactions").font(.ws(28, .bold)).tracking(-0.56).foregroundStyle(WS.ink)
                Spacer()
                RateLine(perUsd: store.todayPerUsd, currency: store.defaultCurrency)
            }
            HStack(alignment: .center, spacing: 12) {
                FilterChips()
                Spacer(minLength: 12)
                ActivityMonthBar(month: $store.activityMonth)
            }
            table
        }
        .padding(WSLayout.pagePadding)
        .frame(maxWidth: WSLayout.contentMaxWidth, maxHeight: .infinity, alignment: .topLeading)
        .frame(maxWidth: .infinity)
        .wsPage()
        .searchable(text: $store.searchText, placement: .toolbar, prompt: "Search transactions")
        .onChange(of: store.searchText) { _, _ in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled else { return }
                await store.loadTransactions()
            }
        }
        .onChange(of: store.filter) { _, _ in Task { await store.loadTransactions() } }
        .onChange(of: store.activityMonth) { _, _ in Task { await store.loadTransactions() } }
        .inspector(isPresented: Binding(get: { store.selectedTransactionId != nil }, set: { if !$0 { store.selectedTransactionId = nil } })) {
            if let id = store.selectedTransactionId, let transaction = store.loadedTransaction(id: id) {
                ScrollView {
                    TransactionDetailView(transaction: transaction)
                        .id(transaction.id)
                }
                .inspectorColumnWidth(min: 320, ideal: 360, max: 460)
                .background(WS.bg)
            } else {
                EmptyState(title: "Select a transaction")
            }
        }
    }

    @ViewBuilder private var table: some View {
        @Bindable var store = store
        switch store.transactions {
        case .idle, .loading:
            LoadingState().wsCard()
        case let .failed(message):
            ErrorState(message: message) { Task { await store.loadTransactions() } }.wsCard()
        case let .loaded(items):
            if items.isEmpty {
                EmptyState(title: store.searchText.isEmpty ? "Nothing here yet" : "No matches", message: store.searchText.isEmpty ? "Transactions appear as alerts arrive." : "Try another word or clear the filter.", systemImage: "magnifyingglass").wsCard()
            } else {
                Table(items, selection: $store.selectedTransactionId) {
                    TableColumn("Date") { t in
                        Text(t.occurredDate.map(Dates.dayHeading) ?? t.occurredAt).foregroundStyle(WS.muted)
                    }.width(min: 90, ideal: 100)
                    TableColumn("Merchant") { t in
                        HStack(spacing: 8) {
                            BankBadge(bank: t.bank, type: t.type, size: 22)
                            Text(t.title).foregroundStyle(WS.ink)
                        }
                    }
                    TableColumn("Category") { t in
                        Text((t.type == .expense ? (t.categoryName ?? "Needs a category") : (t.type == .income ? "Income" : "Transfer to self")) + (t.unsureTransfer ? " · Unsure" : ""))
                            .foregroundStyle(t.needsCategory || t.unsureTransfer ? WS.accentText : WS.muted)
                    }
                    TableColumn("Account") { t in Text(t.accountName).foregroundStyle(WS.muted) }
                    TableColumn("Amount") { t in
                        AmountText(transaction: t, size: 13).frame(maxWidth: .infinity, alignment: .trailing)
                    }.width(min: 110, ideal: 130)
                    TableColumn("≈ USD") { t in
                        Text(store.showUsd ? (Money.formatApprox(t.usdMinor, .usd) ?? "—") : "")
                            .font(.wsMono(12)).foregroundStyle(WS.muted)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }.width(min: 80, ideal: 90)
                }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(WS.line))
                if store.hasMoreTransactions {
                    Button("Load more") { Task { await store.loadMoreTransactions() } }
                        .buttonStyle(LinkButtonStyle())
                }
            }
        }
    }
}
#endif
