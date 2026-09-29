import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyKit, brandMdSkeleton, checkKit, importTokens, main, readBrandMd, readCaptureTokens, readCssRoot, readDtcg, toDtcg, toHex } from './brand-kit.mjs';

function ttf({ url = 'https://openfontlicense.org', fsType = 0 } = {}) {
  const recs = [[1, 'Brand Sans'], ...(url ? [[14, url]] : [])];
  const strs = recs.map(([, t]) => Buffer.from(t, 'utf16le').swap16());
  const name = Buffer.alloc(6 + recs.length * 12);
  name.writeUInt16BE(recs.length, 2); name.writeUInt16BE(name.length, 4);
  let off = 0;
  recs.forEach(([id], i) => { const o = 6 + i * 12; name.writeUInt16BE(3, o); name.writeUInt16BE(1, o + 2); name.writeUInt16BE(0x409, o + 4); name.writeUInt16BE(id, o + 6); name.writeUInt16BE(strs[i].length, o + 8); name.writeUInt16BE(off, o + 10); off += strs[i].length; });
  const nameT = Buffer.concat([name, ...strs]);
  const os2 = Buffer.alloc(78); os2.writeUInt16BE(fsType, 8);
  const tables = [['OS/2', os2], ['name', nameT]];
  const dir = Buffer.alloc(12 + tables.length * 16);
  dir.writeUInt32BE(0x00010000, 0); dir.writeUInt16BE(tables.length, 4);
  let pos = dir.length;
  tables.forEach(([tag, body], i) => { const e = 12 + i * 16; dir.write(tag, e, 'latin1'); dir.writeUInt32BE(pos, e + 8); dir.writeUInt32BE(body.length, e + 12); pos += body.length; });
  return Buffer.concat([dir, ...tables.map(([, b]) => b)]);
}

test('toHex(): hex 3/6/8 and rgb()/rgba() → #rrggbb; anything else null', () => {
  assert.equal(toHex('#2A6F97'), '#2a6f97');
  assert.equal(toHex('#fff'), '#ffffff');
  assert.equal(toHex('#2a6f97cc'), '#2a6f97');
  assert.equal(toHex('rgb(42, 111, 151)'), '#2a6f97');
  assert.equal(toHex('rgba(42 111 151 / .5)'), '#2a6f97');
  assert.equal(toHex('var(--x)'), null);
});

test('importers: DTCG (inherited $type, srgb components), CSS :root, capture tokens.json — detected by content', () => {
  const dtcg = { brand: { $type: 'color', ink: { $value: '#14213D' }, accent: { $value: { colorSpace: 'srgb', components: [42 / 255, 111 / 255, 151 / 255] } } }, type: { display: { $type: 'fontFamily', $value: ['Space Grotesk', 'sans-serif'] }, bold: { $type: 'fontWeight', $value: 700 } } };
  const d = readDtcg(dtcg);
  assert.deepEqual(d.colors, [{ name: 'brand.ink', hex: '#14213d' }, { name: 'brand.accent', hex: '#2a6f97' }]);
  assert.deepEqual(d.families, [{ name: 'type.display', family: 'Space Grotesk' }]);
  assert.deepEqual(d.weights, [700]);
  const css = readCssRoot(':root { --brand-ink: #14213d; --accent: rgb(42,111,151); --font-display: "Inter", sans-serif; --font-weight-bold: 700; } .x { --not-root: #000 }');
  assert.deepEqual(css.colors.map((c) => c.hex), ['#14213d', '#2a6f97']);
  assert.deepEqual(css.families.map((f) => f.family), ['Inter']);
  const cap = readCaptureTokens({ colors: ['#14213d', { hex: '2a6f97' }], fonts: [{ family: 'Inter, sans-serif', weights: [400, 700] }] });
  assert.deepEqual(cap.colors.map((c) => c.hex), ['#14213d', '#2a6f97']);
  assert.deepEqual(cap.weights, [400, 700]);
  assert.equal(importTokens(JSON.stringify(dtcg), 'brand.json').kind, 'dtcg');
  assert.equal(importTokens(':root{--a:#fff}', 'styles.css').kind, 'css-root');
  assert.equal(importTokens(JSON.stringify({ colors: ['#fff'] }), 'tokens.json').kind, 'capture-tokens');
  assert.throws(() => importTokens('nope', 'x.json'), /not JSON or CSS/);
  const doc = toDtcg(css);
  assert.equal(doc.color.$type, 'color');
  assert.deepEqual(readDtcg(doc).colors.map((c) => c.hex), ['#14213d', '#2a6f97'], 'round trip');
});

test('check / apply: SVG logos, fonts with a readable licence, no TODOs; apply writes the vendor tokens.json + copies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-brand-'));
  const kit = path.join(dir, 'brand');
  assert.equal(main(['import', '--from', writeTmp(dir, 'styles.css', ':root{--ink:#14213d;--accent:#2a6f97;--font-body:"Brand Sans";}'), '--out', kit, '--name', 'Ledgerly']), 0);
  let r = checkKit(kit);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /TODO/.test(p)));
  fs.mkdirSync(path.join(kit, 'logo')); fs.mkdirSync(path.join(kit, 'fonts'));
  fs.writeFileSync(path.join(kit, 'logo', 'light.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  fs.writeFileSync(path.join(kit, 'logo', 'dark.png'), 'PNG');
  fs.writeFileSync(path.join(kit, 'fonts', 'brand.ttf'), ttf());
  fs.writeFileSync(path.join(kit, 'fonts', 'site.ttf'), ttf({ url: null }));
  fs.writeFileSync(path.join(kit, 'brand.md'), brandMdSkeleton({ name: 'Ledgerly', families: [] }).replace(/logo_light: .*/, 'logo_light: logo/light.svg').replace(/logo_dark: .*/, 'logo_dark: logo/dark.png').replace(/fonts:\n {2}\[\]/, 'fonts:\n  - family: Brand Sans\n    files: [fonts/brand.ttf, fonts/site.ttf]'));
  const md = readBrandMd(fs.readFileSync(path.join(kit, 'brand.md'), 'utf8'));
  assert.deepEqual(md.fonts, [{ family: 'Brand Sans', files: ['fonts/brand.ttf', 'fonts/site.ttf'] }]);
  assert.deepEqual(md.locales, ['en']); assert.equal(md.fallback_by_script.latin, 'system-ui');
  r = checkKit(kit);
  assert.deepEqual(r.problems.map((p) => p.replace(/ —.*/, '')).sort(), ['font Brand Sans: fonts/site.ttf carries no licence the plugin can read', 'logo_dark: logo/dark.png is not an SVG'].sort());
  fs.writeFileSync(path.join(kit, 'logo', 'dark.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  fs.writeFileSync(path.join(kit, 'brand.md'), fs.readFileSync(path.join(kit, 'brand.md'), 'utf8').replace('logo/dark.png', 'logo/dark.svg').replace(', fonts/site.ttf', ''));
  r = checkKit(kit);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.deepEqual(r.fonts, [{ family: 'Brand Sans', file: 'fonts/brand.ttf', licence: 'OFL-1.1' }]);
  const proj = path.join(dir, 'project'); fs.mkdirSync(proj);
  const a = applyKit(kit, proj);
  assert.equal(a.ok, true);
  const vendor = JSON.parse(fs.readFileSync(path.join(proj, 'capture', 'extracted', 'tokens.json'), 'utf8'));
  assert.deepEqual(vendor.colors, ['#14213d', '#2a6f97']);
  assert.deepEqual(vendor.fonts.map((f) => f.family), ['Brand Sans']);
  assert.deepEqual(a.copied.sort(), ['assets/brand/logo-dark.svg', 'assets/brand/logo-light.svg', 'assets/fonts/brand.ttf']);
  assert.equal(main(['check', '--brand', kit]), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeTmp(dir, name, text) { const f = path.join(dir, name); fs.writeFileSync(f, text); return f; }
