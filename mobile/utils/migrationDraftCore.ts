export type MigrationDraft = {
  importId: string;
  fingerprint: string;
  groupId: string | null;
  createdAt: string;
};

export const MIGRATION_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(draft: MigrationDraft, now: number): boolean {
  const createdAt = Date.parse(draft.createdAt);
  return Number.isFinite(createdAt) && now - createdAt <= MIGRATION_DRAFT_MAX_AGE_MS;
}

export function resolveMigrationDraft(
  drafts: MigrationDraft[],
  input: {
    fingerprint: string;
    groupId: string | null;
    newImportId: string;
  },
  now = Date.now(),
): { draft: MigrationDraft; drafts: MigrationDraft[] } {
  const freshDrafts = drafts.filter((draft) => isFresh(draft, now));
  const existing = freshDrafts.find(
    (draft) => draft.fingerprint === input.fingerprint && draft.groupId === input.groupId,
  );
  if (existing) return { draft: existing, drafts: freshDrafts };

  const draft: MigrationDraft = {
    importId: input.newImportId,
    fingerprint: input.fingerprint,
    groupId: input.groupId,
    createdAt: new Date(now).toISOString(),
  };
  return { draft, drafts: [...freshDrafts, draft] };
}

export function bindMigrationDraftToGroup(
  drafts: MigrationDraft[],
  importId: string,
  groupId: string,
): MigrationDraft[] {
  return drafts.map((draft) => draft.importId === importId ? { ...draft, groupId } : draft);
}

export function resolveBoundMigrationDraft(
  drafts: MigrationDraft[],
  unboundDraft: MigrationDraft,
  groupId: string,
  now = Date.now(),
): { draft: MigrationDraft; drafts: MigrationDraft[] } {
  const freshDrafts = drafts.filter((draft) => isFresh(draft, now));
  const existing = freshDrafts.find(
    (draft) => draft.fingerprint === unboundDraft.fingerprint && draft.groupId === groupId,
  );

  if (existing) {
    return {
      draft: existing,
      drafts: freshDrafts.filter((draft) => draft.importId !== unboundDraft.importId),
    };
  }

  const draft = { ...unboundDraft, groupId };
  return {
    draft,
    drafts: freshDrafts.map((candidate) => candidate.importId === draft.importId ? draft : candidate),
  };
}

export function completeMigrationDraft(
  drafts: MigrationDraft[],
  importId: string,
): MigrationDraft[] {
  return drafts.filter((draft) => draft.importId !== importId);
}
