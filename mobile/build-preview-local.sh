#!/bin/bash

# Build script that loads .env variables for local EAS builds
# 
# WHY THIS SCRIPT IS NEEDED:
# - `eas build --local` runs in a shell context and doesn't automatically load .env files
# - Unlike cloud builds (which use `node -r dotenv/config`), local builds need env vars exported to shell
# - This script loads .env variables and exports them before running the build
# - Also sets up Java 17 and Android SDK paths required for local Android builds
#
# Without this script, the build would succeed but the app would crash with "Missing Supabase credentials!"
# because environment variables wouldn't be embedded in the build.

set -e

echo "🔨 Building ShareMoney Android Preview (Local)"
echo "=============================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with EXPO_PUBLIC_* variables"
    exit 1
fi

echo "📋 Loading environment variables from .env..."
echo ""

# Load .env file and export variables
# This reads the .env file and exports all EXPO_PUBLIC_* variables
export $(grep -v '^#' .env | grep '^EXPO_PUBLIC_' | xargs)

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

# Set Java and Android SDK paths
export JAVA_HOME=$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH"

echo "🚀 Starting EAS build..."
echo ""

# Run the build with environment variables
eas build --local --platform android --profile preview

echo ""
echo "✅ Build complete!"

