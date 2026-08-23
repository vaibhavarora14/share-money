import React from "react";
import { Pressable, View } from "react-native";
import { ActivityIndicator, Icon, Surface, Text, useTheme } from "react-native-paper";
import { useAuth } from "../contexts/AuthContext";
import { Participant, Transaction } from "../types";
import { formatCurrency, getDefaultCurrency } from "../utils/currency";
import { openTransactionWithHighlightConsumption } from "../utils/transactionHighlight";
import { styles } from "./TransactionsSection.styles";

interface TransactionsSectionProps {
  items: Transaction[];
  loading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  onEdit: (t: Transaction) => void;
  members: any[]; // Using any[] temporarily if GroupMember import has issues, but ideally GroupMember[]
  participants?: Participant[];
  highlightedTransactionId?: number | null;
  onHighlightedLayout?: (y: number) => void;
  onHighlightedInteraction?: (transactionId: number) => void;
}

export const TransactionsSection: React.FC<TransactionsSectionProps> = ({
  items,
  loading,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  onEdit,
  members = [],
  participants = [],
  highlightedTransactionId = null,
  onHighlightedLayout,
  onHighlightedInteraction,
}) => {
  const theme = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const getCategoryIcon = (category: string) => {
    const lowerCat = category?.toLowerCase() || "";
    if (!lowerCat.trim()) return "help-circle-outline";
    if (lowerCat.includes("food") || lowerCat.includes("restaurant")) return "silverware-fork-knife";
    if (lowerCat.includes("transport") || lowerCat.includes("taxi") || lowerCat.includes("uber")) return "taxi";
    if (lowerCat.includes("grocery") || lowerCat.includes("market")) return "cart-outline";
    if (lowerCat.includes("entertainment") || lowerCat.includes("movie")) return "movie-open-outline";
    if (lowerCat.includes("travel") || lowerCat.includes("flight")) return "airplane";
    if (lowerCat.includes("shopping")) return "shopping-outline";
    if (lowerCat.includes("rent")) return "home-outline";
    if (lowerCat.includes("utilities") || lowerCat.includes("utility")) return "lightning-bolt-outline";
    if (lowerCat.includes("health") || lowerCat.includes("medical")) return "medical-bag";
    return "tag-outline";
  };

  const getPayerName = (transaction: Transaction) => {
      // 1. Try resolving by participant_id from participants array first (for invited users)
      if (transaction.paid_by_participant_id) {
          // Check participants first (includes invited users)
          const participant = participants.find(p => 
            p.id === transaction.paid_by_participant_id
          );
          if (participant) {
              const baseName = participant.user_id === currentUserId ? "You" : (participant.full_name || participant.email?.split('@')[0] || participant.email || "Unknown");
              return participant.type === 'former' ? `${baseName} (Former)` : baseName;
          }
          
          // Fallback to members lookup
          const payer = members.find(m => 
            m.participant_id === transaction.paid_by_participant_id || 
            m.id === transaction.paid_by_participant_id
          );
          if (payer) {
              const baseName = payer.user_id === currentUserId ? "You" : (payer.full_name || payer.email?.split('@')[0] || payer.email || "Unknown");
              return payer.status === 'left' ? `${baseName} (Former)` : baseName;
          }
      }
      
      // 2. Fallback to user_id
      if (transaction.paid_by) {
           if (transaction.paid_by === currentUserId) return "You";
           const payer = members.find(m => m.user_id === transaction.paid_by);
           if (payer) {
               return payer.full_name || payer.email?.split('@')[0] || payer.email || "Unknown";
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
          {items.map((transaction) => {
            const isHighlighted = transaction.id === highlightedTransactionId;
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
                onLayout={isHighlighted
                  ? (event) => onHighlightedLayout?.(event.nativeEvent.layout.y)
                  : undefined}
                style={[
                  styles.card,
                  isHighlighted && {
                    backgroundColor: theme.colors.primaryContainer,
                    borderColor: theme.colors.primary,
                    borderWidth: 2,
                  },
                ]}
                elevation={0} // Flat, transparent background for list item feel
              >
                <Pressable
                  onPress={() => openTransactionWithHighlightConsumption(
                    highlightedTransactionId,
                    onHighlightedInteraction,
                    () => onEdit(transaction),
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`${transaction.description || "Untitled"}, ${formatCurrency(transaction.amount, currency)}${isHighlighted ? ", highlighted from notification" : ""}`}
                  style={({ pressed }) => [
                    styles.pressable,
                    pressed && { backgroundColor: theme.colors.surfaceVariant }
                  ]}
                >
                  <View style={styles.row}>
                    {/* Icon: Tonal Circle */}
                    <View style={[styles.iconContainer, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Icon
                          source={categoryIcon}
                          size={18}
                          color={theme.colors.onPrimaryContainer}
                        />
                    </View>

                    {/* Content */}
                    <View style={styles.content}>
                      <View style={styles.headerRow}>
                          <Text variant="titleMedium" numberOfLines={1} style={[styles.title, { color: theme.colors.onSurface }]}>
                            {transaction.description || "Untitled"}
                          </Text>
                          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flexShrink: 0 }}>
                            {formatCurrency(transaction.amount, currency)}
                          </Text>
                      </View>
                      
                      <View style={styles.subRow}>
                          <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
                             {dateString} • {payerName} paid
                          </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </Surface>
            );
          })}
          {(isFetchingNextPage || hasNextPage) && (
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              {isFetchingNextPage ? (
                <ActivityIndicator size="small" />
              ) : (
                <Pressable
                  onPress={onLoadMore}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 18,
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: theme.colors.surfaceVariant,
                  })}
                >
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    Load more transactions
                  </Text>
                </Pressable>
              )}
            </View>
          )}
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
