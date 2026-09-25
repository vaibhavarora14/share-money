import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { queryKeys } from "./queryKeys";
import type { BalancesResponse, GroupStatsResponse, Transaction } from "../types";
import type { TransactionsPageResponse } from "./useTransactions";
import { log } from "../utils/logger";

interface UseRealtimeGroupSyncOptions {
  enabled?: boolean;
}

export interface TransactionPushPayload {
  action: "create" | "update" | "delete";
  groupId: string;
  transaction?: Transaction;
  transactionId?: number;
}

export interface BalancesPushPayload {
  groupId: string;
  balances?: BalancesResponse;
  groupStats?: GroupStatsResponse;
}

/**
 * Real-time synchronization hook supporting both Push and Invalidate models.
 * 
 * - Push Model: When the server broadcasts full transaction or balance payloads
 *   (e.g., TRANSACTION_PUSHED, BALANCES_PUSHED), the cache is updated directly
 *   via queryClient.setQueryData. ZERO HTTP round-trips needed.
 * - Pull Fallback: For generic events or schema changes without full payloads,
 *   active TanStack Query keys are debounced-invalidated to fetch fresh state.
 */
export function useRealtimeGroupSync(
  groupId: string | null | undefined,
  options: UseRealtimeGroupSyncOptions = {},
) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!groupId || !enabled) return;

    // Direct push updater for transactions (0 HTTP requests)
    const handleTransactionPush = (payload: TransactionPushPayload) => {
      if (payload.groupId !== groupId) return;
      log(`[Realtime Push] Applying transaction ${payload.action} for group ${groupId}`);

      if (payload.action === "create" && payload.transaction) {
        const newTx = payload.transaction;
        queryClient.setQueryData<InfiniteData<TransactionsPageResponse>>(
          queryKeys.transactionsFeed(groupId),
          (old) => {
            if (!old || !old.pages?.length) return old;
            const exists = old.pages.some((page) =>
              page.items.some((item) => item.id === newTx.id)
            );
            if (exists) return old;
            return {
              ...old,
              pages: old.pages.map((page, idx) =>
                idx === 0 ? { ...page, items: [newTx, ...page.items] } : page
              ),
            };
          }
        );
      } else if (payload.action === "update" && payload.transaction) {
        const updatedTx = payload.transaction;
        queryClient.setQueryData<InfiniteData<TransactionsPageResponse>>(
          queryKeys.transactionsFeed(groupId),
          (old) => {
            if (!old || !old.pages?.length) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((item) =>
                  item.id === updatedTx.id ? updatedTx : item
                ),
              })),
            };
          }
        );
      } else if (payload.action === "delete" && payload.transactionId) {
        const delId = payload.transactionId;
        queryClient.setQueryData<InfiniteData<TransactionsPageResponse>>(
          queryKeys.transactionsFeed(groupId),
          (old) => {
            if (!old || !old.pages?.length) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.filter((item) => item.id !== delId),
              })),
            };
          }
        );
      }

      // Any transaction change impacts balances; if balances weren't pushed together,
      // invalidate them so they refetch.
      queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groupStats(groupId) });
    };

    // Direct push updater for balances (0 HTTP requests)
    const handleBalancesPush = (payload: BalancesPushPayload) => {
      if (payload.groupId !== groupId) return;
      log(`[Realtime Push] Applying pushed balances for group ${groupId}`);

      if (payload.balances) {
        queryClient.setQueryData(queryKeys.balances(groupId), payload.balances);
      }
      if (payload.groupStats) {
        queryClient.setQueryData(queryKeys.groupStats(groupId), payload.groupStats);
      }
    };

    // Pull fallback: debounced cache invalidation
    const invalidateGroupData = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        log(`[Realtime Pull Fallback] Syncing updates for group ${groupId}`);
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsFeed(groupId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.settlements(groupId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(groupId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.groupStats(groupId) });
      }, 150);
    };

    const channelName = `group-sync:${groupId}`;
    const channel = supabase
      .channel(channelName)
      // 1. Postgres CDC for raw changes
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "transactions",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: number })?.id;
          if (deletedId) {
            handleTransactionPush({
              action: "delete",
              groupId,
              transactionId: deletedId,
            });
          } else {
            invalidateGroupData();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `group_id=eq.${groupId}`,
        },
        () => invalidateGroupData()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `group_id=eq.${groupId}`,
        },
        () => invalidateGroupData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "settlements",
          filter: `group_id=eq.${groupId}`,
        },
        () => invalidateGroupData()
      )
      // 2. Direct Server Event Push (0 HTTP round trips)
      .on(
        "broadcast",
        { event: "TRANSACTION_PUSHED" },
        (payload) => {
          if (payload?.payload) {
            handleTransactionPush(payload.payload as TransactionPushPayload);
          }
        }
      )
      .on(
        "broadcast",
        { event: "BALANCES_PUSHED" },
        (payload) => {
          if (payload?.payload) {
            handleBalancesPush(payload.payload as BalancesPushPayload);
          }
        }
      )
      // 3. Generic Invalidation Signal
      .on(
        "broadcast",
        { event: "DATA_MUTATED" },
        (payload) => {
          if (payload?.payload?.groupId === groupId) {
            invalidateGroupData();
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          log(`[Realtime] Connected to channel for group ${groupId}`);
        }
      });

    // AppState lifecycle: flush stale queries when app returns to foreground
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        invalidateGroupData();
      }
    };

    const appStateSub = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      appStateSub.remove();
      void supabase.removeChannel(channel);
    };
  }, [groupId, enabled, queryClient]);
}
