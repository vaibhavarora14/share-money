import React from "react";
import { View } from "react-native";
import { ActivityIndicator, Card, Text, useTheme } from "react-native-paper";
import { useAuth } from "../contexts/AuthContext";
import { Transaction } from "../types";
import { formatCurrency, getDefaultCurrency } from "../utils/currency";
import { styles } from "./TransactionsSection.styles";

interface TransactionsSectionProps {
  items: Transaction[];
  loading: boolean;
  onEdit: (t: Transaction) => void;
}

// Calculate user's split amount and split count
const getUserSplitInfo = (
  transaction: Transaction,
  currentUserId: string | undefined
): {
  amount: number;
  count: number;
} | null => {
  if (!currentUserId) return null;

  // Check if transaction has splits (preferred method)
  if (
    transaction.splits &&
    Array.isArray(transaction.splits) &&
    transaction.splits.length > 0
  ) {
    const userSplit = transaction.splits.find(
      (split) => split.user_id === currentUserId
    );
    if (userSplit) {
      return {
        amount: userSplit.amount,
        count: transaction.splits.length,
      };
    }
  }

  // Fallback to split_among (backward compatibility)
  if (
    transaction.split_among &&
    Array.isArray(transaction.split_among) &&
    transaction.split_among.length > 0
  ) {
    const isUserInSplit =
      transaction.split_among.includes(currentUserId);
    if (isUserInSplit) {
      // Calculate equal split
      const splitCount = transaction.split_among.length;
      return {
        amount: transaction.amount / splitCount,
        count: splitCount,
      };
    }
  }

  return null;
};

export const TransactionsSection: React.FC<TransactionsSectionProps> = ({
  items,
  loading,
  onEdit,
}) => {
  const theme = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  return (
    <View style={[styles.section, { marginTop: 24 }]}>
      <Text
        variant="titleMedium"
        style={styles.sectionTitle}
        testID="transactions-section-title"
      >
        Transactions ({items.length})
      </Text>
      {loading ? (
        <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
      ) : items.length > 0 ? (
        items.map((transaction, index) => {
          const userSplitInfo = getUserSplitInfo(transaction, currentUserId);
          const currency = transaction.currency || getDefaultCurrency();

          return (
            <React.Fragment key={transaction.id}>
              <Card
                style={[
                  styles.transactionCard,
                  { backgroundColor: theme.colors.surfaceVariant },
                ]}
                mode="contained"
                onPress={() => onEdit(transaction)}
              >
                <Card.Content style={styles.transactionContent}>
                  <Text
                    variant="titleSmall"
                    style={[
                      styles.transactionDescription,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    {transaction.description || "No description"}
                  </Text>
                  <View style={styles.amountsRow}>
                    <View style={styles.transactionLeft}>
                      {userSplitInfo !== null ? (
                        <View style={styles.splitAmountContainer}>
                          <Text
                            variant="bodySmall"
                            style={[
                              styles.transactionMeta,
                              { color: theme.colors.onSurface },
                            ]}
                          >
                            {formatCurrency(userSplitInfo.amount, currency)}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={[
                              styles.splitCount,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            {userSplitInfo.count}x
                          </Text>
                        </View>
                      ) : (
                        <Text
                          variant="bodySmall"
                          style={[
                            styles.transactionMeta,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          {transaction.category || "No category"}
                        </Text>
                      )}
                    </View>
                    <View style={styles.transactionRight}>
                      <Text
                        variant="titleMedium"
                        style={[
                          styles.transactionAmount,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {formatCurrency(
                          transaction.amount,
                          transaction.currency
                        )}
                      </Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>
              {index < items.length - 1 && <View style={styles.cardSpacing} />}
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
    </View>
  );
};
