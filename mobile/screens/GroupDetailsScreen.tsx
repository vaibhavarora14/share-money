import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  FAB,
  IconButton,
  Menu,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabase";
import { GroupWithMembers, Transaction } from "../types";
import { formatCurrency } from "../utils/currency";
import { TransactionFormScreen } from "./TransactionFormScreen";

// API URL - must be set via EXPO_PUBLIC_API_URL environment variable
const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface GroupDetailsScreenProps {
  group: GroupWithMembers;
  onBack: () => void;
  onAddMember: () => void;
  onLeaveGroup?: () => void;
  onDeleteGroup?: () => void;
  onTransactionAdded?: () => void;
}

export const GroupDetailsScreen: React.FC<GroupDetailsScreenProps> = ({
  group: initialGroup,
  onBack,
  onAddMember,
  onLeaveGroup,
  onDeleteGroup,
  onTransactionAdded,
}) => {
  const [group, setGroup] = useState<GroupWithMembers>(initialGroup);
  const [loading, setLoading] = useState<boolean>(false);
  const [leaving, setLeaving] = useState<boolean>(false);
  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [showTransactionForm, setShowTransactionForm] =
    useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] =
    useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { session, signOut } = useAuth();
  const theme = useTheme();

  const fetchGroupDetails = useCallback(async (): Promise<void> => {
    if (!API_URL) {
      setError(
        "Unable to connect to the server. Please check your app configuration and try again."
      );
      setLoading(false);
      return;
    }

    if (!session) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        setLoading(false);
        return;
      }

      const token = currentSession.access_token;

      const response = await fetch(`${API_URL}/groups/${group.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          await signOut();
          return;
        }

        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      const data: GroupWithMembers = await response.json();
      setGroup(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      if (
        !errorMessage.includes("401") &&
        !errorMessage.includes("Unauthorized")
      ) {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [group.id, session, signOut]);

  const fetchTransactions = useCallback(async (): Promise<void> => {
    if (!API_URL || !session) return;

    try {
      setTransactionsLoading(true);
      let {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) return;

      const token = currentSession.access_token;

      const response = await fetch(
        `${API_URL}/transactions?group_id=${group.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data: Transaction[] = await response.json();
        // Filter to only show transactions for this group
        const groupTransactions = data.filter((t) => t.group_id === group.id);
        setTransactions(groupTransactions);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setTransactionsLoading(false);
    }
  }, [session, group.id]);

  useEffect(() => {
    fetchGroupDetails();
    fetchTransactions();
  }, [fetchGroupDetails, fetchTransactions]);

  const handleDeleteGroup = async () => {
    Alert.alert(
      "Delete Group",
      `Are you sure you want to delete "${group.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!API_URL) {
              Alert.alert("Error", "Unable to connect to the server");
              return;
            }

            try {
              setLeaving(true);

              let {
                data: { session: currentSession },
              } = await supabase.auth.getSession();

              if (!currentSession) {
                Alert.alert("Error", "Not authenticated");
                return;
              }

              const token = currentSession.access_token;

              const response = await fetch(`${API_URL}/groups/${group.id}`, {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              });

              if (!response.ok) {
                if (response.status === 401) {
                  await signOut();
                  return;
                }

                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                  errorData.error || `HTTP error! status: ${response.status}`
                );
              }

              if (onDeleteGroup) {
                onDeleteGroup();
              } else {
                onBack();
              }
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Failed to delete group"
              );
            } finally {
              setLeaving(false);
              setMenuVisible(false);
            }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = async () => {
    Alert.alert(
      "Leave Group",
      `Are you sure you want to leave "${group.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            if (!API_URL) {
              Alert.alert("Error", "Unable to connect to the server");
              return;
            }

            try {
              setLeaving(true);

              let {
                data: { session: currentSession },
              } = await supabase.auth.getSession();

              if (!currentSession) {
                Alert.alert("Error", "Not authenticated");
                return;
              }

              const token = currentSession.access_token;
              const currentUserId = session?.user?.id;

              if (!currentUserId) {
                Alert.alert("Error", "Unable to identify user");
                return;
              }

              const response = await fetch(
                `${API_URL}/group-members?group_id=${group.id}&user_id=${currentUserId}`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                }
              );

              if (!response.ok) {
                if (response.status === 401) {
                  await signOut();
                  return;
                }

                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                  errorData.error || `HTTP error! status: ${response.status}`
                );
              }

              // Call the onLeaveGroup callback if provided, otherwise just go back
              if (onLeaveGroup) {
                onLeaveGroup();
              } else {
                onBack();
              }
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Failed to leave group"
              );
            } finally {
              setLeaving(false);
              setMenuVisible(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleCreateTransaction = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ): Promise<void> => {
    if (!API_URL) {
      throw new Error("Unable to connect to the server");
    }

    try {
      let {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        throw new Error("Not authenticated");
      }

      const token = currentSession.access_token;

      const response = await fetch(`${API_URL}/transactions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...transactionData,
          group_id: group.id,
          currency: transactionData.currency || group.currency || "USD",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      setShowTransactionForm(false);
      setEditingTransaction(null);
      await fetchTransactions();
      if (onTransactionAdded) {
        onTransactionAdded();
      }
    } catch (error) {
      throw error;
    }
  };

  const handleUpdateTransaction = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ): Promise<void> => {
    if (!API_URL || !editingTransaction) {
      throw new Error("Invalid request");
    }

    try {
      let {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        throw new Error("Not authenticated");
      }

      const token = currentSession.access_token;

      const response = await fetch(`${API_URL}/transactions`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...transactionData,
          id: editingTransaction.id,
          currency: transactionData.currency || group.currency || "USD",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      setShowTransactionForm(false);
      setEditingTransaction(null);
      await fetchTransactions();
      if (onTransactionAdded) {
        onTransactionAdded();
      }
    } catch (error) {
      throw error;
    }
  };

  const handleDeleteTransaction = async (
    transactionId: number
  ): Promise<void> => {
    if (!API_URL) {
      throw new Error("Unable to connect to the server");
    }

    try {
      let {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        throw new Error("Not authenticated");
      }

      const token = currentSession.access_token;

      const response = await fetch(
        `${API_URL}/transactions?id=${transactionId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      await fetchTransactions();
      if (onTransactionAdded) {
        onTransactionAdded();
      }
    } catch (error) {
      throw error;
    }
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setShowTransactionForm(true);
  };

  const handleTransactionFormSave = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ) => {
    if (editingTransaction) {
      await handleUpdateTransaction(transactionData);
    } else {
      await handleCreateTransaction(transactionData);
    }
  };


  const currentUserId = session?.user?.id;
  const isOwner =
    group.created_by === currentUserId ||
    group.members?.some(
      (m) => m.user_id === currentUserId && m.role === "owner"
    );
  const isMember = group.members?.some((m) => m.user_id === currentUserId);

  if (loading && !group.members) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={{ marginTop: 16 }}>
          Loading group details...
        </Text>
      </View>
    );
  }


  if (error) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Text
          variant="headlineSmall"
          style={{ color: theme.colors.error, marginBottom: 16 }}
        >
          Error
        </Text>
        <Text
          variant="bodyMedium"
          style={{ marginBottom: 24, textAlign: "center" }}
        >
          {error}
        </Text>
        <Button mode="contained" onPress={fetchGroupDetails}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "bottom"]}
    >
      <Appbar.Header>
        <Appbar.BackAction onPress={onBack} />
        <Appbar.Content title={group.name} />
        {isMember && (
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <Appbar.Action
                icon="dots-vertical"
                onPress={() => setMenuVisible(true)}
              />
            }
          >
            {isOwner && (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  handleDeleteGroup();
                }}
                title="Delete Group"
                leadingIcon="delete"
                titleStyle={{ color: theme.colors.error }}
              />
            )}
            {!isOwner && (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  handleLeaveGroup();
                }}
                title="Leave Group"
                leadingIcon="exit-run"
                titleStyle={{ color: theme.colors.error }}
              />
            )}
            {isOwner && (
              <Menu.Item
                onPress={() => {
                  setMenuVisible(false);
                  handleLeaveGroup();
                }}
                title="Leave Group"
                leadingIcon="exit-run"
                titleStyle={{ color: theme.colors.error }}
              />
            )}
          </Menu>
        )}
      </Appbar.Header>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {group.description && (
          <Card style={styles.descriptionCard} mode="outlined">
            <Card.Content>
              <Text variant="bodyMedium">{group.description}</Text>
            </Card.Content>
          </Card>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Members ({group.members?.length || 0})
            </Text>
            {isOwner && (
              <IconButton
                icon="plus"
                size={20}
                iconColor={theme.colors.primary}
                onPress={onAddMember}
              />
            )}
          </View>

          {group.members && group.members.length > 0 ? (
            group.members.map((member, index) => (
              <React.Fragment key={member.id}>
                <Card style={styles.memberCard} mode="outlined">
                  <Card.Content style={styles.memberContent}>
                    <View style={styles.memberLeft}>
                      <Text variant="titleSmall" style={styles.memberName}>
                        {member.email ||
                          `User ${member.user_id.substring(0, 8)}...`}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        Joined {formatDate(member.joined_at)}
                      </Text>
                    </View>
                    <Chip
                      style={[
                        styles.roleChip,
                        {
                          backgroundColor:
                            member.role === "owner"
                              ? theme.colors.primaryContainer
                              : theme.colors.surfaceVariant,
                        },
                      ]}
                      textStyle={{
                        color:
                          member.role === "owner"
                            ? theme.colors.onPrimaryContainer
                            : theme.colors.onSurfaceVariant,
                      }}
                    >
                      {member.role}
                    </Chip>
                  </Card.Content>
                </Card>
                {index < group.members!.length - 1 && (
                  <View style={{ height: 8 }} />
                )}
              </React.Fragment>
            ))
          ) : (
            <Text
              variant="bodyMedium"
              style={{
                color: theme.colors.onSurfaceVariant,
                textAlign: "center",
              }}
            >
              No members yet
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Transactions ({transactions.length})
          </Text>

          {transactionsLoading ? (
            <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
          ) : transactions.length > 0 ? (
            transactions.slice(0, 5).map((transaction, index) => {
              const isIncome = transaction.type === "income";
              const amountColor = isIncome ? "#10b981" : "#ef4444";
              const sign = isIncome ? "+" : "-";

              return (
                <React.Fragment key={transaction.id}>
                  <Card
                    style={styles.transactionCard}
                    mode="outlined"
                    onPress={() => handleEditTransaction(transaction)}
                  >
                    <Card.Content style={styles.transactionContent}>
                      <View style={styles.transactionLeft}>
                        <Text
                          variant="titleSmall"
                          style={styles.transactionDescription}
                        >
                          {transaction.description || "No description"}
                        </Text>
                        <View style={styles.transactionMeta}>
                          <Text
                            variant="bodySmall"
                            style={{ color: theme.colors.onSurfaceVariant }}
                          >
                            {formatDate(transaction.date)}
                            {transaction.category &&
                              ` • ${transaction.category}`}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.transactionRight}>
                        <Text
                          variant="titleMedium"
                          style={[
                            styles.transactionAmount,
                            { color: amountColor },
                          ]}
                        >
                          {sign}
                          {formatCurrency(
                            transaction.amount,
                            transaction.currency
                          )}
                        </Text>
                      </View>
                    </Card.Content>
                  </Card>
                  {index < Math.min(transactions.length, 5) - 1 && (
                    <View style={{ height: 8 }} />
                  )}
                </React.Fragment>
              );
            })
          ) : (
            <Text
              variant="bodyMedium"
              style={{
                color: theme.colors.onSurfaceVariant,
                textAlign: "center",
              }}
            >
              No transactions yet
            </Text>
          )}

          {transactions.length > 5 && (
            <Text
              variant="bodySmall"
              style={{
                color: theme.colors.primary,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              Showing 5 of {transactions.length} transactions
            </Text>
          )}
        </View>
      </ScrollView>

      {isMember && (
        <FAB
          icon="plus"
          label="Add"
          onPress={() => setShowTransactionForm(true)}
          style={styles.addTransactionButton}
        />
      )}

      <TransactionFormScreen
        visible={showTransactionForm}
        transaction={editingTransaction}
        onSave={async (transactionData) => {
          await handleTransactionFormSave(transactionData);
          setShowTransactionForm(false);
          setEditingTransaction(null);
        }}
        onDismiss={() => {
          setShowTransactionForm(false);
          setEditingTransaction(null);
        }}
        onDelete={
          editingTransaction
            ? async () => {
                try {
                  await handleDeleteTransaction(editingTransaction.id);
                  setShowTransactionForm(false);
                  setEditingTransaction(null);
                } catch (error) {
                  // Error is already handled in handleDeleteTransaction
                  throw error;
                }
              }
            : undefined
        }
        defaultCurrency={group.currency || "USD"}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  descriptionCard: {
    marginBottom: 16,
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: "600",
  },
  memberCard: {
    marginBottom: 0,
  },
  memberContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  memberLeft: {
    flex: 1,
    marginRight: 8,
  },
  memberName: {
    fontWeight: "600",
    marginBottom: 4,
  },
  roleChip: {
    height: 28,
  },
  transactionCard: {
    marginBottom: 0,
  },
  transactionContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  transactionLeft: {
    flex: 1,
    marginRight: 16,
  },
  transactionDescription: {
    fontWeight: "600",
    marginBottom: 4,
  },
  transactionMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  transactionAmount: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  transactionRight: {
    alignItems: "flex-end",
  },
  addTransactionButton: {
    position: "absolute",
    right: 16,
    bottom: 16, // Space for bottom navigation bar
  },
});
