const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function themes() {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, '../theme.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'exports', code)(name => name === 'react-native'
    ? { Platform: { select: options => options.default } }
    : { MD3LightTheme: { dark: false }, MD3DarkTheme: { dark: true }, configureFonts: () => ({}) }, module.exports);
  return [module.exports.lightTheme, module.exports.darkTheme];
}
function contrast(foreground, background, opacity = 1) {
  const rgb = hex => hex.slice(1).match(/../g).map(x => parseInt(x, 16));
  const bg = rgb(background);
  const blended = rgb(foreground).map((x, i) => x * opacity + bg[i] * (1 - opacity));
  const luminance = values => values.map(x => x / 255)
    .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  const [hi, lo] = [luminance(blended), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

test('settlement choose-who placeholder meets 4.5:1 normal-text contrast in both themes', () => {
  const file = 'SettlementFormScreen.tsx';
  const source = ts.createSourceFile(file, readFileSync(path.join(__dirname, '../screens', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let placeholder;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'Text' && node.children.some(c => ts.isJsxText(c) && c.text.trim() === 'Choose who paid whom')) placeholder = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(placeholder);
  function style(element, theme) {
    const attribute = element.openingElement.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.text === 'style');
    return new Function('theme', 'styles', `return (${attribute.initializer.expression.getText(source)});`)(theme, {});
  }
  let container = placeholder.parent;
  while (container && !(ts.isJsxElement(container) && container.openingElement.getText(source).includes('styles.balanceInfo'))) container = container.parent;
  assert.ok(container, 'use the actual header background');
  for (const theme of themes()) {
    const fg = style(placeholder, theme);
    const bg = Object.assign({}, ...style(container, theme)).backgroundColor;
    const ratio = contrast(fg.color, bg, fg.opacity);
    assert.ok(ratio >= 4.5, `${theme.dark ? 'dark' : 'light'} placeholder contrast ${ratio.toFixed(3)}:1`);
  }
});
