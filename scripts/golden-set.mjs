import fs from 'node:fs';
import { serveStatic } from './lib/static-server.mjs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HYPERFRAMES_PIN } from './lib/versions.mjs';
import { findVhs } from './lib/vhs.mjs';

export { findVhs };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

export const FIXTURES = Object.freeze({
  'gs-01': {
    id: 'GS-01', dir: 'gs-01-plausible', product: 'Plausible', mode: 'marketing', duration: 45, destination: 'hero-launch',
    surface: 'web-ui', source: { kind: 'url', url: 'https://plausible.io/plausible.io', tier: 'A', env: 'prod' },
    claims: null,
    roles_required: ['hook', 'recording', 'outcome', 'cta'],
  },
  'gs-02': {
    id: 'GS-02', dir: 'gs-02-ledgerly', product: 'Ledgerly', mode: 'sales', duration: 60, destination: 'sales-outreach',
    surface: 'web-ui', source: { kind: 'static-site', dir: 'site', tier: 'A', env: 'local' },
    claims: 'claims.json', prospect: 'prospect.json', metrics: 'metrics.csv',
    roles_required: ['hook', 'ui', 'metric', 'outcome', 'cta'],
  },
  'gs-03': {
    id: 'GS-03', dir: 'gs-03-cli-api', product: 'Acme Jobs', mode: 'marketing', duration: 45, destination: 'hero-launch',
    surface: 'cli', source: { kind: 'vhs', tape: 'demo.tape', tier: 'A', env: 'local' },
    claims: 'claims.json',
    roles_required: ['hook', 'terminal', 'api', 'code', 'file', 'outcome', 'cta'],
    roles_optional: ['design'],
  },
});

export const USAGE = `Usage: node scripts/golden-set.mjs list
       node scripts/golden-set.mjs verify [--fixtures evals/fixtures] [--only gs-01,gs-02] [--json]
       node scripts/golden-set.mjs verify --run <run dir> [--only gs-01] [--json]
       node scripts/golden-set.mjs build  [--fixtures evals/fixtures] [--only gs-01,gs-02,gs-03] [--confirm-findings] [--json]

verify  light part (classes, story + claims, storyboard gates, hook, metrics) + heavy part when present
        --run: the GS-01 capture criteria on a finished /present run (.media/capture/ + the frames' camera sidecars)
build   heavy fixtures into evals/fixtures/<gs>/ (GS-01 from the live URL, GS-02 from a local server, GS-03 via vhs)
Exit codes: 0 ok, 3 failed check / missing artefact, 2 usage, 1 runtime.`;

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}

function runAsync(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = opts.timeout ? setTimeout(() => child.kill('SIGKILL'), opts.timeout) : null;
    child.on('close', (status) => { if (timer) clearTimeout(timer); resolve({ status, stdout, stderr }); });
    child.on('error', (error) => { if (timer) clearTimeout(timer); resolve({ status: null, stdout, stderr: String(error), error }); });
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function check(results, id, ok, detail) {
  results.push({ check: id, ok: Boolean(ok), detail });
  return Boolean(ok);
}

function exists(p) {
  try { return fs.statSync(p).size >= 0; } catch { return false; }
}

export function rolesCheck(f, roles) {
  const present = [...new Set(roles)];
  return { present, missing: f.roles_required.filter((r) => !present.includes(r)), optionalMissing: (f.roles_optional ?? []).filter((r) => !present.includes(r)) };
}

export function verifyFixture(key, fixturesDir) {
  const f = FIXTURES[key];
  const light = path.join(root, 'examples', f.dir);
  const heavy = path.join(fixturesDir, key);
  const results = [];
  const sb = path.join(light, 'storyboard-skeleton.md');
  const claimsFile = f.claims ? path.join(light, f.claims) : null;

  const readme = fs.readFileSync(path.join(light, 'README.md'), 'utf8');
  check(results, 'cli-pin', readme.includes(`hyperframes@${HYPERFRAMES_PIN}`), `README pins hyperframes@${HYPERFRAMES_PIN}`);

  const inspArgs = [path.join(here, 'inspect-project.mjs'), '--repo', light, '--out', '-'];
  if (f.source.kind === 'url') inspArgs.push('--url', f.source.url);
  const insp = run('node', inspArgs, { cwd: light });
  let profile = null;
  try { profile = JSON.parse(insp.stdout); } catch { }
  check(results, 'product-class', profile && profile.surface === f.surface, `inspect-project surface=${profile?.surface ?? insp.stderr.trim().slice(0, 120)} (expected ${f.surface})`);
  if (key === 'gs-03') {
    const secondary = (profile?.secondary ?? []).map((s) => (typeof s === 'string' ? s : s.class ?? s.surface ?? '')).filter(Boolean);
    check(results, 'secondary-classes', ['api/backend', 'mocks/design', 'files/docs'].every((c) => secondary.includes(c)), `secondary=${secondary.join(', ')}`);
    check(results, 'needs-no-url', profile?.capture?.needs_url === false, `needs_url=${profile?.capture?.needs_url}`);
  }

  if (claimsFile && key === 'gs-02') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-verify-'));
    try {
      const args = [path.join(here, 'extract-story.mjs'), '--repo', light, '--claims', claimsFile, '--out', path.join(tmp, 'story.yaml'), '--claims-out', path.join(tmp, 'claims-index.json')];
      if (f.metrics) args.push('--metrics', path.join(light, f.metrics));
      const r = run('node', args, { cwd: light });
      const idx = r.status === 0 ? readJson(path.join(tmp, 'claims-index.json')) : null;
      const fixture = readJson(claimsFile);
      const decoys = fixture.claims.filter((c) => c.decoy).map((c) => c.value);
      const unverified = (idx?.gaps ?? []).filter((g) => g.id === 'unverified-claim').map((g) => g.value);
      check(results, 'claims', r.status === 0 && decoys.every((d) => unverified.includes(d)), r.status === 0 ? `decoys in gaps: ${unverified.join(', ') || 'none'}` : r.stderr.trim().slice(0, 160));
      const sourced = fixture.claims.filter((c) => !c.decoy);
      const reproduced = sourced.filter((c) => (idx?.claims ?? []).some((x) => (x.declared_id === c.id || (x.declared_ids ?? []).includes(c.id)) && x.status === 'verified' && x.source === c.source));
      check(results, 'claims-sourced', reproduced.length === sourced.length, `${reproduced.length}/${sourced.length} sourced claims reproduced at their file:line`);
      if (f.metrics) {
        const rows = (idx?.claims ?? []).filter((x) => x.source_kind === 'metrics');
        check(results, 'metrics', rows.length >= 3 && rows.every((x) => x.date), `${rows.length} metrics rows, each with a date`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  if (key === 'gs-03') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-verify-'));
    try {
      const r = run('node', [path.join(here, 'extract-story.mjs'), '--repo', light, '--claims', claimsFile, '--out', path.join(tmp, 'story.yaml'), '--claims-out', path.join(tmp, 'claims-index.json')], { cwd: light });
      const idx = r.status === 0 ? readJson(path.join(tmp, 'claims-index.json')) : null;
      const decoy = (idx?.gaps ?? []).some((g) => g.id === 'unverified-claim' && g.value === '40 ms');
      check(results, 'claims', r.status === 0 && decoy, r.status === 0 ? 'the latency decoy is unverified' : r.stderr.trim().slice(0, 160));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  const tmpQa = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-qa-'));
  let probe = null;
  try {
    const args = [path.join(here, 'wowprobe.py'), '--storyboard', sb, '--mode', f.mode, '--out', path.join(tmpQa, 'wowprobe.json'), '--print', '--project', light];
    if (claimsFile) args.push('--claims', claimsFile);
    const r = run('python3', args, { cwd: light });
    try { probe = JSON.parse(r.stdout); } catch { }
    check(results, 'storyboard-gates', probe && probe.gates_failed.length === 0, probe ? `gates_failed: ${probe.gates_failed.join(', ') || 'none'}; scorecard on paper ${probe.scorecard.total}` : r.stderr.trim().slice(0, 160));
    check(results, 'storyboard-duration', probe && Math.abs(probe.storyboard_summary.planned_duration_sec - f.duration) <= f.duration * 0.03, `planned ${probe?.storyboard_summary.planned_duration_sec} s vs ${f.duration} s (QA-01 ±3 %)`);
    const roles = rolesCheck(f, probe?.storyboard_summary.roles ?? []);
    check(results, 'storyboard-roles', roles.missing.length === 0, `roles ${roles.present.join(', ')}; required ${f.roles_required.join(', ')}${roles.missing.length ? `; missing ${roles.missing.join(', ')}` : ''}${f.roles_optional ? `; optional ${f.roles_optional.join(', ')}${roles.optionalMissing.length ? ` (absent: ${roles.optionalMissing.join(', ')})` : ''}` : ''}`);
    if (key === 'gs-02') {
      const prospect = readJson(path.join(light, f.prospect));
      const first = prospect.name.split(' ')[0];
      const company = prospect.company.split(' ')[0];
      const sbText = fs.readFileSync(sb, 'utf8');
      const hook = sbText.split(/^## /m)[1] ?? '';
      check(results, 'prospect-hook', hook.includes(first) && hook.includes(company) && /poster:/.test(hook), `hook frame names ${first} + ${company} and carries the poster key`);
    }
  } finally {
    fs.rmSync(tmpQa, { recursive: true, force: true });
  }

  if (exists(path.join(heavy, 'capture-manifest.json'))) {
    captureChecks(results, heavy, f, 'autozoom.json missing — run build');
  } else if (key !== 'gs-03') {
    results.push({ check: 'heavy-part', ok: null, detail: `not built (${heavy}); run \`node scripts/golden-set.mjs build --only ${key}\`` });
  }
  if (key === 'gs-03') {
    const frames = path.join(heavy, 'frames');
    if (exists(frames)) {
      const pngs = fs.readdirSync(frames).filter((x) => x.endsWith('.png'));
      check(results, 'vhs-frames', pngs.length > 0, `${pngs.length} VHS frames (tier A terminal)`);
    } else {
      results.push({ check: 'vhs-frames', ok: null, detail: 'not built (VHS tape not rendered; `vhs` is a system dependency)' });
    }
  }
  return { fixture: f.id, key, results, ok: results.every((r) => r.ok !== false) };
}

function tryJson(file) {
  try { return readJson(file); } catch { return null; }
}

export function captureChecks(results, dir, f, missingAutozoom) {
  const m = tryJson(path.join(dir, 'capture-manifest.json'));
  if (!m) return check(results, 'capture-manifest', false, `capture-manifest.json in ${dir} is not readable JSON`);
  check(results, 'capture-tier', m.tier === f.source.tier, `tier ${m.tier} (expected ${f.source.tier})`);
  const gate = m.redaction?.layer2_ocr_gate ?? {};
  check(results, 'capture-gate', m.blocked !== true && gate.ran === true, `OCR gate ran=${gate.ran ?? 'n/a'}, findings=${gate.findings ?? 'n/a'}, gitleaks=${gate.gitleaks ?? 'n/a'}, blocked=${m.blocked}`);
  const events = path.join(dir, 'events.jsonl');
  const lines = exists(events) ? fs.readFileSync(events, 'utf8').split('\n').filter(Boolean) : [];
  const clicks = lines.filter((l) => /"type"\s*:\s*"(click|pointerdown|mousedown)"/.test(l)).length;
  const flow = m.flow ? `; flow ${m.flow.steps_done ?? '?'}/${m.flow.steps_total ?? '?'} steps${m.flow.failed_step != null ? `, failed at ${JSON.stringify(m.flow.failed_step)}` : ''}` : '';
  check(results, 'capture-events', lines.length > 0 && clicks >= 1, `${lines.length} events, ${clicks} clicks (cursor from events.jsonl)${flow}`);
  const a = exists(path.join(dir, 'autozoom.json')) ? tryJson(path.join(dir, 'autozoom.json')) : null;
  if (!a) return check(results, 'autozoom-segments', false, missingAutozoom);
  check(results, 'autozoom-segments', (a.segments ?? []).length >= 1, `${(a.segments ?? []).length} zoom segment(s) (≥ 1)`);
  const sizeWarn = (a.warnings ?? []).filter((w) => String(w.code ?? w).startsWith('capture_size_below_output'));
  check(results, 'autozoom-size', sizeWarn.length === 0, `capture_size_below_output = ${sizeWarn.length}`);
  return check(results, 'autozoom-cursor', (a.cursor?.path ?? a.cursor ?? []).length > 0, 'cursor path synthesised');
}

function zoomKeyframes(plan) {
  return (plan?.tracks?.['16:9']?.keyframes ?? plan?.keyframes ?? []).filter((k) => Number(k.scale) > 1.001).length;
}

export function runProject(runDir) {
  const base = path.join(runDir, 'power-presentation-out');
  const dirs = exists(base) ? fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  return dirs.length === 1 ? path.join(base, dirs[0]) : runDir;
}

export function verifyRun(key, runDirIn) {
  const runDir = runProject(runDirIn);
  const f = FIXTURES[key];
  const results = [];
  if (key !== 'gs-01') {
    results.push({ check: 'run-capture', ok: null, detail: `no run-level capture criteria for ${f.id} (only the GS-01 recording has them)` });
    return { fixture: f.id, key, run: runDir, results, ok: true };
  }
  const cap = path.join(runDir, '.media', 'capture');
  if (exists(path.join(cap, 'capture-manifest.json'))) captureChecks(results, cap, f, `autozoom.json missing in ${cap} — autozoom.mjs never ran on the capture`);
  else check(results, 'capture-manifest', false, `no capture-manifest.json in ${cap} — the run recorded nothing (record-flow)`);
  const framesDir = path.join(runDir, 'compositions', 'frames');
  const plans = (exists(framesDir) ? fs.readdirSync(framesDir) : []).filter((n) => n.endsWith('.autozoom.json')).sort()
    .map((n) => ({ id: n.slice(0, -'.autozoom.json'.length), plan: tryJson(path.join(framesDir, n)) }));
  const zoomed = plans.filter((x) => zoomKeyframes(x.plan) > 0);
  const cursored = plans.filter((x) => (x.plan?.cursor?.path ?? []).length > 0);
  check(results, 'camera-zoom', zoomed.length >= 1, `${plans.length} frame sidecar(s); with a zoom keyframe: ${zoomed.map((x) => `${x.id} (${zoomKeyframes(x.plan)})`).join(', ') || 'none'} (≥ 1 auto-zoom in the video)`);
  check(results, 'camera-cursor', cursored.length >= 1, `with a cursor path: ${cursored.map((x) => x.id).join(', ') || 'none'} (the cursor from events.jsonl in the video)`);
  const indexFile = path.join(runDir, 'index.html');
  const index = exists(indexFile) ? fs.readFileSync(indexFile, 'utf8') : null;
  const stamped = zoomed.filter((x) => index?.includes(`data-pp-frame="${x.id}"`));
  check(results, 'camera-applied', stamped.length >= 1, index === null ? 'index.html missing — the run never assembled' : `index.html carries the camera of ${stamped.map((x) => x.id).join(', ') || 'no zoomed frame'} (render-path camera stage)`);
  return { fixture: f.id, key, run: runDir, results, ok: results.every((r) => r.ok !== false) };
}

async function buildFixture(key, fixturesDir, opts) {
  const f = FIXTURES[key];
  const light = path.join(root, 'examples', f.dir);
  const heavy = path.join(fixturesDir, key);
  fs.mkdirSync(heavy, { recursive: true });
  const steps = [];
  const step = (id, ok, detail) => { steps.push({ step: id, ok, detail }); if (!opts.json) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id}: ${detail}`); };

  if (f.source.kind === 'vhs') {
    if (!findVhs()) {
      step('vhs', false, 'vhs not on PATH (nor in ${CLAUDE_PLUGIN_DATA}/toolchain/bin) — the GS-03 terminal scene stays unrecorded; VHS + ttyd are system dependencies, see examples/gs-03-cli-api/README.md');
    } else {
      const r = await runAsync('node', [path.join(here, 'record-terminal.mjs'), '--repo', light, '--tape', path.join(light, f.source.tape), '--out', heavy, '--frames'], { cwd: heavy, timeout: 420000 });
      const framesDir = path.join(heavy, 'frames');
      const frames = exists(framesDir) ? fs.readdirSync(framesDir).filter((x) => x.endsWith('.png')).length : 0;
      if (exists(path.join(heavy, 'footage.mp4'))) fs.copyFileSync(path.join(heavy, 'footage.mp4'), path.join(heavy, 'demo.mp4'));
      step('vhs', r.status === 0 && frames > 0, r.status === 0 ? `footage.mp4 (= demo.mp4) + ${frames} frames (record-terminal.mjs; tier A terminal session, Layer-2 gate)` : `exit ${r.status}: ${(r.stderr || r.stdout).trim().slice(-300)}`);
    }
  } else {
    let server = null;
    let url = f.source.url;
    if (f.source.kind === 'static-site') {
      const s = await serveStatic(path.join(light, f.source.dir));
      server = s.server;
      url = s.url;
    }
    try {
      const args = [path.join(here, 'record-flow.mjs'), '--url', url, '--out', heavy, '--env', f.source.env, '--tier', f.source.tier, '--fixed-time', '2026-09-20T09:00:00Z'];
      const flow = path.join(light, 'flow.json');
      if (exists(flow)) args.push('--flow', flow);
      if (opts.confirmFindings) args.push('--confirm-findings');
      const r = await runAsync('node', args, { cwd: heavy, timeout: 420000 });
      const ok = r.status === 0 && exists(path.join(heavy, 'footage.mp4')) && exists(path.join(heavy, 'events.jsonl'));
      step('record-flow', ok, r.status === 0 ? `footage.mp4 + events.jsonl + capture-manifest.json in ${heavy}` : `exit ${r.status}: ${(r.stderr || r.stdout).trim().slice(-300)}`);
      if (ok) {
        const az = run('node', [path.join(here, 'autozoom.mjs'), '--events', path.join(heavy, 'events.jsonl'), '--manifest', path.join(heavy, 'capture-manifest.json'), '--footage', path.join(heavy, 'footage.mp4'), '--out', path.join(heavy, 'autozoom.json'), '--emit-html', path.join(heavy, 'index.html')], { cwd: heavy, timeout: 120000 });
        step('autozoom', az.status === 0 && exists(path.join(heavy, 'autozoom.json')), az.status === 0 ? 'autozoom.json + preview index.html' : `exit ${az.status}: ${az.stderr.trim().slice(-200)}`);
      }
    } finally {
      if (server) server.close();
    }
  }
  const args = [path.join(here, 'wowprobe.py'), '--storyboard', path.join(light, 'storyboard-skeleton.md'), '--mode', f.mode, '--out', path.join(heavy, 'wowprobe.pre.json'), '--project', light];
  if (f.claims) args.push('--claims', path.join(light, f.claims));
  const p = run('python3', args, { cwd: light });
  step('wowprobe-pre', p.status === 0, p.stdout.trim().slice(0, 160) || p.stderr.trim().slice(0, 160));
  fs.writeFileSync(path.join(heavy, 'fixture.json'), JSON.stringify({ fixture: f.id, product: f.product, mode: f.mode, duration: f.duration, cli_pin: `hyperframes@${HYPERFRAMES_PIN}`, built_at: new Date().toISOString(), source: f.source, steps }, null, 2) + '\n');
  return { fixture: f.id, key, steps, ok: steps.every((s) => s.ok) };
}

export function parseArgs(argv) {
  const opts = { command: null, fixtures: path.join(root, 'evals', 'fixtures'), only: null, run: null, confirmFindings: false, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === 'list' || a === 'verify' || a === 'build') opts.command = a;
    else if (a === '--fixtures') opts.fixtures = path.resolve(argv[++i] ?? '');
    else if (a === '--only') opts.only = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--run') opts.run = path.resolve(argv[++i] ?? '');
    else if (a === '--confirm-findings') opts.confirmFindings = true;
    else if (a === '--json') opts.json = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (opts.only) {
    for (const k of opts.only) if (!FIXTURES[k]) throw new Error(`unknown fixture ${k} (${Object.keys(FIXTURES).join(', ')})`);
  }
  if (opts.run && opts.command !== 'verify') throw new Error('--run goes with verify');
  if (opts.run && opts.only && opts.only.length !== 1) throw new Error('verify --run checks one fixture (--only gs-01)');
  return opts;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(String(err.message));
    console.error(USAGE);
    return 2;
  }
  if (opts.help) { console.log(USAGE); return 0; }
  if (!opts.command) { console.error('list, verify or build is required'); console.error(USAGE); return 2; }
  const keys = opts.only ?? Object.keys(FIXTURES);

  if (opts.command === 'list') {
    const rows = keys.map((k) => ({ key: k, ...FIXTURES[k], light: path.join('examples', FIXTURES[k].dir), heavy: path.join(opts.fixtures, k), built: exists(path.join(opts.fixtures, k, 'fixture.json')) }));
    if (opts.json) console.log(JSON.stringify(rows, null, 2));
    else for (const r of rows) console.log(`${r.id}  ${r.product.padEnd(10)} ${r.mode.padEnd(9)} ${String(r.duration).padStart(3)} s  ${r.surface.padEnd(7)} light: ${r.light}  heavy: ${r.built ? 'built' : 'not built'}`);
    return 0;
  }

  if (opts.command === 'verify') {
    if (process.env.CLAUDE_PLUGIN_OPTION_PRIVACY === 'local' && false) return 0;
    if (opts.run && !exists(opts.run)) { console.error(`verify --run: ${opts.run} does not exist`); return 2; }
    const reports = opts.run ? [verifyRun(opts.only?.[0] ?? 'gs-01', opts.run)] : keys.map((k) => verifyFixture(k, opts.fixtures));
    const ok = reports.every((r) => r.ok);
    if (opts.json) console.log(JSON.stringify({ ok, fixtures: reports }, null, 2));
    else {
      for (const r of reports) {
        console.log(`${r.fixture}${r.run ? ` run ${r.run}` : ''} — ${r.ok ? 'ok' : 'FAILED'}`);
        for (const c of r.results) console.log(`  ${c.ok === null ? 'skip' : c.ok ? 'ok  ' : 'FAIL'} ${c.check}: ${c.detail}`);
      }
    }
    return ok ? 0 : 3;
  }

  if (process.env.CLAUDE_PLUGIN_OPTION_PRIVACY === 'local' && keys.some((k) => FIXTURES[k].source.kind === 'url')) {
    console.error('build: GS-01 needs the live URL; refused under the privacy profile — use --only gs-02,gs-03');
    return 3;
  }
  const reports = [];
  for (const k of keys) {
    if (!opts.json) console.log(`${FIXTURES[k].id} — building into ${path.join(opts.fixtures, k)}`);
    reports.push(await buildFixture(k, opts.fixtures, opts));
  }
  const ok = reports.every((r) => r.ok);
  if (opts.json) console.log(JSON.stringify({ ok, fixtures: reports }, null, 2));
  return ok ? 0 : 3;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err?.stack ?? String(err)); process.exit(1); });
}

export { serveStatic };
