#!/bin/bash
# Full mac packaging pipeline: clean build -> electron-builder -> ad-hoc sign -> verify -> rename to 昔漣桌寵.app.
# No Developer ID on this machine, so we deliberately skip electron-builder's own signing
# (CSC_IDENTITY_AUTO_DISCOVERY=false) and ad-hoc sign ourselves afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf release
npm run build

CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64

APP_DIR="release/mac-arm64"
BUILT_APP="$APP_DIR/Agent.app"
FINAL_APP="$APP_DIR/昔漣桌寵.app"

if [ ! -d "$BUILT_APP" ]; then
  echo "error: expected $BUILT_APP after electron-builder run" >&2
  exit 1
fi

codesign --deep --force --sign - "$BUILT_APP"
mv "$BUILT_APP" "$FINAL_APP"
codesign --verify --deep --strict "$FINAL_APP"

echo "packaged: $FINAL_APP"
