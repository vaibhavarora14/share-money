import React from "react";
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Appbar, Avatar, Button, Divider, Surface, Text, useTheme } from "react-native-paper";
import { useMarkNotificationRead, useNotification } from "../hooks/useNotifications";
import { formatCurrency } from "../utils/currency";

interface NotificationDetailScreenProps {
  notificationId: string;
  onBack: () => void;
  onViewGroup: (groupId: string, showActivity: boolean, transactionId: number | null) => void;
}

export function NotificationDetailScreen({ notificationId, onBack, onViewGroup }: NotificationDetailScreenProps) {
  const theme = useTheme();
  const dimensions = useWindowDimensions();
  const notification = useNotification(notificationId);
  const markRead = useMarkNotificationRead();
  const item = notification.data;
  const widePanel = Platform.OS === "web" && dimensions.width >= 768;

  React.useEffect(() => {
    if (item && !item.read_at && !markRead.isPending) markRead.mutate(item.id);
  }, [item?.id, item?.read_at]);

  if (!item) {
    return (
      <View style={[styles.stage, { backgroundColor: theme.colors.background }]}>
        <Surface style={[styles.panel, widePanel && styles.widePanel, { backgroundColor: theme.colors.surface }]}>
          <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
            <Appbar.BackAction onPress={onBack} />
            <Appbar.Content title="Notification" />
          </Appbar.Header>
          <View style={styles.state}>
            <Text variant="titleMedium">{notification.isError ? "This notification is unavailable" : "Loading notification…"}</Text>
            {notification.isError ? <Button onPress={() => notification.refetch()}>Try again</Button> : null}
          </View>
        </Surface>
      </View>
    );
  }

  const { actor, group, transaction, impact, action } = item.snapshot;
  const initial = actor.name.trim().charAt(0).toUpperCase() || "?";
  const before = impact.before_share;
  const after = impact.after_share;
  const increased = action === "created"
    ? (after ?? 0) > 0
    : before !== null && after !== null && after > before;
  const decreased = before !== null && after !== null && after < before;
  const impactColor = increased || action === "deleted"
    ? theme.colors.secondary
    : decreased
      ? theme.colors.tertiary
      : theme.colors.onSurface;
  const canHighlightTransaction = !transaction.deleted && item.transaction_id !== null;

  return (
    <View style={[styles.stage, { backgroundColor: theme.colors.background }]}>
      <Surface elevation={widePanel ? 3 : 0} style={[styles.panel, widePanel && styles.widePanel, { backgroundColor: theme.colors.surface }]}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
          <Appbar.BackAction onPress={onBack} />
          <Appbar.Content title="Notification" titleStyle={styles.headerTitle} />
        </Appbar.Header>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.actorRow}>
            <Avatar.Text size={50} label={initial} style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.primary} />
            <View style={styles.actorCopy}>
              <Text variant="titleMedium">{actor.name}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          </View>

          <Text variant="titleLarge" style={styles.summary}>{item.title} in {group.name}.</Text>
          <Divider style={styles.divider} />

          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Impact on you</Text>
          <View style={styles.impactRow}>
            <Text variant="bodyLarge">Your share</Text>
            {action === "deleted" ? (
              <Text variant="titleMedium" style={{ color: theme.colors.secondary }}>Removed</Text>
            ) : (
              <View style={styles.impactValues}>
                <Text variant="titleMedium" style={[styles.impactAmount, { color: impactColor }]}>
                  {before !== null && after !== null && before !== after
                    ? `${formatCurrency(before, transaction.currency)} → ${formatCurrency(after, transaction.currency)}`
                    : formatCurrency(after ?? before ?? 0, transaction.currency)}
                </Text>
                {impact.share_delta ? (
                  <Text variant="bodyMedium" style={{ color: impactColor }}>
                    {impact.share_delta > 0 ? "+" : "−"}{formatCurrency(Math.abs(impact.share_delta), transaction.currency)}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
          <Divider style={styles.divider} />

          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Transaction</Text>
          <Text variant="bodyLarge" style={styles.value}>{transaction.description}</Text>
          <Divider style={styles.divider} />

          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Group</Text>
          <Text variant="bodyLarge" style={styles.value}>{group.name}</Text>
        </ScrollView>
        <View style={styles.footer}>
          <Button
            mode="contained"
            onPress={() => onViewGroup(
              group.id,
              transaction.deleted,
              canHighlightTransaction ? transaction.id : null,
            )}
            contentStyle={styles.buttonContent}
          >
            {transaction.deleted
              ? "View group activity"
              : canHighlightTransaction
                ? "View in group"
                : "View group"}
          </Button>
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1 },
  panel: { flex: 1 },
  widePanel: { width: 460, alignSelf: "flex-end" },
  headerTitle: { fontWeight: "700" },
  content: { padding: 24, paddingBottom: 120 },
  actorRow: { flexDirection: "row", alignItems: "center" },
  actorCopy: { marginLeft: 14 },
  summary: { marginTop: 38, lineHeight: 31 },
  divider: { marginVertical: 28 },
  impactRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 16 },
  impactValues: { alignItems: "flex-end", flex: 1, marginLeft: 20 },
  impactAmount: { fontWeight: "700", textAlign: "right" },
  value: { marginTop: 10, fontWeight: "600" },
  footer: { padding: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE3EC" },
  buttonContent: { minHeight: 48 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});
