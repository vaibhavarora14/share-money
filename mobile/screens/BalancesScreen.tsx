import React, { useEffect } from "react";
import { BackHandler, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Card,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { Balance } from "../types";
import { getDefaultCurrency } from "../utils/currency";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";
import { formatCurrency } from "../utils/currency";
import { useBalances } from "../hooks/useBalances";

export const BalancesScreen: React.FC<{
  onBack: () => void;
}> = ({ onBack }) => {
  const theme = useTheme();
  const { data: balancesData, isLoading: balancesLoading, error: balancesError } = useBalances(null); // null = overall balances

  // Handle Android hardware back button
  useEffect(() => {
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

  // Separate balances into "you owe" and "you are owed"
  const youOwe = overallBalances.filter((b) => b.amount < 0);
  const youAreOwed = overallBalances.filter((b) => b.amount > 0);

  // Sort by absolute amount (largest first)
  youOwe.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  youAreOwed.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const getUserDisplayName = (balance: Balance): string => {
    return balance.email || `User ${balance.user_id.substring(0, 8)}...`;
  };

  if (balancesError) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={["top", "bottom"]}
      >
        <Appbar.Header>
          <Appbar.BackAction onPress={onBack} />
          <Appbar.Content title="Balances" />
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "bottom"]}
    >
      <Appbar.Header>
        <Appbar.BackAction onPress={onBack} />
        <Appbar.Content title="Balances" />
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
      </ScrollView>
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

