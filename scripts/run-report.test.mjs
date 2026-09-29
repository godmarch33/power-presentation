import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_ROLES, sceneLabel, parseStoryboard, buildReport, runClock } from './run-report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const frame = (keys) => ({ number: 1, title: 'x', keys, texts: [] });

test('PRODUCT_ROLES: the gate roles that show product material; render-path\'s share-copy --tier-c check uses the same list', () => {
  assert.deepEqual([...PRODUCT_ROLES], ['ui', 'demo', 'recording', 'terminal', 'code', 'api', 'design', 'file']);
  assert.ok(Object.isFrozen(PRODUCT_ROLES));
  for (const typeOnly of ['hook', 'outcome', 'metric', 'cta', 'diagram']) assert.ok(!PRODUCT_ROLES.includes(typeOnly), typeOnly);
  const rp = fs.readFileSync(path.join(here, 'render-path.mjs'), 'utf8');
  const m = rp.match(/const tierC = [^\n]*?\[([^\]]+)\]\.includes\(f\.keys\.role\)/);
  if (m) assert.deepEqual(m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')), [...PRODUCT_ROLES], 'render-path.mjs inline copy drifted');
  else assert.match(rp, /PRODUCT_ROLES/, 'render-path.mjs either keeps the inline list or imports PRODUCT_ROLES');
});

test('sceneLabel: tier C is a reconstruction only on a product-role frame or with `reconstructed: true`; a type card reports its tier with no label (GS03-11)', () => {
  assert.deepEqual(sceneLabel(frame({ role: 'hook', evidence_tier: 'C' }), 'marketing'), { tier: 'C', reconstructed: false, label: null, speed_label: null });
  assert.deepEqual(sceneLabel(frame({ role: 'cta', evidence_tier: 'c' }), 'sales'), { tier: 'C', reconstructed: false, label: null, speed_label: null });
  assert.deepEqual(sceneLabel(frame({}), 'investors'), { tier: null, reconstructed: false, label: null, speed_label: null });
  assert.deepEqual(sceneLabel(frame({ role: 'ui', evidence_tier: 'C' }), 'marketing'), { tier: 'C', reconstructed: true, label: 'Screen images simulated', speed_label: null });
  assert.equal(sceneLabel(frame({ role: 'UI ', evidence_tier: 'C' }), 'sales').label, 'reconstructed', 'role compared trimmed, case-insensitive');
  assert.equal(sceneLabel(frame({ role: 'terminal', tier: 'C' }), 'investors').reconstructed, true, 'the legacy `tier` key still counts');
  assert.equal(sceneLabel(frame({ role: 'demo', evidence_tier: 'A' }), 'marketing').reconstructed, false);
  assert.equal(sceneLabel(frame({ role: 'metric', reconstructed: 'true' }), 'marketing').label, 'Screen images simulated');
  assert.equal(sceneLabel(frame({ role: 'design', evidence_tier: 'C' }), 'marketing').label, 'Design preview');
  assert.equal(sceneLabel(frame({ role: 'recording', evidence_tier: 'A', speed: '2x' }), 'marketing').speed_label, '2× speed');
});

test('buildReport: scenes carry the tier per scene; type cards at tier C do not make `reconstructed.any` true, a tier-C ui frame does', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-rr-'));
  try {
    const md = (uiTier) => `---\naudience: marketing\n---\n\n## Frame 1 — Hook\n- role: hook\n- evidence_tier: C\n- duration: 3s\n\n## Frame 2 — Problem\n- duration: 4s\n\n## Frame 3 — Dashboard\n- role: ui\n- evidence_tier: ${uiTier}\n- duration: 6s\n\n## Frame 4 — End card\n- role: cta\n- duration: 3s\n- text: "Narration is AI-generated."\n`;
    const inputs = (storyboard) => ({ project, storyboard, read: [], missing: [] });
    const a = buildReport(inputs(md('A')), { now: '2026-09-27T00:00:00.000Z' });
    assert.deepEqual(a.scenes.map((s) => [s.id, s.role, s.tier, s.reconstructed, s.label]), [
      ['01', 'hook', 'C', false, null], ['02', null, null, false, null], ['03', 'ui', 'A', false, null], ['04', 'cta', null, false, null],
    ]);
    assert.equal(a.reconstructed.any, false, 'no product screen was reconstructed');
    const c = buildReport(inputs(md('C')), { now: '2026-09-27T00:00:00.000Z' });
    assert.equal(c.scenes[2].label, 'Screen images simulated');
    assert.equal(c.reconstructed.any, true);
    assert.equal(parseStoryboard(md('A')).frames.length, 4);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('runClock(): time.wall_s is the wall clock from the first stage start to the last end, not the sum of stamps (GS-03)', () => {
  const runs = [
    { at: '2026-09-27T08:39:14.000Z', seconds: 42 },
    { at: '2026-09-27T09:00:00.000Z', seconds: 10 },
    { at: '2026-09-27T09:34:16.000Z', seconds: 24 },
  ];
  assert.equal(runClock(runs), 3344);
  assert.equal(runClock([]), null);
  assert.equal(runClock([{ at: 'nope', seconds: 3 }]), null);
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-rr-clock-'));
  try {
    const r = buildReport({ project, storyboard: '## Frame 1 — Hook\n- duration: 3s\n', stageTimes: { stages_s: { intake: 42, deliver: 24 }, wall_s: 76, runs }, read: [], missing: [] }, { now: '2026-09-27T10:00:00.000Z' });
    assert.equal(r.time.wall_s, 3344);
    assert.equal(r.time.timed_s, 76);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

import { collectInputs } from './run-report.mjs';

test('collectInputs(): without --prospect / --tokens the run record fills them — intake.json declared.prospect,.hyperframes/tokens.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-rr-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-rr-repo-'));
  fs.writeFileSync(path.join(repo, 'prospect.json'), JSON.stringify({ name: 'Dana Okafor', company: 'Northbridge', role: 'Controller', site: 'https://northbridge.example' }));
  fs.writeFileSync(path.join(dir, 'intake.json'), JSON.stringify({ declared: { for: 'sales', prospect: path.join(repo, 'prospect.json') } }));
  fs.mkdirSync(path.join(dir, '.hyperframes'));
  fs.writeFileSync(path.join(dir, '.hyperframes', 'tokens.json'), JSON.stringify({ actual: { usd: 30.88 } }));
  const inputs = collectInputs({ project: dir, doctor: path.join(dir, 'none.json') }, {}, dir);
  assert.deepEqual(Object.keys(inputs.prospect).sort(), ['company', 'name', 'role', 'site']);
  assert.equal(inputs.tokens.actual.usd, 30.88);
  const none = collectInputs({ project: repo, doctor: path.join(repo, 'none.json') }, {}, repo);
  assert.equal(none.prospect, null); assert.equal(none.tokens, null);
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(repo, { recursive: true, force: true });
});
