#!/usr/bin/env bash
# Builds the iPhone app into an .ipa for sideloading with AltStore, which re-signs it with your
# own Apple ID and refreshes it over Wi-Fi before the free seven-day profile runs out.
#
#   ./scripts/make-ipa.sh            -> apple/build/dist/WebSpend-<version>.ipa
#
# Then: AltServer menu bar icon > Sideload .ipa… > pick the file (phone plugged in the first
# time), or AirDrop the file to the phone and open it with AltStore.
set -euo pipefail
cd "$(dirname "$0")/.."
TEAM_ID=${TEAM_ID:-ZXBK8A5W5C} # Nwafor Uchechukwu (Personal Team)

version=$(sed -n 's/.*MARKETING_VERSION = \([0-9.]*\);.*/\1/p' apple/WebSpend.xcodeproj/project.pbxproj | head -1)
out="apple/build/dist/WebSpend-${version:-0.1.0}.ipa"
mkdir -p apple/build/dist

# Built outside the home folder: files written there pick up an extended attribute that
# codesign rejects (see make-dmg.sh).
derived=$(mktemp -d /tmp/webspend-ipa.XXXXXX)
trap 'rm -rf "$derived"' EXIT

xcodebuild -project apple/WebSpend.xcodeproj -scheme "WebSpend" -configuration Release \
  -destination "generic/platform=iOS" -derivedDataPath "$derived" -allowProvisioningUpdates -quiet \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES build

# An .ipa is a zip with the app under Payload/. AltStore replaces the signature, so the one
# from the build only has to be valid, not long-lived.
mkdir -p "$derived/Payload"
ditto --norsrc --noextattr --noqtn "$derived/Build/Products/Release-iphoneos/WebSpend.app" "$derived/Payload/WebSpend.app"
rm -f "$out"
(cd "$derived" && zip -qry "$OLDPWD/$out" Payload)
echo "$out"
