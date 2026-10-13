#!/usr/bin/env bash
# Sign a macOS .app with a Developer ID certificate (hardened runtime, timestamped, nested helpers/frameworks included),
# then optionally notarize and staple it. Secrets are read from files named by environment variables; nothing is embedded.
#
#   MAC_SIGN_KEY=/path/devid.key      PEM private key of the "Developer ID Application" certificate
#   MAC_SIGN_CERT=/path/devid.cer     that certificate (DER)
#   MAC_NOTARY_API_KEY=/path/asc.json App Store Connect API key JSON from `rcodesign encode-app-store-connect-api-key` (optional: skips notarization if unset)
#   RCODESIGN=/path/rcodesign         default: mac/tools/rcodesign (./fetch-rcodesign.sh)
#
#   usage: ./sign-notarize.sh "out/<App>-darwin-arm64/<App>.app"
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
APP=${1:?usage: sign-notarize.sh <path to .app>}
RC=${RCODESIGN:-$HERE/tools/rcodesign}
: "${MAC_SIGN_KEY:?set MAC_SIGN_KEY}" "${MAC_SIGN_CERT:?set MAC_SIGN_CERT}"
ENT=${MAC_ENTITLEMENTS:-$HERE/build/entitlements.plist}
"$RC" sign --for-notarization --code-signature-flags runtime \
  --pem-file "$MAC_SIGN_KEY" --certificate-der-file "$MAC_SIGN_CERT" \
  --entitlements-xml-file "$ENT" "$APP" >/dev/null 2>"$HERE/rcodesign-sign.log" || { echo "signing failed: see $HERE/rcodesign-sign.log" >&2; exit 1; }
echo "signed: $APP"
if [ -n "${MAC_NOTARY_API_KEY:-}" ]; then
  "$RC" notary-submit --api-key-file "$MAC_NOTARY_API_KEY" --wait --staple "$APP" 2>&1 | grep -viE "token|authorization" | tee "$HERE/rcodesign-notary.log" | grep -iE "submission ID|status|stapl|accepted|invalid|error" || true
  grep -qi "Accepted" "$HERE/rcodesign-notary.log" || { echo "notarization not accepted: see $HERE/rcodesign-notary.log" >&2; exit 1; }
fi
