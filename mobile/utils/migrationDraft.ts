import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import {
  completeMigrationDraft,
  resolveBoundMigrationDraft,
  resolveMigrationDraft,
  type MigrationDraft,
} from "./migrationDraftCore";

const MIGRATION_DRAFTS_KEY = "splitwise_import_drafts_v1";

async function loadDrafts(): Promise<MigrationDraft[]> {
  const raw = await AsyncStorage.getItem(MIGRATION_DRAFTS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveDrafts(drafts: MigrationDraft[]): Promise<void> {
  await AsyncStorage.setItem(MIGRATION_DRAFTS_KEY, JSON.stringify(drafts));
}

export async function prepareMigrationDraft(
  csvText: string,
  groupId: string | null,
): Promise<MigrationDraft> {
  const fingerprint = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    csvText,
  );
  const result = resolveMigrationDraft(await loadDrafts(), {
    fingerprint,
    groupId,
    newImportId: Crypto.randomUUID(),
  });
  await saveDrafts(result.drafts);
  return result.draft;
}

export async function bindPreparedMigrationToGroup(
  draft: MigrationDraft,
  groupId: string,
): Promise<MigrationDraft> {
  const result = resolveBoundMigrationDraft(await loadDrafts(), draft, groupId);
  await saveDrafts(result.drafts);
  return result.draft;
}

export async function clearCompletedMigrationDraft(importId: string): Promise<void> {
  await saveDrafts(completeMigrationDraft(await loadDrafts(), importId));
}
