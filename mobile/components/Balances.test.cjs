const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const React = require("react");

// Run actual components and currency/debt helpers; only native views and the
// preference hook are opaque boundaries. No API or native runtime is required.
function components(preferences = {}) {
  const cache = new Map();
  const paper = Object.fromEntries(["ActivityIndicator", "Button", "Divider", "Surface", "Text", "TouchableRipple"].map(name => [name, name]));
  paper.Avatar = { Text: "Avatar.Text" };
  paper.useTheme = () => ({ colors: {} });
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const localRequire = (id) => {
      if (id === "react") return { ...React, useMemo: fn => fn() };
      if (id === "react-native") return { View: "View", StyleSheet: { create: styles => styles, hairlineWidth: 1 } };
      if (id === "react-native-paper") return paper;
      if (id === "@expo/vector-icons/MaterialCommunityIcons") return "Icon";
      if (id === "../hooks/useCurrencyPreferences") return { useCurrencyPreferences: () => ({ rateBook: {}, ...preferences }) };
      if (["./UnifiedBalanceHero", "./UnifyPromptCard"].includes(id)) return { [id.slice(2)]: id.slice(2) };
      if (id.startsWith(".")) {
        const resolved = path.resolve(path.dirname(filename), id);
        return load(existsSync(resolved) ? resolved : `${resolved}.ts`);
      }
      return require(id);
    };
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
  }
  return {
    ...load(path.join(__dirname, "GroupDashboard.tsx")),
    ...load(path.join(__dirname, "BalancesSection.tsx")),
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return React.Children.toArray(tree?.props?.children).map(text).join("");
}
function byId(tree, id) {
  const result = nodes(tree).find(node => node.props.testID === id);
  assert.ok(result, `Expected ${id}`);
  return result;
}
const balance = (id, amount, currency = "USD") => ({ participant_id: id, user_id: id, full_name: id === "me" ? "You" : id, amount, currency });
const dashboard = (balances, overrides = {}, preferences = {}) => components(preferences).GroupDashboard({ balances, currentUserId: "me", defaultCurrency: "USD", loading: false, activeMemberCount: 3, ...overrides });

test("dashboard creditor sees Alice owes you, not the viewer's own net row", () => {
  const tree = dashboard([balance("me", 50), balance("Alice", -50)]);
  assert.match(text(tree), /Alice owes you/);
  assert.doesNotMatch(text(tree), /You owes you|You owe Alice/);
  assert.equal(text(byId(tree, "balance-strip-owed-amount")), "+$50.00");
  assert.equal(text(byId(tree, "balance-strip-owe-amount")), "$0.00");
});
test("dashboard debtor sees You owe Alice, never Alice owes you", () => {
  const tree = dashboard([balance("me", -50), balance("Alice", 50)]);
  assert.match(text(tree), /You owe Alice/);
  assert.doesNotMatch(text(tree), /Alice owes you|You owe You/);
  assert.equal(text(byId(tree, "balance-strip-owe-amount")), "-$50.00");
});
test("dashboard uses the viewer's edge amount, not the counterparty's group net", () => {
  const tree = dashboard([balance("me", 20), balance("Alice", -100), balance("Bob", 80)]);
  assert.match(text(tree), /Alice owes you/);
  assert.equal(text(byId(tree, "balance-strip-owed-amount")), "+$20.00");
  assert.equal(text(byId(tree, "balance-strip-owe-amount")), "$0.00");
});
test("dashboard recognizes viewer by participant id and keeps edge currencies", () => {
  const tree = dashboard([
    { ...balance("viewer-participant", 50), user_id: null }, balance("Alice", -50),
    { ...balance("viewer-participant", -30, "EUR"), user_id: null }, balance("Bob", 30, "EUR"),
  ], { currentUserParticipantId: "viewer-participant" });
  assert.match(text(tree), /Alice owes you/);
  assert.match(text(tree), /You owe Bob/);
  assert.equal(text(byId(tree, "balance-strip-owed-amount")), "+$50.00");
  assert.equal(text(byId(tree, "balance-strip-owe-amount")), "-€30.00");
});

test("dashboard unification keeps the viewer's converted net in the settlement currency", () => {
  const tree = dashboard([
    balance("me", 50), balance("Alice", -50),
    balance("me", -20, "EUR"), balance("Bob", 20, "EUR"),
  ], {}, {
    groupSettings: { enabled: true, settlementCurrency: "USD" },
    rateBook: { usdRates: { USD: 1, EUR: 0.8 }, overrides: {} },
  });
  assert.equal(nodes(tree).some(node => node.props.testID === "group-balance-strip"), false);
  const hero = nodes(tree).find(node => node.type === "UnifiedBalanceHero");
  assert.ok(hero);
  assert.equal(hero.props.unified.currency, "USD");
  assert.equal(hero.props.unified.amount, 25);
});
test("dashboard does not label third-party debts as debts to the viewer", () => {
  const tree = dashboard([balance("me", 0), balance("Alice", -50), balance("Bob", 50)]);
  assert.doesNotMatch(text(tree), /Alice owes you|Bob owes you|You owe Alice|You owe Bob/);
  assert.equal(text(byId(tree, "balance-strip-owed-amount")), "$0.00");
  assert.equal(text(byId(tree, "balance-strip-owe-amount")), "$0.00");
});

test("balance summary adds only matching currencies on both sides", () => {
  const { BalancesSection } = components();
  const balances = [balance("Alice", 100), balance("Bob", 100, "INR"), balance("Cara", 20), balance("Dan", -40), balance("Eve", -60, "EUR"), balance("Frank", -10, "EUR")];
  for (const showOverallBalances of [true, false]) {
    const tree = BalancesSection({ groupBalances: [{ group_id: "g", balances }], overallBalances: showOverallBalances ? balances : [], showOverallBalances, defaultCurrency: "USD", loading: false });
    const owed = text(byId(tree, "balances-summary-owed"));
    const owe = text(byId(tree, "balances-summary-owe"));
    assert.match(owed, /\$120\.00/);
    assert.match(owed, /₹100\.00/);
    assert.match(owe, /\$40\.00/);
    assert.match(owe, /€70\.00/);
    assert.doesNotMatch(owed + owe, /220\.00|110\.00/);
  }
});
test("balance summary preserves already-converted currency and default zero", () => {
  const tree = components().BalancesSection({ groupBalances: [], overallBalances: [balance("Alice", 110), balance("Bob", 20)], defaultCurrency: "USD", loading: false });
  assert.equal(text(byId(tree, "balances-summary-owed")), "$130.00");
  assert.equal(text(byId(tree, "balances-summary-owe")), "$0.00");
});

test("balance surfaces expose no settle actions even when callbacks are supplied", () => {
  const onSettle = () => assert.fail("Balance rows must not settle");
  const { BalancesSection } = components();
  const section = BalancesSection({ groupBalances: [], overallBalances: [balance("Alice", 50), balance("Bob", -20)], loading: false, onSettleUp: onSettle });
  const strip = byId(dashboard([balance("me", 50), balance("Alice", -50)], { onSettlePress: onSettle }), "group-balance-strip");
  for (const tree of [section, strip]) {
    assert.ok(nodes(tree).length > 1);
    assert.doesNotMatch(text(tree), /\b(settle|pay|receive)\b/i);
    for (const node of nodes(tree)) {
      assert.equal(node.props.onPress, undefined);
      assert.equal(node.props.onLongPress, undefined);
      assert.notEqual(node.props.accessibilityRole, "button");
    }
  }
});
