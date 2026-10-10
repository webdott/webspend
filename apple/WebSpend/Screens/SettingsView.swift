import SwiftUI
import WebSpendKit

struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var budgetText = ""
    @State private var budgetSeeded = false
    @FocusState private var budgetFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                #if os(macOS)
                Text("Settings").font(.ws(28, .bold)).tracking(-0.56).foregroundStyle(WS.ink)
                #endif
                if store.isDemo {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles").foregroundStyle(WS.accentText)
                        Text("Demo mode: changes stay on this device until you sign out.").font(.ws(13)).foregroundStyle(WS.ink)
                    }
                    .wsCard(padding: 12)
                }
                currencySection
                usdSection
                budgetSection
                categoriesSection
                themeSection
                accountSection
            }
            .padding(WSLayout.pagePadding)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
        .wsPage()
        .navigationTitle("Settings")
        #if os(iOS)
        .navigationDestination(for: String.self) { route in
            if route == "categories" { CategoriesView() }
        }
        #endif
        .onAppear { seedBudget() }
        .onChange(of: store.user?.monthlyBudgetMinor) { _, _ in seedBudget(force: true) }
    }

    private var user: User? { store.user }
    private var currency: Currency { store.defaultCurrency }

    private var currencySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Default currency")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(Currency.all, id: \.self) { candidate in
                    let selected = candidate == currency
                    Button {
                        guard !selected else { return }
                        Task { await store.updateSettings(UpdateSettingsRequest(defaultCurrency: candidate)) }
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(candidate.rawValue).font(.wsMono(16, .semibold)).foregroundStyle(selected ? WS.accentText : WS.ink)
                            Text(candidate.displayName).font(.ws(12)).foregroundStyle(WS.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(WS.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(selected ? WS.accent : WS.line, lineWidth: selected ? 2 : 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var usdSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("US dollar equivalent")
            if currency == .usd {
                Text("No conversion needed").font(.ws(14)).foregroundStyle(WS.muted).wsCard()
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    SwitchRow(title: "Show US dollar equivalent", subtitle: "Beside every amount, using the rate from its own day.", isOn: Binding(
                        get: { user?.showUsdEquivalent ?? true },
                        set: { on in Task { await store.updateSettings(UpdateSettingsRequest(showUsdEquivalent: on)) } }
                    ))
                    Hairline()
                    HStack {
                        Text("Today's rate").font(.ws(13)).foregroundStyle(WS.muted)
                        Spacer()
                        if let rate = store.todayPerUsd {
                            Text(Money.formatRate(rate, currency)).font(.wsMono(13)).foregroundStyle(WS.accentText)
                        } else {
                            Text("Not fetched yet").font(.ws(13)).foregroundStyle(WS.muted)
                        }
                    }
                }
                .wsCard()
            }
        }
    }

    private var budgetSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Monthly budget")
            HStack(spacing: 8) {
                Text(currency.symbol).font(.wsMono(16)).foregroundStyle(WS.muted)
                TextField("No budget", text: $budgetText)
                    .textFieldStyle(.plain)
                    .font(.wsMono(16))
                    .foregroundStyle(WS.ink)
                    .focused($budgetFocused)
                    #if os(iOS)
                    .keyboardType(.decimalPad)
                    #endif
                    .onSubmit { Task { await saveBudget() } }
                Button("Save") { Task { await saveBudget() } }
                    .buttonStyle(.borderedProminent)
                    .tint(WS.accent)
                    .controlSize(.small)
                    .disabled(!budgetChanged)
                if user?.monthlyBudgetMinor != nil {
                    Button("Clear") {
                        budgetText = ""
                        Task { await store.updateSettings(UpdateSettingsRequest(monthlyBudgetMinor: .some(nil))) }
                    }.buttonStyle(LinkButtonStyle())
                }
            }
            .padding(12)
            .background(WS.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            Text("\"Left to spend\" on Summary is this minus what you spent.").font(.ws(12)).foregroundStyle(WS.muted)
        }
    }

    private var categoriesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Categories")
            #if os(iOS)
            NavigationLink(value: "categories") { categoriesRow }.buttonStyle(.plain)
            #else
            Button { store.macSection = .categories } label: { categoriesRow }.buttonStyle(.plain)
            #endif
        }
    }

    private var categoriesRow: some View {
        HStack {
            Text("Edit categories").font(.ws(15, .medium)).foregroundStyle(WS.ink)
            Spacer()
            Text("\(store.categories.value?.count ?? 0)").font(.wsMono(13)).foregroundStyle(WS.muted)
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(WS.muted)
        }
        .wsCard(padding: 14)
    }

    private var themeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Theme")
            Picker("Theme", selection: Binding(get: { user?.theme ?? .auto }, set: { theme in Task { await store.updateSettings(UpdateSettingsRequest(theme: theme)) } })) {
                Text("Auto").tag(Theme.auto)
                Text("Light").tag(Theme.light)
                Text("Dark").tag(Theme.dark)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
    }

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Signed in")
            VStack(alignment: .leading, spacing: 10) {
                Text(user?.email ?? "—").font(.ws(15, .medium)).foregroundStyle(WS.ink)
                Text("This is the inbox WebSpend reads, and only messages from the banks you switch on.").font(.ws(13)).foregroundStyle(WS.muted)
                Hairline()
                HStack {
                    Text("Server").font(.ws(13)).foregroundStyle(WS.muted)
                    Spacer()
                    Text(store.isDemo ? "Demo (no server)" : store.serverURLString).font(.wsMono(12, .regular)).foregroundStyle(WS.muted).lineLimit(1)
                }
                Hairline()
                Button("Sign out") { Task { await store.signOut() } }
                    .buttonStyle(LinkButtonStyle())
                    .foregroundStyle(WS.danger)
            }
            .wsCard()
        }
    }

    private func seedBudget(force: Bool = false) {
        guard force || !budgetSeeded else { return }
        budgetSeeded = true
        if let budget = user?.monthlyBudgetMinor {
            budgetText = String(Money.formatMinor(budget, currency).dropFirst(currency.symbol.count))
        } else {
            budgetText = ""
        }
    }

    private var budgetChanged: Bool {
        let trimmed = budgetText.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return user?.monthlyBudgetMinor != nil }
        return Money.parseMinor(trimmed) != user?.monthlyBudgetMinor
    }

    private func saveBudget() async {
        budgetFocused = false
        let trimmed = budgetText.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            if user?.monthlyBudgetMinor != nil { await store.updateSettings(UpdateSettingsRequest(monthlyBudgetMinor: .some(nil))) }
            return
        }
        guard let minor = Money.parseMinor(trimmed), minor >= 0 else {
            store.toast = "Enter a budget like 1,200,000"
            seedBudget(force: true)
            return
        }
        guard minor != user?.monthlyBudgetMinor else { return }
        await store.updateSettings(UpdateSettingsRequest(monthlyBudgetMinor: .some(minor)))
        store.toast = "Budget saved"
    }
}

#Preview {
    NavigationStack { SettingsView() }.environment(AppStore.demo())
}
