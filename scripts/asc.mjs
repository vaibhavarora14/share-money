#!/usr/bin/env node

/**
 * App Store Connect API Helper for Antigravity & CI
 * Uses Apple API key (~/.appstoreconnect/private_keys/AuthKey_*.p8) to communicate
 * with App Store Connect REST API without requiring browser sessions or 2FA.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import https from 'https';

const APP_ID = process.env.APP_STORE_APP_ID || '6755923591';
const ISSUER_ID = process.env.APP_STORE_CONNECT_API_KEY_ISSUER_ID || '79c754e7-bf1d-488d-af46-225a13d01491';

// Auto-detect .p8 private key in standard location
function resolvePrivateKey() {
  if (process.env.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH && fs.existsSync(process.env.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH)) {
    const keyFile = process.env.APP_STORE_CONNECT_API_KEY_KEY_FILEPATH;
    const keyId = process.env.APP_STORE_CONNECT_API_KEY_KEY_ID || path.basename(keyFile).replace(/^AuthKey_/, '').replace(/\.p8$/, '');
    return { keyId, privateKey: fs.readFileSync(keyFile, 'utf8') };
  }

  const keysDir = path.join(os.homedir(), '.appstoreconnect', 'private_keys');
  if (fs.existsSync(keysDir)) {
    const files = fs.readdirSync(keysDir).filter(f => f.startsWith('AuthKey_') && f.endsWith('.p8'));
    if (files.length > 0) {
      const file = files[0];
      const keyId = file.replace(/^AuthKey_/, '').replace(/\.p8$/, '');
      return { keyId, privateKey: fs.readFileSync(path.join(keysDir, file), 'utf8') };
    }
  }

  throw new Error('No App Store Connect .p8 key found in ~/.appstoreconnect/private_keys/');
}

function base64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function generateJwt(keyId, privateKey) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER_ID,
    exp: now + 1200, // 20 minutes
    aud: 'appstoreconnect-v1',
  };

  const tokenInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const sign = crypto.createSign('SHA256');
  sign.update(tokenInput);
  sign.end();
  const signature = sign
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${tokenInput}.${signature}`;
}

async function request(endpoint, method = 'GET', data = null) {
  const { keyId, privateKey } = resolvePrivateKey();
  const token = generateJwt(keyId, privateKey);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.appstoreconnect.apple.com',
      path: endpoint,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Antigravity-ASC',
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : {} });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function getStatus() {
  const app = await request(`/v1/apps/${APP_ID}`);
  if (app.status !== 200) {
    console.error('Failed to get app:', app);
    return;
  }

  const appAttr = app.data.data.attributes;
  console.log(`📱 App: ${appAttr.name}`);
  console.log(`📦 Bundle ID: ${appAttr.bundleId}`);
  console.log(`🆔 Apple App ID: ${APP_ID}`);

  const versions = await request(`/v1/apps/${APP_ID}/appStoreVersions?include=build,appStoreReviewDetail`);
  console.log('\n📋 App Store Versions:');
  for (const v of versions.data.data || []) {
    console.log(`\n• Version: ${v.attributes.versionString}`);
    console.log(`  State: ${v.attributes.appStoreState}`);
    console.log(`  Platform: ${v.attributes.platform}`);
    console.log(`  Version ID: ${v.id}`);
  }

  if (versions.data.included) {
    const reviewDetails = versions.data.included.filter(i => i.type === 'appStoreReviewDetails');
    for (const rd of reviewDetails) {
      console.log('\n📝 Review Information:');
      console.log(JSON.stringify(rd.attributes, null, 2));
    }

    const builds = versions.data.included.filter(i => i.type === 'builds');
    for (const b of builds) {
      console.log('\n🚀 Attached Build:');
      console.log(`  Build Number: ${b.attributes.version}`);
      console.log(`  Processing State: ${b.attributes.processingState}`);
      console.log(`  Uploaded: ${b.attributes.uploadedDate}`);
    }
  }
}

async function getBuilds(limit = 10) {
  const builds = await request(`/v1/builds?filter[app]=${APP_ID}&limit=${limit}&sort=-uploadedDate`);
  console.log(`📦 Recent iOS Builds for SharedMoney (Latest ${limit}):\n`);
  for (const b of builds.data.data || []) {
    const attr = b.attributes;
    console.log(`• Build ${attr.version} (ID: ${b.id})`);
    console.log(`  State: ${attr.processingState} | Expired: ${attr.expired}`);
    console.log(`  Uploaded: ${attr.uploadedDate}`);
    console.log(`  Min OS: ${attr.minOsVersion}`);
  }
}

async function getSubmissions() {
  const res = await request(`/v1/reviewSubmissions?filter[app]=${APP_ID}&include=items`);
  console.log('📋 Review Submissions:');
  console.log(JSON.stringify(res.data, null, 2));
}

async function attachBuild(buildId, versionId = '17aba419-24c1-44f6-96bb-a67f8039d53b') {
  console.log(`Linking Build ID ${buildId} to Version ${versionId}...`);
  const res = await request(`/v1/appStoreVersions/${versionId}/relationships/build`, 'PATCH', {
    data: {
      type: 'builds',
      id: buildId
    }
  });
  console.log(`Response status: ${res.status}`);
  if (res.status === 204 || res.status === 200) {
    console.log('✅ Successfully attached build to App Store Version!');
  } else {
    console.error('❌ Failed to attach build:', res.data || res.raw);
  }
}

async function submitForReview(versionId = '17aba419-24c1-44f6-96bb-a67f8039d53b') {
  console.log(`Submitting Version ${versionId} for App Review...`);
  // First check if a reviewSubmission exists in state 'READY_FOR_REVIEW' or 'WAITING_FOR_REVIEW'
  const submissions = await request(`/v1/reviewSubmissions?filter[app]=${APP_ID}`);
  console.log('Existing review submissions:', JSON.stringify(submissions.data, null, 2));

  // Try creating a new review submission if needed
  let submissionId = null;
  const existing = submissions.data?.data?.find(s => s.attributes.state === 'READY_FOR_REVIEW');
  if (existing) {
    submissionId = existing.id;
    console.log(`Found existing submission in READY_FOR_REVIEW: ${submissionId}`);
  } else {
    console.log('Creating new review submission...');
    const createSub = await request(`/v1/reviewSubmissions`, 'POST', {
      data: {
        type: 'reviewSubmissions',
        attributes: {
          platform: 'IOS'
        },
        relationships: {
          app: {
            data: {
              type: 'apps',
              id: APP_ID
            }
          }
        }
      }
    });
    console.log('Create submission response:', createSub.status, JSON.stringify(createSub.data, null, 2));
    if (createSub.status === 201) {
      submissionId = createSub.data.data.id;
    } else {
      submissionId = submissions.data?.data?.[0]?.id;
    }
  }

  if (submissionId) {
    // Add version item to submission if not already added
    console.log(`Adding version ${versionId} to review submission ${submissionId}...`);
    const addItem = await request(`/v1/reviewSubmissionItems`, 'POST', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: {
            data: {
              type: 'reviewSubmissions',
              id: submissionId
            }
          },
          appStoreVersion: {
            data: {
              type: 'appStoreVersions',
              id: versionId
            }
          }
        }
      }
    });
    console.log('Add item response:', addItem.status, JSON.stringify(addItem.data, null, 2));

    // Submit the review submission
    console.log(`Finalizing submission ${submissionId}...`);
    const finalize = await request(`/v1/reviewSubmissions/${submissionId}`, 'PATCH', {
      data: {
        type: 'reviewSubmissions',
        id: submissionId,
        attributes: {
          submitted: true
        }
      }
    });
    console.log('Finalize response:', finalize.status, JSON.stringify(finalize.data, null, 2));
    if (finalize.status === 200) {
      console.log('🎉 SUCCESSFULLY SUBMITTED TO APP STORE REVIEW!');
    }
  }
}

const command = process.argv[2] || 'status';

switch (command) {
  case 'status':
    await getStatus();
    break;
  case 'builds':
    await getBuilds(parseInt(process.argv[3] || '10', 10));
    break;
  case 'review-notes':
    await getReviewNotes();
    break;
  case 'submissions':
    await getSubmissions();
    break;
  case 'attach-build':
    await attachBuild(process.argv[3], process.argv[4]);
    break;
  case 'submit':
    await submitForReview(process.argv[3]);
    break;
  default:
    console.log('Usage: node scripts/asc.mjs [status|builds|review-notes|submissions|attach-build <buildId>|submit]');
    break;
}

