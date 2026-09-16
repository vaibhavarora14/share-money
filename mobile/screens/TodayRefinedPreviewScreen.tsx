import React, { useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import {
  Appbar,
  Button,
  Divider,
  FAB,
  Provider as PaperProvider,
  SegmentedButtons,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { BalancesSection } from "../components/BalancesSection";
import { GroupDashboard } from "../components/GroupDashboard";
import { SplitAmongEditor } from "../components/SplitAmongEditor";
import { TransactionsSection } from "../components/TransactionsSection";
import { WEB_MAX_WIDTH } from "../constants/layout";
import { lightTheme } from "../theme";
import { Balance, GroupStatsResponse, Participant, Settlement, Transaction } from "../types";
import { SETTLE_OUTSIDE_APP_HELP, RECORD_SETTLEMENT_LABEL } from "../utils/settleCopy";

type SurfaceId = "empty" | "home" | "expense" | "balances" | "settle";

const YOU: Participant = {
  id: "p-you",
  group_id: "g1",
  user_id: "u-you",
  full_name: "You",
  email: "you@example.com",
  type: "member",
};

const MAYA: Participant = {
  id: "p-maya",
  group_id: "g1",
  user_id: "u-maya",
  full_name: "Maya Patel",
  email: "maya@example.com",
  type: "member",
};

const ALEX: Participant = {
  id: "p-alex",
  group_id: "g1",
  user_id: "u-alex",
  full_name: "Alex Rivera",
  email: "alex@example.com",
  type: "member",
};

const SAMIRA: Participant = {
  id: "p-samira",
  group_id: "g1",
  user_id: "u-samira",
  full_name: "Samira Nguyen",
  email: "samira@example.com",
  type: "member",
};

const JORDAN: Participant = {
  id: "p-jordan",
  group_id: "g1",
  user_id: "u-jordan",
  full_name: "Jordan Davis",
  email: "jordan@example.com",
  type: "member",
};

const KAI: Participant = {
  id: "p-kai",
  group_id: "g1",
  user_id: "u-kai",
  full_name: "Kai Chen",
  email: "kai@example.com",
  type: "member",
};

const POPULATED_MEMBERS = [
  { user_id: "u-you", full_name: "You", email: "you@example.com", status: "active", participant_id: "p-you" },
  { user_id: "u-maya", full_name: "Maya Patel", email: "maya@example.com", status: "active", participant_id: "p-maya" },
  { user_id: "u-alex", full_name: "Alex Rivera", email: "alex@example.com", status: "active", participant_id: "p-alex" },
];

const SOLO_MEMBERS = [
  { user_id: "u-you", full_name: "You", email: "you@example.com", status: "active", participant_id: "p-you" },
];

const SAMPLE_BALANCES: Balance[] = [
  { user_id: "u-maya", participant_id: "p-maya", amount: 24, currency: "USD", full_name: "Maya Patel", email: "maya@example.com" },
  { user_id: "u-alex", participant_id: "p-alex", amount: -18, currency: "USD", full_name: "Alex Rivera", email: "alex@example.com" },
];

const DETAIL_BALANCES: Balance[] = [
  { user_id: "u-alex", participant_id: "p-alex", amount: 85, currency: "USD", full_name: "Alex Rivera" },
  { user_id: "u-samira", participant_id: "p-samira", amount: 60, currency: "USD", full_name: "Samira Nguyen" },
  { user_id: "u-jordan", participant_id: "p-jordan", amount: -45, currency: "USD", full_name: "Jordan Davis" },
  { user_id: "u-kai", participant_id: "p-kai", amount: 140, currency: "USD", full_name: "Kai Chen" },
  { user_id: "u-maya", participant_id: "p-maya", amount: -87.5, currency: "USD", full_name: "Maya Patel" },
];

function sampleExpense(
  id: number,
  description: string,
  amount: number,
  paidBy: Participant,
  category: string,
  date: string,
): Transaction {
  return {
    id,
    group_id: "g1",
    description,
    amount,
    currency: "USD",
    paid_by: paidBy.user_id || undefined,
    paid_by_participant_id: paidBy.id,
    category,
    date,
    created_at: date,
    type: "expense",
    split_among_participant_ids: [YOU.id, MAYA.id, ALEX.id],
  };
}

const EXPENSE_TOTAL = 67.43 + 38.2 + 24; // 129.63
const MY_SHARE = EXPENSE_TOTAL / 3; // equal among 3

const SAMPLE_GROUP_STATS: GroupStatsResponse = {
  member_breakdown: [],
  my_transactions: [],
  totals: {
    my_share: { USD: Math.round(MY_SHARE * 100) / 100 },
    group_total: { USD: Math.round(EXPENSE_TOTAL * 100) / 100 },
    i_owe: { USD: 18 },
    im_owed: { USD: 24 },
  },
  settlement_plan: [],
};

const SAMPLE_PAYMENT: Settlement = {
  id: "s-venmo",
  group_id: "g1",
  from_user_id: "u-alex",
  to_user_id: "u-you",
  from_participant_id: "p-alex",
  to_participant_id: "p-you",
  amount: 18,
  currency: "USD",
  notes: "Venmo for utilities",
  created_by: "u-alex",
  created_at: "2025-05-19T12:00:00Z",
};

const LEDGER_ITEMS = [
  {
    kind: "payment" as const,
    key: "p1",
    sortAt: Date.parse("2025-05-19"),
    sortTiebreaker: "0",
    settlement: SAMPLE_PAYMENT,
  },
  {
    kind: "expense" as const,
    key: "e1",
    sortAt: Date.parse("2025-05-18"),
    sortTiebreaker: "1",
    transaction: sampleExpense(1, "Grocery run", 67.43, MAYA, "grocery", "2025-05-18"),
  },
  {
    kind: "expense" as const,
    key: "e2",
    sortAt: Date.parse("2025-05-16"),
    sortTiebreaker: "2",
    transaction: sampleExpense(2, "Utilities", 38.2, YOU, "utilities", "2025-05-16"),
  },
  {
    kind: "expense" as const,
    key: "e3",
    sortAt: Date.parse("2025-05-14"),
    sortTiebreaker: "3",
    transaction: sampleExpense(3, "Cleaning supplies", 24, ALEX, "shopping", "2025-05-14"),
  },
];

function PreviewShell({
  title,
  children,
  fab,
  peopleChip = false,
}: {
  title: string;
  children: React.ReactNode;
  fab?: React.ReactNode;
  peopleChip?: boolean;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const maxWidth = Math.min(width, WEB_MAX_WIDTH);
  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.background, maxWidth, alignSelf: "center", width: "100%" }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
        <Appbar.Action icon="menu" iconColor={theme.colors.primary} />
        <Appbar.Content title={title} titleStyle={{ fontWeight: "700" }} />
        {peopleChip ? (
          <Button
            mode="outlined"
            compact
            icon="account-multiple-outline"
            style={{ borderRadius: 8, borderColor: theme.colors.primary, marginRight: 4 }}
            textColor={theme.colors.primary}
            labelStyle={{ fontSize: 13, marginVertical: 4 }}
          >
            People
          </Button>
        ) : null}
        <Appbar.Action icon="bell-outline" iconColor={theme.colors.primary} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={{ paddingBottom: fab ? 96 : 32 }}>
        {children}
      </ScrollView>
      {fab}
    </View>
  );
}

function EmptyHomePreview() {
  const theme = useTheme();
  return (
    <PreviewShell
      title="SharedMoney"
      fab={
        <FAB
          icon="account-plus"
          label="Add people"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          color={theme.colors.onPrimary}
          onPress={() => {}}
          testID="add-people-fab"
        />
      }
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <TransactionsSection
          items={[]}
          loading={false}
          onEditExpense={() => {}}
          members={SOLO_MEMBERS}
          participants={[YOU]}
          canAct
          onAddPeople={() => {}}
          onAddExpense={() => {}}
        />
      </View>
    </PreviewShell>
  );
}

function PopulatedHomePreview() {
  const theme = useTheme();
  return (
    <PreviewShell
      title="Roommates"
      peopleChip
      fab={
        <FAB
          icon="plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          color={theme.colors.onPrimary}
          onPress={() => {}}
        />
      }
    >
      <GroupDashboard
        balances={SAMPLE_BALANCES}
        groupStats={SAMPLE_GROUP_STATS}
        currentUserId="u-you"
        currentUserParticipantId="p-you"
        loading={false}
        activeMemberCount={3}
        defaultCurrency="USD"
      />
      <View style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 4 }}>
        <Text variant="titleMedium" style={{ fontWeight: "700" }}>
          Recent expenses
        </Text>
      </View>
      <View style={{ paddingHorizontal: 8 }}>
        <TransactionsSection
          items={LEDGER_ITEMS}
          loading={false}
          onEditExpense={() => {}}
          onEditPayment={() => {}}
          members={POPULATED_MEMBERS}
          participants={[YOU, MAYA, ALEX]}
        />
      </View>
    </PreviewShell>
  );
}

function AddExpensePreview() {
  const theme = useTheme();
  const participants = [YOU, MAYA, ALEX];
  return (
    <PreviewShell title="SharedMoney">
      <View style={{ padding: 16, gap: 16 }}>
        <Surface style={[styles.card, { borderColor: theme.colors.outlineVariant }]} elevation={0}>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Amount
          </Text>
          <Text variant="displaySmall" style={{ fontWeight: "700", color: theme.colors.onSurface }}>
            $0.00
          </Text>
          <Divider style={{ marginVertical: 12 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text variant="bodyLarge">Paid by You</Text>
            <Text style={{ color: theme.colors.tertiary }}>✓</Text>
          </View>
        </Surface>
        <Surface style={[styles.card, { borderColor: theme.colors.outlineVariant }]} elevation={0}>
          <SplitAmongEditor
            participants={participants}
            selectedIds={participants.map((p) => p.id)}
            amounts={{}}
            shares={{}}
            mode="equal"
            totalAmount={null}
            currency="USD"
            areAllSelected
            onToggleMember={() => {}}
            onToggleAll={() => {}}
            onModeChange={() => {}}
            onAmountChange={() => {}}
            onShareChange={() => {}}
            onSplitRemaining={() => {}}
            preferCompact
          />
        </Surface>
        <Button mode="contained" style={{ borderRadius: 8 }} contentStyle={{ height: 48 }}>
          Save expense
        </Button>
      </View>
    </PreviewShell>
  );
}

function BalancesPreview() {
  return (
    <PreviewShell title="SharedMoney">
      <View style={{ padding: 16 }}>
        <BalancesSection
          groupBalances={[]}
          overallBalances={DETAIL_BALANCES}
          loading={false}
          showOverallBalances
          currentUserId="u-you"
          participants={[ALEX, SAMIRA, JORDAN, KAI, MAYA]}
        />
      </View>
    </PreviewShell>
  );
}

function SettlePreview() {
  const theme = useTheme();
  return (
    <PreviewShell title="SharedMoney">
      <View style={{ padding: 16 }}>
        <Surface style={[styles.card, { borderColor: theme.colors.outlineVariant }]} elevation={0}>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}
          >
            {SETTLE_OUTSIDE_APP_HELP}
          </Text>
          {[
            ["From", "Who is paying?"],
            ["To", "Who is receiving?"],
            ["Amount", "$ 0.00"],
            ["Note", "What's this payment for?"],
          ].map(([label, placeholder]) => (
            <View key={label} style={{ marginBottom: 14 }}>
              <Text variant="labelLarge" style={{ marginBottom: 6, fontWeight: "700" }}>
                {label}
              </Text>
              <Surface
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.outline,
                  borderRadius: 8,
                  padding: 14,
                  backgroundColor: theme.colors.surface,
                }}
                elevation={0}
              >
                <Text style={{ color: theme.colors.onSurfaceVariant }}>{placeholder}</Text>
              </Surface>
            </View>
          ))}
          <Button mode="contained" style={{ borderRadius: 8, marginTop: 8 }} icon="arrow-right" contentStyle={{ flexDirection: "row-reverse", height: 48 }}>
            {RECORD_SETTLEMENT_LABEL}
          </Button>
        </Surface>
      </View>
    </PreviewShell>
  );
}

export const TodayRefinedPreviewScreen: React.FC = () => {
  const [surface, setSurface] = useState<SurfaceId>("empty");

  return (
    <PaperProvider theme={lightTheme}>
      <SafeAreaView style={{ flex: 1, backgroundColor: lightTheme.colors.background }} edges={["top", "bottom"]}>
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, maxWidth: WEB_MAX_WIDTH, width: "100%", alignSelf: "center" }}>
          <Text variant="labelLarge" style={{ marginBottom: 8, fontWeight: "700" }}>
            Today refined preview
          </Text>
          <SegmentedButtons
            value={surface}
            onValueChange={(v) => setSurface(v as SurfaceId)}
            buttons={[
              { value: "empty", label: "Empty" },
              { value: "home", label: "Home" },
              { value: "expense", label: "Expense" },
              { value: "balances", label: "Balances" },
              { value: "settle", label: "Settle" },
            ]}
          />
        </View>
        {surface === "empty" ? <EmptyHomePreview /> : null}
        {surface === "home" ? <PopulatedHomePreview /> : null}
        {surface === "expense" ? <AddExpensePreview /> : null}
        {surface === "balances" ? <BalancesPreview /> : null}
        {surface === "settle" ? <SettlePreview /> : null}
      </SafeAreaView>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    borderRadius: 28,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
});
