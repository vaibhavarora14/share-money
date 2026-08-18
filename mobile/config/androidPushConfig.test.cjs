const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  resolveAndroidPushConfig,
} = require("./androidPushConfig.cjs");

const ANDROID_PACKAGE = "com.vaibhavarora.sharemoney";

function writeGoogleServicesFile(directory, packageName = ANDROID_PACKAGE) {
  const filePath = path.join(directory, "google-services.json");
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      project_info: {
        project_id: "sharedmoney-test",
      },
      client: [
        {
          client_info: {
            mobilesdk_app_id: "1:1234567890:android:abcdef",
            android_client_info: { package_name: packageName },
          },
          api_key: [{ current_key: "public-firebase-api-key" }],
        },
      ],
    }),
  );
  return filePath;
}

test("uses the configured EAS file after validating the SharedMoney package", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sharemoney-firebase-"));
  const filePath = writeGoogleServicesFile(directory);

  const config = resolveAndroidPushConfig({
    env: { GOOGLE_SERVICES_JSON: filePath, REQUIRE_ANDROID_PUSH_CONFIG: "true" },
    projectRoot: directory,
  });

  assert.deepEqual(config, { googleServicesFile: filePath });
});

test("rejects a production build when Firebase client configuration is missing", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sharemoney-firebase-"));

  assert.throws(
    () =>
      resolveAndroidPushConfig({
        env: { REQUIRE_ANDROID_PUSH_CONFIG: "true" },
        projectRoot: directory,
      }),
    /GOOGLE_SERVICES_JSON/,
  );
});

test("rejects Firebase configuration for another Android application", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sharemoney-firebase-"));
  const filePath = writeGoogleServicesFile(directory, "com.paisewise");

  assert.throws(
    () =>
      resolveAndroidPushConfig({
        env: { GOOGLE_SERVICES_JSON: filePath },
        projectRoot: directory,
      }),
    /com\.vaibhavarora\.sharemoney/,
  );
});

test("allows local development without Firebase configuration", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sharemoney-firebase-"));

  assert.deepEqual(
    resolveAndroidPushConfig({ env: {}, projectRoot: directory }),
    {},
  );
});
