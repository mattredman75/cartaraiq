#!/bin/bash
set -e
# EAS calls: bash scripts/prebuild.sh --platform ios
# We forward all args to expo prebuild
# Note: Podfile patching is now handled entirely by withCartaraIQWidget plugin
npx expo prebuild --no-install "$@"
