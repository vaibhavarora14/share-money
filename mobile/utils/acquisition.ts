import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  acquisitionContextFromUrl,
  isFreshAcquisitionContext,
  selectFirstTouchAcquisition,
  type AcquisitionContext,
  type MigrationIntent,
} from "./acquisitionContext";

const ACQUISITION_CONTEXT_KEY = "acquisition_context_v1";
const PENDING_MIGRATION_INTENT_KEY = "pending_migration_intent_v1";

export type { AcquisitionContext, MigrationIntent };

export async function persistAcquisitionContextFromUrl(url: string | null | undefined): Promise<AcquisitionContext | null> {
  if (!url) return null;

  const context = acquisitionContextFromUrl(url);
  if (!context) return null;

  const existing = await getAcquisitionContext();
  const firstTouch = selectFirstTouchAcquisition(existing, context);
  if (firstTouch && firstTouch !== existing) {
    await AsyncStorage.setItem(ACQUISITION_CONTEXT_KEY, JSON.stringify(firstTouch));
  }
  if (context.intent === "splitwise-import") {
    await AsyncStorage.setItem(PENDING_MIGRATION_INTENT_KEY, context.capturedAt);
  }
  return context;
}

export async function getAcquisitionContext(): Promise<AcquisitionContext | null> {
  const rawContext = await AsyncStorage.getItem(ACQUISITION_CONTEXT_KEY);
  if (!rawContext) return null;

  try {
    const context = JSON.parse(rawContext) as AcquisitionContext;
    if (!isFreshAcquisitionContext(context)) {
      await AsyncStorage.removeItem(ACQUISITION_CONTEXT_KEY);
      return null;
    }
    return context;
  } catch {
    await AsyncStorage.removeItem(ACQUISITION_CONTEXT_KEY);
    return null;
  }
}

export async function consumePendingMigrationIntent(): Promise<MigrationIntent> {
  const pending = await AsyncStorage.getItem(PENDING_MIGRATION_INTENT_KEY);
  if (!pending) return "standard";
  await AsyncStorage.removeItem(PENDING_MIGRATION_INTENT_KEY);
  return "splitwise-import";
}

export async function clearAcquisitionState(): Promise<void> {
  await AsyncStorage.multiRemove([
    ACQUISITION_CONTEXT_KEY,
    PENDING_MIGRATION_INTENT_KEY,
  ]);
}
