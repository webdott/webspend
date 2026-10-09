import SwiftUI

struct LoadingState: View {
    var text = "Loading…"
    var body: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text(text).font(.ws(13)).foregroundStyle(WS.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}

struct EmptyState: View {
    let title: String
    var message: String? = nil
    var systemImage = "tray"

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: systemImage).font(.system(size: 26)).foregroundStyle(WS.muted)
            Text(title).font(.ws(15, .semibold)).foregroundStyle(WS.ink)
            if let message {
                Text(message).font(.ws(13)).foregroundStyle(WS.muted).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 16)
    }
}

struct ErrorState: View {
    let message: String
    var retry: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 24)).foregroundStyle(WS.danger)
            Text("Something went wrong").font(.ws(15, .semibold)).foregroundStyle(WS.ink)
            Text(message).font(.ws(13)).foregroundStyle(WS.muted).multilineTextAlignment(.center)
            if let retry {
                Button("Try again", action: retry).buttonStyle(SecondaryButtonStyle()).frame(maxWidth: 160)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 16)
    }
}

struct ToastBanner: View {
    let text: String
    var dismiss: () -> Void
    var body: some View {
        HStack {
            Text(text).font(.ws(13, .medium)).foregroundStyle(WS.ink).lineLimit(2)
            Spacer()
            Button(action: dismiss) {
                Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(WS.muted)
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(WS.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(WS.danger.opacity(0.5)))
        .padding(.horizontal, WSLayout.pagePadding)
        .shadow(color: .black.opacity(0.08), radius: 10, y: 4)
    }
}
