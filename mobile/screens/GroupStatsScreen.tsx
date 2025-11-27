import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { BalancesSection } from "../components/BalancesSection";
import { useAuth } from "../contexts/AuthContext";
import { useBalances } from "../hooks/useBalances";
import { useGroupDetails } from "../hooks/useGroups";
import { useCreateSettlement } from "../hooks/useSettlements";
import { useTransactions } from "../hooks/useTransactions";
import { Balance, GroupMember, Transaction } from "../types";
import { formatCurrency, getDefaultCurrency } from "../utils/currency";
import { SettlementFormScreen } from "./SettlementFormScreen";

export type GroupStatsMode = "my-costs" | "total-costs" | "i-owe" | "im-owed";

interface GroupStatsScreenProps {
  groupId: string;
  mode: GroupStatsMode;
  onBack: () => void;
}

const MODE_COPY: Record<
  GroupStatsMode,
  { title: string; subtitle: string; summaryLabel: string }
> = {
  "my-costs": {
    title: "My Costs",
    subtitle: "Only expenses you’re part of or are owed for.",
    summaryLabel: "Your share",
  },
  "total-costs": {
    title: "Total Costs",
    subtitle: "Breakdown of every member’s share.",
    summaryLabel: "Group total",
  },
  "i-owe": {
    title: "People You Owe",
    subtitle: "All outstanding balances you need to settle.",
    summaryLabel: "Total to pay",
  },
  "im-owed": {
    title: "People Who Owe You",
    subtitle: "See who still needs to settle up.",
    summaryLabel: "Total receivable",
  },
};

export const GroupStatsScreen: React.FC<GroupStatsScreenProps> = ({
  groupId,
  mode,
  onBack,
}) => {
  const theme = useTheme();
  const defaultCurrency = getDefaultCurrency();
  const { session } = useAuth();
  const [settlingBalance, setSettlingBalance] = useState<Balance | null>(null);
  const [showSettlementForm, setShowSettlementForm] = useState(false);

  const colorStyles = useMemo(
    () => ({
      container: { backgroundColor: theme.colors.background },
      appbar: { backgroundColor: theme.colors.background },
      summaryCard: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
      },
      summaryLabel: { color: theme.colors.onSurfaceVariant },
      summaryValue: { color: theme.colors.onSurface },
      summaryHelpText: { color: theme.colors.onSurfaceVariant },
      divider: { backgroundColor: theme.colors.outlineVariant },
      sectionHeading: { color: theme.colors.onSurface },
      entryCard: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        borderWidth: StyleSheet.hairlineWidth,
      },
      entrySubtext: { color: theme.colors.onSurfaceVariant },
      entryNote: { color: theme.colors.onSurfaceVariant },
      emptyState: { color: theme.colors.onSurfaceVariant },
    }),
    [theme]
  );

  const { data: groupData } = useGroupDetails(groupId);
  const {
    data: transactions,
    isLoading: transactionsLoading,
    refetch: refetchTransactions,
  } = useTransactions(groupId);
  const {
    data: balancesData,
    isLoading: balancesLoading,
    refetch: refetchBalances,
  } = useBalances(groupId);
  const createSettlement = useCreateSettlement(async () => {
    await Promise.all([refetchBalances(), refetchTransactions()]);
  });

  const members = groupData?.members || [];
  const currentUserId = session?.user?.id;

  const memberLookup = useMemo(() => {
    const map = new Map<string, GroupMember>();
    members.forEach((member) => {
      map.set(member.user_id, member);
    });
    return map;
  }, [members]);

  const costBreakdown = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return [];
    }

    type Entry = { amount: number; email?: string };
    const map = new Map<string, Entry>();

    const upsertEntry = (
      userId: string | undefined,
      amount: number,
      email?: string
    ) => {
      if (!userId || !Number.isFinite(amount)) return;
      const existing = map.get(userId) || { amount: 0, email };
      map.set(userId, {
        amount: existing.amount + amount,
        email: existing.email || email,
      });
    };

    transactions
      .filter((transaction) => transaction.type !== "income")
      .forEach((transaction) => {
        if (transaction.splits && transaction.splits.length > 0) {
          transaction.splits.forEach((split) => {
            upsertEntry(split.user_id, split.amount, split.email);
          });
          return;
        }

        if (transaction.split_among && transaction.split_among.length > 0) {
          const share = transaction.amount / transaction.split_among.length;
          transaction.split_among.forEach((userId) =>
            upsertEntry(userId, share)
          );
          return;
        }

        // Fallback: attribute to payer or creator
        upsertEntry(
          transaction.paid_by || transaction.user_id,
          transaction.amount
        );
      });

    return Array.from(map.entries())
      .map(([userId, entry]) => ({
        userId,
        amount: entry.amount,
        email: entry.email,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const totalCost = useMemo(
    () => costBreakdown.reduce((sum, entry) => sum + entry.amount, 0),
    [costBreakdown]
  );

  const myShare = useMemo(() => {
    if (!currentUserId) return 0;
    return (
      costBreakdown.find((entry) => entry.userId === currentUserId)?.amount || 0
    );
  }, [costBreakdown, currentUserId]);

  const myTransactionBreakdown = useMemo(() => {
    if (!transactions || !currentUserId) return [];

    return transactions
      .filter((transaction) => transaction.type !== "income")
      .map((transaction) => {
        let shareAmount: number | null = null;

        if (transaction.splits && transaction.splits.length > 0) {
          const mySplit = transaction.splits.find(
            (split) => split.user_id === currentUserId
          );
          if (mySplit) {
            shareAmount = mySplit.amount;
          }
        } else if (
          transaction.split_among &&
          transaction.split_among.length > 0 &&
          transaction.split_among.includes(currentUserId)
        ) {
          shareAmount = transaction.amount / transaction.split_among.length;
        }

        const isPayer = transaction.paid_by === currentUserId;
        const involved = isPayer || shareAmount !== null;

        if (!involved) return null;

        const netReceivable =
          isPayer && transaction.amount
            ? transaction.amount - (shareAmount ?? 0)
            : null;

        return {
          transaction,
          shareAmount,
          isPayer,
          netReceivable,
        };
      })
      .filter(
        (
          entry
        ): entry is {
          transaction: Transaction;
          shareAmount: number | null;
          isPayer: boolean;
          netReceivable: number | null;
        } => entry !== null
      );
  }, [transactions, currentUserId]);

  const filteredBalances = useMemo(() => {
    const balances = balancesData?.overall_balances || [];
    if (mode === "i-owe") {
      return balances.filter((balance) => balance.amount < 0);
    }
    if (mode === "im-owed") {
      return balances.filter((balance) => balance.amount > 0);
    }
    return balances;
  }, [balancesData, mode]);

  const balanceTotal = useMemo(
    () =>
      filteredBalances.reduce(
        (sum, balance) => sum + Math.abs(balance.amount),
        0
      ),
    [filteredBalances]
  );

  const resolveUserLabel = (userId: string, fallback?: string) => {
    const memberEmail = memberLookup.get(userId)?.email;
    if (memberEmail) return memberEmail;
    if (fallback) return fallback;
    return `User ${userId.substring(0, 8)}...`;
  };

  const renderMemberBreakdown = () => {
    if (transactionsLoading) {
      return <ActivityIndicator style={{ marginTop: 24 }} />;
    }

    if (costBreakdown.length === 0) {
      return (
        <Text style={styles.emptyState}>
          No expenses yet. Add a transaction to build this view.
        </Text>
      );
    }

    return costBreakdown.map((entry, index) => {
      const percentage = totalCost === 0 ? 0 : (entry.amount / totalCost) * 100;
      return (
        <Surface
          key={entry.userId}
          style={[
            styles.entryCard,
            colorStyles.entryCard,
            index === 0 && { marginTop: 8 },
          ]}
          elevation={1}
        >
          <View style={styles.entryHeader}>
            <View>
              <Text variant="titleSmall" style={{ fontWeight: "600" }}>
                {resolveUserLabel(entry.userId, entry.email)}
              </Text>
              <Text style={[styles.entrySubtext, colorStyles.entrySubtext]}>
                {percentage.toFixed(1)}% of group costs
              </Text>
            </View>
            <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
              {formatCurrency(entry.amount, defaultCurrency)}
            </Text>
          </View>
        </Surface>
      );
    });
  };

  const renderMyTransactions = () => {
    if (transactionsLoading) {
      return <ActivityIndicator style={{ marginTop: 24 }} />;
    }

    if (myTransactionBreakdown.length === 0) {
      return (
        <Text style={[styles.emptyState, colorStyles.emptyState]}>
          No transactions involve you yet.
        </Text>
      );
    }

    return myTransactionBreakdown.map((entry, index) => {
      const currency = entry.transaction.currency || defaultCurrency;
      const transactionDate = new Date(
        entry.transaction.date
      ).toLocaleDateString();

      return (
        <Surface
          key={entry.transaction.id}
          style={[
            styles.entryCard,
            colorStyles.entryCard,
            index === 0 && { marginTop: 8 },
          ]}
          elevation={1}
        >
          <View style={styles.entryHeader}>
            <View>
              <Text variant="titleSmall" style={{ fontWeight: "600" }}>
                {entry.transaction.description || "Untitled expense"}
              </Text>
              <Text style={[styles.entrySubtext, colorStyles.entrySubtext]}>
                {transactionDate}
              </Text>
            </View>
            <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
              {formatCurrency(entry.transaction.amount, currency)}
            </Text>
          </View>
          {entry.shareAmount !== null && (
            <Text style={[styles.entryNote, colorStyles.entryNote]}>
              You owe {formatCurrency(entry.shareAmount, currency)} for this
              expense.
            </Text>
          )}
          {entry.isPayer &&
            entry.netReceivable !== null &&
            entry.netReceivable > 0 && (
              <Text style={[styles.entryNote, colorStyles.entryNote]}>
                Others owe you {formatCurrency(entry.netReceivable, currency)}.
              </Text>
            )}
        </Surface>
      );
    });
  };

  const renderCostContent = () => {
    const summaryValue = mode === "my-costs" ? myShare : totalCost;

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Surface
          style={[styles.summaryCard, colorStyles.summaryCard]}
          elevation={2}
        >
          <Text
            variant="labelMedium"
            style={[styles.summaryLabel, colorStyles.summaryLabel]}
          >
            {MODE_COPY[mode].summaryLabel}
          </Text>
          <Text
            variant="headlineMedium"
            style={[styles.summaryValue, colorStyles.summaryValue]}
          >
            {transactionsLoading
              ? "..."
              : formatCurrency(summaryValue, defaultCurrency)}
          </Text>
          <Text style={[styles.summaryHelpText, colorStyles.summaryHelpText]}>
            {MODE_COPY[mode].subtitle}
          </Text>
        </Surface>

        <Text
          variant="titleMedium"
          style={[styles.sectionHeading, colorStyles.sectionHeading]}
        >
          {mode === "my-costs" ? "My transactions" : "Member breakdown"}
        </Text>

        {mode === "my-costs" ? renderMyTransactions() : renderMemberBreakdown()}
      </ScrollView>
    );
  };

  const renderBalanceContent = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Surface
        style={[styles.summaryCard, colorStyles.summaryCard]}
        elevation={2}
      >
        <Text
          variant="labelMedium"
          style={[styles.summaryLabel, colorStyles.summaryLabel]}
        >
          {MODE_COPY[mode].summaryLabel}
        </Text>
        <Text
          variant="headlineMedium"
          style={[styles.summaryValue, colorStyles.summaryValue]}
        >
          {balancesLoading
            ? "..."
            : formatCurrency(balanceTotal, defaultCurrency)}
        </Text>
        <Text style={[styles.summaryHelpText, colorStyles.summaryHelpText]}>
          {MODE_COPY[mode].subtitle}
        </Text>
      </Surface>

      <BalancesSection
        groupBalances={[]}
        overallBalances={filteredBalances}
        loading={balancesLoading}
        defaultCurrency={defaultCurrency}
        showOverallBalances
        currentUserId={session?.user?.id}
        groupMembers={members}
        onSettleUp={(balance) => {
          setSettlingBalance(balance);
          setShowSettlementForm(true);
        }}
      />

      {!balancesLoading && filteredBalances.length === 0 && (
        <Text
          style={[styles.emptyState, colorStyles.emptyState, { marginTop: 24 }]}
        >
          {mode === "i-owe"
            ? "You’re all settled. No one to pay right now."
            : "Nice! Everyone has paid you back."}
        </Text>
      )}
    </ScrollView>
  );

  const isCostMode = mode === "my-costs" || mode === "total-costs";

  return (
    <>
      <SafeAreaView style={[styles.container, colorStyles.container]}>
        <Appbar.Header style={colorStyles.appbar}>
          <Appbar.BackAction onPress={onBack} />
          <Appbar.Content title={MODE_COPY[mode].title} />
        </Appbar.Header>
        {isCostMode ? renderCostContent() : renderBalanceContent()}
      </SafeAreaView>

      <SettlementFormScreen
        visible={showSettlementForm}
        balance={settlingBalance}
        settlement={null}
        groupMembers={members}
        currentUserId={session?.user?.id || ""}
        groupId={groupId}
        defaultCurrency={defaultCurrency}
        onSave={async (data) => {
          await createSettlement.mutate(data);
          setShowSettlementForm(false);
          setSettlingBalance(null);
        }}
        onDismiss={() => {
          setShowSettlementForm(false);
          setSettlingBalance(null);
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  summaryLabel: {
    opacity: 0.7,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontWeight: "bold",
    marginTop: 8,
  },
  summaryHelpText: {
    marginTop: 4,
    opacity: 0.7,
  },
  sectionHeading: {
    marginBottom: 12,
  },
  entryCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  entrySubtext: {
    opacity: 0.7,
    marginTop: 4,
  },
  entryNote: {
    opacity: 0.8,
  },
  emptyState: {
    textAlign: "center",
    opacity: 0.7,
  },
});
