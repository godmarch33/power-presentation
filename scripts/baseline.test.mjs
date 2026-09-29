import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, measureRun, renderTable, parseArgs } from './baseline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, 'baseline.mjs');
const available = (cmd, args = ['--version']) => { const p = spawnSync(cmd, args, { encoding: 'utf8' }); return !p.error && p.status === 0; };
const ready = available('python3') && available('ffmpeg', ['-version']) && available('ffprobe', ['-version']);

test('routes: brag runs on GS-02 only; hyperframes and plugin on all three', () => {
  assert.deepEqual(ROUTES.brag.fixtures, ['gs-02']);
  assert.deepEqual(ROUTES.hyperframes.fixtures, ['gs-01', 'gs-02', 'gs-03']);
  assert.deepEqual(ROUTES.plugin.fixtures, ['gs-01', 'gs-02', 'gs-03']);
});

test('measureRun: not_run without a master; a synthetic master yields the ffmpeg gates, a scorecard and a contact sheet', (t) => {
  if (!ready) return t.skip('python3 / ffmpeg not available');
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-runs-'));
  t.after(() => fs.rmSync(runs, { recursive: true, force: true }));
  assert.equal(measureRun('brag', 'gs-02', runs).status, 'not_run');
  const dir = path.join(runs, 'brag', 'gs-02');
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-t', '8', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '8', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-filter_complex', '[1:a]volume=7.8dB[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(dir, 'final.mp4')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  fs.writeFileSync(path.join(dir, 'notes.md'), 'synthetic master for the harness test');
  const m = measureRun('brag', 'gs-02', runs);
  assert.equal(m.status, 'measured', JSON.stringify(m));
  assert.equal(m.duration_sec, 8);
  assert.equal(m.cuts, 0);
  assert.equal(m.frozen_pct, 0);
  assert.ok(Math.abs(m.lufs + 14) <= 1.5, `lufs ${m.lufs}`);
  assert.ok(m.gates_failed.includes('QA-01'), '8 s against the 60 s golden brief fails QA-01');
  assert.ok(m.not_measured.includes('QA-04'), 'no storyboard → storyboard gates unmeasured (brag has none)');
  assert.ok(fs.existsSync(m.contact_sheet));
  assert.equal(m.notes, 'synthetic master for the harness test');
  const table = renderTable({ runs: [m, { route: 'plugin', fixture: 'GS-01', status: 'not_run' }] });
  assert.match(table, /\| brag \| GS-02 \| 8\.0 \| 0 \/ 8\.0 \|/);
  assert.match(table, /\| plugin \| GS-01 \| — .*\*not_run\*/);
  assert.ok(fs.existsSync(path.join(runs, '..', 'trend.tsv')) || fs.existsSync(path.join(path.dirname(runs), 'trend.tsv')));
});

test('CLI: list, usage, table without a JSON', () => {
  const r = spawnSync('node', [SCRIPT, 'list', '--runs', os.tmpdir()], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /brag\s+GS-02\s+not run/);
  assert.equal(spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', [SCRIPT, '--nope'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', [SCRIPT, 'table', '--out', path.join(os.tmpdir(), 'no-such-baseline.json')], { encoding: 'utf8' }).status, 3);
  assert.equal(parseArgs(['measure', '--json']).json, true);
});
