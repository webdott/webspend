import SwiftUI
import WebSpendKit

struct HeroCard: View {
    let summary: Summary
    let showUsd: Bool
    var radius: CGFloat = WSLayout.heroRadius

    private var currency: Currency { summary.currency }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(summary.budgetMinor == nil ? "Spent this month" : "Left to spend")
                .font(.ws(13, .medium))
                .foregroundStyle(WS.onAccentMuted)

            Text(Money.formatMinor(summary.leftMinor ?? summary.spentMinor, currency))
                .font(.wsMono(42))
                .tracking(-1.7)
                .foregroundStyle(WS.onAccent)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            Text(subline)
                .font(.ws(13))
                .foregroundStyle(WS.onAccentMuted)

            ProgressTrack(fraction: summary.spentFraction ?? 0, track: WS.accentDeep, fill: WS.onAccent)

            HStack(alignment: .top, spacing: 16) {
                column("Spent", summary.spentMinor, summary.spentUsdMinor)
                column(summary.trackedBanks.contains(.grey) ? "Income from Grey" : "Income", summary.incomeMinor, summary.incomeUsdMinor)
            }
            .padding(.top, 4)
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(WS.accent, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    private var subline: String {
        var parts: [String] = []
        if showUsd, let approx = Money.formatApprox(summary.leftUsdMinor, .usd) { parts.append(approx) }
        if let budget = summary.budgetMinor {
            parts.append("of \(Money.formatMinor(budget, currency))")
        } else {
            parts.append("Set a monthly budget in Settings")
        }
        return parts.joined(separator: " · ")
    }

    private func column(_ label: String, _ minor: Int, _ usd: Int?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.ws(12, .medium)).foregroundStyle(WS.onAccentMuted)
            Text(Money.formatMinor(minor, currency))
                .font(.wsMono(17))
                .foregroundStyle(WS.onAccent)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if showUsd, let approx = Money.formatApprox(usd, .usd) {
                Text(approx).font(.wsMono(12)).foregroundStyle(WS.onAccentMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ProgressTrack: View {
    let fraction: Double
    var track: Color = WS.line
    var fill: Color = WS.accent

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2).fill(track)
                RoundedRectangle(cornerRadius: 2).fill(fill)
                    .frame(width: max(0, min(1, fraction)) * geo.size.width)
            }
        }
        .frame(height: 3)
    }
}
