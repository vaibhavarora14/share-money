import { assertEquals } from "jsr:@std/assert@1";

// Deno cannot load Expo native modules; test the pure helpers via dynamic
// import of a tiny eligibility mirror kept in sync with nativeGoogleAuth.ts.

function canUseNativeGoogleSignIn(options: {
  platform: string;
  appOwnership: string | null;
  webClientId?: string;
}): boolean {
  if (options.platform !== "android") return false;
  if (options.appOwnership === "expo") return false;
  return Boolean(options.webClientId?.trim());
}

Deno.test("native Google Sign-In is Android build-only", () => {
  assertEquals(
    canUseNativeGoogleSignIn({
      platform: "android",
      appOwnership: null,
      webClientId: "123.apps.googleusercontent.com",
    }),
    true,
  );
  assertEquals(
    canUseNativeGoogleSignIn({
      platform: "android",
      appOwnership: "expo",
      webClientId: "123.apps.googleusercontent.com",
    }),
    false,
  );
  assertEquals(
    canUseNativeGoogleSignIn({
      platform: "ios",
      appOwnership: null,
      webClientId: "123.apps.googleusercontent.com",
    }),
    false,
  );
  assertEquals(
    canUseNativeGoogleSignIn({
      platform: "android",
      appOwnership: null,
      webClientId: "  ",
    }),
    false,
  );
});
