#!/usr/bin/env bash
# Builds the Mac app in Release, signed to run locally, and wraps it in a DMG under apple/build/dist.
#
#   ./scripts/make-dmg.sh
#
# The app is ad-hoc signed, so it opens on this Mac without a developer team. Another Mac will
# show the Gatekeeper warning unless the app is signed with a Developer ID and notarised.
#
# It builds under /tmp on purpose: files written inside the home folder get a
# `com.apple.provenance` attribute that codesign rejects and `xattr` cannot remove.
set -euo pipefail
cd "$(dirname "$0")/.."

DERIVED=$(mktemp -d /tmp/webspend-mac.XXXXXX)
OUT=apple/build/dist
APP="$DERIVED/Build/Products/Release/WebSpend Mac.app"

xcodebuild -project apple/WebSpend.xcodeproj -scheme "WebSpend Mac" -configuration Release \
  -destination 'platform=macOS,arch=arm64' -derivedDataPath "$DERIVED" -quiet build

version=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP/Contents/Info.plist")
stage=$(mktemp -d /tmp/webspend-dmg.XXXXXX)
ditto --norsrc --noextattr --noqtn "$APP" "$stage/WebSpend.app"
codesign --force --deep --sign - "$stage/WebSpend.app"
codesign --verify --deep --strict "$stage/WebSpend.app"
ln -s /Applications "$stage/Applications"

mkdir -p "$OUT"
dmg="$OUT/WebSpend-$version.dmg"
rm -f "$dmg"
hdiutil create -volname "WebSpend" -srcfolder "$stage" -ov -format UDZO "$dmg" >/dev/null
rm -rf "$stage" "$DERIVED"
echo "$dmg"
