import React from "react";
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Appbar, Avatar, Button, Divider, Surface, Text, useTheme } from "react-native-paper";
import { isDesktopWebViewport } from "../constants/layout";
import { useMarkNotificationRead, useNotification } from "../hooks/useNotifications";
import { NotificationPosition } from "../types/notifications";
import { formatCurrency } from "../utils/currency";
import { NotificationGroupReference } from "../utils/notificationGroupNavigation";

interface NotificationDetailScreenProps {
  notificationId: string;
  onBack: () => void;
  onViewGroup: (
    group: NotificationGroupReference,
    showActivity: boolean,
    transactionId: number | null,
  ) => boolean | void;
}

function resolveNetMinor(position: NotificationPosition | null | undefined): number | null {
  if (!position) return null;
  if (typeof position.netMinor === "number" && Number.isFinite(position.netMinor)) {
    return position.netMinor;
  }
  if (
    typeof position.paidMinor === "number" &&
    Number.isFinite(position.paidMinor) &&
    typeof position.shareMinor === "number" &&
    Number.isFinite(position.shareMinor)
  ) {
    return position.paidMinor - position.shareMinor;
  }
  return null;
}

function formatSignedImpact(
  before: NotificationPosition | null,
  after: NotificationPosition | null,
  transactionCurrency: string,
): { amount: string; direction: "positive" | "negative" | "none" } {
  const beforeMinor = resolveNetMinor(before) ?? 0;
  const afterMinor = resolveNetMinor(after) ?? 0;
  const crossCurrency = before?.currency && after?.currency && before.currency !== after.currency;
  const currency = after?.currency || before?.currency || transactionCurrency;
  const deltaMinor = crossCurrency ? afterMinor : afterMinor - beforeMinor;

  if (deltaMinor > 0) {
    return { amount: `+${formatCurrency(Math.abs(deltaMinor) / 100, currency)}`, direction: "positive" };
  }
  if (deltaMinor < 0) {
    return { amount: `−${formatCurrency(Math.abs(deltaMinor) / 100, currency)}`, direction: "negative" };
  }
  return { amount: formatCurrency(0, currency), direction: "none" };
}

function describePosition(
  position: NotificationPosition | null,
  fallbackCurrency: string,
): { label: string; amount: string } {
  const netMinor = resolveNetMinor(position);
  const currency = position?.currency || fallbackCurrency;
  const amount = formatCurrency(Math.abs(netMinor ?? 0) / 100, currency);
  if ((netMinor ?? 0) > 0) return { label: "You’re owed", amount };
  if ((netMinor ?? 0) < 0) return { label: "You owe", amount };
  return { label: "Settled", amount: formatCurrency(0, currency) };
}

export function NotificationDetailScreen({ notificationId, onBack, onViewGroup }: NotificationDetailScreenProps) {
  const theme = useTheme();
  const dimensions = useWindowDimensions();
  const notification = useNotification(notificationId);
  const markRead = useMarkNotificationRead();
  const openingGroupRef = React.useRef(false);
  const [isOpeningGroup, setIsOpeningGroup] = React.useState(false);
  const item = notification.data;
  const widePanel = isDesktopWebViewport(Platform.OS, dimensions.width);

  React.useEffect(() => {
    if (item && !item.read_at && !markRead.isPending) markRead.mutate(item.id);
  }, [item?.id, item?.read_at]);

  if (!item) {
    return (
      <View style={[styles.stage, { backgroundColor: theme.colors.background }]}>
        <Surface style={[styles.panel, widePanel && styles.widePanel, { backgroundColor: theme.colors.surface }]}>
          <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
            <Appbar.BackAction onPress={onBack} style={styles.minimumIconTarget} />
            <Appbar.Content title="Notification" />
          </Appbar.Header>
          <View style={styles.state}>
            <Text variant="titleMedium">{notification.isError ? "This notification is unavailable" : "Loading notification…"}</Text>
            {notification.isError ? (
              <Button
                onPress={() => notification.refetch()}
                contentStyle={styles.minimumButtonTarget}
              >
                Try again
              </Button>
            ) : null}
          </View>
        </Surface>
      </View>
    );
  }

  const { actor, group, transaction, impact, action } = item.snapshot;
  const initial = actor.name.trim().charAt(0).toUpperCase() || "?";
  const impactAmount = formatSignedImpact(impact.before, impact.after, transaction.currency);
  const beforePosition = describePosition(impact.before, transaction.currency);
  const afterPosition = describePosition(impact.after, transaction.currency);
  const crossCurrency = impact.before?.currency && impact.after?.currency &&
    impact.before.currency !== impact.after.currency;
  const canHighlightTransaction = !transaction.deleted && item.transaction_id !== null;

  const impactColor = impactAmount.direction === "positive"
    ? theme.colors.tertiary
    : impactAmount.direction === "negative"
      ? theme.colors.secondary
      : theme.colors.onSurface;

  const handleViewGroup = () => {
    if (openingGroupRef.current) return;

    openingGroupRef.current = true;
    setIsOpeningGroup(true);
    const started = onViewGroup(
      group,
      action === "deleted" || transaction.deleted,
      canHighlightTransaction ? transaction.id : null,
    );

    if (started === false) {
      openingGroupRef.current = false;
      setIsOpeningGroup(false);
    }
  };

  return (
    <View style={[styles.stage, { backgroundColor: theme.colors.background }]}>
      <Surface
        elevation={widePanel ? 3 : 0}
        style={[styles.panel, widePanel && styles.widePanel, { backgroundColor: theme.colors.surface }]}
      >
        <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
          <Appbar.BackAction onPress={onBack} style={styles.minimumIconTarget} />
          <Appbar.Content title="Notification" titleStyle={styles.headerTitle} />
        </Appbar.Header>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.actorRow}>
            <Avatar.Text
              size={50}
              label={initial}
              style={{ backgroundColor: theme.colors.primaryContainer }}
              color={theme.colors.primary}
            />
            <View style={styles.actorCopy}>
              <Text variant="titleMedium">{actor.name}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          </View>

          <Text variant="titleLarge" style={styles.summary}>
            {item.title}
          </Text>
          <Divider style={styles.divider} />

          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Impact on you
          </Text>
          <Text variant="titleLarge" style={[styles.impactAmount, { color: impactColor }]}>
            {impactAmount.amount}
          </Text>
          <Divider style={styles.divider} />

          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Before</Text>
          <Text variant="bodyLarge" style={styles.value}>
            {beforePosition.label}: {beforePosition.amount}
            {impact.before?.currency ? ` (${impact.before.currency})` : ""}
          </Text>

          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>After</Text>
          <Text variant="bodyLarge" style={styles.value}>
            {action === "deleted"
              ? "Transaction removed"
              : `${afterPosition.label}: ${afterPosition.amount}${
                impact.after?.currency ? ` (${impact.after.currency})` : ""
              }`}
          </Text>

          {crossCurrency && action !== "deleted" ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              Cross-currency position changed from one currency to another, so impact is shown in each currency.
            </Text>
          ) : null}
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
            onPress={handleViewGroup}
            loading={isOpeningGroup}
            disabled={isOpeningGroup}
            contentStyle={styles.buttonContent}
          >
            {action === "deleted" || transaction.deleted
              ? "View group activity"
              : "View in group"}
          </Button>
        </View>
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
  content: { padding: 24, paddingBottom: 120 },
  actorRow: { flexDirection: "row", alignItems: "center" },
  actorCopy: { marginLeft: 14 },
  summary: { marginTop: 38, lineHeight: 31 },
  divider: { marginVertical: 20 },
  impactAmount: { marginTop: 8 },
  value: { marginTop: 10, fontWeight: "600" },
  footer: { padding: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE3EC" },
  buttonContent: { minHeight: 48 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});
