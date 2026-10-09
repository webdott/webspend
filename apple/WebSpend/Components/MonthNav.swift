import SwiftUI

struct MonthNav: View {
    let title: String
    var compact = false
    var onPrevious: () -> Void
    var onNext: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text(title)
                .font(.ws(28, .bold))
                .tracking(-0.56)
                .foregroundStyle(WS.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer()
            RoundButton(systemName: "chevron.left", size: compact ? 34 : 44, action: onPrevious)
                .accessibilityLabel("Previous month")
            RoundButton(systemName: "chevron.right", size: compact ? 34 : 44, action: onNext)
                .accessibilityLabel("Next month")
        }
    }
}

struct RoundButton: View {
    let systemName: String
    var size: CGFloat = 44
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: size * 0.36, weight: .semibold))
                .foregroundStyle(WS.ink)
                .frame(width: size, height: size)
                .background(WS.card, in: Circle())
                .overlay(Circle().strokeBorder(WS.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
