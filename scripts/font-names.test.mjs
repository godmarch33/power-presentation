import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fontNames, fontTables, nameStrings } from './lib/font-names.mjs';

function nameTable(records) {
  const bufs = records.map((r) => (r.platform === 1 ? Buffer.from(r.text, 'latin1') : Buffer.from(r.text, 'utf16le').swap16()));
  const head = Buffer.alloc(6 + records.length * 12);
  head.writeUInt16BE(0, 0); head.writeUInt16BE(records.length, 2); head.writeUInt16BE(head.length, 4);
  let off = 0;
  records.forEach((r, i) => {
    const o = 6 + i * 12;
    head.writeUInt16BE(r.platform, o); head.writeUInt16BE(r.encoding, o + 2); head.writeUInt16BE(r.language, o + 4);
    head.writeUInt16BE(r.id, o + 6); head.writeUInt16BE(bufs[i].length, o + 8); head.writeUInt16BE(off, o + 10);
    off += bufs[i].length;
  });
  return Buffer.concat([head, ...bufs]);
}
const os2 = (fsType) => { const b = Buffer.alloc(78); b.writeUInt16BE(fsType, 8); return b; };

function sfnt(tables) {
  const tags = Object.keys(tables).sort();
  const dir = Buffer.alloc(12 + tags.length * 16);
  dir.writeUInt32BE(0x00010000, 0); dir.writeUInt16BE(tags.length, 4);
  let off = dir.length;
  const bodies = [];
  tags.forEach((tag, i) => {
    const e = 12 + i * 16;
    dir.write(tag, e, 'latin1'); dir.writeUInt32BE(off, e + 8); dir.writeUInt32BE(tables[tag].length, e + 12);
    const padded = Buffer.concat([tables[tag], Buffer.alloc((4 - (tables[tag].length % 4)) % 4)]);
    bodies.push(padded); off += padded.length;
  });
  return Buffer.concat([dir, ...bodies]);
}

function woff1(tables) {
  const tags = Object.keys(tables).sort();
  const head = Buffer.alloc(44 + tags.length * 20);
  head.write('wOFF', 0, 'latin1'); head.writeUInt32BE(0x00010000, 4); head.writeUInt16BE(tags.length, 12);
  let off = head.length;
  const bodies = [];
  tags.forEach((tag, i) => {
    const z = zlib.deflateSync(tables[tag]);
    const body = z.length < tables[tag].length ? z : tables[tag];
    const e = 44 + i * 20;
    head.write(tag, e, 'latin1'); head.writeUInt32BE(off, e + 4); head.writeUInt32BE(body.length, e + 8); head.writeUInt32BE(tables[tag].length, e + 12);
    bodies.push(body); off += body.length;
  });
  return Buffer.concat([head, ...bodies]);
}

function woff2(tables) {
  const idx = { name: 5, 'OS/2': 6, head: 1 };
  const tags = Object.keys(tables);
  const dir = [];
  for (const tag of tags) {
    const len = tables[tag].length;
    const b128 = [];
    let v = len;
    do { b128.unshift(v & 0x7f); v = Math.floor(v / 128); } while (v > 0);
    dir.push(Buffer.from([idx[tag], ...b128.map((x, i) => (i < b128.length - 1 ? x | 0x80 : x))]));
  }
  const stream = zlib.brotliCompressSync(Buffer.concat(tags.map((t) => tables[t])));
  const head = Buffer.alloc(48);
  head.write('wOF2', 0, 'latin1'); head.writeUInt32BE(0x00010000, 4); head.writeUInt16BE(tags.length, 12); head.writeUInt32BE(stream.length, 20);
  return Buffer.concat([head, ...dir, stream]);
}

const TABLES = {
  name: nameTable([
    { platform: 1, encoding: 0, language: 0, id: 1, text: 'Mac Family' },
    { platform: 3, encoding: 1, language: 0x409, id: 1, text: 'Test Sans' },
    { platform: 3, encoding: 1, language: 0x409, id: 13, text: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.' },
    { platform: 3, encoding: 1, language: 0x409, id: 14, text: 'https://openfontlicense.org' },
  ]),
  'OS/2': os2(8),
};

test('fontNames(): the same licence strings from sfnt, WOFF and WOFF2 containers; Windows English wins over Mac Roman', () => {
  const want = { family: 'Test Sans', licence: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.', licence_url: 'https://openfontlicense.org', fs_type: 8 };
  assert.deepEqual(fontNames(sfnt(TABLES)), want, 'sfnt');
  assert.deepEqual(fontNames(woff1(TABLES)), want, 'woff');
  assert.deepEqual(fontNames(woff2(TABLES)), want, 'woff2');
});

test('fontNames(): a subset without ID 13 / 14 or OS/2 gives nulls, not a guess; a non-font throws', () => {
  const bare = { name: nameTable([{ platform: 1, encoding: 0, language: 0, id: 1, text: 'Bare' }]) };
  assert.deepEqual(fontNames(woff2(bare)), { family: 'Bare', licence: null, licence_url: null, fs_type: null });
  assert.deepEqual(nameStrings(null), {});
  assert.throws(() => fontTables(Buffer.from('GIF89a......')), /not a font file/);
});

const LATO = '/usr/share/fonts/truetype/lato/Lato-Regular.ttf';
test('fontNames(): a real TrueType font on this machine', { skip: !fs.existsSync(LATO) && 'Lato not installed' }, () => {
  const n = fontNames(fs.readFileSync(LATO));
  assert.equal(n.family, 'Lato');
  assert.match(`${n.licence} ${n.licence_url}`, /Open Font License|OFL/i);
});
