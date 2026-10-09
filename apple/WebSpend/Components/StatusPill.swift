import SwiftUI
import WebSpendKit

struct StatusPill: View {
    let status: AccountStatus
    var since: String? = nil

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(dot).frame(width: 7, height: 7)
            Text(label).font(.ws(12, .semibold)).foregroundStyle(WS.ink)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(WS.chip, in: Capsule())
    }

    private var label: String {
        switch status {
        case .off: "Off"
        case .waiting: "Waiting for first alert"
        case .tracking: since.map { "Tracking since \($0)" } ?? "Tracking"
        }
    }

    private var dot: Color {
        switch status {
        case .off: WS.muted
        case .waiting: Color.orange
        case .tracking: Color.green
        }
    }
}
