import SwiftUI

struct SwitchRow: View {
    let title: String
    var subtitle: String? = nil
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.ws(15, .medium)).foregroundStyle(WS.ink)
                if let subtitle {
                    Text(subtitle).font(.ws(13)).foregroundStyle(WS.muted)
                }
            }
        }
        .tint(WS.accent)
        #if os(macOS)
        .toggleStyle(.switch)
        #endif
    }
}

struct FactRow: View {
    let label: String
    let value: String
    var mono = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label).font(.ws(13)).foregroundStyle(WS.muted).frame(width: 84, alignment: .leading)
            Text(value)
                .font(mono ? .wsMono(14, .regular) : .ws(14))
                .foregroundStyle(WS.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
        .padding(.vertical, 6)
    }
}
