#!/usr/bin/env bash
# Build Architect's Desk for macOS (arm64 + x64, unsigned) and a Linux x64 copy used only for testing.
set -euo pipefail
cd "$(dirname "$0")"
# Prerequisites: Node 20+, `npm ci` in this folder (Electron + @electron/packager), zip, and rcodesign
# (run ./fetch-rcodesign.sh once, or set RCODESIGN=/path/to/rcodesign).
RC=${RCODESIGN:-$PWD/tools/rcodesign}
[ -x "$RC" ] || { echo "rcodesign not found: run ./fetch-rcodesign.sh or set RCODESIGN" >&2; exit 1; }
[ -d node_modules/electron ] || npm ci
EV=$(node -p "require('electron/package.json').version")
rm -rf out && mkdir -p out dist
common=(app --name "Architect's Desk" --app-version 1.0.0 --build-version 1.0.0
  --app-bundle-id net.norselabs.architectdesk --app-category-type public.app-category.developer-tools
  --app-copyright "© 2026 Norselabs" --icon build/icon.icns --asar --electron-version "$EV" --out out --overwrite --prune=true)
npx @electron/packager "${common[@]}" --platform darwin --arch arm64,x64 --darwin-dark-mode-support --executable-name "Architect's Desk"
npx @electron/packager "${common[@]}" --platform linux --arch x64 --executable-name architects-desk
cd out
# Ad-hoc signature (no Apple identity) so Apple Silicon doesn't reject the modified Electron binaries as "damaged".
for a in arm64 x64; do "$RC" sign "Architect's Desk-darwin-$a/Architect's Desk.app" >/dev/null 2>../rcodesign-$a.log || { echo "rcodesign failed ($a)"; tail -5 ../rcodesign-$a.log; exit 1; }; done
for a in arm64 x64; do
  z="../dist/Architects-Desk-1.0.0-mac-$a.zip"; rm -f "$z"
  (cd "Architect's Desk-darwin-$a" && zip -qry -X "../$z" "Architect's Desk.app")
done
cd ../dist && sha256sum *.zip > SHA256SUMS.txt && cat SHA256SUMS.txt && ls -la
