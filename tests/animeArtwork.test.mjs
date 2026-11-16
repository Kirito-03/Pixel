import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../utils/animeArtwork.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { artworkLayout } = exports;

test('desktop portrait stays beside the text and preserves the whole image', () => {
  const r = artworkLayout({ width: 1440, height: 520 }, { width: 460, height: 690 });
  assert.ok(r.width < 500 && r.height <= 520 && r.top >= 0 && r.left > 800);
  assert.ok(Math.abs(r.width / r.height - 460 / 690) < 0.001);
});
test('small artwork is never blown up to full desktop width', () => {
  const r = artworkLayout({ width: 1920, height: 560 }, { width: 320, height: 180 });
  assert.ok(r.width <= 320 * 1.35 && r.height <= 180 * 1.35);
});
test('mobile portrait keeps the top of the image visible', () => {
  const r = artworkLayout({ width: 390, height: 430 }, { width: 500, height: 750 });
  assert.ok(Math.abs(r.top) < 0.001);
  assert.equal(r.width, 390);
});
test('explicit focal point controls vertical crop; invalid sizes cannot render', () => {
  const top = artworkLayout({ width: 1000, height: 300 }, { width: 1000, height: 600 }, '50% 0%');
  const bottom = artworkLayout({ width: 1000, height: 300 }, { width: 1000, height: 600 }, '50% 100%');
  assert.ok(Math.abs(top.top) < 0.001);
  assert.equal(bottom.top, -300);
  assert.equal(artworkLayout({ width: 0, height: 300 }, { width: 100, height: 100 }), null);
});

test('a cinematic landscape hero fills its whole frame without distortion or an empty lower band', () => {
  const r = artworkLayout({ width: 1920, height: 738 }, { width: 1900, height: 400 }, '50% 0%', true);
  assert.ok(r.width >= 1920 && r.height >= 738);
  assert.ok(Math.abs(r.width / r.height - 1900 / 400) < 0.001);
  assert.equal(r.top, 0);
});

test('very wide banners keep their whole sharp composition over a separate backdrop; ordinary and mobile artwork keep normal fitting', () => {
 const r = exports.panoramaLayout({ width: 1920, height: 738 }, { width: 1900, height: 400 });
 assert.equal(r.width, 1920); assert.ok(r.left >= 0 && r.top > 0);
 assert.ok(r.height < 738 && r.height * 1900 / 400 === r.width);
 assert.equal(exports.panoramaLayout({ width: 390, height: 620 }, { width: 500, height: 750 }), null);
 assert.equal(exports.panoramaLayout({ width: 1920, height: 738 }, { width: 1920, height: 1080 }), null);
});
