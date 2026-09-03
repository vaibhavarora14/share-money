import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Surface, Text, useTheme } from "react-native-paper";

interface UnifyPromptCardProps {
  currencies: string[];
  suggestedCurrency: string;
  onEnable: () => void;
  onChooseCurrency?: () => void;
}

export const UnifyPromptCard: React.FC<UnifyPromptCardProps> = ({
  currencies,
  suggestedCurrency,
  onEnable,
  onChooseCurrency,
}) => {
  const theme = useTheme();
  const list = currencies.join(", ");

  return (
    <Surface
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.primaryContainer,
        },
      ]}
      elevation={0}
    >
      <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer, fontWeight: "700" }}>
        Show this group as one balance
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.86 }}>
        This group has {list}. Keep the original amounts, and add a single {suggestedCurrency} total for settling.
      </Text>
      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={onEnable}
          compact
          buttonColor={theme.colors.primary}
          textColor={theme.colors.onPrimary}
        >
          Use {suggestedCurrency}
        </Button>
        {onChooseCurrency ? (
          <Button mode="text" onPress={onChooseCurrency} compact textColor={theme.colors.onPrimaryContainer}>
            Choose
          </Button>
        ) : null}
      </View>
    </Surface>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
});
