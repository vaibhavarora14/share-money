import {
  buildTermsAcceptanceUpdate,
  CURRENT_TERMS_VERSION,
} from "./profile.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected, null, 2)}, got ${
        JSON.stringify(
          actual,
          null,
          2,
        )
      }`,
    );
  }
}

Deno.test("terms acceptance uses the server time and current published version", () => {
  const acceptedAt = new Date("2026-08-13T12:00:00.000Z");

  assertEquals(buildTermsAcceptanceUpdate(true, acceptedAt), {
    terms_accepted_at: "2026-08-13T12:00:00.000Z",
    terms_version: CURRENT_TERMS_VERSION,
  });
});

Deno.test("terms acceptance rejects anything except explicit agreement", () => {
  let error: Error | null = null;

  try {
    buildTermsAcceptanceUpdate(false);
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }

  assertEquals(error?.message, "Terms must be explicitly accepted");
});
