import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    BackHandler,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    TextInput as RNTextInput,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import {
    Appbar,
    Button,
    Card,
    Chip,
    Divider,
    IconButton,
    Surface,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { useParticipants } from "../hooks/useParticipants";
import { Participant, Transaction } from "../types";
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
  groupId?: string;
}

export const TransactionFormScreen: React.FC<TransactionFormScreenProps> = ({
  transaction,
  onSave,
  onDismiss,
  onDelete,
  defaultCurrency,
  groupId,
}) => {
  const effectiveDefaultCurrency = defaultCurrency || getDefaultCurrency();
  const theme = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const amountInputRef = useRef<RNTextInput>(null);

  // Form state
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
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Error states
  const [descriptionError, setDescriptionError] = useState<string>("");
  const [amountError, setAmountError] = useState<string>("");
  const [dateError, setDateError] = useState<string>("");
  const [paidByError, setPaidByError] = useState<string>("");
  const [splitAmongError, setSplitAmongError] = useState<string>("");

  // Fetch participants
  const {
    data: participants,
    isLoading: isLoadingParticipants,
    error: participantsError,
  } = useParticipants(groupId || null);

  // Memoized values
  const isGroupExpense = useMemo(
    () => type === "expense" && groupId && (participants?.length || 0) > 0,
    [type, groupId, participants?.length]
  );

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

  const transactionParticipantIds = useMemo(() => {
    if (!transaction) return new Set<string>();
    const ids = new Set<string>();
    if (transaction.paid_by_participant_id) {
      ids.add(transaction.paid_by_participant_id);
    }
    if (Array.isArray(transaction.splits) && transaction.splits.length > 0) {
      transaction.splits.forEach((split) => {
        if (split.participant_id) {
          ids.add(split.participant_id);
        }
      });
    }
    return ids;
  }, [transaction]);

  const availableParticipants = useMemo(() => {
    const combined = [...activeParticipants, ...invitedParticipants];
    if (transaction) {
      // 1. Check payer
      if (transaction.paid_by_participant_id) {
        if (!combined.some(c => c.id === transaction.paid_by_participant_id)) {
          // Find the payer in the full participants list or reconstruct
          const p = (participants || []).find(p => p.id === transaction.paid_by_participant_id);
          if (p) {
            combined.push(p);
          }
        }
      }
      // 2. Check all split members
      if (Array.isArray(transaction.splits)) {
        transaction.splits.forEach(split => {
          if (split.participant_id && !combined.some(c => c.id === split.participant_id)) {
            const p = (participants || []).find(p => p.id === split.participant_id) || split.participant;
            if (p) {
              combined.push(p as Participant);
            }
          }
        });
      }
    }

    // Also ensure current paidBy is included if not already
    if (paidBy && !combined.some(c => c.id === paidBy)) {
      const p = (participants || []).find(p => p.id === paidBy);
      if (p) combined.push(p);
    }
    
    return combined;
  }, [activeParticipants, invitedParticipants, formerParticipants, transaction, transactionParticipantIds, paidBy]);

  const allParticipantIds = useMemo(
    () => availableParticipants.map((p) => p.id),
    [availableParticipants]
  );

  const areAllParticipantsSelected = useMemo(() => {
    return availableParticipants.length > 0 && availableParticipants.every((p) => splitAmong.includes(p.id));
  }, [availableParticipants, splitAmong]);

  const paidByParticipant = useMemo(
    () => paidBy ? availableParticipants.find((p) => p.id === paidBy) : undefined,
    [availableParticipants, paidBy]
  );

  // Use inline chips if 5 or fewer participants
  const useInlineChipsForPaidBy = availableParticipants.length <= 5;

  // Helper functions
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
    setSplitAmong([]);
    setDescriptionError("");
    setAmountError("");
    setDateError("");
    setPaidByError("");
    setSplitAmongError("");
  }, [effectiveDefaultCurrency]);

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

      if (tx.paid_by_participant_id) {
        setPaidBy(tx.paid_by_participant_id);
      } else {
        setPaidBy("");
      }

      if (Array.isArray(tx.splits) && tx.splits.length > 0) {
        const participantIds = tx.splits
          .map((s) => s.participant_id)
          .filter((id): id is string => !!id);
        setSplitAmong([...new Set(participantIds)]);
      } else if (Array.isArray(tx.split_among_participant_ids) && tx.split_among_participant_ids.length > 0) {
        setSplitAmong([...new Set(tx.split_among_participant_ids)]);
      } else {
        setSplitAmong([]);
      }
      
      // Show more options if type is income or category is set
      if (tx.type === "income" || tx.category) {
        setShowMoreOptions(true);
      }
    },
    [effectiveDefaultCurrency]
  );

  // Handle loading transaction data for editing
  useEffect(() => {
    if (transaction) {
      loadTransactionData(transaction);
    }
  }, [transaction?.id, loadTransactionData]);

  // Handle resetting form to defaults for new transactions
  useEffect(() => {
    if (!transaction) {
      resetFormToDefaults();
    }
  }, [transaction?.id, resetFormToDefaults]); 


  useEffect(() => {
    if (transaction) return;
    if (!isGroupExpense) {
      setSplitAmong([]);
      setPaidBy("");
    } else {
      // For a new group expense, default split to all members if currently empty
      if (splitAmong.length === 0 && allParticipantIds.length > 0) {
        setSplitAmong(allParticipantIds);
      }
      
      // Default "Paid By" to the current user
      if (!paidBy && user && participants) {
        const currentUserParticipant = participants.find(p => p.user_id === user.id);
        if (currentUserParticipant) {
          setPaidBy(currentUserParticipant.id);
        }
      }
    }
  }, [isGroupExpense, transaction, allParticipantIds, splitAmong.length, user, participants, paidBy]);

  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split("T")[0];
  };

  const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return "Select date";
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString(undefined, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "set" && selectedDate) {
        setSelectedDate(selectedDate);
        setDate(formatDateForInput(selectedDate));
        if (dateError) setDateError("");
      }
    } else {
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
      const uniquePrev = [...new Set(prev)];
      if (uniquePrev.includes(participantId)) {
        if (paidBy === participantId && uniquePrev.length === 1) {
          return uniquePrev;
        }
        return uniquePrev.filter((id) => id !== participantId);
      } else {
        return [...uniquePrev, participantId];
      }
    });
    if (splitAmongError) setSplitAmongError("");
  };

  const handleToggleAllMembers = () => {
    if (areAllParticipantsSelected) {
      setSplitAmong([]);
    } else {
      setSplitAmong([...new Set(allParticipantIds)]);
    }
    if (splitAmongError) setSplitAmongError("");
  };

  const validateForm = (): boolean => {
    let isValid = true;
    setDescriptionError("");
    setAmountError("");
    setDateError("");
    setPaidByError("");
    setSplitAmongError("");

    if (!description.trim()) {
      setDescriptionError("Please enter a description");
      isValid = false;
    }

    if (!amount.trim()) {
      setAmountError("Please enter an amount");
      isValid = false;
    } else {
      const amountRegex = /^\d+(\.\d{1,2})?$/;
      if (!amountRegex.test(amount.trim())) {
        setAmountError("Please enter a valid amount (e.g., 10.50)");
        isValid = false;
      } else {
        const amountValue = parseFloat(amount);
        if (isNaN(amountValue) || !isFinite(amountValue) || amountValue <= 0) {
          setAmountError("Please enter a valid amount greater than 0");
          isValid = false;
        }
      }
    }

    if (!date.trim()) {
      setDateError("Please enter a date");
      isValid = false;
    }

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
    if (!validateForm()) return;

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
        paid_by_participant_id: isGroupExpense ? paidBy : undefined,
        split_among_participant_ids: isGroupExpense ? splitAmong : undefined,
      });
    } catch (error) {
      Alert.alert("Error", getUserFriendlyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!onDelete || !transaction) return;
    Alert.alert(
      "Delete Transaction",
      `Are you sure you want to delete "${transaction.description || "this transaction"}"?`,
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
    const subscription = BackHandler.addEventListener("hardwareBackPress", handleHardwareBack);
    return () => subscription.remove();
  }, [handleHardwareBack]);

  // Get participant display name
  const getParticipantDisplayName = (participantId: string) => {
    const p = availableParticipants.find((p) => p.id === participantId) 
              || participants?.find((p) => p.id === participantId)
              || participants?.find((p) => p.user_id === participantId);
    if (!p) return null;
    return p.full_name || p.email || `Participant`;
  };

  // Calculate split amount per person
  const splitAmountPerPerson = useMemo(() => {
    if (splitAmong.length === 0 || !amount || parseFloat(amount) <= 0) return null;
    return parseFloat(amount) / splitAmong.length;
  }, [amount, splitAmong.length]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Header */}
      <Appbar.Header style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <Appbar.BackAction onPress={onDismiss} />
        <Appbar.Content
          title={transaction ? "Edit Expense" : "Add Expense"}
          titleStyle={{ fontWeight: "600" }}
        />
        {transaction && onDelete && (
          <Appbar.Action icon="delete-outline" onPress={handleDelete} iconColor={theme.colors.error} />
        )}
      </Appbar.Header>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* HERO AMOUNT SECTION */}
          <View style={styles.heroAmountContainer}>
            <View style={styles.heroAmountInputRow}>
              <Text 
                variant="displayMedium" 
                style={[styles.heroAmountText, { color: theme.colors.onSurface }]}
              >
                {getCurrencySymbol(currency)}
              </Text>
              <RNTextInput
                ref={amountInputRef}
                value={amount}
                onChangeText={(text) => {
                  // Only allow numbers and one decimal point
                  const cleaned = text.replace(/[^0-9.]/g, '');
                  const parts = cleaned.split('.');
                  if (parts.length > 2) return;
                  if (parts[1]?.length > 2) return;
                  setAmount(cleaned);
                  if (amountError) setAmountError("");
                }}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                style={[
                  styles.heroAmountInput, 
                  { 
                    color: theme.colors.onSurface,
                    minWidth: amount ? undefined : 40,
                  }
                ]}
                testID="amount-input"
                autoFocus={!transaction}
                selectTextOnFocus
              />
            </View>
            {amountError && (
              <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4 }}>
                {amountError}
              </Text>
            )}

            {/* Currency Chip */}
            <Chip 
              mode="outlined" 
              onPress={() => setShowCurrencyPicker(true)}
              style={styles.currencyChip}
              disabled={loading}
            >
              {currency}
            </Chip>
          </View>

          {/* DETAILS CARD */}
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <TextInput
                label="Description"
                value={description}
                onChangeText={(text) => {
                  setDescription(text);
                  if (descriptionError) setDescriptionError("");
                }}
                mode="flat"
                disabled={loading}
                error={!!descriptionError}
                style={styles.flatInput}
                left={<TextInput.Icon icon="pencil-outline" />}
                placeholder="What was this for?"
              />
              {descriptionError && (
                <Text variant="bodySmall" style={{ color: theme.colors.error, marginLeft: 12 }}>
                  {descriptionError}
                </Text>
              )}

              <Divider style={styles.divider} />

              <Pressable onPress={() => setShowDatePicker(true)} disabled={loading}>
                <View style={styles.dateRow}>
                  <IconButton icon="calendar-outline" size={24} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Date
                    </Text>
                    <Text variant="bodyLarge">
                      {formatDateForDisplay(date)}
                    </Text>
                  </View>
                  <IconButton icon="chevron-right" size={24} />
                </View>
              </Pressable>
              {dateError && (
                <Text variant="bodySmall" style={{ color: theme.colors.error, marginLeft: 12 }}>
                  {dateError}
                </Text>
              )}
            </Card.Content>
          </Card>

          {/* SPLITTING CARD - Only for group expenses */}
          {isGroupExpense && (
            <Card style={styles.card} mode="outlined">
              <Card.Content>
                {/* Paid By Section */}
                <View style={styles.sectionHeader}>
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                    Paid by
                  </Text>
                </View>
                {paidByError && (
                  <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
                    {paidByError}
                  </Text>
                )}
                
                {useInlineChipsForPaidBy ? (
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipScrollView}
                  >
                    {availableParticipants.map((p) => {
                      const isSelected = paidBy === p.id;
                      const displayName = p.full_name || p.email || "Unknown";
                      const isFormer = p.type === "former";
                      const isInvited = p.type === "invited";
                      return (
                        <Chip
                          key={p.id}
                          selected={isSelected}
                          onPress={() => {
                            setPaidBy(p.id);
                            if (paidByError) setPaidByError("");
                          }}
                          style={[
                            styles.chip, 
                            isFormer && styles.formerChip,
                            !isSelected && { backgroundColor: theme.colors.surfaceVariant },
                          ]}
                          disabled={loading}
                          showSelectedCheck={true}
                          testID={`paid-by-chip-${p.email || p.id}`}
                        >
                          {displayName}
                          {isInvited && " (Invited)"}
                          {isFormer && " (Former)"}
                        </Chip>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Button
                    mode="outlined"
                    onPress={() => setShowPaidByPicker(true)}
                    style={styles.paidByButton}
                    icon="account"
                    contentStyle={{ justifyContent: "flex-start" }}
                    disabled={loading}
                  >
                    {paidByParticipant 
                      ? `${paidByParticipant.full_name || paidByParticipant.email}${paidByParticipant.type === 'former' ? " (Former)" : ""}${paidByParticipant.type === 'invited' ? " (Invited)" : ""}` 
                      : "Select who paid"}
                  </Button>
                )}

                <Divider style={styles.divider} />

                {/* Split Among Section */}
                <View style={styles.sectionHeaderWithAction}>
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                    Split among
                  </Text>
                  <Button 
                    mode="text" 
                    compact 
                    onPress={handleToggleAllMembers}
                    disabled={loading}
                  >
                    {areAllParticipantsSelected ? "None" : "All"}
                  </Button>
                </View>
                {splitAmongError && (
                  <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
                    {splitAmongError}
                  </Text>
                )}

                <View style={styles.chipWrap}>
                  {availableParticipants.map((p) => {
                    const isSelected = splitAmong.includes(p.id);
                    const displayName = p.full_name || p.email || "Unknown";
                    const isFormer = p.type === "former";
                    const isInvited = p.type === "invited";
                    return (
                      <Chip
                        key={p.id}
                        selected={isSelected}
                        onPress={() => handleToggleSplitMember(p.id)}
                        style={[
                          styles.wrapChip,
                          isFormer && styles.formerChip,
                          isInvited && styles.invitedChip,
                          !isSelected && { backgroundColor: theme.colors.surfaceVariant },
                        ]}
                        disabled={loading}
                        showSelectedCheck={true}
                        testID={`split-among-chip-${p.email || p.id}`}
                      >
                        {displayName}
                        {isFormer && " (Former)"}
                        {isInvited && " (Invited)"}
                      </Chip>
                    );
                  })}
                </View>

                {/* Split amount preview */}
                {splitAmountPerPerson && splitAmountPerPerson > 0 && (
                  <View style={styles.splitPreview}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                      Each person pays: {" "}
                      <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>
                        {formatCurrency(splitAmountPerPerson, currency)}
                      </Text>
                    </Text>
                  </View>
                )}
              </Card.Content>
            </Card>
          )}

          {/* MORE OPTIONS */}
          <Pressable onPress={() => setShowMoreOptions(!showMoreOptions)}>
            <View style={styles.moreOptionsHeader}>
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                More options
              </Text>
              <IconButton 
                icon={showMoreOptions ? "chevron-up" : "chevron-down"} 
                size={20} 
              />
            </View>
          </Pressable>

          {showMoreOptions && (
            <Card style={styles.card} mode="outlined">
              <Card.Content>
                <TextInput
                  label="Category (Optional)"
                  value={category}
                  onChangeText={setCategory}
                  mode="flat"
                  disabled={loading}
                  style={styles.flatInput}
                  left={<TextInput.Icon icon="tag-outline" />}
                  placeholder="e.g., Food, Transportation"
                />
              </Card.Content>
            </Card>
          )}
        </ScrollView>

        {/* STICKY BOTTOM ACTION BAR */}
        <Surface 
          style={[
            styles.bottomBar, 
            { paddingBottom: insets.bottom + 16 }
          ]} 
          elevation={2}
        >
          <Button
            mode="contained"
            onPress={handleSave}
            disabled={loading}
            loading={loading}
            style={styles.saveButton}
            contentStyle={styles.saveButtonContent}
          >
            {transaction ? "Update" : "Save"}
          </Button>
        </Surface>
      </KeyboardAvoidingView>

      {/* Date Picker */}
      {showDatePicker && (
        <>
          {Platform.OS === "ios" && (
            <Modal visible={showDatePicker} transparent animationType="slide">
              <TouchableOpacity 
                style={styles.modalOverlay} 
                activeOpacity={1} 
                onPress={() => setShowDatePicker(false)}
              >
                <View 
                  style={[styles.datePickerModal, { backgroundColor: theme.colors.surface }]}
                  onStartShouldSetResponder={() => true}
                >
                  <View style={styles.datePickerHeader}>
                    <Button onPress={() => setShowDatePicker(false)}>Cancel</Button>
                    <Text variant="titleMedium">Select Date</Text>
                    <Button
                      onPress={() => {
                        setDate(formatDateForInput(selectedDate));
                        setShowDatePicker(false);
                        if (dateError) setDateError("");
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
                    style={{ height: 200 }}
                  />
                </View>
              </TouchableOpacity>
            </Modal>
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

      {/* Paid By Picker Modal (for > 5 participants) */}
      <Modal
        visible={showPaidByPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPaidByPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPaidByPicker(false)}
        >
          <View
            style={[styles.pickerModal, { backgroundColor: theme.colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.pickerHeader}>
              <Text variant="titleLarge">Who paid?</Text>
              <IconButton icon="close" onPress={() => setShowPaidByPicker(false)} />
            </View>
            <FlatList
              data={availableParticipants}
              keyExtractor={(item) => item.id}
              style={styles.pickerList}
              renderItem={({ item }) => {
                const isSelected = paidBy === item.id;
                const displayName = item.full_name || item.email || "Unknown";
                return (
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      isSelected && { backgroundColor: theme.colors.secondaryContainer },
                    ]}
                    onPress={() => {
                      setPaidBy(item.id);
                      setShowPaidByPicker(false);
                      if (paidByError) setPaidByError("");
                    }}
                  >
                    <Text variant="bodyLarge">
                      {displayName}
                      {item.type === 'invited' && " (Invited)"}
                      {item.type === 'former' && " (Former)"}
                    </Text>
                    {isSelected && (
                      <IconButton icon="check" size={20} iconColor={theme.colors.primary} />
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
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCurrencyPicker(false)}
        >
          <View
            style={[styles.pickerModal, { backgroundColor: theme.colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.pickerHeader}>
              <Text variant="titleLarge">Select Currency</Text>
              <IconButton icon="close" onPress={() => setShowCurrencyPicker(false)} />
            </View>
            <FlatList
              data={CURRENCIES}
              keyExtractor={(item) => item.code}
              style={styles.pickerList}
              renderItem={({ item }) => {
                const isSelected = currency === item.code;
                return (
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      isSelected && { backgroundColor: theme.colors.secondaryContainer },
                    ]}
                    onPress={() => {
                      setCurrency(item.code);
                      setShowCurrencyPicker(false);
                    }}
                  >
                    <Text variant="bodyLarge">
                      {item.code} ({item.symbol})
                    </Text>
                    {isSelected && (
                      <IconButton icon="check" size={20} iconColor={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
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
  },
  
  // Hero Amount
  heroAmountContainer: {
    alignItems: "center",
    paddingVertical: 32,
    marginBottom: 8,
  },
  heroAmountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAmountText: {
    fontWeight: "300",
    letterSpacing: -2,
  },
  heroAmountInput: {
    fontSize: 45,
    fontWeight: "300",
    letterSpacing: -2,
    textAlign: "left",
    padding: 0,
    margin: 0,
  },
  currencyChip: {
    marginTop: 12,
  },

  // Cards
  card: {
    marginBottom: 16,
    borderRadius: 16,
  },
  flatInput: {
    backgroundColor: "transparent",
  },
  divider: {
    marginVertical: 8,
  },
  
  // Date Row
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Section Headers
  sectionHeader: {
    marginBottom: 12,
  },
  sectionHeaderWithAction: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  // Chips
  chipScrollView: {
    marginBottom: 8,
  },
  chip: {
    marginRight: 8,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  wrapChip: {
    marginBottom: 4,
  },
  formerChip: {
    opacity: 0.7,
  },
  invitedChip: {
    borderStyle: "dashed",
  },
  
  paidByButton: {
    marginBottom: 8,
  },

  // Split Preview
  splitPreview: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 12,
    alignItems: "center",
  },

  // More Options
  moreOptionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 8,
  },

  // Type Row
  typeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  typeChips: {
    flexDirection: "row",
    gap: 8,
  },
  typeChip: {
    // chipStyle
  },

  // Bottom Bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  saveButton: {
    borderRadius: 24,
  },
  saveButtonContent: {
    paddingVertical: 8,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  datePickerModal: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 24,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  pickerModal: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "60%",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  pickerList: {
    padding: 8,
  },
  pickerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
  },
});
