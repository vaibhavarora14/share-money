import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
    Surface,
    Text,
    TouchableRipple,
    useTheme
} from "react-native-paper";
import { Balance, GroupStatsResponse } from "../types";
import { UnifiedBalanceHero } from "./UnifiedBalanceHero";
import { UnifyPromptCard } from "./UnifyPromptCard";
import { useCurrencyPreferences } from "../hooks/useCurrencyPreferences";
import { formatCurrency, getDefaultCurrency } from "../utils/currency";
import {
  collectCurrencies,
  formatDisplayTotals,
  isMultiCurrency,
  unifyBalances,
  simplifyUnifiedDebts,
  type UnifiedDebtEdge,
} from "../utils/currencyMerge";
import { DebtEdge, simplifyDebts } from "../utils/debt";
import {
  currenciesFromGroupStats,
  spendingTotalsFromGroupStats,
} from "../utils/groupDashboardStats";
import { shouldHideBalanceChrome } from "../utils/balanceRowLabels";

interface GroupDashboardProps {
  groupId?: string;
  balances: Balance[];
  /** Full-set backend stats — never derive spending totals from paginated transactions. */
  groupStats?: GroupStatsResponse | null;
  currentUserId?: string;
  currentUserParticipantId?: string;
  loading: boolean;
  statsLoading?: boolean;
  defaultCurrency?: string;
  /** @deprecated Balance strip is informational — settle only via Settle tab/screens. */
  onSettlePress?: (balance: Balance) => void;
  onMyCostsPress?: () => void;
  onTotalCostsPress?: () => void;
  onOpenCurrencySettings?: () => void;
  /** Active members in the group (for calm solo/zero chrome). */
  activeMemberCount?: number;
}

function shortName(full?: string | null, email?: string | null): string {
  const base = full?.trim() || email?.split("@")[0] || email || "Someone";
  return base.split(/\s+/)[0] || base;
}

export const GroupDashboard: React.FC<GroupDashboardProps> = ({
  groupId,
  balances,
  groupStats,
  currentUserId,
  currentUserParticipantId,
  loading,
  statsLoading = false,
  defaultCurrency = getDefaultCurrency(),
  onMyCostsPress,
  onTotalCostsPress,
  onOpenCurrencySettings,
  activeMemberCount = 2,
}) => {
  const theme = useTheme();
  const {
    preferredCurrency,
    groupSettings,
    rateBook,
    setGroupSettings,
  } = useCurrencyPreferences(groupId);
  const dashboardLoading = loading || statsLoading;

  const usedCurrencies = useMemo(
    () => collectCurrencies([...balances, ...currenciesFromGroupStats(groupStats)]),
    [balances, groupStats]
  );
  const hasMultipleCurrencies = isMultiCurrency(usedCurrencies);
  const unifyEnabled = groupSettings?.enabled === true && !!groupSettings.settlementCurrency;
  const settlementCurrency = groupSettings?.settlementCurrency || preferredCurrency || defaultCurrency;

  const debts = useMemo(() => {
    if (!currentUserId) return [];
    if (unifyEnabled) {
      return simplifyUnifiedDebts(
        balances,
        settlementCurrency,
        rateBook,
        currentUserId,
        currentUserParticipantId
      );
    }
    return simplifyDebts(balances, currentUserId, defaultCurrency, currentUserParticipantId);
  }, [balances, currentUserId, currentUserParticipantId, defaultCurrency, unifyEnabled, settlementCurrency, rateBook]);

  const myDebts = useMemo(() => {
    if (!currentUserId) return [];
    const filtered = debts.filter(
      (d) =>
        d.fromUser.user_id === currentUserId || d.toUser.user_id === currentUserId
        || (currentUserParticipantId && (
          d.fromUser.participant_id === currentUserParticipantId
          || d.toUser.participant_id === currentUserParticipantId
        ))
    );
    return [...filtered].sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      const aOtherId = a.fromUser.user_id === currentUserId ? a.toUser.user_id : a.fromUser.user_id;
      const bOtherId = b.fromUser.user_id === currentUserId ? b.toUser.user_id : b.fromUser.user_id;
      return (aOtherId || "").localeCompare(bOtherId || "");
    });
  }, [debts, currentUserId, currentUserParticipantId]);

  const myUnified = useMemo(() => {
    if (!currentUserId || !unifyEnabled) return null;
    const mine = balances.filter((balance) => (
      balance.user_id === currentUserId
      || (currentUserParticipantId && balance.participant_id === currentUserParticipantId)
    ));
    return unifyBalances(mine.length > 0 ? mine : myDebts.map((edge) => ({
      user_id: currentUserId,
      amount: edge.toUser.user_id === currentUserId ? edge.amount : -edge.amount,
      currency: edge.currency,
    })), settlementCurrency, rateBook);
  }, [balances, currentUserId, currentUserParticipantId, myDebts, unifyEnabled, settlementCurrency, rateBook]);

  const { myCostTotal, groupCostTotal } = useMemo(
    () => spendingTotalsFromGroupStats(groupStats),
    [groupStats]
  );

  const myCostDisplay = useMemo(
    () => formatDisplayTotals(myCostTotal, {
      unifyEnabled,
      settlementCurrency,
      rateBook,
      defaultCurrency,
    }),
    [myCostTotal, unifyEnabled, settlementCurrency, rateBook, defaultCurrency]
  );
  const groupCostDisplay = useMemo(
    () => formatDisplayTotals(groupCostTotal, {
      unifyEnabled,
      settlementCurrency,
      rateBook,
      defaultCurrency,
    }),
    [groupCostTotal, unifyEnabled, settlementCurrency, rateBook, defaultCurrency]
  );

  const owedToYou = useMemo(
    () => myDebts.filter((d) => d.toUser.user_id === currentUserId),
    [myDebts, currentUserId],
  );
  const youOwe = useMemo(
    () => myDebts.filter((d) => d.fromUser.user_id === currentUserId),
    [myDebts, currentUserId],
  );

  const topOwed = owedToYou[0] as DebtEdge | UnifiedDebtEdge | undefined;
  const topYouOwe = youOwe[0] as DebtEdge | UnifiedDebtEdge | undefined;

  const hideChrome = shouldHideBalanceChrome(
    myDebts.map((d) => ({
      amount: d.toUser.user_id === currentUserId ? d.amount : -d.amount,
    })),
    activeMemberCount,
  );

  const renderCompactInsights = () => (
    <View style={styles.compactStatsRow}>
      <Surface style={[styles.compactStat, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
        <TouchableRipple onPress={onMyCostsPress} style={{ flex: 1 }}>
          <View style={styles.compactStatContent}>
            <View style={[styles.miniIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
              <MaterialCommunityIcons name="wallet" size={18} color={theme.colors.onSecondaryContainer} />
            </View>
            <View style={{ flex: 1 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>My spending</Text>
                <Text variant="labelMedium" numberOfLines={2} style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                    {dashboardLoading ? "..." : myCostDisplay.headline}
                </Text>
                {!dashboardLoading && myCostDisplay.breakdown ? (
                  <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                    from {myCostDisplay.breakdown}
                  </Text>
                ) : null}
            </View>
          </View>
        </TouchableRipple>
      </Surface>

      <Surface style={[styles.compactStat, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
        <TouchableRipple onPress={onTotalCostsPress} style={{ flex: 1 }}>
          <View style={styles.compactStatContent}>
             <View style={[styles.miniIcon, { backgroundColor: theme.colors.tertiaryContainer }]}>
              <MaterialCommunityIcons name="chart-pie" size={18} color={theme.colors.onTertiaryContainer} />
            </View>
            <View style={{ flex: 1 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Group summary</Text>
                <Text variant="labelMedium" numberOfLines={2} style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                    {dashboardLoading ? "..." : groupCostDisplay.headline}
                </Text>
                {!dashboardLoading && groupCostDisplay.breakdown ? (
                  <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                    from {groupCostDisplay.breakdown}
                  </Text>
                ) : null}
            </View>
          </View>
        </TouchableRipple>
      </Surface>
    </View>
  );

  const formatSigned = (edge: DebtEdge | UnifiedDebtEdge, isOwed: boolean) => {
    const raw = formatCurrency(edge.amount, edge.currency);
    const bare = raw.replace(/^[+-]/, "");
    return isOwed ? `+${bare}` : `-${bare}`;
  };

  return (
    <View style={styles.container}>
      {hasMultipleCurrencies && !unifyEnabled ? (
        <UnifyPromptCard
          currencies={usedCurrencies}
          suggestedCurrency={settlementCurrency}
          onEnable={() => {
            if (!groupId) {
              onOpenCurrencySettings?.();
              return;
            }
            void setGroupSettings(groupId, {
              enabled: true,
              settlementCurrency,
            });
          }}
          onChooseCurrency={onOpenCurrencySettings}
        />
      ) : null}

      {unifyEnabled && myUnified ? (
        <UnifiedBalanceHero
          unified={myUnified}
          onPressRates={onOpenCurrencySettings}
        />
      ) : null}

      {!hideChrome && !unifyEnabled ? (
        <Surface
          style={[styles.balanceStrip, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}
          elevation={0}
          testID="group-balance-strip"
        >
          {dashboardLoading || !currentUserId ? (
            <View style={{ padding: 20, alignItems: "center", flex: 1 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Updating balances...
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.stripHalf}>
                <View style={[styles.stripIcon, { backgroundColor: theme.colors.tertiaryContainer }]}>
                  <MaterialCommunityIcons name="cash-plus" size={18} color={theme.colors.tertiary} />
                </View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                  {topOwed
                    ? `${shortName(topOwed.fromUser.full_name, topOwed.fromUser.email)} owes you`
                    : "You’re owed"}
                </Text>
                <Text
                  variant="titleLarge"
                  style={{ color: theme.colors.tertiary, fontWeight: "700" }}
                  testID="balance-strip-owed-amount"
                >
                  {topOwed ? formatSigned(topOwed, true) : formatCurrency(0, defaultCurrency)}
                </Text>
              </View>
              <View style={[styles.stripDivider, { backgroundColor: theme.colors.outlineVariant }]} />
              <View style={styles.stripHalf}>
                <View style={[styles.stripIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
                  <MaterialCommunityIcons name="cash-minus" size={18} color={theme.colors.secondary} />
                </View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                  {topYouOwe
                    ? `You owe ${shortName(topYouOwe.toUser.full_name, topYouOwe.toUser.email)}`
                    : "You owe"}
                </Text>
                <Text
                  variant="titleLarge"
                  style={{ color: theme.colors.secondary, fontWeight: "700" }}
                  testID="balance-strip-owe-amount"
                >
                  {topYouOwe ? formatSigned(topYouOwe, false) : formatCurrency(0, defaultCurrency)}
                </Text>
              </View>
            </>
          )}
        </Surface>
      ) : null}

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
  balanceStrip: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 96,
  },
  stripHalf: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 4,
    justifyContent: "center",
  },
  stripDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
  },
  stripIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  compactStatsRow: {
      flexDirection: 'row',
      gap: 12,
  },
  compactStat: {
      flex: 1,
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 1,
  },
  compactStatContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
  },
  miniIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
  }
});
