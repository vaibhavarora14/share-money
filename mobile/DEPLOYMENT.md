# Web Deployment Guide

This guide explains how to deploy the ShareMoney web app to different environments using Expo's EAS Hosting.

## Overview

Expo EAS Hosting supports multiple deployments using **aliases**. Each deployment gets its own unique URL, allowing you to maintain separate dev, preview, and production environments.

## Deployment Commands

### Production
```bash
cd mobile
npm run deploy:web
```

This deploys to: `https://share-money.expo.app` (or your custom production domain)

### Development
```bash
cd mobile
npm run deploy:web:dev
```

This deploys to: `https://share-money--development.expo.app` (or your custom dev domain)

### Preview
```bash
cd mobile
npm run deploy:web:preview
```

This deploys to: `https://share-money--preview.expo.app` (or your custom preview domain)

## How It Works

1. **Export**: `npx expo export -p web` creates a static build in the `dist/` directory
2. **Deploy**: `npx eas deploy` uploads the build to EAS Hosting
3. **Alias**: `--alias <name>` creates a separate deployment with its own URL
4. **Production**: `--prod` flag deploys to the default production URL

## Environment Variables

Each deployment can use different environment variables:

### Setting Environment Variables

**For EAS Builds/Deployments:**
```bash
# Production
eas secret:create --scope project --name EXPO_PUBLIC_APP_URL --value https://share-money.expo.app --type string

# Development (if needed)
eas secret:create --scope project --name EXPO_PUBLIC_APP_URL_DEV --value https://share-money--development.expo.app --type string
```

**For Local Development:**
Create a `.env` file in the `mobile/` directory:
```bash
EXPO_PUBLIC_APP_URL=https://share-money.expo.app
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Custom Domains

You can configure custom domains for each deployment:

1. Go to: https://expo.dev/accounts/share-money/projects/share-money/hosting
2. Select the deployment (production, development, or preview)
3. Click "Add Domain" and follow the DNS configuration instructions

Example:
- Production: `https://sharemoney.com`
- Development: `https://dev.sharemoney.com`
- Preview: `https://preview.sharemoney.com`

## Universal Links / App Links

**Important:** Universal Links and App Links are typically configured for production only. The mobile app's `associatedDomains` (iOS) and `intentFilters` (Android) point to the production domain.

If you need Universal Links/App Links to work with dev/preview URLs:
1. Set `EXPO_PUBLIC_APP_URL` to the dev/preview URL before building
2. Rebuild the mobile apps (the app config reads from `EXPO_PUBLIC_APP_URL`)
3. Update the verification files (`.well-known/apple-app-site-association` and `assetlinks.json`) on the dev/preview domain

## Viewing Deployments

Check your deployments at:
- **Dashboard**: https://expo.dev/accounts/share-money/projects/share-money/hosting
- **Deployments**: Lists all deployments with their URLs and aliases

## Troubleshooting

### Files not appearing in deployment
If `.well-known` files aren't included:
```bash
# After export, manually copy if needed
cp -r mobile/public/.well-known mobile/dist/
```

### Environment variables not working
- Ensure variables start with `EXPO_PUBLIC_` prefix
- Rebuild/redeploy after changing environment variables
- Check variable scope (project vs. account level)

### Custom domain not working
- Verify DNS records are correctly configured
- Wait for DNS propagation (can take up to 48 hours)
- Check SSL certificate status in EAS dashboard

