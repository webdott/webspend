#!/usr/bin/env bash
# Archives the iPhone app and uploads it to TestFlight.
#
#   ./scripts/ship-ios.sh                 # the personal team below
#   TEAM_ID=XXXXXXXXXX ./scripts/ship-ios.sh
#
# The app is tied to the personal Apple ID, never the company team. Before the first upload:
# - That Apple ID must be enrolled in the paid Apple Developer Program. A free Personal Team can
#   archive and install on a connected iPhone (ARCHIVE_ONLY=1), but TestFlight refuses it.
# - Xcode must be signed in to that Apple ID (Xcode > Settings > Accounts), so automatic signing
#   can create the distribution certificate and the App Store profile.
# - App Store Connect needs an app record for dev.webdott.webspend (Apps > + > New App).
set -euo pipefail
cd "$(dirname "$0")/.."
TEAM_ID=${TEAM_ID:-ZXBK8A5W5C} # Nwafor Uchechukwu (Personal Team)

DERIVED=apple/build/DerivedData
ARCHIVE=apple/build/WebSpend.xcarchive
EXPORT=apple/build/export
BUILD_NUMBER=${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}

xattr -cr apple/WebSpend apple/WebSpendKit 2>/dev/null || true
find apple/WebSpend apple/WebSpendKit -name .DS_Store -delete 2>/dev/null || true

xcodebuild -project apple/WebSpend.xcodeproj -scheme "WebSpend" -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath "$DERIVED" -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates -quiet \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  archive

if [ "${ARCHIVE_ONLY:-}" = "1" ]; then
  echo "Archived build $BUILD_NUMBER at $ARCHIVE (not uploaded)."
  exit 0
fi

sed "s/TEAM_ID_PLACEHOLDER/$TEAM_ID/" apple/ExportOptions.plist > "$DERIVED/ExportOptions.plist"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$DERIVED/ExportOptions.plist" \
  -exportPath "$EXPORT" -allowProvisioningUpdates -quiet

echo "Build $BUILD_NUMBER uploaded. It shows under TestFlight in App Store Connect once processed."
