import SwiftUI

struct Pill: View {
    let title: String
    var selected = false
    var small = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.ws(small ? 12 : 13, .medium))
                .foregroundStyle(selected ? WS.accentText : WS.ink)
                .padding(.horizontal, small ? 10 : 13)
                .padding(.vertical, small ? 6 : 8)
                .background(selected ? WS.accent.opacity(0.14) : WS.chip, in: Capsule())
                .overlay(Capsule().strokeBorder(selected ? WS.accentText.opacity(0.5) : .clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct TagPill: View {
    let text: String
    var tint: Color = WS.muted
    var background: Color = WS.chip

    var body: some View {
        Text(text)
            .font(.ws(11, .semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(background, in: Capsule())
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: proposal.width ?? x, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
