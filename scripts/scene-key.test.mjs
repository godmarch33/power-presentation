import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneKey, KEY_FIELDS } from './scene-key.mjs';

const base = Object.freeze({
  frameHtml: '<section class="clip" data-start="0" data-duration="4">hero</section>',
  assets: [
    { path: 'assets/footage.mp4', sha256: 'aa'.repeat(32) },
    { path: 'assets/logo.svg', sha256: 'bb'.repeat(32) },
  ],
  frameMd: '# frame.md\npalette: blue-professional\n',
  variables: { cta: 'Start my free trial', prospect: 'Ledgerly' },
  cliVersion: '0.8.47',
  fps: 30,
  quality: 'delivery',
  resolution: '1920x1080',
  capturePath: 'capture/prod/footage.mp4',
});

test('KEY_FIELDS lists the inputs in order', () => {
  assert.deepEqual([...KEY_FIELDS], [
    'frameHtml', 'assets', 'frameMd', 'variables', 'cliVersion', 'fps', 'quality', 'resolution', 'capturePath',
  ]);
});

test('sceneKey is a 64-char lowercase sha256 hex', () => {
  const k = sceneKey(base);
  assert.match(k, /^[0-9a-f]{64}$/);
});

test('sceneKey is deterministic (same inputs -> same key, across calls and copies)', () => {
  const a = sceneKey(base);
  const b = sceneKey(structuredClone(base));
  const c = sceneKey({ ...base, variables: { prospect: 'Ledgerly', cta: 'Start my free trial' } });
  assert.equal(a, b);
  assert.equal(a, c, 'object key order must not matter');
});

test('sceneKey changes when ANY single input changes (input list)', () => {
  const original = sceneKey(base);
  const mutations = {
    frameHtml: base.frameHtml + ' ',
    assets: [{ path: 'assets/footage.mp4', sha256: 'ab'.repeat(32) }, base.assets[1]],
    frameMd: base.frameMd.replace('blue-professional', 'cartesian'),
    variables: { ...base.variables, cta: 'Reply "yes"' },
    cliVersion: '0.8.46',
    fps: 60,
    quality: 'draft',
    resolution: '1080x1920',
    capturePath: 'capture/staging/footage.mp4',
  };
  assert.deepEqual(Object.keys(mutations).sort(), [...KEY_FIELDS].sort(), 'every field is exercised');
  const seen = new Set([original]);
  for (const [field, value] of Object.entries(mutations)) {
    const k = sceneKey({ ...base, [field]: value });
    assert.notEqual(k, original, `changing ${field} must change the key`);
    assert.ok(!seen.has(k), `mutation of ${field} collided with another key`);
    seen.add(k);
  }
});

test('asset listing order does not matter when assets carry paths', () => {
  const reversed = { ...base, assets: [...base.assets].reverse() };
  assert.equal(sceneKey(base), sceneKey(reversed));
});

test('adding or removing an asset changes the key', () => {
  const more = { ...base, assets: [...base.assets, { path: 'assets/extra.png', sha256: 'cc'.repeat(32) }] };
  const fewer = { ...base, assets: base.assets.slice(0, 1) };
  assert.notEqual(sceneKey(more), sceneKey(base));
  assert.notEqual(sceneKey(fewer), sceneKey(base));
  assert.notEqual(sceneKey(more), sceneKey(fewer));
});

test('length framing: shifting bytes between adjacent fields changes the key', () => {
  const a = sceneKey({ ...base, frameHtml: 'ab', frameMd: 'c', assets: [] });
  const b = sceneKey({ ...base, frameHtml: 'a', frameMd: 'bc', assets: [] });
  assert.notEqual(a, b);
});

test('null vs empty string are distinct, and a missing field throws', () => {
  assert.notEqual(sceneKey({ ...base, capturePath: null }), sceneKey({ ...base, capturePath: '' }));
  const { capturePath, ...missing } = base;
  assert.throws(() => sceneKey(missing), /missing field\(s\) capturePath/);
  assert.throws(() => sceneKey(null), TypeError);
});

test('Buffers and strings with the same bytes hash the same for frame HTML', () => {
  const asString = sceneKey(base);
  const asBuffer = sceneKey({ ...base, frameHtml: Buffer.from(base.frameHtml, 'utf8') });
  assert.notEqual(asString, asBuffer);
  assert.equal(asBuffer, sceneKey({ ...base, frameHtml: Buffer.from(base.frameHtml, 'utf8') }));
});
