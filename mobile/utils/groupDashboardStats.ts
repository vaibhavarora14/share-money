import type { GroupStatsResponse } from "../types";

function toTotalsMap(source?: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  Object.entries(source || {}).forEach(([currency, amount]) => {
    if (!currency) return;
    map.set(currency.toUpperCase(), amount);
  });
  return map;
}

/**
 * Spending / group-summary totals must come from backend group_stats (full set),
 * never from the paginated transactions list loaded for UI.
 */
export function spendingTotalsFromGroupStats(
  groupStats?: GroupStatsResponse | null
): {
  myCostTotal: Map<string, number>;
  groupCostTotal: Map<string, number>;
} {
  return {
    myCostTotal: toTotalsMap(groupStats?.totals?.my_share),
    groupCostTotal: toTotalsMap(groupStats?.totals?.group_total),
  };
}

/** Currencies present in backend spending totals (stable across transaction pagination). */
export function currenciesFromGroupStats(
  groupStats?: GroupStatsResponse | null
): Array<{ currency: string }> {
  const seen = new Set<string>();
  const add = (source?: Record<string, number>) => {
    Object.keys(source || {}).forEach((currency) => {
      const normalized = currency.trim().toUpperCase();
      if (normalized) seen.add(normalized);
    });
  };
  add(groupStats?.totals?.group_total);
  add(groupStats?.totals?.my_share);
  return Array.from(seen).map((currency) => ({ currency }));
}
