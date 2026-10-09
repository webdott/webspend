import AuthenticationServices
import SwiftUI
import WebSpendKit

struct SignInView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession
    @State private var email = ""
    @State private var showServer = false

    var body: some View {
        @Bindable var store = store
        ScrollView {
            VStack(spacing: 28) {
                Spacer(minLength: 40)
                VStack(spacing: 10) {
                    Wordmark()
                    Text("Logs your spending from bank alert emails as they arrive.")
                        .font(.ws(15))
                        .foregroundStyle(WS.muted)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 12) {
                    Button {
                        Task { await signInWithGoogle() }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "globe")
                            Text("Continue with Google")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(store.isSigningIn)

                    if store.meta?.googleAuth == false {
                        Text("Google sign-in is not configured on this server.")
                            .font(.ws(12)).foregroundStyle(WS.muted)
                    }

                    if store.meta?.devAuth == true {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Developer sign-in").font(.ws(13, .semibold)).foregroundStyle(WS.ink)
                            HStack(spacing: 8) {
                                TextField("you@example.com", text: $email)
                                    .textFieldStyle(.plain)
                                    .font(.ws(14))
                                    .foregroundStyle(WS.ink)
                                    .textContentType(.emailAddress)
                                    #if os(iOS)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    #endif
                                    .autocorrectionDisabled()
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                    .background(WS.chip, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    .onSubmit { Task { await store.devSignIn(email: email) } }
                                Button("Sign in") { Task { await store.devSignIn(email: email) } }
                                    .buttonStyle(SecondaryButtonStyle())
                                    .frame(width: 92)
                                    .disabled(store.isSigningIn)
                            }
                        }
                        .wsCard()
                    }

                    Button("Try the demo") { store.startDemo() }
                        .buttonStyle(SecondaryButtonStyle())

                    DisclosureGroup(isExpanded: $showServer) {
                        HStack(spacing: 8) {
                            TextField("http://localhost:8787", text: $store.serverURLString)
                                .textFieldStyle(.plain)
                                .font(.wsMono(13, .regular))
                                .autocorrectionDisabled()
                                #if os(iOS)
                                .keyboardType(.URL)
                                .textInputAutocapitalization(.never)
                                #endif
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .background(WS.chip, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .onSubmit { applyServer() }
                            Button("Use") { applyServer() }
                                .buttonStyle(SecondaryButtonStyle())
                                .frame(width: 72)
                        }
                        .padding(.top, 8)
                        if let metaError = store.metaError {
                            Text("Could not reach the server: \(metaError)")
                                .font(.ws(12)).foregroundStyle(WS.muted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 6)
                        } else if let meta = store.meta {
                            Text("Connected · WebSpend \(meta.version)")
                                .font(.ws(12)).foregroundStyle(WS.muted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 6)
                        }
                    } label: {
                        HStack {
                            Text("Server").font(.ws(13, .semibold)).foregroundStyle(WS.ink)
                            Spacer()
                            Text(store.serverURLString).font(.wsMono(12, .regular)).foregroundStyle(WS.muted).lineLimit(1)
                        }
                    }
                    .tint(WS.muted)
                    .wsCard()

                    if let error = store.signInError {
                        Text(error)
                            .font(.ws(13))
                            .foregroundStyle(WS.danger)
                            .multilineTextAlignment(.center)
                    }
                    if store.isSigningIn {
                        LoadingState(text: "Signing in…")
                    }
                }

                Text("WebSpend reads the inbox you sign in with, and only messages from the banks you switch on. Nothing before you switch a bank on is ever read.")
                    .font(.ws(13))
                    .foregroundStyle(WS.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
                Spacer(minLength: 20)
            }
            .frame(maxWidth: 380)
            .padding(WSLayout.pagePadding)
            .frame(maxWidth: .infinity)
        }
        .wsPage()
        .task { if store.meta == nil { await store.loadMeta() } }
    }

    private func applyServer() {
        if store.applyServerURL() {
            Task { await store.loadMeta() }
        }
    }

    private func signInWithGoogle() async {
        guard store.applyServerURL(), let url = store.googleSignInURL else { return }
        store.isSigningIn = true
        defer { store.isSigningIn = false }
        do {
            let callback = try await webAuthenticationSession.authenticate(using: url, callbackURLScheme: SessionStorage.callbackScheme, preferredBrowserSession: .shared)
            await store.handleCallback(callback)
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            // The user closed the sheet.
        } catch {
            store.signInError = store.describe(error)
        }
    }
}

struct Wordmark: View {
    var size: CGFloat = 30
    var body: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(WS.accent)
                .frame(width: size * 0.9, height: size * 0.9)
                .overlay(Text("W").font(.ws(size * 0.5, .bold)).foregroundStyle(WS.onAccent))
            Text("WebSpend").font(.ws(size, .bold)).tracking(-0.6).foregroundStyle(WS.ink)
        }
    }
}

#Preview {
    SignInView().environment(AppStore())
}
