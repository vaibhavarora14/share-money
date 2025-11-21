import React from "react";
import { Pressable, View } from "react-native";
import { ActivityIndicator, Avatar, Divider, Surface, Text, useTheme } from "react-native-paper";
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

  const getCategoryIcon = (category: string) => {
    // Simple mapping for now, can be expanded
    const lowerCat = category?.toLowerCase() || "";
    if (lowerCat.includes("food") || lowerCat.includes("restaurant")) return "food";
    if (lowerCat.includes("transport") || lowerCat.includes("taxi") || lowerCat.includes("uber")) return "taxi";
    if (lowerCat.includes("grocery") || lowerCat.includes("market")) return "cart";
    if (lowerCat.includes("entertainment") || lowerCat.includes("movie")) return "movie";
    if (lowerCat.includes("travel") || lowerCat.includes("flight")) return "airplane";
    return "receipt";
  };

  return (
    <Surface style={styles.sectionSurface} elevation={1}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Avatar.Icon 
            size={32} 
            icon="format-list-bulleted" 
            style={{ backgroundColor: theme.colors.primaryContainer, marginRight: 12 }} 
            color={theme.colors.onPrimaryContainer}
          />
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Transactions
          </Text>
          <View style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[styles.badgeText, { color: theme.colors.onPrimaryContainer }]}>
              {items.length}
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
      ) : items.length > 0 ? (
        <View style={styles.sectionContent}>
          {items.map((transaction, index) => {
            const userSplitInfo = getUserSplitInfo(transaction, currentUserId);
            const currency = transaction.currency || getDefaultCurrency();
            const categoryIcon = getCategoryIcon(transaction.category || "");

            return (
              <React.Fragment key={transaction.id}>
                <Pressable
                  onPress={() => onEdit(transaction)}
                  style={({ pressed }) => [
                    styles.transactionItem,
                    pressed && { backgroundColor: theme.colors.surfaceVariant }
                  ]}
                >
                  <View style={styles.transactionContent}>
                    <Avatar.Icon 
                      size={40} 
                      icon={categoryIcon} 
                      style={{ backgroundColor: theme.colors.surfaceVariant, marginRight: 16 }}
                      color={theme.colors.onSurfaceVariant}
                    />
                    <View style={styles.transactionLeft}>
                      <Text
                        variant="titleMedium"
                        style={[
                          styles.transactionDescription,
                          { color: theme.colors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {transaction.description || "No description"}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        {new Date(transaction.date).toLocaleDateString()} • {transaction.paid_by === currentUserId ? "You paid" : "Someone paid"}
                      </Text>
                    </View>
                    <View style={styles.transactionRight}>
                      <Text
                        variant="titleMedium"
                        style={[
                          styles.transactionAmount,
                          { color: theme.colors.onSurface, fontWeight: 'bold' },
                        ]}
                      >
                        {formatCurrency(
                          transaction.amount,
                          transaction.currency
                        )}
                      </Text>
                      {userSplitInfo && (
                        <Text
                          variant="bodySmall"
                          style={{ 
                            color: userSplitInfo.amount > 0 ? theme.colors.error : theme.colors.primary,
                            fontWeight: '500'
                          }}
                        >
                          {userSplitInfo.amount > 0 ? "You owe" : "You lent"} {formatCurrency(Math.abs(userSplitInfo.amount), currency)}
                        </Text>
                      )}
                    </View>
                  </View>
                </Pressable>
                {index < items.length - 1 && <Divider />}
              </React.Fragment>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyStateContent}>
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
        </View>
      )}
    </Surface>
  );
};
