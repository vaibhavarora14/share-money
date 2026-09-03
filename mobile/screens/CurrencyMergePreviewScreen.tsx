import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Appbar,
  Avatar,
  Chip,
  Surface,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConvertedAmountHint } from "../components/ConvertedAmountHint";
import { ExchangeRateEditor } from "../components/ExchangeRateEditor";
import { GroupBalanceBadge } from "../components/GroupBalanceBadge";
import { SettlementCurrencySheet } from "../components/SettlementCurrencySheet";
import { UnifiedBalanceHero } from "../components/UnifiedBalanceHero";
import { UnifyPromptCard } from "../components/UnifyPromptCard";
import { WEB_MAX_WIDTH } from "../constants/layout";
import { GroupCurrencySettings } from "../hooks/useCurrencyPreferences";
import { Balance } from "../types";
import { formatCurrency } from "../utils/currency";
import {
  convertAmount,
  formatBreakdown,
  resolveRate,
  unifyBalances,
  unifyTotals,
  withOverrides,
} from "../utils/currencyMerge";
import { createPreviewRateBook } from "../utils/previewRates";

interface CurrencyMergePreviewScreenProps {
  onBack: () => void;
}

const SAMPLE_GROUP_ID = "preview-summer-vacation";
const YOU = "you";
const MAYA = "maya";

const SAMPLE_BALANCES: Balance[] = [
  { user_id: YOU, amount: -32, currency: "EUR", full_name: "You" },
  { user_id: YOU, amount: -12, currency: "USD", full_name: "You" },
  { user_id: MAYA, amount: 32, currency: "EUR", full_name: "Maya" },
  { user_id: MAYA, amount: 12, currency: "USD", full_name: "Maya" },
];

const SAMPLE_SETTINGS: GroupCurrencySettings = {
  enabled: true,
  settlementCurrency: "INR",
  customRates: { "EUR:INR": 91.2 },
};

export const CurrencyMergePreviewScreen: React.FC<CurrencyMergePreviewScreenProps> = ({
  onBack,
}) => {
  const theme = useTheme();
  const [settings, setSettings] = useState(SAMPLE_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const rateBook = useMemo(
    () => withOverrides(createPreviewRateBook(), settings.customRates),
    [settings.customRates]
  );
  const myBalances = SAMPLE_BALANCES.filter((balance) => balance.user_id === YOU);
  const unified = unifyBalances(myBalances, settings.settlementCurrency, rateBook);
  const groupTotal = unifyTotals(
    { EUR: 210, USD: 84, INR: 12800 },
    settings.settlementCurrency,
    rateBook
  );
  const dinnerConverted = convertAmount(45, "EUR", "INR", rateBook) ?? 0;
  const dinnerQuote = resolveRate("EUR", "INR", rateBook);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={["top", "left", "right"]}>
      <View style={styles.frame}>
        <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
          <Appbar.BackAction onPress={onBack} />
          <Appbar.Content title="Unified balance preview" titleStyle={{ fontWeight: "700" }} />
        </Appbar.Header>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Sample Summer Vacation group. Original amounts stay as entered. The one-number total is derived from the same merge math live groups use.
          </Text>

          <PreviewSection
            label="Group list"
            caption="The badge uses the settlement currency instead of showing only the largest leftover plus (+)."
          >
            <PreviewPhone>
              <View style={styles.groupRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={{ fontWeight: "700" }}>Summer Vacation</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Europe trip · INR, EUR, USD
                  </Text>
                </View>
                <GroupBalanceBadge
                  balanceData={{ group_id: SAMPLE_GROUP_ID, balances: SAMPLE_BALANCES }}
                  currentUserId={YOU}
                  previewSettings={settings}
                />
              </View>
              <View style={[styles.groupRow, styles.beforeRow]}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall">Before</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Largest currency only
                  </Text>
                </View>
                <View style={[styles.oldBadge, { backgroundColor: theme.colors.errorContainer }]}>
                  <Text style={{ color: theme.colors.onErrorContainer, fontWeight: "700", fontSize: 12 }}>
                    -€32.00 (+)
                  </Text>
                </View>
              </View>
            </PreviewPhone>
          </PreviewSection>

          <PreviewSection
            label="Group dashboard"
            caption="One net, the original currencies underneath, and the rate the group is using."
          >
            <PreviewPhone>
              <UnifiedBalanceHero
                unified={unified}
                onPressRates={() => setSettingsOpen(true)}
              />
              <Surface style={styles.actionCard} elevation={0}>
                <View style={styles.actionRow}>
                  <Avatar.Text size={40} label="MA" style={{ backgroundColor: theme.colors.surfaceVariant }} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyLarge" style={{ fontWeight: "500" }}>Maya</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>you owe</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text variant="titleMedium" style={{ color: theme.colors.error, fontWeight: "700" }}>
                      {formatCurrency(Math.abs(unified.amount), unified.currency)}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {formatBreakdown(unified.parts)}
                    </Text>
                    <View style={[styles.payChip, { backgroundColor: theme.colors.errorContainer }]}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onErrorContainer, fontWeight: "700" }}>
                        PAY
                      </Text>
                    </View>
                  </View>
                </View>
              </Surface>
            </PreviewPhone>
          </PreviewSection>

          <PreviewSection
            label="Opt-in"
            caption="Existing groups stay per-currency until someone turns this on."
          >
            <PreviewPhone>
              <UnifyPromptCard
                currencies={["EUR", "USD", "INR"]}
                suggestedCurrency="INR"
                onEnable={() => setSettings((current) => ({ ...current, enabled: true }))}
                onChooseCurrency={() => setSettingsOpen(true)}
              />
            </PreviewPhone>
          </PreviewSection>

          <PreviewSection
            label="Add expense"
            caption="Foreign amounts still save in the original currency. The conversion is a preview you can edit."
          >
            <PreviewPhone>
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text variant="displaySmall" style={{ fontWeight: "300", letterSpacing: -1.5 }}>
                  €45
                </Text>
                <Chip mode="outlined" style={{ marginTop: 8 }}>EUR</Chip>
                <ConvertedAmountHint
                  amount={dinnerConverted}
                  currency="INR"
                  quote={dinnerQuote}
                  onPressRate={() => setRateOpen(true)}
                />
              </View>
            </PreviewPhone>
          </PreviewSection>

          <PreviewSection
            label="Group stats"
            caption="Totals and settlement plans can use the same derived number without rewriting history."
          >
            <PreviewPhone>
              <UnifiedBalanceHero
                title="Group total"
                unified={groupTotal}
                compact
                intent="total"
                onPressRates={() => setSettingsOpen(true)}
              />
            </PreviewPhone>
          </PreviewSection>

          <PreviewSection
            label="Profile"
            caption="Your preferred currency is only for personal summaries. A group still settles in the currency it chooses."
          >
            <PreviewPhone>
              <View style={styles.profileRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={{ fontWeight: "700" }}>Preferred currency</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Home-screen totals use INR
                  </Text>
                </View>
                <Chip compact>{settings.settlementCurrency}</Chip>
              </View>
            </PreviewPhone>
          </PreviewSection>

          <TouchableRipple onPress={() => setSettingsOpen(true)}>
            <Surface style={[styles.openSettings, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
              <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer, fontWeight: "700" }}>
                Open settlement settings
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
                Toggle the merge, pick INR / EUR / USD, and edit the EUR rate.
              </Text>
            </Surface>
          </TouchableRipple>
        </ScrollView>
      </View>

      <SettlementCurrencySheet
        visible={settingsOpen}
        groupName="Summer Vacation"
        currencies={["EUR", "USD", "INR"]}
        settings={settings}
        preferredCurrency="INR"
        rateBook={rateBook}
        onDismiss={() => setSettingsOpen(false)}
        onToggle={(enabled, settlementCurrency) =>
          setSettings((current) => ({ ...current, enabled, settlementCurrency }))
        }
        onChangeCurrency={(currency) =>
          setSettings((current) => ({ ...current, settlementCurrency: currency, enabled: true }))
        }
        onSaveRate={(from, to, rate) =>
          setSettings((current) => ({
            ...current,
            customRates: { ...current.customRates, [`${from}:${to}`]: rate },
          }))
        }
        onResetRate={(from, to) =>
          setSettings((current) => {
            const next = { ...current.customRates };
            delete next[`${from}:${to}`];
            delete next[`${to}:${from}`];
            return { ...current, customRates: next };
          })
        }
      />

      <ExchangeRateEditor
        visible={rateOpen}
        from="EUR"
        to="INR"
        amount={45}
        rateBook={rateBook}
        onDismiss={() => setRateOpen(false)}
        onSave={(rate) => {
          setSettings((current) => ({
            ...current,
            customRates: { ...current.customRates, "EUR:INR": rate },
          }));
          setRateOpen(false);
        }}
        onResetToMarket={() => {
          setSettings((current) => {
            const next = { ...current.customRates };
            delete next["EUR:INR"];
            return { ...current, customRates: next };
          });
          setRateOpen(false);
        }}
      />
    </SafeAreaView>
  );
};

function PreviewSection({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: "700" }}>
        {label}
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {caption}
      </Text>
      {children}
    </View>
  );
}

function PreviewPhone({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Surface
      style={[
        styles.phone,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
      elevation={0}
    >
      {children}
    </Surface>
  );
}

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
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 28,
  },
  phone: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  beforeRow: {
    paddingTop: 8,
    opacity: 0.78,
  },
  oldBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  actionCard: {
    backgroundColor: "transparent",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  payChip: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  openSettings: {
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
});
