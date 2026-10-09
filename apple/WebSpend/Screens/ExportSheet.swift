import SwiftUI
import UniformTypeIdentifiers
import WebSpendKit

/// Picks a format and a range of days, asks the server for the file, then hands it to the share
/// sheet on iPhone or a save panel on Mac.
struct ExportSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var format: ExportFormat = .csv
    @State private var from: Date
    @State private var to: Date
    @State private var accountId = ""
    @State private var include: Include = .all
    @State private var busy = false
    @State private var problem: String?
    @State private var file: ExportedFile?
    #if os(iOS)
    @State private var shareURL: URL?
    #else
    @State private var saving = false
    #endif

    enum Include: String, CaseIterable, Identifiable {
        case all = "Everything", expense = "Expenses only", income = "Income only", transfer = "Transfers to self only"
        var id: String { rawValue }
        var type: TransactionType? {
            switch self {
            case .all: nil
            case .expense: .expense
            case .income: .income
            case .transfer: .transfer
            }
        }
    }

    init(month: String) {
        let bounds = Self.monthBounds(month)
        _from = State(initialValue: bounds.from)
        _to = State(initialValue: bounds.to)
    }

    private var accounts: [Account] { store.accounts.value ?? [] }
    private var rangeProblem: String? {
        if from > to { return "The start day is after the end day." }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Format", selection: $format) {
                        ForEach(ExportFormat.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    Text("A spreadsheet-ready CSV, or a PDF statement with totals. Transfers to self are listed but not counted.")
                }
                Section("Days to include") {
                    HStack(spacing: 8) {
                        preset("This month", Self.monthBounds(Dates.monthID()))
                        preset("Last month", Self.monthBounds(Dates.shiftMonth(Dates.monthID(), by: -1)))
                        preset("This year", Self.yearBounds())
                    }
                    DatePicker("From", selection: $from, in: ...Date(), displayedComponents: .date)
                    DatePicker("To", selection: $to, in: ...Date(), displayedComponents: .date)
                }
                Section {
                    Picker("Account", selection: $accountId) {
                        Text("All accounts").tag("")
                        ForEach(accounts) { account in
                            Text(account.name == account.bank.label ? account.name : "\(account.name) · \(account.bank.label)").tag(account.id)
                        }
                    }
                    Picker("Include", selection: $include) {
                        ForEach(Include.allCases) { Text($0.rawValue).tag($0) }
                    }
                }
                if let problem = problem ?? rangeProblem {
                    Text(problem).foregroundStyle(WS.danger)
                }
                #if os(iOS)
                if let shareURL, let file {
                    Section {
                        ShareLink(item: shareURL) {
                            Label("Save or share \(file.filename)", systemImage: "square.and.arrow.up")
                        }
                    } footer: {
                        Text("\(ByteCountFormatter.string(fromByteCount: Int64(file.data.count), countStyle: .file)) · Save to Files, AirDrop or send it on.")
                    }
                }
                #endif
            }
            .formStyle(.grouped)
            .navigationTitle("Export transactions")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Preparing…" : "Download \(format.label)") { Task { await download() } }
                        .disabled(busy || rangeProblem != nil)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 440)
        .fileExporter(
            isPresented: $saving,
            document: file.map { ExportDocument(file: $0) },
            contentType: format == .csv ? .commaSeparatedText : .pdf,
            defaultFilename: file?.filename
        ) { result in
            if case let .failure(error) = result { problem = error.localizedDescription } else { dismiss() }
        }
        #endif
        .task {
            if store.accounts.value == nil { await store.loadAccounts() }
        }
        .onChange(of: format) { _, _ in file = nil }
    }

    private func preset(_ title: String, _ bounds: (from: Date, to: Date)) -> some View {
        let selected = Calendar.current.isDate(from, inSameDayAs: bounds.from) && Calendar.current.isDate(to, inSameDayAs: bounds.to)
        return Pill(title: title, selected: selected, small: true) {
            from = bounds.from
            to = bounds.to
        }
    }

    private func download() async {
        busy = true
        problem = nil
        defer { busy = false }
        do {
            let query = ExportQuery(
                format: format,
                from: Self.day(from),
                to: Self.day(to),
                accountId: accountId.isEmpty ? nil : accountId,
                type: include.type
            )
            let exported = try await store.api.export(query)
            file = exported
            #if os(iOS)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(exported.filename)
            try exported.data.write(to: url, options: .atomic)
            shareURL = url
            #else
            saving = true
            #endif
        } catch {
            problem = store.describe(error)
        }
    }

    // MARK: Days

    /// `YYYY-MM-DD` in the local calendar, which the server reads as a Lagos day.
    static func day(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 2026, parts.month ?? 1, parts.day ?? 1)
    }

    /// The whole of a month, with the end held back to today while the month is still running.
    static func monthBounds(_ month: String, today: Date = Date()) -> (from: Date, to: Date) {
        let calendar = Calendar.current
        let start = Dates.monthDate(month) ?? calendar.startOfDay(for: today)
        let next = calendar.date(byAdding: .month, value: 1, to: start) ?? start
        let last = calendar.date(byAdding: .day, value: -1, to: next) ?? start
        return (start, min(last, calendar.startOfDay(for: today)))
    }

    static func yearBounds(today: Date = Date()) -> (from: Date, to: Date) {
        let calendar = Calendar.current
        let start = calendar.date(from: calendar.dateComponents([.year], from: today)) ?? today
        return (start, calendar.startOfDay(for: today))
    }
}

#if os(macOS)
/// Wraps the downloaded bytes so the save panel can write them.
struct ExportDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.commaSeparatedText, .pdf]
    let data: Data

    init(file: ExportedFile) { data = file.data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
#endif

#Preview {
    ExportSheet(month: Dates.monthID()).environment(AppStore.demo())
}
