import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Avatar,
  Button,
  Surface,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { Balance, GroupStatsResponse } from "../types";
import { formatCurrency, formatTotals } from "../utils/currency";

type DashboardSettlementEdge = {
  fromUser: Balance;
  toUser: Balance;
  amount: number;
  currency: string;
};

interface GroupDashboardProps {
  groupStats?: GroupStatsResponse | null;
  currentUserId?: string;
  loading: boolean;
  statsLoading?: boolean;
  onSettlePress?: (balance: Balance) => void;
  onMyCostsPress?: () => void;
  onTotalCostsPress?: () => void;
}

export const GroupDashboard: React.FC<GroupDashboardProps> = ({
  groupStats,
  currentUserId,
  loading,
  statsLoading = false,
  onSettlePress,
  onMyCostsPress,
  onTotalCostsPress,
}) => {
  const theme = useTheme();
  const [showAllActions, setShowAllActions] = useState(false);
  const dashboardLoading = loading || statsLoading;

  const debts = useMemo(() => {
    const settlementPlan = groupStats?.settlement_plan || [];
    return settlementPlan.map((edge) => ({
      fromUser: {
        user_id: edge.from_user_id || "",
        participant_id: edge.from_participant_id,
        full_name: edge.from_full_name || null,
        email: edge.from_email || undefined,
        avatar_url: edge.from_avatar_url || null,
        amount: -Math.abs(edge.amount),
        currency: edge.currency,
      } as Balance,
      toUser: {
        user_id: edge.to_user_id || "",
        participant_id: edge.to_participant_id,
        full_name: edge.to_full_name || null,
        email: edge.to_email || undefined,
        avatar_url: edge.to_avatar_url || null,
        amount: Math.abs(edge.amount),
        currency: edge.currency,
      } as Balance,
      amount: edge.amount,
      currency: edge.currency,
    }));
  }, [groupStats]);

  const myDebts = useMemo(() => {
    if (!currentUserId) return [];

    const filtered = debts.filter(
      (d) =>
        d.fromUser.user_id === currentUserId || d.toUser.user_id === currentUserId
    );

    return filtered.sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      const aOtherId =
        a.fromUser.user_id === currentUserId
          ? a.toUser.user_id || a.toUser.participant_id || ""
          : a.fromUser.user_id || a.fromUser.participant_id || "";
      const bOtherId =
        b.fromUser.user_id === currentUserId
          ? b.toUser.user_id || b.toUser.participant_id || ""
          : b.fromUser.user_id || b.fromUser.participant_id || "";
      return aOtherId.localeCompare(bOtherId);
    });
  }, [debts, currentUserId]);

  const myCostTotal = useMemo(
    () => new Map(Object.entries(groupStats?.totals?.my_share || {})),
    [groupStats]
  );
  const groupCostTotal = useMemo(
    () => new Map(Object.entries(groupStats?.totals?.group_total || {})),
    [groupStats]
  );

  const formattedMyCost = useMemo(() => formatTotals(myCostTotal), [myCostTotal]);
  const formattedGroupCost = useMemo(
    () => formatTotals(groupCostTotal),
    [groupCostTotal]
  );

  const renderActionItem = (edge: DashboardSettlementEdge) => {
    const isOwed = edge.toUser.user_id === currentUserId;
    const otherUser = isOwed ? edge.fromUser : edge.toUser;
    const amountColor = isOwed ? "#1e8e3e" : "#d93025";
    const displayName =
      otherUser.full_name ||
      otherUser.email?.split("@")[0] ||
      otherUser.email ||
      "User";
    const avatarLabel = displayName.substring(0, 2).toUpperCase();

    const settleBalance: Balance = {
      ...otherUser,
      amount: isOwed ? edge.amount : -edge.amount,
      currency: edge.currency,
    };

    return (
      <Surface
        key={`${edge.currency}-${edge.fromUser.participant_id || edge.fromUser.user_id}-${edge.toUser.participant_id || edge.toUser.user_id}`}
        style={styles.actionCard}
        elevation={0}
      >
        <TouchableRipple
          onPress={() => onSettlePress?.(settleBalance)}
          style={{ paddingVertical: 4 }}
        >
          <View style={styles.actionRow}>
            {otherUser.avatar_url ? (
              <Avatar.Image source={{ uri: otherUser.avatar_url }} size={40} />
            ) : (
              <Avatar.Text
                label={avatarLabel}
                size={40}
                style={{ backgroundColor: theme.colors.surfaceVariant }}
                color={theme.colors.onSurfaceVariant}
                labelStyle={{ fontWeight: "600" }}
              />
            )}

            <View style={styles.actionInfo}>
              <Text
                variant="bodyLarge"
                style={{ color: theme.colors.onSurface, fontWeight: "500" }}
              >
                {displayName}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {isOwed ? "owes you" : "you owe"}
              </Text>
            </View>

            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text
                variant="titleMedium"
                style={{ color: amountColor, fontWeight: "700" }}
              >
                {formatCurrency(edge.amount, edge.currency)}
              </Text>
              <View
                style={[
                  styles.actionChip,
                  {
                    backgroundColor: isOwed
                      ? theme.colors.secondaryContainer
                      : theme.colors.errorContainer,
                  },
                ]}
              >
                <Text
                  variant="labelSmall"
                  style={{
                    color: isOwed
                      ? theme.colors.onSecondaryContainer
                      : theme.colors.onErrorContainer,
                    fontWeight: "700",
                  }}
                >
                  {isOwed ? "RECEIVE" : "PAY"}
                </Text>
              </View>
            </View>
          </View>
        </TouchableRipple>
      </Surface>
    );
  };

  const renderCompactInsights = () => (
    <View style={styles.compactStatsRow}>
      <Surface
        style={[
          styles.compactStat,
          { backgroundColor: theme.colors.secondaryContainer },
        ]}
        elevation={0}
      >
        <TouchableRipple onPress={onMyCostsPress} style={{ flex: 1 }}>
          <View style={styles.compactStatContent}>
            <View
              style={[styles.miniIcon, { backgroundColor: theme.colors.background }]}
            >
              <MaterialCommunityIcons
                name="wallet"
                size={18}
                color={theme.colors.onSurface}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSecondaryContainer, opacity: 0.8 }}
              >
                My Spending
              </Text>
              <Text
                variant="labelMedium"
                numberOfLines={2}
                style={{
                  color: theme.colors.onSecondaryContainer,
                  fontWeight: "bold",
                }}
              >
                {dashboardLoading ? "..." : formattedMyCost}
              </Text>
            </View>
          </View>
        </TouchableRipple>
      </Surface>

      <Surface
        style={[
          styles.compactStat,
          { backgroundColor: theme.colors.tertiaryContainer },
        ]}
        elevation={0}
      >
        <TouchableRipple onPress={onTotalCostsPress} style={{ flex: 1 }}>
          <View style={styles.compactStatContent}>
            <View
              style={[styles.miniIcon, { backgroundColor: theme.colors.background }]}
            >
              <MaterialCommunityIcons
                name="chart-pie"
                size={18}
                color={theme.colors.onSurface}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onTertiaryContainer, opacity: 0.8 }}
              >
                Group summary
              </Text>
              <Text
                variant="labelMedium"
                numberOfLines={2}
                style={{
                  color: theme.colors.onTertiaryContainer,
                  fontWeight: "bold",
                }}
              >
                {dashboardLoading ? "..." : formattedGroupCost}
              </Text>
            </View>
          </View>
        </TouchableRipple>
      </Surface>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        {myDebts.length > 0 ? (
          <View style={{ gap: 4 }}>
            {(showAllActions ? myDebts : myDebts.slice(0, 2)).map(renderActionItem)}
            {myDebts.length > 2 && (
              <Button
                mode="text"
                compact
                onPress={() => setShowAllActions(!showAllActions)}
                icon={showAllActions ? "chevron-up" : "chevron-down"}
              >
                {showAllActions ? "Show less" : `Show ${myDebts.length - 2} more`}
              </Button>
            )}
          </View>
        ) : dashboardLoading || !currentUserId ? (
          <View style={{ padding: 20, alignItems: "center" }}>
            <Text variant="bodySmall" style={{ opacity: 0.5 }}>
              Updating balances...
            </Text>
          </View>
        ) : (
          <Surface style={styles.emptyStateCard} elevation={0}>
            <MaterialCommunityIcons
              name="check-decagram"
              size={24}
              color={theme.colors.primary}
            />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              You are all caught up!
            </Text>
          </Surface>
        )}
      </View>

      {renderCompactInsights()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 16,
  },
  section: {
    gap: 4,
  },
  actionCard: {
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 4,
  },
  actionInfo: {
    flex: 1,
    justifyContent: "center",
  },
  actionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 70,
    alignItems: "center",
  },
  emptyStateCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  compactStatsRow: {
    flexDirection: "row",
    gap: 12,
  },
  compactStat: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  compactStatContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  miniIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
