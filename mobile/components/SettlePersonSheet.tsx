import React from "react";
import { Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, Surface, Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  if (!person) return null;

  const plan = personSettlePlan(person);
  const actionLabel = personSettleActionLabel(person, person.headline);
  const verb = person.headline.verb === "receive"
    ? `${person.displayName} pays you`
    : person.headline.verb === "pay"
      ? `You pay ${person.displayName}`
      : `Settle with ${person.displayName}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onDismiss}
      presentationStyle="pageSheet"
    >
      <View style={[styles.root, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom }]}>
        <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
          <Appbar.Action icon="close" onPress={onDismiss} />
          <Appbar.Content title={`Settle with ${person.displayName}`} titleStyle={{ fontWeight: "700" }} />
        </Appbar.Header>

        <ScrollView contentContainerStyle={styles.content}>
          <Surface
            style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}
            elevation={0}
          >
            <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.8 }}>
              {verb}
            </Text>
            <Text variant="headlineMedium" style={{ color: theme.colors.onPrimaryContainer, fontWeight: "800" }}>
              {person.headline.headline}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onPrimaryContainer }}>
              {plan.groupCount > 1
                ? `One action records a payment in each of ${plan.groupCount} groups so every ledger closes. Cash between you is this net.`
                : "This records the payment in that group."}
            </Text>
          </Surface>

          <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
            Will be recorded
          </Text>
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

          {preview ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Preview only — nothing is written until you do this on a real account.
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
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
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? WEB_MAX_WIDTH : undefined,
    alignSelf: "center",
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 24,
  },
  hero: {
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 4,
  },
});
