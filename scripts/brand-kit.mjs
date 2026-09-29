import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontNames } from './lib/font-names.mjs';
import { fontLicence } from './media-ledger.mjs';

export const SCHEMA = 'power-presentation/brand-kit@0.1';
const HEX6 = /^#?[0-9a-fA-F]{6}$/;

export function toHex(value) {
  const v = String(value ?? '').trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return `#${m[1].split('').map((c) => c + c).join('')}`;
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) return `#${m[1]}`;
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return `#${[m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, Math.round(Number(x)))).toString(16).padStart(2, '0')).join('')}`;
  return null;
}

function dtcgColor(value) {
  if (typeof value === 'string') return toHex(value);
  if (value && typeof value === 'object') {
    if (value.hex) return toHex(value.hex);
    if (Array.isArray(value.components) && (!value.colorSpace || value.colorSpace === 'srgb')) return toHex(`rgb(${value.components.map((c) => Math.round(Number(c) * 255)).join(',')})`);
  }
  return null;
}

export function readDtcg(tree) {
  const out = { colors: [], families: [], weights: [] };
  const walk = (node, name, inherited) => {
    if (!node || typeof node !== 'object') return;
    const type = node.$type ?? inherited;
    if ('$value' in node) {
      if (type === 'color') { const hex = dtcgColor(node.$value); if (hex) out.colors.push({ name, hex }); }
      else if (type === 'fontFamily') { const f = Array.isArray(node.$value) ? node.$value[0] : node.$value; if (f) out.families.push({ name, family: String(f).replace(/['"]/g, '').trim() }); }
      else if (type === 'fontWeight') { const w = Number(node.$value); if (Number.isFinite(w)) out.weights.push(w); }
      return;
    }
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) walk(v, name ? `${name}.${k}` : k, type);
  };
  walk(tree, '', undefined);
  return out;
}

export function readCssRoot(css) {
  const out = { colors: [], families: [], weights: [] };
  for (const block of String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const d of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);?/g)) {
      const [, name, raw] = d;
      const value = raw.trim();
      const hex = toHex(value);
      if (hex) out.colors.push({ name, hex });
      else if (/weight/i.test(name) && Number.isFinite(Number(value))) out.weights.push(Number(value));
      else if (/font|family|typeface/i.test(name)) out.families.push({ name, family: value.split(',')[0].replace(/['"]/g, '').trim() });
    }
  }
  return out;
}

export function readCaptureTokens(t) {
  const out = { colors: [], families: [], weights: [] };
  const bare = (x) => (/^[0-9a-f]{6}$/i.test(String(x ?? '').trim()) ? `#${String(x).trim()}` : x);
  (t?.colors ?? []).forEach((c, i) => { const hex = toHex(bare(typeof c === 'string' ? c : (c?.hex ?? c?.value))); if (hex) out.colors.push({ name: `c${i + 1}`, hex }); });
  (t?.fonts ?? []).forEach((f, i) => {
    const family = typeof f === 'string' ? f : (f?.family ?? f?.name);
    if (family) out.families.push({ name: i === 0 ? 'display' : `f${i + 1}`, family: String(family).split(',')[0].replace(/['"]/g, '').trim() });
    for (const w of Array.isArray(f?.weights) ? f.weights : []) if (Number.isFinite(Number(w))) out.weights.push(Number(w));
  });
  return out;
}

export function importTokens(text, filename = '') {
  if (/\.css$/i.test(filename) || /:root\s*\{/.test(text)) return { kind: 'css-root', tokens: readCssRoot(text) };
  let j;
  try { j = JSON.parse(text); } catch (err) { throw new Error(`not JSON or CSS (${err.message})`); }
  if (Array.isArray(j?.colors) || Array.isArray(j?.fonts)) return { kind: 'capture-tokens', tokens: readCaptureTokens(j) };
  return { kind: 'dtcg', tokens: readDtcg(j) };
}

export function toDtcg(tokens) {
  const doc = { $description: 'brand kit — DTCG (written by scripts/brand-kit.mjs import)', color: { $type: 'color' }, font: { family: { $type: 'fontFamily' }, weight: { $type: 'fontWeight' } } };
  const seen = new Set();
  for (const c of tokens.colors) {
    const key = String(c.name).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || `c${seen.size + 1}`;
    if (seen.has(c.hex)) continue;
    seen.add(c.hex);
    doc.color[key] = { $value: c.hex };
  }
  const fams = [...new Map(tokens.families.map((f) => [f.family, f])).values()];
  fams.forEach((f, i) => { doc.font.family[i === 0 ? 'display' : i === 1 ? 'body' : `f${i + 1}`] = { $value: f.family }; });
  [...new Set(tokens.weights)].sort((a, b) => a - b).forEach((w) => { doc.font.weight[`w${w}`] = { $value: w }; });
  return doc;
}

export function brandMdSkeleton({ name, families }) {
  return [
    '---',
    `name: ${name ?? 'TODO(brand name)'}`,
    'locales: [en]',
    'logo_light: TODO(logo/light.svg — the logo for light grounds, SVG)',
    'logo_dark: TODO(logo/dark.svg — the logo for dark grounds, SVG)',
    'fonts:',
    ...(families.length ? families.map((f) => `  - family: ${f}\n files: # TODO(fonts/<file>.woff2 — the licence is read from the file)`) : ['  []']),
    'fallback_by_script:',
    '  latin: system-ui',
    '---',
    '',
    '<!-- brand kit. The video is English only: locales is recorded, not used. Fill every TODO; `brand-kit.mjs check` refuses a kit with open TODOs. -->',
    '',
  ].join('\n');
}

export function readBrandMd(text) {
  const fm = String(text ?? '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = { name: null, locales: [], logo_light: null, logo_dark: null, fonts: [], fallback_by_script: {} };
  if (!fm) return out;
  const lines = fm[1].split(/\r?\n/);
  let section = null;
  let font = null;
  for (const line of lines) {
    const top = line.match(/^([a-z_]+):\s*(.*)$/);
    if (top) {
      section = top[1];
      const v = top[2].replace(/\s+#.*$/, '').trim();
      if (section === 'locales') out.locales = v.replace(/[[\]]/g, '').split(',').map((x) => x.trim()).filter(Boolean);
      else if (['name', 'logo_light', 'logo_dark'].includes(section)) out[section] = v || null;
      continue;
    }
    if (section === 'fonts') {
      const fam = line.match(/^\s*-\s*family:\s*(.+)$/);
      if (fam) { font = { family: fam[1].trim(), files: [] }; out.fonts.push(font); continue; }
      const files = line.match(/^\s*files:\s*\[(.*)\]/);
      if (files && font) font.files = files[1].split(',').map((x) => x.replace(/['"]/g, '').trim()).filter(Boolean);
      const item = line.match(/^\s*-\s+([^:]+)$/);
      if (item && font && !fam) font.files.push(item[1].trim());
    }
    if (section === 'fallback_by_script') {
      const kv = line.match(/^\s+([a-z]+):\s*(.+)$/);
      if (kv) out.fallback_by_script[kv[1]] = kv[2].trim();
    }
  }
  return out;
}

export function checkKit(dir) {
  const problems = [];
  const tokFile = path.join(dir, 'brand.tokens.json');
  const mdFile = path.join(dir, 'brand.md');
  let tokens = { colors: [], families: [], weights: [] };
  if (!fs.existsSync(tokFile)) problems.push('brand.tokens.json missing');
  else { try { tokens = readDtcg(JSON.parse(fs.readFileSync(tokFile, 'utf8'))); } catch (err) { problems.push(`brand.tokens.json is not JSON: ${err.message}`); } }
  if (fs.existsSync(tokFile) && !tokens.colors.length) problems.push('brand.tokens.json has no colour token');
  const md = fs.existsSync(mdFile) ? readBrandMd(fs.readFileSync(mdFile, 'utf8')) : null;
  if (!md) problems.push('brand.md missing (locales, logo light/dark, fonts with licence class, fallback_by_script)');
  const fonts = [];
  if (md) {
    if (/TODO\(/.test(fs.readFileSync(mdFile, 'utf8').split(/\r?\n---/)[0])) problems.push('brand.md still has TODO(...) fields');
    for (const k of ['logo_light', 'logo_dark']) {
      const v = md[k];
      if (!v || /^TODO/.test(v)) continue;
      const f = path.join(dir, v);
      if (!fs.existsSync(f)) problems.push(`${k}: ${v} not found`);
      else if (!/\.svg$/i.test(f) || !/<svg[\s>]/i.test(fs.readFileSync(f, 'utf8').slice(0, 4096))) problems.push(`${k}: ${v} is not an SVG`);
    }
    for (const font of md.fonts) {
      for (const rel of font.files) {
        const f = path.join(dir, rel);
        if (!fs.existsSync(f)) { problems.push(`font ${font.family}: ${rel} not found`); continue; }
        let lic = null;
        try { lic = fontLicence(fontNames(fs.readFileSync(f))); } catch (err) { problems.push(`font ${font.family}: ${rel} unreadable (${err.message})`); continue; }
        fonts.push({ family: font.family, file: rel, licence: lic ?? 'unknown' });
        if (!lic) problems.push(`font ${font.family}: ${rel} carries no licence the plugin can read — unknown never ships; use an OFL face or record the licence in the media ledger`);
        else if (lic === 'restricted') problems.push(`font ${font.family}: ${rel} is restricted-embedding — never; substitute an OFL face`);
      }
    }
  }
  return { ok: problems.length === 0, problems, colors: tokens.colors.length, families: tokens.families.map((f) => f.family), fonts, locales: md?.locales ?? [] };
}

export function applyKit(dir, project) {
  const check = checkKit(dir);
  if (!check.ok) return { ok: false, problems: check.problems };
  const tokens = readDtcg(JSON.parse(fs.readFileSync(path.join(dir, 'brand.tokens.json'), 'utf8')));
  const md = readBrandMd(fs.readFileSync(path.join(dir, 'brand.md'), 'utf8'));
  const weights = [...new Set(tokens.weights)].sort((a, b) => a - b);
  const vendor = {
    colors: tokens.colors.map((c) => c.hex),
    fonts: tokens.families.map((f) => ({ family: f.family, weights })),
    source: `brand kit ${path.basename(path.resolve(dir))} (scripts/brand-kit.mjs apply)`,
  };
  const tokOut = path.join(project, 'capture', 'extracted', 'tokens.json');
  fs.mkdirSync(path.dirname(tokOut), { recursive: true });
  fs.writeFileSync(tokOut, `${JSON.stringify(vendor, null, 2)}\n`);
  const copied = [];
  for (const font of md.fonts) for (const rel of font.files) {
    const dst = path.join(project, 'assets', 'fonts', path.basename(rel));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(dir, rel), dst);
    copied.push(path.relative(project, dst));
  }
  for (const k of ['logo_light', 'logo_dark']) {
    const dst = path.join(project, 'assets', 'brand', `${k.replace('logo_', 'logo-')}.svg`);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(dir, md[k]), dst);
    copied.push(path.relative(project, dst));
  }
  return { ok: true, tokens: path.relative(project, tokOut), colors: vendor.colors.length, fonts: vendor.fonts.map((f) => f.family), copied };
}

export const USAGE = `brand-kit.mjs — the brand kit: import, check, apply (the vendor's build-frame.mjs remixes --preset onto it)

Usage:
  node scripts/brand-kit.mjs import --from <tokens.json|styles.css> --out brand/ [--name <brand>]
  node scripts/brand-kit.mjs check  --brand brand/ [--json]
  node scripts/brand-kit.mjs apply  --brand brand/ --project <dir>

Importers (MVP): DTCG JSON, a hyperframes capture tokens.json, CSS :root custom properties. Figma / PDF — v1.
Exit codes: 0 ok · 3 the kit has problems · 2 usage · 1 unreadable input`;

export function parseArgs(argv) {
  const opts = { command: null, from: null, out: 'brand', name: null, brand: null, project: '.', json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--from') opts.from = argv[++i] ?? null;
    else if (a === '--out') opts.out = argv[++i] ?? opts.out;
    else if (a === '--name') opts.name = argv[++i] ?? null;
    else if (a === '--brand') opts.brand = argv[++i] ?? null;
    else if (a === '--project') opts.project = argv[++i] ?? '.';
    else if (a === '--json') opts.json = true;
    else if (['import', 'check', 'apply'].includes(a) && !opts.command) opts.command = a;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (opts.command === 'import' && !opts.from) throw new Error('import needs --from <file>');
  if ((opts.command === 'check' || opts.command === 'apply') && !opts.brand) throw new Error(`${opts.command} needs --brand <dir>`);
  return opts;
}

export function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { console.error(`${err.message}\n\n${USAGE}`); return 2; }
  if (opts.help || !opts.command) { console.log(USAGE); return opts.help ? 0 : 2; }
  if (opts.command === 'import') {
    let text;
    try { text = fs.readFileSync(opts.from, 'utf8'); } catch (err) { console.error(`cannot read --from ${opts.from}: ${err.message}`); return 1; }
    let r;
    try { r = importTokens(text, opts.from); } catch (err) { console.error(`--from ${opts.from}: ${err.message}`); return 1; }
    fs.mkdirSync(opts.out, { recursive: true });
    fs.writeFileSync(path.join(opts.out, 'brand.tokens.json'), `${JSON.stringify(toDtcg(r.tokens), null, 2)}\n`);
    const mdFile = path.join(opts.out, 'brand.md');
    if (!fs.existsSync(mdFile)) fs.writeFileSync(mdFile, brandMdSkeleton({ name: opts.name, families: [...new Set(r.tokens.families.map((f) => f.family))] }));
    console.log(`brand-kit import (${r.kind}): ${r.tokens.colors.length} colour(s), ${new Set(r.tokens.families.map((f) => f.family)).size} font famil(ies) → ${path.join(opts.out, 'brand.tokens.json')}; fill ${mdFile} (logos, font files), then check`);
    return 0;
  }
  if (opts.command === 'check') {
    const r = checkKit(opts.brand);
    if (opts.json) console.log(JSON.stringify({ schema: SCHEMA, ...r }, null, 2));
    else {
      console.log(`brand-kit check: ${r.ok ? 'ok' : `${r.problems.length} problem(s)`} — ${r.colors} colour(s), families ${r.families.join(', ') || 'none'}`);
      for (const p of r.problems) console.log(`  FAIL ${p}`);
    }
    return r.ok ? 0 : 3;
  }
  const r = applyKit(opts.brand, path.resolve(opts.project));
  if (!r.ok) { for (const p of r.problems) console.log(`  FAIL ${p}`); return 3; }
  console.log(`brand-kit apply: ${r.tokens} (${r.colors} colour(s), fonts ${r.fonts.join(', ')}); copied ${r.copied.join(', ')} — now build-frame.mjs remixes the preset`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
