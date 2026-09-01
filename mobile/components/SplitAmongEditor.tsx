import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput as RNTextInput,
  View,
} from "react-native";
import {
  Avatar,
  Button,
  Checkbox,
  IconButton,
  ProgressBar,
  SegmentedButtons,
  Text,
  useTheme,
} from "react-native-paper";
import { Participant } from "../types";
import { formatCurrency, getCurrencySymbol } from "../utils/currency";
import {
  calculateEqualSplits,
  calculateShareSplits,
  clampShareCount,
  MAX_SHARE_COUNT,
  remainingSplitAmount,
  roundMoney,
  sanitizeAmountInput,
  sharePercent,
  sumSelectedAmounts,
} from "../utils/splits";

export type SplitMode = "equal" | "unequal" | "shares";

interface SplitAmongEditorProps {
  participants: Participant[];
  selectedIds: string[];
  amounts: Record<string, string>;
  shares: Record<string, number>;
  mode: SplitMode;
  totalAmount: number | null;
  currency: string;
  error?: string;
  disabled?: boolean;
  areAllSelected: boolean;
  onToggleMember: (participantId: string) => void;
  onToggleAll: () => void;
  onModeChange: (mode: SplitMode) => void;
  onAmountChange: (participantId: string, text: string) => void;
  onShareChange: (participantId: string, shares: number) => void;
  onSplitRemaining: () => void;
}

function displayName(participant: Participant): string {
  return participant.full_name
    || participant.email?.split("@")[0]
    || participant.email
    || "Unknown";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export const SplitAmongEditor: React.FC<SplitAmongEditorProps> = ({
  participants,
  selectedIds,
  amounts,
  shares,
  mode,
  totalAmount,
  currency,
  error,
  disabled,
  areAllSelected,
  onToggleMember,
  onToggleAll,
  onModeChange,
  onAmountChange,
  onShareChange,
  onSplitRemaining,
}) => {
  const theme = useTheme();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasTotal = totalAmount !== null && totalAmount > 0;
  const currencySymbol = getCurrencySymbol(currency);

  const assignedAmounts = useMemo(() => {
    if (!hasTotal || selectedIds.length === 0) return {} as Record<string, number>;
    if (mode === "equal") {
      return Object.fromEntries(
        calculateEqualSplits(totalAmount, selectedIds).map((split) => [
          split.participant_id,
          split.amount,
        ]),
      );
    }
    if (mode === "shares") {
      return Object.fromEntries(
        calculateShareSplits(totalAmount, selectedIds, shares).map((split) => [
          split.participant_id,
          split.amount,
        ]),
      );
    }
    return Object.fromEntries(
      selectedIds.map((id) => [id, sumSelectedAmounts({ [id]: amounts[id] ?? "" }, [id])]),
    );
  }, [amounts, hasTotal, mode, selectedIds, shares, totalAmount]);

  const assigned = useMemo(
    () => roundAssigned(assignedAmounts, selectedIds),
    [assignedAmounts, selectedIds],
  );
  const remaining = hasTotal ? remainingSplitAmount(totalAmount, assigned) : null;
  const leftover = remaining !== null && remaining > 0.01;
  const over = remaining !== null && remaining < -0.01;
  const exact = remaining !== null && !leftover && !over && selectedIds.length > 0;
  const progress = hasTotal ? Math.min(1, assigned / totalAmount) : 0;
  const meterColor = over
    ? theme.colors.error
    : exact
      ? theme.colors.tertiary
      : theme.colors.primary;

  return (
    <View>
      <View style={styles.sectionHeaderWithAction}>
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          Split among
        </Text>
        <Button mode="text" compact onPress={onToggleAll} disabled={disabled}>
          {areAllSelected ? "None" : "All"}
        </Button>
      </View>

      {error ? (
        <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
          {error}
        </Text>
      ) : null}

      <SegmentedButtons
        value={mode}
        onValueChange={(value) => onModeChange(value as SplitMode)}
        theme={{
          colors: {
            secondaryContainer: theme.colors.primaryContainer,
            onSecondaryContainer: theme.colors.onPrimaryContainer,
          },
        }}
        buttons={[
          { value: "equal", label: "Equal", disabled, testID: "split-mode-equal" },
          { value: "unequal", label: "Amounts", disabled, testID: "split-mode-unequal" },
          { value: "shares", label: "Shares", disabled, testID: "split-mode-shares" },
        ]}
        style={styles.modeButtons}
      />

      <Text variant="bodySmall" style={[styles.modeHint, { color: theme.colors.onSurfaceVariant }]}>
        {mode === "equal"
          ? "Same share for everyone in the split."
          : mode === "unequal"
            ? "Type the exact amount each person owes."
            : "Give extra shares to anyone covering more, like a couple."}
      </Text>

      {hasTotal && selectedIds.length > 0 ? (
        <View
          style={[styles.meter, { backgroundColor: theme.colors.surfaceVariant }]}
          testID="split-remaining-label"
        >
          <View style={styles.meterHeader}>
            <Text variant="labelLarge" style={{ color: meterColor }}>
              {exact
                ? "Splits add up"
                : leftover
                  ? `${formatCurrency(remaining, currency)} left`
                  : `${formatCurrency(Math.abs(remaining ?? 0), currency)} over`}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatCurrency(assigned, currency)} of {formatCurrency(totalAmount, currency)}
            </Text>
          </View>
          <ProgressBar
            progress={over ? 1 : progress}
            color={meterColor}
            style={styles.progress}
          />
          {mode === "unequal" && leftover ? (
            <Button
              mode="contained-tonal"
              compact
              onPress={onSplitRemaining}
              disabled={disabled}
              style={styles.leftoverButton}
              testID="split-leftover-button"
            >
              Split leftover equally
            </Button>
          ) : null}
        </View>
      ) : null}

      <View style={styles.peopleList}>
        {participants.map((participant) => {
          const selected = selectedSet.has(participant.id);
          const name = displayName(participant);
          const personAmount = selected ? assignedAmounts[participant.id] ?? 0 : 0;
          const percent = hasTotal && selected ? sharePercent(personAmount, totalAmount) : 0;
          const shareCount = clampShareCount(shares[participant.id] ?? 1);
          const subtitleRest = selected
            ? `${participant.type === "former" ? "Former · " : ""}${
                hasTotal ? `${percent}% · ${formatCurrency(personAmount, currency)}` : "In this split"
              }`
            : "Not in this split";

          return (
            <View
              key={participant.id}
              style={[
                styles.personRow,
                {
                  borderBottomColor: theme.colors.outlineVariant,
                  opacity: selected ? 1 : 0.55,
                },
              ]}
            >
              <Pressable
                onPress={() => onToggleMember(participant.id)}
                disabled={disabled}
                style={styles.personMain}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={name}
                testID={`split-among-chip-${participant.email || participant.id}`}
              >
                <View pointerEvents="none">
                  <Checkbox
                    status={selected ? "checked" : "unchecked"}
                    disabled={disabled}
                  />
                </View>
                <Avatar.Text
                  size={36}
                  label={initials(name)}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                  labelStyle={{ color: theme.colors.onPrimaryContainer, fontSize: 13 }}
                />
                <View style={styles.personCopy}>
                  <Text variant="bodyLarge" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                    {subtitleRest}
                  </Text>
                </View>
              </Pressable>

              {selected && mode === "unequal" ? (
                <View
                  style={[
                    styles.amountInputWrap,
                    {
                      borderColor: theme.colors.outline,
                      backgroundColor: theme.colors.background,
                    },
                  ]}
                >
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                    {currencySymbol}
                  </Text>
                  <RNTextInput
                    value={amounts[participant.id] ?? ""}
                    onChangeText={(text) => {
                      const next = sanitizeAmountInput(text);
                      if (next === null) return;
                      onAmountChange(participant.id, next);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    editable={!disabled}
                    style={[styles.amountInput, { color: theme.colors.onSurface }]}
                    testID={`split-amount-input-${participant.email || participant.id}`}
                  />
                </View>
              ) : null}

              {selected && mode === "shares" ? (
                <View style={styles.shareStepper}>
                  <IconButton
                    icon="minus"
                    size={18}
                    disabled={disabled || shareCount <= 1}
                    onPress={() => onShareChange(participant.id, shareCount - 1)}
                    accessibilityLabel={`Fewer shares for ${name}`}
                  />
                  <Text variant="titleMedium" style={styles.shareCount}>
                    {shareCount}
                  </Text>
                  <IconButton
                    icon="plus"
                    size={18}
                    disabled={disabled || shareCount >= MAX_SHARE_COUNT}
                    onPress={() => onShareChange(participant.id, shareCount + 1)}
                    accessibilityLabel={`More shares for ${name}`}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
};

function roundAssigned(amounts: Record<string, number>, selectedIds: string[]): number {
  return roundMoney(selectedIds.reduce((sum, id) => sum + (amounts[id] ?? 0), 0));
}

const styles = StyleSheet.create({
  sectionHeaderWithAction: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modeButtons: {
    marginBottom: 8,
  },
  modeHint: {
    marginBottom: 12,
  },
  meter: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  meterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  progress: {
    height: 6,
    borderRadius: 99,
  },
  leftoverButton: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  peopleList: {
    marginTop: 4,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  personMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
  },
  amountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    minWidth: 112,
    height: 44,
    gap: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "right",
    paddingVertical: 0,
    minWidth: 56,
  },
  shareStepper: {
    flexDirection: "row",
    alignItems: "center",
  },
  shareCount: {
    minWidth: 20,
    textAlign: "center",
    fontWeight: "700",
  },
});
