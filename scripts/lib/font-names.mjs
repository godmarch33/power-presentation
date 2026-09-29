import zlib from 'node:zlib';

const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function base128(buf, pos) {
  let v = 0;
  for (let i = 0; i < 5; i += 1) {
    const b = buf[pos + i];
    if (i === 0 && b === 0x80) throw new Error('woff2: UIntBase128 with a leading zero');
    v = v * 128 + (b & 0x7f);
    if (!(b & 0x80)) return { v, pos: pos + i + 1 };
  }
  throw new Error('woff2: UIntBase128 longer than 5 bytes');
}

export function fontTables(buf, want = ['name', 'OS/2']) {
  const sig = buf.toString('latin1', 0, 4);
  const out = {};
  if (sig === 'wOF2') {
    const numTables = buf.readUInt16BE(12);
    const compressed = buf.readUInt32BE(20);
    let pos = 48;
    const dir = [];
    for (let i = 0; i < numTables; i += 1) {
      const flags = buf[pos]; pos += 1;
      let tag;
      if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', pos, pos + 4); pos += 4; } else tag = WOFF2_TAGS[flags & 0x3f];
      const version = (flags >> 6) & 3;
      const orig = base128(buf, pos); pos = orig.pos;
      const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
      let length = orig.v;
      if (transformed) { const t = base128(buf, pos); pos = t.pos; length = t.v; }
      dir.push({ tag, length });
    }
    if (buf.toString('latin1', 4, 8) === 'ttcf') throw new Error('woff2: font collections are not read');
    const data = zlib.brotliDecompressSync(buf.subarray(pos, pos + compressed));
    let off = 0;
    for (const t of dir) { if (want.includes(t.tag)) out[t.tag] = data.subarray(off, off + t.length); off += t.length; }
    return out;
  }
  if (sig === 'wOFF') {
    const numTables = buf.readUInt16BE(12);
    for (let i = 0; i < numTables; i += 1) {
      const e = 44 + i * 20;
      const tag = buf.toString('latin1', e, e + 4);
      if (!want.includes(tag)) continue;
      const off = buf.readUInt32BE(e + 4), compLen = buf.readUInt32BE(e + 8), origLen = buf.readUInt32BE(e + 12);
      const raw = buf.subarray(off, off + compLen);
      out[tag] = compLen < origLen ? zlib.inflateSync(raw) : raw;
    }
    return out;
  }
  if (sig === '\x00\x01\x00\x00' || sig === 'OTTO' || sig === 'true') {
    const numTables = buf.readUInt16BE(4);
    for (let i = 0; i < numTables; i += 1) {
      const e = 12 + i * 16;
      const tag = buf.toString('latin1', e, e + 4);
      if (want.includes(tag)) out[tag] = buf.subarray(buf.readUInt32BE(e + 8), buf.readUInt32BE(e + 8) + buf.readUInt32BE(e + 12));
    }
    return out;
  }
  throw new Error(`not a font file (signature ${JSON.stringify(sig)})`);
}

export function nameStrings(name) {
  if (!name || name.length < 6) return {};
  const count = name.readUInt16BE(2);
  const strings = name.readUInt16BE(4);
  const best = {};
  for (let i = 0; i < count; i += 1) {
    const r = 6 + i * 12;
    if (r + 12 > name.length) break;
    const platform = name.readUInt16BE(r), encoding = name.readUInt16BE(r + 2), language = name.readUInt16BE(r + 4);
    const id = name.readUInt16BE(r + 6), len = name.readUInt16BE(r + 8), off = name.readUInt16BE(r + 10);
    const raw = name.subarray(strings + off, strings + off + len);
    let text = null;
    let rank = 9;
    if (platform === 3 && (encoding === 1 || encoding === 10)) { text = raw.swap16 ? Buffer.from(raw).swap16().toString('utf16le') : null; rank = language === 0x409 ? 0 : 1; }
    else if (platform === 0) { text = Buffer.from(raw).swap16().toString('utf16le'); rank = 2; }
    else if (platform === 1 && encoding === 0) { text = raw.toString('latin1'); rank = language === 0 ? 3 : 4; }
    if (text === null) continue;
    if (!best[id] || rank < best[id].rank) best[id] = { rank, text };
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.text]));
}

export function fontNames(buf) {
  const t = fontTables(buf);
  const n = nameStrings(t.name);
  const os2 = t['OS/2'];
  return {
    family: n[16] ?? n[1] ?? null,
    licence: n[13] ?? null,
    licence_url: n[14] ?? null,
    fs_type: os2 && os2.length >= 10 ? os2.readUInt16BE(8) : null,
  };
}
