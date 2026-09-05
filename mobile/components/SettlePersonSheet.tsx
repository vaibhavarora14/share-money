import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Modal, Portal, Text, useTheme } from "react-native-paper";
import { WEB_MAX_WIDTH } from "../constants/layout";
import { PersonSettlementView } from "../hooks/usePeopleSettlements";
import { formatCurrency } from "../utils/currency";
import {
  personSettleActionLabel,
  personSettlePlan,
} from "../utils/peopleSettlements";

interface SettlePersonSheetProps {
  person: PersonSettlementView | null;
  visible: boolean;
  submitting?: boolean;
  preview?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export const SettlePersonSheet: React.FC<SettlePersonSheetProps> = ({
  person,
  visible,
  submitting = false,
  preview = false,
  onConfirm,
  onDismiss,
}) => {
  const theme = useTheme();
  if (!person) return null;

  const plan = personSettlePlan(person);
  const actionLabel = personSettleActionLabel(person, person.headline);
  const verb = person.headline.verb === "receive"
    ? `${person.displayName} pays you`
    : person.headline.verb === "pay"
      ? `You pay ${person.displayName}`
      : `Settle with ${person.displayName}`;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={submitting ? undefined : onDismiss}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <Text variant="titleLarge" style={{ fontWeight: "800", color: theme.colors.onSurface }}>
          Settle with {person.displayName}
        </Text>
        <View style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.8 }}>
            {verb}
          </Text>
          <Text variant="headlineSmall" style={{ color: theme.colors.onPrimaryContainer, fontWeight: "800" }}>
            {person.headline.headline}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onPrimaryContainer }}>
            {plan.groupCount > 1
              ? `One action records a payment in each of ${plan.groupCount} groups so every ledger closes. Cash between you is this net.`
              : "This records the payment in that group."}
          </Text>
        </View>

        <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
          Will be recorded
        </Text>
        <ScrollView style={styles.records} contentContainerStyle={{ gap: 12 }}>
          {person.lines.map((line) => (
            <View key={`${line.groupId}-${line.direction}`} style={styles.recordRow}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyLarge" style={{ fontWeight: "600", color: theme.colors.onSurface }}>
                  {line.groupName}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {line.direction === "pay"
                    ? `You pay ${person.displayName}`
                    : `${person.displayName} pays you`}
                </Text>
              </View>
              <Text
                variant="titleSmall"
                style={{
                  fontWeight: "700",
                  color: line.direction === "pay" ? theme.colors.error : theme.colors.tertiary,
                }}
              >
                {formatCurrency(line.amount, line.currency)}
              </Text>
            </View>
          ))}
        </ScrollView>

        {preview ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Preview only — nothing is written until you do this on a real account.
          </Text>
        ) : null}

        <Button
          mode="contained"
          testID="confirm-settle-person"
          onPress={onConfirm}
          loading={submitting}
          disabled={submitting || !plan.canSettleAll}
        >
          {actionLabel}
        </Button>
        <Button mode="text" onPress={onDismiss} disabled={submitting}>
          Cancel
        </Button>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    maxWidth: WEB_MAX_WIDTH,
    width: "100%",
    alignSelf: "center",
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  hero: {
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  records: {
    maxHeight: 220,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
