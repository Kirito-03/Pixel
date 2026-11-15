import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function fixture() {
  let handlers; const exports = {};
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: value => [value, () => {}], useRef: value => ({ current: value }), useMemo: fn => fn() };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../components/PlaybackTimeline.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    return { View: 'View', Text: 'Text', StyleSheet: { create: value => value }, PanResponder: { create: value => { handlers = value; return { panHandlers: {} }; } } };
  } });
  const seek = [], drag = [];
  const tree = exports.default({ currentTime: 60, duration: 1200, onSeek: value => seek.push(value), onScrubbingChange: value => drag.push(value) });
  const track = tree.props.children.flat().find(child => child?.props?.accessibilityRole === 'adjustable');
  track.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
  return { handlers, track, seek, drag, time: exports.playbackTime };
}
test('dragging previews a chosen minute and performs only one seek on release', () => {
  const f = fixture();
  f.handlers.onPanResponderGrant({ nativeEvent: { locationX: 30 } });
  f.handlers.onPanResponderMove({}, { dx: 120 });
  assert.equal(f.seek.length, 0);
  f.handlers.onPanResponderRelease();
  assert.equal(f.seek[0], 600); assert.deepEqual(f.drag, [true, false]);
});
test('cancelled scrubbing does not seek; accessibility increment moves ten seconds', () => {
  const f = fixture();
  f.handlers.onPanResponderGrant({ nativeEvent: { locationX: 200 } }); f.handlers.onPanResponderTerminate();
  assert.equal(f.seek.length, 0);
  f.track.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); assert.equal(f.seek[0], 70);
  assert.equal(f.time(125), '2:05');
});
