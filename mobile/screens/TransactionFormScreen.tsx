import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Animated,
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
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Transaction, GroupMember } from "../types";
import {
  CURRENCIES,
  getCurrencySymbol,
  getDefaultCurrency,
} from "../utils/currency";
import { getUserFriendlyErrorMessage } from "../utils/errorMessages";
import { Checkbox } from "react-native-paper";

interface TransactionFormScreenProps {
  visible: boolean;
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
  visible,
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
  const [slideAnim] = useState(new Animated.Value(0));
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

  // Determine if we should show expense splitting fields
  const isGroupExpense = type === "expense" && groupId && groupMembers.length > 0;

  // Initialize form with transaction data if editing
  useEffect(() => {
    if (!visible) return; // Only initialize when form becomes visible
    
    if (transaction) {
      setDescription(transaction.description || "");
      setAmount(transaction.amount.toString());
      const transactionDate = transaction.date
        ? new Date(transaction.date)
        : new Date();
      setSelectedDate(transactionDate);
      setDate(transaction.date || "");
      setType(transaction.type || "expense");
      setCategory(transaction.category || "");
      setCurrency(transaction.currency || effectiveDefaultCurrency);
      setPaidBy(transaction.paid_by || "");
      setSplitAmong(transaction.split_among || []);
    } else {
      // Set default date to today
      const today = new Date();
      setSelectedDate(today);
      setDate(today.toISOString().split("T")[0]);
      setCurrency(effectiveDefaultCurrency);
      setPaidBy("");
      // Default: split among all members only on initial load
      if (isGroupExpense && groupMembers.length > 0) {
        setSplitAmong(groupMembers.map((m) => m.user_id));
      } else {
        setSplitAmong([]);
      }
    }
  }, [visible, transaction, effectiveDefaultCurrency, groupMembers, isGroupExpense]);

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

  // Animation effect
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleDismiss = () => {
    setDescription("");
    setAmount("");
    setDate("");
    setType("expense");
    setCategory("");
    setCurrency(effectiveDefaultCurrency);
    setPaidBy("");
    setSplitAmong([]);
    // Clear all errors
    setDescriptionError("");
    setAmountError("");
    setDateError("");
    setPaidByError("");
    setSplitAmongError("");
    onDismiss();
  };

  const handleToggleSplitMember = (userId: string) => {
    setSplitAmong((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
    // Clear error when user makes a selection
    if (splitAmongError) {
      setSplitAmongError("");
    }
  };

  const handleToggleAllMembers = () => {
    if (splitAmong.length === groupMembers.length) {
      // Deselect all
      setSplitAmong([]);
    } else {
      // Select all
      setSplitAmong(groupMembers.map((m) => m.user_id));
    }
    // Clear error
    if (splitAmongError) {
      setSplitAmongError("");
    }
  };

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
      const amountValue = parseFloat(amount);
      if (isNaN(amountValue) || amountValue <= 0) {
        setAmountError("Please enter a valid amount greater than 0");
        isValid = false;
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
      handleDismiss();
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

  // Note: We don't disable the button based on validation
  // Instead, we show errors when the user tries to submit

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
              handleDismiss();
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

  const bottomSheetHeight = screenHeight * 0.85;
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [bottomSheetHeight, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              height: bottomSheetHeight,
              transform: [{ translateY }],
              paddingBottom: insets.bottom,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <View style={styles.handleContainer}>
            <View
              style={[
                styles.handle,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
          </View>
          <Appbar.Header style={styles.header}>
            <Appbar.Content
              title={transaction ? "Edit Transaction" : "New Transaction"}
            />
            <Appbar.Action icon="close" onPress={handleDismiss} />
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
                helperText={descriptionError}
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
                  helperText={amountError}
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
                helperText={dateError}
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
                    left={<TextInput.Icon icon="account" />}
                    right={
                      <TextInput.Icon
                        icon="chevron-down"
                        onPress={() => !loading && setShowPaidByPicker(true)}
                      />
                    }
                    onPressIn={() => !loading && setShowPaidByPicker(true)}
                    placeholder="Select who paid"
                    helperText={paidByError}
                  />

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
                        {splitAmong.length === groupMembers.length
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
                                {getCurrencySymbol(currency)}
                                {(
                                  parseFloat(amount) / splitAmong.length
                                ).toFixed(2)}
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
        </Animated.View>
      </View>

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
                    item.user_id === paidBy && {
                      backgroundColor: theme.colors.primaryContainer,
                    },
                  ]}
                  onPress={() => {
                    setPaidBy(item.user_id);
                    setShowPaidByPicker(false);
                    // Clear error when user makes a selection
                    if (paidByError) {
                      setPaidByError("");
                    }
                  }}
                >
                  <View style={styles.currencyItemContent}>
                    <Text variant="bodyLarge" style={styles.currencyCode}>
                      {item.email || `User ${item.user_id.substring(0, 8)}...`}
                    </Text>
                  </View>
                  {item.user_id === paidBy && (
                    <Text style={{ color: theme.colors.primary }}>✓</Text>
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
                    item.code === currency && {
                      backgroundColor: theme.colors.primaryContainer,
                    },
                  ]}
                  onPress={() => {
                    setCurrency(item.code);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <View style={styles.currencyItemContent}>
                    <Text variant="bodyLarge" style={styles.currencyCode}>
                      {item.code}
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={[
                        styles.currencyName,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {item.name}
                    </Text>
                  </View>
                  {item.code === currency && (
                    <Text style={{ color: theme.colors.primary }}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    elevation: 0,
    backgroundColor: "transparent",
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  input: {
    marginBottom: 16,
  },
  amountRow: {
    flexDirection: "row",
    marginBottom: 16,
    alignItems: "center",
  },
  amountInput: {
    flex: 1,
    marginRight: 8,
  },
  currencyAffix: {
    fontSize: 18,
    fontWeight: "bold",
  },
  currencyButton: {
    minWidth: 80,
  },
  segmentedContainer: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
  },
  segmentedButtons: {
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 8,
  },
  button: {
    flex: 1,
  },
  deleteButton: {},
  saveButton: {},
  saveButtonFullWidth: {
    flex: 1,
  },
  datePickerContainer: {
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  datePicker: {
    height: 200,
  },
  currencyPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  currencyPickerContainer: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    borderRadius: 16,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  currencyPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  currencyList: {
    maxHeight: 400,
  },
  currencyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  currencyItemContent: {
    flex: 1,
  },
  currencyCode: {
    fontWeight: "600",
    marginBottom: 4,
  },
  currencyName: {
    fontSize: 14,
  },
  splitAmongContainer: {
    marginBottom: 16,
  },
  splitAmongHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  selectAllButton: {
    margin: 0,
  },
  splitAmongList: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
    overflow: "hidden",
  },
  splitMemberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  splitMemberText: {
    flex: 1,
    marginLeft: 8,
  },
  splitAmount: {
    marginLeft: 8,
    fontWeight: "600",
  },
  errorText: {
    marginTop: 4,
    marginBottom: 8,
  },
});
