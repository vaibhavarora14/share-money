import React, { useEffect, useState, useMemo } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Appbar,
  Button,
  Text,
  TextInput,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Balance, GroupMember } from "../types";
import { getCurrencySymbol, getDefaultCurrency } from "../utils/currency";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";
import { formatCurrency } from "../utils/currency";

interface SettlementFormScreenProps {
  visible: boolean;
  balance: Balance | null; // The balance to settle (null = manual entry)
  groupMembers: GroupMember[];
  currentUserId: string;
  groupId: string;
  defaultCurrency?: string;
  onSave: (data: {
    group_id: string;
    from_user_id: string;
    to_user_id: string;
    amount: number;
    currency: string;
    notes?: string;
  }) => Promise<void>;
  onDismiss: () => void;
}

export const SettlementFormScreen: React.FC<SettlementFormScreenProps> = ({
  visible,
  balance,
  groupMembers,
  currentUserId,
  groupId,
  defaultCurrency,
  onSave,
  onDismiss,
}) => {
  const effectiveDefaultCurrency = defaultCurrency || getDefaultCurrency();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedToUserId, setSelectedToUserId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [amountError, setAmountError] = useState<string>("");

  // Determine the other user based on balance or selection
  const otherUser = useMemo(() => {
    if (balance) {
      // If settling a specific balance, return the user from the balance
      return groupMembers.find((m) => m.user_id === balance.user_id);
    }
    // Manual entry - find selected user
    return groupMembers.find((m) => m.user_id === selectedToUserId);
  }, [balance, selectedToUserId, groupMembers]);

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
      setSelectedToUserId("");
      setAmountError("");
      return;
    }

    // Pre-fill based on balance if provided
    if (balance) {
      setSelectedToUserId(balance.user_id);
      // Pre-fill with absolute balance amount as suggestion
      setAmount(Math.abs(balance.amount).toFixed(2));
    } else if (availableUsers.length > 0) {
      // Default to first available user
      setSelectedToUserId(availableUsers[0].user_id);
    }
  }, [visible, balance, availableUsers]);

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

    // Validate user selection (for manual entry)
    if (!balance && !selectedToUserId) {
      isValid = false;
    }

    return isValid;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    // Determine the other user ID
    let otherUserId: string;
    if (balance) {
      otherUserId = balance.user_id;
    } else if (selectedToUserId) {
      otherUserId = selectedToUserId;
    } else {
      Alert.alert("Error", "Please select a user to settle with");
      return;
    }

    const amountNum = parseFloat(amount);

    try {
      setLoading(true);

      // Determine from_user_id and to_user_id
      // If paying (isPaying = true): from_user_id = currentUserId, to_user_id = otherUserId
      // If receiving (isPaying = false): from_user_id = otherUserId, to_user_id = currentUserId
      const fromUserId = isPaying ? currentUserId : otherUserId;
      const toUserId = isPaying ? otherUserId : currentUserId;

      await onSave({
        group_id: groupId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        amount: amountNum,
        currency: effectiveDefaultCurrency,
        notes: notes.trim() || undefined,
      });

      // Reset form
      setAmount("");
      setNotes("");
      setSelectedToUserId("");
      setAmountError("");
    } catch (error) {
      Alert.alert("Error", getUserFriendlyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const getUserDisplayName = (userId: string): string => {
    const member = groupMembers.find((m) => m.user_id === userId);
    return member?.email || `User ${userId.substring(0, 8)}...`;
  };

  const getBalanceDisplay = (): string => {
    if (!balance) return "";
    const absAmount = Math.abs(balance.amount);
    if (balance.amount < 0) {
      return `You owe ${formatCurrency(absAmount, effectiveDefaultCurrency)}`;
    } else {
      return `You are owed ${formatCurrency(absAmount, effectiveDefaultCurrency)}`;
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
          <Appbar.Content title="Settle Up" />
        </Appbar.Header>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {balance && (
            <View style={styles.balanceInfo}>
              <Text variant="titleMedium" style={styles.balanceText}>
                {getUserDisplayName(balance.user_id)}
              </Text>
              <Text variant="bodyMedium" style={styles.balanceAmount}>
                {getBalanceDisplay()}
              </Text>
            </View>
          )}

          {!balance && (
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
                    key={member.user_id}
                    mode={selectedToUserId === member.user_id ? "contained" : "outlined"}
                    onPress={() => setSelectedToUserId(member.user_id)}
                    style={styles.userButton}
                  >
                    {member.email || `User ${member.user_id.substring(0, 8)}...`}
                  </Button>
                ))}
              </ScrollView>
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
              left={<TextInput.Affix text={getCurrencySymbol(effectiveDefaultCurrency)} />}
            />
            {amountError ? (
              <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
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
              disabled={loading || !amount || !selectedToUserId}
              style={styles.saveButton}
            >
              {isPaying ? "Mark as Paid" : "Mark as Received"}
            </Button>
            <Button mode="outlined" onPress={onDismiss} disabled={loading} style={styles.cancelButton}>
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
    backgroundColor: "#f5f5f5",
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
    color: "#666",
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
