#!/bin/bash
# This script is used to deploy apk and notify us

set -e

./scripts/ci/add_ssh_key.sh
export APK_URL=$(node scripts/ci/push_artifact.js src/targets/mobile/platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk)
yarn run cozy-ci-github "🎁 [Click here]($APK_URL) to download the latest Android APK"
./scripts/ci/mattermost_comment.sh