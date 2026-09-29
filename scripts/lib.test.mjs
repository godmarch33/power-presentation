import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginRoot, pluginData, projectRoot, toolchainDir, userSkillsDir, vendorDir, DATA_DIR_CANDIDATES, PLUGIN_ID } from './lib/paths.mjs';
import { CHROME_HEADLESS_SHELL_BUILD, HYPERFRAMES_PIN, HYPERFRAMES_RANGE, PLAYWRIGHT_PIN, PLUGIN_VERSION, UPSTREAM_REPO, VENDORED_WORKFLOW, readPluginVersion, satisfiesRange, upstreamTag } from './lib/versions.mjs';
import { CAPTURE_SPEC } from './record-flow.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

test('pluginRoot(): env CLAUDE_PLUGIN_ROOT wins, else the directory two levels above scripts/lib', () => {
  assert.equal(pluginRoot({ CLAUDE_PLUGIN_ROOT: '/opt/pp' }), path.resolve('/opt/pp'));
  assert.equal(pluginRoot({}), repoRoot);
  assert.equal(pluginRoot({ CLAUDE_PLUGIN_ROOT: '' }), repoRoot, 'empty env value falls back');
});

test('pluginData(): CLAUDE_PLUGIN_DATA wins, then POWER_PRESENTATION_DATA (exported by the SessionStart hook), then the first ~/.claude/plugins/data/power-presentation* holding a toolchain, else …/power-presentation', () => {
  assert.equal(pluginData({ CLAUDE_PLUGIN_DATA: '/var/pp-data', POWER_PRESENTATION_DATA: '/other' }), path.resolve('/var/pp-data'));
  assert.equal(pluginData({ POWER_PRESENTATION_DATA: '/bridge' }), path.resolve('/bridge'));
  assert.equal(pluginData({ CLAUDE_PLUGIN_DATA: '', POWER_PRESENTATION_DATA: '' }, '/nonexistent-home'), path.join('/nonexistent-home', '.claude', 'plugins', 'data', PLUGIN_ID));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-home-'));
  try {
    const base = path.join(home, '.claude', 'plugins', 'data');
    assert.equal(pluginData({}, home), path.join(base, PLUGIN_ID), 'no data dir at all → the plain id');
    fs.mkdirSync(path.join(base, `${PLUGIN_ID}-inline`, 'toolchain'), { recursive: true });
    assert.equal(pluginData({}, home), path.join(base, PLUGIN_ID), 'a toolchain dir without toolchain.json does not count');
    fs.writeFileSync(path.join(base, `${PLUGIN_ID}-inline`, 'toolchain', 'toolchain.json'), '{}');
    assert.equal(pluginData({}, home), path.join(base, `${PLUGIN_ID}-inline`), 'the inline (--plugin-dir) data dir is found');
    fs.mkdirSync(path.join(base, `${PLUGIN_ID}-my-marketplace`, 'toolchain'), { recursive: true });
    fs.writeFileSync(path.join(base, `${PLUGIN_ID}-my-marketplace`, 'toolchain', 'toolchain.json'), '{}');
    assert.equal(pluginData({}, home), path.join(base, `${PLUGIN_ID}-inline`), 'candidates are tried in order, marketplace dirs after the listed ones');
    fs.mkdirSync(path.join(base, PLUGIN_ID, 'toolchain'), { recursive: true });
    fs.writeFileSync(path.join(base, PLUGIN_ID, 'toolchain', 'toolchain.json'), '{}');
    assert.equal(pluginData({}, home), path.join(base, PLUGIN_ID));
    assert.equal(toolchainDir({}, home), path.join(base, PLUGIN_ID, 'toolchain'));
    assert.equal(userSkillsDir({}, home), path.join(home, '.claude', 'skills'));
    assert.equal(userSkillsDir({ CLAUDE_CONFIG_DIR: '/cfg' }, home), path.join('/cfg', 'skills'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
  assert.equal(PLUGIN_ID, 'power-presentation');
  assert.deepEqual(DATA_DIR_CANDIDATES, ['power-presentation', 'power-presentation-inline']);
  assert.equal(vendorDir({}), path.join(repoRoot, 'vendor'));
});

test('projectRoot(): CLAUDE_PROJECT_DIR wins, else cwd', () => {
  assert.equal(projectRoot({ CLAUDE_PROJECT_DIR: '/work/proj' }, '/elsewhere'), path.resolve('/work/proj'));
  assert.equal(projectRoot({}, '/elsewhere'), path.resolve('/elsewhere'));
});

test('no hard-coded home directory in scripts/', () => {
  const home = os.homedir();
  const files = fs.readdirSync(here).filter((f) => /\.(mjs|py|sh|md)$/.test(f)).map((f) => path.join(here, f));
  files.push(path.join(here, 'lib', 'paths.mjs'), path.join(here, 'lib', 'versions.mjs'), path.join(here, 'lib', 'skill-bundle.mjs'));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!src.includes(home), `${path.relative(repoRoot, f)} hard-codes ${home}`);
    assert.ok(!/\/home\/[a-z]+\//.test(src), `${path.relative(repoRoot, f)} hard-codes a /home/<user>/ path`);
  }
});

test('versions: HyperFrames pin 0.8.47 and range 0.8.x', () => {
  assert.equal(HYPERFRAMES_PIN, '0.8.47');
  assert.equal(HYPERFRAMES_RANGE, '0.8.x');
  assert.ok(satisfiesRange(HYPERFRAMES_PIN), 'the pin must satisfy the declared range');
  assert.ok(satisfiesRange('0.8.46'));
  assert.ok(satisfiesRange('v0.8.50'));
  assert.ok(!satisfiesRange('0.9.0'));
  assert.ok(!satisfiesRange('1.0.0'));
  assert.ok(!satisfiesRange(undefined));
});

test('versions: toolchain and vendoring pins — Playwright ≥ 1.59, the chrome build hyperframes 0.8.47 embeds, the upstream repo and release tag', () => {
  assert.match(PLAYWRIGHT_PIN, /^1\.(59|[6-9]\d)\.\d+$/, 'Playwright ≥ 1.59 for page.screencast');
  assert.equal(CHROME_HEADLESS_SHELL_BUILD, '152.0.7977.30', 'CHROME_VERSION in hyperframes@0.8.47 dist/cli.js (read 2026-09-20)');
  assert.equal(UPSTREAM_REPO, 'heygen-com/hyperframes');
  assert.equal(VENDORED_WORKFLOW, 'product-launch-video');
  assert.equal(upstreamTag(), `v${HYPERFRAMES_PIN}`);
});

test('versions: PLUGIN_VERSION comes from .claude-plugin/plugin.json when present', (t) => {
  const manifestPath = path.join(repoRoot, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    assert.equal(PLUGIN_VERSION, 'unknown');
    return t.skip('plugin.json not present yet (written by the core area); fallback verified');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(PLUGIN_VERSION, manifest.version);
  assert.match(PLUGIN_VERSION, /^\d+\.\d+\.\d+/, 'semver');
});

test('versions: readPluginVersion() returns "unknown" for a root without a manifest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-versions-'));
  try {
    assert.equal(readPluginVersion(tmp), 'unknown');
    fs.mkdirSync(path.join(tmp, '.claude-plugin'));
    fs.writeFileSync(path.join(tmp, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'x', version: '9.9.9' }));
    assert.equal(readPluginVersion(tmp), '9.9.9');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('record-flow CAPTURE_SPEC matches the capture spec', () => {
  assert.deepEqual(CAPTURE_SPEC.viewport, { width: 1920, height: 1080, dpr: 2 });
  assert.deepEqual(CAPTURE_SPEC.screencastSize, { width: 3840, height: 2160 });
  assert.deepEqual(CAPTURE_SPEC.encoder, { codec: 'libx264', crf: 18, fps: 30 });
  assert.equal(CAPTURE_SPEC.cursor, 'none');
  assert.equal(CAPTURE_SPEC.bannedApi, 'recordVideo');
  assert.deepEqual([...CAPTURE_SPEC.artifacts], ['footage.mp4', 'events.jsonl', 'capture-manifest.json']);
  assert.equal(CAPTURE_SPEC.bashTimeoutSec, 300);
});

import { CPUSET_RE, CPUSET_VAR, NICE_VAR, describeThrottle, throttleSpec, throttled } from './lib/throttle.mjs';
import { makeRunner } from './render-path.mjs';
import { spawnSync } from 'node:child_process';

test('throttle: unset variables are a no-op (cmd/args unchanged, no warnings)', () => {
  const spec = throttleSpec({}, { platform: 'linux', tasksetAvailable: () => true });
  assert.deepEqual(spec, { nice: null, cpuset: null, warnings: [] });
  assert.deepEqual(throttled('node', ['a.mjs', '--x'], spec), { cmd: 'node', args: ['a.mjs', '--x'], applied: [] });
  assert.equal(describeThrottle(spec), 'off');
});

test('throttle: nice + cpuset wrap the command as `nice -n N taskset -c LIST cmd args` (children inherit both)', () => {
  const spec = throttleSpec({ [NICE_VAR]: '10', [CPUSET_VAR]: '0-7,16-23' }, { platform: 'linux', tasksetAvailable: () => true });
  assert.deepEqual(spec, { nice: 10, cpuset: '0-7,16-23', warnings: [] });
  const w = throttled('node', ['audio.mjs'], spec);
  assert.equal(w.cmd, 'nice');
  assert.deepEqual(w.args, ['-n', '10', 'taskset', '-c', '0-7,16-23', 'node', 'audio.mjs']);
  assert.deepEqual(w.applied, ['taskset -c 0-7,16-23', 'nice -n 10']);
  assert.equal(describeThrottle(spec), 'nice 10, cpus 0-7,16-23');
  assert.deepEqual(throttled('ffmpeg', ['-i', 'x'], { nice: 5 }).args, ['-n', '5', 'ffmpeg', '-i', 'x'], 'nice alone');
  assert.deepEqual(throttled('ffmpeg', [], { cpuset: '2,4' }).args, ['-c', '2,4', 'ffmpeg'], 'cpuset alone');
});

test('throttle: invalid or unsupported values are dropped with a warning, never applied', () => {
  for (const bad of ['-1', '20', 'ten', '1.5']) {
    const spec = throttleSpec({ [NICE_VAR]: bad }, { platform: 'linux', tasksetAvailable: () => true });
    assert.equal(spec.nice, null, `nice ${bad}`);
    assert.match(spec.warnings[0], /POWER_PRESENTATION_NICE=.* ignored/);
  }
  for (const bad of ['0-7;16', 'all', '0-7 16', '']) {
    const spec = throttleSpec({ [CPUSET_VAR]: bad }, { platform: 'linux', tasksetAvailable: () => true });
    assert.equal(spec.cpuset, null, `cpuset "${bad}"`);
    if (bad !== '') assert.match(spec.warnings[0], /POWER_PRESENTATION_CPUSET=.* ignored/);
    else assert.equal(spec.warnings.length, 0, 'empty string = unset');
  }
  assert.ok(CPUSET_RE.test('0-7,16-23') && CPUSET_RE.test('3') && !CPUSET_RE.test('0-7,'));
  const mac = throttleSpec({ [CPUSET_VAR]: '0-3', [NICE_VAR]: '7' }, { platform: 'darwin', tasksetAvailable: () => true });
  assert.equal(mac.cpuset, null); assert.equal(mac.nice, 7); assert.match(mac.warnings[0], /taskset is Linux-only/);
  const win = throttleSpec({ [NICE_VAR]: '7' }, { platform: 'win32' });
  assert.equal(win.nice, null); assert.match(win.warnings[0], /Windows/);
  const noTaskset = throttleSpec({ [CPUSET_VAR]: '0-3' }, { platform: 'linux', tasksetAvailable: () => false });
  assert.equal(noTaskset.cpuset, null); assert.match(noTaskset.warnings[0], /taskset is not on PATH/);
});

test('render-path makeRunner: the throttle wraps every command it logs and runs (dry-run shows the wrapped line)', () => {
  const lines = [];
  const spec = throttleSpec({ [NICE_VAR]: '10', [CPUSET_VAR]: '0-7' }, { platform: 'linux', tasksetAvailable: () => true });
  const run = makeRunner({ dryRun: true, log: (s) => lines.push(s), throttle: spec });
  const r = run('node', ['audio.mjs', '--script', 'SCRIPT.md'], { cwd: '/p', timeoutS: 5 });
  assert.equal(r.dry, true);
  assert.ok(lines.some((l) => l.startsWith('throttle: nice 10, cpus 0-7')), lines.join('\n'));
  assert.ok(lines.some((l) => l.startsWith('$ nice -n 10 taskset -c 0-7 node audio.mjs --script SCRIPT.md')), lines.join('\n'));
  const plain = [];
  makeRunner({ dryRun: true, log: (s) => plain.push(s), throttle: throttleSpec({}) })('node', ['x.mjs']);
  assert.deepEqual(plain, ['$ node x.mjs'], 'no throttle → no extra log line, no wrapper');
  const warn = [];
  makeRunner({ dryRun: true, log: (s) => warn.push(s), throttle: throttleSpec({ [NICE_VAR]: '99' }, { platform: 'linux' }) })('node', ['x.mjs']);
  assert.match(warn[0], /^throttle: POWER_PRESENTATION_NICE=99 ignored/);
  assert.equal(warn[1], '$ node x.mjs');
});

test('throttle: a real `nice`/`taskset` wrap runs on this host when the tools exist (skips elsewhere)', (t) => {
  if (process.platform !== 'linux') return t.skip('linux only');
  const spec = throttleSpec({ [NICE_VAR]: '5', [CPUSET_VAR]: '0' });
  if (!spec.cpuset) return t.skip(spec.warnings.join('; ') || 'taskset unavailable');
  const { cmd, args } = throttled(process.execPath, ['-e', 'const os=require("node:os");process.stdout.write(String(os.getPriority()))'], spec);
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const parent = os.getPriority();
  assert.equal(Number(r.stdout), Math.min(19, parent + 5), `child runs at the parent's niceness + 5 (parent ${parent})`);
});
