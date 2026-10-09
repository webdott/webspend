import SwiftUI
import WebSpendKit

@main
struct WebSpendApp: App {
    @State private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                #if os(macOS)
                .frame(minWidth: 940, minHeight: 600)
                #endif
        }
        #if os(macOS)
        .windowStyle(.automatic)
        .defaultSize(width: 1180, height: 760)
        .commands {
            CommandGroup(after: .toolbar) {
                Button("Refresh") { Task { await store.refreshAll() } }
                    .keyboardShortcut("r", modifiers: .command)
                    .disabled(store.phase != .signedIn)
            }
        }
        #endif
    }
}
