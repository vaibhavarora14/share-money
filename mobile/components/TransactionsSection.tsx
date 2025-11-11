import React from "react";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Card,
  Text,
  useTheme,
} from "react-native-paper";
import { Transaction } from "../types";
import { formatCurrency } from "../utils/currency";
import { formatDate } from "../utils/date";

interface TransactionsSectionProps {
  items: Transaction[];
  loading: boolean;
  onEdit: (t: Transaction) => void;
}

export const TransactionsSection: React.FC<TransactionsSectionProps> = ({
  items,
  loading,
  onEdit,
}) => {
  const theme = useTheme();

  return (
    <View style={[styles.section, { marginTop: 24 }]}>
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Transactions ({items.length})
      </Text>
      {loading ? (
        <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
      ) : items.length > 0 ? (
        items.slice(0, 5).map((transaction, index) => {
          const isIncome = transaction.type === "income";
          const amountColor = isIncome ? "#10b981" : "#ef4444";
          const sign = isIncome ? "+" : "-";
          return (
            <React.Fragment key={transaction.id}>
              <Card
                style={styles.transactionCard}
                mode="outlined"
                onPress={() => onEdit(transaction)}
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
                        {transaction.category && ` • ${transaction.category}`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.transactionRight}>
                    <Text
                      variant="titleMedium"
                      style={[styles.transactionAmount, { color: amountColor }]}
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
              {index < Math.min(items.length, 5) - 1 && (
                <View style={{ height: 8 }} />
              )}
            </React.Fragment>
          );
        })
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
              💰
            </Text>
            <Text
              variant="titleMedium"
              style={[
                styles.emptyStateTitle,
                { color: theme.colors.onSurface },
              ]}
            >
              No Transactions Yet
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.emptyStateMessage,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Start tracking expenses and income for this group by adding your
              first transaction.
            </Text>
          </Card.Content>
        </Card>
      )}
      {items.length > 5 && (
        <Text
          variant="bodySmall"
          style={{
            color: theme.colors.primary,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Showing 5 of {items.length} transactions
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontWeight: "600",
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
