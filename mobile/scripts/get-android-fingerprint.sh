#!/bin/bash

# Script to get Android SHA256 fingerprint for App Links
# This helps populate the assetlinks.json file

echo "🔍 Getting Android SHA256 Fingerprint"
echo "======================================"
echo ""

# Try to get from EAS credentials
echo "Attempting to get from EAS credentials..."
echo ""

if command -v eas &> /dev/null; then
    echo "Running: eas credentials --platform android"
    echo "Select 'Production' when prompted, then look for 'SHA256' in the output"
    echo ""
    eas credentials --platform android
else
    echo "❌ EAS CLI not found. Install it with: npm install -g eas-cli"
    echo ""
fi

echo ""
echo "Alternative methods:"
echo "1. Check EAS Dashboard: https://expo.dev/accounts/share-money/projects/share-money/credentials"
echo "   → Select Android > Production credentials"
echo "   → Copy the SHA256 fingerprint"
echo ""
echo "2. For local debug builds:"
echo "   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA256"
echo ""
echo "3. Once you have the fingerprint, update:"
echo "   mobile/public/.well-known/assetlinks.json"
echo "   Replace 'YOUR_APP_SHA256_FINGERPRINT' with the actual value"
echo ""

