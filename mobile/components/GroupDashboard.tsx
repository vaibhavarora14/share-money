import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  Avatar,
  Surface,
  Text,
  TouchableRipple,
  useTheme
} from "react-native-paper";
import { Balance, Transaction } from "../types";
import { formatCurrency, formatTotals } from "../utils/currency";

interface GroupDashboardProps {
  balances: Balance[];
  transactions: Transaction[];
  currentUserId?: string;
  currentUserParticipantId?: string;
  loading: boolean;
  defaultCurrency?: string;
  onSettlePress?: (balance: Balance) => void;
  onMyCostsPress?: () => void;
  onTotalCostsPress?: () => void;
}

type DebtEdge = {
  fromUser: Balance;
  toUser: Balance;
  amount: number;
  currency: string;
};

// Greedy debt simplification algorithm
function simplifyDebts(
  balances: Balance[],
  currentUserId: string,
  defaultCurrency: string
): DebtEdge[] {
  const byCurrency = new Map<string, Balance[]>();
  // Deep copy AND Invert Sign to match API Semantics
  // API: Positive = They Owe Me (User is Debtor relative to me) -> Ledger: Negative
  // API: Negative = I Owe Them (User is Creditor relative to me) -> Ledger: Positive
  const balancesCopy = balances.map(b => ({ ...b, amount: -b.amount }));
  
  const addBalance = (b: Balance) => {
    const list = byCurrency.get(b.currency) || [];
    list.push(b);
    byCurrency.set(b.currency, list);
  };
  balancesCopy.forEach(addBalance);

  const edges: DebtEdge[] = [];

  byCurrency.forEach((currencyBalances, currency) => {
    const sumOthers = currencyBalances.reduce((sum, b) => sum + b.amount, 0);
    const myBalanceAmount = -sumOthers;
    const allBalances = [...currencyBalances];
    if (Math.abs(myBalanceAmount) > 0.01) {
      allBalances.push({
        user_id: currentUserId,
        amount: myBalanceAmount,
        currency: currency,
        full_name: "You",
      });
    }

    const debtors = allBalances
      .filter((b) => b.amount < -0.01)
      .sort((a, b) => a.amount - b.amount);
    const creditors = allBalances
      .filter((b) => b.amount > 0.01)
      .sort((a, b) => b.amount - a.amount);

    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(Math.abs(debtor.amount), creditor.amount);

      edges.push({
        fromUser: debtor,
        toUser: creditor,
        amount: amount,
        currency: currency,
      });

      debtor.amount += amount;
      creditor.amount -= amount;

      if (Math.abs(debtor.amount) < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }
  });

  return edges;
}

export const GroupDashboard: React.FC<GroupDashboardProps> = ({
  balances,
  transactions,
  currentUserId,
  currentUserParticipantId,
  loading,
  defaultCurrency = "USD",
  onSettlePress,
  onMyCostsPress,
  onTotalCostsPress,
}) => {
  const theme = useTheme();

  // 1. Calculate Debts (Action List)
  const debts = useMemo(() => {
    if (!currentUserId) return [];
    return simplifyDebts(balances, currentUserId, defaultCurrency);
  }, [balances, currentUserId, defaultCurrency]);

  const myDebts = useMemo(() => {
    if (!currentUserId) return [];
    return debts.filter(
      (d) =>
        d.fromUser.user_id === currentUserId || d.toUser.user_id === currentUserId
    );
  }, [debts, currentUserId]);

  // 2. Calculate My Net Position (Hero)
  const netPositions = useMemo(() => {
    if (!currentUserId) return [];
    const positions = new Map<string, number>();

    // We can infer this from myDebts actually
    myDebts.forEach((d) => {
      const isOwed = d.toUser.user_id === currentUserId;
      const val = isOwed ? d.amount : -d.amount;
      const cur = positions.get(d.currency) || 0;
      positions.set(d.currency, cur + val);
    });

    return Array.from(positions.entries()).map(([currency, amount]) => ({
      currency,
      amount,
    }));
  }, [myDebts, currentUserId]);

  // 3. Calculate Insights (Stats)
  const { myCostTotal, groupCostTotal } = useMemo(() => {
    const groupTotal = new Map<string, number>();
    const myTotal = new Map<string, number>();

    transactions.forEach((t) => {
      const currency = t.currency || defaultCurrency;
      const currentTotal = groupTotal.get(currency) || 0;
      groupTotal.set(currency, currentTotal + t.amount);

      let myShare = 0;
      if (t.splits && t.splits.length > 0) {
        const mySplit = t.splits.find(
          (s) =>
            (currentUserParticipantId &&
              s.participant_id === currentUserParticipantId) ||
            (currentUserId && s.user_id === currentUserId)
        );
        if (mySplit) myShare = mySplit.amount;
      } else if (
        t.split_among_participant_ids &&
        t.split_among_participant_ids.length > 0
      ) {
        if (
          currentUserParticipantId &&
          t.split_among_participant_ids.includes(currentUserParticipantId)
        ) {
          myShare = t.amount / t.split_among_participant_ids.length;
        }
      } else if (t.split_among && t.split_among.length > 0) {
        if (currentUserId && t.split_among.includes(currentUserId)) {
          myShare = t.amount / t.split_among.length;
        }
      }

      if (myShare > 0) {
        const currentMyTotal = myTotal.get(currency) || 0;
        myTotal.set(currency, currentMyTotal + myShare);
      }
    });

    return { myCostTotal: myTotal, groupCostTotal: groupTotal };
  }, [transactions, currentUserId, currentUserParticipantId, defaultCurrency]);

  const formattedMyCost = useMemo(() => formatTotals(myCostTotal), [myCostTotal]);
  const formattedGroupCost = useMemo(
    () => formatTotals(groupCostTotal),
    [groupCostTotal]
  );

  // --- RENDER HELPERS ---

  // --- RENDER HELPERS ---

  const renderActionItem = (edge: DebtEdge) => {
    const isOwed = edge.toUser.user_id === currentUserId;
    const otherUser = isOwed ? edge.fromUser : edge.toUser;
    
    // Google Material 3 colors often use Tonal palettes.
    // We'll stick to semantic red/green but with a "Google" feel (clean, readable).
    const amountColor = isOwed ? "#1e8e3e" : "#d93025"; // Google Green / Google Red

    const displayName =
      otherUser.full_name || otherUser.email?.split("@")[0] || "User";
    const avatarLabel = displayName.substring(0, 2).toUpperCase();

    // Construct balance object for settlement
    const settleBalance: Balance = {
        ...otherUser,
        amount: isOwed ? edge.amount : -edge.amount,
        currency: edge.currency
    };

    return (
      <Surface
        key={`${edge.currency}-${edge.fromUser.user_id}-${edge.toUser.user_id}`}
        style={styles.actionCard}
        elevation={0}
      >
        <TouchableRipple onPress={() => onSettlePress?.(settleBalance)} style={{ paddingVertical: 4 }}>
          <View style={styles.actionRow}>
            {otherUser.avatar_url ? (
              <Avatar.Image source={{ uri: otherUser.avatar_url }} size={40} />
            ) : (
              <Avatar.Text
                label={avatarLabel}
                size={40}
                style={{ backgroundColor: theme.colors.surfaceVariant }}
                color={theme.colors.onSurfaceVariant}
                labelStyle={{ fontWeight: '600' }}
              />
            )}

            <View style={styles.actionInfo}>
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '500' }}>
                {displayName}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {isOwed ? `owes you` : `you owe`}
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 4 }}>
               <Text
                variant="titleMedium"
                style={{ color: amountColor, fontWeight: "700" }}
              >
                {formatCurrency(edge.amount, edge.currency)}
              </Text>
              {/* Action Button: Small, Tonal / Outlined */}
               <View style={[
                   styles.actionChip, 
                   { backgroundColor: isOwed ? theme.colors.secondaryContainer : theme.colors.errorContainer } 
               ]}>
                   <Text 
                    variant="labelSmall" 
                    style={{ 
                        color: isOwed ? theme.colors.onSecondaryContainer : theme.colors.onErrorContainer,
                        fontWeight: '700'
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
      {/* My Cost - "Tonal" Card */}
      <Surface style={[styles.compactStat, { backgroundColor: theme.colors.secondaryContainer }]} elevation={0}>
        <TouchableRipple onPress={onMyCostsPress} style={{ flex: 1 }}>
          <View style={styles.compactStatContent}>
            <View style={[styles.miniIcon, { backgroundColor: theme.colors.background }]}>
              <MaterialCommunityIcons name="wallet" size={18} color={theme.colors.onSurface} />
            </View>
            <View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSecondaryContainer, opacity: 0.8 }}>My Spending</Text>
                <Text variant="labelLarge" style={{ color: theme.colors.onSecondaryContainer, fontWeight: 'bold' }}>
                    {loading ? "..." : formattedMyCost}
                </Text>
            </View>
          </View>
        </TouchableRipple>
      </Surface>

      {/* Total Cost - "Tonal" Card */}
      <Surface style={[styles.compactStat, { backgroundColor: theme.colors.tertiaryContainer }]} elevation={0}>
        <TouchableRipple onPress={onTotalCostsPress} style={{ flex: 1 }}>
          <View style={styles.compactStatContent}>
             <View style={[styles.miniIcon, { backgroundColor: theme.colors.background }]}>
              <MaterialCommunityIcons name="chart-pie" size={18} color={theme.colors.onSurface} />
            </View>
            <View>
                <Text variant="labelSmall" style={{ color: theme.colors.onTertiaryContainer, opacity: 0.8 }}>Group Total</Text>
                <Text variant="labelLarge" style={{ color: theme.colors.onTertiaryContainer, fontWeight: 'bold' }}>
                    {loading ? "..." : formattedGroupCost}
                </Text>
            </View>
          </View>
        </TouchableRipple>
      </Surface>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 2. Compact Stats (Top for Google design - Stats usually context) OR Bottom? User liked priority settlement.
          Let's keep Settlements top as user requested "prioritizing settlement". */}
      
      {/* 1. Settlements List */}
      <View style={styles.section}>
        {/* Header - Google style: Label Large, subtle */}
        {myDebts.length > 0 
            ? <Text variant="labelLarge" style={{ color: theme.colors.primary, marginLeft: 4, marginBottom: 8 }}>Suggested Actions</Text>
            : null
        }
        
        {myDebts.length > 0 ? (
           <View style={{ gap: 12 }}>{myDebts.map(renderActionItem)}</View>
        ) : (loading || !currentUserId) ? (
             <View style={{ padding: 20, alignItems: 'center' }}>
                <Text variant="bodySmall" style={{ opacity: 0.5 }}>Updating balances...</Text>
             </View>
        ) : (
          <Surface style={styles.emptyStateCard} elevation={0}>
             {currentUserId ? (
                 <>
                    <MaterialCommunityIcons name="check-decagram" size={24} color={theme.colors.primary} />
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>You are all caught up!</Text>
                 </>
             ) : (
                 <Text variant="bodySmall" style={{ opacity: 0.5 }}>Loading...</Text>
             )}
          </Surface>
        )}
      </View>

      {/* 2. Compact Stats */}
       {renderCompactInsights()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 24, // More breathing room (Google Design)
  },
  section: {
    gap: 4,
  },
  actionCard: {
    borderRadius: 0, // List items often don't have card borders in strict MD lists, but let's do subtle
    backgroundColor: "transparent",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16, // Generous spacing
    paddingVertical: 4,
  },
  actionInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  actionChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16, // Pill
      minWidth: 70,
      alignItems: 'center',
  },
  emptyStateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 16,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.03)',
  },
  compactStatsRow: {
      flexDirection: 'row',
      gap: 12,
  },
  compactStat: {
      flex: 1,
      borderRadius: 16, // MD3 Large corner radius
      overflow: 'hidden',
  },
  compactStatContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
  },
  miniIcon: {
      width: 32,
      height: 32,
      borderRadius: 16, // Circle
      alignItems: 'center',
      justifyContent: 'center',
  }
});
