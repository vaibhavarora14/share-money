const fs = require("node:fs");
const path = require("node:path");

const ANDROID_PACKAGE = "com.vaibhavarora.sharemoney";
const FIREBASE_PROJECT_ID = "sharedmoney-504507";

function readAndValidateGoogleServicesFile(filePath) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read GOOGLE_SERVICES_JSON at ${filePath}: ${error.message}`,
    );
  }

  const matchingClient = config.client?.find(
    (client) =>
      client.client_info?.android_client_info?.package_name === ANDROID_PACKAGE,
  );
  if (!matchingClient) {
    throw new Error(
      `GOOGLE_SERVICES_JSON must contain an Android client for ${ANDROID_PACKAGE}`,
    );
  }
  if (config.project_info?.project_id !== FIREBASE_PROJECT_ID) {
    throw new Error(
      `GOOGLE_SERVICES_JSON must belong to Firebase project ${FIREBASE_PROJECT_ID}`,
    );
  }
  if (!matchingClient.client_info?.mobilesdk_app_id) {
    throw new Error("GOOGLE_SERVICES_JSON is missing client_info.mobilesdk_app_id");
  }
  if (!matchingClient.api_key?.some((entry) => entry.current_key)) {
    throw new Error("GOOGLE_SERVICES_JSON is missing an Android API key");
  }
}

function resolveAndroidPushConfig({
  env = process.env,
  projectRoot = path.join(__dirname, ".."),
} = {}) {
  const configuredPath = env.GOOGLE_SERVICES_JSON?.trim();
  const localPath = path.join(projectRoot, "google-services.json");
  const filePath = configuredPath || (fs.existsSync(localPath) ? localPath : null);
  const isRemoteAndroidBuild =
    env.EAS_BUILD_RUNNER === "eas-build" &&
    env.EAS_BUILD_PLATFORM === "android";

  if (!filePath) {
    if (
      env.REQUIRE_ANDROID_PUSH_CONFIG === "true" &&
      isRemoteAndroidBuild
    ) {
      throw new Error(
        "Android push configuration is required. Set GOOGLE_SERVICES_JSON to the SharedMoney google-services.json file.",
      );
    }
    return {};
  }

  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(projectRoot, filePath);
  readAndValidateGoogleServicesFile(resolvedPath);
  return { googleServicesFile: resolvedPath };
}

module.exports = {
  ANDROID_PACKAGE,
  FIREBASE_PROJECT_ID,
  resolveAndroidPushConfig,
};
