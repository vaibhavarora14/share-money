import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple, useTheme } from "react-native-paper";
import { formatCurrency } from "../utils/currency";
import {
  RateQuote,
  formatRateLabel,
  rateSourceLabel,
} from "../utils/currencyMerge";

interface ConvertedAmountHintProps {
  amount: number;
  currency: string;
  quote: RateQuote | null;
  onPressRate?: () => void;
}

export const ConvertedAmountHint: React.FC<ConvertedAmountHintProps> = ({
  amount,
  currency,
  quote,
  onPressRate,
}) => {
  const theme = useTheme();

  if (!quote || quote.from === quote.to) return null;

  return (
    <TouchableRipple onPress={onPressRate} disabled={!onPressRate}>
      <View style={styles.row}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          ≈ {formatCurrency(amount, currency)}
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: "700" }}>
          {formatRateLabel(quote)} · {rateSourceLabel(quote.source)}
          {onPressRate ? " · Edit" : ""}
        </Text>
      </View>
    </TouchableRipple>
  );
};

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
});
