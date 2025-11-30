#!/bin/bash

# Build script for creating production APK for GitHub releases
# 
# This script:
# 1. Builds a production Android APK using EAS
# 2. Finds and renames the APK with version info
# 3. Provides instructions for creating a GitHub release

set -e

echo "🔨 Building ShareMoney Android Production APK for Release"
echo "=========================================================="
echo ""

# Check if .env.production file exists
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production file not found!"
    echo "Please create a .env.production file with EXPO_PUBLIC_* variables"
    exit 1
fi

echo "📋 Loading environment variables from .env.production..."
echo ""

# Load .env.production file and export variables
export $(grep -v '^#' .env.production | grep '^EXPO_PUBLIC_' | xargs)

# For production builds, don't set dev client flag
unset EXPO_PUBLIC_USE_DEV_CLIENT

# Verify required variables are set
if [ -z "$EXPO_PUBLIC_SUPABASE_URL" ] || [ -z "$EXPO_PUBLIC_SUPABASE_ANON_KEY" ]; then
    echo "❌ Error: Required environment variables not found in .env"
    echo "Please ensure .env contains:"
    echo "  EXPO_PUBLIC_SUPABASE_URL"
    echo "  EXPO_PUBLIC_SUPABASE_ANON_KEY"
    exit 1
fi

echo "✅ Environment variables loaded"
echo "   EXPO_PUBLIC_SUPABASE_URL: ${EXPO_PUBLIC_SUPABASE_URL:0:30}..."
echo "   EXPO_PUBLIC_SUPABASE_ANON_KEY: ${EXPO_PUBLIC_SUPABASE_ANON_KEY:0:20}..."
if [ ! -z "$EXPO_PUBLIC_API_URL" ]; then
    echo "   EXPO_PUBLIC_API_URL: $EXPO_PUBLIC_API_URL"
fi
echo ""

# Read version from version.json
VERSION=$(node -p "require('./version.json').version")
BUILD=$(node -p "require('./version.json').buildNumber")
TAG="v${VERSION}"

echo "📦 Version: ${VERSION} (Build ${BUILD})"
echo "🏷️  Tag: ${TAG}"
echo ""

# Set Java and Android SDK paths (for macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    export JAVA_HOME=$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home
    export PATH="$JAVA_HOME/bin:$PATH"
    export ANDROID_HOME=$HOME/Library/Android/sdk
    export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH"
fi

echo "🚀 Starting EAS production build..."
echo ""

# Run the build with environment variables
eas build --local --profile production

echo ""
echo "🔍 Finding built APK..."

# Find the APK file (EAS typically puts it in a build directory or current directory)
APK_FILE=$(find . -name "*.apk" -type f -not -path "*/node_modules/*" | head -1)

if [ -z "$APK_FILE" ]; then
    echo "❌ Error: APK file not found after build"
    echo "Please check the build output for errors"
    exit 1
fi

# Create releases directory if it doesn't exist
mkdir -p ../releases

# Rename and copy APK
RELEASE_APK="../releases/sharemoney-${VERSION}.apk"
cp "$APK_FILE" "$RELEASE_APK"

echo "✅ APK ready for release: $RELEASE_APK"
echo ""
echo "📝 Next steps to create GitHub release:"
echo ""
echo "1. Create a git tag:"
echo "   git tag ${TAG}"
echo "   git push origin ${TAG}"
echo ""
echo "2. Go to GitHub and create a release:"
echo "   https://github.com/vaibhavarora14/share-money/releases/new"
echo ""
echo "3. Select tag: ${TAG}"
echo "4. Title: Release ${TAG}"
echo "5. Description:"
echo "   ## ShareMoney ${VERSION}"
echo "   "
echo "   Build Number: ${BUILD}"
echo "   "
echo "   ### Installation"
echo "   1. Download the APK file below"
echo "   2. Enable \"Install from unknown sources\" on your Android device"
echo "   3. Install the APK"
echo "   "
echo "   ### Changes"
echo "   See [CHANGELOG.md](../CHANGELOG.md) for details."
echo ""
echo "6. Upload the APK file: $RELEASE_APK"
echo "7. Click 'Publish release'"
echo ""
