import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
const exports = {};
const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../components/PlaybackChrome.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports, require(name) {
  if (name === 'react') return react;
  if (name === 'react-native') return { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'ScrollView', StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 390, height: 844 }) };
  if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
  return { LinearGradient: 'Gradient' };
} });
function nodes(node) { if (!node || typeof node !== 'object') return []; return [node, ...(node.props?.children || []).flat(Infinity).flatMap(nodes)]; }
test('shared controls switch server, close the dropdown and route next/previous independently', () => {
  let menu, selected, next = 0, previous = 0;
  const tree = exports.default({ title: 'Serie de prueba', subtitle: 'Episodio 2', servers: [{ server: 'Uno' }, { server: 'Dos' }], selectedIndex: 0, menuOpen: true, onMenuChange: value => menu = value, onSelectServer: value => selected = value, onNext: () => next++, onPrevious: () => previous++, onClose() {} });
  const buttons = nodes(tree).filter(node => node.type === 'Button');
  buttons.find(node => node.props.accessibilityLabel === 'Siguiente capítulo').props.onPress();
  buttons.find(node => node.props.accessibilityLabel === 'Capítulo anterior').props.onPress();
  buttons.find(node => node.props.accessibilityState?.selected === false).props.onPress();
  assert.equal(next, 1); assert.equal(previous, 1); assert.equal(selected, 1); assert.equal(menu, false);
});
test('end of series never offers a next episode button', () => {
  const tree = exports.default({ title: 'Último', subtitle: 'Episodio 12', onClose() {} });
  assert.equal(nodes(tree).some(node => node.props?.accessibilityLabel === 'Siguiente capítulo'), false);
});
