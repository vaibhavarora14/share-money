import React, { useEffect, useMemo } from "react";
import { BackHandler, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Avatar,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { useBalances } from "../hooks/useBalances";
import { Balance } from "../types";
import { formatCurrency, getDefaultCurrency } from "../utils/currency";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";

export const BalancesScreen: React.FC<{
  onBack?: () => void;
}> = ({ onBack }) => {
  const theme = useTheme();
  const {
    data: balancesData,
    isLoading: balancesLoading,
    error: balancesError,
  } = useBalances(null); // null = overall balances

  // Handle Android hardware back button
  useEffect(() => {
    if (!onBack) return;

    const handleHardwareBack = () => {
      onBack();
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleHardwareBack
    );
    return () => subscription.remove();
  }, [onBack]);

  const overallBalances = balancesData?.overall_balances || [];
  const defaultCurrency = getDefaultCurrency();

  // Separate balances into "you owe" and "you are owed" and sort them
  const { youOwe, youAreOwed } = useMemo(() => {
    const owe = [...overallBalances.filter((b) => b.amount < 0)];
    const owed = [...overallBalances.filter((b) => b.amount > 0)];
    owe.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    owed.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return { youOwe: owe, youAreOwed: owed };
  }, [overallBalances]);

  const getUserDisplayName = (balance: Balance): string => {
    // Priority: full_name → email → fallback to truncated user_id
    if (balance.full_name) {
      return balance.full_name;
    }
    if (balance.email) {
      return balance.email;
    }
    // Fallback to truncated user_id
    return `User ${balance.user_id.substring(0, 8)}...`;
  };

  const getInitials = (name: string) => {
    // Extract username from email for initials (part before @)
    const displayName = name.includes("@") ? name.split("@")[0] : name;
    // Get first 2 characters, handling edge cases
    if (displayName.length >= 2) {
      return displayName.substring(0, 2).toUpperCase();
    }
    // If name is too short, use first char + first char
    return displayName.length > 0
      ? (displayName[0] + displayName[0]).toUpperCase()
      : "??";
  };

  if (balancesError) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
          {onBack && <Appbar.BackAction onPress={onBack} />}
          <Appbar.Content
            title="Balances"
            titleStyle={{ fontWeight: "bold" }}
          />
        </Appbar.Header>
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
            {getUserFriendlyErrorMessage(balancesError)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
        {onBack && <Appbar.BackAction onPress={onBack} />}
        <Appbar.Content title="Balances" titleStyle={{ fontWeight: "bold" }} />
      </Appbar.Header>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {balancesLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={{ marginTop: 16 }}>
              Loading balances...
            </Text>
          </View>
        ) : overallBalances.length > 0 ? (
          <>
            {/* You Are Owed */}
            {youAreOwed.length > 0 && (
              <View style={styles.balanceGroup}>
                <Text
                  variant="titleMedium"
                  style={[
                    styles.balanceGroupTitle,
                    { color: theme.colors.primary },
                  ]}
                >
                  You are owed
                </Text>
                {youAreOwed.map((balance, index) => (
                  <Surface
                    key={`${balance.user_id}-${balance.currency}`}
                    style={styles.balanceItem}
                    elevation={0}
                  >
                    <View style={styles.balanceContent}>
                      <Avatar.Text
                        size={40}
                        label={getInitials(getUserDisplayName(balance))}
                        style={{
                          backgroundColor: theme.colors.primaryContainer,
                        }}
                        color={theme.colors.onPrimaryContainer}
                      />
                      <View style={styles.balanceLeft}>
                        <Text variant="bodyLarge" style={styles.balanceName}>
                          {getUserDisplayName(balance)}
                        </Text>
                      </View>
                      <View style={styles.balanceRight}>
                        <Text
                          variant="titleMedium"
                          style={[styles.balanceAmount, { color: "#10b981" }]}
                        >
                          {formatCurrency(
                            Math.abs(balance.amount),
                            balance.currency
                          )}
                        </Text>
                      </View>
                    </View>
                  </Surface>
                ))}
              </View>
            )}

            {/* You Owe */}
            {youOwe.length > 0 && (
              <View style={[styles.balanceGroup, { marginTop: 24 }]}>
                <Text
                  variant="titleMedium"
                  style={[
                    styles.balanceGroupTitle,
                    { color: theme.colors.error },
                  ]}
                >
                  You owe
                </Text>
                {youOwe.map((balance, index) => (
                  <Surface
                    key={`${balance.user_id}-${balance.currency}`}
                    style={styles.balanceItem}
                    elevation={0}
                  >
                    <View style={styles.balanceContent}>
                      <Avatar.Text
                        size={40}
                        label={getInitials(getUserDisplayName(balance))}
                        style={{ backgroundColor: theme.colors.errorContainer }}
                        color={theme.colors.onErrorContainer}
                      />
                      <View style={styles.balanceLeft}>
                        <Text variant="bodyLarge" style={styles.balanceName}>
                          {getUserDisplayName(balance)}
                        </Text>
                      </View>
                      <View style={styles.balanceRight}>
                        <Text
                          variant="titleMedium"
                          style={[styles.balanceAmount, { color: "#ef4444" }]}
                        >
                          {formatCurrency(
                            Math.abs(balance.amount),
                            balance.currency
                          )}
                        </Text>
                      </View>
                    </View>
                  </Surface>
                ))}
              </View>
            )}
          </>
        ) : (
          <Surface style={styles.emptyStateCard} elevation={0}>
            <View style={styles.emptyStateContent}>
              <Text variant="displayMedium" style={[styles.emptyStateIcon]}>
                💸
              </Text>
              <Text
                variant="titleLarge"
                style={[
                  styles.emptyStateTitle,
                  { color: theme.colors.onSurface },
                ]}
              >
                No Balances Yet
              </Text>
              <Text
                variant="bodyLarge"
                style={[
                  styles.emptyStateMessage,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Once you add expenses with splits, balances will appear here.
              </Text>
            </View>
          </Surface>
        )}
      </ScrollView>
    </View>
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
    paddingBottom: 100, // Extra padding for bottom nav bar
  },
  balanceGroup: {
    marginTop: 0,
    marginBottom: 24,
  },
  balanceGroupTitle: {
    fontWeight: "bold",
    marginBottom: 12,
    marginLeft: 4,
  },
  balanceItem: {
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "transparent",
  },
  balanceContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  balanceLeft: {
    flex: 1,
    marginLeft: 16,
    marginRight: 16,
  },
  balanceName: {
    fontWeight: "500",
  },
  balanceRight: {
    alignItems: "flex-end",
  },
  balanceAmount: {
    fontWeight: "bold",
  },
  emptyStateCard: {
    marginTop: 32,
    backgroundColor: "transparent",
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 16,
  },
  emptyStateContent: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyStateIcon: {
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateMessage: {
    textAlign: "center",
    lineHeight: 24,
  },
});
