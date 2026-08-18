#!/usr/bin/env node

const path = require("node:path");
const {
  resolveAndroidPushConfig,
} = require("../config/androidPushConfig.cjs");

const config = resolveAndroidPushConfig({
  env: process.env,
  projectRoot: path.join(__dirname, ".."),
});

if (process.env.REQUIRE_ANDROID_PUSH_CONFIG === "true") {
  console.log(`Android Firebase client configuration verified: ${config.googleServicesFile}`);
} else if (config.googleServicesFile) {
  console.log(`Optional Android Firebase client configuration verified: ${config.googleServicesFile}`);
} else {
  console.log("Android Firebase client configuration is optional for this build profile.");
}
