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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupMember, Transaction } from "../types";
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
  groupMembers?: GroupMember[]; // Members of the group for expense splitting
  groupId?: string; // Group ID to determine if this is a group transaction
}

export const TransactionFormScreen: React.FC<TransactionFormScreenProps> = ({
  transaction,
  onSave,
  onDismiss,
  onDelete,
  defaultCurrency,
  groupMembers = [],
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
  const [paidBy, setPaidBy] = useState<string>("");
  const [splitAmong, setSplitAmong] = useState<string[]>([]);
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

  // Memoize derived values to avoid recalculations
  const isGroupExpense = useMemo(
    () => type === "expense" && groupId && groupMembers.length > 0,
    [type, groupId, groupMembers.length]
  );

  const allMemberIds = useMemo(
    () => groupMembers.map((m) => m.user_id),

    [groupMembers]
  );

  const areAllMembersSelected = useMemo(
    () =>
      groupMembers.length > 0 &&
      groupMembers.every((m) => splitAmong.includes(m.user_id)),
    [groupMembers, splitAmong]
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
    // Default split: all members if it's a group expense context
    // We check groupId and groupMembers directly to avoid circular dependency
    const shouldDefaultToAllMembers = groupId && groupMembers.length > 0;
    setSplitAmong(shouldDefaultToAllMembers ? allMemberIds : []);
    // Clear all errors
    setDescriptionError("");
    setAmountError("");
    setDateError("");
    setPaidByError("");
    setSplitAmongError("");
  }, [effectiveDefaultCurrency, groupId, groupMembers.length, allMemberIds]);

  // Helper: Load transaction data into form
  const loadTransactionData = useCallback((tx: Transaction) => {
    setDescription(tx.description || "");
    setAmount(tx.amount.toString());
    const transactionDate = tx.date ? new Date(tx.date) : new Date();
    setSelectedDate(transactionDate);
    setDate(tx.date || "");
    setType(tx.type || "expense");
    setCategory(tx.category || "");
    setCurrency(tx.currency || effectiveDefaultCurrency);
    setPaidBy(tx.paid_by || "");
    setSplitAmong(
      Array.isArray(tx.split_among) ? [...new Set(tx.split_among)] : []
    );
  }, [effectiveDefaultCurrency]);

  // Initialize form on mount
  useEffect(() => {
    if (transaction) {
      loadTransactionData(transaction);
    } else {
      resetFormToDefaults();
    }
  }, [transaction, loadTransactionData, resetFormToDefaults]);

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

  const handleToggleSplitMember = (userId: string) => {
    setSplitAmong((prev) => {
      // Remove duplicates first to ensure data integrity
      const uniquePrev = [...new Set(prev)];
      if (uniquePrev.includes(userId)) {
        return uniquePrev.filter((id) => id !== userId);
      } else {
        return [...uniquePrev, userId];
      }
    });
    // Clear error when user makes a selection
    if (splitAmongError) {
      setSplitAmongError("");
    }
  };

  const handleToggleAllMembers = () => {
    if (areAllMembersSelected) {
      // Deselect all
      setSplitAmong([]);
    } else {
      // Select all - ensure no duplicates
      const allMemberIds = groupMembers.map((m) => m.user_id);
      setSplitAmong([...new Set(allMemberIds)]);
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
        setSplitAmongError("Please select at least one person to split the expense among");
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
      await onSave({
        description: description.trim(),
        amount: amountValue,
        date: date.trim(),
        type,
        category: category.trim() || undefined,
        currency: currency || effectiveDefaultCurrency,
        paid_by: isGroupExpense ? paidBy : undefined,
        split_among: isGroupExpense ? splitAmong : undefined,
      });
      // onDismiss will be called by the parent after successful save if needed,
      // but usually we want to close the screen.
      // Here we rely on the parent to navigate back.
    } catch (error) {
      // Show error in an alert for API errors (not validation errors)
      Alert.alert(
        "Error",
        getUserFriendlyErrorMessage(error)
      );
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
              Alert.alert(
                "Error",
                getUserFriendlyErrorMessage(error)
              );
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
  }, [
    onDismiss,
    showCurrencyPicker,
    showPaidByPicker,
    showDatePicker,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleHardwareBack
    );

    return () => subscription.remove();
  }, [handleHardwareBack]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <Appbar.Header style={[styles.header, { backgroundColor: theme.colors.surface }]} elevated>
        <Appbar.BackAction onPress={onDismiss} />
        <Appbar.Content
          title={transaction ? "Edit Transaction" : "New Transaction"}
          titleStyle={{ fontWeight: 'bold' }}
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
              style={[
                styles.label,
                { color: theme.colors.onSurfaceVariant },
              ]}
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
                } else if (newType === "expense" && groupMembers.length > 0) {
                  // When switching to expense, default to all members
                  setSplitAmong(groupMembers.map((m) => m.user_id));
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
                      ? groupMembers.find((m) => m.user_id === paidBy)?.email ||
                        `User ${paidBy.substring(0, 8)}...`
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
                    disabled={loading}
                    style={styles.selectAllButton}
                  >

                    {areAllMembersSelected
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                </View>
                {splitAmongError ? (
                  <Text
                    variant="bodySmall"
                    style={[
                      styles.errorText,
                      { color: theme.colors.error },
                    ]}
                  >
                    {splitAmongError}
                  </Text>
                ) : null}
                <View
                  style={[
                    styles.splitAmongList,
                    splitAmongError && {
                      borderColor: theme.colors.error,
                      borderWidth: 1,
                    },
                  ]}
                >
                  {groupMembers.map((member) => {
                    const isSelected = splitAmong.includes(member.user_id);
                    return (
                      <TouchableOpacity
                        key={member.user_id}
                        style={[
                          styles.splitMemberItem,
                          isSelected && {
                            backgroundColor: theme.colors.primaryContainer,
                          },
                        ]}
                        onPress={() => handleToggleSplitMember(member.user_id)}
                        disabled={loading}
                      >
                        <Checkbox
                          status={isSelected ? "checked" : "unchecked"}
                          onPress={() => handleToggleSplitMember(member.user_id)}
                          disabled={loading}
                        />
                        <Text
                          variant="bodyLarge"
                          style={styles.splitMemberText}
                        >
                          {member.email || `User ${member.user_id.substring(0, 8)}...`}
                        </Text>
                        {isSelected && splitAmong.length > 0 && amount && parseFloat(amount) > 0 && (
                          <Text
                            variant="bodySmall"
                            style={[
                              styles.splitAmount,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            {formatCurrency(
                              parseFloat(amount) / splitAmong.length,
                              currency
                            )}
                          </Text>
                        )}
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
              <Button onPress={() => setShowPaidByPicker(false)}>
                Close
              </Button>
            </View>
            <FlatList
              data={groupMembers}
              keyExtractor={(item) => item.user_id}
              style={styles.currencyList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.currencyItem,
                    paidBy === item.user_id && {
                      backgroundColor: theme.colors.secondaryContainer,
                    },
                  ]}
                  onPress={() => {
                    setPaidBy(item.user_id);
                    setShowPaidByPicker(false);
                    if (paidByError) {
                      setPaidByError("");
                    }
                  }}
                >
                  <Text
                    variant="bodyLarge"
                    style={{
                      fontWeight: paidBy === item.user_id ? "bold" : "normal",
                    }}
                  >
                    {item.email || `User ${item.user_id.substring(0, 8)}...`}
                  </Text>
                  {paidBy === item.user_id && (
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
