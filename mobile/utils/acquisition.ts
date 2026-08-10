import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  acquisitionContextFromUrl,
  type AcquisitionContext,
  type MigrationIntent,
} from "./acquisitionContext";

const ACQUISITION_CONTEXT_KEY = "acquisition_context_v1";
const ACQUISITION_CONTEXT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type { AcquisitionContext, MigrationIntent };

function isFreshContext(context: AcquisitionContext): boolean {
  const capturedAt = Date.parse(context.capturedAt);
  return Number.isFinite(capturedAt) && Date.now() - capturedAt <= ACQUISITION_CONTEXT_MAX_AGE_MS;
}

export async function persistAcquisitionContextFromUrl(url: string | null | undefined): Promise<AcquisitionContext | null> {
  if (!url) return null;

  const context = acquisitionContextFromUrl(url);
  if (!context) return null;

  await AsyncStorage.setItem(ACQUISITION_CONTEXT_KEY, JSON.stringify(context));
  return context;
}

export async function getAcquisitionContext(): Promise<AcquisitionContext | null> {
  const rawContext = await AsyncStorage.getItem(ACQUISITION_CONTEXT_KEY);
  if (!rawContext) return null;

  try {
    const context = JSON.parse(rawContext) as AcquisitionContext;
    if (!isFreshContext(context)) {
      await AsyncStorage.removeItem(ACQUISITION_CONTEXT_KEY);
      return null;
    }
    return context;
  } catch {
    await AsyncStorage.removeItem(ACQUISITION_CONTEXT_KEY);
    return null;
  }
}

export async function getMigrationIntent(): Promise<MigrationIntent> {
  const context = await getAcquisitionContext();
  return context?.intent ?? "standard";
}
