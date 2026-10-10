import SwiftUI
import WebSpendKit

struct CategoryBar: View {
    let total: CategoryTotal
    let maxMinor: Int
    let currency: Currency
    let showUsd: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(total.name)
                    .font(.ws(14, .medium))
                    .foregroundStyle(total.categoryId == nil ? WS.accentText : WS.ink)
                Text("· \(total.count)").font(.ws(12)).foregroundStyle(WS.muted)
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    Text(Money.formatMinor(total.minor, currency)).font(.wsMono(14)).foregroundStyle(WS.ink)
                    if showUsd, let approx = Money.formatApprox(total.usdMinor, .usd) {
                        Text(approx).font(.wsMono(11)).foregroundStyle(WS.muted)
                    }
                }
            }
            ProgressTrack(fraction: maxMinor > 0 ? Double(total.minor) / Double(maxMinor) : 0)
        }
        .padding(.vertical, 6)
    }
}

struct WhereItWent: View {
    let totals: [CategoryTotal]
    let currency: Currency
    let showUsd: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Where it went")
            if totals.isEmpty {
                Text("Nothing spent this month yet.").font(.ws(13)).foregroundStyle(WS.muted)
                    .wsCard()
            } else {
                let maxMinor = totals.map(\.minor).max() ?? 0
                VStack(spacing: 2) {
                    ForEach(totals) { total in
                        CategoryBar(total: total, maxMinor: maxMinor, currency: currency, showUsd: showUsd)
                    }
                }
                .scrollsWhenLong()
                .wsCard()
            }
        }
    }
}
