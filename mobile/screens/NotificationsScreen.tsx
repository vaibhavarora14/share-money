import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import {
  Appbar,
  ActivityIndicator,
  Avatar,
  Button,
  Divider,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { useAuth } from "../contexts/AuthContext";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationsRead,
  useNotifications,
} from "../hooks/useNotifications";
import { isDesktopWebViewport } from "../constants/layout";
import { TransactionNotification } from "../types/notifications";
import { formatCurrency } from "../utils/currency";
import {
  NOTIFICATION_VIEWABILITY_CONFIG,
  unreadNotificationIdsFromViewTokens,
} from "../utils/notificationVisibility";

interface NotificationsScreenProps {
  onBack: () => void;
  onOpenNotification: (notification: TransactionNotification) => void;
  onViewGroups: () => void;
  isActive?: boolean;
}

interface GroupSection {
  key: string;
  groupId: string;
  title: string;
  unreadCount: number;
  totalCount: number;
  data: TransactionNotification[];
  allItems: TransactionNotification[];
}

const GROUP_PREVIEW_LIMIT = 3;

function resolveNetMinor(value: {
  netMinor?: number;
  paidMinor?: number;
  shareMinor?: number;
} | null | undefined): number | null {
  if (!value) return null;
  if (typeof value.netMinor === "number" && Number.isFinite(value.netMinor)) {
    return value.netMinor;
  }
  if (
    typeof value.paidMinor === "number" &&
    Number.isFinite(value.paidMinor) &&
    typeof value.shareMinor === "number" &&
    Number.isFinite(value.shareMinor)
  ) {
    return value.paidMinor - value.shareMinor;
  }
  return null;
}

function balanceSummary(notification: TransactionNotification): {
  label: string;
  direction: "positive" | "negative" | "none";
} {
  const before = resolveNetMinor(notification.snapshot.impact.before);
  const after = resolveNetMinor(notification.snapshot.impact.after);
  const crossCurrency =
    !!notification.snapshot.impact.before?.currency &&
    !!notification.snapshot.impact.after?.currency &&
    notification.snapshot.impact.before?.currency !== notification.snapshot.impact.after?.currency;

  const currency = notification.snapshot.impact.after?.currency ??
    notification.snapshot.impact.before?.currency ??
    notification.snapshot.transaction.currency;
  const deltaMinor = crossCurrency ? (after ?? 0) : (after ?? 0) - (before ?? 0);

  if (deltaMinor > 0) {
    return {
      label: `+${formatCurrency(Math.abs(deltaMinor) / 100, currency)}`,
      direction: "positive",
    };
  }

  if (deltaMinor < 0) {
    return {
      label: `−${formatCurrency(Math.abs(deltaMinor) / 100, currency)}`,
      direction: "negative",
    };
  }

  return {
    label: formatCurrency(0, currency),
    direction: "none",
  };
}

function formatAge(createdAt: string): string {
  const elapsedMinutes = Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return "Yesterday";
  return `${Math.floor(hours / 24)}d`;
}

const NotificationRow = React.memo(function NotificationRow({
  item,
  onPress,
}: {
  item: TransactionNotification;
  onPress: (item: TransactionNotification) => void;
}) {
  const theme = useTheme();
  const impact = balanceSummary(item);
  const unread = !item.read_at;
  const actorInitial = item.snapshot.actor.name.trim().charAt(0).toUpperCase() || "?";
  const rowLabel = `${item.title} · ${formatAge(item.created_at)}`;
  const impactColor = impact.direction === "positive"
    ? theme.colors.tertiary
    : impact.direction === "negative"
      ? theme.colors.secondary
      : theme.colors.onSurfaceVariant;

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "Unread" : "Read"}. ${rowLabel}. ${impact.label}. ${
        impact.direction === "positive"
          ? "Positive balance change"
          : impact.direction === "negative"
            ? "Negative balance change"
            : "No balance change"
      }`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: unread ? theme.colors.primaryContainer : theme.colors.surface },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.unreadSlot}>
        {unread ? <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} /> : null}
      </View>
      <Avatar.Text
        size={46}
        label={actorInitial}
        style={{ backgroundColor: unread ? theme.colors.surface : theme.colors.surfaceVariant }}
        color={theme.colors.primary}
      />
      <View style={styles.rowCopy}>
        <Text
          variant="bodyMedium"
          numberOfLines={1}
          style={[styles.rowTitle, unread ? styles.rowTitleUnread : styles.rowTitleRead]}
        >
          {rowLabel}
        </Text>
      </View>
      <Text
        variant="bodyMedium"
        numberOfLines={1}
        style={[styles.impactAmount, { color: impactColor }]}
        accessibilityLabel={`${impact.direction} balance amount`}
      >
        {impact.label}
      </Text>
    </Pressable>
  );
});

function LoadingRows() {
  const theme = useTheme();
  return (
    <View>
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={styles.skeletonRow}>
          <View style={[styles.skeletonAvatar, { backgroundColor: theme.colors.surfaceVariant }]} />
          <View style={styles.skeletonCopy}>
            <View style={[styles.skeletonLineWide, { backgroundColor: theme.colors.surfaceVariant }]} />
            <View style={[styles.skeletonLine, { backgroundColor: theme.colors.surfaceVariant }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function NotificationsScreen({
  onBack,
  onOpenNotification,
  onViewGroups,
  isActive = true,
}: NotificationsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const dimensions = useWindowDimensions();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markViewed = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();
  const items = notifications.data?.items ?? [];
  const widePanel = isDesktopWebViewport(Platform.OS, dimensions.width);
  const [returningInbox, setReturningInbox] = useState<boolean | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const requestedReadIds = React.useRef(new Set<string>());
  const markVisibleRowsRef = React.useRef<(ids: string[]) => void>(() => {});

  markVisibleRowsRef.current = (ids) => {
    if (!isActive) return;
    const newIds = ids.filter((id) => !requestedReadIds.current.has(id));
    if (newIds.length === 0) return;
    newIds.forEach((id) => requestedReadIds.current.add(id));
    markViewed.mutate(newIds, {
      onError: () => newIds.forEach((id) => requestedReadIds.current.delete(id)),
    });
  };

  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      markVisibleRowsRef.current(unreadNotificationIdsFromViewTokens(viewableItems));
    },
  ).current;

  useEffect(() => {
    if (!user?.id) return;
    const key = `notifications-inbox-opened:${user.id}`;
    let active = true;
    AsyncStorage.getItem(key)
      .then((value) => {
        if (active) setReturningInbox(value === "true");
        return AsyncStorage.setItem(key, "true");
      })
      .catch(() => {
        if (active) setReturningInbox(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const groupedSections = useMemo(() => {
    const unreadByGroup = notifications.data?.unread_by_group ?? {};
    const grouped = new Map<string, {
      title: string;
      groupId: string;
      items: TransactionNotification[];
    }>();

    for (const item of items) {
      const groupId = item.group_id ?? item.snapshot.group.id;
      const key = groupId ?? `unknown-${item.snapshot.group.name ?? item.snapshot.group.id}`;
      const section = grouped.get(key) ?? {
        title: item.snapshot.group.name,
        groupId: key,
        items: [],
      };

      section.items.push(item);
      grouped.set(key, section);
    }

      return Array.from(grouped.values())
      .map(({ title, groupId, items: groupItems }) => {
        const sorted = [...groupItems].sort((a, b) => {
          const age = Date.parse(b.created_at) - Date.parse(a.created_at);
          if (age !== 0) return age;
          return b.id.localeCompare(a.id);
        });
        return {
          key: groupId,
          title,
          groupId,
          unreadCount: unreadByGroup[groupId] ?? 0,
          totalCount: sorted.length,
          data: sorted,
          allItems: sorted,
        };
      })
      .sort((a, b) => {
        const aLatest = a.data[0]?.created_at ?? "";
        const bLatest = b.data[0]?.created_at ?? "";
        const latestDelta = Date.parse(bLatest) - Date.parse(aLatest);
        if (latestDelta !== 0) return latestDelta;
        return b.groupId.localeCompare(a.groupId);
      });
  }, [items, notifications.data?.unread_by_group]);

  const sections: GroupSection[] = useMemo(() => {
    return groupedSections.map((section) => {
      const isExpanded = expandedGroups.has(section.groupId);
      return {
        ...section,
        data: isExpanded ? section.allItems : section.allItems.slice(0, GROUP_PREVIEW_LIMIT),
      };
    });
  }, [expandedGroups, groupedSections]);

  const handleOpen = React.useCallback((item: TransactionNotification) => {
    if (!item.read_at) markRead.mutate(item.id);
    onOpenNotification(item);
  }, [markRead, onOpenNotification]);

  const handleViewMore = React.useCallback((groupId: string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      next.add(groupId);
      return next;
    });
  }, []);

  return (
    <View style={[styles.stage, { backgroundColor: theme.colors.background }]}>
      <Surface
        elevation={widePanel ? 3 : 0}
        style={[
          styles.panel,
          widePanel && styles.widePanel,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
          <Appbar.BackAction onPress={onBack} style={styles.minimumIconTarget} />
          <Appbar.Content title="Notifications" titleStyle={styles.headerTitle} />
          {notifications.data?.unread_count ? (
            <Button
              compact
              mode="text"
              onPress={() => markAll.mutate(new Date().toISOString())}
              loading={markAll.isPending}
              contentStyle={styles.minimumButtonTarget}
            >
              Mark all read
            </Button>
          ) : null}
        </Appbar.Header>
        <Divider />

        {notifications.data?.is_offline_cache ? (
          <View style={[styles.offlineBanner, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Text variant="bodySmall">You’re offline—showing saved activity</Text>
          </View>
        ) : null}

        {markRead.isError || markViewed.isError || markAll.isError ? (
          <View style={[styles.offlineBanner, { backgroundColor: theme.colors.errorContainer }]}>
            <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
              Couldn’t save that read state. Try again.
            </Text>
          </View>
        ) : null}

        {notifications.isLoading ? <LoadingRows /> : null}

        {notifications.isError && !notifications.data ? (
          <View style={styles.state}>
            <Text variant="titleMedium">Couldn’t load notifications</Text>
            <Text style={[styles.stateBody, { color: theme.colors.onSurfaceVariant }]}>
              Check your connection and try again.
            </Text>
            <Button
              mode="contained"
              onPress={() => notifications.refetch()}
              contentStyle={styles.minimumButtonTarget}
            >
              Try again
            </Button>
          </View>
        ) : null}

        {!notifications.isLoading && !notifications.isError && items.length === 0 && returningInbox !== null ? (
          <View style={styles.state}>
            <Avatar.Icon
              size={64}
              icon="bell-outline"
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color={theme.colors.primary}
            />
            <Text variant="titleLarge" style={styles.stateTitle}>
              {returningInbox ? "You’re all caught up" : "No notifications yet"}
            </Text>
            {!returningInbox ? (
              <>
                <Text style={[styles.stateBody, { color: theme.colors.onSurfaceVariant }]}>
                  Changes to expenses involving you will appear here
                </Text>
                <Button
                  mode="contained"
                  onPress={onViewGroups}
                  contentStyle={styles.minimumButtonTarget}
                >
                  View groups
                </Button>
              </>
            ) : null}
          </View>
        ) : null}

        {items.length > 0 ? (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <NotificationRow item={item} onPress={handleOpen} />}
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { backgroundColor: theme.colors.surface }]}>
                <View style={styles.sectionHeaderTop}>
                  <Text
                    variant="titleSmall"
                    numberOfLines={2}
                    style={styles.sectionTitle}
                  >
                    {section.title}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {section.unreadCount ? `${section.unreadCount} new` : ""}
                  </Text>
                </View>
              </View>
            )}
            renderSectionFooter={({ section }) => {
              const hiddenCount = section.totalCount - section.data.length;
              if (hiddenCount <= 0) return null;
              return (
                <Pressable
                  onPress={() => handleViewMore(section.groupId)}
                  accessibilityRole="button"
                  style={[styles.footerButton, { backgroundColor: theme.colors.surface }]}
                  accessibilityLabel={`View ${hiddenCount} more notifications in ${section.title}`}
                >
                  <Text variant="bodySmall" style={[styles.footerButtonText, { color: theme.colors.primary }]}>
                    View {hiddenCount} more
                  </Text>
                </Pressable>
              );
            }}
            ItemSeparatorComponent={Divider}
            stickySectionHeadersEnabled
            contentContainerStyle={styles.listContent}
            onRefresh={() => notifications.refetch()}
            refreshing={notifications.isRefetching && !notifications.isLoading}
            onEndReached={() => {
              if (notifications.hasNextPage && !notifications.isFetchingNextPage) {
                void notifications.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.35}
            viewabilityConfig={NOTIFICATION_VIEWABILITY_CONFIG}
            onViewableItemsChanged={onViewableItemsChanged}
            ListFooterComponent={notifications.isFetchingNextPage ? (
              <View style={styles.paginationFooter}>
                <ActivityIndicator size="small" />
              </View>
            ) : notifications.isFetchNextPageError ? (
              <View style={styles.paginationFooter}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Couldn’t load more
                </Text>
                <Button
                  compact
                  mode="text"
                  onPress={() => void notifications.fetchNextPage()}
                  contentStyle={styles.minimumButtonTarget}
                >
                  Retry
                </Button>
              </View>
            ) : null}
          />
        ) : null}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  minimumIconTarget: { width: 44, height: 44 },
  minimumButtonTarget: { minHeight: 44 },
  stage: { flex: 1 },
  panel: { flex: 1 },
  widePanel: { width: 460, alignSelf: "flex-end" },
  headerTitle: { fontWeight: "700" },
  offlineBanner: { paddingHorizontal: 16, paddingVertical: 8 },
  listContent: { paddingBottom: 32 },
  sectionHeader: { paddingHorizontal: 20, paddingVertical: 10 },
  sectionHeaderTop: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: { flex: 1, minWidth: 0 },
  row: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingRight: 14,
  },
  pressed: { opacity: 0.72 },
  unreadSlot: { width: 22, alignItems: "center" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  rowCopy: { flex: 1, marginLeft: 12, minWidth: 0 },
  rowTitle: {},
  rowTitleUnread: { fontWeight: "700" },
  rowTitleRead: { fontWeight: "400" },
  impactAmount: {
    width: 100,
    textAlign: "right",
    textAlignVertical: "center",
    fontWeight: "600",
  },
  footerButton: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingHorizontal: 20,
  },
  footerButtonText: { fontWeight: "600" },
  state: {
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  stateTitle: {
    marginBottom: 8,
    textAlign: "center",
  },
  stateBody: {
    textAlign: "center",
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 22,
    marginTop: 10,
    paddingBottom: 16,
  },
  skeletonAvatar: { width: 46, height: 46, borderRadius: 23 },
  skeletonCopy: { flex: 1, marginLeft: 12, gap: 8 },
  skeletonLineWide: {
    width: "75%",
    height: 14,
    borderRadius: 7,
  },
  skeletonLine: {
    width: "45%",
    height: 12,
    borderRadius: 6,
  },
  paginationFooter: {
    padding: 16,
    alignItems: "center",
    gap: 10,
  },
});
