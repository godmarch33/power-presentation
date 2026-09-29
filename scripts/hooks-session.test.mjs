import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HYPERFRAMES_PIN } from './lib/versions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const sessionHook = path.join(repoRoot, 'hooks', 'session-start.sh');
const installHook = path.join(repoRoot, 'hooks', 'toolchain-install.sh');
const tmpDirs = [];
function tmp(prefix = 'pp-hook-') { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); tmpDirs.push(d); return d; }
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function binAvailable(bin) { const r = spawnSync(bin, ['--version'], { encoding: 'utf8' }); return !r.error && r.status === 0; }
const canRun = binAvailable('bash') && (binAvailable('jq') || binAvailable('python3'));

function isolatedPath({ node = true, fakes = {} } = {}) {
  const bin = tmp('pp-hook-bin-');
  const link = (name, target) => { try { fs.symlinkSync(target, path.join(bin, name)); } catch { } };
  if (node) link('node', process.execPath);
  for (const tool of ['bash', 'sh', 'cat', 'dirname', 'mkdir', 'printf', 'grep', 'sed', 'head', 'tr', 'timeout', 'jq', 'python3', 'git', 'ffmpeg', 'ffprobe']) {
    const r = spawnSync('which', [tool], { encoding: 'utf8' });
    if (r.status === 0) link(tool, r.stdout.trim());
  }
  for (const [name, body] of Object.entries(fakes)) fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 });
  return bin;
}

function runSession({ source = 'startup', home = tmp('pp-home-'), data = tmp('pp-data-'), env = {}, node = true, cwd = repoRoot } = {}) {
  const envFile = path.join(tmp(), 'env.sh');
  const r = spawnSync('bash', [sessionHook], {
    input: JSON.stringify({ session_id: 's', cwd, hook_event_name: 'SessionStart', source }),
    encoding: 'utf8', timeout: 60000,
    env: { PATH: isolatedPath({ node }), HOME: home, CLAUDE_PLUGIN_ROOT: repoRoot, CLAUDE_PLUGIN_DATA: data, CLAUDE_ENV_FILE: envFile, ...env },
  });
  return { ...r, envFile, home, data };
}

test('session-start.sh: fresh machine — one context line, missing toolchain named, vendored workflow seeded into ~/.claude/skills with reloadSkills, env exported', (t) => {
  if (!canRun) return t.skip('bash + jq/python3 needed');
  const r = runSession();
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1, `exactly one stdout line: ${r.stdout}`);
  const out = JSON.parse(lines[0]);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(out.hookSpecificOutput.reloadSkills, true);
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /^power-presentation \d+\.\d+\.\d+ \(session startup, privacy=default, data /);
  assert.match(ctx, /toolchain missing under .*missing: hyperframes CLI/);
  assert.match(ctx, /the async SessionStart installer is fetching the toolchain now/);
  assert.match(ctx, /product-launch-video seeded from the vendored copy/);
  assert.match(ctx, /env exported to later Bash commands/);
  assert.ok(fs.existsSync(path.join(r.home, '.claude', 'skills', 'product-launch-video', 'SKILL.md')), 'seeded');
  const envText = fs.readFileSync(r.envFile, 'utf8');
  assert.match(envText, new RegExp(`^export POWER_PRESENTATION_DATA='${r.data.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'$`, 'm'));
  assert.match(envText, /^export HYPERFRAMES_SKIP_SKILLS=1$/m);
  assert.doesNotMatch(envText, /NO_TELEMETRY/, 'default profile exports no privacy switches');
  const again = runSession({ home: r.home, data: r.data });
  assert.doesNotMatch(again.stdout, /reloadSkills/, 'already seeded → plain text line');
  assert.doesNotMatch(again.stdout, /seeded from/);
});

test('session-start.sh: privacy=local — switches exported, no automatic download, the manifest command named', (t) => {
  if (!canRun) return t.skip('bash + jq/python3 needed');
  const r = runSession({ env: { CLAUDE_PLUGIN_OPTION_PRIVACY: 'local', POWER_PRESENTATION_NO_SEED_WORKFLOW: '1' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /privacy=local/);
  assert.match(r.stdout, /privacy=local: no automatic download — show the user `node .*toolchain\.mjs manifest` and, once confirmed, run `node .*toolchain\.mjs install --confirm-network`/);
  assert.doesNotMatch(r.stdout, /seeded from/, 'opt-out honoured');
  assert.ok(!fs.existsSync(path.join(r.home, '.claude', 'skills', 'product-launch-video')));
  const envText = fs.readFileSync(r.envFile, 'utf8');
  for (const l of ['export HYPERFRAMES_NO_TELEMETRY=1', 'export DO_NOT_TRACK=1', 'export HYPERFRAMES_NO_UPDATE_CHECK=1', 'export HYPERFRAMES_SKIP_SKILLS=1', 'export POWER_PRESENTATION_PRIVACY=local']) assert.ok(envText.includes(l), l);
  const off = runSession({ env: { POWER_PRESENTATION_NO_AUTO_INSTALL: '1' } });
  assert.match(off.stdout, /auto-install off \(POWER_PRESENTATION_NO_AUTO_INSTALL=1\)/);
});

test('session-start.sh: a ready toolchain in the data dir is reported as ready with the doctor gate; an installed workflow that drifted is flagged', (t) => {
  if (!canRun) return t.skip('bash + jq/python3 needed');
  const { default: build } = { default: null };
  const data = tmp('pp-data-');
  const tc = path.join(data, 'toolchain');
  fs.mkdirSync(path.join(tc, 'node_modules', '.bin'), { recursive: true });
  fs.mkdirSync(path.join(tc, 'node_modules', 'hyperframes', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(tc, 'node_modules', 'hyperframes', 'package.json'), JSON.stringify({ version: HYPERFRAMES_PIN }));
  fs.writeFileSync(path.join(tc, 'node_modules', 'hyperframes', 'dist', 'cli.js'), 'CHROME_VERSION = "1.2.3.4";');
  fs.writeFileSync(path.join(tc, 'node_modules', '.bin', 'hyperframes'), '#!/bin/sh\necho 0.8.47\n', { mode: 0o755 });
  fs.mkdirSync(path.join(tc, 'node_modules', 'playwright'), { recursive: true });
  fs.writeFileSync(path.join(tc, 'node_modules', 'playwright', 'package.json'), JSON.stringify({ version: '1.63.0' }));
  const exeDir = path.join(tc, 'chrome', 'chrome-headless-shell', 'linux-1.2.3.4', 'chrome-headless-shell-linux64');
  fs.mkdirSync(exeDir, { recursive: true });
  fs.writeFileSync(path.join(exeDir, 'chrome-headless-shell'), '#!/bin/sh\n', { mode: 0o755 });
  fs.mkdirSync(path.join(tc, 'ms-playwright', 'chromium-1'), { recursive: true });
  fs.mkdirSync(path.join(tc, 'ms-playwright', 'chromium_headless_shell-1'), { recursive: true });
  fs.mkdirSync(path.join(tc, 'node_modules', 'ffmpeg-static'), { recursive: true });
  fs.writeFileSync(path.join(tc, 'node_modules', 'ffmpeg-static', 'ffmpeg'), '#!/bin/sh\n', { mode: 0o755 });
  const probeDir = path.join(tc, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch);
  fs.mkdirSync(probeDir, { recursive: true });
  fs.writeFileSync(path.join(probeDir, 'ffprobe'), '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(path.join(data, 'doctor.json'), JSON.stringify({ schema: 'power-presentation/doctor@0.1', checked_at: 'x', hyperframes: HYPERFRAMES_PIN, gate: { ok: true, failed: [], optional_missing: ['whisper-cpp'] } }));
  const home = tmp('pp-home-');
  const inst = path.join(home, '.claude', 'skills', 'product-launch-video');
  fs.mkdirSync(inst, { recursive: true });
  fs.writeFileSync(path.join(inst, 'SKILL.md'), '# a different copy');
  const r = runSession({ home, data });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /toolchain ready at .*hyperframes 0\.8\.47, chrome-headless-shell 1\.2\.3\.4 \(toolchain\), playwright 1\.63\.0, ffmpeg (system|toolchain), kokoro [^;]*; doctor gate ok \(optional missing: whisper-cpp\)/);
  assert.doesNotMatch(r.stdout, /installer is fetching/);
  assert.match(r.stdout, /product-launch-video in .* differs from the vendored copy \(drift/);
  assert.doesNotMatch(r.stdout, /seeded from/, 'an installed copy is never overwritten');
  assert.equal(fs.readFileSync(path.join(inst, 'SKILL.md'), 'utf8'), '# a different copy');
  const envText = fs.readFileSync(r.envFile, 'utf8');
  assert.match(envText, /^export PATH='.*\/toolchain\/node_modules\/\.bin'":\$PATH"$/m);
  assert.match(envText, /^export HYPERFRAMES_BROWSER_PATH='.*chrome-headless-shell'$/m);
  assert.match(envText, /^export PLAYWRIGHT_BROWSERS_PATH='.*ms-playwright'$/m);
  assert.equal(build, null);
});

test('session-start.sh: an expired sales prospect inside a run workspace (power-presentation-out/<name>/) is reported', (t) => {
  if (!canRun) return t.skip('bash + jq/python3 needed');
  const repo = tmp('pp-hook-repo-');
  const ws = path.join(repo, 'power-presentation-out', 'shop-sales-harborline');
  fs.mkdirSync(path.join(ws, '.hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(ws, '.hyperframes', 'prospect-retention.json'), JSON.stringify({ schema: 'power-presentation/prospect-retention@0.1', prospect_file: null, fields: [], stamped_at: '2026-01-01T00:00:00.000Z', delete_after: '2026-01-31T00:00:00.000Z', purged_at: null }));
  const r = runSession({ cwd: repo });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /the sales prospect's data in [^ ]*power-presentation-out\/shop-sales-harborline is past its 30 days/);
  const clean = runSession({ cwd: tmp('pp-hook-repo-') });
  assert.doesNotMatch(clean.stdout, /the sales prospect's data/, 'no workspace, no reminder');
});

test('session-start.sh: without node the hook still exits 0 and says the toolchain cannot be probed (prerequisite)', (t) => {
  if (!canRun) return t.skip('bash + jq/python3 needed');
  const r = runSession({ node: false });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /node is not on PATH — the toolchain cannot be probed or installed/);
});

test('toolchain-install.sh: silent when auto-install is off, under privacy=local, or when the toolchain is ready; otherwise it runs the installer and reports through additionalContext', (t) => {
  if (!canRun) return t.skip('bash + jq/python3 needed');
  const run = (env, data = tmp('pp-data-')) => spawnSync('bash', [installHook], { input: '{"source":"startup"}', encoding: 'utf8', timeout: 60000, env: { PATH: isolatedPath({ fakes: env.__fakes ?? {} }), HOME: tmp('pp-home-'), CLAUDE_PLUGIN_ROOT: repoRoot, CLAUDE_PLUGIN_DATA: data, ...env } });
  const off = run({ POWER_PRESENTATION_NO_AUTO_INSTALL: '1' });
  assert.equal(off.status, 0); assert.equal(off.stdout, ''); assert.match(off.stderr, /auto-install disabled/);
  const local = run({ CLAUDE_PLUGIN_OPTION_PRIVACY: 'local' });
  assert.equal(local.stdout, ''); assert.match(local.stderr, /privacy=local: no automatic download/);
  const failing = run({ __fakes: { npm: '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 9.0.0; exit 0; fi\necho "npm ERR! offline" >&2; exit 1\n' } });
  assert.equal(failing.status, 0, failing.stderr);
  const out = JSON.parse(failing.stdout.trim());
  assert.match(out.hookSpecificOutput.additionalContext, /toolchain install FAILED: npm install failed/);
  assert.match(out.hookSpecificOutput.additionalContext, /install\.log/);
});
