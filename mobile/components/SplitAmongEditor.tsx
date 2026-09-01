import React, { useMemo } from "react";
import {
  StyleSheet,
  TextInput as RNTextInput,
  View,
} from "react-native";
import {
  Avatar,
  Button,
  Chip,
  SegmentedButtons,
  Text,
  useTheme,
} from "react-native-paper";
import { Participant } from "../types";
import { formatCurrency, getCurrencySymbol } from "../utils/currency";
import {
  remainingSplitAmount,
  sanitizeAmountInput,
  sumSelectedAmounts,
} from "../utils/splits";

export type SplitMode = "equal" | "unequal";

interface SplitAmongEditorProps {
  participants: Participant[];
  selectedIds: string[];
  amounts: Record<string, string>;
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
  onSplitRemaining,
}) => {
  const theme = useTheme();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const assigned = useMemo(
    () => sumSelectedAmounts(amounts, selectedIds),
    [amounts, selectedIds],
  );
  const remaining = totalAmount && totalAmount > 0
    ? remainingSplitAmount(totalAmount, assigned)
    : null;
  const hasTotal = totalAmount !== null && totalAmount > 0;
  const leftover = remaining !== null && remaining > 0.01;
  const over = remaining !== null && remaining < -0.01;
  const exact = remaining !== null && !leftover && !over && selectedIds.length > 0;
  const currencySymbol = getCurrencySymbol(currency);
  const selectedParticipants = participants.filter((participant) => selectedSet.has(participant.id));

  const remainingTone = over
    ? theme.colors.error
    : exact
      ? theme.colors.tertiary
      : theme.colors.onSurfaceVariant;

  return (
    <View>
      <View style={styles.sectionHeaderWithAction}>
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          Split among
        </Text>
        <Button
          mode="text"
          compact
          onPress={onToggleAll}
          disabled={disabled}
        >
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
          {
            value: "equal",
            label: "Equal",
            icon: "scale-balance",
            disabled,
            testID: "split-mode-equal",
          },
          {
            value: "unequal",
            label: "By amount",
            icon: "tune-variant",
            disabled,
            testID: "split-mode-unequal",
          },
        ]}
        style={styles.modeButtons}
      />

      <View style={styles.chipWrap}>
        {participants.map((participant) => {
          const isSelected = selectedSet.has(participant.id);
          const isFormer = participant.type === "former";
          return (
            <Chip
              key={participant.id}
              selected={isSelected}
              onPress={() => onToggleMember(participant.id)}
              style={[
                styles.wrapChip,
                isFormer && styles.formerChip,
                !isSelected && { backgroundColor: theme.colors.surfaceVariant },
              ]}
              theme={{
                colors: {
                  secondaryContainer: theme.colors.primaryContainer,
                  onSecondaryContainer: theme.colors.onPrimaryContainer,
                },
              }}
              disabled={disabled}
              showSelectedCheck={true}
              testID={`split-among-chip-${participant.email || participant.id}`}
            >
              {displayName(participant)}
              {isFormer ? " (Former)" : ""}
            </Chip>
          );
        })}
      </View>

      {mode === "equal" && hasTotal && selectedIds.length > 0 ? (
        <View style={[styles.splitPreview, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Each person pays:{" "}
            <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>
              {formatCurrency(totalAmount / selectedIds.length, currency)}
            </Text>
          </Text>
        </View>
      ) : null}

      {mode === "unequal" ? (
        <View style={styles.amountList}>
          {selectedParticipants.length === 0 ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Select people, then type each share.
            </Text>
          ) : (
            selectedParticipants.map((participant) => {
              const name = displayName(participant);
              const value = amounts[participant.id] ?? "";
              return (
                <View
                  key={participant.id}
                  style={[
                    styles.amountRow,
                    { borderBottomColor: theme.colors.outlineVariant },
                  ]}
                >
                  <Avatar.Text
                    size={36}
                    label={initials(name)}
                    style={{ backgroundColor: theme.colors.primaryContainer }}
                    labelStyle={{ color: theme.colors.onPrimaryContainer, fontSize: 13 }}
                  />
                  <View style={styles.amountName}>
                    <Text variant="bodyLarge" numberOfLines={1}>
                      {name}
                      {participant.type === "former" ? " (Former)" : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.amountInputWrap,
                      {
                        borderColor: theme.colors.outline,
                        backgroundColor: theme.colors.surfaceVariant,
                      },
                    ]}
                  >
                    <Text
                      variant="bodyLarge"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {currencySymbol}
                    </Text>
                    <RNTextInput
                      value={value}
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
                </View>
              );
            })
          )}

          {hasTotal && selectedIds.length > 0 ? (
            <View
              style={[
                styles.remainingCard,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
              testID="split-remaining-label"
            >
              <View style={styles.remainingCopy}>
                <Text variant="bodyMedium" style={{ color: remainingTone, fontWeight: "600" }}>
                  {exact
                    ? `Splits add up to ${formatCurrency(totalAmount, currency)}`
                    : leftover
                      ? `${formatCurrency(remaining, currency)} left`
                      : `${formatCurrency(Math.abs(remaining ?? 0), currency)} over`}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  Assigned {formatCurrency(assigned, currency)} of {formatCurrency(totalAmount, currency)}
                </Text>
              </View>
              {leftover ? (
                <Button
                  mode="text"
                  compact
                  onPress={onSplitRemaining}
                  disabled={disabled}
                  testID="split-leftover-button"
                >
                  Split leftover
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionHeaderWithAction: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modeButtons: {
    marginBottom: 12,
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
  splitPreview: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  amountList: {
    marginTop: 8,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  amountName: {
    flex: 1,
    minWidth: 0,
  },
  amountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    minWidth: 118,
    height: 44,
    gap: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "right",
    paddingVertical: 0,
    minWidth: 64,
  },
  remainingCard: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  remainingCopy: {
    flex: 1,
    minWidth: 0,
  },
});
