import React from "react";
import { Pressable, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Icon,
  Surface,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { useAuth } from "../contexts/AuthContext";
import { Participant, Settlement, Transaction } from "../types";
import { formatCurrency, getDefaultCurrency } from "../utils/currency";
import { isUnequalSplit } from "../utils/splits";
import { openTransactionWithHighlightConsumption } from "../utils/transactionHighlight";
import {
  countActiveMembers,
  getTransactionsEmptyCopy,
} from "../utils/transactionsEmptyCopy";
import type { LedgerItem } from "../utils/transactionsLedger";
import { styles } from "./TransactionsSection.styles";

interface TransactionsSectionProps {
  items: LedgerItem[];
  loading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  onEditExpense: (t: Transaction) => void;
  onEditPayment?: (s: Settlement) => void;
  members: any[];
  participants?: Participant[];
  highlightedTransactionId?: number | null;
  onHighlightedLayout?: (y: number) => void;
  onHighlightedInteraction?: (transactionId: number) => void;
  filter?: "all" | "expenses" | "payments";
  /** When true, empty-state CTAs (Add people / Add expense) are shown. */
  canAct?: boolean;
  onAddPeople?: () => void;
  onAddExpense?: () => void;
}

function formatRelativeDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const TransactionsSection: React.FC<TransactionsSectionProps> = ({
  items,
  loading,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  onEditExpense,
  onEditPayment,
  members = [],
  participants = [],
  highlightedTransactionId = null,
  onHighlightedLayout,
  onHighlightedInteraction,
  filter = "all",
  canAct = false,
  onAddPeople,
  onAddExpense,
}) => {
  const theme = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const activeMemberCount = countActiveMembers(members);
  const emptyCopy = getTransactionsEmptyCopy(filter, activeMemberCount);

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

  const resolveParticipantName = (participantId?: string | null, userId?: string | null) => {
    if (participantId) {
      const participant = participants.find((p) => p.id === participantId);
      if (participant) {
        const baseName =
          participant.user_id === currentUserId
            ? "You"
            : participant.full_name ||
              participant.email?.split("@")[0] ||
              participant.email ||
              "Unknown";
        return participant.type === "former" ? `${baseName} (Former)` : baseName;
      }

      const member = members.find(
        (m) => m.participant_id === participantId || m.id === participantId,
      );
      if (member) {
        const baseName =
          member.user_id === currentUserId
            ? "You"
            : member.full_name || member.email?.split("@")[0] || member.email || "Unknown";
        return member.status === "left" ? `${baseName} (Former)` : baseName;
      }
    }

    if (userId) {
      if (userId === currentUserId) return "You";
      const payer = members.find((m) => m.user_id === userId);
      if (payer) {
        return payer.full_name || payer.email?.split("@")[0] || payer.email || "Unknown";
      }
    }

    return "Unknown";
  };

  const getPayerName = (transaction: Transaction) =>
    resolveParticipantName(transaction.paid_by_participant_id, transaction.paid_by);

  const runEmptyAction = (action?: "add_people" | "add_expense") => {
    if (action === "add_people") onAddPeople?.();
    if (action === "add_expense") onAddExpense?.();
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="small" style={{ marginVertical: 24 }} />
      ) : items.length > 0 ? (
        <View style={styles.list}>
          {items.map((item) => {
            if (item.kind === "payment") {
              const settlement = item.settlement;
              const currency = settlement.currency || getDefaultCurrency();
              const dateString = formatRelativeDate(settlement.created_at);
              const fromName = resolveParticipantName(
                settlement.from_participant_id,
                settlement.from_user_id,
              );
              const toName = resolveParticipantName(
                settlement.to_participant_id,
                settlement.to_user_id,
              );
              const title = settlement.notes?.trim() || "Payment";
              const canEdit = !!onEditPayment;

              return (
                <Surface key={item.key} style={styles.card} elevation={0}>
                  <Pressable
                    onPress={() => onEditPayment?.(settlement)}
                    disabled={!canEdit}
                    accessibilityRole="button"
                    accessibilityLabel={`Payment, ${fromName} paid ${toName}, ${formatCurrency(settlement.amount, currency)}`}
                    testID={`ledger-payment-${settlement.id}`}
                    style={({ pressed }) => [
                      styles.pressable,
                      pressed && canEdit && { backgroundColor: theme.colors.surfaceVariant },
                    ]}
                  >
                    <View style={styles.row}>
                      <View
                        style={[
                          styles.iconContainer,
                          { backgroundColor: theme.colors.tertiaryContainer },
                        ]}
                      >
                        <Icon
                          source="handshake-outline"
                          size={18}
                          color={theme.colors.onTertiaryContainer}
                        />
                      </View>

                      <View style={styles.content}>
                        <View style={styles.headerRow}>
                          <Text
                            variant="titleMedium"
                            numberOfLines={1}
                            style={[styles.title, { color: theme.colors.onSurface }]}
                          >
                            {title}
                          </Text>
                          <Text
                            variant="titleMedium"
                            style={{
                              fontWeight: "bold",
                              color: theme.colors.onSurface,
                              flexShrink: 0,
                            }}
                          >
                            {formatCurrency(settlement.amount, currency)}
                          </Text>
                        </View>

                        <View style={styles.subRow}>
                          <Text
                            variant="labelSmall"
                            style={[styles.typeLabel, { color: theme.colors.tertiary }]}
                          >
                            Payment
                          </Text>
                          <Text
                            variant="bodySmall"
                            numberOfLines={1}
                            style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}
                          >
                            {" "}
                            • {dateString} • {fromName} → {toName}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                </Surface>
              );
            }

            const transaction = item.transaction;
            const isHighlighted = transaction.id === highlightedTransactionId;
            const currency = transaction.currency || getDefaultCurrency();
            const categoryIcon = getCategoryIcon(transaction.category || "");
            const dateString = formatRelativeDate(transaction.date);
            const payerName = getPayerName(transaction);
            const unequalSplit = transaction.splits
              ? isUnequalSplit(transaction.splits)
              : false;

            return (
              <Surface
                key={item.key}
                onLayout={
                  isHighlighted
                    ? (event) => onHighlightedLayout?.(event.nativeEvent.layout.y)
                    : undefined
                }
                style={styles.card}
                elevation={0}
              >
                <View
                  pointerEvents="none"
                  style={[
                    styles.highlightOverlay,
                    {
                      backgroundColor: isHighlighted
                        ? theme.colors.primaryContainer
                        : "transparent",
                      borderColor: isHighlighted
                        ? theme.colors.primary
                        : "transparent",
                    },
                  ]}
                />
                <Pressable
                  onPress={() =>
                    openTransactionWithHighlightConsumption(
                      highlightedTransactionId,
                      onHighlightedInteraction,
                      () => onEditExpense(transaction),
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Expense, ${transaction.description || "Untitled"}, ${formatCurrency(transaction.amount, currency)}${isHighlighted ? ", highlighted from notification" : ""}`}
                  testID={`ledger-expense-${transaction.id}`}
                  style={({ pressed }) => [
                    styles.pressable,
                    pressed && { backgroundColor: theme.colors.surfaceVariant },
                  ]}
                >
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.iconContainer,
                        { backgroundColor: theme.colors.primaryContainer },
                      ]}
                    >
                      <Icon
                        source={categoryIcon}
                        size={18}
                        color={theme.colors.onPrimaryContainer}
                      />
                    </View>

                    <View style={styles.content}>
                      <View style={styles.headerRow}>
                        <Text
                          variant="titleMedium"
                          numberOfLines={1}
                          style={[styles.title, { color: theme.colors.onSurface }]}
                        >
                          {transaction.description || "Untitled"}
                        </Text>
                        <Text
                          variant="titleMedium"
                          style={{
                            fontWeight: "bold",
                            color: theme.colors.onSurface,
                            flexShrink: 0,
                          }}
                        >
                          {formatCurrency(transaction.amount, currency)}
                        </Text>
                      </View>

                      <View style={styles.subRow}>
                        <Text
                          variant="bodySmall"
                          numberOfLines={1}
                          style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}
                        >
                          {payerName}
                          {unequalSplit ? " · Unequal" : ""}
                        </Text>
                        {dateString ? (
                          <Text
                            variant="bodySmall"
                            style={{ color: theme.colors.onSurfaceVariant, marginRight: 8 }}
                          >
                            {dateString}
                          </Text>
                        ) : null}
                        <Icon
                          source="chevron-right"
                          size={18}
                          color={theme.colors.onSurfaceVariant}
                        />
                      </View>
                    </View>
                  </View>
                </Pressable>
              </Surface>
            );
          })}
          {(isFetchingNextPage || hasNextPage) && filter !== "payments" && (
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
      ) : emptyCopy.secondaryAction === "add_expense" &&
        emptyCopy.primaryAction === "add_people" ? (
        <Surface
          style={[
            styles.soloEmptyCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
          elevation={0}
          testID="transactions-empty-state"
        >
          <View style={styles.soloEmptyTop}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurface, fontWeight: "700", marginBottom: 6 }}
            >
              {emptyCopy.title}
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginBottom: 16 }}
            >
              {emptyCopy.body}
            </Text>
            <Avatar.Icon
              size={48}
              icon="account-outline"
              style={{ backgroundColor: theme.colors.surfaceVariant }}
              color={theme.colors.onSurfaceVariant}
            />
            {canAct && emptyCopy.primaryLabel ? (
              <Button
                mode="contained"
                icon="account-plus"
                onPress={() => runEmptyAction("add_people")}
                testID="empty-add-people"
                style={{ marginTop: 20, borderRadius: 8, alignSelf: "stretch" }}
                contentStyle={{ height: 44 }}
              >
                {emptyCopy.primaryLabel}
              </Button>
            ) : null}
          </View>

          {canAct && emptyCopy.secondaryLabel ? (
            <TouchableRipple
              onPress={() => runEmptyAction("add_expense")}
              testID="empty-add-expense-anyway"
              style={styles.soloEmptySecondary}
            >
              <View style={styles.soloEmptySecondaryRow}>
                <View
                  style={[
                    styles.soloEmptySecondaryIcon,
                    { backgroundColor: theme.colors.tertiaryContainer },
                  ]}
                >
                  <Icon source="receipt" size={18} color={theme.colors.tertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    variant="titleSmall"
                    style={{ color: theme.colors.tertiary, fontWeight: "700" }}
                  >
                    {emptyCopy.secondaryLabel}
                  </Text>
                  {emptyCopy.secondaryBody ? (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {emptyCopy.secondaryBody}
                    </Text>
                  ) : null}
                </View>
              </View>
            </TouchableRipple>
          ) : null}

          {emptyCopy.infoFooter ? (
            <View
              style={[
                styles.soloEmptyFooter,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              <Icon source="information-outline" size={16} color={theme.colors.onSurfaceVariant} />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}
              >
                {emptyCopy.infoFooter}
              </Text>
            </View>
          ) : null}
        </Surface>
      ) : (
        <View
          style={[styles.emptyState, { backgroundColor: theme.colors.surfaceVariant }]}
          testID="transactions-empty-state"
        >
          <Text
            variant="titleMedium"
            style={{ color: theme.colors.onSurface, marginBottom: 8, fontWeight: "700" }}
          >
            {emptyCopy.title}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}
          >
            {emptyCopy.body}
          </Text>
          {canAct && emptyCopy.primaryLabel && emptyCopy.primaryAction ? (
            <View style={styles.emptyActions}>
              <Button
                mode="contained"
                icon={
                  emptyCopy.primaryAction === "add_people"
                    ? "account-plus"
                    : "plus"
                }
                onPress={() => runEmptyAction(emptyCopy.primaryAction)}
                testID={
                  emptyCopy.primaryAction === "add_people"
                    ? "empty-add-people"
                    : "empty-add-expense"
                }
                style={{ borderRadius: 8 }}
              >
                {emptyCopy.primaryLabel}
              </Button>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};
