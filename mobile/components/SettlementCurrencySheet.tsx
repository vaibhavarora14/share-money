import React, { useMemo, useState } from "react";
import { FlatList, Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  Divider,
  IconButton,
  List,
  Searchbar,
  Surface,
  Switch,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { WEB_MAX_WIDTH } from "../constants/layout";
import { GroupCurrencySettings } from "../hooks/useCurrencyPreferences";
import { filterCurrencies, getCurrencyName, getDefaultCurrency } from "../utils/currency";
import {
  RateBook,
  formatRateLabel,
  resolveRate,
} from "../utils/currencyMerge";
import { ExchangeRateEditor } from "./ExchangeRateEditor";

interface SettlementCurrencySheetProps {
  visible: boolean;
  groupName?: string;
  currencies: string[];
  settings: GroupCurrencySettings | null;
  preferredCurrency: string;
  rateBook: RateBook;
  onDismiss: () => void;
  onToggle: (enabled: boolean, settlementCurrency: string) => void;
  onChangeCurrency: (currency: string) => void;
  onSaveRate: (from: string, to: string, rate: number) => void;
  onResetRate: (from: string, to: string) => void;
}

export const SettlementCurrencySheet: React.FC<SettlementCurrencySheetProps> = ({
  visible,
  groupName,
  currencies,
  settings,
  preferredCurrency,
  rateBook,
  onDismiss,
  onToggle,
  onChangeCurrency,
  onSaveRate,
  onResetRate,
}) => {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingFrom, setEditingFrom] = useState<string | null>(null);

  const settlementCurrency = settings?.settlementCurrency || preferredCurrency || getDefaultCurrency();
  const enabled = settings?.enabled === true;
  const usedCurrencies = useMemo(() => {
    const set = new Set(currencies.map((code) => code.toUpperCase()));
    set.add(settlementCurrency);
    return Array.from(set);
  }, [currencies, settlementCurrency]);

  const foreignCurrencies = usedCurrencies.filter((code) => code !== settlementCurrency);
  const filtered = useMemo(() => filterCurrencies(search), [search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={["top", "left", "right"]}>
        <View style={styles.frame}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, minHeight: 64 }}>
            <IconButton
              icon="arrow-left"
              iconColor={theme.colors.onSurface}
              accessibilityLabel="Back"
              onPress={onDismiss}
              testID="settlement-currency-back"
            />
            <Text variant="titleLarge" style={{ flex: 1, fontWeight: "700", marginHorizontal: 8 }}>
              Settlement currency
            </Text>
          </View>

          <View style={styles.body}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {groupName
                ? `Keep every ${groupName} expense in its original currency. Optionally settle the group in one currency.`
                : "Keep original amounts. Optionally settle in one currency."}
            </Text>

            <Surface style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text variant="titleSmall" style={{ fontWeight: "700" }}>
                    Show one balance
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Shared mid-market rates, or a rate the group sets.
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(value) => onToggle(value, settlementCurrency)}
                  testID="unify-toggle"
                />
              </View>
            </Surface>

            <List.Item
              title={`Settle in ${settlementCurrency}`}
              description={getCurrencyName(settlementCurrency)}
              left={(props) => <List.Icon {...props} icon="cash" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => setPickerOpen(true)}
              style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}
            />

            {foreignCurrencies.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                  Rates used in this group
                </Text>
                <Surface style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, paddingVertical: 4 }]} elevation={0}>
                  {foreignCurrencies.map((code, index) => {
                    const quote = resolveRate(code, settlementCurrency, rateBook);
                    return (
                      <View key={code}>
                        <TouchableOpacity
                          style={styles.rateRow}
                          onPress={() => setEditingFrom(code)}
                          testID={`edit-rate-${code}`}
                        >
                          <View style={{ flex: 1 }}>
                            <Text variant="titleSmall" style={{ fontWeight: "600" }}>
                              {code} → {settlementCurrency}
                            </Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              {quote
                                ? `${formatRateLabel(quote)} · ${quote.source}`
                                : "Set a group rate to include this currency"}
                            </Text>
                          </View>
                          <IconButton icon="pencil-outline" onPress={() => setEditingFrom(code)} />
                        </TouchableOpacity>
                        {index < foreignCurrencies.length - 1 ? <Divider /> : null}
                      </View>
                    );
                  })}
                </Surface>
              </View>
            ) : (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Rates appear here once the group has more than one currency.
              </Text>
            )}

            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Mid-market quotes are shared with every member so you see the same number. They are not a card or ATM rate, and they do not rewrite saved expenses.
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={[styles.picker, { backgroundColor: theme.colors.surface }]} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerHeader}>
              <Text variant="titleLarge">Settlement currency</Text>
              <IconButton icon="close" onPress={() => setPickerOpen(false)} />
            </View>
            <Searchbar
              placeholder="Search currencies"
              value={search}
              onChangeText={setSearch}
              style={{ marginHorizontal: 12, marginBottom: 8 }}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => {
                const selected = item.code === settlementCurrency;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, selected && { backgroundColor: theme.colors.primaryContainer }]}
                    onPress={() => {
                      onChangeCurrency(item.code);
                      setPickerOpen(false);
                    }}
                  >
                    <View>
                      <Text variant="bodyLarge">{item.code} ({item.symbol})</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{item.name}</Text>
                    </View>
                    {selected ? <IconButton icon="check" iconColor={theme.colors.primary} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {editingFrom ? (
        <ExchangeRateEditor
          visible
          from={editingFrom}
          to={settlementCurrency}
          rateBook={rateBook}
          onDismiss={() => setEditingFrom(null)}
          onSave={(rate) => {
            onSaveRate(editingFrom, settlementCurrency, rate);
            setEditingFrom(null);
          }}
          onResetToMarket={() => {
            onResetRate(editingFrom, settlementCurrency);
            setEditingFrom(null);
          }}
        />
      ) : null}
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: WEB_MAX_WIDTH,
    alignSelf: "center",
  },
  body: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 32, 0.45)",
    justifyContent: "center",
    padding: 16,
  },
  picker: {
    borderRadius: 20,
    maxHeight: "80%",
    overflow: "hidden",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
