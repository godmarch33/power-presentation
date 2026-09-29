import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RETENTION_DAYS = 30;
export const RETENTION_FILE = ['.hyperframes', 'prospect-retention.json'];
export const SCHEMA = 'power-presentation/prospect-retention@0.1';
export const REMOVED = '[removed after 30 days]';
export const PROSPECT_FIELDS = Object.freeze(['name', 'company', 'role', 'site', 'website', 'url']);
export const TEXT_EXTS = new Set(['.md', '.json', '.jsonl', '.yaml', '.yml', '.txt', '.html', '.htm', '.srt', '.vtt', '.css', '.js', '.mjs']);
export const BINARY_EXTS = new Set(['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg', '.webp', '.wav', '.mp3', '.m4a', '.aac']);
const SKIP_DIRS = new Set(['node_modules', '.git']);
const DAY_MS = 24 * 60 * 60 * 1000;

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export function declaredProspect(project) {
  const intake = readJson(path.join(project, 'intake.json'));
  const p = intake?.declared?.prospect;
  const rel = typeof p === 'string' ? p : (p?.value ?? null);
  return rel ? path.resolve(project, rel) : null;
}

export function retentionRecord({ project, prospectFile, fields, now }) {
  const at = new Date(now);
  return {
    schema: SCHEMA,
    prospect_file: prospectFile ? path.relative(project, prospectFile) || path.basename(prospectFile) : null,
    fields: [...(fields ?? [])].sort(),
    stamped_at: at.toISOString(),
    delete_after: new Date(at.getTime() + RETENTION_DAYS * DAY_MS).toISOString(),
    purged_at: null,
  };
}

export function retentionState(record, now) {
  const left = (Date.parse(record.delete_after) - Date.parse(now)) / DAY_MS;
  return { expired: left <= 0, days_left: Math.max(0, Math.ceil(left)), purged: Boolean(record.purged_at) };
}

export function purgeTerms(prospect) {
  const out = [];
  for (const k of PROSPECT_FIELDS) {
    const v = prospect?.[k];
    if (typeof v !== 'string' || v.trim().length < 3) continue;
    out.push(v.trim());
    if (/^https?:\/\//i.test(v)) out.push(v.trim().replace(/^https?:\/\//i, '').replace(/\/$/, ''));
  }
  return [...new Set(out)].sort((a, b) => b.length - a.length);
}

export function redact(text, terms) {
  let out = String(text);
  let hits = 0;
  for (const t of terms) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, () => { hits += 1; return REMOVED; });
  }
  return { text: out, hits };
}

function walk(dir, rel = '') {
  let entries = [];
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((e) => {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(dir, r);
    return e.isFile() ? [r] : [];
  });
}

export function stamp(project, { now = new Date().toISOString(), dryRun = false } = {}) {
  const file = path.join(project, ...RETENTION_FILE);
  const existing = readJson(file);
  if (existing?.schema === SCHEMA) return { record: existing, created: false };
  const prospectFile = declaredProspect(project);
  if (!prospectFile) return { record: null, created: false };
  const fields = Object.keys(readJson(prospectFile) ?? {});
  const record = retentionRecord({ project, prospectFile, fields, now });
  if (!dryRun) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`); }
  return { record, created: true };
}

export function purge(project, { now = new Date().toISOString(), force = false, dryRun = false } = {}) {
  const file = path.join(project, ...RETENTION_FILE);
  const record = readJson(file);
  if (record?.schema !== SCHEMA) return { ok: false, reason: `no ${RETENTION_FILE.join('/')} — nothing was stamped (not a sales run)` };
  if (record.purged_at) return { ok: true, reason: `already purged at ${record.purged_at}`, deleted: [], redacted: [], binaries: [] };
  const state = retentionState(record, now);
  if (!state.expired && !force) return { ok: false, reason: `not expired: ${state.days_left} day(s) left (delete_after ${record.delete_after}); --force purges now` };
  const recordPath = record.prospect_file ? path.resolve(project, record.prospect_file) : null;
  const terms = purgeTerms(recordPath ? readJson(recordPath) : null);
  const deleted = [];
  const redacted = [];
  const binaries = [];
  const inside = Boolean(recordPath) && recordPath.startsWith(path.resolve(project) + path.sep);
  for (const rel of walk(project)) {
    const abs = path.join(project, rel);
    if (recordPath && abs === recordPath) continue;
    if (rel === path.join(...RETENTION_FILE)) continue;
    const ext = path.extname(rel).toLowerCase();
    if (BINARY_EXTS.has(ext)) {
      if (/^(renders|assets\/voice|captions)\b/.test(rel.split(path.sep).join('/'))) binaries.push(rel.split(path.sep).join('/'));
      continue;
    }
    if (!terms.length || !TEXT_EXTS.has(ext)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const r = redact(text, terms);
    if (!r.hits) continue;
    if (!dryRun) fs.writeFileSync(abs, r.text);
    redacted.push({ file: rel.split(path.sep).join('/'), hits: r.hits });
  }
  if (inside && fs.existsSync(recordPath)) { if (!dryRun) fs.rmSync(recordPath); deleted.push(path.relative(project, recordPath)); }
  const note = recordPath && !inside ? `the record ${recordPath} is outside the project — delete it yourself` : null;
  if (!dryRun) fs.writeFileSync(file, `${JSON.stringify({ ...record, purged_at: new Date(now).toISOString(), purge: { deleted, redacted, binaries_left: binaries, note } }, null, 2)}\n`);
  return { ok: true, deleted, redacted, binaries, note, terms: terms.length };
}

export const USAGE = `Usage: node scripts/prospect-retention.mjs <stamp|status|purge> [--project <dir>] [--now <iso>] [--force] [--dry-run] [--json]

a sales prospect's data is deleted ${RETENTION_DAYS} days after the run. stamp writes the deadline (render-path deliver
does it in sales mode); status reports it (exit 3 once expired and not purged); purge deletes the prospect record inside
the project and replaces its values in the text artifacts — renders, posters and voice lines are listed, never deleted.`;

export function main(argv = process.argv.slice(2)) {
  const o = { command: null, project: '.', now: new Date().toISOString(), force: false, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--project') o.project = argv[++i];
    else if (a === '--now') o.now = argv[++i];
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') { console.log(USAGE); return 0; }
    else if (!o.command && ['stamp', 'status', 'purge'].includes(a)) o.command = a;
    else { console.error(`unknown argument ${a}\n${USAGE}`); return 2; }
  }
  if (!o.command || Number.isNaN(Date.parse(o.now))) { console.error(USAGE); return 2; }
  const project = path.resolve(o.project);
  const print = (obj, line) => console.log(o.json ? JSON.stringify(obj, null, 2) : line);
  if (o.command === 'stamp') {
    const r = stamp(project, { now: o.now, dryRun: o.dryRun });
    print(r, r.record ? `prospect data ${r.created ? 'stamped' : 'already stamped'}: delete after ${r.record.delete_after}` : 'no prospect declared in intake.json — nothing to stamp');
    return 0;
  }
  const record = readJson(path.join(project, ...RETENTION_FILE));
  if (o.command === 'status') {
    if (record?.schema !== SCHEMA) { print({ stamped: false }, 'no prospect retention record (not a sales run)'); return 0; }
    const s = retentionState(record, o.now);
    print({ ...record, ...s }, s.purged ? `purged at ${record.purged_at}` : s.expired ? `EXPIRED since ${record.delete_after} — run: node scripts/prospect-retention.mjs purge --project ${o.project}` : `${s.days_left} day(s) left (delete after ${record.delete_after})`);
    return s.expired && !s.purged ? 3 : 0;
  }
  const r = purge(project, { now: o.now, force: o.force, dryRun: o.dryRun });
  if (!r.ok) { console.error(`prospect-retention: ${r.reason}`); return 3; }
  print(r, r.reason ?? `purged${o.dryRun ? ' (dry run)' : ''}: ${r.deleted.length} record file(s) deleted, ${r.redacted.length} text file(s) redacted; still showing or speaking the prospect (yours to decide): ${r.binaries.join(', ') || 'none'}${r.note ? `; ${r.note}` : ''}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
