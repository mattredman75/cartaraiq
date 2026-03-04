#!/bin/bash
set -e
# EAS calls: bash scripts/prebuild.sh --platform ios
# We forward all args to expo prebuild, then patch the Podfile.
npx expo prebuild --no-install "$@"
node scripts/fix-podfile.js
