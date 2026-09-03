import React, { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import {
  Button,
  IconButton,
  Surface,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { formatCurrency, getCurrencyName } from "../utils/currency";
import {
  RateBook,
  formatRateLabel,
  resolveRate,
  roundMoney,
} from "../utils/currencyMerge";

interface ExchangeRateEditorProps {
  visible: boolean;
  from: string;
  to: string;
  amount?: number;
  rateBook: RateBook;
  onDismiss: () => void;
  onSave: (rate: number) => void;
  onResetToMarket?: () => void;
}

export const ExchangeRateEditor: React.FC<ExchangeRateEditorProps> = ({
  visible,
  from,
  to,
  amount = 1,
  rateBook,
  onDismiss,
  onSave,
  onResetToMarket,
}) => {
  const theme = useTheme();
  const marketBook = useMemo(
    () => ({ ...rateBook, overrides: {} }),
    [rateBook]
  );
  const current = resolveRate(from, to, rateBook);
  const market = resolveRate(from, to, marketBook);
  const [rateText, setRateText] = useState("");

  useEffect(() => {
    if (!visible) return;
    setRateText(current ? String(roundMoney(current.rate, to)) : "");
  }, [visible, current?.rate, to]);

  const parsedRate = Number.parseFloat(rateText);
  const valid = Number.isFinite(parsedRate) && parsedRate > 0;
  const converted = valid ? amount * parsedRate : null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Surface style={[styles.sheet, { backgroundColor: theme.colors.surface }]} elevation={3}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: "700" }}>
                Edit rate
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {getCurrencyName(from)} → {getCurrencyName(to)}
              </Text>
            </View>
            <IconButton icon="close" onPress={onDismiss} />
          </View>

          <TextInput
            label={`1 ${from} equals`}
            value={rateText}
            onChangeText={setRateText}
            keyboardType="decimal-pad"
            mode="outlined"
            right={<TextInput.Affix text={to} />}
            testID="exchange-rate-input"
          />

          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {amount === 1
              ? valid
                ? formatRateLabel({ from, to, rate: parsedRate, source: "group" })
                : "Enter a rate the group agrees on."
              : converted !== null
                ? `${formatCurrency(amount, from)} ≈ ${formatCurrency(converted, to)}`
                : "Enter a rate to preview the converted amount."}
          </Text>

          {market ? (
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Market preview: {formatRateLabel(market)}
              {market.asOf ? ` · ${market.asOf}` : ""}
            </Text>
          ) : (
            <Text variant="labelSmall" style={{ color: theme.colors.error }}>
              No market rate for this pair yet. A group rate is required.
            </Text>
          )}

          <View style={styles.actions}>
            {onResetToMarket && current?.source !== "market" ? (
              <Button mode="text" onPress={onResetToMarket}>
                Use market
              </Button>
            ) : <View />}
            <Button mode="contained" onPress={() => valid && onSave(parsedRate)} disabled={!valid}>
              Save rate
            </Button>
          </View>
        </Surface>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 32, 0.45)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
});
