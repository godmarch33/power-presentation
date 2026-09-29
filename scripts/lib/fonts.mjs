import fs from 'node:fs';
import path from 'node:path';
import { fontTables, nameStrings } from './font-names.mjs';

export const STAGED_FONTS_HEADING = '## Staged fonts';
export const FONTS_REL = 'assets/fonts';
export const DEFAULT_WEIGHTS = [400, 700];
export const SUBSET = 'latin';

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset']);
const FONT_EXT = /\.(woff2|woff|ttf|otf)$/i;
const FORMAT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
const STYLE_TAIL = /^(?:thin|hairline|extralight|ultralight|light|regular|normal|book|roman|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic|oblique|variable|vf)*$/;

const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
export const familyKey = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function declaredFamilies(md) {
  const out = new Map();
  let inBlock = false;
  for (const line of String(md ?? '').split(/\r?\n/)) {
    if (/^typography:\s*$/.test(line)) { inBlock = true; continue; }
    if (!inBlock) continue;
    if (/^\S/.test(line)) break;
    const body = /^\s+[\w-]+:\s*\{(.*)\}/.exec(line)?.[1];
    if (!body) continue;
    const fam = /fontFamily:\s*(?:"([^"]+)"|'([^']+)'|([^,}]+))/.exec(body);
    const family = (fam?.[1] ?? fam?.[2] ?? fam?.[3] ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!family || GENERIC.has(family.toLowerCase())) continue;
    const weight = Number(/\bweight:\s*"?(\d{3})/.exec(body)?.[1] ?? 400);
    const italic = /\bitalic:\s*true\b/.test(body);
    const key = familyKey(family);
    const entry = out.get(key) ?? { family, weights: new Set(), italic: new Set() };
    entry.weights.add(weight);
    if (italic) entry.italic.add(weight);
    out.set(key, entry);
  }
  return [...out.values()].map((e) => ({ family: e.family, weights: [...e.weights].sort((a, b) => a - b), italic: [...e.italic].sort((a, b) => a - b) }));
}

function wghtAxis(fvar) {
  if (!fvar || fvar.length < 16) return null;
  const offset = fvar.readUInt16BE(4);
  const count = fvar.readUInt16BE(8);
  const size = fvar.readUInt16BE(10);
  for (let i = 0; i < count; i += 1) {
    const a = offset + i * size;
    if (a + 20 > fvar.length) break;
    if (fvar.toString('latin1', a, a + 4) === 'wght') return [Math.round(fvar.readInt32BE(a + 4) / 65536), Math.round(fvar.readInt32BE(a + 12) / 65536)];
  }
  return null;
}

export function faceOf(buf) {
  const t = fontTables(buf, ['name', 'OS/2', 'fvar']);
  const n = nameStrings(t.name);
  const os2 = t['OS/2'];
  const range = wghtAxis(t.fvar);
  const weight = range ?? (os2 && os2.length >= 6 ? os2.readUInt16BE(4) : null);
  const italic = os2 && os2.length >= 64 ? Boolean(os2.readUInt16BE(62) & 1) : /italic|oblique/i.test(`${n[2] ?? ''} ${n[17] ?? ''}`);
  return { family: n[16] ?? n[1] ?? null, weight, style: italic ? 'italic' : 'normal', variable: Boolean(range) };
}

function weightFromName(file) {
  const s = file.toLowerCase();
  const numeric = /(?:^|[^0-9])([1-9]00)(?![0-9a-z])/.exec(s);
  if (numeric) return Number(numeric[1]);
  if (/black|heavy|ultra|extrabold/.test(s)) return 800;
  if (/semibold|demibold/.test(s)) return 600;
  if (/bold/.test(s)) return 700;
  if (/medium/.test(s)) return 500;
  if (/light|thin/.test(s)) return 300;
  return 400;
}

export function familyOfFace(face, families, file = '') {
  const ranked = [...families].sort((a, b) => familyKey(b).length - familyKey(a).length);
  if (face?.family) {
    const fk = familyKey(face.family);
    return ranked.find((f) => fk.startsWith(familyKey(f)) && STYLE_TAIL.test(fk.slice(familyKey(f).length))) ?? null;
  }
  const stem = familyKey(file.replace(FONT_EXT, ''));
  return ranked.find((f) => stem.startsWith(familyKey(f))) ?? null;
}

export function fontsourceFaces(nodeModules, family) {
  if (!nodeModules) return null;
  const id = String(family).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const dir = path.join(nodeModules, '@fontsource', id);
  const meta = readJson(path.join(dir, 'metadata.json'));
  if (!meta || familyKey(meta.family) !== familyKey(family)) return null;
  const file = (w, style) => {
    const f = path.join(dir, 'files', `${id}-${SUBSET}-${w}-${style}.woff2`);
    return fs.existsSync(f) ? f : null;
  };
  return { id, dir, family: meta.family, license: meta.license?.type ?? null, weights: (meta.weights ?? []).map(Number), styles: meta.styles ?? ['normal'], file };
}

const nearest = (avail, w) => avail.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) || (Math.abs(x - w) === Math.abs(best - w) && x > best) ? x : best), avail[0]);
const covers = (face, w, style) => face.style === style && (Array.isArray(face.weight) ? w >= face.weight[0] && w <= face.weight[1] : face.weight === w);
const cleanName = (family, w, style) => `${family.replace(/[^A-Za-z0-9]/g, '')}-${w}${style === 'italic' ? '-Italic' : ''}.woff2`;

export function fontFaceRule({ family, file, weight, style }) {
  const ext = (/\.([a-z0-9]+)$/i.exec(file)?.[1] ?? 'woff2').toLowerCase();
  const w = Array.isArray(weight) ? `${weight[0]} ${weight[1]}` : weight;
  return `@font-face { font-family: "${family}"; src: url("${FONTS_REL}/${file}") format("${FORMAT[ext] ?? ext}"); font-weight: ${w}; font-style: ${style}; font-display: block; }`;
}

export function stagedFontsSection(rules) {
  return [
    STAGED_FONTS_HEADING,
    '',
    '<!-- written by `render-path packets` from the files in assets/fonts/ (C1); re-run it after a typography change, do not edit by hand -->',
    '',
    'Every family the typography block declares ships as a local file in `assets/fonts/`. Copy these rules verbatim into',
    "each frame's `<style>` — the URLs are root-relative (frames are served from the project root). Never link Google Fonts",
    'and never fall back to a generic family (QA-14); a family you need that is not listed here goes in your return note.',
    '',
    '```css',
    ...rules,
    '```',
    '',
  ].join('\n');
}

export function upsertSection(md, section) {
  const text = String(md ?? '');
  const re = new RegExp(`^${STAGED_FONTS_HEADING}[ \\t]*$`, 'm');
  const m = re.exec(text);
  if (!m) return `${text.replace(/\s*$/, '')}\n\n${section}`;
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  const tail = next < 0 ? '' : `\n${rest.slice(next)}`;
  return `${text.slice(0, m.index)}${section}${tail}`;
}

export function stageFonts(project, { nodeModules = null, dryRun = false } = {}) {
  const framePath = path.join(project, 'frame.md');
  const md = readText(framePath);
  const res = { ok: true, families: [], staged: [], rules: [], missing: [], notes: [], changed: false };
  if (md === null) { res.notes.push('frame.md missing — no fonts staged'); return res; }
  const declared = declaredFamilies(md);
  res.families = declared.map((d) => d.family);
  if (!declared.length) { res.notes.push('frame.md declares no font family (typography block) — no fonts staged'); return res; }
  const dir = path.join(project, ...FONTS_REL.split('/'));
  const local = [];
  let entries = [];
  try { entries = fs.readdirSync(dir).filter((f) => FONT_EXT.test(f)).sort(); } catch { }
  for (const file of entries) {
    let face = null;
    try { face = faceOf(fs.readFileSync(path.join(dir, file))); } catch { face = null; }
    const family = familyOfFace(face, res.families, file);
    if (!family) continue;
    local.push({ family, file, weight: face?.weight ?? weightFromName(file), style: face ? face.style : (/italic|oblique/i.test(file) ? 'italic' : 'normal') });
  }
  const copies = [];
  for (const d of declared) {
    const mine = local.filter((f) => f.family === d.family);
    const pkg = fontsourceFaces(nodeModules, d.family);
    const want = [...new Set([...d.weights, ...(mine.length ? [] : DEFAULT_WEIGHTS)])].flatMap((w) => [[w, 'normal'], ...(d.italic.includes(w) ? [[w, 'italic']] : [])]);
    const added = [];
    for (const [w, style] of want) {
      if ([...mine, ...added].some((f) => covers(f, w, style))) continue;
      const avail = pkg ? pkg.weights.filter((x) => pkg.file(x, style)) : [];
      if (!avail.length) {
        if (mine.length || added.length) res.notes.push(`${d.family} ${w}${style === 'italic' ? ' italic' : ''}: no face in assets/fonts/ or the toolchain — the browser synthesises it`);
        continue;
      }
      const at = nearest(avail, w);
      if ([...mine, ...added].some((f) => covers(f, at, style))) continue;
      if (at !== w) res.notes.push(`${d.family} ${w}: the pinned package has no ${w} — staged ${at}`);
      added.push({ family: d.family, file: cleanName(d.family, at, style), weight: at, style, src: pkg.file(at, style), pkg });
    }
    const faces = [...mine, ...added].sort((a, b) => (Array.isArray(a.weight) ? a.weight[0] : a.weight) - (Array.isArray(b.weight) ? b.weight[0] : b.weight) || a.style.localeCompare(b.style));
    if (!faces.length) { res.missing.push(d.family); continue; }
    copies.push(...added);
    for (const f of faces) res.rules.push(fontFaceRule(f));
  }
  if (res.missing.length) { res.ok = false; return res; }
  for (const f of copies) {
    const dst = path.join(dir, f.file);
    if (!fs.existsSync(dst) && !dryRun) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(f.src, dst);
    }
    res.staged.push(`${FONTS_REL}/${f.file} (@fontsource/${f.pkg.id}, ${f.pkg.license ?? 'licence in the file'})`);
  }
  const next = upsertSection(md, stagedFontsSection(res.rules));
  res.changed = next !== md;
  if (res.changed && !dryRun) fs.writeFileSync(framePath, next);
  return res;
}

export function missingFontsReason(missing) {
  return `frame.md declares ${missing.map((f) => `"${f}"`).join(', ')} with no face in assets/fonts/ or the toolchain's pinned @fontsource packages — `
    + 'run `node scripts/toolchain.mjs install` (FONT_PINS), stage a brand face (brand-kit.mjs apply), or choose a preset whose families are pinned; '
    + 'the frame workers are not dispatched without their fonts (C1, QA-14; no Google Fonts fetch)';
}

export function fontsSummary(res) {
  if (!res.rules.length) return `fonts: ${res.notes[0] ?? 'nothing declared'}`;
  const n = res.families.length;
  return `fonts: ${n} famil${n === 1 ? 'y' : 'ies'} (${res.families.join(', ')}) → ${res.rules.length} @font-face rule(s) in frame.md ${STAGED_FONTS_HEADING}`
    + `${res.staged.length ? `; ${res.staged.length} face(s) staged into ${FONTS_REL}/ from the toolchain` : ''}${res.notes.length ? `; ${res.notes.join('; ')}` : ''}`;
}
