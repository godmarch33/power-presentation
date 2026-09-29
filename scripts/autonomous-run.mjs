import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describeThrottle, throttleSpec, throttled } from './lib/throttle.mjs';
import { verifyRun } from './golden-set.mjs';
import { OUT_DIR } from './workspace.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

export const WALL_LIMIT_S = 45 * 60;
export const NFR07_CEILING_USD = 25;

export const RUNS = Object.freeze({
  'gs-02-investors': { slug: 'ledgerly-investors', fixture: 'examples/gs-02-ledgerly', copy: ['site', 'metrics.csv'], args: '--for investors --duration 90 --local ./site --metrics metrics.csv --yes' },
  'gs-02-sales': { slug: 'ledgerly-sales', fixture: 'examples/gs-02-ledgerly', copy: ['site', 'prospect.json', 'claims.json'], args: '--for sales --duration 60 --local ./site --prospect prospect.json --pain "manual month-end reconciliation" --yes' },
  'gs-01-marketing': { slug: 'plausible', fixture: 'examples/gs-01-plausible', copy: [], verify: 'gs-01', args: '--for marketing --duration 45 --format 16:9,9:16 --url https://plausible.io --yes' },
  'gs-03-marketing': { slug: 'acmejobs', fixture: 'examples/gs-03-cli-api', copy: ['bin', 'demo.tape', 'openapi.yaml', 'docs', 'design', 'claims.json'], args: '--for marketing --yes' },
  'gs-02-repo': { slug: 'ledgerly-repo', fixture: 'examples/gs-02-ledgerly', copy: ['site', 'claims.json'], args: '--for marketing --duration 45 --repo --yes', expect: { source_kind: 'repo', routes: { 'web-ui': 'local-static' } } },
});

export const META = /decoy|expected_status|golden[ -]set|synthetic fixture|storyboard|skeleton|answer key|typed-excerpt|\bscenes?\b|\bbeat\b|\bGS-0\d\b|\b(?:QA|REF)-\d{1,2}\b|\bMVP\b|(?<![/\w])v[12](?![\w./])/i;

export const INPUT_REWRITES = Object.freeze({
  'examples/gs-02-ledgerly/claims.json': { claims: {
    'close-days-before': { context: '"…not 12" — the month-end close before Ledgerly (hero headline)' },
    'avg-close-days': { context: 'average month-end close across Ledgerly customers in Q2 2026' },
    'testimonial-harborline': { context: 'Priya Menon, Controller, Harborline Logistics (fictional)' },
    'decoy-10x': { id: 'close-speedup', context: 'how much faster the month-end close runs on Ledgerly' },
    'decoy-50k-customers': { id: 'customer-total', context: 'customers using Ledgerly' },
  } },
  'examples/gs-02-ledgerly/metrics.csv': { lines: [[/,fixture: /, ',']] },
  'examples/gs-03-cli-api/claims.json': { claims: {
    'example-job-id': { context: 'the example job id from the OpenAPI schema' },
    'decoy-latency': { id: 'post-jobs-latency', context: 'POST /jobs latency' },
  } },
  'examples/gs-03-cli-api/openapi.yaml': { lines: [[/^ {2}description: Fictional job-queue API used only by .*$/, ''], [/; run a local mock for capture\.$/, '.']] },
  'examples/gs-03-cli-api/design/README.md': { lines: [
    [/ — a \*\*well-formed placeholder\*\*$/, ' — a placeholder link (all-zero file key; no public file)'],
    [/^ {2}\(all-zero file key, resolves to nothing\) .*$/, ''], [/^ {2}`mocks\/design`\) on this fixture\. .*$/, ''], [/^ {2}when one exists\.`$/, ''],
    [/^- Brand tokens, fonts and logo exactly per the preset .*$/, ''],
  ] },
});

export function inputKind(rel, text = '') {
  const base = path.basename(rel);
  const ext = path.extname(rel).toLowerCase();
  if (base === 'claims.json') return 'claims';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.csv') return 'csv';
  if (ext === '.sh' || text.startsWith('#!')) return 'shell';
  if (['.yaml', '.yml', '.tape', '.toml'].includes(ext)) return 'hash';
  return 'other';
}

export function stripMetaParens(s) {
  return s.replace(/\s?\(([^()\n]*)\)/g, (m, inner) => (META.test(inner) ? '' : m));
}

function trailingComment(line) {
  for (const m of line.matchAll(/\s#(?=\s)/g)) {
    const before = line.slice(0, m.index);
    if (before.trim() && before.split('"').length % 2 === 1 && before.split("'").length % 2 === 1) return m.index;
  }
  return -1;
}

export function scrubClaims(text, rewrite = {}, rel = 'claims.json') {
  const j = JSON.parse(text);
  const out = Object.fromEntries(Object.entries(j).filter(([k]) => !k.startsWith('_') && k !== 'cli_pin'));
  const used = new Set();
  out.claims = (j.claims ?? []).map(({ decoy, expected_status: status, ...c }) => {
    const r = rewrite[c.id];
    if (r) used.add(c.id);
    const next = { ...c, ...(r ?? {}) };
    if (typeof next.context === 'string') next.context = stripMetaParens(next.context);
    return next;
  });
  const stale = Object.keys(rewrite).filter((id) => !used.has(id));
  if (stale.length) throw new Error(`${rel}: no claim ${stale.join(', ')} — the fixture changed under INPUT_REWRITES`);
  return `${JSON.stringify(out, null, 2)}\n`;
}

export function scrubInput(rel, text, { rewrite = {}, preserveLines = false } = {}) {
  const kind = inputKind(rel, text);
  if (kind === 'claims') return scrubClaims(text, rewrite.claims, rel);
  const orig = text.split('\n');
  let lines = [...orig];
  for (const [re, to] of rewrite.lines ?? []) {
    let hit = false;
    lines = lines.map((l) => (re.test(l) ? (hit = true, l.replace(re, to)) : l));
    if (!hit) throw new Error(`${rel}: ${re} matches no line — the fixture changed under INPUT_REWRITES`);
  }
  if (kind === 'html' || kind === 'markdown') {
    lines = lines.join('\n').replace(/<!--[\s\S]*?-->/g, (c) => (META.test(c) ? '\n'.repeat(c.split('\n').length - 1) : c)).split('\n');
  }
  const removed = new Set();
  if (kind === 'hash' || kind === 'shell') {
    const isComment = (l, i) => /^\s*#/.test(l) && !(i === 0 && l.startsWith('#!'));
    lines = lines.map((l, i) => {
      if (isComment(l, i)) return stripMetaParens(l);
      const at = trailingComment(l);
      const cut = at >= 0 && META.test(l.slice(at)) ? l.slice(0, at).trimEnd() : l;
      return kind === 'shell' ? cut : stripMetaParens(cut);
    });
    for (let i = 0; i < lines.length;) {
      if (!isComment(lines[i], i)) { i += 1; continue; }
      let j = i;
      while (j < lines.length && isComment(lines[j], j)) j += 1;
      if (lines.slice(i, j).some((l) => META.test(l))) for (let k = i; k < j; k += 1) removed.add(k);
      i = j;
    }
  } else if (kind === 'csv') {
    lines = lines.map(stripMetaParens);
  } else if (kind === 'markdown') {
    let fence = false;
    let block = [];
    const flush = () => { if (block.some((i) => META.test(lines[i]))) for (const i of block) removed.add(i); block = []; };
    lines.forEach((l, i) => {
      if (/^\s*(```|~~~)/.test(l)) { flush(); fence = !fence; return; }
      if (fence) return;
      lines[i] = stripMetaParens(l);
      if (!lines[i].trim()) { flush(); return; }
      if (/^#{1,6}\s/.test(lines[i]) || /^\s*([-*+]|\d+\.)\s/.test(lines[i])) flush();
      block.push(i);
      if (/^#{1,6}\s/.test(lines[i])) flush();
    });
    flush();
  }
  lines.forEach((l, i) => { if (!l.trim() && orig[i].trim()) removed.add(i); });
  if (preserveLines) return lines.map((l, i) => (removed.has(i) ? '' : l)).join('\n');
  const kept = lines.filter((_, i) => !removed.has(i));
  if (kept.length === lines.length) return kept.join('\n');
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n\n$/, '\n');
}

export function metaLeft(rel, text) {
  const kind = inputKind(rel, text);
  const comment = (l, i) => {
    if (/^\s*#/.test(l)) return i === 0 && l.startsWith('#!') ? '' : l;
    const at = trailingComment(l);
    return at >= 0 ? l.slice(at) : '';
  };
  const scope = kind === 'html' ? (text.match(/<!--[\s\S]*?-->/g) ?? []).join('\n').split('\n')
    : kind === 'shell' ? text.split('\n').map(comment)
      : text.split('\n');
  return scope.filter((l) => META.test(l));
}

function copiedFiles(src, copy) {
  const out = [];
  const walk = (rel) => {
    const p = path.join(src, rel);
    if (fs.statSync(p).isDirectory()) for (const n of fs.readdirSync(p).sort()) walk(path.join(rel, n));
    else out.push(rel);
  };
  for (const c of copy) walk(c);
  return out;
}

export function scrubCopies({ src, fixture, copy, out = null }) {
  const files = copiedFiles(src, copy);
  const texts = new Map();
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(src, rel));
    if (!buf.includes(0)) texts.set(rel, buf.toString('utf8'));
  }
  const pinned = new Set();
  for (const [rel, t] of texts) if (['claims', 'csv'].includes(inputKind(rel, t))) for (const m of t.matchAll(/([\w./-]+\.[A-Za-z]{1,5}):\d+/g)) pinned.add(m[1]);
  const report = [];
  for (const [rel, t] of texts) {
    const clean = scrubInput(rel, t, { rewrite: INPUT_REWRITES[`${fixture}/${rel}`] ?? {}, preserveLines: pinned.has(rel) });
    if (clean === t) continue;
    if (out) fs.writeFileSync(path.join(out, rel), clean);
    report.push({ file: rel, lines_before: t.split('\n').length, lines_after: clean.split('\n').length, meta_left: metaLeft(rel, clean).length });
  }
  return report;
}

export const ALLOWED_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Agent', 'Skill'];

export const SESSION_MODEL = 'opus';
export const SESSION_EFFORT = 'high';

export const MAX_AGENTS_VAR = 'POWER_PRESENTATION_MAX_AGENTS';

export function agentCap(env = process.env) {
  const raw = env[MAX_AGENTS_VAR];
  if (raw === undefined || String(raw).trim() === '') return { max: null, warning: null };
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1) return { max: null, warning: `${MAX_AGENTS_VAR}=${raw} ignored (expected a positive integer)` };
  return { max: n, warning: null };
}

export function agentCapPrompt(n) {
  return `Operator limit on this machine: never have more than ${n} subagent${n === 1 ? '' : 's'} (Agent tool calls, background ones included) running at the same time. Where the skill dispatches agents in parallel (frame workers, critics), dispatch them in batches of at most ${n} and wait until a batch has finished before starting the next. Everything else in the skill stays as written.`;
}

export function buildCommand(spec, { repo = root, claudeBin = 'claude', maxAgents = null } = {}) {
  const cmd = [claudeBin, '-p', `/power-presentation:present ${spec.args}`, '--plugin-dir', repo, '--model', SESSION_MODEL, '--effort', SESSION_EFFORT, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', ALLOWED_TOOLS.join(',')];
  return maxAgents ? [...cmd, '--append-system-prompt', agentCapPrompt(maxAgents)] : cmd;
}

export const PLUGIN_EXCLUDE = Object.freeze([
  'examples/', 'evals/', '.github/', '.claude/', 'AGENTS.md', '.gitignore',
  'scripts/autonomous-run.mjs', 'scripts/baseline.mjs', 'scripts/golden-set.mjs', 'CHANGELOG.md', 'README.md',
  '*.test.mjs', 'test_*.py',
]);

export const VENDOR_PREFIX = 'vendor/';

export function excluded(f, patterns = PLUGIN_EXCLUDE) {
  const base = f.slice(f.lastIndexOf('/') + 1);
  return patterns.some((x) => {
    if (x.endsWith('/')) return f.startsWith(x);
    if (x.includes('*')) return !f.startsWith(VENDOR_PREFIX) && new RegExp(`^${x.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(base);
    return f === x;
  });
}

export function pluginFiles(tracked) {
  return tracked.filter((f) => !excluded(f));
}

export function projectSlug(dir) {
  return dir.replace(/[^A-Za-z0-9]/g, '-');
}

export function isolationArgs({ repo, out, pluginDir, projectsDir = path.join(os.homedir(), '.claude', 'projects'), tmpDir = `/tmp/claude-${process.getuid?.() ?? 1000}` }) {
  const transcripts = path.join(projectsDir, projectSlug(out));
  return ['--dev-bind', '/', '/',
    '--tmpfs', tmpDir,
    '--tmpfs', repo,
    '--tmpfs', path.dirname(out),
    '--bind', out, out,
    '--ro-bind', pluginDir, pluginDir,
    '--tmpfs', projectsDir,
    '--bind', transcripts, transcripts];
}

export function stagedPluginDir(out) {
  return path.join(path.dirname(out), '.plugin', path.basename(out));
}

export function stagePlugin(repo, dest) {
  const git = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  const ls = git(['ls-files', '-z']);
  if (ls.status !== 0) throw new Error(`git ls-files failed in ${repo}: ${ls.stderr}`);
  const files = pluginFiles(ls.stdout.split('\0').filter(Boolean));
  fs.rmSync(dest, { recursive: true, force: true });
  let copied = 0;
  for (const rel of files) {
    const src = path.join(repo, rel);
    if (!fs.existsSync(src)) continue;
    const to = path.join(dest, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(src, to);
    fs.chmodSync(to, fs.statSync(src).mode & 0o777);
    copied += 1;
  }
  return { dir: dest, commit: git(['rev-parse', 'HEAD']).stdout.trim(), dirty: git(['status', '--porcelain']).stdout.trim() !== '', files: copied, excluded: [...PLUGIN_EXCLUDE] };
}

export const SESSION_ENV = { CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' };

export const PARENT_SESSION_VARS = Object.freeze(['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_BRIDGE_SESSION_ID', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_ENTRYPOINT']);

export function sessionEnv(env = process.env) {
  const e = { ...env, ...SESSION_ENV };
  for (const k of PARENT_SESSION_VARS) delete e[k];
  return e;
}

export function workDir(run, repo = root) {
  return path.join(path.dirname(repo), `${path.basename(repo)}-runs`, RUNS[run]?.slug ?? run);
}

export const COLLECT = ['intake.json', 'source-plan.json', 'BRIEF.md', 'frame.md', 'STORYBOARD.md', 'SCRIPT.md', 'claims-index.json', 'product-profile.json', 'story-extraction.yaml', 'run-report.json', 'share-copy.txt', 'claude-result.json', 'autonomous-run.json', 'compositions', 'QA', '.hyperframes/pp-stages.json', '.hyperframes/tokens.json', 'index.html', '.media/capture/capture-manifest.json', '.media/capture/events.jsonl', '.media/capture/autozoom.json'];

export const HARNESS_FILES = Object.freeze(['claude-result.json', 'autonomous-run.json']);

export function runWorkspace(out) {
  const base = path.join(out, OUT_DIR);
  let dirs = [];
  try { dirs = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(base, e.name)); } catch { return out; }
  if (!dirs.length) return out;
  return dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

export function rootLeaks(out, copied = []) {
  const allowed = new Set([...copied.map((c) => c.split('/')[0]), ...HARNESS_FILES, OUT_DIR]);
  let names = [];
  try { names = fs.readdirSync(out); } catch { return []; }
  return names.filter((n) => !allowed.has(n)).sort();
}

export function collect(work, dest, { run = work } = {}) {
  fs.mkdirSync(dest, { recursive: true });
  for (const rel of [...COLLECT, 'final.mp4']) fs.rmSync(path.join(dest, rel), { recursive: true, force: true });
  const copied = [];
  for (const rel of COLLECT) {
    const src = path.join(HARNESS_FILES.includes(rel) ? run : work, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.cpSync(src, path.join(dest, rel), { recursive: true });
    copied.push(rel);
  }
  const finalDir = path.join(work, 'renders', 'final');
  const master = fs.existsSync(finalDir) ? fs.readdirSync(finalDir).filter((n) => /_16x9\.mp4$/.test(n)).sort()[0] : null;
  if (master) { fs.copyFileSync(path.join(finalDir, master), path.join(dest, 'final.mp4')); copied.push(`final.mp4 (= renders/final/${master})`); }
  return copied;
}

export function deliverables(dir) {
  const finalDir = path.join(dir, 'renders', 'final');
  const masters = fs.existsSync(finalDir) ? fs.readdirSync(finalDir).filter((n) => n.endsWith('.mp4')).sort() : [];
  const report = fs.existsSync(path.join(dir, 'run-report.json'));
  return { masters, run_report: report, complete: masters.length > 0 && report };
}

export function verdict(result, wallS, { ceilingUsd = NFR07_CEILING_USD, delivered = { complete: true } } = {}) {
  const usd = typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : null;
  const done = Boolean(delivered?.complete);
  return {
    wall_s: Math.round(wallS * 10) / 10,
    usd,
    turns: result?.num_turns ?? null,
    is_error: Boolean(result?.is_error),
    delivered,
    wall: { limit_s: WALL_LIMIT_S, pass: done && wallS <= WALL_LIMIT_S },
    cost: { ceiling_usd: ceilingUsd, pass: usd === null ? null : done && usd <= ceilingUsd },
  };
}

export function expectChecks(spec, work) {
  if (!spec.expect) return null;
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(work, f), 'utf8')); } catch { return null; } };
  const results = [];
  if (spec.expect.source_kind) {
    const src = read('intake.json')?.declared?.source ?? read('intake.json')?.source ?? null;
    const kind = typeof src === 'object' && src ? src.kind : null;
    results.push({ check: 'source_kind', ok: kind === spec.expect.source_kind, detail: `intake.json source.kind = ${kind ?? 'none'} (expected ${spec.expect.source_kind})` });
  }
  for (const [cls, source] of Object.entries(spec.expect.routes ?? {})) {
    const route = read('source-plan.json')?.routes?.find((r) => r.class === cls) ?? null;
    results.push({ check: `route:${cls}`, ok: route?.source === source, detail: route ? `source-plan.json ${cls} → ${route.source}` : `no ${cls} route in source-plan.json` });
  }
  return { ok: results.every((r) => r.ok), failed: results.filter((r) => !r.ok).map((r) => r.check), results };
}

export function runChecks(spec, dir) {
  if (!spec.verify) return null;
  try {
    const r = verifyRun(spec.verify, dir);
    return { fixture: r.fixture, ok: r.ok, failed: r.results.filter((c) => c.ok === false).map((c) => c.check), results: r.results };
  } catch (e) {
    return { fixture: spec.verify, ok: false, failed: ['verify-run'], error: e.message, results: [] };
  }
}

export function exitCode(status, v, captureCheck = null) {
  return status === 0 && !v.is_error && v.wall.pass && v.cost.pass !== false && (captureCheck === null || captureCheck.ok) ? 0 : 3;
}

function parseArgs(argv) {
  const o = { run: null, out: null, dryRun: false, noIsolation: false, claude: process.env.CLAUDE_BIN ?? 'claude' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--run') o.run = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--claude') o.claude = argv[++i];
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--no-isolation') o.noIsolation = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

export const USAGE = `Usage: node scripts/autonomous-run.mjs --run <${Object.keys(RUNS).join('|')}> [--out <dir>] [--claude <bin>] [--no-isolation] [--dry-run]

One unattended /present pass on a fixture in a fresh run directory outside this repository (default
../power-presentation-runs/<run>/; the fixture inputs copied without their golden-set meta; results copied into
evals/baseline/runs/plugin/<run>/), measured against the wall-time (≤ 45 min) and cost (≤ $25) limits; a GS-01 run is also checked against the
recording criteria (golden-set.mjs verify --run). Exit: 0 all met · 3 a limit or a run check missed, or the session failed ·
2 usage · 1 runtime.`;

export function main(argv = process.argv.slice(2)) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(e.message); console.error(USAGE); return 2; }
  if (o.help || !o.run) { console.log(USAGE); return o.help ? 0 : 2; }
  const spec = RUNS[o.run];
  if (!spec) { console.error(`unknown run ${o.run}`); return 2; }
  const out = path.resolve(o.out ?? workDir(o.run));
  const dest = path.join(root, 'evals', 'baseline', 'runs', 'plugin', o.run);
  if (out === root || out.startsWith(root + path.sep)) { console.error(`${out} is inside the plugin directory — Claude Code refuses Write/Edit there; use a directory outside ${root}`); return 2; }
  const pluginDir = stagedPluginDir(out);
  const cap = agentCap();
  if (cap.warning) console.error(`agent cap: ${cap.warning}`);
  const cmd = buildCommand(spec, { repo: pluginDir, claudeBin: o.claude, maxAgents: cap.max });
  const describeScrub = (s) => s.map((x) => `${x.file} (${x.lines_before} → ${x.lines_after} lines${x.meta_left ? `, ${x.meta_left} meta line(s) LEFT` : ''})`).join(', ') || 'nothing';
  if (o.dryRun) {
    const scrub = scrubCopies({ src: path.join(root, spec.fixture), fixture: spec.fixture, copy: spec.copy });
    console.log(`run dir: ${out} (results → ${path.relative(root, dest)}/)\nplugin: ${pluginDir} (tracked files without ${PLUGIN_EXCLUDE.join(', ')})\ncopy: ${spec.copy.map((c) => path.join(spec.fixture, c)).join(', ')}\nscrub (golden-set meta out of the copies): ${describeScrub(scrub)}${spec.verify ? `\nafter the session: golden-set.mjs verify --run ${out} --only ${spec.verify}` : ''}\n$ ${cmd.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
    return 0;
  }
  if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error(`${out} is not empty — an autonomous run starts from the fixture inputs only`); return 2; }
  const bwrap = o.noIsolation ? null : spawnSync('sh', ['-c', 'command -v bwrap'], { encoding: 'utf8' }).stdout.trim();
  if (!o.noIsolation && !bwrap) { console.error('bwrap (bubblewrap) is not installed: the session would see this repository, its answer keys and the other runs — install it or pass --no-isolation'); return 2; }
  const plugin = stagePlugin(root, pluginDir);
  console.log(`plugin staged: ${plugin.files} files at ${plugin.commit.slice(0, 7)}${plugin.dirty ? ' + uncommitted changes' : ''} → ${pluginDir}`);
  fs.mkdirSync(out, { recursive: true });
  for (const c of spec.copy) fs.cpSync(path.join(root, spec.fixture, c), path.join(out, c), { recursive: true });
  const scrubbed = scrubCopies({ src: path.join(root, spec.fixture), fixture: spec.fixture, copy: spec.copy, out });
  console.log(`inputs scrubbed of golden-set meta: ${describeScrub(scrubbed)}`);
  if (scrubbed.some((x) => x.meta_left)) console.error('warning: answer-key meta is left in a copied input (autonomous-run META) — the run may measure what it was told');
  const throttle = throttleSpec();
  for (const w of throttle.warnings) console.error(`throttle: ${w}`);
  let session = cmd;
  if (bwrap) {
    fs.mkdirSync(path.join(os.homedir(), '.claude', 'projects', projectSlug(out)), { recursive: true });
    session = [bwrap, ...isolationArgs({ repo: root, out, pluginDir }), '--', ...cmd];
  }
  console.log(`isolation: ${bwrap ? `bwrap — ${root}, the other runs and other transcripts hidden` : 'OFF (--no-isolation)'}`);
  const t = throttled(session[0], session.slice(1), throttle);
  console.log(`session throttle: ${describeThrottle(throttle)}; subagents at once: ${cap.max ?? 'uncapped'}`);
  const started = new Date();
  const t0 = process.hrtime.bigint();
  const watcher = spawn(process.execPath, [path.join(here, 'progress.mjs'), '--watch', '--root', out, '--interval', '10', '--until-pid', String(process.pid)], { stdio: ['ignore', 'inherit', 'ignore'] });
  const r = spawnSync(t.cmd, t.args, { cwd: out, env: sessionEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  watcher.kill();
  const wallS = Number(process.hrtime.bigint() - t0) / 1e9;
  let result = null;
  try { result = JSON.parse(r.stdout); } catch { }
  fs.writeFileSync(path.join(out, 'claude-result.json'), result ? `${JSON.stringify(result, null, 2)}\n` : (r.stdout ?? ''));
  const work = runWorkspace(out);
  const leaks = rootLeaks(out, spec.copy);
  const v = verdict(result, wallS, { delivered: deliverables(work) });
  const captureCheck = runChecks(spec, work);
  const expect = expectChecks(spec, work);
  const record = { schema: 'power-presentation/autonomous-run@0.1', run: o.run, started_at: started.toISOString(), command: cmd, isolation: bwrap ? 'bwrap' : 'off', throttle: describeThrottle(throttle), max_agents: cap.max, plugin, inputs: { copied: spec.copy, scrubbed }, workspace: path.relative(out, work) || '.', root_leaks: leaks, expect, exit: r.status, error: r.error?.message ?? null, ...v, capture_check: captureCheck };
  fs.writeFileSync(path.join(out, 'autonomous-run.json'), `${JSON.stringify(record, null, 2)}\n`);
  if (result) spawnSync(process.execPath, [path.join(here, 'render-path.mjs'), 'cost', '--project', work, '--actual', path.join(out, 'claude-result.json')], { stdio: 'inherit' });
  if (leaks.length) console.log(`root leaks: the pass wrote ${leaks.join(', ')} beside the inputs — outside ${OUT_DIR}/ (owner requirement: nothing in the project)`);
  const copied = collect(work, dest, { run: out });
  console.log(`collected into ${path.relative(root, dest)}/: ${copied.join(', ') || 'nothing'}`);
  console.log(`autonomous-run ${o.run}: exit ${r.status}, ${v.delivered.complete ? `delivered ${v.delivered.masters.join(', ')}` : 'NOT delivered (no master / run-report.json)'}, ${v.wall_s} s (${v.wall.pass ? 'ok' : 'MISSED'}), $${v.usd ?? '?'} (${v.cost.pass === null ? 'unknown' : v.cost.pass ? 'ok' : 'MISSED'}), ${v.turns ?? '?'} turns${captureCheck ? `, captureCheck capture (${captureCheck.fixture}) ${captureCheck.ok ? 'ok' : `FAILED: ${captureCheck.failed.join(', ')}`}` : ''} → ${path.relative(root, out)}/autonomous-run.json`);
  if (expect && !expect.ok) console.log(`expect: FAILED ${expect.failed.join(', ')} — ${expect.results.filter((x) => !x.ok).map((x) => x.detail).join('; ')}`);
  return leaks.length || (expect && !expect.ok) ? 3 : exitCode(r.status, v, captureCheck);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
