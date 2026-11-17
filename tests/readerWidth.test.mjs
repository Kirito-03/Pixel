import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture(file, width = 390) {
  const state = []; let cursor = 0, loaded = false;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: value => ({ current: value }), useEffect() {},
    useState(value) { const index = cursor++; if (!(index in state)) state[index] = value; return [state[index], next => { state[index] = next; }]; },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react-native') return { View: 'View', Text: 'Text', Image: 'Image', ActivityIndicator: 'Spinner', TouchableOpacity: 'Button', StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => ({ width }) };
    if (name.includes('useReaderImage')) return { useReaderImage: uri => ({ source: uri, loaded, failed: false, attempt: 0, onLoad: () => { loaded = true; } }) };
    throw Error(name);
  } });
  return props => { cursor = 0; return exports.default(props); };
}

test('a 199px original never shrinks the web reading column after loading', () => {
  const render = fixture('components/ReaderImage.web.tsx');
  const props = { uri: 'https://example.test/199x8000.jpg', page: 1 };
  let tree = render(props);
  tree.props.children[0].props.onLoad({ currentTarget: { naturalWidth: 199, naturalHeight: 8000 } });
  tree = render(props);
  assert.equal(tree.props.style.width, '100%');
  assert.equal(tree.props.style.maxWidth, 800);
  assert.equal(tree.props.children[0].props.style.height, 'auto');
});

test('native image fallback fills mobile widths, caps desktop width and discards the previous page ratio', () => {
  for (const [viewport, expected] of [[320, 320], [390, 390], [1280, 800]]) {
    const render = fixture('components/ReaderImage.tsx', viewport);
    const props = { uri: 'https://example.test/narrow.jpg', page: 1 };
    let tree = render(props);
    tree.props.children[0].props.onLoad({ nativeEvent: { source: { width: 199, height: 8000 } } });
    tree = render(props);
    assert.equal(tree.props.style.width, expected);
    assert.equal(tree.props.style.aspectRatio, 199 / 8000);
    tree = render({ ...props, uri: 'https://example.test/next.jpg' });
    assert.equal(tree.props.style.aspectRatio, 0.72);
  }
});
