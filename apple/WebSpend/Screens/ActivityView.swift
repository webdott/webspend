#if os(iOS)
import SwiftUI
import WebSpendKit

struct ActivityView: View {
    @Environment(AppStore.self) private var store
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        @Bindable var store = store
        List {
            Section {
                FilterChips()
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                ActivityMonthBar(month: $store.activityMonth)
                    .listRowInsets(EdgeInsets(top: 2, leading: 0, bottom: 6, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            content
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(WS.bg)
        .navigationTitle("Activity")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { store.isExporting = true } label: { Label("Export", systemImage: "square.and.arrow.up") }
                    .accessibilityLabel("Export transactions")
            }
        }
        .searchable(text: $store.searchText, prompt: "Search transactions")
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
        .refreshable { await store.loadTransactions() }
        .navigationDestination(for: Transaction.self) { TransactionDetailView(transaction: $0) }
    }

    @ViewBuilder private var content: some View {
        switch store.transactions {
        case .idle, .loading:
            Section { LoadingState() }.listRowBackground(WS.card)
        case let .failed(message):
            Section { ErrorState(message: message) { Task { await store.loadTransactions() } } }.listRowBackground(WS.card)
        case let .loaded(items):
            if items.isEmpty {
                Section {
                    EmptyState(title: store.searchText.isEmpty ? "Nothing here yet" : "No matches", message: store.searchText.isEmpty ? "Transactions appear as alerts arrive." : "Try another word or clear the filter.", systemImage: "magnifyingglass")
                }.listRowBackground(WS.card)
            } else {
                ForEach(Dates.groupByDay(items), id: \.heading) { group in
                    Section {
                        ForEach(group.items) { transaction in
                            NavigationLink(value: transaction) {
                                TransactionRow(transaction: transaction, showUsd: store.showUsd)
                            }
                        }
                    } header: {
                        Text(group.heading).font(.ws(13, .semibold)).foregroundStyle(WS.muted).textCase(nil)
                    }
                    .listRowBackground(WS.card)
                }
                if store.hasMoreTransactions {
                    Section {
                        Button {
                            Task { await store.loadMoreTransactions() }
                        } label: {
                            HStack {
                                Spacer()
                                if store.isLoadingMore { ProgressView().controlSize(.small) } else { Text("Load more").font(.ws(14, .medium)).foregroundStyle(WS.accentText) }
                                Spacer()
                            }
                        }
                    }.listRowBackground(WS.card)
                }
            }
        }
    }
}

#endif

import SwiftUI

struct FilterChips: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(AppStore.Filter.allCases) { filter in
                    Pill(title: filter.rawValue, selected: store.filter == filter) {
                        store.filter = filter
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }
}

#if os(iOS)
#Preview {
    NavigationStack { ActivityView() }.environment(AppStore.demo())
}
#endif
