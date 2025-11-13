import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Card,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";
import { Balance, GroupBalance } from "../types";
import { formatCurrency } from "../utils/currency";

interface BalancesSectionProps {
  groupBalances: GroupBalance[];
  overallBalances: Balance[];
  loading: boolean;
  defaultCurrency?: string;
}

export const BalancesSection: React.FC<BalancesSectionProps> = ({
  groupBalances,
  overallBalances,
  loading,
  defaultCurrency = "USD",
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<boolean>(true);

  // Separate balances into "you owe" and "you are owed"
  const youOwe = overallBalances.filter((b) => b.amount < 0);
  const youAreOwed = overallBalances.filter((b) => b.amount > 0);

  // Sort by absolute amount (largest first)
  youOwe.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  youAreOwed.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const getUserDisplayName = (balance: Balance): string => {
    return balance.email || `User ${balance.user_id.substring(0, 8)}...`;
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Pressable
          style={styles.sectionTitleRow}
          onPress={() => setExpanded(!expanded)}
        >
          <IconButton
            icon={expanded ? "chevron-down" : "chevron-right"}
            size={20}
            iconColor={theme.colors.onSurface}
            onPress={() => setExpanded(!expanded)}
            style={styles.expandButton}
          />
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Balances
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
      ) : expanded ? (
        <>
          {/* Overall Summary */}
          {overallBalances.length > 0 ? (
            <>
              {/* You Are Owed */}
              {youAreOwed.length > 0 && (
                <View style={styles.balanceGroup}>
                  <Text
                    variant="labelLarge"
                    style={[
                      styles.balanceGroupTitle,
                      { color: theme.colors.primary },
                    ]}
                  >
                    You are owed
                  </Text>
                  {youAreOwed.map((balance, index) => (
                    <React.Fragment key={balance.user_id}>
                      <Card style={styles.balanceCard} mode="outlined">
                        <Card.Content style={styles.balanceContent}>
                          <View style={styles.balanceLeft}>
                            <Text
                              variant="titleSmall"
                              style={styles.balanceName}
                            >
                              {getUserDisplayName(balance)}
                            </Text>
                          </View>
                          <View style={styles.balanceRight}>
                            <Text
                              variant="titleMedium"
                              style={[
                                styles.balanceAmount,
                                { color: "#10b981" },
                              ]}
                            >
                              {formatCurrency(
                                Math.abs(balance.amount),
                                defaultCurrency
                              )}
                            </Text>
                          </View>
                        </Card.Content>
                      </Card>
                      {index < youAreOwed.length - 1 && (
                        <View style={{ height: 8 }} />
                      )}
                    </React.Fragment>
                  ))}
                </View>
              )}

              {/* You Owe */}
              {youOwe.length > 0 && (
                <View style={[styles.balanceGroup, { marginTop: 16 }]}>
                  <Text
                    variant="labelLarge"
                    style={[
                      styles.balanceGroupTitle,
                      { color: theme.colors.error },
                    ]}
                  >
                    You owe
                  </Text>
                  {youOwe.map((balance, index) => (
                    <React.Fragment key={balance.user_id}>
                      <Card style={styles.balanceCard} mode="outlined">
                        <Card.Content style={styles.balanceContent}>
                          <View style={styles.balanceLeft}>
                            <Text
                              variant="titleSmall"
                              style={styles.balanceName}
                            >
                              {getUserDisplayName(balance)}
                            </Text>
                          </View>
                          <View style={styles.balanceRight}>
                            <Text
                              variant="titleMedium"
                              style={[
                                styles.balanceAmount,
                                { color: "#ef4444" },
                              ]}
                            >
                              {formatCurrency(
                                Math.abs(balance.amount),
                                defaultCurrency
                              )}
                            </Text>
                          </View>
                        </Card.Content>
                      </Card>
                      {index < youOwe.length - 1 && (
                        <View style={{ height: 8 }} />
                      )}
                    </React.Fragment>
                  ))}
                </View>
              )}

              {/* Per-Group Breakdown (if multiple groups or single group detail) */}
              {groupBalances.length > 0 && (
                <View style={[styles.balanceGroup, { marginTop: 24 }]}>
                  <Text
                    variant="labelLarge"
                    style={[
                      styles.balanceGroupTitle,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Per Group
                  </Text>
                  {groupBalances.map((groupBalance, groupIndex) => {
                    if (groupBalance.balances.length === 0) {
                      return null;
                    }

                    const groupYouOwe = groupBalance.balances.filter(
                      (b) => b.amount < 0
                    );
                    const groupYouAreOwed = groupBalance.balances.filter(
                      (b) => b.amount > 0
                    );

                    return (
                      <React.Fragment key={groupBalance.group_id}>
                        <Card
                          style={styles.groupBalanceCard}
                          mode="outlined"
                        >
                          <Card.Content>
                            <Text
                              variant="titleSmall"
                              style={styles.groupBalanceTitle}
                            >
                              {groupBalance.group_name}
                            </Text>

                            {/* Group: You Are Owed */}
                            {groupYouAreOwed.length > 0 && (
                              <View style={{ marginTop: 12 }}>
                                {groupYouAreOwed.map((balance) => (
                                  <View
                                    key={balance.user_id}
                                    style={styles.groupBalanceRow}
                                  >
                                    <Text
                                      variant="bodyMedium"
                                      style={styles.groupBalanceName}
                                    >
                                      {getUserDisplayName(balance)} owes you
                                    </Text>
                                    <Text
                                      variant="bodyMedium"
                                      style={[
                                        styles.groupBalanceAmount,
                                        { color: "#10b981" },
                                      ]}
                                    >
                                      {formatCurrency(
                                        Math.abs(balance.amount),
                                        defaultCurrency
                                      )}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}

                            {/* Group: You Owe */}
                            {groupYouOwe.length > 0 && (
                              <View style={{ marginTop: 8 }}>
                                {groupYouOwe.map((balance) => (
                                  <View
                                    key={balance.user_id}
                                    style={styles.groupBalanceRow}
                                  >
                                    <Text
                                      variant="bodyMedium"
                                      style={styles.groupBalanceName}
                                    >
                                      You owe {getUserDisplayName(balance)}
                                    </Text>
                                    <Text
                                      variant="bodyMedium"
                                      style={[
                                        styles.groupBalanceAmount,
                                        { color: "#ef4444" },
                                      ]}
                                    >
                                      {formatCurrency(
                                        Math.abs(balance.amount),
                                        defaultCurrency
                                      )}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </Card.Content>
                        </Card>
                        {groupIndex < groupBalances.length - 1 && (
                          <View style={{ height: 8 }} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <Card style={styles.emptyStateCard} mode="outlined">
              <Card.Content style={styles.emptyStateContent}>
                <Text
                  variant="headlineSmall"
                  style={[
                    styles.emptyStateIcon,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  💸
                </Text>
                <Text
                  variant="titleMedium"
                  style={[
                    styles.emptyStateTitle,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  No Balances Yet
                </Text>
                <Text
                  variant="bodyMedium"
                  style={[
                    styles.emptyStateMessage,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Once you add expenses with splits, balances will appear here.
                </Text>
              </Card.Content>
            </Card>
          )}
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionTitle: {
    fontWeight: "600",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  expandButton: {
    margin: 0,
    marginLeft: -8,
  },
  balanceGroup: {
    marginTop: 8,
  },
  balanceGroupTitle: {
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  balanceCard: {
    marginBottom: 0,
  },
  balanceContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  balanceLeft: {
    flex: 1,
    marginRight: 16,
  },
  balanceName: {
    fontWeight: "600",
  },
  balanceRight: {
    alignItems: "flex-end",
  },
  balanceAmount: {
    fontWeight: "bold",
  },
  groupBalanceCard: {
    marginTop: 8,
  },
  groupBalanceTitle: {
    fontWeight: "600",
  },
  groupBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  groupBalanceName: {
    flex: 1,
    marginRight: 16,
  },
  groupBalanceAmount: {
    fontWeight: "600",
  },
  emptyStateCard: {
    marginTop: 8,
  },
  emptyStateContent: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateMessage: {
    textAlign: "center",
    lineHeight: 20,
  },
});
