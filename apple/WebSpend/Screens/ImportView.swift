import SwiftUI
import UniformTypeIdentifiers
import WebSpendKit

struct ImportView: View {
    @Environment(AppStore.self) private var store

    @State private var accountId: String = ""
    @State private var fileName: String?
    @State private var format: ImportFormat = .csv
    @State private var content: String = ""
    @State private var showPicker = false
    @State private var preview: Loadable<ImportPreviewResponse> = .idle
    @State private var mapping = ImportMapping(columns: [:], dateOrder: .dmy, negativeIsExpense: true)
    @State private var committing = false
    @State private var result: ImportCommitResponse?
    @State private var commitError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                #if os(macOS)
                Text("Import").font(.ws(28, .bold)).tracking(-0.56).foregroundStyle(WS.ink)
                #endif
                Text("Import a bank statement. CSV and JSON only; rows that match an existing transaction are skipped.")
                    .font(.ws(14)).foregroundStyle(WS.muted)

                stepAccount
                stepFile
                previewSection
                resultSection
            }
            .padding(WSLayout.pagePadding)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .wsPage()
        .navigationTitle("Import")
        .fileImporter(isPresented: $showPicker, allowedContentTypes: [.commaSeparatedText, .json, .plainText, .text], allowsMultipleSelection: false) { outcome in
            switch outcome {
            case let .success(urls):
                if let url = urls.first { load(url) }
            case let .failure(error):
                preview = .failed(error.localizedDescription)
            }
        }
        .task {
            if store.accounts.value == nil { await store.loadAccounts() }
            if accountId.isEmpty {
                accountId = store.accounts.value?.first { $0.bank.isTracked }?.id ?? ImportPreviewRequest.noAccount
            }
        }
    }

    private var stepAccount: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("1. Account")
            if let accounts = store.accounts.value {
                Picker("Account", selection: $accountId) {
                    ForEach(accounts) { account in
                        Text("\(account.name) · \(account.bank.label)").tag(account.id)
                    }
                    Text("No account (file under Unassigned)").tag(ImportPreviewRequest.noAccount)
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .tint(WS.ink)
            } else {
                LoadingState()
            }
        }
        .wsCard()
    }

    private var stepFile: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("2. File")
            HStack(spacing: 12) {
                Button("Choose CSV or JSON…") { showPicker = true }
                    .buttonStyle(SecondaryButtonStyle())
                    .frame(maxWidth: 220)
                if let fileName {
                    Text(fileName).font(.wsMono(12, .regular)).foregroundStyle(WS.muted).lineLimit(1)
                }
                Spacer()
            }
            if store.isDemo {
                Button("Use a sample GTBank statement") {
                    fileName = "gtbank-sample.csv"
                    format = .csv
                    content = Fixtures.sampleCSV
                    Task { await runPreview() }
                }
                .buttonStyle(LinkButtonStyle())
            }
        }
        .wsCard()
    }

    @ViewBuilder private var previewSection: some View {
        switch preview {
        case .idle:
            EmptyView()
        case .loading:
            LoadingState(text: "Reading the file…").wsCard()
        case let .failed(message):
            ErrorState(message: message) { Task { await runPreview() } }.wsCard()
        case let .loaded(preview):
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle("3. Columns") {
                    Text("\(preview.rowCount) rows").font(.ws(12)).foregroundStyle(WS.muted)
                }
                VStack(spacing: 0) {
                ForEach(preview.columns, id: \.self) { column in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(column).font(.ws(14, .medium)).foregroundStyle(WS.ink)
                            if let sample = preview.sampleRows.first?[column], !sample.isEmpty {
                                Text(sample).font(.wsMono(11, .regular)).foregroundStyle(WS.muted).lineLimit(1)
                            }
                        }
                        Spacer()
                        Picker("Field", selection: Binding(get: { mapping.columns[column] ?? .ignore }, set: { mapping.columns[column] = $0 })) {
                            ForEach(ImportField.all, id: \.self) { Text($0.label).tag($0) }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        .frame(width: 150)
                    }
                    .padding(.vertical, 4)
                }
                }
                .scrollsWhenLong(maxHeight: 320)
                if preview.dateAmbiguous {
                    Hairline()
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Some dates could be day-first or month-first. Which is it?")
                            .font(.ws(13, .medium)).foregroundStyle(WS.accentText)
                        Picker("Date order", selection: $mapping.dateOrder) {
                            ForEach(DateOrder.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                    }
                } else {
                    Hairline()
                    HStack {
                        Text("Date order").font(.ws(13)).foregroundStyle(WS.muted)
                        Spacer()
                        Picker("Date order", selection: $mapping.dateOrder) {
                            ForEach(DateOrder.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        .frame(width: 180)
                    }
                }
                if mapping.columns.values.contains(.amount) {
                    Hairline()
                    SwitchRow(title: "Negative amounts are expenses", subtitle: "Used when a single amount column carries the sign", isOn: $mapping.negativeIsExpense)
                }
                if !preview.sampleRows.isEmpty {
                    Hairline()
                    sampleTable(preview)
                }
                Button {
                    Task { await commit() }
                } label: {
                    if committing { ProgressView().controlSize(.small).tint(.white) } else { Text("Import \(preview.rowCount) rows") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(committing || !mapping.columns.values.contains(.date))
                if let commitError {
                    Text(commitError).font(.ws(13)).foregroundStyle(WS.danger)
                }
            }
            .wsCard()
        }
    }

    private func sampleTable(_ preview: ImportPreviewResponse) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 6) {
                GridRow {
                    ForEach(preview.columns, id: \.self) { Text($0).font(.ws(11, .semibold)).foregroundStyle(WS.muted) }
                }
                ForEach(Array(preview.sampleRows.prefix(4).enumerated()), id: \.offset) { _, row in
                    GridRow {
                        ForEach(preview.columns, id: \.self) { column in
                            Text(row[column] ?? "").font(.wsMono(11, .regular)).foregroundStyle(WS.ink).lineLimit(1)
                        }
                    }
                }
            }
            .padding(10)
            .background(WS.chip, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private static func resultLine(_ result: ImportCommitResponse) -> String {
        var parts = ["Added \(result.added)", "Skipped \(result.skipped)"]
        if let created = result.categoriesCreated, created > 0 {
            parts.append("\(created) new \(created == 1 ? "category" : "categories")")
        }
        if let categorised = result.categorised, categorised > 0 {
            parts.append("\(categorised) already logged given a category")
        }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder private var resultSection: some View {
        if let result {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(WS.accent)
                    Text(Self.resultLine(result)).font(.ws(16, .semibold)).foregroundStyle(WS.ink)
                }
                if !result.errors.isEmpty {
                    ForEach(result.errors) { error in
                        Text("Row \(error.row): \(error.reason)").font(.ws(12)).foregroundStyle(WS.muted)
                    }
                }
            }
            .wsCard()
        }
    }

    // MARK: Actions

    private func load(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            content = try String(contentsOf: url, encoding: .utf8)
            fileName = url.lastPathComponent
            format = url.pathExtension.lowercased() == "json" ? .json : .csv
            result = nil
            Task { await runPreview() }
        } catch {
            preview = .failed(error.localizedDescription)
        }
    }

    private func runPreview() async {
        guard !accountId.isEmpty else {
            preview = .failed("Choose an account first.")
            return
        }
        preview = .loading
        do {
            let response = try await store.importPreview(ImportPreviewRequest(accountId: accountId, format: format, content: content))
            mapping = response.suggestedMapping
            preview = .loaded(response)
        } catch {
            preview = .failed(store.describe(error))
        }
    }

    private func commit() async {
        committing = true
        defer { committing = false }
        do {
            result = try await store.importCommit(ImportCommitRequest(accountId: accountId, format: format, content: content, mapping: mapping))
            commitError = nil
        } catch {
            commitError = store.describe(error)
        }
    }
}

#Preview {
    NavigationStack { ImportView() }.environment(AppStore.demo())
}
