import React from "react";
import { StyleSheet, View } from "react-native";
import { Chip, Surface, Text, TouchableRipple, useTheme } from "react-native-paper";
import {
  ConvertedPart,
  RateSource,
  UnifiedTotal,
  formatBreakdown,
  formatRateLabel,
  rateSourceLabel,
} from "../utils/currencyMerge";
import { formatCurrency } from "../utils/currency";

interface UnifiedBalanceHeroProps {
  title?: string;
  unified: UnifiedTotal;
  compact?: boolean;
  /** `net` is a you-owe / you're-owed position. `total` is an unsigned spend total. */
  intent?: "net" | "total";
  onPressRates?: () => void;
}

function signLabel(amount: number): { verb: string; colorKey: "tertiary" | "error" | "onSurface" } {
  if (amount > 0.01) return { verb: "You're owed", colorKey: "tertiary" };
  if (amount < -0.01) return { verb: "You owe", colorKey: "error" };
  return { verb: "Settled", colorKey: "onSurface" };
}

export const UnifiedBalanceHero: React.FC<UnifiedBalanceHeroProps> = ({
  title = "In one currency",
  unified,
  compact = false,
  intent = "net",
  onPressRates,
}) => {
  const theme = useTheme();
  const { verb, colorKey } = intent === "total"
    ? { verb: "", colorKey: "onSurface" as const }
    : signLabel(unified.amount);
  const amountColor = theme.colors[colorKey];
  const breakdown = formatBreakdown(unified.parts);
  const primaryQuote = primaryForeignQuote(unified.parts, unified.currency);
  const displayAmount = intent === "total"
    ? formatCurrency(Math.abs(unified.amount), unified.currency)
    : verb === "Settled"
      ? formatCurrency(0, unified.currency)
      : formatCurrency(Math.abs(unified.amount), unified.currency);

  return (
    <Surface
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
        compact && styles.compactCard,
      ]}
      elevation={0}
    >
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {title}
      </Text>
      {verb ? (
        <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: "600", marginTop: 2 }}>
          {verb}
        </Text>
      ) : null}
      <Text
        variant={compact ? "titleLarge" : "headlineMedium"}
        style={[styles.amount, { color: amountColor }]}
      >
        {displayAmount}
      </Text>
      {breakdown ? (
        <Text variant="bodySmall" style={[styles.breakdown, { color: theme.colors.onSurfaceVariant }]}>
          from {breakdown}
        </Text>
      ) : null}
      {primaryQuote ? (
        <View style={styles.rateRow}>
          <Chip
            compact
            mode="outlined"
            onPress={onPressRates}
            textStyle={styles.chipText}
            style={styles.chip}
          >
            {formatRateLabel(primaryQuote)} · {rateSourceLabel(primaryQuote.source as RateSource)}
          </Chip>
          {onPressRates ? (
            <TouchableRipple onPress={onPressRates} borderless>
              <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: "700" }}>
                Rates
              </Text>
            </TouchableRipple>
          ) : null}
        </View>
      ) : null}
      {unified.missing.length > 0 ? (
        <Text variant="labelSmall" style={{ color: theme.colors.error, marginTop: 8 }}>
          No rate yet for {unified.missing.join(", ")}
        </Text>
      ) : null}
    </Surface>
  );
};

function primaryForeignQuote(parts: ConvertedPart[], target: string) {
  return parts.find((part) => part.currency !== target)?.quote
    || parts[0]?.quote
    || null;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  compactCard: {
    padding: 14,
  },
  amount: {
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 2,
  },
  breakdown: {
    marginTop: 2,
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
  },
  chip: {
    maxWidth: "78%",
  },
  chipText: {
    fontSize: 12,
  },
});
