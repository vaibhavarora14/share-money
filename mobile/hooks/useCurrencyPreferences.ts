import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPreviewRateBook,
} from "../utils/previewRates";
import {
  type RateBook,
  withOverrides,
} from "../utils/currencyMerge";
import { getDefaultCurrency } from "../utils/currency";

const STORAGE_KEY = "currency-merge-preferences-v1";

export type GroupCurrencySettings = {
  enabled: boolean;
  settlementCurrency: string;
  customRates: Record<string, number>;
};

export type CurrencyPreferences = {
  preferredCurrency: string;
  groups: Record<string, GroupCurrencySettings>;
};

function defaultPreferences(): CurrencyPreferences {
  return {
    preferredCurrency: getDefaultCurrency(),
    groups: {},
  };
}

function normalizePreferences(raw: unknown): CurrencyPreferences {
  const fallback = defaultPreferences();
  if (!raw || typeof raw !== "object") return fallback;

  const value = raw as Partial<CurrencyPreferences>;
  const preferred = typeof value.preferredCurrency === "string"
    ? value.preferredCurrency.toUpperCase()
    : fallback.preferredCurrency;

  const groups: Record<string, GroupCurrencySettings> = {};
  if (value.groups && typeof value.groups === "object") {
    for (const [groupId, settings] of Object.entries(value.groups)) {
      if (!settings || typeof settings !== "object") continue;
      groups[groupId] = {
        enabled: settings.enabled === true,
        settlementCurrency: (settings.settlementCurrency || preferred).toUpperCase(),
        customRates: settings.customRates && typeof settings.customRates === "object"
          ? Object.fromEntries(
              Object.entries(settings.customRates).filter(([, rate]) =>
                Number.isFinite(rate) && (rate as number) > 0
              )
            )
          : {},
      };
    }
  }

  return { preferredCurrency: preferred, groups };
}

let memoryCache: CurrencyPreferences | null = null;
const listeners = new Set<(prefs: CurrencyPreferences) => void>();

async function readPreferences(): Promise<CurrencyPreferences> {
  if (memoryCache) return memoryCache;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    memoryCache = stored ? normalizePreferences(JSON.parse(stored)) : defaultPreferences();
  } catch {
    memoryCache = defaultPreferences();
  }
  return memoryCache;
}

async function writePreferences(next: CurrencyPreferences): Promise<void> {
  memoryCache = next;
  listeners.forEach((listener) => listener(next));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getGroupCurrencySettings(
  prefs: CurrencyPreferences,
  groupId: string | undefined
): GroupCurrencySettings | null {
  if (!groupId) return null;
  return prefs.groups[groupId] || null;
}

export function buildGroupRateBook(
  settings: GroupCurrencySettings | null | undefined
): RateBook {
  return createPreviewRateBook(settings?.customRates || {});
}

export function useCurrencyPreferences(groupId?: string) {
  const [prefs, setPrefs] = useState<CurrencyPreferences>(
    () => memoryCache || defaultPreferences()
  );
  const [ready, setReady] = useState(Boolean(memoryCache));

  useEffect(() => {
    let mounted = true;
    readPreferences().then((value) => {
      if (mounted) {
        setPrefs(value);
        setReady(true);
      }
    });
    const listener = (value: CurrencyPreferences) => setPrefs(value);
    listeners.add(listener);
    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  const update = useCallback(async (
    updater: (current: CurrencyPreferences) => CurrencyPreferences
  ) => {
    const current = await readPreferences();
    const next = updater(current);
    await writePreferences(next);
  }, []);

  const setPreferredCurrency = useCallback(async (currency: string) => {
    await update((current) => ({
      ...current,
      preferredCurrency: currency.toUpperCase(),
    }));
  }, [update]);

  const setGroupSettings = useCallback(async (
    id: string,
    patch: Partial<GroupCurrencySettings>
  ) => {
    await update((current) => {
      const existing = current.groups[id] || {
        enabled: false,
        settlementCurrency: current.preferredCurrency,
        customRates: {},
      };
      return {
        ...current,
        groups: {
          ...current.groups,
          [id]: {
            ...existing,
            ...patch,
            settlementCurrency: (patch.settlementCurrency || existing.settlementCurrency).toUpperCase(),
            customRates: patch.customRates || existing.customRates,
          },
        },
      };
    });
  }, [update]);

  const setGroupRate = useCallback(async (
    id: string,
    from: string,
    to: string,
    rate: number
  ) => {
    await update((current) => {
      const existing = current.groups[id] || {
        enabled: true,
        settlementCurrency: current.preferredCurrency,
        customRates: {},
      };
      return {
        ...current,
        groups: {
          ...current.groups,
          [id]: {
            ...existing,
            customRates: {
              ...existing.customRates,
              [`${from.toUpperCase()}:${to.toUpperCase()}`]: rate,
            },
          },
        },
      };
    });
  }, [update]);

  const clearGroupRate = useCallback(async (
    id: string,
    from: string,
    to: string
  ) => {
    await update((current) => {
      const existing = current.groups[id];
      if (!existing) return current;
      const nextRates = { ...existing.customRates };
      delete nextRates[`${from.toUpperCase()}:${to.toUpperCase()}`];
      delete nextRates[`${to.toUpperCase()}:${from.toUpperCase()}`];
      return {
        ...current,
        groups: {
          ...current.groups,
          [id]: { ...existing, customRates: nextRates },
        },
      };
    });
  }, [update]);

  const groupSettings = groupId ? prefs.groups[groupId] || null : null;
  const rateBook = useMemo(
    () => withOverrides(createPreviewRateBook(), groupSettings?.customRates || {}),
    [groupSettings]
  );

  return {
    ready,
    prefs,
    preferredCurrency: prefs.preferredCurrency,
    groupSettings,
    rateBook,
    setPreferredCurrency,
    setGroupSettings,
    setGroupRate,
    clearGroupRate,
  };
}
