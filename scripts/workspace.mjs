import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { progressOf } from './progress.mjs';

export const OUT_DIR = 'power-presentation-out';
export const MODES = Object.freeze(['marketing', 'sales', 'investors']);
export const OUT_GITIGNORE = '# power-presentation: the video projects stay out of this repository; each keeps its own git history\n*\n';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

export function slug(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}

export function resolveRepo(dir) {
  const abs = path.resolve(dir);
  const parts = abs.split(path.sep);
  const at = parts.indexOf(OUT_DIR);
  return at > 0 ? parts.slice(0, at).join(path.sep) || path.sep : abs;
}

export function productName(repo) {
  const pkg = readJson(path.join(repo, 'package.json'));
  if (typeof pkg?.name === 'string' && pkg.name.trim()) return pkg.name.replace(/^@[^/]+\//, '');
  for (const [file, section] of [['pyproject.toml', 'project'], ['Cargo.toml', 'package']]) {
    const text = readText(path.join(repo, file));
    const block = text?.match(new RegExp(`^\\[${section}\\]\\s*\\n([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'm'))?.[1];
    const name = block?.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1];
    if (name) return name;
  }
  return path.basename(repo);
}

export function videoName({ repo, mode, name = null, prospect = null }) {
  if (name && slug(name)) return slug(name);
  const company = prospect ? readJson(path.resolve(repo, prospect))?.company : null;
  return [slug(productName(repo)) || 'product', slug(mode), company ? slug(company) : ''].filter(Boolean).join('-');
}

export function unfinishedRuns(repo) {
  const out = path.join(resolveRepo(repo), OUT_DIR);
  let names = [];
  try { names = fs.readdirSync(out, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
  const runs = [];
  for (const name of names) {
    const project = path.join(out, name);
    const p = progressOf(project);
    if (!p || p.finished) continue;
    runs.push({ project, name, stage: p.stage, label: p.label, percent: p.percent, run_start: p.run_start, arguments_raw: readJson(path.join(project, 'intake.json'))?.arguments_raw ?? null });
  }
  return runs.sort((a, b) => Date.parse(b.run_start) - Date.parse(a.run_start));
}

export function ensureScanDir(repo = '.') {
  const out = path.join(resolveRepo(repo), OUT_DIR);
  const scan = path.join(out, '.scan');
  fs.mkdirSync(scan, { recursive: true });
  const gi = path.join(out, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, OUT_GITIGNORE);
  return scan;
}

export function ensureWorkspace({ repo = '.', mode, name = null, prospect = null, dryRun = false } = {}) {
  const root = resolveRepo(repo);
  const out = path.join(root, OUT_DIR);
  const video = videoName({ repo: root, mode, name, prospect });
  const project = path.join(out, video);
  const created = !fs.existsSync(project);
  if (!dryRun) {
    fs.mkdirSync(project, { recursive: true });
    const gi = path.join(out, '.gitignore');
    if (!fs.existsSync(gi)) fs.writeFileSync(gi, OUT_GITIGNORE);
  }
  const unfinished = created ? null : unfinishedRuns(root).find((r) => r.project === project) ?? null;
  return { repo: root, out, project, name: video, created, unfinished };
}

export const USAGE = `Usage: node scripts/workspace.mjs [--repo <dir>] --for <${MODES.join('|')}> [--name <name>] [--prospect <file>] [--dry-run] [--json]
       node scripts/workspace.mjs [--repo <dir>] --unfinished [--json]
       node scripts/workspace.mjs [--repo <dir>] --scan

Creates <repo>/${OUT_DIR}/<product>-<mode>/ — the only place a /present run writes — and prints its path
(\`unfinished\` names the run it holds that never finished). --unfinished lists every such run under ${OUT_DIR}/;
--scan creates ${OUT_DIR}/.scan/ (the scan before the form, SKILL § 2) and prints its path.`;

export function main(argv = process.argv.slice(2)) {
  const o = { repo: '.', mode: null, name: null, prospect: null, dryRun: false, json: false, unfinished: false, scan: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--repo') o.repo = argv[++i];
    else if (a === '--for' || a === '--mode') o.mode = argv[++i];
    else if (a === '--name') o.name = argv[++i];
    else if (a === '--prospect') o.prospect = argv[++i];
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--json') o.json = true;
    else if (a === '--unfinished') o.unfinished = true;
    else if (a === '--scan') o.scan = true;
    else if (a === '-h' || a === '--help') { console.log(USAGE); return 0; }
    else { console.error(`unknown argument ${a}\n${USAGE}`); return 2; }
  }
  if (o.scan) { console.log(ensureScanDir(o.repo)); return 0; }
  if (o.unfinished) {
    const runs = unfinishedRuns(o.repo);
    console.log(o.json ? JSON.stringify(runs, null, 2) : runs.map((r) => `${r.project}  ${r.percent}%  ${r.label}`).join('\n') || 'no unfinished run');
    return 0;
  }
  if (!MODES.includes(o.mode) || !o.repo) { console.error(USAGE); return 2; }
  const w = ensureWorkspace(o);
  console.log(o.json ? JSON.stringify(w, null, 2) : w.project);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
