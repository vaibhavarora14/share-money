# Supabase Cloudflare Proxy

This Cloudflare Worker proxies requests to a Supabase instance, useful for bypassing regional network blocks (e.g., in India).

## Deployment

1. **Install Wrangler**: `npm install -g wrangler`
2. **Login**: `wrangler login`
3. **Configure**: Update `wrangler.toml` with your project details or use secrets.
4. **Set Secret**: `wrangler secret put SUPABASE_URL` (Enter your original Supabase URL).
5. **Deploy**: `wrangler deploy`

## Usage in App

Use the deployed worker URL as the `EXPO_PUBLIC_SUPABASE_PROXY_URL` in your `.env` file.
