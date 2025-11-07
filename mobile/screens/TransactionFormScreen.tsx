import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Appbar,
  Button,
  Card,
  Menu,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Transaction } from "../types";
import { CURRENCIES, getCurrencySymbol } from "../utils/currency";

interface TransactionFormScreenProps {
  transaction?: Transaction | null;
  onSave: (
    transaction: Omit<Transaction, "id" | "created_at" | "user_id">
  ) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  defaultCurrency?: string;
}

export const TransactionFormScreen: React.FC<TransactionFormScreenProps> = ({
  transaction,
  onSave,
  onCancel,
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
  const theme = useTheme();

  // Initialize form with transaction data if editing
  useEffect(() => {
    if (transaction) {
      setDescription(transaction.description || "");
      setAmount(transaction.amount.toString());
      setDate(transaction.date || "");
      setType(transaction.type || "expense");
      setCategory(transaction.category || "");
      setCurrency(transaction.currency || defaultCurrency);
    } else {
      // Set default date to today
      const today = new Date();
      setDate(today.toISOString().split("T")[0]);
      setCurrency(defaultCurrency);
    }
  }, [transaction, defaultCurrency]);

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

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={onCancel} />
        <Appbar.Content
          title={transaction ? "Edit Transaction" : "New Transaction"}
        />
      </Appbar.Header>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.card} mode="elevated" elevation={2}>
            <Card.Content style={styles.cardContent}>
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
                onChangeText={setDate}
                mode="outlined"
                disabled={loading}
                style={styles.input}
                left={<TextInput.Icon icon="calendar" />}
                placeholder="YYYY-MM-DD"
              />

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
            </Card.Content>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  card: {
    borderRadius: 16,
  },
  cardContent: {
    paddingVertical: 8,
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
});
