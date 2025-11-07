import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  Alert,
  Text as RNText,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  FAB,
  IconButton,
  Provider as PaperProvider,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BottomNavBar } from "./components/BottomNavBar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AddMemberScreen } from "./screens/AddMemberScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { GroupDetailsScreen } from "./screens/GroupDetailsScreen";
import { GroupsListScreen } from "./screens/GroupsListScreen";
import { TransactionFormScreen } from "./screens/TransactionFormScreen";
import { supabase } from "./supabase";
import { Group, GroupWithMembers, Transaction } from "./types";
import { formatCurrency } from "./utils/currency";

// Constants
const TOKEN_REFRESH_BUFFER_SECONDS = 60;
const FETCH_DELAY_MS = 500;
const INCOME_COLOR = "#10b981";
const EXPENSE_COLOR = "#ef4444";

// API URL - must be set via EXPO_PUBLIC_API_URL environment variable
const API_URL = process.env.EXPO_PUBLIC_API_URL;

function TransactionsScreen({
  onNavigateToGroups,
}: {
  onNavigateToGroups: () => void;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const { session, signOut } = useAuth();
  const fetchingRef = React.useRef<boolean>(false);
  const theme = useTheme();

  // Validate API URL on mount
  useEffect(() => {
    if (!API_URL) {
      setError(
        "Unable to connect to the server. Please check your app configuration and try again."
      );
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (): Promise<void> => {
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

    if (fetchingRef.current) {
      return;
    }

    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      // Always get the latest session from Supabase
      let {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        setLoading(false);
        return;
      }

      // Check if token is expired (with buffer)
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = currentSession.expires_at || 0;

      if (expiresAt && expiresAt < now + TOKEN_REFRESH_BUFFER_SECONDS) {
        // Token is expired or about to expire, try to refresh
        const { data: refreshData, error: refreshError } =
          await supabase.auth.refreshSession();

        if (refreshError || !refreshData.session) {
          await signOut();
          return;
        }

        currentSession = refreshData.session;
      }

      const token = currentSession.access_token;

      if (!API_URL) {
        throw new Error(
          "Unable to connect to the server. Please check your app configuration and try again."
        );
      }

      const response = await fetch(`${API_URL}/transactions`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        let responseText: string = "";
        let errorData: any = null;

        try {
          responseText = await response.text();
          if (responseText) {
            try {
              errorData = JSON.parse(responseText);
            } catch {
              // Not JSON, use text as error message
            }
          }
        } catch {
          responseText = "";
        }

        if (response.status === 401) {
          // Token is invalid or expired - sign out the user
          // If it's a "session_not_found" error, clear AsyncStorage to remove old tokens
          let errorDetails = "";
          if (errorData) {
            errorDetails = errorData.error || errorData.details || "";
          }

          if (
            errorDetails.includes("session_not_found") ||
            errorDetails.includes("Session from session_id")
          ) {
            // Clear AsyncStorage directly to ensure old tokens are removed
            try {
              const keys = await AsyncStorage.getAllKeys();
              const authKeys = keys.filter(
                (key: string) =>
                  key.includes("supabase") || key.includes("auth")
              );
              if (authKeys.length > 0) {
                await AsyncStorage.multiRemove(authKeys);
              }
            } catch (storageError) {
              console.error("Error clearing AsyncStorage:", storageError);
            }
          }

          await signOut();
          return;
        }

        if (response.status === 429) {
          setError("Too many requests. Please wait a moment and try again.");
          return;
        }

        let errorMessage = `HTTP error! status: ${response.status}`;
        if (errorData) {
          errorMessage =
            errorData.error ||
            errorData.message ||
            errorData.details ||
            errorMessage;
        } else if (responseText) {
          errorMessage = responseText;
        }

        throw new Error(errorMessage);
      }

      const data: Transaction[] = await response.json();
      setTransactions(data);
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
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [session, signOut]);

  useEffect(() => {
    if (session) {
      const timer = setTimeout(() => {
        fetchTransactions();
      }, FETCH_DELAY_MS);
      return () => clearTimeout(timer);
    } else {
      setTransactions([]);
      setLoading(false);
      setError(null);
    }
  }, [session, fetchTransactions]);

  // Memoize calculations to avoid recalculating on every render
  // Must be called before any early returns to maintain hook order
  // Note: Totals are calculated without currency conversion (mixed currencies possible)
  const { totalIncome, totalExpense, balance, currencies } = useMemo(() => {
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const uniqueCurrencies = Array.from(
      new Set(transactions.map((t) => t.currency || "USD").filter(Boolean))
    );
    return {
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
      currencies: uniqueCurrencies,
    };
  }, [transactions]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatAmount = (
    amount: number,
    type: "income" | "expense",
    currency?: string
  ): string => {
    const sign = type === "income" ? "+" : "-";
    return `${sign}${formatCurrency(amount, currency || "USD")}`;
  };

  const getAuthToken = async (): Promise<string | null> => {
    if (!session) return null;

    let {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    if (!currentSession) return null;

    // Check if token is expired (with buffer)
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = currentSession.expires_at || 0;

    if (expiresAt && expiresAt < now + TOKEN_REFRESH_BUFFER_SECONDS) {
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError || !refreshData.session) {
        await signOut();
        return null;
      }

      currentSession = refreshData.session;
    }

    return currentSession.access_token;
  };

  const handleCreateTransaction = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ): Promise<void> => {
    if (!API_URL) {
      throw new Error(
        "Unable to connect to the server. Please check your app configuration and try again."
      );
    }

    const token = await getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${API_URL}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(transactionData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`
      );
    }

    await fetchTransactions();
    setShowForm(false);
    setEditingTransaction(null);
  };

  const handleUpdateTransaction = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ): Promise<void> => {
    if (!API_URL || !editingTransaction) {
      throw new Error("Invalid request");
    }

    const token = await getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${API_URL}/transactions`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...transactionData,
        id: editingTransaction.id,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`
      );
    }

    await fetchTransactions();
    setShowForm(false);
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = async (
    transactionId: number
  ): Promise<void> => {
    if (!API_URL) {
      throw new Error(
        "Unable to connect to the server. Please check your app configuration and try again."
      );
    }

    const token = await getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

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
  };

  const handleEditClick = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setShowForm(true);
  };

  const handleDeleteClick = (transaction: Transaction) => {
    Alert.alert(
      "Delete Transaction",
      `Are you sure you want to delete "${transaction.description}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await handleDeleteTransaction(transaction.id);
            } catch (error) {
              Alert.alert(
                "Error",
                error instanceof Error
                  ? error.message
                  : "Failed to delete transaction"
              );
            }
          },
        },
      ]
    );
  };

  const handleFormSave = async (
    transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
  ) => {
    if (editingTransaction) {
      await handleUpdateTransaction(transactionData);
    } else {
      await handleCreateTransaction(transactionData);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={{ marginTop: 16 }}>
          Loading transactions...
        </Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
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
        <Button mode="contained" onPress={fetchTransactions}>
          Retry
        </Button>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Appbar.Header>
        <Appbar.Content
          title="Transactions"
          subtitle={`${transactions.length} total`}
        />
        <Appbar.Action
          icon="account-multiple"
          onPress={onNavigateToGroups || (() => {})}
        />
        <Appbar.Action icon="logout" onPress={signOut} />
      </Appbar.Header>

      {transactions.length > 0 && (
        <Surface style={styles.summarySurface} elevation={1}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                Income
              </Text>
              <Text
                variant="titleMedium"
                style={{ color: INCOME_COLOR, fontWeight: "bold" }}
              >
                {formatCurrency(totalIncome, currencies[0] || "USD")}
              </Text>
              {currencies.length > 1 && (
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                >
                  Mixed currencies
                </Text>
              )}
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                Expense
              </Text>
              <Text
                variant="titleMedium"
                style={{ color: EXPENSE_COLOR, fontWeight: "bold" }}
              >
                {formatCurrency(totalExpense, currencies[0] || "USD")}
              </Text>
              {currencies.length > 1 && (
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                >
                  Mixed currencies
                </Text>
              )}
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                Balance
              </Text>
              <Text
                variant="titleMedium"
                style={{
                  color: balance >= 0 ? INCOME_COLOR : EXPENSE_COLOR,
                  fontWeight: "bold",
                }}
              >
                {formatCurrency(balance, currencies[0] || "USD")}
              </Text>
              {currencies.length > 1 && (
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                >
                  Mixed currencies
                </Text>
              )}
            </View>
          </View>
        </Surface>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant="headlineSmall" style={{ marginBottom: 8 }}>
              No transactions
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Your transactions will appear here
            </Text>
            <Button
              mode="contained"
              icon="account-multiple"
              onPress={onNavigateToGroups}
              style={{ marginTop: 24 }}
            >
              Go to Groups
            </Button>
          </View>
        ) : (
          transactions.map((transaction, index) => {
            const isIncome = transaction.type === "income";
            const amountColor = isIncome ? INCOME_COLOR : EXPENSE_COLOR;
            const chipColor = isIncome
              ? { backgroundColor: "#d1fae5", textColor: "#065f46" }
              : { backgroundColor: "#fee2e2", textColor: "#991b1b" };

            return (
              <React.Fragment key={transaction.id}>
                <Card style={styles.transactionCard} mode="outlined">
                  <Card.Content style={styles.cardContent}>
                    <View style={styles.transactionLeft}>
                      <Text
                        variant="titleMedium"
                        style={styles.description}
                        numberOfLines={2}
                      >
                        {transaction.description || "No description"}
                      </Text>
                      <View style={styles.metaRow}>
                        <Text
                          variant="bodySmall"
                          style={{ color: theme.colors.onSurfaceVariant }}
                        >
                          {formatDate(transaction.date)}
                        </Text>
                        {transaction.category && (
                          <>
                            <Text
                              variant="bodySmall"
                              style={{
                                color: theme.colors.onSurfaceVariant,
                                marginHorizontal: 4,
                              }}
                            >
                              •
                            </Text>
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant }}
                            >
                              {transaction.category}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={styles.transactionRight}>
                      <Text
                        variant="titleLarge"
                        style={[styles.amount, { color: amountColor }]}
                      >
                        {formatAmount(
                          transaction.amount,
                          transaction.type,
                          transaction.currency
                        )}
                      </Text>
                      <View style={styles.chipAndActions}>
                        <Chip
                          style={[
                            styles.typeChip,
                            { backgroundColor: chipColor.backgroundColor },
                          ]}
                          textStyle={{
                            color: chipColor.textColor,
                            fontSize: 11,
                            fontWeight: "600",
                          }}
                        >
                          {transaction.type}
                        </Chip>
                        <View style={styles.actionButtons}>
                          <IconButton
                            icon="pencil"
                            size={20}
                            onPress={() => handleEditClick(transaction)}
                            iconColor={theme.colors.primary}
                          />
                          <IconButton
                            icon="delete"
                            size={20}
                            onPress={() => handleDeleteClick(transaction)}
                            iconColor={theme.colors.error}
                          />
                        </View>
                      </View>
                    </View>
                  </Card.Content>
                </Card>
                {index < transactions.length - 1 && (
                  <View style={{ height: 8 }} />
                )}
              </React.Fragment>
            );
          })
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => setShowForm(true)}
        label="Add"
      />

      <TransactionFormScreen
        visible={showForm}
        transaction={editingTransaction}
        onSave={async (transactionData) => {
          await handleFormSave(transactionData);
          setShowForm(false);
          setEditingTransaction(null);
        }}
        onDismiss={() => {
          setShowForm(false);
          setEditingTransaction(null);
        }}
        defaultCurrency={editingTransaction?.currency || "USD"}
      />
    </SafeAreaView>
  );
}

function AppContent() {
  const { session, loading, signOut } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [currentView, setCurrentView] = useState<"transactions" | "groups">(
    "groups"
  );
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [groupDetails, setGroupDetails] = useState<GroupWithMembers | null>(
    null
  );
  const [currentRoute, setCurrentRoute] = useState<string>("groups");

  const getAuthToken = async (): Promise<string | null> => {
    if (!session) return null;

    let {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    if (!currentSession) return null;

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = currentSession.expires_at || 0;

    if (expiresAt && expiresAt < now + TOKEN_REFRESH_BUFFER_SECONDS) {
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError || !refreshData.session) {
        return null;
      }

      currentSession = refreshData.session;
    }

    return currentSession.access_token;
  };

  const handleCreateGroup = async (groupData: {
    name: string;
    description?: string;
  }) => {
    if (!API_URL) {
      throw new Error("Unable to connect to the server");
    }

    const token = await getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${API_URL}/groups`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(groupData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`
      );
    }

    setCurrentView("groups");
  };

  const handleAddMember = async (email: string) => {
    if (!API_URL || !selectedGroup) {
      throw new Error("Invalid request");
    }

    const token = await getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${API_URL}/group-members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        group_id: selectedGroup.id,
        email: email,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`
      );
    }

    // Refresh group details
    if (groupDetails && selectedGroup) {
      const detailsResponse = await fetch(
        `${API_URL}/groups/${selectedGroup.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (detailsResponse.ok) {
        const updatedGroup: GroupWithMembers = await detailsResponse.json();
        setGroupDetails(updatedGroup);
      }
    }
  };

  const handleGroupPress = async (group: Group) => {
    if (!API_URL) return;

    const token = await getAuthToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/groups/${group.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const groupWithMembers: GroupWithMembers = await response.json();
        setGroupDetails(groupWithMembers);
        setSelectedGroup(group);
      }
    } catch (error) {
      console.error("Error fetching group details:", error);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <AuthScreen
          isSignUp={isSignUp}
          onToggleMode={() => setIsSignUp(!isSignUp)}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  // Show group details screen (with bottom nav)
  if (groupDetails && selectedGroup) {
    return (
      <>
        <GroupDetailsScreen
          group={groupDetails}
          onBack={() => {
            setGroupDetails(null);
            setSelectedGroup(null);
            setCurrentRoute("groups");
          }}
          onAddMember={() => setShowAddMember(true)}
          onLeaveGroup={() => {
            setGroupDetails(null);
            setSelectedGroup(null);
            setCurrentView("groups");
            setCurrentRoute("groups");
          }}
          onDeleteGroup={() => {
            setGroupDetails(null);
            setSelectedGroup(null);
            setCurrentView("groups");
            setCurrentRoute("groups");
          }}
        />
        <BottomNavBar
          currentRoute={currentRoute}
          onGroupsPress={() => {
            setGroupDetails(null);
            setSelectedGroup(null);
            setCurrentRoute("groups");
          }}
          onLogoutPress={signOut}
        />
        {showAddMember && selectedGroup && (
          <AddMemberScreen
            visible={showAddMember}
            groupId={selectedGroup.id}
            onAddMember={async (email) => {
              await handleAddMember(email);
              setShowAddMember(false);
            }}
            onDismiss={() => {
              setShowAddMember(false);
            }}
          />
        )}
        <StatusBar style="auto" />
      </>
    );
  }

  // Show groups list (with bottom nav)
  return (
    <>
      <GroupsListScreen
        onGroupPress={handleGroupPress}
        onCreateGroup={handleCreateGroup}
      />
      <BottomNavBar
        currentRoute={currentRoute}
        onGroupsPress={() => setCurrentRoute("groups")}
        onLogoutPress={signOut}
      />
      <StatusBar style="auto" />
    </>
  );
}

// Error Fallback Component
function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  console.error("App Error:", error);
  return (
    <View style={styles.errorContainer}>
      <RNText style={styles.errorTitle}>Something went wrong</RNText>
      <RNText style={styles.errorMessage}>{error.message}</RNText>
      <RNText style={styles.errorStack}>{error.stack}</RNText>
      <Button onPress={resetErrorBoundary} mode="contained">
        Try Again
      </Button>
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        console.error("ErrorBoundary caught error:", error);
        console.error("Error info:", errorInfo);
      }}
      onReset={() => {
        console.log("ErrorBoundary: Resetting...");
      }}
    >
      <SafeAreaProvider>
        <PaperProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
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
  summarySurface: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#e0e0e0",
    marginHorizontal: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  transactionCard: {
    marginBottom: 0,
  },
  cardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  transactionLeft: {
    flex: 1,
    marginRight: 16,
    minWidth: 0,
  },
  description: {
    marginBottom: 8,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  transactionRight: {
    alignItems: "flex-end",
    minWidth: 100,
  },
  amount: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  typeChip: {
    height: 24,
  },
  chipAndActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButtons: {
    flexDirection: "row",
    marginLeft: 8,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
  groupsButton: {
    position: "absolute",
    margin: 16,
    left: 0,
    bottom: 0,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#ef4444",
  },
  errorMessage: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },
  errorStack: {
    fontSize: 12,
    color: "#999",
    marginBottom: 20,
    textAlign: "center",
  },
});
