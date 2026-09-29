import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, 'wowprobe.py');
const FIXTURES = path.join(here, 'fixtures', 'wowprobe', 'swiss-grid-0.8.47');

function run(args, opts = {}) {
  return spawnSync('python3', [SCRIPT, ...args], { encoding: 'utf8', ...opts });
}

function listGates() {
  const r = run(['--list-gates']);
  if (r.error || r.status !== 0) return { error: r.error ?? r.stderr };
  return JSON.parse(r.stdout);
}

function available(cmd, args = ['--version']) {
  const p = spawnSync(cmd, args, { encoding: 'utf8' });
  return !p.error && p.status === 0;
}

const hasPython = available('python3');
const hasFfmpeg = available('ffmpeg', ['-version']) && available('ffprobe', ['-version']);

test('--list-gates exits 0 and prints QA-01…QA-14', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const data = listGates();
  assert.equal(data.error, undefined, String(data.error));
  const ids = Array.from({ length: 14 }, (_, i) => `QA-${String(i + 1).padStart(2, '0')}`);
  assert.deepEqual(Object.keys(data.gates), ids);
  assert.ok(data.length_bands['hero-launch'], 'length bands exported');
  assert.equal(data.beat_lock.reveal_tolerance_sec, 0.15);
});

test('every gate has rule, owner (ffmpeg|storyboard|hyperframes), measure, threshold and hard flag', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const { gates } = listGates();
  const owners = new Set(['ffmpeg', 'storyboard', 'hyperframes']);
  for (const [id, g] of Object.entries(gates)) {
    assert.ok(typeof g.rule === 'string' && g.rule, `${id}.rule`);
    assert.ok(owners.has(g.owner), `${id}.owner=${g.owner}`);
    assert.ok(typeof g.measure === 'string' && g.measure, `${id}.measure`);
    assert.ok(g.threshold && typeof g.threshold === 'object', `${id}.threshold`);
    assert.equal(typeof g.hard, 'boolean', `${id}.hard`);
  }
});

test('hard gates: QA-01(±3 %), 02, 03, 06, 08, 10, 12, 14; the rest are defaults', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const { gates } = listGates();
  const hard = Object.entries(gates).filter(([, g]) => g.hard).map(([id]) => id);
  assert.deepEqual(hard, ['QA-01', 'QA-02', 'QA-03', 'QA-06', 'QA-08', 'QA-10', 'QA-12', 'QA-14']);
});

test('spot-check thresholds against the gate table', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const { gates } = listGates();
  assert.equal(gates['QA-01'].threshold.brief_tolerance_pct, 3);
  assert.equal(gates['QA-03'].threshold.hook_visible_by_sec, 3.0);
  assert.equal(gates['QA-03'].threshold.black_open_yavg_max, 26);
  assert.deepEqual(gates['QA-04'].threshold, { marketing_sec: 5, sales_sec: 5, investors_sec: 10, story_first_max_sec: 25 });
  assert.deepEqual(gates['QA-05'].threshold, { marketing_sec: 12, sales_sec: 12, investors_sec: 20 });
  assert.equal(gates['QA-07'].threshold.frozen_pct_max, 25);
  assert.equal(gates['QA-08'].threshold.tolerance_lu, 1);
  assert.equal(gates['QA-08'].threshold.true_peak_dbtp_max, -1);
  assert.equal(gates['QA-08'].threshold.targets_lufs.social_vo, -14);
  assert.deepEqual(gates['QA-09'].threshold.asl_sec.marketing, [2, 6]);
  assert.equal(gates['QA-09'].threshold.shot_max_sec, 12);
  assert.equal(gates['QA-10'].threshold.min_sec, 1.2);
  assert.deepEqual(gates['QA-10'].threshold.cps, { en: 20 }, 'English only — (RU/UK/DE/JA withdrawn 2026-09-19)');
  assert.equal(gates['QA-10'].threshold.max_chars_per_line, 42);
  assert.deepEqual(gates['QA-13'].threshold.duration_sec, [2.5, 4.0]);
  assert.equal(gates['QA-13'].threshold.max_share_pct_when_runtime_ge_45s, 12);
  assert.equal(gates['QA-14'].threshold.contrast_ratio_min, 4.5);
  assert.equal(gates['QA-14'].threshold.caption_keepout_y_min, 0.82);
});

test('scorecard: 9 metrics whose weights sum to 100', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const { scorecard_weights: w } = listGates();
  assert.equal(Object.keys(w).length, 9);
  assert.equal(Object.values(w).reduce((s, m) => s + m.weight, 0), 100);
  assert.equal(w.hook_speed.weight, 15);
  assert.equal(w.product_share.weight, 15);
  assert.equal(w.liveliness.weight, 15);
  assert.equal(w.ending_discipline.weight, 5);
});

test('non-UI product roles count as product frames', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const { product_roles } = listGates();
  for (const role of ['terminal', 'code', 'api', 'diagram', 'design', 'file', 'ui', 'demo', 'recording']) {
    assert.ok(product_roles.includes(role), `missing role ${role}`);
  }
});

test('python unit tests: storyboard parser, numbers, reading floor, storyboard/hyperframes gates, scorecard', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const r = spawnSync('python3', ['-m', 'unittest', '-q', 'scripts/test_wowprobe.py'], { encoding: 'utf8', cwd: path.join(here, '..') });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /OK/);
});

const STORYBOARD = `---
format: 1920x1080
duration: 12s
message: "Close the books in 3 days"
audience: marketing
reveal: early
register: high
---

## Frame 1 — Hook

- duration: 3s
- role: hook
- src: compositions/frames/01-hook.html
- text: "Close the books in 3 days" @ 0.2-3.0

## Frame 2 — Product

- duration: 4s
- role: ui
- evidence_tier: A
- text: "98.5% auto-matched" @ 0.5-4.0

## Frame 3 — Outcome

- duration: 2s
- role: outcome
- text: "3.1 days average close" @ 0.3 +1.7

## Frame 4 — End card

- duration: 3s
- role: cta
- cta: "Start my free trial" @ 0.4-3.0
- order: logo -> tagline -> URL
- stagger: 0.4s
`;

const CLAIMS = {
  schema: 'power-presentation/claims-index@0.1',
  claims: [
    { id: 'c001', kind: 'number', value: '3 days', number: 3, unit: 'days', source: 'site/index.html:27', status: 'verified' },
    { id: 'c002', kind: 'number', value: '98.5%', number: 98.5, unit: '%', source: 'site/index.html:36', status: 'verified' },
    { id: 'c003', kind: 'number', value: '3.1 days', number: 3.1, unit: 'days', source: 'site/index.html:40', status: 'verified' },
  ],
};

function ffmpeg(args, cwd) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', cwd });
  assert.equal(r.status, 0, `ffmpeg failed: ${r.stderr}`);
}

function buildGoodMaster(dir) {
  const out = path.join(dir, 'good.mp4');
  ffmpeg([
    '-t', '3', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
    '-t', '4', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30',
    '-t', '5', '-f', 'lavfi', '-i', 'mandelbrot=size=640x360:rate=30',
    '-t', '12', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a]volume=7.8dB[a]',
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out,
  ], dir);
  return out;
}

function buildBadMaster(dir) {
  const out = path.join(dir, 'bad.mp4');
  ffmpeg([
    '-t', '2', '-f', 'lavfi', '-i', 'color=c=black:size=640x360:rate=30',
    '-t', '6', '-f', 'lavfi', '-i', 'color=c=blue:size=640x360:rate=30',
    '-t', '4', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
    '-t', '12', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a]volume=26dB[a]',
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out,
  ], dir);
  return out;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wowprobe-'));
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), STORYBOARD);
  fs.writeFileSync(path.join(dir, 'claims-index.json'), JSON.stringify(CLAIMS));
  return dir;
}

test('post-render, good master: ffmpeg gates pass, contact sheet 1920 wide with 6 columns, 12-keyframe cap, trend line, exit 3 only for the band', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  if (!hasFfmpeg) return t.skip('ffmpeg/ffprobe not available');
  const dir = tmpProject();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const video = buildGoodMaster(dir);
  const r = run(['--video', video, '--storyboard', 'STORYBOARD.md', '--claims', 'claims-index.json', '--mode', 'marketing', '--target-lufs', '-14',
    '--destination', 'hero-loop', '--out', 'QA/wowprobe.json', '--sheet', 'QA/contact-sheet.png', '--frames-dir', 'QA/frames', '--trend', 'evals/results/trend.tsv', '--label', 'test-good'], { cwd: dir });
  assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}; stdout: ${r.stdout}`);
  const rep = JSON.parse(fs.readFileSync(path.join(dir, 'QA', 'wowprobe.json'), 'utf8'));
  assert.equal(rep.schema, 'power-presentation/wowprobe@0.1');
  assert.deepEqual(rep.gates_failed, []);
  assert.deepEqual(Object.keys(rep.not_measured).sort(), ['QA-02', 'QA-06', 'QA-11', 'QA-14'], 'only the hyperframes group is unmeasured without check.json');
  const g = rep.gates;
  assert.equal(g['QA-01'].pass, true);
  assert.equal(g['QA-01'].value, 12);
  assert.equal(g['QA-01'].details.band, 'hero-loop');
  assert.equal(g['QA-03'].pass, true);
  assert.equal(g['QA-03'].details.black_open, false);
  assert.equal(g['QA-03'].value, 0.2, 'hook visible at frame start + first text');
  assert.equal(g['QA-07'].pass, true);
  assert.equal(g['QA-07'].value, 0);
  assert.equal(g['QA-08'].pass, true, JSON.stringify(g['QA-08']));
  assert.ok(Math.abs(g['QA-08'].details.integrated_lufs + 14) <= 1, `I=${g['QA-08'].details.integrated_lufs}`);
  assert.ok(g['QA-08'].details.true_peak_dbtp <= -1);
  assert.equal(g['QA-09'].pass, true);
  assert.equal(g['QA-09'].details.cuts, 3, JSON.stringify(g['QA-09'].details));
  assert.equal(g['QA-09'].details.cut_source, 'storyboard frame boundaries');
  assert.deepEqual(g['QA-09'].details.detected_cuts, [3, 7]);
  assert.equal(g['QA-09'].details.asl_sec, 3);
  for (const id of ['QA-04', 'QA-05', 'QA-10', 'QA-12', 'QA-13']) assert.equal(g[id].pass, true, `${id}: ${JSON.stringify(g[id].details)}`);
  const sc = rep.scorecard;
  assert.equal(sc.metrics.liveliness.score, 100);
  assert.equal(sc.metrics.loudness.score, 100);
  assert.equal(sc.metrics.cadence.score, 100);
  assert.equal(sc.metrics.ending_discipline.score, 100);
  assert.equal(sc.metrics.beat_lock.measured, false, 'no --cues → beat lock unmeasured');
  assert.equal(sc.metrics.craft_lint.measured, false);
  assert.equal(sc.measured_weight, 100 - 10 - 10);
  assert.ok(sc.total >= 80 && sc.total <= 100, `total ${sc.total}`);
  assert.equal(sc.band, 'critic');
  assert.equal(rep.contact_sheet.width, 1920);
  assert.equal(rep.contact_sheet.columns, 6);
  assert.equal(rep.contact_sheet.rows, 2);
  assert.deepEqual(pngSize(path.join(dir, 'QA', 'contact-sheet.png')), { width: 1920, height: 360 });
  assert.ok(rep.keyframes.length >= 8 && rep.keyframes.length <= 12, `keyframes ${rep.keyframes.length}`);
  assert.equal(rep.keyframes[0].t, 0);
  assert.equal(rep.keyframes[1].t, 0.5);
  assert.ok(rep.keyframes.some((k) => k.why.startsWith('cut-0.2')));
  assert.deepEqual(pngSize(path.join(dir, rep.keyframes[0].file)), { width: 960, height: 540 });
  const trend = fs.readFileSync(path.join(dir, 'evals', 'results', 'trend.tsv'), 'utf8').trim().split('\n');
  assert.equal(trend.length, 2);
  assert.match(trend[0], /^date\tlabel\tmode\tscorecard_total/);
  assert.match(trend[1], /\ttest-good\tmarketing\t/);
  const r2 = run(['--video', video, '--storyboard', 'STORYBOARD.md', '--mode', 'marketing', '--target-lufs', '-14', '--destination', 'hero-launch', '--no-sheet', '--out', 'QA/w2.json'], { cwd: dir });
  assert.equal(r2.status, 3, r2.stderr);
  const rep2 = JSON.parse(fs.readFileSync(path.join(dir, 'QA', 'w2.json'), 'utf8'));
  assert.deepEqual(rep2.gates_failed, ['QA-01']);
  assert.equal(rep2.gates['QA-01'].details.band_ok, false);
  assert.equal(rep2.gates['QA-01'].details.tolerance_ok, true);
  assert.equal(rep2.gates['QA-12'].measured, false, 'no --claims → QA-12 unmeasured');
  const r3 = run(['--video', video, '--storyboard', 'STORYBOARD.md', '--mode', 'marketing', '--target-lufs', '-14', '--destination', 'hero-launch', '--band-override', '--no-sheet', '--out', 'QA/w3.json'], { cwd: dir });
  assert.equal(r3.status, 0, r3.stderr);
  const rep3 = JSON.parse(fs.readFileSync(path.join(dir, 'QA', 'w3.json'), 'utf8'));
  assert.ok(rep3.brief_overrides.some((o) => o.gate === 'QA-01'));
});

test('post-render, bad master: black open (QA-03), 67 % frozen (QA-07), clipping (QA-08) fail; liveliness and loudness score 0', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  if (!hasFfmpeg) return t.skip('ffmpeg/ffprobe not available');
  const dir = tmpProject();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const video = buildBadMaster(dir);
  const r = run(['--video', video, '--storyboard', 'STORYBOARD.md', '--claims', 'claims-index.json', '--mode', 'marketing', '--target-lufs', '-14', '--destination', 'hero-loop', '--no-sheet', '--out', 'QA/wowprobe.json'], { cwd: dir });
  assert.equal(r.status, 3, `exit ${r.status}; stderr: ${r.stderr}`);
  const rep = JSON.parse(fs.readFileSync(path.join(dir, 'QA', 'wowprobe.json'), 'utf8'));
  assert.deepEqual(rep.gates_failed, ['QA-03', 'QA-07', 'QA-08']);
  const g = rep.gates;
  assert.equal(g['QA-03'].details.black_open, true);
  assert.ok(g['QA-03'].details.yavg_min < 26);
  assert.equal(g['QA-03'].details.element_declared_on_open, false, 'the hook text starts at 0.2 s, so nothing is declared on the black frame');
  assert.ok(g['QA-07'].value > 60 && g['QA-07'].value < 70, `frozen ${g['QA-07'].value} %`);
  assert.equal(g['QA-07'].details.longest_window_sec, 6);
  assert.ok(g['QA-08'].details.true_peak_dbtp > 0, 'clipping');
  assert.equal(g['QA-08'].details.tp_ok, false);
  assert.equal(rep.scorecard.metrics.liveliness.score, 0);
  assert.equal(rep.scorecard.metrics.loudness.score, 0);
  assert.ok(rep.scorecard.total < 80);
  assert.equal(fs.existsSync(path.join(dir, 'QA', 'contact-sheet.png')), false, '--no-sheet');
});

test('a declared element on frame 0 and a declared hold turn the same bad master into QA-03 / QA-07 passes', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  if (!hasFfmpeg) return t.skip('ffmpeg/ffprobe not available');
  const dir = tmpProject();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const video = buildBadMaster(dir);
  const sb = STORYBOARD
    .replace('- text: "Close the books in 3 days" @ 0.2-3.0', '- text: "Close the books in 3 days" @ 0.0-3.0')
    .replace('- duration: 4s\n- role: ui', '- duration: 4s\n- role: ui\n- hold: true')
    .replace('- duration: 3s\n- role: hook', '- duration: 3s\n- role: hook\n- hold: true');
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), sb);
  const r = run(['--video', video, '--storyboard', 'STORYBOARD.md', '--mode', 'marketing', '--target-lufs', '-14', '--destination', 'hero-loop', '--no-sheet', '--out', 'QA/wowprobe.json'], { cwd: dir });
  const rep = JSON.parse(fs.readFileSync(path.join(dir, 'QA', 'wowprobe.json'), 'utf8'));
  assert.deepEqual(rep.gates_failed, ['QA-08'], JSON.stringify(rep.gates['QA-07'].details));
  assert.equal(rep.gates['QA-03'].pass, true);
  assert.equal(rep.gates['QA-07'].pass, true);
  assert.equal(rep.gates['QA-07'].details.raw_frozen_sec, 8);
  assert.equal(rep.gates['QA-07'].value, 8.33, '1 s of the 6 s freeze (7–8 s) falls outside the declared holds (0–3, 3–7)');
  assert.equal(r.status, 3);
});

test('pre-render on the real swiss-grid 0.8.47 check.json + animation map: QA-02, QA-11, QA-14 fail as measured on 2026-09-18/20; ffmpeg gates unmeasured', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const dir = tmpProject();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = run(['--storyboard', 'STORYBOARD.md', '--check', path.join(FIXTURES, 'check.json'), '--animation-map', path.join(FIXTURES, 'animation-map.json'), '--claims', 'claims-index.json', '--mode', 'marketing', '--out', 'QA/pre.json'], { cwd: dir });
  assert.equal(r.status, 3, r.stderr);
  const rep = JSON.parse(fs.readFileSync(path.join(dir, 'QA', 'pre.json'), 'utf8'));
  assert.deepEqual(rep.gates_failed, ['QA-02', 'QA-11', 'QA-14']);
  assert.deepEqual(Object.keys(rep.not_measured).sort(), ['QA-01', 'QA-03', 'QA-06', 'QA-07', 'QA-08', 'QA-09']);
  assert.equal(rep.gates['QA-02'].value, 8, 'errors after triage (6 layout + 2 contrast)');
  assert.match(rep.gates['QA-06'].reason, /motion assertions not enabled/);
  assert.equal(rep.gates['QA-14'].details.contrast_errors.length, 2);
  assert.ok(rep.gates['QA-11'].details.problems.some((p) => /linear/.test(p)));
  assert.ok(rep.gates['QA-11'].details.problems.some((p) => /back\.out/.test(p)));
  assert.ok(rep.gates['QA-11'].details.distinct_easings.length >= 3);
  assert.equal(rep.gates['QA-11'].details.dead_zones.length, 2);
  assert.equal(rep.scorecard.metrics.craft_lint.score, 67.9, '53 flags (36 collisions weigh 0) + 3 warnings');
  assert.equal(rep.scorecard.metrics.craft_lint.flags_per_10_tweens, 3.41);
  assert.equal(rep.scorecard.metrics.liveliness.measured, false);
  const r2 = run(['--storyboard', 'STORYBOARD.md', '--check', path.join(FIXTURES, 'check.json'), '--animation-map', path.join(FIXTURES, 'animation-map.json'), '--mode', 'marketing', '--register', 'playful', '--out', 'QA/pre2.json'], { cwd: dir });
  const rep2 = JSON.parse(fs.readFileSync(path.join(dir, 'QA', 'pre2.json'), 'utf8'));
  assert.ok(!rep2.gates['QA-11'].details.problems.some((p) => /back\.out/.test(p)));
  assert.equal(r2.status, 3);
});

test('QA-02 triage: a data-layout-allow-* attribute needs a QA.md waiver citing an existing snapshot; a default gate can be waived, a hard one cannot', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const dir = tmpProject();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const check = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'check.json'), 'utf8'));
  check.ok = true;
  for (const k of ['layout', 'contrast', 'motion']) { check[k].ok = true; check[k].errorCount = 0; check[k].findings = []; }
  fs.writeFileSync(path.join(dir, 'check.json'), JSON.stringify(check));
  fs.mkdirSync(path.join(dir, 'compositions', 'frames'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'compositions', 'frames', '03-stack.html'), '<div data-layout-allow-overlap class="ide">3 windows</div>');
  const sb = STORYBOARD.replace('- duration: 3s\n- role: cta', '- duration: 5s\n- role: cta').replace('"3.1 days average close"', '"10x faster close"');
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), sb);
  const base = ['--storyboard', 'STORYBOARD.md', '--check', 'check.json', '--claims', 'claims-index.json', '--mode', 'marketing', '--out', 'QA/w.json'];
  let rep = JSON.parse((run([...base, '--print'], { cwd: dir }).stdout));
  assert.deepEqual(rep.gates_failed, ['QA-02', 'QA-12', 'QA-13']);
  assert.equal(rep.gates['QA-02'].details.uncited_allow_attributes.length, 1);
  fs.mkdirSync(path.join(dir, 'QA', 'snapshots'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'QA', 'snapshots', '03.png'), 'png');
  fs.writeFileSync(path.join(dir, 'QA.md'), [
    '# QA', '', '## Waivers', '',
    '- QA-02 frames/03-stack.html: three stacked IDE windows overlap by design (snapshot: QA/snapshots/03.png)',
    '- QA-13: 5 s end card for the product-page loop (snapshot: QA/snapshots/03.png)',
    '- QA-12: the 10x is fine, trust me (snapshot: QA/snapshots/03.png)',
    '',
  ].join('\n'));
  rep = JSON.parse((run([...base, '--print'], { cwd: dir }).stdout));
  assert.deepEqual(rep.gates_failed, ['QA-12'], 'QA-02 triaged, QA-13 waived, QA-12 (hard) still fails');
  assert.equal(rep.gates['QA-02'].pass, true);
  assert.equal(rep.gates['QA-13'].waived, true);
  assert.equal(rep.waivers.length, 1);
  assert.equal(rep.waivers[0].gate, 'QA-13');
  assert.match(rep.waivers[0].qa_md, /QA\.md#L\d+/);
  fs.rmSync(path.join(dir, 'QA', 'snapshots', '03.png'));
  rep = JSON.parse((run([...base, '--print'], { cwd: dir }).stdout));
  assert.deepEqual(rep.gates_failed, ['QA-02', 'QA-12', 'QA-13']);
});

test('usage and runtime errors: no inputs → 2; missing files → 1; --help → 0; an unknown flag never exits 0', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  assert.equal(run([]).status, 2);
  assert.equal(run(['--video', 'missing.mp4', '--mode', 'sales']).status, hasFfmpeg ? 1 : 1);
  assert.equal(run(['--storyboard', 'missing.md', '--mode', 'sales']).status, 1);
  const h = run(['--help']);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /usage/i);
  assert.notEqual(run(['--definitely-not-a-flag']).status, 0);
  const dir = tmpProject();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '## Frame 1\n- duration: 3s\n');
  const r = run(['--storyboard', 'STORYBOARD.md', '--out', 'QA/x.json'], { cwd: dir });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--mode is required/);
});
