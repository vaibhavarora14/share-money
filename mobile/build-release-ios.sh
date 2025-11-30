#!/bin/bash

# Build script for creating production iOS build for App Store submission
# 
# This script:
# 1. Builds a production iOS app using EAS (cloud build)
# 2. Provides instructions for submitting to App Store via EAS
#
# Cloud builds avoid keychain/certificate issues and are more reliable

set -e

echo "🍎 Building ShareMoney iOS Production Build for App Store"
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

echo "☁️  Starting EAS iOS production build..."
echo ""
echo "ℹ️  Building on Expo's servers (no local keychain issues)."
echo "   The build will take 10-20 minutes."
echo "   You'll get a download link when it completes."
echo ""

# Run the cloud build (no --local flag)
eas build --platform ios --profile production

echo ""
echo "✅ Build completed! Check the output above for download link."
echo ""
echo "📝 Next steps to submit to App Store:"
echo ""
echo "Option 1: Submit via EAS (Recommended)"
echo "   eas submit --platform ios --profile production"
echo ""
echo "Option 2: Download and submit manually"
echo "   1. Download the IPA from the link above"
echo "   2. Use Transporter app or Xcode to submit"
echo ""
echo "📋 Build Information:"
echo "   Version: ${VERSION}"
echo "   Build Number: ${BUILD}"
echo "   Bundle ID: com.vaibhavarora.sharemoney"
echo ""
