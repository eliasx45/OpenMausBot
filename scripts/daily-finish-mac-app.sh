#!/bin/sh
# OpenMausBot Dev (elias/daily only), run by `pnpm package:mac:daily` after
# electron-builder. electron-builder merges `protocols` from the parent
# config, so the openmausbot:// URL type is dropped here (links stay with the
# released app); then the bundle is signed. Never notarized.
#
# macOS keys privacy grants (Full Disk Access, Files and Folders) to the
# app's designated requirement. An ad-hoc signature's requirement is its
# code hash, which changes on every build, so each rebuild silently lost
# Full Disk Access. A certificate's requirement is bundle id + team id,
# which stays the same across builds. So this refuses to ad-hoc sign.
# OMB_DEV_SIGN_IDENTITY overrides the identity (a name or SHA-1 hash).
set -eu
APP="release/mac-arm64/OpenMausBot Dev.app"
IDENTITY="${OMB_DEV_SIGN_IDENTITY:-$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -n 1)}"
if [ -z "$IDENTITY" ] || [ "$IDENTITY" = "-" ]; then
  echo "error: no stable code-signing identity. An ad-hoc signed Dev app loses Full Disk Access on every rebuild." >&2
  echo "Install an Apple Development certificate (Xcode > Settings > Accounts) or set OMB_DEV_SIGN_IDENTITY." >&2
  exit 1
fi
/usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes" "$APP/Contents/Info.plist" 2>/dev/null || true
codesign --force --deep --sign "$IDENTITY" --options runtime --entitlements build/entitlements.mac.plist "$APP"
codesign --verify --deep --strict "$APP"
# the grant survives only if the requirement names a certificate, not a code hash
REQUIREMENT="$(codesign -d -r- "$APP" 2>&1 | grep '^designated')"
case "$REQUIREMENT" in
  *cdhash*|"") echo "error: $APP has a code-hash requirement; Full Disk Access would reset on the next build." >&2; echo "$REQUIREMENT" >&2; exit 1 ;;
  *"anchor apple generic"*) ;;
  *) echo "error: $APP is not signed by an Apple-issued certificate." >&2; echo "$REQUIREMENT" >&2; exit 1 ;;
esac
echo "ready: $APP (signed by $IDENTITY)"
