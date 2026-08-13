import {
  CURRENT_TERMS_VERSION,
  needsTermsAcceptance,
} from "../../mobile/utils/onboardingFlow.ts";
import { CURRENT_TERMS_VERSION as SERVER_TERMS_VERSION } from "../../supabase/functions/_shared/profile.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test("new and migrated accounts see terms immediately after login", () => {
  assertEquals(
    needsTermsAcceptance({ terms_accepted_at: null, terms_version: null }),
    true,
  );
});

Deno.test("returning accounts skip terms after accepting the current version", () => {
  assertEquals(
    needsTermsAcceptance({
      terms_accepted_at: "2026-08-13T12:00:00.000Z",
      terms_version: CURRENT_TERMS_VERSION,
    }),
    false,
  );
});

Deno.test("accounts accept again only when the published terms version changes", () => {
  assertEquals(
    needsTermsAcceptance({
      terms_accepted_at: "2026-08-13T12:00:00.000Z",
      terms_version: "2026-01-01",
    }),
    true,
  );
});

Deno.test("the app and profile API enforce the same published terms version", () => {
  assertEquals(CURRENT_TERMS_VERSION, SERVER_TERMS_VERSION);
});
