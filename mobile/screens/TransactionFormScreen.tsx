import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    BackHandler,
    Dimensions,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import {
    Appbar,
    Button,
    Checkbox,
    SegmentedButtons,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useParticipants } from "../hooks/useParticipants";
import { Transaction } from "../types";
import {
    CURRENCIES,
    formatCurrency,
    getCurrencySymbol,
    getDefaultCurrency,
} from "../utils/currency";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";

interface TransactionFormScreenProps {
  transaction?: Transaction | null;
  onSave: (
    transaction: Omit<Transaction, "id" | "created_at" | "user_id">
  ) => Promise<void>;
  onDismiss: () => void;
  onDelete?: () => Promise<void>;
  defaultCurrency?: string;
  groupId?: string; // Group ID to determine if this is a group transaction
}

export const TransactionFormScreen: React.FC<TransactionFormScreenProps> = ({
  transaction,
  onSave,
  onDismiss,
  onDelete,
  defaultCurrency,
  groupId,
}) => {
  // Use the prop if provided, otherwise get from environment variable at runtime
  const effectiveDefaultCurrency = defaultCurrency || getDefaultCurrency();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("");
  const [currency, setCurrency] = useState<string>(effectiveDefaultCurrency);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [paidBy, setPaidBy] = useState<string>(""); // Now stores participant_id
  const [splitAmong, setSplitAmong] = useState<string[]>([]); // Now stores participant_ids
  const [showPaidByPicker, setShowPaidByPicker] = useState(false);
  // Error states for inline validation
  const [descriptionError, setDescriptionError] = useState<string>("");
  const [amountError, setAmountError] = useState<string>("");
  const [dateError, setDateError] = useState<string>("");
  const [paidByError, setPaidByError] = useState<string>("");
  const [splitAmongError, setSplitAmongError] = useState<string>("");
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get("window").height;

  // Fetch participants for the group
  const {
    data: participants,
    isLoading: isLoadingParticipants,
    error: participantsError,
  } = useParticipants(groupId || null);

  // Memoize derived values to avoid recalculations
  const isGroupExpense = useMemo(
    () => type === "expense" && groupId && (participants?.length || 0) > 0,
    [type, groupId, participants?.length]
  );

  // Filter participants by type
  const activeParticipants = useMemo(
    () => (participants || []).filter((p) => p.type === "member"),
    [participants]
  );

  const invitedParticipants = useMemo(
    () => (participants || []).filter((p) => p.type === "invited"),
    [participants]
  );

  const formerParticipants = useMemo(
    () => (participants || []).filter((p) => p.type === "former"),
    [participants]
  );

  // Get participants that are in the current transaction (for editing)
  const transactionParticipantIds = useMemo(() => {
    if (!transaction) return new Set<string>();
    const ids = new Set<string>();

    // Add paid_by_participant_id if present
    if (transaction.paid_by_participant_id) {
      ids.add(transaction.paid_by_participant_id);
    }

    // Add participant_ids from splits
    if (Array.isArray(transaction.splits) && transaction.splits.length > 0) {
      transaction.splits.forEach((split) => {
        if (split.participant_id) {
          ids.add(split.participant_id);
        }
      });
    }

    return ids;
  }, [transaction]);

  // Include former participants if they're in the current transaction OR if they're the paid_by participant
  const availableParticipants = useMemo(() => {
    const combined = [...activeParticipants, ...invitedParticipants];

    // Add former participants if they're part of this transaction OR if they're the paid_by participant
    if (transaction || paidBy) {
      formerParticipants.forEach((p) => {
        const isInTransaction =
          transaction && transactionParticipantIds.has(p.id);
        const isPaidBy = paidBy && p.id === paidBy;
        if (isInTransaction || isPaidBy) {
          // Only add if not already in combined
          if (!combined.some((c) => c.id === p.id)) {
            combined.push(p);
          }
        }
      });
    }

    return combined;
  }, [
    activeParticipants,
    invitedParticipants,
    formerParticipants,
    transaction,
    transactionParticipantIds,
    paidBy,
  ]);

  const allParticipantIds = useMemo(
    () => activeParticipants.map((p) => p.id),
    [activeParticipants]
  );

  const areAllParticipantsSelected = useMemo(() => {
    const participantsToCheck = transaction
      ? availableParticipants
      : activeParticipants;
    return (
      participantsToCheck.length > 0 &&
      participantsToCheck.every((p) => splitAmong.includes(p.id))
    );
  }, [activeParticipants, availableParticipants, splitAmong, transaction]);

  const paidByParticipant = useMemo(
    () =>
      paidBy ? availableParticipants.find((p) => p.id === paidBy) : undefined,
    [availableParticipants, paidBy]
  );

  // Helper: Reset form to default state
  const resetFormToDefaults = useCallback(() => {
    const today = new Date();
    setDescription("");
    setAmount("");
    setDate(today.toISOString().split("T")[0]);
    setSelectedDate(today);
    setType("expense");
    setCategory("");
    setCurrency(effectiveDefaultCurrency);
    setPaidBy("");
    // Default split: all participants if it's a group expense context
    const shouldDefaultToAllParticipants =
      groupId && activeParticipants.length > 0;
    setSplitAmong(shouldDefaultToAllParticipants ? allParticipantIds : []);
    // Clear all errors
    setDescriptionError("");
    setAmountError("");
    setDateError("");
    setPaidByError("");
    setSplitAmongError("");
  }, [
    effectiveDefaultCurrency,
    groupId,
    activeParticipants.length,
    allParticipantIds,
  ]);

  // Helper: Load transaction data into form
  const loadTransactionData = useCallback(
    (tx: Transaction) => {
      setDescription(tx.description || "");
      setAmount(tx.amount.toString());
      const transactionDate = tx.date ? new Date(tx.date) : new Date();
      setSelectedDate(transactionDate);
      setDate(tx.date || "");
      setType(tx.type || "expense");
      setCategory(tx.category || "");
      setCurrency(tx.currency || effectiveDefaultCurrency);

      // Use paid_by_participant_id exclusively
      if (tx.paid_by_participant_id) {
        setPaidBy(tx.paid_by_participant_id);
      } else {
        setPaidBy("");
      }

      // Extract participant_ids from splits or split_among_participant_ids
      if (Array.isArray(tx.splits) && tx.splits.length > 0) {
        const participantIds = tx.splits
          .map((s) => s.participant_id)
          .filter((id): id is string => !!id);
        setSplitAmong([...new Set(participantIds)]);
      } else if (
        Array.isArray(tx.split_among_participant_ids) &&
        tx.split_among_participant_ids.length > 0
      ) {
        setSplitAmong([...new Set(tx.split_among_participant_ids)]);
      } else {
        setSplitAmong([]);
      }
    },
    [effectiveDefaultCurrency]
  );

  // Initialize form on mount
  useEffect(() => {
    if (transaction) {
      loadTransactionData(transaction);
    } else {
      resetFormToDefaults();
    }
  }, [transaction, loadTransactionData, resetFormToDefaults]);

  // No longer need legacy resolution useEffects as they are handled by the participant model

  // Clear split data when switching away from expense type (only for new transactions)
  useEffect(() => {
    if (transaction) return; // Don't auto-update when editing

    if (!isGroupExpense) {
      // Clear split data when switching away from expense
      setSplitAmong([]);
      setPaidBy("");
    }
  }, [isGroupExpense, transaction]);

  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split("T")[0];
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "set" && selectedDate) {
        setSelectedDate(selectedDate);
        setDate(formatDateForInput(selectedDate));
      }
    } else {
      // iOS - update date as user scrolls, but don't close until Done is pressed
      if (selectedDate) {
        setSelectedDate(selectedDate);
      }
      if (event.type === "dismissed") {
        setShowDatePicker(false);
      }
    }
  };

  const handleToggleSplitMember = (participantId: string) => {
    setSplitAmong((prev) => {
      // Remove duplicates first to ensure data integrity
      const uniquePrev = [...new Set(prev)];
      if (uniquePrev.includes(participantId)) {
        // Prevent removing if this is the paidBy person and they're the only one in the split
        if (paidBy === participantId && uniquePrev.length === 1) {
          // Can't remove the only person, especially if they're the one who paid
          return uniquePrev;
        }
        // Allow removal of paidBy person if there are other people in the split
        return uniquePrev.filter((id) => id !== participantId);
      } else {
        return [...uniquePrev, participantId];
      }
    });
    // Clear error when user makes a selection
    if (splitAmongError) {
      setSplitAmongError("");
    }
  };

  const handleToggleAllMembers = () => {
    if (areAllParticipantsSelected) {
      // Deselect all
      setSplitAmong([]);
    } else {
      // Select all - ensure no duplicates
      // For new transactions, select only active participants
      // For existing transactions, select all available participants (active + invited + former)
      const participantsToSelect = transaction
        ? availableParticipants
        : activeParticipants;
      const allParticipantIds = participantsToSelect.map((p) => p.id);
      setSplitAmong([...new Set(allParticipantIds)]);
    }
    // Clear error
    if (splitAmongError) {
      setSplitAmongError("");
    }
  };

  // Handler to open Paid By picker
  const handleOpenPaidByPicker = useCallback(() => {
    if (!loading) {
      setShowPaidByPicker(true);
    }
  }, [loading]);

  // Validation function that returns true if form is valid
  const validateForm = (): boolean => {
    let isValid = true;

    // Clear previous errors
    setDescriptionError("");
    setAmountError("");
    setDateError("");
    setPaidByError("");
    setSplitAmongError("");

    // Validate description
    if (!description.trim()) {
      setDescriptionError("Please enter a description");
      isValid = false;
    }

    // Validate amount
    if (!amount.trim()) {
      setAmountError("Please enter an amount");
      isValid = false;
    } else {
      // Validate format: only digits and optional decimal point with 1-2 decimal places
      const amountRegex = /^\d+(\.\d{1,2})?$/;
      if (!amountRegex.test(amount.trim())) {
        setAmountError("Please enter a valid amount (e.g., 10.50)");
        isValid = false;
      } else {
        const amountValue = parseFloat(amount);
        // Check for NaN, Infinity, and negative values
        if (isNaN(amountValue) || !isFinite(amountValue) || amountValue <= 0) {
          setAmountError("Please enter a valid amount greater than 0");
          isValid = false;
        }
      }
    }

    // Validate date
    if (!date.trim()) {
      setDateError("Please enter a date");
      isValid = false;
    }

    // Validate expense splitting fields for group expenses
    if (isGroupExpense) {
      if (!paidBy) {
        setPaidByError("Please select who paid for this expense");
        isValid = false;
      }
      if (splitAmong.length === 0) {
        setSplitAmongError(
          "Please select at least one person to split the expense among"
        );
        isValid = false;
      }
    }

    return isValid;
  };

  const handleSave = async () => {
    // Validate form
    if (!validateForm()) {
      return;
    }

    const amountValue = parseFloat(amount);
    setLoading(true);
    try {
      // When updating, always include current splits to preserve former participants
      // If this is an update and we have a transaction, ensure we include all current splits
      await onSave({
        description: description.trim(),
        amount: amountValue,
        date: date.trim(),
        type,
        category: category.trim() || undefined,
        currency: currency || effectiveDefaultCurrency,
        paid_by_participant_id: isGroupExpense ? paidBy : undefined,
        split_among_participant_ids: isGroupExpense
          ? splitAmong
          : undefined,
      });
      // onDismiss will be called by the parent after successful save if needed,
      // but usually we want to close the screen.
      // Here we rely on the parent to navigate back.
    } catch (error) {
      // Show error in an alert for API errors (not validation errors)
      Alert.alert("Error", getUserFriendlyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!onDelete || !transaction) return;

    Alert.alert(
      "Delete Transaction",
      `Are you sure you want to delete "${
        transaction.description || "this transaction"
      }"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await onDelete();
              // Parent handles navigation
            } catch (error) {
              Alert.alert("Error", getUserFriendlyErrorMessage(error));
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleHardwareBack = useCallback(() => {
    if (showCurrencyPicker) {
      setShowCurrencyPicker(false);
      return true;
    }

    if (showPaidByPicker) {
      setShowPaidByPicker(false);
      return true;
    }

    if (showDatePicker && Platform.OS === "android") {
      setShowDatePicker(false);
      return true;
    }

    onDismiss();
    return true;
  }, [onDismiss, showCurrencyPicker, showPaidByPicker, showDatePicker]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleHardwareBack
    );

    return () => subscription.remove();
  }, [handleHardwareBack]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "left", "right"]}
    >
      <Appbar.Header
        style={[styles.header, { backgroundColor: theme.colors.surface }]}
        elevated
      >
        <Appbar.BackAction onPress={onDismiss} />
        <Appbar.Content
          title={transaction ? "Edit Transaction" : "New Transaction"}
          titleStyle={{ fontWeight: "bold" }}
        />
      </Appbar.Header>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          <TextInput
            label="Description"
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              if (descriptionError) {
                setDescriptionError("");
              }
            }}
            mode="outlined"
            disabled={loading}
            error={!!descriptionError}
            style={styles.input}
            left={<TextInput.Icon icon="text" />}
            placeholder="e.g., Grocery shopping"
          />

          <View style={styles.amountRow}>
            <TextInput
              label="Amount"
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                if (amountError) {
                  setAmountError("");
                }
              }}
              mode="outlined"
              keyboardType="decimal-pad"
              disabled={loading}
              error={!!amountError}
              style={styles.amountInput}
              left={
                <TextInput.Affix
                  text={getCurrencySymbol(currency)}
                  textStyle={styles.currencyAffix}
                />
              }
              placeholder="0.00"
            />
            <Button
              mode="outlined"
              onPress={() => setShowCurrencyPicker(true)}
              style={styles.currencyButton}
              disabled={loading}
            >
              {currency}
            </Button>
          </View>

          <TextInput
            label="Date"
            value={date}
            mode="outlined"
            editable={!loading}
            showSoftInputOnFocus={false}
            onFocus={() => setShowDatePicker(true)}
            error={!!dateError}
            style={styles.input}
            left={<TextInput.Icon icon="calendar" />}
            right={
              <TextInput.Icon
                icon="calendar"
                onPress={() => !loading && setShowDatePicker(true)}
              />
            }
            placeholder="YYYY-MM-DD"
            onPressIn={() => !loading && setShowDatePicker(true)}
          />
          {showDatePicker && (
            <>
              {Platform.OS === "ios" && (
                <View
                  style={[
                    styles.datePickerContainer,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.outlineVariant,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.datePickerHeader,
                      { borderBottomColor: theme.colors.outlineVariant },
                    ]}
                  >
                    <Button onPress={() => setShowDatePicker(false)}>
                      Cancel
                    </Button>
                    <Text variant="titleMedium">Select Date</Text>
                    <Button
                      onPress={() => {
                        const formattedDate = formatDateForInput(selectedDate);
                        setDate(formattedDate);
                        setShowDatePicker(false);
                        // Clear error when date is selected
                        if (dateError) {
                          setDateError("");
                        }
                      }}
                    >
                      Done
                    </Button>
                  </View>
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    maximumDate={new Date()}
                    style={styles.datePicker}
                  />
                </View>
              )}
              {Platform.OS === "android" && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                  maximumDate={new Date()}
                />
              )}
            </>
          )}

          <View style={styles.segmentedContainer}>
            <Text
              variant="labelLarge"
              style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
            >
              Type
            </Text>
            <SegmentedButtons
              value={type}
              onValueChange={(value) => {
                const newType = value as "income" | "expense";
                setType(newType);
                // Clear expense splitting fields when switching to income
                if (newType === "income") {
                  setPaidBy("");
                  setSplitAmong([]);
                } else if (
                  newType === "expense" &&
                  activeParticipants.length > 0
                ) {
                  // When switching to expense, default to all active participants
                  setSplitAmong(activeParticipants.map((p) => p.id));
                }
              }}
              buttons={[
                {
                  value: "expense",
                  label: "Expense",
                  icon: "arrow-down",
                },
                {
                  value: "income",
                  label: "Income",
                  icon: "arrow-up",
                },
              ]}
              style={styles.segmentedButtons}
            />
          </View>

          <TextInput
            label="Category (Optional)"
            value={category}
            onChangeText={setCategory}
            mode="outlined"
            disabled={loading}
            style={styles.input}
            left={<TextInput.Icon icon="tag" />}
            placeholder="e.g., Food, Transportation"
          />

          {/* Expense Splitting Fields - Only for group expenses */}
          {isGroupExpense && (
            <>
              <TouchableOpacity
                onPress={handleOpenPaidByPicker}
                activeOpacity={0.7}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Select who paid for this expense"
              >
                <TextInput
                  label="Paid By"
                  value={
                    paidBy
                      ? (() => {
                          // First try to find in availableParticipants by participant_id
                          let participant = availableParticipants.find(
                            (p) => p.id === paidBy
                          );

                          // If not found, try all participants by participant_id
                          if (!participant) {
                            participant = participants.find(
                              (p) => p.id === paidBy
                            );
                          }

                          // If still not found, paidBy might be a user_id (legacy), search by user_id
                          if (!participant) {
                            participant = participants.find(
                              (p) => p.user_id === paidBy
                            );
                          }

                          const isFormer = participant?.type === "former";
                          const isInvited = participant?.type === "invited";
                          const displayName =
                            participant?.full_name ||
                            participant?.email ||
                            `Participant ${paidBy.substring(0, 8)}...`;
                          if (isFormer) {
                            return `${displayName} (Former)`;
                          }
                          if (isInvited) {
                            return `${displayName} (Invited)`;
                          }
                          return displayName;
                        })()
                      : ""
                  }
                  mode="outlined"
                  editable={false}
                  disabled={loading}
                  error={!!paidByError}
                  style={styles.input}
                  showSoftInputOnFocus={false}
                  left={<TextInput.Icon icon="account" />}
                  right={
                    <TextInput.Icon
                      icon="chevron-down"
                      onPress={handleOpenPaidByPicker}
                    />
                  }
                  placeholder="Select who paid"
                />
              </TouchableOpacity>

              <View style={styles.splitAmongContainer}>
                <View style={styles.splitAmongHeader}>
                  <Text
                    variant="labelLarge"
                    style={[
                      styles.label,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Split Among
                  </Text>
                  <Button
                    mode="text"
                    compact
                    onPress={handleToggleAllMembers}
                    disabled={loading || isLoadingParticipants}
                    style={styles.selectAllButton}
                  >
                    {areAllParticipantsSelected ? "Deselect All" : "Select All"}
                  </Button>
                </View>
                {splitAmongError ? (
                  <Text
                    variant="bodySmall"
                    style={[styles.errorText, { color: theme.colors.error }]}
                  >
                    {splitAmongError}
                  </Text>
                ) : null}
                {participantsError && (
                  <Text
                    variant="bodySmall"
                    style={[styles.errorText, { color: theme.colors.error }]}
                  >
                    Failed to load participants: {participantsError.message}
                  </Text>
                )}
                {isLoadingParticipants && (
                  <Text
                    variant="bodySmall"
                    style={[
                      { color: theme.colors.onSurfaceVariant, padding: 8 },
                    ]}
                  >
                    Loading participants...
                  </Text>
                )}
                {!isLoadingParticipants &&
                  availableParticipants.length === 0 && (
                    <Text
                      variant="bodySmall"
                      style={[
                        { color: theme.colors.onSurfaceVariant, padding: 8 },
                      ]}
                    >
                      No participants found. Add members to the group first.
                    </Text>
                  )}
                <View
                  style={[
                    styles.splitAmongList,
                    splitAmongError && {
                      borderColor: theme.colors.error,
                      borderWidth: 1,
                    },
                  ]}
                >
                  {availableParticipants.map((participant) => {
                    const isSelected = splitAmong.includes(participant.id);
                    if (
                      __DEV__ &&
                      transaction &&
                      availableParticipants.length <= 3
                    ) {
                      console.log(
                        "[TransactionForm] Participant selection check:",
                        {
                          participant_id: participant.id,
                          participant_name:
                            participant.full_name || participant.email,
                          isSelected,
                          splitAmong,
                        }
                      );
                    }
                    const isFormer = participant.type === "former";
                    const isInvited = participant.type === "invited";
                    const displayName =
                      participant.full_name ||
                      participant.email ||
                      `Participant ${participant.id.substring(0, 8)}...`;
                    return (
                      <TouchableOpacity
                        key={participant.id}
                        style={[
                          styles.splitMemberItem,
                          isSelected && {
                            backgroundColor: theme.colors.primaryContainer,
                          },
                        ]}
                        onPress={() => handleToggleSplitMember(participant.id)}
                        disabled={loading}
                      >
                        <Checkbox
                          status={isSelected ? "checked" : "unchecked"}
                          onPress={() =>
                            handleToggleSplitMember(participant.id)
                          }
                          disabled={
                            loading ||
                            // Disable if this is the paidBy person and they're the only one in splitAmong
                            (paidBy === participant.id &&
                              splitAmong.length === 1 &&
                              splitAmong.includes(participant.id))
                          }
                        />
                        <View
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              flexShrink: 1,
                            }}
                          >
                            <Text
                              variant="bodyLarge"
                              style={[
                                styles.splitMemberText,
                                (isFormer || isInvited) && {
                                  fontStyle: "italic",
                                },
                              ]}
                            >
                              {displayName}
                            </Text>
                            {isFormer && (
                              <Text
                                variant="bodySmall"
                                style={{
                                  marginLeft: 8,
                                  color: theme.colors.onSurfaceVariant,
                                  opacity: 0.7,
                                }}
                              >
                                (Former)
                              </Text>
                            )}
                            {isInvited && (
                              <Text
                                variant="bodySmall"
                                style={{
                                  marginLeft: 8,
                                  color: theme.colors.primary,
                                  opacity: 0.8,
                                }}
                              >
                                (Invited)
                              </Text>
                            )}
                          </View>
                          {isSelected &&
                            splitAmong.length > 0 &&
                            amount &&
                            parseFloat(amount) > 0 && (
                              <Text
                                variant="bodySmall"
                                style={[
                                  styles.splitAmount,
                                  { color: theme.colors.onSurfaceVariant },
                                  { marginLeft: 12 },
                                ]}
                              >
                                {formatCurrency(
                                  parseFloat(amount) / splitAmong.length,
                                  currency
                                )}
                              </Text>
                            )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          <View style={styles.buttonRow}>
            {transaction && onDelete && (
              <Button
                mode="outlined"
                onPress={handleDelete}
                disabled={loading}
                style={[styles.button, styles.deleteButton]}
                textColor={theme.colors.error}
                icon="delete"
              >
                Delete
              </Button>
            )}
            <Button
              mode="contained"
              onPress={handleSave}
              disabled={loading}
              loading={loading}
              style={[
                styles.button,
                styles.saveButton,
                !(transaction && onDelete) && styles.saveButtonFullWidth,
              ]}
            >
              {transaction ? "Update" : "Create"}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Paid By Picker Modal */}
      <Modal
        visible={showPaidByPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPaidByPicker(false)}
      >
        <TouchableOpacity
          style={styles.currencyPickerOverlay}
          activeOpacity={1}
          onPress={() => setShowPaidByPicker(false)}
        >
          <View
            style={[
              styles.currencyPickerContainer,
              { backgroundColor: theme.colors.surface },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View
              style={[
                styles.currencyPickerHeader,
                { borderBottomColor: theme.colors.outlineVariant },
              ]}
            >
              <Text variant="titleLarge">Select Who Paid</Text>
              <Button onPress={() => setShowPaidByPicker(false)}>Close</Button>
            </View>
            <FlatList
              data={availableParticipants}
              keyExtractor={(item) => item.id}
              style={styles.currencyList}
              renderItem={({ item }) => {
                const isFormer = item.type === "former";
                const isInvited = item.type === "invited";
                const displayName =
                  item.full_name ||
                  item.email ||
                  `Participant ${item.id.substring(0, 8)}...`;
                return (
                  <TouchableOpacity
                    style={[
                      styles.currencyItem,
                      paidBy === item.id && {
                        backgroundColor: theme.colors.secondaryContainer,
                      },
                    ]}
                    onPress={() => {
                      setPaidBy(item.id);
                      setShowPaidByPicker(false);
                      if (paidByError) {
                        setPaidByError("");
                      }
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        variant="bodyLarge"
                        style={{
                          fontWeight: paidBy === item.id ? "bold" : "normal",
                          fontStyle:
                            isFormer || isInvited ? "italic" : "normal",
                        }}
                      >
                        {displayName}
                      </Text>
                      {isFormer && (
                        <Text
                          variant="bodySmall"
                          style={{
                            marginLeft: 8,
                            color: theme.colors.onSurfaceVariant,
                            opacity: 0.7,
                          }}
                        >
                          (Former)
                        </Text>
                      )}
                      {isInvited && (
                        <Text
                          variant="bodySmall"
                          style={{
                            marginLeft: 8,
                            color: theme.colors.primary,
                            opacity: 0.8,
                          }}
                        >
                          (Invited)
                        </Text>
                      )}
                    </View>
                    {paidBy === item.id && (
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.primary }}
                      >
                        Selected
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Currency Picker Modal */}
      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCurrencyPicker(false)}
      >
        <TouchableOpacity
          style={styles.currencyPickerOverlay}
          activeOpacity={1}
          onPress={() => setShowCurrencyPicker(false)}
        >
          <View
            style={[
              styles.currencyPickerContainer,
              { backgroundColor: theme.colors.surface },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View
              style={[
                styles.currencyPickerHeader,
                { borderBottomColor: theme.colors.outlineVariant },
              ]}
            >
              <Text variant="titleLarge">Select Currency</Text>
              <Button onPress={() => setShowCurrencyPicker(false)}>
                Close
              </Button>
            </View>
            <FlatList
              data={CURRENCIES}
              keyExtractor={(item) => item.code}
              style={styles.currencyList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.currencyItem,
                    currency === item.code && {
                      backgroundColor: theme.colors.secondaryContainer,
                    },
                  ]}
                  onPress={() => {
                    setCurrency(item.code);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text
                    variant="bodyLarge"
                    style={{
                      fontWeight: currency === item.code ? "bold" : "normal",
                    }}
                  >
                    {item.code} ({item.symbol})
                  </Text>
                  {currency === item.code && (
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.primary }}
                    >
                      Selected
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    elevation: 0,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  input: {
    marginBottom: 16,
  },
  amountRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  amountInput: {
    flex: 1,
    marginRight: 8,
  },
  currencyButton: {
    justifyContent: "center",
    marginTop: 6,
  },
  currencyAffix: {
    marginRight: 8,
  },
  segmentedContainer: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
  },
  segmentedButtons: {
    marginBottom: 8,
  },
  datePickerContainer: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
    borderBottomWidth: 1,
  },
  datePicker: {
    height: 200,
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 16,
    marginBottom: 32,
  },
  button: {
    flex: 1,
  },
  deleteButton: {
    marginRight: 8,
    borderColor: "transparent",
  },
  saveButton: {
    marginLeft: 8,
  },
  saveButtonFullWidth: {
    marginLeft: 0,
  },
  currencyPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    padding: 20,
  },
  currencyPickerContainer: {
    borderRadius: 12,
    maxHeight: "80%",
    elevation: 5,
  },
  currencyPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  currencyList: {
    padding: 8,
  },
  currencyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
  },
  splitAmongContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  splitAmongHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  selectAllButton: {
    marginRight: -8,
  },
  splitAmongList: {
    borderRadius: 8,
    overflow: "hidden",
  },
  splitMemberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  splitMemberText: {
    flex: 1,
    marginLeft: 4,
  },
  splitAmount: {
    marginRight: 8,
  },
  errorText: {
    marginBottom: 8,
  },
});
