#!/usr/bin/env node

const appUrl = process.env.SHAREDMONEY_APP_URL ?? 'https://sharedmoney.app/app';
const marketingUrl = process.env.SHAREDMONEY_MARKETING_URL ?? 'https://sharedmoney.app';
const expectedBrand = process.env.EXPECTED_GOOGLE_BRAND ?? 'SharedMoney';
const expectedAuthHost = process.env.EXPECTED_SUPABASE_AUTH_HOST;
const skipMarketingCheck = process.env.SKIP_MARKETING_CHECK === '1';

const errors = [];

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  return { response, text };
}

function fail(message) {
  errors.push(message);
}

function absoluteUrl(pathOrUrl, base) {
  return new URL(pathOrUrl, base).toString();
}

function findSupabaseHost(bundleText) {
  const hosts = new Set();
  for (const match of bundleText.matchAll(/https:\/\/([a-z0-9-]+\.supabase\.co|[a-z0-9.-]+)\b/gi)) {
    hosts.add(match[1].toLowerCase());
  }

  if (expectedAuthHost && hosts.has(expectedAuthHost.toLowerCase())) {
    return expectedAuthHost.toLowerCase();
  }

  return [...hosts].find((host) => host.endsWith('.supabase.co')) ?? [...hosts][0];
}

function googlePageMentionsBrand(pageText) {
  return pageText.toLowerCase().includes(expectedBrand.toLowerCase());
}

function getVisibleGoogleAppName(pageText) {
  const dataAppNameMatch = pageText.match(/data-app-name="([^"]+)"/);
  if (dataAppNameMatch) {
    return dataAppNameMatch[1];
  }

  const subtextMatch = pageText.match(/id="headingSubtext"[\s\S]*?<span[^>]*>\s*to continue to\s*<button[\s\S]*?>([^<]+)<\/button>/i);
  return subtextMatch?.[1];
}

console.log(`Checking Google OAuth branding path for ${appUrl}`);

if (!skipMarketingCheck) {
  const { response: marketingResponse, text: marketingHtml } = await fetchText(marketingUrl);
  if (!marketingResponse.ok) {
    fail(`Marketing page returned HTTP ${marketingResponse.status}`);
  }

  if (!new RegExp(`<h1[^>]*>\\s*${expectedBrand}\\s*<`, 'i').test(marketingHtml)) {
    fail(`Marketing page first heading is not visibly branded as ${expectedBrand}`);
  }
}

const { response: appResponse, text: appHtml } = await fetchText(appUrl);
if (!appResponse.ok) {
  fail(`App page returned HTTP ${appResponse.status}`);
}

const scriptUrls = [...appHtml.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/gi)]
  .map((match) => absoluteUrl(match[1], appUrl));

if (scriptUrls.length === 0) {
  fail('Could not find deployed app JavaScript bundle');
}

let bundleText = '';
for (const scriptUrl of scriptUrls) {
  const { response, text } = await fetchText(scriptUrl);
  if (response.ok) {
    bundleText += `\n${text}`;
  }
}

const deployedAuthHost = findSupabaseHost(bundleText);
if (!deployedAuthHost) {
  fail('Could not find the deployed Supabase auth host in the app bundle');
} else {
  console.log(`Deployed Supabase auth host: ${deployedAuthHost}`);
}

if (expectedAuthHost && deployedAuthHost && deployedAuthHost !== expectedAuthHost.toLowerCase()) {
  fail(`Expected deployed auth host ${expectedAuthHost}, found ${deployedAuthHost}`);
}

if (deployedAuthHost) {
  const authorizeUrl = new URL(`https://${deployedAuthHost}/auth/v1/authorize`);
  authorizeUrl.searchParams.set('provider', 'google');
  authorizeUrl.searchParams.set('redirect_to', appUrl);

  const response = await fetch(authorizeUrl, { redirect: 'manual' });
  const location = response.headers.get('location');

  if (!location) {
    fail(`Supabase authorize endpoint did not redirect to Google; HTTP ${response.status}`);
  } else {
    const googleUrl = new URL(location);
    const callbackUrl = googleUrl.searchParams.get('redirect_uri');
    const callbackHost = callbackUrl ? new URL(callbackUrl).host : null;

    console.log(`Google OAuth client_id: ${googleUrl.searchParams.get('client_id') ?? '(missing)'}`);
    console.log(`Google OAuth redirect_uri host: ${callbackHost ?? '(missing)'}`);

    if (expectedAuthHost && callbackHost !== expectedAuthHost.toLowerCase()) {
      fail(`Expected Google redirect_uri host ${expectedAuthHost}, found ${callbackHost ?? '(missing)'}`);
    }

    const { response: googleResponse, text: googleHtml } = await fetchText(googleUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    });

    if (!googleResponse.ok) {
      fail(`Google OAuth page returned HTTP ${googleResponse.status}`);
    } else {
      const visibleAppName = getVisibleGoogleAppName(googleHtml);

      if (!visibleAppName) {
        fail('Could not find the visible app name on the Google OAuth page');
      } else {
        console.log(`Google OAuth visible app name: ${visibleAppName}`);
      }

      if (visibleAppName !== expectedBrand) {
        fail(`Expected Google OAuth visible app name ${expectedBrand}, found ${visibleAppName ?? '(missing)'}`);
      }

      if (!googlePageMentionsBrand(googleHtml)) {
        fail(`Google OAuth page does not include ${expectedBrand} in its app metadata`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('\nGoogle branding verification failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('\nGoogle branding verification passed.');
