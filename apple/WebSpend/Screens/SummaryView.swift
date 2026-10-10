import SwiftUI
import WebSpendKit

struct SummaryView: View {
    #if os(macOS)
    @State private var clicked: Transaction.ID?
    #endif
    @Environment(AppStore.self) private var store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                MonthNav(month: store.month, compact: isMac, onPick: { store.goToMonth($0) })
                content
            }
            .padding(WSLayout.pagePadding)
            .frame(maxWidth: WSLayout.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .wsPage()
        .refreshable { await store.loadSummary() }
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: Transaction.self) { TransactionDetailView(transaction: $0) }
        #endif
    }

    private var isMac: Bool {
        #if os(macOS)
        true
        #else
        false
        #endif
    }

    @ViewBuilder private var content: some View {
        switch store.summary {
        case .idle, .loading:
            LoadingState(text: "Loading \(store.monthTitle)…")
        case let .failed(message):
            ErrorState(message: message) { Task { await store.loadSummary() } }
        case let .loaded(summary):
            #if os(macOS)
            HStack(alignment: .top, spacing: 20) {
                HeroCard(summary: summary, showUsd: store.showUsd)
                    .frame(maxWidth: .infinity)
                WhereItWent(totals: summary.byCategory, currency: summary.currency, showUsd: store.showUsd)
                    .frame(maxWidth: .infinity)
            }
            notices(summary)
            latestTable(summary)
            #else
            HeroCard(summary: summary, showUsd: store.showUsd)
            notices(summary)
            WhereItWent(totals: summary.byCategory, currency: summary.currency, showUsd: store.showUsd)
            latestList(summary)
            #endif
        }
    }

    @ViewBuilder private func notices(_ summary: Summary) -> some View {
        if summary.uncategorisedCount > 0 {
            HStack(spacing: 8) {
                TagPill(text: "Needs a category · \(summary.uncategorisedCount)", tint: WS.accentText, background: WS.accent.opacity(0.12))
                Spacer()
            }
        }
    }

    private func latestList(_ summary: Summary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Latest") {
                HStack(spacing: 12) {
                    RateLine(perUsd: summary.todayPerUsd, currency: summary.currency)
                    Button("All transactions") { store.showAllTransactions() }.buttonStyle(LinkButtonStyle())
                }
            }
            switch store.latest {
            case .idle, .loading:
                LoadingState().wsCard()
            case let .failed(message):
                ErrorState(message: message).wsCard()
            case let .loaded(items):
                if items.isEmpty {
                    EmptyState(title: "No transactions in \(store.monthTitle)", message: "Alerts from the banks you switch on will show here.").wsCard()
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, transaction in
                            NavigationLink(value: transaction) {
                                TransactionRow(transaction: transaction, showUsd: store.showUsd)
                            }
                            .buttonStyle(.plain)
                            if index < items.count - 1 { Hairline() }
                        }
                    }
                    .wsCard(padding: 12)
                }
            }
        }
    }

    #if os(macOS)
    private func latestTable(_ summary: Summary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Latest transactions") {
                HStack(spacing: 12) {
                    RateLine(perUsd: summary.todayPerUsd, currency: summary.currency)
                    Button("All transactions") { store.showAllTransactions() }.buttonStyle(LinkButtonStyle())
                }
            }
            switch store.latest {
            case .idle, .loading:
                LoadingState().wsCard()
            case let .failed(message):
                ErrorState(message: message).wsCard()
            case let .loaded(items):
                if items.isEmpty {
                    EmptyState(title: "No transactions in \(store.monthTitle)", message: "Alerts from the banks you switch on will show here.").wsCard()
                } else {
                    Table(items, selection: $clicked) {
                        TableColumn("Date") { t in
                            Text(t.occurredDate.map(Dates.short) ?? t.occurredAt).foregroundStyle(WS.muted)
                        }.width(min: 70, ideal: 80)
                        TableColumn("Merchant") { t in
                            VStack(alignment: .leading, spacing: 1) {
                                Text(t.title).foregroundStyle(WS.ink)
                                Text("\(t.type == .expense ? (t.categoryName ?? "Needs a category") : (t.type == .income ? "Income" : "Transfer to self")) · \(t.accountName)")
                                    .font(.ws(11))
                                    .foregroundStyle(t.needsCategory ? WS.accentText : WS.muted)
                            }
                        }
                        TableColumn("Amount") { t in
                            AmountText(transaction: t, size: 13).frame(maxWidth: .infinity, alignment: .trailing)
                        }.width(min: 110, ideal: 130)
                        TableColumn("≈ USD") { t in
                            Text(store.showUsd ? (Money.formatApprox(t.usdMinor, .usd) ?? "—") : "")
                                .font(.wsMono(12)).foregroundStyle(WS.muted)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                        }.width(min: 80, ideal: 90)
                    }
                    .onChange(of: clicked) { _, id in
                        guard let id, let transaction = items.first(where: { $0.id == id }) else { return }
                        clicked = nil
                        store.open(transaction)
                    }
                    .frame(minHeight: CGFloat(items.count) * 40 + 36, maxHeight: 320)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(WS.line))
                }
            }
        }
    }
    #endif
}

#Preview {
    NavigationStack { SummaryView() }.environment(AppStore.demo())
}
