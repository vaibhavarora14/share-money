import React from "react";
import { Pressable, View } from "react-native";
import { ActivityIndicator, Avatar, Surface, Text, useTheme } from "react-native-paper";
import { useAuth } from "../contexts/AuthContext";
import { Transaction } from "../types";
import { formatCurrency, getDefaultCurrency } from "../utils/currency";
import { styles } from "./TransactionsSection.styles";

interface TransactionsSectionProps {
  items: Transaction[];
  loading: boolean;
  onEdit: (t: Transaction) => void;
  members: any[]; // Using any[] temporarily if GroupMember import has issues, but ideally GroupMember[]
}

export const TransactionsSection: React.FC<TransactionsSectionProps> = ({
  items,
  loading,
  onEdit,
  members = [],
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

  const getPayerName = (transaction: Transaction) => {
      // 1. Try resolving by participant_id (Preferred)
      if (transaction.paid_by_participant_id) {
          const payer = members.find(m => m.participant_id === transaction.paid_by_participant_id);
          if (payer) {
              return payer.user_id === currentUserId ? "You" : (payer.full_name || payer.email?.split('@')[0] || "Unknown");
          }
      }
      
      // 2. Fallback to user_id
      if (transaction.paid_by) {
           if (transaction.paid_by === currentUserId) return "You";
           const payer = members.find(m => m.user_id === transaction.paid_by);
           if (payer) {
               return payer.full_name || payer.email?.split('@')[0] || "Unknown";
           }
      }

      return "Unknown";
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="small" style={{ marginVertical: 24 }} />
      ) : items.length > 0 ? (
        <View style={styles.list}>
          {items.map((transaction, index) => {
            const currency = transaction.currency || getDefaultCurrency();
            const categoryIcon = getCategoryIcon(transaction.category || "");
            const date = new Date(transaction.date);
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);

            let dateString = "";
            if (date.toDateString() === now.toDateString()) {
                dateString = "Today";
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateString = "Yesterday";
            } else {
                dateString = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            }

            const payerName = getPayerName(transaction);

            return (
              <Surface
                key={transaction.id}
                style={styles.card}
                elevation={0} // Flat, transparent background for list item feel
              >
                <Pressable
                  onPress={() => onEdit(transaction)}
                  style={({ pressed }) => [
                    styles.pressable,
                    pressed && { backgroundColor: theme.colors.surfaceVariant }
                  ]}
                >
                  <View style={styles.row}>
                    {/* Icon: Tonal Circle */}
                    <View style={[styles.iconContainer, { backgroundColor: theme.colors.secondaryContainer }]}>
                        <Avatar.Icon 
                          size={24} 
                          icon={categoryIcon} 
                          color={theme.colors.onSecondaryContainer}
                          style={{ backgroundColor: 'transparent' }}
                        />
                    </View>

                    {/* Content */}
                    <View style={styles.content}>
                      <View style={styles.headerRow}>
                          <Text variant="titleMedium" numberOfLines={1} style={[styles.title, { color: theme.colors.onSurface }]}>
                            {transaction.description || "Untitled"}
                          </Text>
                          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                            {formatCurrency(transaction.amount, currency)}
                          </Text>
                      </View>
                      
                      <View style={styles.subRow}>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                             {dateString} • {payerName} paid
                          </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </Surface>
            );
          })}
        </View>
      ) : (
        <View style={[styles.emptyState, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>💸</Text>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
            No transactions yet
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            Tap the + button to add your first expense.
          </Text>
        </View>
      )}
    </View>
  );
};
