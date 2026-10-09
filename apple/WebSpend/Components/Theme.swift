import SwiftUI
import WebSpendKit
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Design tokens from `shared/DESIGN.md`. Dynamic colours follow the effective colour scheme,
/// which the theme setting drives through `preferredColorScheme`.
enum WS {
    static let bg = dynamic(0xF5F6F8, 0x0B0D10)
    static let side = dynamic(0xECEEF2, 0x111418)
    static let card = dynamic(0xFFFFFF, 0x15181D)
    static let ink = dynamic(0x0B0D10, 0xF2F4F7)
    static let muted = dynamic(0x5B6472, 0x9AA4B2)
    static let line = dynamic(0xE3E6EB, 0x252A32)
    static let chip = dynamic(0xECEEF2, 0x1E2229)
    static let accent = Color(hex: 0x5B4BFF)
    static let accentDeep = Color(hex: 0x4638D6)
    static let accentText = dynamic(0x4A3BE0, 0xA9A1FF)
    static let onAccent = Color.white
    static let onAccentMuted = Color(hex: 0xE4E1FF)
    static let danger = Color(hex: 0xD6455D)

    static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        #if os(iOS)
        return Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
        })
        #else
        return Color(NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? NSColor(hex: dark) : NSColor(hex: light)
        })
        #endif
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

#if os(iOS)
extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}
#else
extension NSColor {
    convenience init(hex: UInt32) {
        self.init(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}
#endif

extension Font {
    /// UI text: the system font (SF). Geist is not bundled.
    static func ws(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }

    /// Amounts: SF Mono stands in for Geist Mono.
    static func wsMono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

enum WSLayout {
    #if os(iOS)
    static let pagePadding: CGFloat = 20
    static let heroRadius: CGFloat = 28
    #else
    static let pagePadding: CGFloat = 24
    static let heroRadius: CGFloat = 24
    #endif
    static let cardRadius: CGFloat = 18
    static let contentMaxWidth: CGFloat = 1040
}

struct CardModifier: ViewModifier {
    var padding: CGFloat
    var radius: CGFloat
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(WS.card, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

extension View {
    func wsCard(padding: CGFloat = 16, radius: CGFloat = WSLayout.cardRadius) -> some View {
        modifier(CardModifier(padding: padding, radius: radius))
    }

    func wsPage() -> some View {
        frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(WS.bg.ignoresSafeArea())
    }
}

struct SectionTitle<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: () -> Trailing

    init(_ title: String, @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.title = title
        self.trailing = trailing
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.ws(15, .semibold)).foregroundStyle(WS.ink)
            Spacer()
            trailing()
        }
    }
}

struct RateLine: View {
    let perUsd: Double?
    let currency: Currency
    var body: some View {
        if let perUsd {
            Text(Money.formatRate(perUsd, currency))
                .font(.wsMono(12))
                .foregroundStyle(WS.accentText)
        }
    }
}

struct Hairline: View {
    var body: some View { Rectangle().fill(WS.line).frame(height: 1) }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.ws(15, .semibold))
            .foregroundStyle(WS.onAccent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(configuration.isPressed ? WS.accentDeep : WS.accent, in: Capsule())
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.ws(15, .medium))
            .foregroundStyle(WS.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(WS.chip.opacity(configuration.isPressed ? 0.7 : 1), in: Capsule())
    }
}

struct LinkButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.ws(13, .medium))
            .foregroundStyle(WS.accentText.opacity(configuration.isPressed ? 0.6 : 1))
    }
}
