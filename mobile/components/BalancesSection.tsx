
import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
    ActivityIndicator,
    Avatar,
    Button,
    Divider,
    IconButton,
    Surface,
    Text,
    useTheme
} from "react-native-paper";
import { Balance, GroupBalance } from "../types";
import { formatCurrency } from "../utils/currency";
import { styles } from "./BalancesSection.styles";

interface BalancesSectionProps {
  groupBalances: GroupBalance[];
  overallBalances?: Balance[]; // Optional - if not provided, only show group balances
  loading: boolean;
  defaultCurrency?: string;
  showOverallBalances?: boolean; // If false, hide overall balances section
  onSettleUp?: (balance: Balance) => void; // Callback when user wants to settle a balance
  currentUserId?: string; // Current user ID to determine if balance is payable
  groupMembers?: Array<{ user_id: string; email?: string }>; // Group members for settlement
}

export const BalancesSection: React.FC<BalancesSectionProps> = ({
  groupBalances,
  overallBalances = [],
  loading,
  defaultCurrency = "USD",
  showOverallBalances = true,
  onSettleUp,
  currentUserId,
  groupMembers = [],
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<boolean>(false);

  // Separate balances into "you owe" and "you are owed" (memoized for performance)
  const { youOwe, youAreOwed } = useMemo(() => {
    const owe = overallBalances.filter((b) => b.amount < 0);
    const owed = overallBalances.filter((b) => b.amount > 0);
    
    // Sort by absolute amount (largest first)
    owe.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    owed.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    
    return { youOwe: owe, youAreOwed: owed };
  }, [overallBalances]);

  const getUserDisplayName = (balance: Balance): string => {
    // Find the member by user_id
    const member = groupMembers.find(m => m.user_id === balance.user_id);
    // Prioritize email if available, otherwise use a truncated user_id
    return member?.email || `User ${balance.user_id.substring(0, 8)}...`;
  };

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <Surface style={styles.sectionSurface} elevation={1}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.sectionTitleContainer}>
          <Avatar.Icon 
            size={32} 
            icon="scale-balance" 
            style={{ backgroundColor: theme.colors.errorContainer, marginRight: 12 }} 
            color={theme.colors.onErrorContainer}
          />
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Your Balances
          </Text>
        </View>
        <IconButton
          icon={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          onPress={() => setExpanded(!expanded)}
        />
      </Pressable>

      {loading ? (
        <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
      ) : expanded ? (
        <View style={styles.sectionContent}>
          {/* Overall Summary - only show if showOverallBalances is true */}
          {showOverallBalances && overallBalances.length > 0 && (
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
                  <Surface elevation={0} style={{ backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
                    {youAreOwed.map((balance, index) => (
                      <React.Fragment key={balance.user_id}>
                        <View style={styles.balanceContent}>
                          <Avatar.Text 
                            size={40} 
                            label={getInitials(getUserDisplayName(balance))} 
                            style={{ backgroundColor: theme.colors.primaryContainer, marginRight: 12 }}
                            color={theme.colors.onPrimaryContainer}
                          />
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
                            {onSettleUp && (
                              <Button
                                mode="text"
                                onPress={() => onSettleUp(balance)}
                                compact
                                textColor={theme.colors.primary}
                              >
                                Received
                              </Button>
                            )}
                          </View>
                        </View>
                        {index < youAreOwed.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </Surface>
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
                  <Surface elevation={0} style={{ backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
                    {youOwe.map((balance, index) => (
                      <React.Fragment key={balance.user_id}>
                        <View style={styles.balanceContent}>
                          <Avatar.Text 
                            size={40} 
                            label={getInitials(getUserDisplayName(balance))} 
                            style={{ backgroundColor: theme.colors.errorContainer, marginRight: 12 }}
                            color={theme.colors.onErrorContainer}
                          />
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
                            {onSettleUp && (
                              <Button
                                mode="text"
                                onPress={() => onSettleUp(balance)}
                                compact
                                textColor={theme.colors.error}
                              >
                                Pay
                              </Button>
                            )}
                          </View>
                        </View>
                        {index < youOwe.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </Surface>
                </View>
              )}
            </>
          )}

          {/* Per-Group Breakdown - always show if we have group data */}
          {groupBalances.length > 0 && (
            <View
              style={[
                styles.balanceGroup,
                {
                  marginTop:
                    showOverallBalances && overallBalances.length > 0 ? 24 : 0,
                },
              ]}
            >
              {groupBalances.map((groupBalance, groupIndex) => {
                const groupYouOwe = groupBalance.balances.filter(
                  (b) => b.amount < 0
                );
                const groupYouAreOwed = groupBalance.balances.filter(
                  (b) => b.amount > 0
                );

                const hasBalances =
                  groupYouOwe.length > 0 || groupYouAreOwed.length > 0;

                if (!hasBalances) return null;

                return (
                  <React.Fragment key={groupBalance.group_id}>
                    <Text
                      variant="titleSmall"
                      style={[styles.groupBalanceTitle, { marginTop: groupIndex > 0 ? 16 : 0 }]}
                    >
                      {groupBalance.group_name}
                    </Text>
                    
                    <Surface elevation={0} style={{ backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
                      {/* Group: You Are Owed */}
                      {groupYouAreOwed.map((balance, idx) => (
                        <React.Fragment key={balance.user_id}>
                          <View style={styles.balanceContent}>
                            <Avatar.Text 
                              size={40} 
                              label={getInitials(getUserDisplayName(balance))} 
                              style={{ backgroundColor: theme.colors.primaryContainer, marginRight: 12 }}
                              color={theme.colors.onPrimaryContainer}
                            />
                            <View style={styles.balanceLeft}>
                              <Text variant="bodyMedium" style={styles.balanceName}>
                                {getUserDisplayName(balance)} owes you
                              </Text>
                            </View>
                            <View style={styles.balanceRight}>
                              <Text
                                variant="bodyMedium"
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
                              {onSettleUp && (
                                <Button
                                  mode="text"
                                  onPress={() => onSettleUp(balance)}
                                  compact
                                  textColor={theme.colors.primary}
                                >
                                  Received
                                </Button>
                              )}
                            </View>
                          </View>
                          {(idx < groupYouAreOwed.length - 1 || groupYouOwe.length > 0) && <Divider />}
                        </React.Fragment>
                      ))}

                      {/* Group: You Owe */}
                      {groupYouOwe.map((balance, idx) => (
                        <React.Fragment key={balance.user_id}>
                          <View style={styles.balanceContent}>
                            <Avatar.Text 
                              size={40} 
                              label={getInitials(getUserDisplayName(balance))} 
                              style={{ backgroundColor: theme.colors.errorContainer, marginRight: 12 }}
                              color={theme.colors.onErrorContainer}
                            />
                            <View style={styles.balanceLeft}>
                              <Text variant="bodyMedium" style={styles.balanceName}>
                                You owe {getUserDisplayName(balance)}
                              </Text>
                            </View>
                            <View style={styles.balanceRight}>
                              <Text
                                variant="bodyMedium"
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
                              {onSettleUp && (
                                <Button
                                  mode="text"
                                  onPress={() => onSettleUp(balance)}
                                  compact
                                  textColor={theme.colors.error}
                                >
                                  Pay
                                </Button>
                              )}
                            </View>
                          </View>
                          {idx < groupYouOwe.length - 1 && <Divider />}
                        </React.Fragment>
                      ))}
                    </Surface>
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {/* Empty State - show if no data at all */}
          {(showOverallBalances &&
            overallBalances.length === 0 &&
            groupBalances.length === 0) ||
          (!showOverallBalances && groupBalances.length === 0) ? (
            <View style={styles.emptyStateContent}>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}
              >
                No balances yet
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Surface>
  );
};
