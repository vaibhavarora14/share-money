const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

test('currency Back dismisses without writes; nested picker Back stays in currency settings', () => {
  const state = []; let cursor = 0, dismissed = 0, writes = 0;
  const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), useMemo: fn => fn(), useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; } };
  const paper = { Button: 'Button', Text: 'Text', IconButton: 'IconButton', Divider: 'Divider', Searchbar: 'Searchbar', Surface: 'Surface', Switch: 'Switch', List: { Item: 'List.Item', Icon: 'List.Icon' }, useTheme: () => ({ colors: {} }) };
  const native = { Modal: 'Modal', View: 'View', FlatList: 'FlatList', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: x => x } };
  const source = fs.readFileSync(__dirname + '/SettlementCurrencySheet.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const output = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return react;
    if (name === 'react-native') return native;
    if (name === 'react-native-paper') return paper;
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name.endsWith('/layout')) return { WEB_MAX_WIDTH: 800 };
    if (name.endsWith('/currency')) return { filterCurrencies: () => [], getCurrencyName: () => 'Indian Rupee', getDefaultCurrency: () => 'INR' };
    if (name.endsWith('/currencyMerge')) return {};
    if (name === './ExchangeRateEditor') return { ExchangeRateEditor: 'ExchangeRateEditor' };
    throw Error(name);
  }, output, output.exports);
  const props = { visible: true, currencies: ['INR'], settings: null, preferredCurrency: 'INR', rateBook: {}, onDismiss: () => dismissed++, onToggle: () => writes++, onChangeCurrency: () => writes++, onSaveRate: () => writes++, onResetRate: () => writes++ };
  function render() { cursor = 0; return output.exports.SettlementCurrencySheet(props); }
  function nodes(root) { return !root || typeof root !== 'object' ? [] : [root, ...(root.children || []).flat(Infinity).flatMap(nodes)]; }
  let tree = render();
  const back = nodes(tree).find(n => n.props.testID === 'settlement-currency-back');
  assert.equal(back.type, 'IconButton');
  assert.equal(back.props.icon, 'arrow-left');
  assert.equal(back.props.accessibilityLabel, 'Back');
  back.props.onPress();
  assert.equal(dismissed, 1);
  nodes(tree).find(n => n.type === 'List.Item').props.onPress();
  tree = render();
  let picker = nodes(tree).filter(n => n.type === 'Modal')[1];
  assert.equal(picker.props.visible, true);
  picker.props.onRequestClose();
  tree = render();
  picker = nodes(tree).filter(n => n.type === 'Modal')[1];
  assert.equal(picker.props.visible, false);
  assert.equal(dismissed, 1);
  tree.props.onRequestClose();
  assert.equal(dismissed, 2);
  assert.equal(writes, 0);
});
