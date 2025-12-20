import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { Appbar, Button, Text, TextInput, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Balance, GroupMember, Settlement } from "../types";
import {
    formatCurrency,
    getCurrencySymbol,
    getDefaultCurrency,
} from "../utils/currency";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";

interface SettlementFormScreenProps {
  visible: boolean;
  balance: Balance | null; // The balance to settle (null = manual entry)
  settlement?: Settlement | null; // The settlement to edit (null = create new)
  groupMembers: GroupMember[];
  currentUserId: string;
  groupId: string;
  defaultCurrency?: string;
  onSave: (data: {
    group_id: string;
    from_participant_id: string;
    to_participant_id: string;
    amount: number;
    currency: string;
    notes?: string;
  }) => Promise<void>;
  onUpdate?: (data: {
    id: string;
    amount?: number;
    currency?: string;
    notes?: string;
    from_participant_id?: string;
    to_participant_id?: string;
  }) => Promise<void>;
  onDismiss: () => void;
}

export const SettlementFormScreen: React.FC<SettlementFormScreenProps> = ({
  visible,
  balance,
  settlement,
  groupMembers,
  currentUserId,
  groupId,
  defaultCurrency,
  onSave,
  onUpdate,
  onDismiss,
}) => {
  const isEditing = !!settlement;
  // If settling a specific balance, use that currency. Otherwise use default.
  // Note: The form currently does not allow changing currency, so it is effectively locked.
  const effectiveDefaultCurrency =
    settlement?.currency ||
    balance?.currency ||
    defaultCurrency ||
    getDefaultCurrency();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedToParticipantId, setSelectedToParticipantId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [amountError, setAmountError] = useState<string>("");

  // Determine the other user based on balance or selection
  const otherMember = useMemo(() => {
    if (balance) {
      // If settling a specific balance, return the member from the balance
      return groupMembers.find((m) => m.user_id === balance.user_id);
    }
    // Manual entry - find selected participant
    return groupMembers.find((m) => m.participant_id === selectedToParticipantId);
  }, [balance, selectedToParticipantId, groupMembers]);

  // Determine settlement direction
  const isPaying = useMemo(() => {
    if (balance) {
      // Negative balance means you owe them, so you're paying
      return balance.amount < 0;
    }
    // For manual entry, we'll assume user is paying (from_user_id = currentUserId)
    return true;
  }, [balance]);

  // Get available users to settle with (excluding current user)
  const availableUsers = useMemo(() => {
    return groupMembers.filter((m) => m.user_id !== currentUserId);
  }, [groupMembers, currentUserId]);

  // Initialize form when modal becomes visible
  useEffect(() => {
    if (!visible) {
      setAmount("");
      setNotes("");
      setSelectedToParticipantId("");
      setAmountError("");
      return;
    }

    // If editing, pre-fill from settlement
    if (settlement) {
      setAmount(settlement.amount.toString());
      setNotes(settlement.notes || "");
      // Determine which participant is the "other" participant
      const currentParticipant = groupMembers.find(m => m.user_id === currentUserId);
      const currentParticipantId = currentParticipant?.participant_id;
      
      const otherParticipantId =
        settlement.from_participant_id === currentParticipantId
          ? settlement.to_participant_id
          : settlement.from_participant_id;
          
      setSelectedToParticipantId(otherParticipantId || "");
    }
    // Pre-fill based on balance if provided
    else if (balance) {
      const member = groupMembers.find(m => m.user_id === balance.user_id);
      setSelectedToParticipantId(member?.participant_id || "");
      // Pre-fill with absolute balance amount as suggestion
      setAmount(Math.abs(balance.amount).toFixed(2));
    } else if (availableUsers.length > 0) {
      // Default to first available user
      setSelectedToParticipantId(availableUsers[0].participant_id || "");
    }
  }, [visible, balance, settlement, availableUsers, currentUserId]);

  const validateForm = (): boolean => {
    let isValid = true;

    // Validate amount
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setAmountError("Please enter a valid amount greater than 0");
      isValid = false;
    } else {
      setAmountError("");
    }

    // Validate participant selection (for manual entry)
    if (!balance && !selectedToParticipantId) {
      isValid = false;
    }

    return isValid;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    const amountNum = parseFloat(amount);

    try {
      setLoading(true);

      // If editing, call onUpdate
      if (isEditing && settlement && onUpdate) {
        await onUpdate({
          id: settlement.id,
          amount: amountNum,
          currency: effectiveDefaultCurrency,
          notes: notes.trim() || undefined,
        });
      } else {
        // Determine the current user's participant ID
        const currentMember = groupMembers.find(m => m.user_id === currentUserId);
        const currentParticipantId = currentMember?.participant_id;

        if (!currentParticipantId) {
           Alert.alert("Error", "Unable to identify your participant record in this group");
           return;
        }

        // Determine the other participant ID
        let otherParticipantId: string;
        if (balance) {
          const member = groupMembers.find(m => m.user_id === balance.user_id);
          otherParticipantId = member?.participant_id || "";
        } else if (selectedToParticipantId) {
          otherParticipantId = selectedToParticipantId;
        } else {
          Alert.alert("Error", "Please select a member to settle with");
          return;
        }

        if (!otherParticipantId) {
           Alert.alert("Error", "Selected member does not have a valid participant record");
           return;
        }

        // Determine from_participant_id and to_participant_id
        // If paying (isPaying = true): from_participant_id = currentParticipantId, to_participant_id = otherParticipantId
        // If receiving (isPaying = false): from_participant_id = otherParticipantId, to_participant_id = currentParticipantId
        const fromParticipantId = isPaying ? currentParticipantId : otherParticipantId;
        const toParticipantId = isPaying ? otherParticipantId : currentParticipantId;

        await onSave({
          group_id: groupId,
          from_participant_id: fromParticipantId,
          to_participant_id: toParticipantId,
          amount: amountNum,
          currency: effectiveDefaultCurrency,
          notes: notes.trim() || undefined,
        });
      }

      // Reset form
      setAmount("");
      setNotes("");
      setSelectedToParticipantId("");
      setAmountError("");
    } catch (error) {
      Alert.alert("Error", getUserFriendlyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const getParticipantDisplayName = (participantId: string): string => {
    const member = groupMembers.find((m) => m.participant_id === participantId);
    return (
      member?.full_name || member?.email || `Member ${participantId.substring(0, 8)}...`
    );
  };

  const getBalanceDisplay = (): string => {
    if (!balance) return "";
    const absAmount = Math.abs(balance.amount);
    if (balance.amount < 0) {
      return `You owe ${formatCurrency(absAmount, effectiveDefaultCurrency)}`;
    } else {
      return `You are owed ${formatCurrency(
        absAmount,
        effectiveDefaultCurrency
      )}`;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onDismiss}
      presentationStyle="pageSheet"
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top}
      >
        <Appbar.Header>
          <Appbar.Action icon="close" onPress={onDismiss} />
          <Appbar.Content title={isEditing ? "Edit Settlement" : "Settle Up"} />
        </Appbar.Header>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {!isEditing && balance && (
            <View
              style={[
                styles.balanceInfo,
                { backgroundColor: theme.colors.secondaryContainer },
              ]}
            >
              <Text
                variant="titleMedium"
                style={[
                  styles.balanceText,
                  { color: theme.colors.onSecondaryContainer },
                ]}
              >
              <Text
                variant="titleMedium"
                style={[
                  styles.balanceText,
                  { color: theme.colors.onSecondaryContainer },
                ]}
              >
                {groupMembers.find(m => m.user_id === balance.user_id)?.full_name || balance.email || "Unknown Member"}
              </Text>
              </Text>
              <Text
                variant="bodyMedium"
                style={[
                  styles.balanceAmount,
                  { color: theme.colors.onSecondaryContainer },
                ]}
              >
                {getBalanceDisplay()}
              </Text>
            </View>
          )}

          {isEditing && settlement && (
            <View
              style={[
                styles.balanceInfo,
                { backgroundColor: theme.colors.secondaryContainer },
              ]}
            >
              <Text
                variant="titleMedium"
                style={[
                  styles.balanceText,
                  { color: theme.colors.onSecondaryContainer },
                ]}
              >
              <Text
                variant="titleMedium"
                style={[
                  styles.balanceText,
                  { color: theme.colors.onSecondaryContainer },
                ]}
              >
                {settlement.from_participant_id === groupMembers.find(m => m.user_id === currentUserId)?.participant_id
                  ? `You paid ${getParticipantDisplayName(settlement.to_participant_id || "")}`
                  : `${getParticipantDisplayName(settlement.from_participant_id || "")} paid you`}
              </Text>
              </Text>
              <Text
                variant="bodyMedium"
                style={[
                  styles.balanceAmount,
                  { color: theme.colors.onSecondaryContainer },
                ]}
              >
                {formatCurrency(
                  settlement.amount,
                  settlement.currency || effectiveDefaultCurrency
                )}
              </Text>
            </View>
          )}

          {!isEditing && !balance && (
            <View style={styles.section}>
              <Text variant="labelLarge" style={styles.label}>
                Settle with
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.userPicker}
              >
                {availableUsers.map((member) => (
                  <Button
                    key={member.participant_id}
                    mode={
                      selectedToParticipantId === member.participant_id
                        ? "contained"
                        : "outlined"
                    }
                    onPress={() => setSelectedToParticipantId(member.participant_id || "")}
                    style={styles.userButton}
                  >
                    {member.full_name ||
                      member.email ||
                      `Member ${member.participant_id?.substring(0, 8)}...`}
                  </Button>
                ))}
              </ScrollView>
            </View>
          )}

          {isEditing && settlement && (
            <View style={styles.section}>
              <Text variant="labelLarge" style={styles.label}>
                Settlement with
              </Text>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {settlement.from_participant_id === groupMembers.find(m => m.user_id === currentUserId)?.participant_id
                  ? getParticipantDisplayName(settlement.to_participant_id || "")
                  : getParticipantDisplayName(settlement.from_participant_id || "")}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
              >
                (Cannot change settlement parties)
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text variant="labelLarge" style={styles.label}>
              Amount ({getCurrencySymbol(effectiveDefaultCurrency)})
            </Text>
            <TextInput
              label="Settlement amount"
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                if (amountError) setAmountError("");
              }}
              keyboardType="decimal-pad"
              error={!!amountError}
              mode="outlined"
              left={
                <TextInput.Affix
                  text={getCurrencySymbol(effectiveDefaultCurrency)}
                />
              }
            />
            {amountError ? (
              <Text
                variant="bodySmall"
                style={[styles.errorText, { color: theme.colors.error }]}
              >
                {amountError}
              </Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text variant="labelLarge" style={styles.label}>
              Notes (optional)
            </Text>
            <TextInput
              label="Add a note about this settlement"
              value={notes}
              onChangeText={setNotes}
              mode="outlined"
              multiline
              numberOfLines={3}
              placeholder="e.g., Paid via Venmo"
            />
          </View>

          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={loading}
              disabled={loading || !amount || (!isEditing && !selectedToParticipantId)}
              style={styles.saveButton}
            >
              {isEditing
                ? "Update Settlement"
                : isPaying
                ? "Mark as Paid"
                : "Mark as Received"}
            </Button>
            <Button
              mode="outlined"
              onPress={onDismiss}
              disabled={loading}
              style={styles.cancelButton}
            >
              Cancel
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  balanceInfo: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    alignItems: "center",
  },
  balanceText: {
    fontWeight: "600",
    marginBottom: 4,
  },
  balanceAmount: {
    // color removed, set via theme
  },
  section: {
    marginBottom: 24,
  },
  label: {
    marginBottom: 8,
    fontWeight: "600",
  },
  userPicker: {
    marginTop: 8,
  },
  userButton: {
    marginRight: 8,
  },
  errorText: {
    marginTop: 4,
  },
  buttonContainer: {
    marginTop: 8,
    marginBottom: 24,
  },
  saveButton: {
    marginBottom: 12,
  },
  cancelButton: {
    marginTop: 8,
  },
});
