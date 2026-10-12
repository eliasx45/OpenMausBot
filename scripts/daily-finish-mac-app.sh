#!/bin/sh
# OpenMausBot Dev (elias/daily only), run by `pnpm package:mac:daily` after
# electron-builder. electron-builder merges `protocols` from the parent
# config, so the openmausbot:// URL type is dropped here (links stay with the
# released app); then the bundle is ad-hoc signed, since an unsigned arm64
# app does not launch. Never notarized.
set -eu
APP="release/mac-arm64/OpenMausBot Dev.app"
/usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes" "$APP/Contents/Info.plist" 2>/dev/null || true
codesign --force --deep --sign - --options runtime --entitlements build/entitlements.mac.plist "$APP"
codesign --verify --deep --strict "$APP"
echo "ready: $APP"
