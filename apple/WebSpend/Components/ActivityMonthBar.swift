import SwiftUI

/// The month the activity list is limited to, or every month. The arrows step from the current
/// month when nothing is chosen, and tapping the name opens the month grid.
struct ActivityMonthBar: View {
    /// `YYYY-MM`, or nil for every month.
    @Binding var month: String?
    @State private var showPicker = false

    private var shown: String { month ?? Dates.monthID() }
    private var canGoForward: Bool { month != nil && shown < Dates.monthID() }

    var body: some View {
        HStack(spacing: 8) {
            RoundButton(systemName: "chevron.left", size: 32) { month = Dates.shiftMonth(shown, by: -1) }
                .accessibilityLabel("Previous month")
            Button { showPicker = true } label: {
                HStack(spacing: 6) {
                    Text(month.map(Dates.monthTitle) ?? "All months")
                        .font(.ws(14, .medium))
                        .foregroundStyle(WS.ink)
                        .lineLimit(1)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(WS.muted)
                }
                .padding(.horizontal, 12)
                .frame(height: 32)
                .background(WS.chip, in: Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(month.map { "\(Dates.monthTitle($0)), choose a month" } ?? "All months, choose a month")
            .popover(isPresented: $showPicker, arrowEdge: .top) {
                VStack(spacing: 0) {
                    MonthPickerPanel(selected: shown) { picked in
                        showPicker = false
                        month = picked
                    }
                    if month != nil {
                        Divider()
                        Button("All months") {
                            showPicker = false
                            month = nil
                        }
                        .buttonStyle(.plain)
                        .font(.ws(14, .medium))
                        .foregroundStyle(WS.accentText)
                        .padding(.vertical, 12)
                    }
                }
                .presentationCompactAdaptation(.popover)
            }
            RoundButton(systemName: "chevron.right", size: 32) { month = Dates.shiftMonth(shown, by: 1) }
                .disabled(!canGoForward)
                .opacity(canGoForward ? 1 : 0.4)
                .accessibilityLabel("Next month")
        }
    }
}
