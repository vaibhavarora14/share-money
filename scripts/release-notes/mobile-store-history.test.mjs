import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const historyUrl = new URL("./mobile-store-history.json", import.meta.url);
const testflightPlanUrl = new URL("./testflight-pointer-plan.json", import.meta.url);

const expectedEditableIosBuilds = [
  "72",
  "71",
  "70",
  "69",
  "68",
  "67",
  "65",
  "63",
  "62",
  "61",
  "50",
  "45",
];

const expectedLockedIosBuilds = [
  "49",
  "48",
  "42",
  "40",
  "36",
  "25",
  "21",
  "18",
  "15",
  "14",
  "13",
  "10",
  "6",
];

const expectedPlayNotes =
  "• Receive notifications after allowing Android notification access.\n" +
  "• Get reliable expense activity notifications.";

const assertPointerNotes = (notes, [minimum, maximum]) => {
  const bullets = notes.split("\n");
  assert.ok(bullets.length >= minimum && bullets.length <= maximum);
  assert.ok(bullets.every((bullet) => bullet.startsWith("• ")));
  assert.ok(bullets.every((bullet) => bullet.length <= 100));
  assert.ok(!notes.includes("\n\n"), "release notes must not contain paragraphs");
};

test("mobile store history is complete, unique, and truthful", async () => {
  const history = JSON.parse(await readFile(historyUrl, "utf8"));
  assert.equal(history.schemaVersion, 1);
  assert.equal(history.stores.length, 2);

  const identities = new Set();
  const allowedStatuses = new Set([
    "blocked",
    "pending-processing",
    "unavailable",
    "verified",
  ]);

  for (const store of history.stores) {
    assert.ok(["android", "ios"].includes(store.platform));
    assert.equal(store.locale, "en-US");
    assert.ok(store.appId);
    assert.ok(store.channel);
    assert.ok(store.verificationMethod);
    assert.ok(Array.isArray(store.releases));

    for (const release of store.releases) {
      assert.ok(release.version);
      assert.ok(Array.isArray(release.builds));
      assert.ok(release.builds.length > 0);
      assert.ok(allowedStatuses.has(release.storeStatus));
      assert.ok(release.storeUrl);

      if (release.storeStatus === "verified") {
        assert.ok(release.notes);
        assert.match(release.verifiedAt, /^\d{4}-\d{2}-\d{2}T/);
        const bounds = store.platform === "android" ? [2, 5] : [2, 6];
        assertPointerNotes(release.notes, bounds);
        if (store.platform === "android") {
          assert.ok([...release.notes].length <= 500);
        }
      } else {
        assert.ok(release.blocker);
        assert.match(release.observedAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.ok(release.notes === null || typeof release.notes === "string");
      }

      for (const build of release.builds) {
        const identity = [store.platform, store.appId, build, store.locale].join(":");
        assert.ok(!identities.has(identity), `duplicate store-note record: ${identity}`);
        identities.add(identity);
      }
    }
  }

  assert.ok(identities.size >= 25, "the store-note inventory is incomplete");
});

test("TestFlight cleanup plan is exact, pointer-based, and complete", async () => {
  const plan = JSON.parse(await readFile(testflightPlanUrl, "utf8"));
  const history = JSON.parse(await readFile(historyUrl, "utf8"));
  const iosHistory = history.stores.find(({ platform }) => platform === "ios");
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.appId, "6755923591");
  assert.equal(plan.locale, "en-US");
  assert.deepEqual(
    plan.builds.map(({ build }) => build),
    expectedEditableIosBuilds,
  );
  assert.equal(new Set(plan.builds.map(({ build }) => build)).size, plan.builds.length);

  for (const release of plan.builds) {
    assert.ok(release.version);
    assert.ok(["already-verified", "save"].includes(release.action));
    assertPointerNotes(release.notes, [2, 5]);

    const storedRelease = iosHistory.releases.find(
      ({ builds }) => builds.length === 1 && builds[0] === release.build,
    );
    assert.ok(storedRelease, `missing TestFlight history for build ${release.build}`);
    assert.equal(storedRelease.storeStatus, "verified");
    assert.equal(storedRelease.notes, release.notes);
  }

  assert.deepEqual(
    iosHistory.releases
      .filter(({ storeStatus }) => storeStatus === "unavailable")
      .map(({ builds }) => builds[0]),
    expectedLockedIosBuilds,
  );
});

test("Play history records the verified release and deactivated historical bundle", async () => {
  const history = JSON.parse(await readFile(historyUrl, "utf8"));
  const androidHistory = history.stores.find(
    ({ platform }) => platform === "android",
  );
  const verifiedRelease = androidHistory.releases.find(
    ({ builds }) => builds.length === 1 && builds[0] === "73",
  );
  const deactivatedBundle = androidHistory.releases.find(
    ({ builds }) => builds.length === 1 && builds[0] === "72",
  );

  assert.equal(androidHistory.channel, "Play internal");
  assert.ok(verifiedRelease);
  assert.equal(verifiedRelease.version, "2.18.1");
  assert.equal(verifiedRelease.storeStatus, "verified");
  assert.equal(verifiedRelease.notes, expectedPlayNotes);
  assert.ok(deactivatedBundle);
  assert.equal(deactivatedBundle.version, "2.18.0");
  assert.equal(deactivatedBundle.storeStatus, "unavailable");
  assert.match(deactivatedBundle.blocker, /deactivated app bundle/);
});
