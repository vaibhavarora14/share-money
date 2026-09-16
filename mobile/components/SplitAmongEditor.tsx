import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Avatar,
  Button,
  Chip,
  IconButton,
  SegmentedButtons,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { Participant } from "../types";
import { formatCurrency } from "../utils/currency";
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
  /** When true, start collapsed (equal summary + Adjust split). */
  preferCompact?: boolean;
}

function displayName(participant: Participant): string {
  return participant.full_name
    || participant.email?.split("@")[0]
    || participant.email
    || "Unknown";
}

function initials(participant: Participant): string {
  const name = displayName(participant);
  if (name.includes(" ")) {
    const parts = name.trim().split(/\s+/);
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
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
  preferCompact = true,
}) => {
  const theme = useTheme();
  const selectionTheme = {
    colors: {
      secondaryContainer: theme.colors.primaryContainer,
      onSecondaryContainer: theme.colors.onPrimaryContainer,
    },
  };
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasTotal = totalAmount !== null && totalAmount > 0;
  const selectedParticipants = participants.filter((participant) => selectedSet.has(participant.id));
  const needsAdvanced = mode !== "equal";
  const [showAdvanced, setShowAdvanced] = useState(!preferCompact || needsAdvanced);

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
    () => roundMoney(selectedIds.reduce((sum, id) => sum + (assignedAmounts[id] ?? 0), 0)),
    [assignedAmounts, selectedIds],
  );
  const remaining = hasTotal ? remainingSplitAmount(totalAmount, assigned) : null;
  const leftover = remaining !== null && remaining > 0.01;
  const over = remaining !== null && remaining < -0.01;
  const exact = remaining !== null && !leftover && !over && selectedIds.length > 0;
  const statusColor = over
    ? theme.colors.error
    : exact
      ? theme.colors.primary
      : theme.colors.onSurfaceVariant;

  const modeLabel =
    mode === "equal" ? "Equal" : mode === "unequal" ? "Amounts" : "Shares";

  if (!showAdvanced) {
    return (
      <View testID="split-among-compact">
        <View style={styles.compactHeader}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Split
          </Text>
          <View style={styles.compactModeChip}>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
              {modeLabel}
            </Text>
            <IconButton
              icon="chevron-down"
              size={18}
              onPress={() => setShowAdvanced(true)}
              disabled={disabled}
              accessibilityLabel="Open split options"
            />
          </View>
        </View>

        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
          {selectedIds.length} {selectedIds.length === 1 ? "person" : "people"}
          {selectedIds.length > 0 ? (
            <>
              {" · "}
              <Text style={{ color: theme.colors.secondary, fontWeight: "700" }}>each</Text>
            </>
          ) : null}
        </Text>

        <View style={styles.avatarRow}>
          {selectedParticipants.slice(0, 6).map((participant) => (
            <Avatar.Text
              key={participant.id}
              size={36}
              label={initials(participant)}
              style={{
                backgroundColor: theme.colors.surface,
                borderWidth: 2,
                borderColor: theme.colors.secondary,
                marginRight: -6,
              }}
              color={theme.colors.onSurface}
              labelStyle={{ fontSize: 12, fontWeight: "600" }}
            />
          ))}
        </View>

        <TouchableRipple
          onPress={() => setShowAdvanced(true)}
          disabled={disabled}
          testID="split-adjust-more-options"
          style={styles.adjustRow}
        >
          <View style={styles.adjustInner}>
            <IconButton icon="chart-pie" size={20} iconColor={theme.colors.primary} />
            <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: "600", flex: 1 }}>
              Adjust split
            </Text>
            <IconButton icon="chevron-right" size={20} iconColor={theme.colors.onSurfaceVariant} />
          </View>
        </TouchableRipple>
      </View>
    );
  }

  return (
    <View testID="split-among-advanced">
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
        theme={selectionTheme}
        buttons={[
          { value: "equal", label: "Equal", disabled, testID: "split-mode-equal" },
          { value: "unequal", label: "Amounts", disabled, testID: "split-mode-unequal" },
          { value: "shares", label: "Shares", disabled, testID: "split-mode-shares" },
        ]}
        style={styles.modeButtons}
      />

      <View style={styles.chipWrap}>
        {participants.map((participant) => {
          const selected = selectedSet.has(participant.id);
          const isFormer = participant.type === "former";
          return (
            <Chip
              key={participant.id}
              selected={selected}
              onPress={() => onToggleMember(participant.id)}
              style={[
                styles.wrapChip,
                isFormer && styles.formerChip,
                !selected && { backgroundColor: theme.colors.surfaceVariant },
              ]}
              theme={selectionTheme}
              disabled={disabled}
              showSelectedCheck
              testID={`split-among-chip-${participant.email || participant.id}`}
            >
              {displayName(participant)}
              {isFormer ? " (Former)" : ""}
            </Chip>
          );
        })}
      </View>

      {mode === "equal" && hasTotal && selectedIds.length > 0 ? (
        <View style={[styles.summary, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Each person pays:{" "}
            <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>
              {formatCurrency(totalAmount / selectedIds.length, currency)}
            </Text>
          </Text>
        </View>
      ) : null}

      {mode !== "equal" && selectedParticipants.length === 0 ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
          Select people, then set each share.
        </Text>
      ) : null}

      {mode !== "equal" ? (
        <View style={styles.detailList}>
          {selectedParticipants.map((participant) => {
            const name = displayName(participant);
            const personAmount = assignedAmounts[participant.id] ?? 0;
            const percent = hasTotal ? sharePercent(personAmount, totalAmount) : 0;
            const shareCount = clampShareCount(shares[participant.id] ?? 1);

            return (
              <View key={participant.id} style={styles.detailRow}>
                <View style={styles.detailCopy}>
                  <Text variant="bodyLarge" numberOfLines={1}>
                    {name}
                    {participant.type === "former" ? " (Former)" : ""}
                  </Text>
                  {hasTotal ? (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {percent}% · {formatCurrency(personAmount, currency)}
                    </Text>
                  ) : null}
                </View>

                {mode === "unequal" ? (
                  <TextInput
                    mode="outlined"
                    dense
                    value={amounts[participant.id] ?? ""}
                    onChangeText={(text) => {
                      const next = sanitizeAmountInput(text);
                      if (next === null) return;
                      onAmountChange(participant.id, next);
                    }}
                    keyboardType="decimal-pad"
                    disabled={disabled}
                    style={[styles.amountInput, { backgroundColor: theme.colors.surface }]}
                    outlineColor={theme.colors.outline}
                    activeOutlineColor={theme.colors.primary}
                    placeholder="0.00"
                    testID={`split-amount-input-${participant.email || participant.id}`}
                  />
                ) : (
                  <View style={styles.shareStepper}>
                    <IconButton
                      icon="minus"
                      size={20}
                      disabled={disabled || shareCount <= 1}
                      onPress={() => onShareChange(participant.id, shareCount - 1)}
                      accessibilityLabel={`Fewer shares for ${name}`}
                    />
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurface, minWidth: 20, textAlign: "center" }}>
                      {shareCount}
                    </Text>
                    <IconButton
                      icon="plus"
                      size={20}
                      disabled={disabled || shareCount >= MAX_SHARE_COUNT}
                      onPress={() => onShareChange(participant.id, shareCount + 1)}
                      accessibilityLabel={`More shares for ${name}`}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {mode !== "equal" && hasTotal && selectedIds.length > 0 ? (
        <View
          style={[styles.summary, { backgroundColor: theme.colors.surfaceVariant }]}
          testID="split-remaining-label"
        >
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
            {exact
              ? "Splits add up: "
              : leftover
                ? "Left to assign: "
                : "Over by: "}
            <Text style={{ color: statusColor, fontWeight: "600" }}>
              {exact
                ? formatCurrency(totalAmount, currency)
                : formatCurrency(Math.abs(remaining ?? 0), currency)}
            </Text>
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {formatCurrency(assigned, currency)} of {formatCurrency(totalAmount, currency)}
          </Text>
          {mode === "unequal" && leftover ? (
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

      {preferCompact && mode === "equal" ? (
        <Button
          mode="text"
          compact
          onPress={() => setShowAdvanced(false)}
          style={{ alignSelf: "flex-start", marginTop: 8 }}
          testID="split-hide-advanced"
        >
          Hide options
        </Button>
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
  summary: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  detailList: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  detailCopy: {
    flex: 1,
    minWidth: 0,
  },
  amountInput: {
    width: 112,
  },
  shareStepper: {
    flexDirection: "row",
    alignItems: "center",
  },
  compactHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  compactModeChip: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingLeft: 4,
  },
  adjustRow: {
    marginTop: 4,
    marginHorizontal: -8,
    borderRadius: 8,
  },
  adjustInner: {
    flexDirection: "row",
    alignItems: "center",
  },
});
