import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontNames } from './lib/font-names.mjs';
import { MEDIA_PACKS } from './media-packs.mjs';

export const SCHEMA = 'power-presentation/media-ledger@0.1';
export const LEDGER = ['.media', 'manifest.jsonl'];
export const RECORDED_BY = 'power-presentation/media-ledger';
export const MEDIA_ROOTS = ['assets', '.media'];

export const TYPE_BY_EXT = Object.freeze({
  '.mp4': 'video', '.webm': 'video', '.mov': 'video', '.m4v': 'video',
  '.wav': 'audio', '.mp3': 'audio', '.m4a': 'audio', '.aac': 'audio', '.ogg': 'audio', '.opus': 'audio', '.flac': 'audio',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.svg': 'image', '.avif': 'image',
  '.woff2': 'font', '.woff': 'font', '.ttf': 'font', '.otf': 'font',
});

export const LICENCES = Object.freeze({
  'own-capture': { ok: true, note: 'the user\'s own product, captured by record-flow' },
  generated: { ok: true, note: 'generated locally by the plugin (path); synthetic media carry flags' },
  'OFL-1.1': { ok: true, note: 'SIL Open Font License' },
  'Apache-2.0': { ok: true },
  'CC0-1.0': { ok: true },
  'CC-BY-4.0': { ok: true, credit: true, note: 'a credit line is required (table)' },
  Pixabay: { ok: true, note: 'runtime only through media-use — never redistributed in a pack (table)' },
  'CC-BY-NC-4.0': { ok: false, note: 'not for commercial output — every plugin mode is commercial' },
  restricted: { ok: false, note: 'restricted embedding / site font — never; OFL substitute' },
  unknown: { ok: false, note: 'unknown licence blocks the render' },
});

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

export function readLedger(project) {
  const file = path.join(project, ...LEDGER);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function writeLedger(project, records) {
  const file = path.join(project, ...LEDGER);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
  fs.renameSync(tmp, file);
}

export function projectMedia(project) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(project, rel);
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = path.posix.join(rel, e.name);
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && TYPE_BY_EXT[path.extname(e.name).toLowerCase()]) out.push(r);
    }
  };
  for (const root of MEDIA_ROOTS) walk(root);
  return out.sort();
}

export function fontLicence(names) {
  const text = `${names?.licence ?? ''} ${names?.licence_url ?? ''}`;
  if (names?.fs_type != null && (names.fs_type & 0x000e) === 0x0002) return 'restricted';
  if (/open font licen[cs]e|\bOFL\b|openfontlicense\.org|scripts\.sil\.org\/OFL/i.test(text)) return 'OFL-1.1';
  if (/apache licen[cs]e|apache\.org\/licenses/i.test(text)) return 'Apache-2.0';
  return null;
}

let PACK_SHA = null;
export function packFileBySha(sha) {
  if (!PACK_SHA) {
    PACK_SHA = new Map();
    for (const p of MEDIA_PACKS) for (const f of p.files) if (f.sha256) PACK_SHA.set(f.sha256, { pack: p.id, file: f.file, license: p.licence, credit: p.credit(f), type: p.kind === 'music' ? 'bgm' : p.kind });
  }
  return PACK_SHA.get(sha) ?? null;
}

export function pluginProducts(project) {
  const known = {};
  const audio = readJson(path.join(project, 'audio_meta.json'));
  for (const v of audio?.voices ?? []) {
    if (!v?.path) continue;
    known[v.path] = { license: 'generated', type: 'voice', synthetic: 'voice', description: `VO line, frame ${v.frame ?? '?'}`, provenance: { provider: audio.tts_provider ?? 'kokoro', voice: audio.voice ?? v.voice ?? null, stage: 'render-path audio' } };
  }
  for (const c of Array.isArray(audio?.sfx) ? audio.sfx : []) {
    if (c?.file && c.pack && c.licence) known[c.file] = { license: c.licence, type: 'sfx', description: `SFX ${c.cue ?? ''} (${c.use ?? ''})`.trim(), provenance: { provider: `media pack ${c.pack}` } };
  }
  const music = readJson(path.join(project, '.media', 'pp-music.json'));
  if (music?.file) {
    const lic = /cc[- ]?by[- ]?4/i.test(String(music.licence ?? '')) ? 'CC-BY-4.0' : /cc0/i.test(String(music.licence ?? '')) ? 'CC0-1.0' : 'unknown';
    known[music.file] = { license: lic, credit: music.credit ?? null, type: 'bgm', description: 'music bed', provenance: { provider: music.pack ? `media pack ${music.pack}` : 'local file (--bgm)', licence_declared: music.licence ?? null } };
  }
  const cap = readJson(path.join(project, '.media', 'capture', 'capture-manifest.json'));
  if (cap && !cap.blocked) {
    const prov = { provider: 'record-flow', backend: cap.capture?.backend ?? null, url: cap.url ?? null, tier: cap.tier ?? null };
    for (const rel of ['.media/capture/footage.mp4', 'assets/footage.mp4', '.media/capture/demo.mp4', 'assets/demo.mp4']) {
      known[rel] = { license: 'own-capture', type: 'video', description: 'product capture', provenance: prov };
    }
    const capDir = path.join(project, '.media', 'capture');
    const listed = new Set((Array.isArray(cap.artifacts) ? cap.artifacts : []).map((a) => String(a).replace(/\/+$/, '')));
    const walk = (abs) => (fs.statSync(abs).isDirectory() ? fs.readdirSync(abs).sort().flatMap((n) => walk(path.join(abs, n))) : [abs]);
    for (const f of walk(capDir)) {
      const inCap = path.relative(capDir, f).split(path.sep).join('/');
      const rel = path.relative(project, f).split(path.sep).join('/');
      known[rel] ??= { license: 'own-capture', description: listed.has(inCap) || listed.has(inCap.split('/')[0]) ? `capture artifact ${inCap}` : `derived from the capture: ${inCap}`, provenance: prov };
    }
  }
  const footage = path.join(project, 'assets', 'footage.mp4');
  const clipsDir = path.join(project, 'assets', 'clips');
  if (known['assets/footage.mp4'] && fs.existsSync(footage) && fs.existsSync(clipsDir)) {
    const footageSha = sha256File(footage);
    for (const name of fs.readdirSync(clipsDir).filter((n) => n.endsWith('.mp4')).sort()) {
      const meta = readJson(path.join(clipsDir, `${name}.json`));
      if (meta?.footage_sha256 !== footageSha) continue;
      const base = known['assets/footage.mp4'];
      known[`assets/clips/${name}`] = { ...base, description: `held clip ${meta.a}–${meta.b} s +${meta.hold} s of the product capture`, provenance: { ...base.provenance, derived_from: 'assets/footage.mp4', window: [meta.a, meta.b], hold: meta.hold } };
    }
  }
  return known;
}

function nextId(records, type) {
  let max = 0;
  for (const r of records) {
    const m = r.type === type ? String(r.id ?? '').match(new RegExp(`^${type}_(\\d+)$`)) : null;
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${type}_${String(max + 1).padStart(3, '0')}`;
}

export function freezeLedger(project, opts = {}) {
  const now = opts.now ?? new Date().toISOString();
  const refreeze = new Set((opts.refreeze ?? []).map((p) => p.split(path.sep).join('/')));
  const products = opts.products ?? pluginProducts(project);
  const records = readLedger(project).map((r) => ({ ...r }));
  const byPath = new Map(records.filter((r) => r.path).map((r) => [r.path, r]));
  const changes = [];
  for (const rel of projectMedia(project)) {
    const abs = path.join(project, rel);
    const sha = sha256File(abs);
    const bytes = fs.statSync(abs).size;
    const product = products[rel] ?? null;
    let rec = byPath.get(rel);
    if (!rec) {
      const kind = TYPE_BY_EXT[path.extname(rel).toLowerCase()];
      const type = product?.type ?? (kind === 'audio' ? 'sfx' : kind);
      rec = { id: nextId(records, type), type, path: rel, source: product ? 'power-presentation' : 'existing', description: product?.description ?? path.basename(rel) };
      if (product?.provenance) rec.provenance = product.provenance;
      rec.recorded_by = RECORDED_BY;
      records.push(rec);
      byPath.set(rel, rec);
      changes.push({ path: rel, change: 'added' });
    }
    if (!rec.sha256) {
      rec.sha256 = sha; rec.bytes = bytes; rec.frozen_at = now;
      if (rec.recorded_by !== RECORDED_BY) { rec.frozen_by = RECORDED_BY; changes.push({ path: rel, change: 'hashed' }); }
    }
    else if (rec.sha256 !== sha) {
      if (product || refreeze.has(rel)) { changes.push({ path: rel, change: 'refrozen', from: rec.sha256 }); rec.sha256 = sha; rec.bytes = bytes; rec.frozen_at = now; }
      else changes.push({ path: rel, change: 'drift', frozen: rec.sha256, now: sha });
    }
    if (rec.license === 'unknown' && !rec.license_evidence && product?.license) {
      delete rec.license;
      if (rec.source === 'existing' && rec.recorded_by === RECORDED_BY) { rec.source = 'power-presentation'; rec.description = product.description ?? rec.description; }
      if (product.provenance && !rec.provenance) rec.provenance = product.provenance;
    }
    if (!rec.license) {
      let lic = product?.license ?? null;
      let evidence = product ? 'plugin product' : null;
      const pack = lic ? null : packFileBySha(rec.sha256 ?? sha);
      if (pack) {
        lic = pack.license;
        evidence = `media pack ${pack.pack}: sha256 matches ${pack.file}`;
        if (pack.license !== 'CC0-1.0' && !rec.credit) rec.credit = pack.credit;
        if (!rec.provenance) rec.provenance = { provider: `media pack ${pack.pack}`, file: pack.file };
      }
      if (!lic && TYPE_BY_EXT[path.extname(rel).toLowerCase()] === 'font') {
        try {
          const names = fontNames(fs.readFileSync(abs));
          lic = fontLicence(names);
          if (lic) evidence = `font name table: ${names.licence_url ?? names.licence}`;
          rec.font = { family: names.family, fs_type: names.fs_type };
        } catch (err) { rec.font = { error: err.message }; }
      }
      rec.license = lic ?? 'unknown';
      if (evidence) rec.license_evidence = evidence;
    }
    if (product?.synthetic && !rec.synthetic) rec.synthetic = product.synthetic;
    if (product?.credit && !rec.credit) rec.credit = product.credit;
  }
  for (const r of records) {
    if (r.path && !fs.existsSync(path.join(project, r.path))) changes.push({ path: r.path, change: 'missing' });
  }
  return { records, changes };
}

export function ledgerProblems(records, changes = []) {
  const problems = [];
  for (const r of records) {
    if (!r.path) continue;
    const lic = LICENCES[r.license];
    if (!lic) problems.push({ path: r.path, problem: 'licence', detail: `licence "${r.license}" is not a class the gate knows (${Object.keys(LICENCES).join(', ')})` });
    else if (!lic.ok) problems.push({ path: r.path, problem: 'licence', detail: `${r.license}: ${lic.note}` });
    else if (lic.credit && !(r.credit || r.credit_line)) problems.push({ path: r.path, problem: 'credit', detail: `${r.license} needs a credit line (media-ledger set-license … --credit)` });
    if (!r.sha256) problems.push({ path: r.path, problem: 'unfrozen', detail: 'no sha256' });
  }
  for (const c of changes) {
    if (c.change === 'drift') problems.push({ path: c.path, problem: 'drift', detail: `bytes changed since the freeze (${c.frozen.slice(0, 12)} → ${c.now.slice(0, 12)}); --refreeze it if the change is intended` });
    if (c.change === 'missing') problems.push({ path: c.path, problem: 'missing', detail: 'ledgered file is gone' });
  }
  return problems;
}

export function licenceSummary(records) {
  const n = {};
  for (const r of records) if (r.path) n[r.license ?? 'unknown'] = (n[r.license ?? 'unknown'] ?? 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, v]) => `${k} ×${v}`).join(', ');
}

export function freezeProject(project, opts = {}) {
  const { records, changes } = freezeLedger(project, opts);
  if (!opts.dryRun) writeLedger(project, records);
  return { records, changes, problems: ledgerProblems(records, changes), summary: licenceSummary(records) };
}

export const USAGE = `media-ledger.mjs — freeze the project's media with sha256 + licence and gate unknown licences

Usage:
  node scripts/media-ledger.mjs freeze [--project <dir>] [--refreeze <path>]... [--json]
  node scripts/media-ledger.mjs check  [--project <dir>] [--json]
  node scripts/media-ledger.mjs set-license <path> <licence> [--credit "<line>"] [--source <url>] [--project <dir>]

Licences: ${Object.keys(LICENCES).join(', ')}
Exit codes: 0 ok · 3 the gate found problems · 2 usage · 1 unreadable input`;

export function parseArgs(argv) {
  const opts = { command: null, project: '.', refreeze: [], json: false, help: false, path: null, license: null, credit: null, source: null };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--project') opts.project = argv[++i] ?? '.';
    else if (a === '--refreeze') opts.refreeze.push(argv[++i] ?? '');
    else if (a === '--credit') opts.credit = argv[++i] ?? null;
    else if (a === '--source') opts.source = argv[++i] ?? null;
    else if (a === '--json') opts.json = true;
    else if (!a.startsWith('-')) rest.push(a);
    else throw new Error(`unknown argument: ${a}`);
  }
  opts.command = rest.shift() ?? null;
  if (opts.command && !['freeze', 'check', 'set-license'].includes(opts.command)) throw new Error(`unknown command: ${opts.command}`);
  if (opts.command === 'set-license') {
    [opts.path, opts.license] = rest;
    if (!opts.path || !opts.license) throw new Error('set-license needs <path> <licence>');
    if (!LICENCES[opts.license]) throw new Error(`unknown licence ${opts.license} (one of ${Object.keys(LICENCES).join(', ')})`);
  } else if (rest.length) throw new Error(`unexpected argument: ${rest[0]}`);
  return opts;
}

export function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { console.error(`${err.message}\n\n${USAGE}`); return 2; }
  if (opts.help || !opts.command) { console.log(USAGE); return opts.help ? 0 : 2; }
  const project = path.resolve(opts.project);
  if (!fs.existsSync(project)) { console.error(`no project at ${project}`); return 1; }
  if (opts.command === 'set-license') {
    const rel = path.relative(project, path.resolve(project, opts.path)).split(path.sep).join('/');
    const { records } = freezeLedger(project);
    const rec = records.find((r) => r.path === rel);
    if (!rec) { console.error(`${rel} is not a media file of this project`); return 1; }
    rec.license = opts.license;
    rec.license_evidence = 'set by hand (media-ledger set-license)';
    if (opts.credit) rec.credit = opts.credit;
    if (opts.source) rec.source_url = opts.source;
    writeLedger(project, records);
    console.log(`media-ledger: ${rel} → ${opts.license}${opts.credit ? ` (credit: ${opts.credit})` : ''}`);
    return 0;
  }
  const r = freezeProject(project, { refreeze: opts.refreeze, dryRun: opts.command === 'check' });
  if (opts.json) console.log(JSON.stringify({ schema: SCHEMA, project, ok: r.problems.length === 0, summary: r.summary, changes: r.changes, problems: r.problems }, null, 2));
  else {
    console.log(`media-ledger ${opts.command}: ${r.records.filter((x) => x.path).length} asset(s) — ${r.summary || 'none'}${r.changes.length ? `; ${r.changes.length} change(s)` : ''}`);
    for (const c of r.changes) console.log(`  ${c.change.padEnd(8)} ${c.path}`);
    for (const p of r.problems) console.log(`  FAIL ${p.problem} ${p.path}: ${p.detail}`);
  }
  return r.problems.length ? 3 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
