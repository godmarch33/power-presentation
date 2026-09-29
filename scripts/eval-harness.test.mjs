import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES, parseArgs, rolesCheck, verifyRun } from './golden-set.mjs';
import { COLLECT, META, RUNS, collect, exitCode, main, metaLeft, runChecks, scrubClaims, scrubCopies, scrubInput, stripMetaParens, verdict } from './autonomous-run.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const GOLDEN = path.join(here, 'golden-set.mjs');

function fakeRun(dir, { clicks = 1, segments = 1, zoom = true, cursor = true, stamped = true } = {}) {
  const cap = path.join(dir, '.media', 'capture');
  fs.mkdirSync(cap, { recursive: true });
  fs.writeFileSync(path.join(cap, 'capture-manifest.json'), JSON.stringify({ tier: 'A', blocked: false, redaction: { layer2_ocr_gate: { ran: true, findings: 0, gitleaks: 'ok' } } }));
  fs.writeFileSync(path.join(cap, 'events.jsonl'), ['{"t":1,"type":"navigation"}', ...Array.from({ length: clicks }, (_, i) => `{"t":${2 + i},"type":"click","selector":"button"}`)].join('\n') + '\n');
  fs.writeFileSync(path.join(cap, 'autozoom.json'), JSON.stringify({ segments: Array.from({ length: segments }, (_, i) => ({ id: i + 1 })), warnings: [], cursor: { path: [[0, 0.5, 0.5]] } }));
  const frames = path.join(dir, 'compositions', 'frames');
  fs.mkdirSync(frames, { recursive: true });
  const keyframes = [{ t: 0, set: true, role: 'home', scale: 1 }, ...(zoom ? [{ t: 1, role: 'zoom-in', scale: 2 }, { t: 3, role: 'zoom-out', scale: 1 }] : [])];
  fs.writeFileSync(path.join(frames, '03-dashboard.autozoom.json'), JSON.stringify({ tracks: { '16:9': { keyframes }, '9:16': { keyframes } }, keyframes, cursor: cursor ? { path: [[0, 0.4, 0.4], [1, 0.6, 0.5]] } : null }));
  fs.writeFileSync(path.join(frames, '01-hook.html'), '<template></template>');
  fs.writeFileSync(path.join(dir, 'index.html'), stamped ? '<div id="pp-cam-03-dashboard-stage" class="pp-cam-stage" data-pp-frame="03-dashboard"></div>' : '<video class="clip"></video>');
}

test('verifyRun(gs-01): a run whose capture and video carry the recording criteria passes', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-run-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fakeRun(dir);
  const r = verifyRun('gs-01', dir);
  assert.ok(r.ok, JSON.stringify(r.results.filter((c) => c.ok === false)));
  assert.deepEqual(r.results.map((c) => c.check), ['capture-tier', 'capture-gate', 'capture-events', 'autozoom-segments', 'autozoom-size', 'autozoom-cursor', 'camera-zoom', 'camera-cursor', 'camera-applied']);
});

test('verifyRun(gs-01): gates can pass while the recording misses a criterion — each miss fails by name', (t) => {
  const cases = [
    [{ clicks: 0 }, ['capture-events']],
    [{ segments: 0 }, ['autozoom-segments']],
    [{ zoom: false }, ['camera-zoom', 'camera-applied']],
    [{ cursor: false }, ['camera-cursor']],
    [{ stamped: false }, ['camera-applied']],
  ];
  for (const [opts, expected] of cases) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-run-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fakeRun(dir, opts);
    const r = verifyRun('gs-01', dir);
    assert.equal(r.ok, false, JSON.stringify(opts));
    assert.deepEqual(r.results.filter((c) => c.ok === false).map((c) => c.check), expected, JSON.stringify(opts));
  }
});

test('verifyRun(gs-01): a run that never captured or assembled fails; other fixtures report a skip', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-run-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = verifyRun('gs-01', dir);
  assert.deepEqual(r.results.filter((c) => c.ok === false).map((c) => c.check), ['capture-manifest', 'camera-zoom', 'camera-cursor', 'camera-applied']);
  assert.match(r.results.at(-1).detail, /index\.html missing/);
  fs.mkdirSync(path.join(dir, '.media', 'capture'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.media', 'capture', 'capture-manifest.json'), '{"tier": "A", ');
  assert.equal(verifyRun('gs-01', dir).results[0].check, 'capture-manifest', 'a half-written manifest is a failed check, not a crash');
  const other = verifyRun('gs-02', dir);
  assert.equal(other.ok, true);
  assert.equal(other.results[0].ok, null);
});

test('CLI: verify --run exits 0 / 3 on the run, 2 on usage errors', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-run-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fakeRun(dir);
  let r = spawnSync('node', [GOLDEN, 'verify', '--run', dir, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).fixtures[0].run, dir);
  fs.writeFileSync(path.join(dir, 'index.html'), '');
  r = spawnSync('node', [GOLDEN, 'verify', '--run', dir], { encoding: 'utf8' });
  assert.equal(r.status, 3);
  assert.match(r.stdout, /FAIL camera-applied/);
  assert.equal(spawnSync('node', [GOLDEN, 'verify', '--run', path.join(dir, 'nope')], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', [GOLDEN, 'build', '--run', dir], { encoding: 'utf8' }).status, 2);
  assert.throws(() => parseArgs(['verify', '--run', dir, '--only', 'gs-01,gs-02']), /one fixture/);
});

test('autonomous-run: the GS-01 run is checked on its own capture, stored as capture_check and counted in the exit', (t) => {
  assert.equal(RUNS['gs-01-marketing'].verify, 'gs-01');
  for (const [k, spec] of Object.entries(RUNS)) if (k !== 'gs-01-marketing') assert.equal(runChecks(spec, '/nonexistent'), null, k);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-run-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fakeRun(dir);
  const good = runChecks(RUNS['gs-01-marketing'], dir);
  assert.deepEqual([good.fixture, good.ok, good.failed], ['GS-01', true, []]);
  const met = verdict({ total_cost_usd: 12, num_turns: 80 }, 1500);
  assert.equal(exitCode(0, met, good), 0);
  assert.equal(exitCode(0, met, null), 0, 'a run without run-level criteria is judged on alone');
  fs.writeFileSync(path.join(dir, '.media', 'capture', 'events.jsonl'), '{"t":1,"type":"navigation"}\n');
  const bad = runChecks(RUNS['gs-01-marketing'], dir);
  assert.deepEqual([bad.ok, bad.failed], [false, ['capture-events']]);
  assert.equal(exitCode(0, met, bad), 3, 'fast, cheap and delivered, but no click in the capture: the pass fails');
  assert.equal(exitCode(1, met, good), 3);
});

test('autonomous-run: COLLECT brings back what verify --run reads, so the collected copy re-verifies', (t) => {
  for (const f of ['.media/capture/capture-manifest.json', '.media/capture/autozoom.json', '.media/capture/events.jsonl', 'index.html', 'compositions']) assert.ok(COLLECT.includes(f), f);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-run-'));
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-dest-'));
  t.after(() => { fs.rmSync(work, { recursive: true, force: true }); fs.rmSync(dest, { recursive: true, force: true }); });
  fakeRun(work);
  collect(work, dest);
  assert.ok(verifyRun('gs-01', dest).ok);
});

test('autonomous-run --dry-run names the run-level check for GS-01 only', () => {
  const logs = [];
  const orig = console.log;
  console.log = (s) => logs.push(String(s));
  try {
    assert.equal(main(['--run', 'gs-01-marketing', '--out', '/nonexistent/pp-run', '--dry-run']), 0);
    assert.equal(main(['--run', 'gs-02-sales', '--out', '/nonexistent/pp-run2', '--dry-run']), 0);
  } finally { console.log = orig; }
  assert.match(logs[0], /after the session: golden-set\.mjs verify --run \/nonexistent\/pp-run --only gs-01/);
  assert.doesNotMatch(logs[1], /verify --run/);
});

test('GS-03 roles: design is reported, not required — the fixture has no design source a run could use (GS03-E3)', () => {
  const f = FIXTURES['gs-03'];
  assert.equal(f.roles_required.includes('design'), false);
  assert.deepEqual(f.roles_optional, ['design']);
  for (const r of ['terminal', 'code', 'api', 'file']) assert.ok(f.roles_required.includes(r), r);
  const run = rolesCheck(f, ['hook', 'terminal', 'outcome', 'terminal', 'code', 'api', 'api', 'file', 'file', 'cta']);
  assert.deepEqual([run.missing, run.optionalMissing], [[], ['design']]);
  assert.deepEqual(rolesCheck(f, ['hook', 'terminal', 'outcome', 'cta']).missing, ['api', 'code', 'file']);
  assert.deepEqual(rolesCheck(FIXTURES['gs-01'], ['hook', 'recording', 'outcome', 'cta']).optionalMissing, []);
});

function stageInputs(t, run) {
  const spec = RUNS[run];
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-inputs-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  for (const c of spec.copy) fs.cpSync(path.join(root, spec.fixture, c), path.join(out, c), { recursive: true });
  return { out, spec, report: scrubCopies({ src: path.join(root, spec.fixture), fixture: spec.fixture, copy: spec.copy, out }) };
}

function filesUnder(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(dir, path.join(rel, e.name)) : [path.join(rel, e.name)]));
}

test('scrub: no copied input of any run keeps answer-key meta (decoy verdicts, scene notes, ids)', (t) => {
  let before = 0;
  for (const run of Object.keys(RUNS)) {
    const { out, spec } = stageInputs(t, run);
    for (const rel of filesUnder(out)) {
      const src = fs.readFileSync(path.join(root, spec.fixture, rel), 'utf8');
      before += metaLeft(rel, src).length;
      assert.deepEqual(metaLeft(rel, fs.readFileSync(path.join(out, rel), 'utf8')), [], `${run}: ${rel}`);
    }
  }
  assert.ok(before > 30, `the guard sees the fixture sources' meta (${before} lines) — it can fire`);
  assert.match(fs.readFileSync(path.join(root, 'examples', 'gs-03-cli-api', 'claims.json'), 'utf8'), /"decoy": true/);
});

test('scrub: what the product shows stays, and every declared file:line still points at its own line', (t) => {
  const sales = stageInputs(t, 'gs-02-sales');
  const index = fs.readFileSync(path.join(sales.out, 'site', 'index.html'), 'utf8');
  assert.match(index, /<div class="banner">Synthetic fixture: Ledgerly is a fictional company\./, 'on-screen disclosure');
  assert.doesNotMatch(index, /claims\.json can point/);
  const gs03 = stageInputs(t, 'gs-03-marketing');
  assert.match(fs.readFileSync(path.join(gs03.out, 'bin', 'acmejobs'), 'utf8'), /acmejobs 0\.1\.0 \(fixture mock\)/, 'the CLI output is the product');
  assert.equal(fs.statSync(path.join(gs03.out, 'bin', 'acmejobs')).mode & 0o111, 0o111 & fs.statSync(path.join(root, 'examples', 'gs-03-cli-api', 'bin', 'acmejobs')).mode);
  assert.match(fs.readFileSync(path.join(gs03.out, 'design', 'README.md'), 'utf8'), /figma\.com\/design\/0{22}\/acme-jobs-console/, 'the Figma signal stays');
  assert.match(fs.readFileSync(path.join(gs03.out, 'demo.tape'), 'utf8'), /Env ACMEJOBS_BIN "__REPO__\/bin"/);
  for (const run of ['gs-02-sales', 'gs-02-investors', 'gs-03-marketing']) {
    const { out, spec } = run === 'gs-02-sales' ? sales : run === 'gs-03-marketing' ? gs03 : stageInputs(t, run);
    const refs = ['claims.json', 'metrics.csv'].filter((f) => spec.copy.includes(f)).flatMap((f) => [...fs.readFileSync(path.join(out, f), 'utf8').matchAll(/([\w./-]+\.[A-Za-z]{1,5}):(\d+)/g)]);
    assert.ok(refs.length >= 2, run);
    for (const [, file, n] of refs) {
      const line = (p) => fs.readFileSync(p, 'utf8').split('\n')[Number(n) - 1];
      assert.equal(line(path.join(out, file)), line(path.join(root, spec.fixture, file)), `${run}: ${file}:${n}`);
    }
  }
});

test('scrub: claims.json reads as a user\'s --claims file; the run still has to find the decoys itself', (t) => {
  for (const run of ['gs-02-sales', 'gs-03-marketing']) {
    const { out } = stageInputs(t, run);
    const j = JSON.parse(fs.readFileSync(path.join(out, 'claims.json'), 'utf8'));
    assert.deepEqual(Object.keys(j), ['product', 'claims'], run);
    for (const c of j.claims) {
      assert.deepEqual(Object.keys(c), ['id', 'kind', 'value', 'context', 'source'], `${run}: ${c.id}`);
      assert.doesNotMatch(JSON.stringify(c), META, `${run}: ${c.id}`);
    }
  }
  const gs03 = JSON.parse(fs.readFileSync(path.join(stageInputs(t, 'gs-03-marketing').out, 'claims.json'), 'utf8'));
  assert.deepEqual(gs03.claims.find((c) => c.value === '40 ms'), { id: 'post-jobs-latency', kind: 'number', value: '40 ms', context: 'POST /jobs latency', source: null });
});

test('scrub: extract-story on the scrubbed copies reaches the verdicts the answer key expects', (t) => {
  const extract = (out) => {
    const r = spawnSync('node', [path.join(here, 'extract-story.mjs'), '--repo', out, '--claims', path.join(out, 'claims.json'), '--out', path.join(out, 'story.yaml'), '--claims-out', path.join(out, 'claims-index.json')], { cwd: out, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(fs.readFileSync(path.join(out, 'claims-index.json'), 'utf8'));
  };
  const gs03 = extract(stageInputs(t, 'gs-03-marketing').out);
  assert.ok(gs03.gaps.some((g) => g.id === 'unverified-claim' && g.value === '40 ms'), 'the latency decoy is still unverified');
  assert.ok(gs03.claims.some((c) => c.declared_id === 'status-202' && c.status === 'verified' && c.source === 'openapi.yaml:21'));
  const sales = extract(stageInputs(t, 'gs-02-sales').out);
  const unverified = sales.gaps.filter((g) => g.id === 'unverified-claim').map((g) => g.value);
  for (const d of ['10x faster', '50,000 customers']) assert.ok(unverified.includes(d), d);
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'gs-02-ledgerly', 'claims.json'), 'utf8'));
  for (const c of fixture.claims.filter((x) => !x.decoy)) {
    assert.ok(sales.claims.some((x) => (x.declared_id === c.id || (x.declared_ids ?? []).includes(c.id)) && x.status === 'verified' && x.source === c.source), c.id);
  }
});

test('scrub rules: comments, parentheses, drift', () => {
  assert.equal(stripMetaParens('# Acme Jobs — getting started (synthetic fixture GS-03, `docs/`)'), '# Acme Jobs — getting started');
  assert.equal(stripMetaParens('POST /jobs answers 202 Accepted (job accepted and queued)'), 'POST /jobs answers 202 Accepted (job accepted and queued)');
  const tape = 'Output frames/ # PNG frame dump for the storyboard\nSet Theme "A # B"    # QA-14 theme\n# Beat 1 - submit\nType "x"\n';
  assert.equal(scrubInput('demo.tape', tape), 'Output frames/\nSet Theme "A # B"\nType "x"\n');
  assert.equal(scrubInput('api.yaml', "$ref: '#/components/schemas/Job'\n"), "$ref: '#/components/schemas/Job'\n");
  assert.equal(scrubInput('api.yaml', '# QA-06 signal\n# more\nopenapi: 3.1.0\n', { preserveLines: true }), '\n\nopenapi: 3.1.0\n');
  assert.equal(scrubInput('x.md', '# T\n\nThis is the source of the scene\nand more.\n\n- keep\n- a QA-06 note\n  continued\n'), '# T\n\n- keep\n');
  assert.throws(() => scrubInput('x.md', 'a\n', { rewrite: { lines: [[/^nope$/, '']] } }), /fixture changed/);
  assert.throws(() => scrubClaims('{"claims":[{"id":"a"}]}', { b: { context: 'x' } }), /no claim b/);
  assert.equal(metaLeft('site/index.html', '<!-- ok -->\n<div>Synthetic fixture (GS-02)</div>\n').length, 0, 'visible HTML text is the product');
});

test('autonomous-run --dry-run shows the scrub it would apply', () => {
  const logs = [];
  const orig = console.log;
  console.log = (s) => logs.push(String(s));
  try { assert.equal(main(['--run', 'gs-03-marketing', '--out', '/nonexistent/pp-run3', '--dry-run']), 0); } finally { console.log = orig; }
  assert.match(logs[0], /scrub \(golden-set meta out of the copies\): .*claims\.json \(\d+ → \d+ lines\)/);
  assert.doesNotMatch(logs[0], /LEFT/);
});
