import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import {
  NotificationPreference,
  NotificationsResponse,
  TransactionNotification,
} from "../types/notifications";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

const cacheKey = (userId: string) => `notifications-cache:${userId}`;

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Notification request failed");
  }
  return response.json() as Promise<T>;
}

export async function fetchNotifications(userId: string): Promise<NotificationsResponse> {
  try {
    const response = await fetchWithAuth("/notifications?limit=100");
    const data = await readJson<NotificationsResponse>(response);
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(data)).catch(() => {});
    return data;
  } catch (error) {
    const cached = await AsyncStorage.getItem(cacheKey(userId)).catch(() => null);
    if (!cached) throw error;
    return { ...(JSON.parse(cached) as NotificationsResponse), is_offline_cache: true };
  }
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => fetchNotifications(user!.id),
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useNotification(notificationId: string | null) {
  return useQuery({
    queryKey: queryKeys.notification(notificationId ?? ""),
    queryFn: async () => {
      const response = await fetchWithAuth(`/notifications?id=${notificationId}`);
      return readJson<TransactionNotification>(response);
    },
    enabled: !!notificationId,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth("/notifications", {
        method: "PATCH",
        body: JSON.stringify({ action: "read", id }),
      });
      return readJson<{ id: string; read_at: string }>(response);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = queryClient.getQueryData<NotificationsResponse>(queryKeys.notifications);
      if (previous) {
        const target = previous.items.find((item) => item.id === id);
        const groupId = target?.group_id;
        queryClient.setQueryData<NotificationsResponse>(queryKeys.notifications, {
          ...previous,
          unread_count: target && !target.read_at ? Math.max(0, previous.unread_count - 1) : previous.unread_count,
          unread_by_group: groupId && target && !target.read_at
            ? {
              ...previous.unread_by_group,
              [groupId]: Math.max(0, (previous.unread_by_group[groupId] ?? 1) - 1),
            }
            : previous.unread_by_group,
          items: previous.items.map((item) =>
            item.id === id ? { ...item, read_at: new Date().toISOString() } : item
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetchWithAuth("/notifications", {
        method: "PATCH",
        body: JSON.stringify({ action: "read_all", through: new Date().toISOString() }),
      });
      return readJson<{ updated: number }>(response);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = queryClient.getQueryData<NotificationsResponse>(queryKeys.notifications);
      if (previous) {
        const now = new Date().toISOString();
        queryClient.setQueryData<NotificationsResponse>(queryKeys.notifications, {
          ...previous,
          unread_count: 0,
          unread_by_group: {},
          items: previous.items.map((item) => ({ ...item, read_at: item.read_at ?? now })),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.notifications, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export function useUpdateNotificationPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input:
      | { action: "preference"; push_enabled: boolean; permission_status: NotificationPreference["permission_status"] }
      | { action: "dismiss_nudge" }
    ) => {
      const response = await fetchWithAuth("/notifications", {
        method: "PUT",
        body: JSON.stringify(input),
      });
      return readJson<NotificationPreference>(response);
    },
    onSuccess: (preference) => {
      queryClient.setQueryData<NotificationsResponse>(queryKeys.notifications, (previous) =>
        previous ? { ...previous, preference } : previous
      );
    },
  });
}
