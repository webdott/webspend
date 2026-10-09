import SwiftUI
import WebSpendKit

struct RootView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack(alignment: .top) {
            switch store.phase {
            case .booting:
                VStack(spacing: 14) {
                    Wordmark()
                    ProgressView().controlSize(.small)
                }
                .wsPage()
            case .signedOut:
                SignInView()
            case .signedIn:
                #if os(iOS)
                PhoneTabs()
                #else
                MacShell()
                #endif
            }
            if let toast = store.toast {
                ToastBanner(text: toast) { store.toast = nil }
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(for: .seconds(5))
                        if store.toast == toast { store.toast = nil }
                    }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: store.toast)
        .preferredColorScheme(store.preferredColorScheme)
        .tint(WS.accent)
        .task { await store.bootstrap() }
        .onOpenURL { url in Task { await store.handleCallback(url) } }
    }
}

#if os(iOS)
struct PhoneTabs: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        TabView {
            NavigationStack { SummaryView() }
                .tabItem { Label("Summary", systemImage: "chart.pie") }
            NavigationStack { ActivityView() }
                .tabItem { Label("Activity", systemImage: "list.bullet.rectangle") }
            NavigationStack { AccountsView() }
                .tabItem { Label("Accounts", systemImage: "building.columns") }
            NavigationStack { SettingsView() }
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .toolbarBackground(WS.card, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .overlay(alignment: .bottomTrailing) {
            Button { store.isAddingTransaction = true } label: {
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(WS.onAccent)
                    .frame(width: 56, height: 56)
                    .background(WS.accent, in: Circle())
                    .shadow(color: WS.accent.opacity(0.45), radius: 12, y: 6)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add a transaction")
            .padding(.trailing, 18)
            .padding(.bottom, 66)
        }
        .sheet(isPresented: Binding(get: { store.isAddingTransaction }, set: { store.isAddingTransaction = $0 })) {
            AddTransactionSheet().environment(store)
        }
        .sheet(isPresented: Binding(get: { store.isExporting }, set: { store.isExporting = $0 })) {
            ExportSheet(month: store.month).environment(store)
        }
    }
}
#else
struct MacShell: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        @Bindable var store = store
        NavigationSplitView {
            List(selection: $store.macSection) {
                ForEach(AppStore.MacSection.allCases) { section in
                    Label(section.rawValue, systemImage: section.systemImage)
                        .font(.ws(13, .medium))
                        .tag(section)
                }
            }
            .listStyle(.sidebar)
            .scrollContentBackground(.hidden)
            .background(WS.side)
            .safeAreaInset(edge: .top) {
                Wordmark(size: 18)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .padding(.bottom, 4)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 6) {
                    Circle().fill(store.summary.value?.lastAlertAt == nil ? WS.muted : Color.green).frame(width: 7, height: 7)
                    Text(store.lastAlertText).font(.ws(12)).foregroundStyle(WS.muted)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(WS.side)
            }
            .navigationSplitViewColumnWidth(220)
        } detail: {
            NavigationStack {
                detail
                    .navigationTitle(store.macSection.rawValue)
            }
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            store.isExporting = true
                        } label: {
                            Label("Export", systemImage: "square.and.arrow.up")
                        }
                        .help("Export transactions as CSV or PDF")
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            store.isAddingTransaction = true
                        } label: {
                            Label("Add", systemImage: "plus")
                        }
                        .labelStyle(.titleAndIcon)
                        .buttonStyle(.borderedProminent)
                        .tint(WS.accent)
                        .help("Add a transaction")
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            Task { await store.refreshAll() }
                        } label: {
                            Label("Refresh", systemImage: "arrow.clockwise")
                        }
                        .help("Refresh")
                    }
                }
        }
        .navigationSplitViewStyle(.balanced)
        .sheet(isPresented: $store.isAddingTransaction) {
            AddTransactionSheet().environment(store)
        }
        .sheet(isPresented: $store.isExporting) {
            ExportSheet(month: store.month).environment(store)
        }
    }

    @ViewBuilder private var detail: some View {
        switch store.macSection {
        case .summary: SummaryView()
        case .transactions: TransactionsTableView()
        case .categories: CategoriesView()
        case .import: ImportView()
        case .accounts: AccountsView()
        case .settings: SettingsView()
        }
    }
}
#endif
