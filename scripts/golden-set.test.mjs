import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES, verifyFixture, serveStatic, parseArgs, findVhs } from './golden-set.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, 'golden-set.mjs');
const hasPython = (() => { const p = spawnSync('python3', ['--version'], { encoding: 'utf8' }); return !p.error && p.status === 0; })();

test('three MVP fixtures with their facts (mode, length, surface, roles) and the light part in examples/', () => {
  assert.deepEqual(Object.keys(FIXTURES), ['gs-01', 'gs-02', 'gs-03']);
  assert.equal(FIXTURES['gs-01'].mode, 'marketing'); assert.equal(FIXTURES['gs-01'].duration, 45);
  assert.equal(FIXTURES['gs-02'].mode, 'sales'); assert.equal(FIXTURES['gs-02'].duration, 60);
  assert.equal(FIXTURES['gs-03'].surface, 'cli');
  for (const f of Object.values(FIXTURES)) {
    const dir = path.join(here, '..', 'examples', f.dir);
    assert.ok(fs.existsSync(path.join(dir, 'README.md')), `${f.id} README`);
    assert.ok(fs.existsSync(path.join(dir, 'storyboard-skeleton.md')), `${f.id} storyboard skeleton`);
    if (f.claims) assert.ok(fs.existsSync(path.join(dir, f.claims)), `${f.id} claims`);
  }
  assert.ok(fs.existsSync(path.join(here, '..', 'examples', 'gs-02-ledgerly', 'metrics.csv')), 'GS-02 investors run needs metrics.csv');
  assert.ok(fs.existsSync(path.join(here, '..', 'examples', 'gs-03-cli-api', 'bin', 'acmejobs')), 'GS-03 mock CLI for the VHS tape');
  assert.ok(fs.existsSync(path.join(here, '..', 'evals', 'no-trigger-readme-section', 'case.yaml')), 'N2 negative case');
});

test('verify: the light part of every fixture passes offline (heavy part reported as skip when not built)', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-fixtures-'));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  for (const key of Object.keys(FIXTURES)) {
    const r = verifyFixture(key, empty);
    const failed = r.results.filter((c) => c.ok === false);
    assert.deepEqual(failed, [], `${r.fixture}: ${JSON.stringify(failed)}`);
    assert.ok(r.results.some((c) => c.check === 'storyboard-gates' && c.ok), `${r.fixture} storyboard gates`);
    assert.ok(r.results.some((c) => c.ok === null), `${r.fixture} reports the unbuilt heavy part as skip`);
  }
  const gs02 = verifyFixture('gs-02', empty);
  for (const id of ['claims', 'claims-sourced', 'metrics', 'prospect-hook']) assert.ok(gs02.results.some((c) => c.check === id && c.ok), id);
  const gs03 = verifyFixture('gs-03', empty);
  for (const id of ['secondary-classes', 'needs-no-url', 'storyboard-roles']) assert.ok(gs03.results.some((c) => c.check === id && c.ok), id);
});

test('verify: a heavy part with the recording criteria passes; a capture without clicks or zooms fails', (t) => {
  if (!hasPython) return t.skip('python3 not available');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-heavy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const heavy = path.join(dir, 'gs-02');
  fs.mkdirSync(heavy, { recursive: true });
  fs.writeFileSync(path.join(heavy, 'capture-manifest.json'), JSON.stringify({ tier: 'A', blocked: false, redaction: { layer2_ocr_gate: { ran: true, findings: 0, gitleaks: 'ok' } } }));
  fs.writeFileSync(path.join(heavy, 'events.jsonl'), '{"t":1,"type":"navigation"}\n{"t":2,"type":"click","selector":"h2"}\n');
  fs.writeFileSync(path.join(heavy, 'autozoom.json'), JSON.stringify({ segments: [{ start: 1 }], warnings: [], cursor: { path: [[0, 0, 0]] } }));
  let r = verifyFixture('gs-02', dir);
  assert.ok(r.ok, JSON.stringify(r.results.filter((c) => c.ok === false)));
  fs.writeFileSync(path.join(heavy, 'events.jsonl'), '{"t":1,"type":"navigation"}\n');
  fs.writeFileSync(path.join(heavy, 'autozoom.json'), JSON.stringify({ segments: [], warnings: ['capture_size_below_output (16:9): …'], cursor: { path: [] } }));
  r = verifyFixture('gs-02', dir);
  const failed = r.results.filter((c) => c.ok === false).map((c) => c.check);
  assert.deepEqual(failed, ['capture-events', 'autozoom-segments', 'autozoom-size', 'autozoom-cursor']);
});

test('serveStatic serves the GS-02 fixture site (index.html at /, 404 elsewhere, no path escape)', async () => {
  const site = path.join(here, '..', 'examples', 'gs-02-ledgerly', 'site');
  const { server, url } = await serveStatic(site);
  try {
    const index = await fetch(url);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Close the books in 3 days, not 12/);
    assert.equal((await fetch(`${url}nope.html`)).status, 404);
    assert.notEqual((await fetch(`${url}..%2F..%2FREADME.md`)).status, 200);
  } finally {
    server.close();
  }
});

test('CLI: list, usage errors, findVhs shape', () => {
  const r = spawnSync('node', [SCRIPT, 'list'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /GS-01\s+Plausible/);
  assert.match(r.stdout, /GS-03\s+Acme Jobs/);
  assert.equal(spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', [SCRIPT, 'verify', '--only', 'gs-99'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', [SCRIPT, '--definitely-not-a-flag'], { encoding: 'utf8' }).status, 2);
  assert.match(spawnSync('node', [SCRIPT, '--help'], { encoding: 'utf8' }).stdout, /Usage/);
  assert.deepEqual(parseArgs(['build', '--only', 'gs-02,gs-03', '--json']).only, ['gs-02', 'gs-03']);
  const v = findVhs();
  assert.ok(v === null || typeof v === 'string');
});
