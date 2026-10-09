import SwiftUI
import WebSpendKit

/// The month at a glance: what is left or available, how the month is going, and the three
/// figures that explain it (carried over, income, spent).
struct HeroCard: View {
    let summary: Summary
    let showUsd: Bool
    var radius: CGFloat = WSLayout.heroRadius

    private var currency: Currency { summary.currency }
    private var hasBudget: Bool { summary.budgetMinor != nil && summary.leftMinor != nil }
    private var net: Int { summary.incomeMinor - summary.spentMinor }
    private var previousMonth: String { Dates.monthName(Dates.shiftMonth(summary.month, by: -1)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(hasBudget ? "Left to spend" : "Available")
                    .font(.ws(13, .medium))
                    .foregroundStyle(WS.onAccentMuted)
                Text(Money.formatMinor(hasBudget ? (summary.leftMinor ?? 0) : summary.available, currency))
                    .font(.wsMono(42, .bold))
                    .tracking(-1.4)
                    .foregroundStyle(WS.onAccent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(subline)
                    .font(.ws(13))
                    .foregroundStyle(WS.onAccentMuted)
            }

            netPill

            HStack(spacing: 12) {
                ProgressTrack(fraction: summary.spentFraction ?? 0, track: Color.white.opacity(0.18), fill: WS.onAccent, height: 8)
                Text(progressLabel)
                    .font(.wsMono(12, .medium))
                    .foregroundStyle(WS.onAccentMuted)
                    .fixedSize()
            }

            VStack(spacing: 10) {
                tile("arrow.triangle.2.circlepath", "Carried over from \(previousMonth)", Money.formatMinor(summary.carriedOver, currency), summary.carryOverUsdMinor, chip: Color.white.opacity(0.18), icon: WS.onAccent)
                HStack(spacing: 10) {
                    tile("arrow.down.left", "Income", Money.formatSigned(summary.incomeMinor, currency, summary.incomeMinor > 0 ? .income : .transfer), summary.incomeUsdMinor, chip: Color(hex: 0x58F0A0).opacity(0.26), icon: Color(hex: 0xC9FFE1))
                    tile("arrow.up.right", "Spent", Money.formatMinor(summary.spentMinor, currency), summary.spentUsdMinor, chip: Color(hex: 0xFF8C78).opacity(0.28), icon: Color(hex: 0xFFE1DC))
                }
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { backdrop }
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.white.opacity(0.16), lineWidth: 1))
        .shadow(color: WS.accent.opacity(0.35), radius: 20, y: 12)
    }

    /// A violet gradient with soft colour blooms and concentric rings in the top corner.
    private var backdrop: some View {
        ZStack {
            WS.accent
            RadialGradient(colors: [Color(hex: 0x7A5CFF), .clear], center: .topLeading, startRadius: 0, endRadius: 320)
            RadialGradient(colors: [Color(hex: 0xB14BFF), .clear], center: .topTrailing, startRadius: 0, endRadius: 280)
            RadialGradient(colors: [Color(hex: 0x2F6BFF), .clear], center: .bottomTrailing, startRadius: 0, endRadius: 300)
            GeometryReader { geo in
                ZStack {
                    ForEach(1..<7, id: \.self) { ring in
                        Circle()
                            .strokeBorder(Color.white.opacity(0.11 - Double(ring) * 0.014), lineWidth: 1)
                            .frame(width: CGFloat(ring) * 76, height: CGFloat(ring) * 76)
                    }
                }
                .position(x: geo.size.width - 30, y: 24)
            }
        }
    }

    private var netPill: some View {
        HStack(spacing: 8) {
            Image(systemName: net < 0 ? "chart.line.downtrend.xyaxis" : "chart.line.uptrend.xyaxis")
                .font(.system(size: 13, weight: .semibold))
            Text(Money.formatSigned(net, currency, net < 0 ? .expense : .income)).font(.wsMono(13))
            Text("this month").font(.ws(13)).foregroundStyle(WS.onAccentMuted)
        }
        .foregroundStyle(net < 0 ? Color(hex: 0xFFE1DC) : Color(hex: 0xD9FFE9))
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Color.white.opacity(0.14), in: Capsule())
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.2), lineWidth: 1))
    }

    private var subline: String {
        var parts: [String] = []
        if showUsd, let approx = Money.formatApprox(hasBudget ? summary.leftUsdMinor : summary.availableUsdMinor, .usd) { parts.append(approx) }
        if let budget = summary.budgetMinor {
            parts.append("of \(Money.formatMinor(budget, currency)) budget")
            parts.append("\(Money.formatMinor(summary.available, currency)) available")
        } else {
            parts.append("carried over plus income, less spending")
        }
        return parts.joined(separator: " · ")
    }

    private var progressLabel: String {
        guard let fraction = summary.spentFraction else { return "No income yet" }
        return "\(Int((fraction * 100).rounded()))% \(hasBudget ? "of budget " : "")spent"
    }

    private func tile(_ systemName: String, _ label: String, _ amount: String, _ usd: Int?, chip: Color, icon: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemName)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(icon)
                .frame(width: 36, height: 36)
                .background(chip, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.ws(12, .medium)).foregroundStyle(WS.onAccentMuted).lineLimit(1)
                Text(amount)
                    .font(.wsMono(16, .bold))
                    .foregroundStyle(WS.onAccent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if showUsd, let approx = Money.formatApprox(usd, .usd) {
                    Text(approx).font(.wsMono(11, .medium)).foregroundStyle(WS.onAccentMuted)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.16), lineWidth: 1))
    }
}

struct ProgressTrack: View {
    let fraction: Double
    var track: Color = WS.line
    var fill: Color = WS.accent
    var height: CGFloat = 3

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule().fill(fill)
                    .frame(width: max(0, min(1, fraction)) * geo.size.width)
            }
        }
        .frame(height: height)
    }
}
