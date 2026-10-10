import SwiftUI

/// Caps a list at `maxHeight` and scrolls it once the content is taller. Shorter content keeps
/// its own height, so nothing changes until a list actually grows. The transactions list is the
/// one list that stays unbounded.
struct ScrollsWhenLong: ViewModifier {
    let maxHeight: CGFloat
    @State private var contentHeight: CGFloat?

    func body(content: Content) -> some View {
        ScrollView(.vertical) {
            content
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
        .frame(height: contentHeight.map { min($0, maxHeight) })
        .scrollBounceBehavior(.basedOnSize)
    }
}

extension View {
    func scrollsWhenLong(maxHeight: CGFloat = 360) -> some View {
        modifier(ScrollsWhenLong(maxHeight: maxHeight))
    }
}
