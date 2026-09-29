import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIXTURES } from './golden-set.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

export const ROUTES = Object.freeze({
  brag: { title: '/brag (latent-spaces/brag v0.2.2)', fixtures: ['gs-02'], note: 'brag accepts only a local static site — GS-02 is the one fixture it can run on' },
  hyperframes: { title: 'raw HyperFrames route (product-launch-video, one autonomous pass)', fixtures: ['gs-01', 'gs-02', 'gs-03'] },
  plugin: { title: 'power-presentation /present', fixtures: ['gs-01', 'gs-02', 'gs-03'] },
});

const TARGET_LUFS = { marketing: -14, sales: -14, investors: -16 };

export const USAGE = `Usage: node scripts/baseline.mjs measure [--runs evals/baseline/runs] [--out evals/baseline/baseline.json] [--json]
       node scripts/baseline.mjs table [--out evals/baseline/baseline.json]
       node scripts/baseline.mjs list

measure  wowprobe.py post-render on every evals/baseline/runs/<route>/<gs>/final.mp4 → baseline.json (+ trend.tsv)
table    the markdown block for the line from baseline.json
Exit codes: 0 ok, 3 nothing measured, 2 usage, 1 runtime.`;

function exists(p) { try { fs.statSync(p); return true; } catch { return false; } }

export function measureRun(route, key, runsDir) {
  const f = FIXTURES[key];
  const dir = path.join(runsDir, route, key);
  const video = path.join(dir, 'final.mp4');
  const rel = (x) => (x ? path.relative(root, x) : x);
  if (!exists(video)) return { route, fixture: f.id, key, status: 'not_run', dir: rel(dir) };
  const light = path.join(root, 'examples', f.dir);
  const claims = exists(path.join(dir, 'claims-index.json')) ? path.join(dir, 'claims-index.json') : (f.claims ? path.join(light, f.claims) : null);
  const args = [path.join(here, 'wowprobe.py'), '--video', video, '--mode', f.mode, '--target-lufs', String(TARGET_LUFS[f.mode]), '--destination', f.destination,
    '--brief-duration', String(f.duration), '--out', path.join(dir, 'QA', 'wowprobe.json'), '--sheet', path.join(dir, 'QA', 'contact-sheet.png'), '--frames-dir', path.join(dir, 'QA', 'frames'),
    '--trend', path.join(runsDir, '..', 'trend.tsv'), '--label', `${route}/${key}`, '--project', dir, '--print'];
  if (exists(path.join(dir, 'STORYBOARD.md'))) args.push('--storyboard', path.join(dir, 'STORYBOARD.md'));
  if (exists(path.join(dir, 'QA', 'check.json'))) args.push('--check', path.join(dir, 'QA', 'check.json'));
  if (exists(path.join(dir, 'animation-map.json'))) args.push('--animation-map', path.join(dir, 'animation-map.json'));
  if (claims) args.push('--claims', claims);
  if (exists(path.join(dir, 'music-cues.json'))) args.push('--cues', path.join(dir, 'music-cues.json'));
  const r = spawnSync('python3', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 3) return { route, fixture: f.id, key, status: 'error', dir: rel(dir), error: (r.stderr || r.stdout).trim().slice(-400) };
  const rep = JSON.parse(r.stdout);
  const m = rep.measurements;
  const g = rep.gates;
  const notes = exists(path.join(dir, 'notes.md')) ? fs.readFileSync(path.join(dir, 'notes.md'), 'utf8').trim() : null;
  return {
    route, fixture: f.id, key, status: 'measured', dir: rel(dir),
    duration_sec: m.duration,
    cuts: g['QA-09'].details.cuts, asl_sec: g['QA-09'].details.asl_sec, longest_shot_sec: g['QA-09'].details.longest_shot_sec,
    frozen_pct: g['QA-07'].details.frozen_pct, longest_freeze_sec: g['QA-07'].details.longest_window_sec,
    black_open: g['QA-03'].details.black_open, hook_visible_at_sec: g['QA-03'].details.hook_visible_at_sec,
    lufs: m.loudness?.integrated_lufs ?? null, lra: m.loudness?.lra_lu ?? null, tp: m.loudness?.true_peak_dbtp ?? null,
    first_product_sec: g['QA-04'].measured ? g['QA-04'].value : null, first_outcome_sec: g['QA-05'].measured ? g['QA-05'].value : null,
    gates_failed: rep.gates_failed, not_measured: Object.keys(rep.not_measured), scorecard: rep.scorecard.total, measured_weight: rep.scorecard.measured_weight,
    check_ok: g['QA-02'].measured ? g['QA-02'].details.ok : null, check_errors: g['QA-02'].measured ? g['QA-02'].value : null,
    contact_sheet: rel(rep.contact_sheet?.file ?? null), notes,
  };
}

export function renderTable(data) {
  const lines = [];
  lines.push('| Route | Fixture | Dur (s) | Cuts / ASL | Longest shot | Frozen % | Black open | LUFS / LRA / TP | First product / outcome | check | Gates failed | Not measured | Scorecard |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of data.runs) {
    if (r.status !== 'measured') { lines.push(`| ${r.route} | ${r.fixture} | — | — | — | — | — | — | — | — | *${r.status}* | — | — |`); continue; }
    const f = (x, d = 1) => (x === null || x === undefined ? '—' : Number(x).toFixed(d));
    lines.push(`| ${r.route} | ${r.fixture} | ${f(r.duration_sec)} | ${r.cuts} / ${f(r.asl_sec)} | ${f(r.longest_shot_sec)} | ${f(r.frozen_pct)} | ${r.black_open ? 'yes' : 'no'} | ${f(r.lufs)} / ${f(r.lra)} / ${f(r.tp)} | ${f(r.first_product_sec)} / ${f(r.first_outcome_sec)} | ${r.check_ok === null ? '—' : r.check_ok ? 'ok' : `${r.check_errors} err`} | ${r.gates_failed.join(', ') || 'none'} | ${r.not_measured.join(', ') || 'none'} | ${r.scorecard ?? '—'} (${r.measured_weight}/100 measured) |`);
  }
  return lines.join('\n');
}

export function parseArgs(argv) {
  const opts = { command: null, runs: path.join(root, 'evals', 'baseline', 'runs'), out: path.join(root, 'evals', 'baseline', 'baseline.json'), json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === 'measure' || a === 'table' || a === 'list') opts.command = a;
    else if (a === '--runs') opts.runs = path.resolve(argv[++i] ?? '');
    else if (a === '--out') opts.out = path.resolve(argv[++i] ?? '');
    else if (a === '--json') opts.json = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { console.error(String(err.message)); console.error(USAGE); return 2; }
  if (opts.help) { console.log(USAGE); return 0; }
  if (!opts.command) { console.error('measure, table or list is required'); console.error(USAGE); return 2; }
  if (opts.command === 'list') {
    for (const [route, r] of Object.entries(ROUTES)) for (const k of r.fixtures) console.log(`${route.padEnd(11)} ${FIXTURES[k].id}  ${exists(path.join(opts.runs, route, k, 'final.mp4')) ? 'final.mp4 present' : 'not run'}  ${path.join(opts.runs, route, k)}`);
    return 0;
  }
  if (opts.command === 'table') {
    if (!exists(opts.out)) { console.error(`no ${opts.out}; run measure first`); return 3; }
    console.log(renderTable(JSON.parse(fs.readFileSync(opts.out, 'utf8'))));
    return 0;
  }
  const runs = [];
  for (const [route, r] of Object.entries(ROUTES)) for (const k of r.fixtures) runs.push(measureRun(route, k, opts.runs));
  const data = { schema: 'power-presentation/baseline@0.1', measured_at: new Date().toISOString(), probe: 'scripts/wowprobe.py', target_lufs: TARGET_LUFS, routes: ROUTES, runs };
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify(data, null, 2) + '\n');
  const measured = runs.filter((x) => x.status === 'measured').length;
  if (opts.json) console.log(JSON.stringify(data, null, 2));
  else {
    console.log(renderTable(data));
    console.log(`\n${measured} of ${runs.length} runs measured → ${opts.out}`);
    for (const x of runs.filter((y) => y.status === 'error')) console.log(`  error ${x.route}/${x.key}: ${x.error}`);
  }
  return measured ? 0 : 3;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(main(process.argv.slice(2)));
