# WebSpend for Mac and iPhone

SwiftUI clients for the WebSpend API. Both apps compile the same `WebSpend/` sources and share
`WebSpendKit`, a Swift package that mirrors `shared/src/api.ts` field for field.

```
apple/
  WebSpendKit/          Models, API client, Keychain session store, money formatting, fixtures + MockAPI
  WebSpend/             App sources (SwiftUI), shared by both targets
  WebSpend.xcodeproj    Targets "WebSpend" (iOS 17+) and "WebSpend Mac" (macOS 14+)
```

## Requirements

- Xcode 26 (Swift 6 language mode, strict concurrency on).
- No signing or team is needed: the iOS target builds unsigned for the simulator and the Mac
  target is ad-hoc signed.

## Open

```bash
open apple/WebSpend.xcodeproj
```

Pick the `WebSpend` scheme and an iPhone simulator, or the `WebSpend Mac` scheme, and run.
Both schemes are shared (`xcshareddata/xcschemes`).

## Build from the command line

```bash
# Package tests (money formatting, contract decoding, PATCH body encoding, MockAPI)
cd apple/WebSpendKit && swift test

# iPhone
xcodebuild -project apple/WebSpend.xcodeproj -scheme "WebSpend" \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath /tmp/webspend-dd build

# Mac
xcodebuild -project apple/WebSpend.xcodeproj -scheme "WebSpend Mac" \
  -destination 'platform=macOS' -derivedDataPath /tmp/webspend-dd build
open "/tmp/webspend-dd/Build/Products/Debug/WebSpend Mac.app"
```

## Install on your own devices

Signing uses the free Personal Team, so there is no App Store or TestFlight; apps are installed
directly and the iPhone's signature lasts seven days.

```bash
./scripts/make-dmg.sh        # Mac: apple/build/dist/WebSpend-<version>.dmg (ad-hoc signed)
./scripts/install-iphone.sh  # iPhone over USB, a fresh seven-day profile each run
./scripts/make-ipa.sh        # iPhone via AltStore: apple/build/dist/WebSpend-<version>.ipa
```

### AltStore, so the iPhone refreshes itself

[AltStore](https://altstore.io) re-signs the app with your own Apple ID and renews it over Wi-Fi
whenever the phone can reach the Mac, so the weekly USB plug-in goes away. One-time setup:

1. Download AltServer for macOS from altstore.io, move it to `/Applications` and open it. It
   lives in the menu bar.
2. Plug the iPhone in, unlock it, and in Finder tick "Show this iPhone when on Wi-Fi".
3. Menu bar icon > Install AltStore > your iPhone. Enter your Apple ID when asked (it goes to
   Apple only). If AltServer asks to install a Mail plug-in, follow its prompt.
4. On the phone: Settings > General > VPN & Device Management > trust your Apple ID.
   Developer Mode must stay on.
5. Run `./scripts/make-ipa.sh`, then menu bar icon > Sideload .ipa… > pick the file, or AirDrop
   the file to the phone and open it with AltStore.

After that AltStore renews WebSpend in the background as long as the Mac is awake with AltServer
running and both are on the same Wi-Fi. Open AltStore > My Apps to refresh by hand or to see
the days left. A free Apple ID allows three sideloaded apps at a time (AltStore counts as one)
and ten new app identifiers a week. A new build goes on the phone by repeating step 5.

## Run

On first launch the sign-in screen offers:

- **Continue with Google** – opens `<server>/auth/google?client=iphone|mac` in an
  `ASWebAuthenticationSession`; the server redirects to `webspend://signed-in#token=…` and the
  token is stored in the Keychain.
- **Developer sign-in** – shown when `GET /api/meta` reports `devAuth: true`; posts
  `{ email }` to `POST /auth/dev`.
- **Try the demo** – switches to `MockAPI`, an in-memory server seeded from
  `WebSpendKit/Sources/WebSpendKit/Preview/Fixtures.swift`. Nothing is written to disk and edits
  reset on sign out. SwiftUI previews use the same store (`AppStore.demo()`). Launching with the
  `--demo` argument (scheme argument, or `open "WebSpend Mac.app" --args --demo`) skips sign-in
  and opens the demo directly.

## Point at a server

The server address lives in `UserDefaults` and defaults to `http://localhost:8787`. Change it in
the **Server** disclosure on the sign-in screen (it is also shown under Settings). Plain `http`
to localhost is allowed through `NSAllowsLocalNetworking`; any other host must use `https`.

The Mac app is not sandboxed, so it can reach any host. The simulator shares the Mac's network,
so `localhost` reaches a server running on the same machine.

## Layout of the app sources

- `App/` – `@main`, the root view, the iPhone tab bar and the Mac split view.
- `Store/AppStore.swift` – `@Observable` session and data loading for every screen.
- `Screens/` – SignIn, Summary, Activity (iPhone) / TransactionsTable (Mac), TransactionDetail,
  Categories, Accounts, Import, Settings.
- `Components/` – theme tokens from `shared/DESIGN.md`, hero card, category bars, rows, pills,
  switches, month navigation, status pills, load / empty / error states.

## Session storage in unsigned builds

The session token lives in the Keychain. A build made without a signing team (as `xcodebuild`
does here) has no keychain entitlement, so the Keychain refuses the write; in that case the token
falls back to `UserDefaults` so developer builds can still sign in. Signed builds never take the
fallback.
