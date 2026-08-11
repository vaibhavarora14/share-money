import { assertEquals } from "jsr:@std/assert@1";
import {
  completeMigrationDraft,
  resolveBoundMigrationDraft,
  resolveMigrationDraft,
  type MigrationDraft,
} from "../mobile/utils/migrationDraftCore.ts";

const NOW = Date.parse("2026-08-11T00:00:00.000Z");

Deno.test("resolveMigrationDraft reuses the import id for the same file and group", () => {
  const existing: MigrationDraft = {
    importId: "11111111-1111-4111-8111-111111111111",
    fingerprint: "csv-sha256",
    groupId: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-08-10T00:00:00.000Z",
  };

  const result = resolveMigrationDraft(
    [existing],
    {
      fingerprint: existing.fingerprint,
      groupId: existing.groupId,
      newImportId: "33333333-3333-4333-8333-333333333333",
    },
    NOW,
  );

  assertEquals(result.draft.importId, existing.importId);
  assertEquals(result.drafts, [existing]);
});

Deno.test("resolveMigrationDraft replaces an expired draft", () => {
  const result = resolveMigrationDraft(
    [{
      importId: "11111111-1111-4111-8111-111111111111",
      fingerprint: "csv-sha256",
      groupId: null,
      createdAt: "2026-07-01T00:00:00.000Z",
    }],
    {
      fingerprint: "csv-sha256",
      groupId: null,
      newImportId: "33333333-3333-4333-8333-333333333333",
    },
    NOW,
  );

  assertEquals(result.draft.importId, "33333333-3333-4333-8333-333333333333");
  assertEquals(result.drafts.length, 1);
});

Deno.test("completeMigrationDraft removes only the confirmed import", () => {
  const drafts: MigrationDraft[] = [
    {
      importId: "11111111-1111-4111-8111-111111111111",
      fingerprint: "first",
      groupId: null,
      createdAt: "2026-08-10T00:00:00.000Z",
    },
    {
      importId: "22222222-2222-4222-8222-222222222222",
      fingerprint: "second",
      groupId: null,
      createdAt: "2026-08-10T00:00:00.000Z",
    },
  ];

  assertEquals(completeMigrationDraft(drafts, drafts[0].importId), [drafts[1]]);
});

Deno.test("resolveBoundMigrationDraft recovers a prior group-bound attempt", () => {
  const unbound: MigrationDraft = {
    importId: "11111111-1111-4111-8111-111111111111",
    fingerprint: "same-file",
    groupId: null,
    createdAt: "2026-08-11T00:00:00.000Z",
  };
  const priorAttempt: MigrationDraft = {
    importId: "22222222-2222-4222-8222-222222222222",
    fingerprint: "same-file",
    groupId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-08-10T00:00:00.000Z",
  };

  const result = resolveBoundMigrationDraft(
    [unbound, priorAttempt],
    unbound,
    priorAttempt.groupId as string,
    NOW,
  );

  assertEquals(result.draft.importId, priorAttempt.importId);
  assertEquals(result.drafts.some((draft) => draft.importId === unbound.importId), false);
});
