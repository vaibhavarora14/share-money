import {
  CURRENT_TERMS_VERSION,
  PROFILE_COMPLETION_SKIP_AFTER_MS,
  canSkipProfileCompletion,
  isProfileComplete,
  needsProfileCompletion,
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

Deno.test("incomplete profiles need completion until name and flag are set", () => {
  assertEquals(needsProfileCompletion({ profile_completed: false }), true);
  assertEquals(
    needsProfileCompletion({ profile_completed: true, full_name: "" }),
    true,
  );
  assertEquals(
    needsProfileCompletion({
      profile_completed: true,
      full_name: "Ada Lovelace",
    }),
    false,
  );
  assertEquals(
    isProfileComplete({
      profile_completed: true,
      full_name: "  Ada  ",
    }),
    true,
  );
});

Deno.test("new signups cannot soft-skip profile completion", () => {
  const now = Date.parse("2026-09-15T12:00:00.000Z");
  assertEquals(
    canSkipProfileCompletion(
      { created_at: "2026-09-15T11:59:00.000Z" },
      now,
    ),
    false,
  );
});

Deno.test("existing incomplete profiles can soft-skip after the age threshold", () => {
  const now = Date.parse("2026-09-15T12:00:00.000Z");
  const createdAt = new Date(
    now - PROFILE_COMPLETION_SKIP_AFTER_MS,
  ).toISOString();
  assertEquals(
    canSkipProfileCompletion({ created_at: createdAt }, now),
    true,
  );
});

Deno.test("missing or invalid created_at fails open so users are not trapped", () => {
  assertEquals(canSkipProfileCompletion({}), true);
  assertEquals(canSkipProfileCompletion({ created_at: "not-a-date" }), true);
});
