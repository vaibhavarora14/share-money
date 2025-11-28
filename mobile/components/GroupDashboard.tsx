import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
    Icon,
    Surface,
    Text,
    TouchableRipple,
    useTheme,
} from "react-native-paper";
import { Balance, Transaction } from "../types";
import { formatCurrency } from "../utils/currency";

interface GroupDashboardProps {
  balances: Balance[];
  transactions: Transaction[];
  currentUserId?: string;
  loading: boolean;
  defaultCurrency?: string;
  onOwePress?: () => void;
  onOwedPress?: () => void;
  onMyCostsPress?: () => void;
  onTotalCostsPress?: () => void;
}

export const GroupDashboard: React.FC<GroupDashboardProps> = ({
  balances,
  transactions,
  currentUserId,
  loading,
  defaultCurrency = "USD",
  onOwePress,
  onOwedPress,
  onMyCostsPress,
  onTotalCostsPress,
}) => {
  const theme = useTheme();

  const { youOwe, youAreOwed } = useMemo(() => {
    const owe = new Map<string, number>();
    const owed = new Map<string, number>();
    
    balances.forEach((b) => {
      if (b.amount < 0) {
        const current = owe.get(b.currency) || 0;
        owe.set(b.currency, current + Math.abs(b.amount));
      } else {
        const current = owed.get(b.currency) || 0;
        owed.set(b.currency, current + b.amount);
      }
    });
    return { youOwe: owe, youAreOwed: owed };
  }, [balances]);

  const { myCost, totalGroupCost } = useMemo(() => {
    const total = new Map<string, number>();
    const myTotal = new Map<string, number>();

    transactions.forEach((t) => {
      const currency = t.currency || defaultCurrency;
      
      // Total Group Cost
      const currentTotal = total.get(currency) || 0;
      total.set(currency, currentTotal + t.amount);

      // My Cost
      let myShare = 0;
      if (t.splits && t.splits.length > 0) {
        const mySplit = t.splits.find((s) => s.user_id === currentUserId);
        if (mySplit) {
          myShare = mySplit.amount;
        }
      } else if (t.split_among && t.split_among.length > 0) {
        if (t.split_among.includes(currentUserId || "")) {
          myShare = t.amount / t.split_among.length;
        }
      } else if (t.paid_by === currentUserId) {
          // If I paid and no splits defined, assuming I paid for myself? 
          // Or should we ignore? The logic in GroupStatsScreen was:
          // Fallback: attribute to payer or creator
          // But here we are calculating "My Cost" (what I consumed).
          // If I paid $100 and no splits, usually means I paid for group? Or just me?
          // Existing logic was:
          /*
            } else if (t.split_among && t.split_among.length > 0) {
                if (t.split_among.includes(currentUserId || "")) {
                myTotal += t.amount / t.split_among.length;
                }
            }
          */
          // It didn't have a fallback for "paid_by". So if no splits and no split_among, it didn't add to myTotal.
          // I will keep it consistent with previous logic.
      }
      
      if (myShare > 0) {
        const currentMyTotal = myTotal.get(currency) || 0;
        myTotal.set(currency, currentMyTotal + myShare);
      }
    });

    return { myCost: myTotal, totalGroupCost: total };
  }, [transactions, currentUserId, defaultCurrency]);

  const formatTotals = (totals: Map<string, number>) => {
    if (totals.size === 0) return formatCurrency(0, defaultCurrency);
    return Array.from(totals.entries())
      .map(([currency, amount]) => formatCurrency(amount, currency))
      .join(" + ");
  };

  const renderCard = (
    title: string,
    amounts: Map<string, number>,
    backgroundColor: string,
    textColor: string,
    icon: string,
    loadingState: boolean,
    onPress?: () => void
  ) => (
    <Surface style={[styles.card, { backgroundColor }]} elevation={2}>
      <TouchableRipple
        onPress={onPress}
        disabled={!onPress}
        style={{ flex: 1 }}
        rippleColor={textColor + "20"}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text
              variant="labelMedium"
              style={{ color: textColor, opacity: 0.8, fontWeight: "600" }}
            >
              {title}
            </Text>
            <Icon source={icon} size={20} color={textColor} />
          </View>
          <Text
            variant="headlineSmall"
            style={{ color: textColor, fontWeight: "bold", marginTop: 8 }}
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {loadingState ? "..." : formatTotals(amounts)}
          </Text>
        </View>
      </TouchableRipple>
    </Surface>
  );

  return (
    <View style={styles.container}>
      {/* Row 1: Balances */}
      <View style={styles.row}>
        <View style={styles.column}>
          {renderCard(
            "I'm owed",
            youAreOwed,
            "#dcfce7", // Light green bg
            "#15803d", // Dark green text
            "arrow-bottom-left",
            loading,
            onOwedPress
          )}
        </View>
        <View style={styles.column}>
          {renderCard(
            "I owe",
            youOwe,
            "#fee2e2", // Light red bg
            "#b91c1c", // Dark red text
            "arrow-top-right",
            loading,
            onOwePress
          )}
        </View>
      </View>

      {/* Row 2: Costs */}
      <View style={styles.row}>
        <View style={styles.column}>
          {renderCard(
            "My costs",
            myCost,
            "#e0f2fe", // Light blue bg
            "#0369a1", // Dark blue text
            "account",
            loading,
            onMyCostsPress
          )}
        </View>
        <View style={styles.column}>
          {renderCard(
            "Total costs",
            totalGroupCost,
            "#f3e8ff", // Light purple bg
            "#7e22ce", // Dark purple text
            "chart-box",
            loading,
            onTotalCostsPress
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  column: {
    flex: 1,
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    flex: 1,
  },
  cardContent: {
    padding: 16,
    minHeight: 100,
    justifyContent: "space-between",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
});
