#!/usr/bin/env bash
# Builds the iPhone app signed with the personal team and installs it on the connected iPhone.
#
#   ./scripts/install-iphone.sh
#
# Works with the free Personal Team: plug the iPhone in, unlock it, trust this Mac if asked, and
# turn on Developer Mode (Settings > Privacy & Security > Developer Mode). A free team's profile
# lasts seven days, so run this again when the app stops opening.
set -euo pipefail
cd "$(dirname "$0")/.."
TEAM_ID=${TEAM_ID:-ZXBK8A5W5C} # Nwafor Uchechukwu (Personal Team)

devices=$(mktemp)
xcrun devicectl list devices --json-output "$devices" >/dev/null
udid=$(python3 - "$devices" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
phones = [d for d in data["result"]["devices"] if d["hardwareProperties"]["platform"] == "iOS"]
connected = [d for d in phones if d["connectionProperties"].get("tunnelState") == "connected"] or phones
if not connected:
    sys.exit("No iPhone found. Plug it in, unlock it, and trust this Mac.")
print(connected[0]["identifier"])
PY
)
name=$(python3 -c "import json,sys; d=[x for x in json.load(open('$devices'))['result']['devices'] if x['identifier']=='$udid'][0]; print(d['deviceProperties']['name'])")
echo "Installing on $name"

derived=$(mktemp -d /tmp/webspend-ios.XXXXXX)
xcodebuild -project apple/WebSpend.xcodeproj -scheme "WebSpend" -configuration Release \
  -destination "id=$udid" -derivedDataPath "$derived" -allowProvisioningUpdates -quiet \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES build

xcrun devicectl device install app --device "$udid" "$derived/Build/Products/Release-iphoneos/WebSpend.app"
xcrun devicectl device process launch --device "$udid" dev.webdott.webspend >/dev/null 2>&1 || true
rm -rf "$derived" "$devices"
echo "Done. WebSpend is on $name."
