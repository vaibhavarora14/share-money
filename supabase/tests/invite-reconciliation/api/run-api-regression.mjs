const API_URL = process.env.API_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.ANON_KEY || process.env.PUBLISHABLE_KEY;
const TEST_PASSWORD = process.env.INVITE_TEST_PASSWORD || "testpassword123";

if (!ANON_KEY) {
  throw new Error("ANON_KEY or PUBLISHABLE_KEY is required to run API regression tests.");
}

const bobEmail = "bob@test.com";
const dianaEmail = "diana@test.com";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {
    apikey: ANON_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  let payload = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = responseText;
    }
  }

  return { response, payload };
}

async function signIn(email, password) {
  const { response, payload } = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });

  if (!response.ok || !payload?.access_token) {
    throw new Error(`Failed to sign in ${email}: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.access_token;
}

async function createGroup(token, name) {
  const { response, payload } = await request("/functions/v1/groups", {
    method: "POST",
    token,
    body: { name, description: "Invite regression API test group" },
  });

  if (!response.ok || !payload?.id) {
    throw new Error(`Failed to create group: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.id;
}

async function createInvitation(token, groupId, email) {
  const { response, payload } = await request("/functions/v1/invitations", {
    method: "POST",
    token,
    body: { group_id: groupId, email },
  });

  if (!response.ok || !payload?.id) {
    throw new Error(`Failed to create invitation: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.id;
}

async function reconcileInvites(token) {
  const { response, payload } = await request("/functions/v1/invitations/reconcile", {
    method: "POST",
    token,
  });

  if (!response.ok || payload?.success !== true) {
    throw new Error(`Failed to reconcile invitations: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function acceptInvite(token, invitationId) {
  const { response, payload } = await request(`/functions/v1/invitations/${invitationId}/accept`, {
    method: "POST",
    token,
  });

  if (!response.ok || payload?.success !== true) {
    throw new Error(`Failed to accept invitation: ${response.status} ${JSON.stringify(payload)}`);
  }
}

async function listGroups(token) {
  const { response, payload } = await request("/functions/v1/groups", { token });
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(`Failed to list groups: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function assertGroupVisible(token, groupId, contextLabel) {
  for (let i = 0; i < 5; i += 1) {
    const groups = await listGroups(token);
    if (groups.some((group) => group.id === groupId)) return;
    await sleep(400);
  }
  throw new Error(`Expected group ${groupId} to be visible after ${contextLabel}`);
}

async function run() {
  console.log("Starting invite API regression checks...");
  const bobToken = await signIn(bobEmail, TEST_PASSWORD);
  const dianaToken = await signIn(dianaEmail, TEST_PASSWORD);

  const reconcileGroupId = await createGroup(
    bobToken,
    `Invite API Reconcile ${Date.now()}`
  );
  await createInvitation(bobToken, reconcileGroupId, dianaEmail);
  const reconcileResult = await reconcileInvites(dianaToken);

  if (typeof reconcileResult.accepted_count !== "number") {
    throw new Error(`Invalid reconcile response payload: ${JSON.stringify(reconcileResult)}`);
  }
  await assertGroupVisible(dianaToken, reconcileGroupId, "reconcile endpoint");

  const acceptGroupId = await createGroup(
    bobToken,
    `Invite API Accept ${Date.now()}`
  );
  const invitationId = await createInvitation(bobToken, acceptGroupId, dianaEmail);
  await acceptInvite(dianaToken, invitationId);
  await assertGroupVisible(dianaToken, acceptGroupId, "accept endpoint");

  console.log("Invite API regression checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
