#!/usr/bin/env bash
# Download rcodesign (apple-codesign, by Gregory Szorc) for Linux x86_64 into mac/tools/. Used by build.sh to ad-hoc sign the .app bundles.
# Not committed to the repo. On macOS you can skip this and sign with: codesign --force --deep -s - "Architect's Desk.app"
set -euo pipefail
cd "$(dirname "$0")"
V=0.29.0
SHA=dbe85cedd8ee4217b64e9a0e4c2aef92ab8bcaaa41f20bde99781ff02e600002
URL="https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign%2F$V/apple-codesign-$V-x86_64-unknown-linux-musl.tar.gz"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/rc.tgz" "$URL"
echo "$SHA  $tmp/rc.tgz" | sha256sum -c -
tar -xzf "$tmp/rc.tgz" -C "$tmp"
mkdir -p tools && install -m 0755 "$tmp/apple-codesign-$V-x86_64-unknown-linux-musl/rcodesign" tools/rcodesign
tools/rcodesign --version
