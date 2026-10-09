import SwiftUI

/// The month's name with arrows either side. Tapping the name opens a grid of months for jumping
/// straight to any of them. Months after the current one cannot be reached either way.
struct MonthNav: View {
    let month: String
    var compact = false
    var onPick: (String) -> Void
    @State private var showPicker = false

    private var canGoForward: Bool { month < Dates.monthID() }

    var body: some View {
        HStack(spacing: 10) {
            Button { showPicker = true } label: {
                HStack(spacing: 8) {
                    Text(Dates.monthTitle(month))
                        .font(.ws(28, .bold))
                        .tracking(-0.56)
                        .foregroundStyle(WS.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(WS.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(Dates.monthTitle(month)), choose a month")
            .popover(isPresented: $showPicker, arrowEdge: .top) {
                MonthPickerPanel(selected: month) { picked in
                    showPicker = false
                    onPick(picked)
                }
                .presentationCompactAdaptation(.popover)
            }
            Spacer()
            RoundButton(systemName: "chevron.left", size: compact ? 34 : 44) {
                onPick(Dates.shiftMonth(month, by: -1))
            }
            .accessibilityLabel("Previous month")
            RoundButton(systemName: "chevron.right", size: compact ? 34 : 44) {
                onPick(Dates.shiftMonth(month, by: 1))
            }
            .disabled(!canGoForward)
            .opacity(canGoForward ? 1 : 0.4)
            .accessibilityLabel("Next month")
        }
    }
}

struct MonthPickerPanel: View {
    let selected: String
    var onPick: (String) -> Void
    @State private var year: Int

    private let latest = Dates.monthID()
    private var latestYear: Int { Int(latest.prefix(4)) ?? year }
    private static let names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    init(selected: String, onPick: @escaping (String) -> Void) {
        self.selected = selected
        self.onPick = onPick
        _year = State(initialValue: Int(selected.prefix(4)) ?? 2026)
    }

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                RoundButton(systemName: "chevron.left", size: 32) { year -= 1 }
                    .accessibilityLabel("Previous year")
                Spacer()
                Text(String(year)).font(.wsMono(17)).foregroundStyle(WS.ink)
                Spacer()
                RoundButton(systemName: "chevron.right", size: 32) { year += 1 }
                    .disabled(year >= latestYear)
                    .opacity(year >= latestYear ? 0.4 : 1)
                    .accessibilityLabel("Next year")
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                ForEach(Array(Self.names.enumerated()), id: \.offset) { index, name in
                    monthButton(name, id: String(format: "%04d-%02d", year, index + 1))
                }
            }
            Button("This month") { onPick(latest) }
                .buttonStyle(LinkButtonStyle())
        }
        .padding(16)
        .frame(width: 290)
        .background(WS.card)
    }

    private func monthButton(_ name: String, id: String) -> some View {
        let isSelected = id == selected
        let isFuture = id > latest
        return Button { onPick(id) } label: {
            Text(name)
                .font(.ws(14, .medium))
                .foregroundStyle(isSelected ? WS.onAccent : WS.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(isSelected ? WS.accent : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(id == latest && !isSelected ? WS.accent : Color.clear, lineWidth: 1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isFuture)
        .opacity(isFuture ? 0.35 : 1)
    }
}

struct RoundButton: View {
    let systemName: String
    var size: CGFloat = 44
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: size * 0.46, weight: .semibold))
                .foregroundStyle(WS.ink)
                .frame(width: size, height: size)
                .background(WS.card, in: Circle())
                .overlay(Circle().strokeBorder(WS.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
