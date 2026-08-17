import AsyncStorage from "@react-native-async-storage/async-storage";
import { isToday } from "date-fns";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  useWindowDimensions,
  View,
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
  useNotifications,
} from "../hooks/useNotifications";
import { TransactionNotification } from "../types/notifications";
import { formatCurrency } from "../utils/currency";

interface NotificationsScreenProps {
  onBack: () => void;
  onOpenNotification: (notification: TransactionNotification) => void;
  onViewGroups: () => void;
}

function trailingImpact(notification: TransactionNotification): { label: string; positive: boolean | null } {
  const { action, impact, transaction } = notification.snapshot;
  if (action === "deleted") return { label: "Removed", positive: false };
  const after = impact.after_share;
  if (after === null) return { label: "", positive: null };
  if (action === "updated" && impact.before_share !== null && impact.before_share !== after) {
    return {
      label: `${formatCurrency(impact.before_share, transaction.currency)} → ${formatCurrency(after, transaction.currency)}`,
      positive: after < impact.before_share,
    };
  }
  return {
    label: `Your share ${formatCurrency(after, transaction.currency)}`,
    positive: action === "created" && after > 0 ? false : null,
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
  const impact = trailingImpact(item);
  const unread = !item.read_at;
  const actorInitial = item.snapshot.actor.name.trim().charAt(0).toUpperCase() || "?";
  const impactColor = impact.positive === true
    ? theme.colors.tertiary
    : impact.positive === false
      ? theme.colors.secondary
      : theme.colors.onSurfaceVariant;

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "Unread" : "Read"}. ${item.snapshot.actor.name}. ${item.title}. Group ${item.snapshot.group.name}. ${impact.label}. ${formatAge(item.created_at)}`}
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
          numberOfLines={2}
          style={[styles.rowTitle, unread ? styles.rowTitleUnread : styles.rowTitleRead]}
        >
          {item.title}
        </Text>
        <View style={styles.rowMeta}>
          <Text variant="bodySmall" numberOfLines={1} style={[styles.groupName, { color: theme.colors.onSurfaceVariant }]}>
            {item.snapshot.group.name}
          </Text>
          {impact.label ? (
            <Text variant="bodySmall" numberOfLines={1} style={[styles.impact, { color: impactColor }]}>
              {impact.label}
            </Text>
          ) : null}
        </View>
      </View>
      <Text variant="bodySmall" style={[styles.time, { color: theme.colors.onSurfaceVariant }]}>
        {formatAge(item.created_at)}
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
}: NotificationsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const dimensions = useWindowDimensions();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const items = notifications.data?.items ?? [];
  const widePanel = Platform.OS === "web" && dimensions.width >= 768;
  const [returningInbox, setReturningInbox] = useState<boolean | null>(null);

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

  const sections = useMemo(() => {
    const today: TransactionNotification[] = [];
    const earlier: TransactionNotification[] = [];
    for (const item of items) (isToday(new Date(item.created_at)) ? today : earlier).push(item);
    return [
      ...(today.length ? [{ title: "Today", data: today }] : []),
      ...(earlier.length ? [{ title: "Earlier", data: earlier }] : []),
    ];
  }, [items]);

  const handleOpen = React.useCallback((item: TransactionNotification) => {
    if (!item.read_at) markRead.mutate(item.id);
    onOpenNotification(item);
  }, [markRead, onOpenNotification]);

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
          <Appbar.BackAction onPress={onBack} />
          <Appbar.Content title="Notifications" titleStyle={styles.headerTitle} />
          {notifications.data?.unread_count ? (
            <Button
              compact
              mode="text"
              onPress={() => markAll.mutate(new Date().toISOString())}
              loading={markAll.isPending}
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

        {markRead.isError || markAll.isError ? (
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
            <Button mode="contained" onPress={() => notifications.refetch()}>Try again</Button>
          </View>
        ) : null}

        {!notifications.isLoading && !notifications.isError && items.length === 0 && returningInbox !== null ? (
          <View style={styles.state}>
            <Avatar.Icon size={64} icon="bell-outline" style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.stateTitle}>
              {returningInbox ? "You’re all caught up" : "No notifications yet"}
            </Text>
            {!returningInbox ? (
              <>
                <Text style={[styles.stateBody, { color: theme.colors.onSurfaceVariant }]}>
                  Changes to expenses involving you will appear here
                </Text>
                <Button mode="contained" onPress={onViewGroups}>View groups</Button>
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
                <Text variant="titleSmall">{section.title}</Text>
              </View>
            )}
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
            ListFooterComponent={notifications.isFetchingNextPage ? (
              <View style={styles.paginationFooter}>
                <ActivityIndicator size="small" />
              </View>
            ) : notifications.isFetchNextPageError ? (
              <View style={styles.paginationFooter}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Couldn’t load more
                </Text>
                <Button compact mode="text" onPress={() => void notifications.fetchNextPage()}>
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
  stage: { flex: 1 },
  panel: { flex: 1 },
  widePanel: { width: 460, alignSelf: "flex-end" },
  headerTitle: { fontWeight: "700" },
  offlineBanner: { paddingHorizontal: 16, paddingVertical: 8 },
  listContent: { paddingBottom: 32 },
  sectionHeader: { paddingHorizontal: 20, paddingVertical: 10 },
  row: { minHeight: 92, flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingRight: 14 },
  pressed: { opacity: 0.72 },
  unreadSlot: { width: 22, alignItems: "center" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  rowCopy: { flex: 1, marginLeft: 12 },
  rowTitle: {},
  rowTitleUnread: { fontWeight: "700" },
  rowTitleRead: { fontWeight: "500" },
  rowMeta: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  groupName: { flex: 1, paddingRight: 8 },
  impact: { fontWeight: "600", maxWidth: "58%", textAlign: "right" },
  time: { alignSelf: "flex-start", marginLeft: 8 },
  state: { flex: 1, minHeight: 420, alignItems: "center", justifyContent: "center", padding: 32 },
  stateTitle: { fontWeight: "700", marginTop: 18 },
  stateBody: { textAlign: "center", marginTop: 8, marginBottom: 24, maxWidth: 300 },
  skeletonRow: { height: 92, flexDirection: "row", alignItems: "center", paddingHorizontal: 22 },
  skeletonAvatar: { width: 46, height: 46, borderRadius: 23 },
  skeletonCopy: { flex: 1, marginLeft: 14 },
  skeletonLineWide: { height: 14, borderRadius: 7, width: "78%" },
  skeletonLine: { height: 11, borderRadius: 6, width: "46%", marginTop: 10 },
  paginationFooter: { minHeight: 64, alignItems: "center", justifyContent: "center", padding: 12 },
});
