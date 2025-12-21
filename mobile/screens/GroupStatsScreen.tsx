import React, { useEffect, useMemo, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  SegmentedButtons,
  Surface,
  Text,
  TouchableRipple,
  useTheme
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { BalancesSection } from "../components/BalancesSection";
import { useAuth } from "../contexts/AuthContext";
import { useBalances } from "../hooks/useBalances";
import { useGroupDetails } from "../hooks/useGroups";
import { useParticipants } from "../hooks/useParticipants";
import { useCreateSettlement } from "../hooks/useSettlements";
import { useTransactions } from "../hooks/useTransactions";
import { Balance, GroupMember, Participant, Transaction } from "../types";
import {
  formatCurrency,
  formatTotals,
  getDefaultCurrency,
} from "../utils/currency";
import { simplifyDebts } from "../utils/debt";
import { SettlementFormScreen } from "./SettlementFormScreen";

export type GroupStatsMode = "my-costs" | "total-costs" | "settlement-plan" | "i-owe" | "im-owed";

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
    title: "Group Summary",
    subtitle: "Breakdown of every member’s share.",
    summaryLabel: "Group total",
  },
  "settlement-plan": {
    title: "Group Summary",
    subtitle: "Simplified plan to clear all group debts.",
    summaryLabel: "Total group debt",
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
  const [activeMode, setActiveMode] = useState<GroupStatsMode>(mode);
  const theme = useTheme();
  const defaultCurrency = getDefaultCurrency();
  const { session } = useAuth();
  const [settlingBalance, setSettlingBalance] = useState<Balance | null>(null);
  const [settlementInitialData, setSettlementInitialData] = useState<{
    fromParticipantId: string;
    toParticipantId: string;
    amount: number;
    currency: string;
  } | null>(null);
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

  // Handle Android hardware back button
  useEffect(() => {
    const handleHardwareBack = () => {
      onBack();
      return true; // Prevent default back behavior (exiting app)
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleHardwareBack
    );
    return () => subscription.remove();
  }, [onBack]);

  const { data: participantsData = [] } = useParticipants(groupId);
  const members = groupData?.members || [];
  const participants = participantsData || [];
  const currentUserId = session?.user?.id;
  
  const currentUserParticipantId = useMemo(() => {
    return participants.find((p: Participant) => p.user_id === currentUserId)?.id;
  }, [participants, currentUserId]);

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

    type Entry = {
      amounts: Map<string, number>;
      full_name?: string | null;
      email?: string;
      userId?: string;
      participantId?: string; // Cache the key
    };
    const map = new Map<string, Entry>(); // Keyed by participant_id

    const upsertEntry = (
      participantId: string | undefined,
      userId: string | undefined,
      amount: number,
      currency: string,
      full_name?: string | null,
      email?: string
    ) => {
      if (!participantId || !Number.isFinite(amount)) return;
      const existing = map.get(participantId) || {
        amounts: new Map<string, number>(),
        userId,
        participantId,
        full_name,
        email,
      };

      // Preserve full_name if it exists
      if (full_name) {
        existing.full_name = full_name;
      }
      if (email && !existing.email) {
        existing.email = email;
      }

      const currentAmount = existing.amounts.get(currency) || 0;
      existing.amounts.set(currency, currentAmount + amount);

      map.set(participantId, existing);
    };

    transactions
      .filter((transaction) => transaction.type !== "income")
      .forEach((transaction) => {
        const currency = transaction.currency || defaultCurrency;
        if (transaction.splits && transaction.splits.length > 0) {
          transaction.splits.forEach((split) => {
            upsertEntry(
              split.participant_id,
              split.user_id || undefined,
              split.amount,
              currency,
              split.full_name || undefined,
              split.email || undefined
            );
          });
          return;
        }

        if (transaction.split_among_participant_ids && transaction.split_among_participant_ids.length > 0) {
          const share = transaction.amount / transaction.split_among_participant_ids.length;
          transaction.split_among_participant_ids.forEach((pId) => {
             // We don't have user_id here but we have pId
             upsertEntry(pId, undefined, share, currency);
          });
          return;
        }

        if (transaction.split_among && transaction.split_among.length > 0) {
          const share = transaction.amount / transaction.split_among.length;
          transaction.split_among.forEach((uId) => {
             // Legacy mode: uId is used as both PID and UID if PID missing
             upsertEntry(uId, uId, share, currency);
          });
          return;
        }

        // Fallback: attribute to payer or creator
        const pId = transaction.paid_by_participant_id || transaction.paid_by || transaction.user_id;
        const uId = transaction.paid_by || transaction.user_id;
        upsertEntry(
          pId,
          uId,
          transaction.amount,
          currency
        );
      });

    return Array.from(map.entries())
      .map(([participantId, entry]) => {
        // Get full_name from member lookup or participants if not in entry
        const member = entry.userId ? memberLookup.get(entry.userId) : null;
        const participant = participants.find(p => p.id === participantId);
        
        return {
          participantId,
          userId: entry.userId,
          amounts: entry.amounts,
          full_name: entry.full_name || participant?.full_name || member?.full_name || null,
          email: entry.email || participant?.email || member?.email,
          // Calculate total value for sorting (simplified, assumes 1:1 for sorting only)
          totalValue: Array.from(entry.amounts.values()).reduce(
            (a, b) => a + b,
            0
          ),
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue);

  }, [transactions, defaultCurrency]);

  const paymentsBreakdown = useMemo(() => {
     if (!transactions) return new Map<string, Map<string, number>>();
     const map = new Map<string, Map<string, number>>();

     transactions
        .filter(t => t.type !== 'income')
        .forEach(t => {
            const payerPid = t.paid_by_participant_id || t.paid_by || t.user_id;
            if (!payerPid) return;
            
            const currency = t.currency || defaultCurrency;
            const userMap = map.get(payerPid) || new Map<string, number>();
            const current = userMap.get(currency) || 0;
            userMap.set(currency, current + t.amount);
            map.set(payerPid, userMap);
        });
     return map;
  }, [transactions, defaultCurrency]);

  const totalCosts = useMemo(() => {
    const totals = new Map<string, number>();
    costBreakdown.forEach((entry) => {
      entry.amounts.forEach((amount, currency) => {
        const current = totals.get(currency) || 0;
        totals.set(currency, current + amount);
      });
    });
    return totals;
  }, [costBreakdown]);

  const myShare = useMemo(() => {
    if (!currentUserId) return new Map<string, number>();
    return (
      costBreakdown.find((entry) => entry.userId === currentUserId)?.amounts ||
      new Map<string, number>()
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
    const balances = balancesData?.group_balances?.[0]?.balances || balancesData?.overall_balances || [];
    if (activeMode === "i-owe") {
      return balances.filter((balance) => balance.amount < 0);
    }
    if (activeMode === "im-owed") {
      return balances.filter((balance) => balance.amount > 0);
    }
    return balances;
  }, [balancesData, activeMode]);

  const balanceTotals = useMemo(() => {
    const totals = new Map<string, number>();
    filteredBalances.forEach((balance) => {
      const current = totals.get(balance.currency) || 0;
      totals.set(balance.currency, current + Math.abs(balance.amount));
    });
    return totals;
  }, [filteredBalances]);

  const settlementEdges = useMemo(() => {
    if ((activeMode !== "total-costs" && activeMode !== "settlement-plan") || filteredBalances.length === 0) return [];
    // Calculate full graph of settlements
    return simplifyDebts(filteredBalances, currentUserId, defaultCurrency, currentUserParticipantId);
  }, [filteredBalances, activeMode, currentUserId, defaultCurrency, currentUserParticipantId]);

  const resolveUserLabel = (userId: string | undefined, fallback?: string) => {
    if (userId) {
      const member = memberLookup.get(userId);
      if (member?.full_name) return member.full_name;
      if (member?.email) return member.email;
    }
    if (fallback) return fallback;
    return userId ? `User ${userId.substring(0, 8)}...` : "Member";
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

    const overpaid: typeof costBreakdown = [];
    const underpaid: typeof costBreakdown = [];
    const settled: typeof costBreakdown = [];

    costBreakdown.forEach(entry => {
        const userBals = filteredBalances.filter(b => 
            (b.participant_id && b.participant_id === entry.participantId) || 
            (b.user_id && entry.userId && b.user_id === entry.userId)
        );
        const hasPositive = userBals.some(b => b.amount > 0.01);
        const hasNegative = userBals.some(b => b.amount < -0.01);

        if (hasPositive && !hasNegative) overpaid.push(entry);
        else if (hasNegative) underpaid.push(entry);
        else settled.push(entry);
    });

    const renderEntry = (entry: typeof costBreakdown[0], index: number) => {
        const isMe = entry.participantId === currentUserParticipantId || (entry.userId && entry.userId === currentUserId);
        return (
          <Surface
            key={entry.participantId}
            style={[
              styles.entryCard,
              colorStyles.entryCard,
            ]}
            elevation={1}
          >
            <View style={[styles.entryHeader, { alignItems: 'center' }]}>
              {/* 1. Avatar / Initials */}
              <Avatar.Text 
                size={40} 
                label={(entry.full_name || resolveUserLabel(entry.userId, entry.email)).substring(0, 2).toUpperCase()} 
                style={{ 
                    marginRight: 12, 
                    backgroundColor: isMe ? theme.colors.primaryContainer : theme.colors.elevation.level2 
                }}
              />
  
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: "bold", color: isMe ? theme.colors.primary : theme.colors.onSurface }}>
                  {entry.full_name || resolveUserLabel(entry.userId, entry.email)}
                  {isMe && " (YOU)"}
                </Text>
                
                {/* Paid vs Share Comparison */}
                {(() => {
                    const paidMap = paymentsBreakdown.get(entry.participantId) || new Map<string, number>();
                    const paidText = formatTotals(paidMap, defaultCurrency);
                    const shareText = formatTotals(entry.amounts, defaultCurrency);
                    
                    return (
                        <Text variant="labelSmall" style={{ opacity: 0.6, marginTop: 2 }}>
                            Paid {paidText} • Share {shareText}
                        </Text>
                    );
                })()}
              </View>
  
              {/* 2. Net Balance & Status */}
              <View style={{ alignItems: 'flex-end' }}>
                   {(() => {
                        const userBals = filteredBalances.filter(b => 
                            (b.participant_id && b.participant_id === entry.participantId) || 
                            (b.user_id && entry.userId && b.user_id === entry.userId)
                        );
                        const isOverpaid = userBals.some(b => b.amount > 0.01);
                        const isUnderpaid = userBals.some(b => b.amount < -0.01);
                        const isSettledStatus = !isOverpaid && !isUnderpaid;
  
                        return (
                            <>
                              {userBals.length > 0 ? (
                                  userBals.map((bal, i) => (
                                      <Text key={i} variant="titleMedium" style={{ 
                                          color: bal.amount >= 0 ? theme.colors.primary : theme.colors.error, 
                                          fontWeight: 'bold' 
                                      }}>
                                          {bal.amount >= 0 ? "+" : ""}{formatCurrency(bal.amount, bal.currency)}
                                      </Text>
                                  ))
                              ) : (
                                  <Text variant="titleMedium" style={{ opacity: 0.3, fontWeight: 'bold' }}>
                                      {formatCurrency(0, defaultCurrency)}
                                  </Text>
                              )}
  
                              <Text variant="labelSmall" style={{ 
                                  fontWeight: 'bold',
                                  color: isOverpaid ? theme.colors.primary : isUnderpaid ? theme.colors.error : theme.colors.onSurfaceVariant,
                                  opacity: isSettledStatus ? 0.3 : 1,
                                  marginTop: 2
                              }}>
                                  {isOverpaid ? "GETS BACK" : isUnderpaid ? "OWES" : "SETTLED"}
                              </Text>
                            </>
                        );
                   })()}
              </View>
            </View>
          </Surface>
        );
    };

    return (
        <View style={{ gap: 24 }}>
            {overpaid.length > 0 && (
                <View style={{ gap: 8 }}>
                    <Text variant="labelLarge" style={{ opacity: 0.5, marginLeft: 4 }}>People to be Paid</Text>
                    {overpaid.map(renderEntry)}
                </View>
            )}
            
            {underpaid.length > 0 && (
                <View style={{ gap: 8 }}>
                    <Text variant="labelLarge" style={{ opacity: 0.5, marginLeft: 4 }}>People who Owe</Text>
                    {underpaid.map(renderEntry)}
                </View>
            )}

            {settled.length > 0 && (
                <View style={{ gap: 8 }}>
                    <Text variant="labelLarge" style={{ opacity: 0.5, marginLeft: 4 }}>Settled</Text>
                    {settled.map(renderEntry)}
                </View>
            )}
        </View>
    );
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

  const renderSettlementPlan = () => {
     if (settlementEdges.length === 0) return null;

     return (
        <View style={{ marginTop: 24 }}>
            <Text
              variant="titleMedium"
              style={[styles.sectionHeading, colorStyles.sectionHeading, { marginBottom: 16 }]}
            >
              Recommended Settlements
            </Text>
            {settlementEdges.map((edge, index) => {
                const isFromMe = edge.fromUser.user_id === currentUserId;
                const isToMe = edge.toUser.user_id === currentUserId;
                const isInvolved = isFromMe || isToMe;

                // Google Material 3 semantic colors
                const amountColor = isToMe ? "#1e8e3e" : isFromMe ? "#d93025" : theme.colors.onSurface;

                const fromName = isFromMe ? "You" : (edge.fromUser.full_name || edge.fromUser.email?.split("@")[0] || "User");
                const toName = isToMe ? "You" : (edge.toUser.full_name || edge.toUser.email?.split("@")[0] || "User");

                // If involved, show the "other" person's avatar to match dashboard feel
                const otherUser = isToMe ? edge.fromUser : edge.toUser;
                const avatarUser = isInvolved ? otherUser : edge.fromUser;

                return (
                    <Surface
                        key={`${edge.currency}-${edge.fromUser.participant_id || edge.fromUser.user_id}-${edge.toUser.participant_id || edge.toUser.user_id}`}
                        style={styles.actionCard}
                        elevation={0}
                    >
                        <TouchableRipple 
                            onPress={() => {
                                const fromPid = edge.fromUser.participant_id || memberLookup.get(edge.fromUser.user_id)?.participant_id;
                                const toPid = edge.toUser.participant_id || memberLookup.get(edge.toUser.user_id)?.participant_id;
                                
                                if (fromPid && toPid) {
                                    setSettlementInitialData({
                                        fromParticipantId: fromPid,
                                        toParticipantId: toPid,
                                        amount: edge.amount,
                                        currency: edge.currency
                                    });
                                    setShowSettlementForm(true);
                                }
                            }}
                            style={{ paddingVertical: 4, paddingHorizontal: 4 }}
                        >
                            <View style={styles.actionRow}>
                                <Avatar.Text 
                                    size={40} 
                                    label={(avatarUser.full_name || resolveUserLabel(avatarUser.user_id, avatarUser.email)).substring(0, 2).toUpperCase()} 
                                    style={{ 
                                        backgroundColor: avatarUser.user_id === currentUserId ? theme.colors.primaryContainer : theme.colors.surfaceVariant 
                                    }}
                                    color={avatarUser.user_id === currentUserId ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant}
                                />
                                
                                <View style={styles.actionInfo}>
                                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '500' }}>
                                        {isInvolved ? (isToMe ? fromName : toName) : fromName}
                                    </Text>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                        {isFromMe ? `you owe ${toName}` : isToMe ? `owes you` : `pays ${toName}`}
                                    </Text>
                                </View>

                                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                    <Text variant="titleMedium" style={{ color: amountColor, fontWeight: "700" }}>
                                        {formatCurrency(edge.amount, edge.currency)}
                                    </Text>
                                    <View style={[
                                        styles.actionChip, 
                                        { backgroundColor: isToMe ? theme.colors.secondaryContainer : isFromMe ? theme.colors.errorContainer : theme.colors.surfaceVariant } 
                                    ]}>
                                        <Text 
                                            variant="labelSmall" 
                                            style={{ 
                                                color: isToMe ? theme.colors.onSecondaryContainer : isFromMe ? theme.colors.onErrorContainer : theme.colors.onSurfaceVariant,
                                                fontWeight: '700',
                                                fontSize: 10,
                                                letterSpacing: 0.5
                                            }}
                                        >
                                            {isFromMe ? "PAY" : isToMe ? "RECEIVE" : "SETTLE"}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </TouchableRipple>
                    </Surface>
                );
            })}
        </View>
     );
  };

  const renderCostContent = () => {
    const summaryValue = activeMode === "my-costs" ? myShare : totalCosts;
    const showTabs = activeMode === "total-costs" || activeMode === "settlement-plan";

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
            {MODE_COPY[activeMode].summaryLabel}
          </Text>
          <Text
            variant="headlineSmall"
            style={[styles.summaryValue, colorStyles.summaryValue]}
          >
            {transactionsLoading ? "..." : formatTotals(summaryValue)}
          </Text>
          <Text style={[styles.summaryHelpText, colorStyles.summaryHelpText]}>
            {MODE_COPY[activeMode].subtitle}
          </Text>
        </Surface>

        {showTabs && (
            <SegmentedButtons
                value={activeMode}
                onValueChange={(val) => setActiveMode(val as GroupStatsMode)}
                style={{ marginBottom: 24 }}
                buttons={[
                    { value: 'total-costs', label: 'Totals', icon: 'account-group' },
                    { value: 'settlement-plan', label: 'Settle Up', icon: 'hand-coin' },
                ]}
            />
        )}

        <Text
          variant="titleMedium"
          style={[styles.sectionHeading, colorStyles.sectionHeading]}
        >
          {activeMode === "my-costs" ? "My transactions" : 
           activeMode === "total-costs" ? "Member breakdown" : "Settlement plan"}
        </Text>

        {activeMode === "my-costs" ? renderMyTransactions() : (
            <>
                {activeMode === "total-costs" && renderMemberBreakdown()}
                {activeMode === "settlement-plan" && renderSettlementPlan()}
            </>
        )}
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
          {MODE_COPY[activeMode].summaryLabel}
        </Text>
        <Text
          variant="headlineMedium"
          style={[styles.summaryValue, colorStyles.summaryValue]}
        >
          {balancesLoading ? "..." : formatTotals(balanceTotals)}
        </Text>
        <Text style={[styles.summaryHelpText, colorStyles.summaryHelpText]}>
          {MODE_COPY[activeMode].subtitle}
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
        participants={participants}
        onSettleUp={(balance) => {
          setSettlingBalance(balance);
          setShowSettlementForm(true);
        }}
      />

      {!balancesLoading && filteredBalances.length === 0 && (
        <Text
          style={[styles.emptyState, colorStyles.emptyState, { marginTop: 24 }]}
        >
          {activeMode === "i-owe"
            ? "You’re all settled. No one to pay right now."
            : "Nice! Everyone has paid you back."}
        </Text>
      )}
    </ScrollView>
  );

  const isCostMode = activeMode === "my-costs" || activeMode === "total-costs" || activeMode === "settlement-plan";

  return (
    <>
      <SafeAreaView style={[styles.container, colorStyles.container]}>
        <Appbar.Header style={colorStyles.appbar}>
          <Appbar.BackAction onPress={onBack} />
          <Appbar.Content title={MODE_COPY[activeMode].title} />
        </Appbar.Header>
        {isCostMode ? renderCostContent() : renderBalanceContent()}
      </SafeAreaView>

      <SettlementFormScreen
        visible={showSettlementForm}
        balance={settlingBalance}
        settlement={null}
        groupMembers={members}
        participants={participants}
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
          setSettlementInitialData(null);
        }}
        fromParticipantId={settlementInitialData?.fromParticipantId}
        toParticipantId={settlementInitialData?.toParticipantId}
        initialAmount={settlementInitialData?.amount}
        initialCurrency={settlementInitialData?.currency}
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
  actionCard: {
    backgroundColor: "transparent",
    borderRadius: 0,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 4,
  },
  actionInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  actionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 70,
    alignItems: 'center',
  },
});
