import React, { useEffect, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Appbar,
  Button,
  Menu,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Transaction } from "../types";
import { CURRENCIES, getCurrencySymbol } from "../utils/currency";

interface TransactionFormScreenProps {
  visible: boolean;
  transaction?: Transaction | null;
  onSave: (
    transaction: Omit<Transaction, "id" | "created_at" | "user_id">
  ) => Promise<void>;
  onDismiss: () => void;
  onDelete?: () => Promise<void>;
  defaultCurrency?: string;
}

export const TransactionFormScreen: React.FC<TransactionFormScreenProps> = ({
  visible,
  transaction,
  onSave,
  onDismiss,
  onDelete,
  defaultCurrency = "USD",
}) => {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("");
  const [currency, setCurrency] = useState<string>(defaultCurrency);
  const [currencyMenuVisible, setCurrencyMenuVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slideAnim] = useState(new Animated.Value(0));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get("window").height;

  // Initialize form with transaction data if editing
  useEffect(() => {
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
      setCurrency(transaction.currency || defaultCurrency);
    } else {
      // Set default date to today
      const today = new Date();
      setSelectedDate(today);
      setDate(today.toISOString().split("T")[0]);
      setCurrency(defaultCurrency);
    }
  }, [transaction, defaultCurrency]);

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
    setCurrency(defaultCurrency);
    onDismiss();
  };

  const handleSave = async () => {
    // Validation
    if (!description.trim()) {
      Alert.alert("Error", "Please enter a description");
      return;
    }

    if (!amount.trim()) {
      Alert.alert("Error", "Please enter an amount");
      return;
    }

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert("Error", "Please enter a valid amount greater than 0");
      return;
    }

    if (!date.trim()) {
      Alert.alert("Error", "Please enter a date");
      return;
    }

    setLoading(true);
    try {
      await onSave({
        description: description.trim(),
        amount: amountValue,
        date: date.trim(),
        type,
        category: category.trim() || undefined,
        currency: currency || defaultCurrency || "USD",
      });
      handleDismiss();
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to save transaction"
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
              handleDismiss();
            } catch (error) {
              Alert.alert(
                "Error",
                error instanceof Error
                  ? error.message
                  : "Failed to delete transaction"
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
            },
          ]}
        >
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
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
            >
              <TextInput
                label="Description"
                value={description}
                onChangeText={setDescription}
                mode="outlined"
                disabled={loading}
                style={styles.input}
                left={<TextInput.Icon icon="text" />}
                placeholder="e.g., Grocery shopping"
              />

              <View style={styles.amountRow}>
                <TextInput
                  label="Amount"
                  value={amount}
                  onChangeText={setAmount}
                  mode="outlined"
                  keyboardType="decimal-pad"
                  disabled={loading}
                  style={styles.amountInput}
                  left={
                    <TextInput.Affix
                      text={getCurrencySymbol(currency)}
                      textStyle={styles.currencyAffix}
                    />
                  }
                  placeholder="0.00"
                />
                <Menu
                  visible={currencyMenuVisible}
                  onDismiss={() => setCurrencyMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setCurrencyMenuVisible(true)}
                      style={styles.currencyButton}
                      disabled={loading}
                    >
                      {currency}
                    </Button>
                  }
                >
                  {CURRENCIES.map((curr) => (
                    <Menu.Item
                      key={curr.code}
                      onPress={() => {
                        setCurrency(curr.code);
                        setCurrencyMenuVisible(false);
                      }}
                      title={`${curr.code} - ${curr.name}`}
                      leadingIcon={curr.code === currency ? "check" : undefined}
                    />
                  ))}
                </Menu>
              </View>

              <TextInput
                label="Date"
                value={date}
                mode="outlined"
                editable={!loading}
                showSoftInputOnFocus={false}
                onFocus={() => setShowDatePicker(true)}
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
                    <View style={styles.datePickerContainer}>
                      <View style={styles.datePickerHeader}>
                        <Button onPress={() => setShowDatePicker(false)}>
                          Cancel
                        </Button>
                        <Text variant="titleMedium">Select Date</Text>
                        <Button
                          onPress={() => {
                            setDate(formatDateForInput(selectedDate));
                            setShowDatePicker(false);
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
                  onValueChange={(value) =>
                    setType(value as "income" | "expense")
                  }
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
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheet: {
    backgroundColor: "#ffffff",
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
    backgroundColor: "#ccc",
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
    backgroundColor: "#ffffff",
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  datePicker: {
    height: 200,
  },
});
