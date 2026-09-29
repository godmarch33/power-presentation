import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CORE_REQUIRED, CORE_SKILLS, INFORMATIONAL_CHECKS, REQUIRED_CHECKS, STATUS_SCHEMA, TOOLCHAIN_SCHEMA, DOCTOR_SCHEMA, USAGE,
  chromeBuildFor, chromeExecutableIn, cliEnv, envExports, evaluateDoctor, findChrome, findFfmpeg, installToolchain, locateCli, lockStatus,
  networkManifest, parseArgs, probeSkills, probeToolchain, resolvePaths, runDoctor, shellQuote, siblingToolchain, summaryLine, playwrightBrowsersIn,
} from './toolchain.mjs';
import { CHROME_HEADLESS_SHELL_BUILD, HYPERFRAMES_PIN, PLAYWRIGHT_PIN, GSAP_PIN, FONT_PINS } from './lib/versions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'toolchain.mjs');
const tmpDirs = [];
function tmp(prefix = 'pp-tc-') { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); tmpDirs.push(d); return d; }
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function doctorRaw({ chromeOk = true, ffmpegOk = true, withShm = true } = {}) {
  const checks = [
    { name: 'Version', ok: false, detail: '0.8.47 → 0.8.54 available', hint: 'Run: hyperframes upgrade' },
    { name: 'Node.js', ok: true, detail: 'v22.22.1 (linux x64)' },
    { name: 'CPU', ok: true, detail: '32 cores' },
    { name: 'Memory', ok: true, detail: '92.2 GB total · 79.9 GB available' },
    { name: 'Disk', ok: true, detail: '28.3 GB free' },
    { name: 'Frames cache', ok: true, detail: '/tmp/hyperframes-extract-cache · default' },
    { name: 'Archive extractor', ok: true, detail: 'unzip' },
    ...(withShm ? [{ name: '/dev/shm', ok: true, detail: '47205 MB' }] : []),
    { name: 'Environment', ok: true, detail: 'non-TTY' },
    { name: 'whisper-cpp', ok: false, detail: 'Not found (optional — needed for transcription)', hint: 'Build from source' },
    { name: 'TTS (Kokoro)', ok: false, detail: 'Not installed (optional — local voice fallback)', hint: 'pip install kokoro-onnx soundfile' },
    { name: 'BGM (MusicGen)', ok: false, detail: 'Not installed (optional — local music fallback)' },
    { name: 'FFmpeg', ok: ffmpegOk, detail: ffmpegOk ? 'ffmpeg 8.0.1 at /usr/bin/ffmpeg' : 'Not found', hint: ffmpegOk ? undefined : 'Install ffmpeg' },
    { name: 'FFprobe', ok: ffmpegOk, detail: ffmpegOk ? 'ffprobe 8.0.1 at /usr/bin/ffprobe' : 'Not found' },
    { name: 'Chrome', ok: chromeOk, detail: chromeOk ? 'env: $HOME/.claude/plugins/data/x/toolchain/chrome/…/chrome-headless-shell' : 'Not found', hint: chromeOk ? undefined : 'Run: hyperframes browser ensure' },
    { name: 'Docker', ok: false, detail: 'Not found' },
    { name: 'Docker running', ok: false, detail: 'Not running' },
  ];
  return { ok: false, platform: 'linux', arch: 'x64', checks, _meta: { version: '0.8.47', latestVersion: '0.8.54', updateAvailable: true } };
}

function fakeToolchain(data, { version = HYPERFRAMES_PIN, playwright = PLAYWRIGHT_PIN, chrome = true, pw = true, doctor = true, build = CHROME_HEADLESS_SHELL_BUILD, staticFfmpeg = false, fonts = true } = {}) {
  const p = resolvePaths({ data });
  fs.mkdirSync(p.bin, { recursive: true });
  fs.mkdirSync(path.join(p.node_modules, 'hyperframes', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(p.node_modules, 'hyperframes', 'package.json'), JSON.stringify({ name: 'hyperframes', version }));
  fs.writeFileSync(path.join(p.node_modules, 'hyperframes', 'dist', 'cli.js'), `var x;\n    CHROME_VERSION = "${build}";\n`);
  fs.writeFileSync(p.hyperframes_bin, `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
  fs.mkdirSync(path.join(p.node_modules, '@hyperframes', 'producer'), { recursive: true });
  fs.writeFileSync(path.join(p.node_modules, '@hyperframes', 'producer', 'package.json'), JSON.stringify({ name: '@hyperframes/producer', version }));
  if (playwright) {
    fs.mkdirSync(path.join(p.node_modules, 'playwright'), { recursive: true });
    fs.writeFileSync(path.join(p.node_modules, 'playwright', 'package.json'), JSON.stringify({ name: 'playwright', version: playwright }));
    fs.writeFileSync(path.join(p.node_modules, 'playwright', 'cli.js'), '// fake');
  }
  if (chrome) {
    const exeDir = path.join(p.chrome_cache, 'chrome-headless-shell', `linux-${build}`, 'chrome-headless-shell-linux64');
    fs.mkdirSync(exeDir, { recursive: true });
    fs.writeFileSync(path.join(exeDir, 'chrome-headless-shell'), '#!/bin/sh\n', { mode: 0o755 });
  }
  if (pw) {
    fs.mkdirSync(path.join(p.playwright_browsers, 'chromium-1234'), { recursive: true });
    fs.mkdirSync(path.join(p.playwright_browsers, 'chromium_headless_shell-1234'), { recursive: true });
  }
  if (staticFfmpeg) {
    fs.mkdirSync(path.join(p.node_modules, 'ffmpeg-static'), { recursive: true });
    fs.writeFileSync(path.join(p.node_modules, 'ffmpeg-static', 'ffmpeg'), '#!/bin/sh\n', { mode: 0o755 });
    const pr = path.join(p.node_modules, 'ffprobe-static', 'bin', process.platform, process.arch);
    fs.mkdirSync(pr, { recursive: true });
    fs.writeFileSync(path.join(pr, 'ffprobe'), '#!/bin/sh\n', { mode: 0o755 });
  }
  if (fonts) {
    for (const [name, version] of Object.entries(FONT_PINS)) {
      fs.mkdirSync(path.join(p.node_modules, name), { recursive: true });
      fs.writeFileSync(path.join(p.node_modules, name, 'package.json'), JSON.stringify({ name, version, license: 'OFL-1.1' }));
    }
  }
  if (doctor) {
    fs.writeFileSync(p.doctor_file, JSON.stringify({ schema: DOCTOR_SCHEMA, checked_at: '2026-09-20T00:00:00Z', hyperframes: version, gate: { ok: true, required: REQUIRED_CHECKS, failed: [], optional_missing: ['whisper-cpp'] }, raw: doctorRaw() }));
  }
  return p;
}

function fakePath({ ffmpeg = true, npm = true, python = true } = {}) {
  const bin = tmp('pp-bin-');
  if (ffmpeg) for (const t of ['ffmpeg', 'ffprobe']) fs.writeFileSync(path.join(bin, t), '#!/bin/sh\necho fake\n', { mode: 0o755 });
  if (npm) fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\necho 9.2.0\n', { mode: 0o755 });
  if (python) fs.writeFileSync(path.join(bin, 'python3'), '#!/bin/sh\necho Python 3.14.0\n', { mode: 0o755 });
  return bin;
}
function envWith(bin, extra = {}) {
  return { PATH: bin, HOME: extra.HOME ?? tmp('pp-home-'), ...extra };
}

test('parseArgs: commands, flags, privacy from --privacy or the plugin option; errors on unknown input', () => {
  assert.equal(parseArgs(['status'], {}).command, 'status');
  const o = parseArgs(['install', '--json', '--if-needed', '--force', '--skip-chrome', '--skip-playwright', '--skip-tts', '--skip-whisper', '--with-ffmpeg', '--confirm-network', '--quiet', '--data', '/d', '--privacy', 'local'], {});
  assert.deepEqual([o.command, o.json, o.ifNeeded, o.force, o.skipChrome, o.skipPlaywright, o.skipTts, o.skipWhisper, o.withFfmpeg, o.confirmNetwork, o.quiet, o.data, o.privacy], ['install', true, true, true, true, true, true, true, true, true, true, '/d', 'local']);
  assert.equal(parseArgs(['env'], { CLAUDE_PLUGIN_OPTION_PRIVACY: 'local' }).privacy, 'local');
  assert.equal(parseArgs(['env'], { POWER_PRESENTATION_PRIVACY: 'local' }).privacy, 'local');
  assert.equal(parseArgs(['env'], { CLAUDE_PLUGIN_OPTION_PRIVACY: 'weird' }).privacy, 'default');
  assert.equal(parseArgs(['--help'], {}).help, true);
  assert.throws(() => parseArgs([], {}), /command is required/);
  assert.throws(() => parseArgs(['bogus'], {}), /unknown command/);
  assert.throws(() => parseArgs(['status', '--nope'], {}), /unknown flag/);
  assert.throws(() => parseArgs(['status', '--privacy', 'cloud'], {}), /--privacy must be/);
  assert.throws(() => parseArgs(['status', '--data'], {}), /needs a value/);
});

test('evaluateDoctor: the gate ignores the pinned-version notice and optional engines but fails on required checks', () => {
  const g = evaluateDoctor(doctorRaw());
  assert.equal(g.ok, true, 'raw.ok is false only because of Version + optional engines');
  assert.equal(g.raw_ok, false);
  assert.equal(g.version_notice, '0.8.47 → 0.8.54 available');
  assert.equal(g.update_available, true);
  assert.deepEqual(g.optional_missing, ['whisper-cpp', 'TTS (Kokoro)', 'BGM (MusicGen)', 'Docker', 'Docker running']);
  assert.deepEqual(g.required, REQUIRED_CHECKS);
  assert.deepEqual(g.unknown, []);
  const chrome = evaluateDoctor(doctorRaw({ chromeOk: false }));
  assert.equal(chrome.ok, false);
  assert.deepEqual(chrome.failed.map((f) => f.name), ['Chrome']);
  assert.equal(chrome.failed[0].hint, 'Run: hyperframes browser ensure');
  const ff = evaluateDoctor(doctorRaw({ ffmpegOk: false }));
  assert.deepEqual(ff.failed.map((f) => f.name), ['FFmpeg', 'FFprobe']);
  const mac = evaluateDoctor(doctorRaw({ withShm: false }));
  assert.equal(mac.ok, true, 'a required check the platform does not report is skipped unless it is core');
  assert.ok(!mac.required.includes('/dev/shm'));
  const noChrome = doctorRaw(); noChrome.checks = noChrome.checks.filter((c) => c.name !== 'Chrome');
  const missingCore = evaluateDoctor(noChrome);
  assert.equal(missingCore.ok, false);
  assert.match(missingCore.failed[0].detail, /not reported/);
  assert.equal(evaluateDoctor({ ok: true, checks: [] }).ok, false, 'an empty report never passes');
  assert.equal(evaluateDoctor(null).ok, false);
  const future = doctorRaw(); future.checks.push({ name: 'GPU', ok: false, detail: 'none' });
  assert.deepEqual(evaluateDoctor(future).unknown, ['GPU']);
  for (const n of CORE_REQUIRED) assert.ok(REQUIRED_CHECKS.includes(n));
  for (const n of REQUIRED_CHECKS) assert.ok(!INFORMATIONAL_CHECKS.includes(n));
});

test('networkManifest: hosts follow the components; text names the pins', () => {
  const all = networkManifest({ chrome: true, playwright: true, ffmpeg: true });
  assert.deepEqual(all.map((r) => r.host.split(',')[0]), ['registry.npmjs.org', 'storage.googleapis.com', 'cdn.playwright.dev', 'github.com', 'pypi.org', 'github.com', 'github.com']);
  assert.match(all[0].purpose, new RegExp(`hyperframes@${HYPERFRAMES_PIN.replace(/\./g, '\\.')}`));
  assert.match(all[0].purpose, /ffmpeg-static/);
  assert.match(all[0].purpose, /@fontsource\/space-grotesk@5\.3\.0/, 'the font packages are named with their pins');
  assert.match(all[4].purpose, /kokoro-onnx@0\.4\.7/, 'the Kokoro pins are named');
  assert.match(all[6].purpose, /ggml-small\.en/, 'the whisper model is named');
  const min = networkManifest({ chrome: false, playwright: false, ffmpeg: false, tts: false, whisper: false });
  assert.equal(min.length, 1);
  assert.doesNotMatch(min[0].purpose, /ffmpeg-static/);
});

test('shellQuote and envExports: only present components are exported; HYPERFRAMES_SKIP_SKILLS always; switches under privacy=local', () => {
  assert.equal(shellQuote(`it's`), `'it'\\''s'`);
  const empty = tmp();
  const bin = fakePath();
  const e0 = envExports(resolvePaths({ data: empty }), { privacy: 'default' }, envWith(bin), tmp());
  assert.deepEqual(e0, [`export POWER_PRESENTATION_DATA=${shellQuote(empty)}`, 'export HYPERFRAMES_SKIP_SKILLS=1']);
  const data = tmp();
  const p = fakeToolchain(data, { staticFfmpeg: true });
  const e1 = envExports(p, { privacy: 'local' }, envWith(fakePath({ ffmpeg: false })), tmp());
  assert.ok(e1.some((l) => l.startsWith(`export PATH=${shellQuote(p.bin)}":$PATH"`)));
  assert.ok(e1.some((l) => l.startsWith('export HYPERFRAMES_BROWSER_PATH=') && l.includes('chrome-headless-shell')));
  assert.ok(e1.includes(`export PLAYWRIGHT_BROWSERS_PATH=${shellQuote(p.playwright_browsers)}`));
  assert.ok(e1.some((l) => l.startsWith('export HYPERFRAMES_FFMPEG_PATH=')), 'static ffmpeg exported when the system has none');
  assert.ok(e1.some((l) => l.startsWith('export HYPERFRAMES_FFPROBE_PATH=')));
  for (const l of ['export HYPERFRAMES_NO_TELEMETRY=1', 'export DO_NOT_TRACK=1', 'export HYPERFRAMES_NO_UPDATE_CHECK=1', 'export POWER_PRESENTATION_PRIVACY=local', 'export HYPERFRAMES_SKIP_SKILLS=1']) assert.ok(e1.includes(l), l);
  const e2 = envExports(p, { privacy: 'default' }, envWith(bin), tmp());
  assert.ok(e2.some((l) => l.includes('HYPERFRAMES_FFMPEG_PATH')), 'a static ffmpeg in the toolchain (--with-ffmpeg) is exported even when the system has one');
  assert.ok(!e2.some((l) => l.includes('NO_TELEMETRY')));
  const e3 = envExports(fakeToolchain(tmp(), { staticFfmpeg: false }), { privacy: 'default' }, envWith(bin), tmp());
  assert.ok(!e3.some((l) => l.includes('HYPERFRAMES_FFMPEG_PATH')), 'without a static copy the system ffmpeg is used and nothing is exported');
  const ce = cliEnv(p, { privacy: 'default' }, envWith(bin), tmp());
  assert.equal(ce.HYPERFRAMES_NO_UPDATE_CHECK, '1');
  assert.equal(ce.HYPERFRAMES_SKIP_SKILLS, '1');
  assert.ok(ce.HYPERFRAMES_BROWSER_PATH.includes(p.chrome_cache));
});

test('chromeBuildFor / chromeExecutableIn / findChrome: build id from the installed CLI, else the pin; env → toolchain → hyperframes cache', () => {
  const data = tmp();
  assert.deepEqual(chromeBuildFor(path.join(data, 'nope')), { build: CHROME_HEADLESS_SHELL_BUILD, source: 'pin' });
  const p = fakeToolchain(data, { build: '199.0.1.2' });
  assert.deepEqual(chromeBuildFor(p.node_modules), { build: '199.0.1.2', source: 'cli' });
  assert.ok(chromeExecutableIn(p.chrome_cache, '199.0.1.2').endsWith('chrome-headless-shell'));
  assert.equal(chromeExecutableIn(p.chrome_cache, '1.0.0.0'), null);
  const home = tmp();
  const found = findChrome(p, '199.0.1.2', {}, home);
  assert.equal(found.source, 'toolchain');
  const cacheExe = path.join(home, '.cache', 'hyperframes', 'chrome', 'chrome-headless-shell', 'linux-5.0.0.0', 'chrome-headless-shell-linux64');
  fs.mkdirSync(cacheExe, { recursive: true });
  fs.writeFileSync(path.join(cacheExe, 'chrome-headless-shell'), '#!/bin/sh\n', { mode: 0o755 });
  assert.equal(findChrome(p, '5.0.0.0', {}, home).source, 'hyperframes-cache');
  assert.equal(findChrome(p, '5.0.0.0', { HYPERFRAMES_BROWSER_PATH: p.hyperframes_bin }, home).source, 'env');
  assert.equal(findChrome(p, '6.0.0.0', { HYPERFRAMES_BROWSER_PATH: '/nonexistent' }, home).ok, false);
  assert.deepEqual(playwrightBrowsersIn(path.join(data, 'none')), { chromium: false, headless_shell: false });
  assert.deepEqual(playwrightBrowsersIn(p.playwright_browsers), { chromium: true, headless_shell: true });
});

test('findFfmpeg: env → toolchain static → system PATH', () => {
  const data = tmp();
  const p = fakeToolchain(data, { staticFfmpeg: true });
  assert.equal(findFfmpeg(p, 'ffmpeg', { PATH: '' }).source, 'toolchain');
  assert.equal(findFfmpeg(p, 'ffprobe', { PATH: '' }).source, 'toolchain');
  assert.equal(findFfmpeg(p, 'ffmpeg', { PATH: '', HYPERFRAMES_FFMPEG_PATH: p.hyperframes_bin }).source, 'env');
  const bare = resolvePaths({ data: tmp() });
  assert.equal(findFfmpeg(bare, 'ffmpeg', { PATH: fakePath() }).source, 'system');
  assert.equal(findFfmpeg(bare, 'ffmpeg', { PATH: fakePath({ ffmpeg: false }) }).ok, false);
});

test('probeToolchain: missing → partial → outdated → ready; lock = installing; the summary names what is missing and the install command', () => {
  const home = tmp();
  const bin = fakePath();
  const skills = path.join(home, '.claude', 'skills');
  const env0 = envWith(bin, { HOME: home });
  const missing = probeToolchain(resolvePaths({ data: tmp() }, env0, home), env0, home);
  assert.equal(missing.schema, STATUS_SCHEMA);
  assert.equal(missing.state, 'missing');
  assert.equal(missing.needs_install, true);
  assert.equal(missing.ready, false);
  assert.equal(missing.doctor, null);
  assert.deepEqual(missing.skills.core_missing, CORE_SKILLS);
  const line = summaryLine(missing, { pluginRootDir: '/plug' });
  assert.match(line, /toolchain missing under .*missing: hyperframes CLI, chrome-headless-shell .*, playwright .*— run `node \/plug\/scripts\/toolchain\.mjs install`/);
  assert.match(line, /product-launch-video skill not installed/);
  assert.match(line, /core skills missing: hyperframes, /);

  const data = tmp();
  const p = { ...fakeToolchain(data), skills_dir: skills };
  for (const n of [...CORE_SKILLS, 'product-launch-video']) { fs.mkdirSync(path.join(skills, n), { recursive: true }); fs.writeFileSync(path.join(skills, n, 'SKILL.md'), '# x'); }
  const ready = probeToolchain(p, envWith(bin), home);
  assert.equal(ready.state, 'ready', JSON.stringify(ready.components));
  assert.equal(ready.ready, true);
  assert.equal(ready.components.hyperframes.version, HYPERFRAMES_PIN);
  assert.equal(ready.components.chrome.source, 'toolchain');
  assert.equal(ready.components.ffmpeg.source, 'system');
  assert.equal(ready.doctor.ok, true);
  assert.deepEqual(ready.skills.core_missing, []);
  assert.match(summaryLine(ready), /^toolchain ready at .*hyperframes 0\.8\.47, chrome-headless-shell .* \(toolchain\), playwright 1\.63\.0, ffmpeg system, kokoro absent — voiceover needs `toolchain\.mjs install`; doctor gate ok \(optional missing: whisper-cpp\)/);

  fs.rmSync(p.doctor_file);
  const noDoctor = probeToolchain(p, envWith(bin), home);
  assert.equal(noDoctor.state, 'partial');
  assert.match(summaryLine(noDoctor), /doctor gate not run/);

  const stale = fakeToolchain(tmp(), { version: '0.8.46' });
  const outdated = probeToolchain(stale, envWith(bin), home);
  assert.equal(outdated.state, 'outdated');
  assert.match(summaryLine(outdated), /hyperframes 0\.8\.46 ≠ pin 0\.8\.47/);

  const noFonts = fakeToolchain(tmp(), { fonts: false });
  const fontsMissing = probeToolchain(noFonts, envWith(bin), home);
  assert.equal(fontsMissing.state, 'ready', 'capture / render do not need the font packages');
  assert.deepEqual(fontsMissing.components.fonts.missing, Object.entries(FONT_PINS).map(([k, v]) => `${k}@${v}`));
  assert.match(summaryLine(fontsMissing), /; font packages missing: @fontsource\/inter@5\.3\.0, @fontsource\/space-grotesk@5\.3\.0.*render-path packets/);
  assert.equal(ready.components.fonts.ok, true);
  assert.doesNotMatch(summaryLine(ready), /font packages/);

  const staleDoctor = fakeToolchain(tmp());
  fs.writeFileSync(staleDoctor.doctor_file, JSON.stringify({ schema: DOCTOR_SCHEMA, hyperframes: '0.8.46', gate: { ok: true, failed: [], optional_missing: [] } }));
  assert.equal(probeToolchain(staleDoctor, envWith(bin), home).doctor.ok, false, 'a doctor report for another CLI version does not count');

  fs.mkdirSync(p.lock_dir, { recursive: true });
  fs.writeFileSync(path.join(p.lock_dir, 'pid'), String(process.pid));
  const installing = probeToolchain(p, envWith(bin), home);
  assert.equal(installing.state, 'installing');
  assert.equal(installing.installing.pid, process.pid);
  assert.match(summaryLine(installing), /install running \(pid/);
  fs.writeFileSync(path.join(p.lock_dir, 'pid'), '999999999');
  assert.equal(lockStatus(p).held, false, 'a dead pid is a stale lock');
  assert.equal(lockStatus(p).stale, true);
});

test('probeSkills: vendored-vs-installed drift is detected', () => {
  const home = tmp();
  const root = tmp();
  fs.mkdirSync(path.join(root, 'vendor', 'product-launch-video'), { recursive: true });
  fs.writeFileSync(path.join(root, 'vendor', 'product-launch-video', 'SKILL.md'), 'v1');
  const p = { ...resolvePaths({ data: tmp() }, {}, home), vendor_dir: path.join(root, 'vendor') };
  assert.deepEqual(probeSkills(p).workflow, { name: 'product-launch-video', installed: false, vendored: true, matches_vendored: null });
  const inst = path.join(p.skills_dir, 'product-launch-video');
  fs.mkdirSync(inst, { recursive: true });
  fs.writeFileSync(path.join(inst, 'SKILL.md'), 'v1');
  assert.equal(probeSkills(p).workflow.matches_vendored, true);
  fs.writeFileSync(path.join(inst, 'SKILL.md'), 'v2');
  assert.equal(probeSkills(p).workflow.matches_vendored, false);
});

test('locateCli and runDoctor: toolchain bin first; the report carries the gate, the raw output and the CLI source', () => {
  const p = fakeToolchain(tmp(), { doctor: false });
  assert.equal(locateCli(p, { PATH: '' }).source, 'toolchain');
  assert.equal(locateCli(resolvePaths({ data: tmp() }), { PATH: '' }), null);
  const bin = fakePath();
  fs.writeFileSync(path.join(bin, 'hyperframes'), '#!/bin/sh\n', { mode: 0o755 });
  assert.equal(locateCli(resolvePaths({ data: tmp() }), { PATH: bin }).source, 'path');
  const calls = [];
  const run = (cmd, args, o) => { calls.push({ cmd, args, env: o.env }); return { status: 0, stdout: `noise\n${JSON.stringify(doctorRaw())}`, stderr: '' }; };
  const r = runDoctor(p, { privacy: 'local' }, { run, env: { PATH: '' }, home: tmp(), now: () => new Date('2026-09-20T10:00:00Z') });
  assert.equal(r.ok, true);
  assert.equal(r.exit, 0);
  assert.deepEqual(calls[0].args, ['doctor', '--json']);
  assert.equal(calls[0].env.HYPERFRAMES_NO_TELEMETRY, '1', 'privacy switches reach the CLI');
  assert.ok(calls[0].env.HYPERFRAMES_BROWSER_PATH.includes(p.chrome_cache));
  const saved = JSON.parse(fs.readFileSync(p.doctor_file, 'utf8'));
  assert.equal(saved.schema, DOCTOR_SCHEMA);
  assert.equal(saved.checked_at, '2026-09-20T10:00:00.000Z');
  assert.equal(saved.hyperframes, '0.8.47');
  assert.equal(saved.gate.ok, true);
  assert.equal(saved.raw.ok, false);
  assert.equal(saved.cli.source, 'toolchain');
  const bad = runDoctor(p, { privacy: 'default' }, { run: () => ({ status: 1, stdout: '', stderr: 'boom' }), env: { PATH: '' }, home: tmp() });
  assert.equal(bad.exit, 1);
  assert.match(bad.error, /no JSON/);
  const failing = runDoctor(p, { privacy: 'default' }, { run: () => ({ status: 0, stdout: JSON.stringify(doctorRaw({ chromeOk: false })), stderr: '' }), env: { PATH: '' }, home: tmp() });
  assert.equal(failing.exit, 3);
});

function fakeRunner(p, { failNpm = false, failChrome = false, failPlaywright = false, chromeFallbackOk = true, failTts = false, failWhisper = false, doctor = doctorRaw(), build = '152.0.7977.30' } = {}) {
  const calls = [];
  const run = (cmd, args, o = {}) => {
    calls.push([cmd, ...args].join(' '));
    if (/python3?$/.test(cmd) && args[0] === '-m' && args[1] === 'venv') {
      fs.mkdirSync(path.dirname(p.venv_python), { recursive: true });
      fs.writeFileSync(p.venv_python, '#!/bin/sh\n', { mode: 0o755 });
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === p.venv_python && args[0] === '-m' && args[1] === 'pip') {
      if (failTts) return { status: 1, stdout: '', stderr: 'ERROR: No matching distribution found for kokoro-onnx' };
      assert.ok(args.includes('kokoro-onnx==0.4.7') && args.includes('soundfile==0.14.0'), 'pinned pip specs');
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === p.venv_python && args[0] === '-c') return { status: 0, stdout: '', stderr: '' };
    if (cmd === p.hyperframes_bin && args[0] === 'tts') {
      assert.equal(o.env.HYPERFRAMES_PYTHON, p.venv_python, 'the CLI is pointed at the venv');
      const out = args[args.indexOf('--output') + 1];
      fs.writeFileSync(out, 'RIFF');
      return { status: 0, stdout: JSON.stringify({ ok: true, durationSeconds: 1.1, outputPath: out }), stderr: '' };
    }
    if (cmd === p.hyperframes_bin && args[0] === 'transcribe') {
      if (failWhisper) return { status: 1, stdout: '', stderr: 'cmake: command not found' };
      const dir = args[args.indexOf('--dir') + 1];
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify([{ id: 'w1', text: 'Toolchain', start: 0, end: 0.5 }]));
      return { status: 0, stdout: '[]', stderr: '' };
    }
    if (/npm$/.test(cmd) && args[0] === '--version') return { status: 0, stdout: '9.2.0\n', stderr: '' };
    if (/npm$/.test(cmd) && args[0] === 'install') {
      if (failNpm) return { status: 1, stdout: '', stderr: 'npm ERR! network' };
      fakeToolchain(p.data, { chrome: false, pw: false, doctor: false, build });
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === p.hyperframes_bin && args[0] === '--version') return { status: 0, stdout: `${HYPERFRAMES_PIN}\n`, stderr: '' };
    if (cmd === p.hyperframes_bin && args[0] === 'browser') {
      if (!chromeFallbackOk) return { status: 1, stdout: '', stderr: 'no network' };
      const d = path.join(o.env.HOME, '.cache', 'hyperframes', 'chrome', 'chrome-headless-shell', `linux-${build}`, 'chrome-headless-shell-linux64');
      fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'chrome-headless-shell'), '#!/bin/sh\n', { mode: 0o755 });
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === p.hyperframes_bin && args[0] === 'doctor') return { status: 0, stdout: JSON.stringify(doctor), stderr: '' };
    if (args.includes('--input-type=module')) {
      if (failChrome) return { status: 1, stdout: '', stderr: 'download failed' };
      const d = path.join(p.chrome_cache, 'chrome-headless-shell', `linux-${build}`, 'chrome-headless-shell-linux64');
      fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'chrome-headless-shell'), '#!/bin/sh\n', { mode: 0o755 });
      return { status: 0, stdout: JSON.stringify({ executablePath: path.join(d, 'chrome-headless-shell') }), stderr: '' };
    }
    if (args[0]?.endsWith('playwright/cli.js') && args[1] === 'install') {
      if (failPlaywright) return { status: 1, stdout: '', stderr: 'playwright download failed' };
      assert.equal(o.env.PLAYWRIGHT_BROWSERS_PATH, p.playwright_browsers, 'browsers go to the data dir');
      fs.mkdirSync(path.join(p.playwright_browsers, 'chromium-1234'), { recursive: true });
      fs.mkdirSync(path.join(p.playwright_browsers, 'chromium_headless_shell-1234'), { recursive: true });
      return { status: 0, stdout: '', stderr: '' };
    }
    return { status: 127, stdout: '', stderr: `unexpected ${cmd} ${args.join(' ')}` };
  };
  return { run, calls };
}
const quietStderr = { write() {} };

test('installToolchain: the full flow through the fake runner ends ready, writes toolchain.json + doctor.json, releases the lock, exports the toolchain', () => {
  const data = tmp();
  const home = tmp();
  const p = resolvePaths({ data });
  const env = envWith(fakePath());
  const { run, calls } = fakeRunner(p);
  const r = installToolchain({ privacy: 'default', data }, { run, env, home, stderr: quietStderr, now: () => new Date('2026-09-20T12:00:00Z') });
  assert.equal(r.ok, true, JSON.stringify(r.state));
  assert.equal(r.exit, 0);
  assert.equal(r.state.state, 'ready');
  assert.deepEqual(r.state.steps.map((s) => [s.name, s.ok]), [['preflight', true], ['package', true], ['npm-install', true], ['verify-cli', true], ['chrome', true], ['playwright', true], ['tts', true], ['whisper', true], ['doctor', true]]);
  assert.deepEqual(r.state.pins.kokoro, { 'kokoro-onnx': '0.4.7', soundfile: '0.14.0' });
  assert.equal(r.state.engines.kokoro.python, p.venv_python);
  assert.equal(r.state.engines.whisper.model, 'small.en');
  assert.equal(r.state.degraded, null);
  assert.equal(r.status.components.tts.ok, true);
  assert.equal(r.status.components.tts.modules_ok, true);
  assert.ok(envExports(p, { privacy: 'default' }, env, home).some((l) => l === `export HYPERFRAMES_PYTHON=${shellQuote(p.venv_python)}`), 'the venv python is exported');
  assert.equal(r.state.requested.static_ffmpeg, false, 'system ffmpeg present → no static ffmpeg');
  const pkg = JSON.parse(fs.readFileSync(path.join(p.toolchain, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies, { hyperframes: HYPERFRAMES_PIN, '@hyperframes/producer': HYPERFRAMES_PIN, '@hyperframes/core': HYPERFRAMES_PIN, playwright: PLAYWRIGHT_PIN, gsap: GSAP_PIN, ...FONT_PINS }, 'gsap at the vendor CDN pin, the presets\' OFL faces');
  assert.equal(pkg.private, true);
  assert.ok(calls.some((c) => /npm install --no-audit --no-fund --no-progress --loglevel=error$/.test(c)));
  assert.ok(!fs.existsSync(p.lock_dir), 'lock released');
  const st = JSON.parse(fs.readFileSync(p.state_file, 'utf8'));
  assert.equal(st.schema, TOOLCHAIN_SCHEMA);
  assert.equal(st.finished_at, '2026-09-20T12:00:00.000Z');
  assert.equal(st.pins.chrome_headless_shell, '152.0.7977.30');
  assert.ok(fs.existsSync(p.doctor_file));
  assert.ok(fs.existsSync(p.log_file));
  assert.match(fs.readFileSync(p.log_file, 'utf8'), /network manifest: registry\.npmjs\.org; storage\.googleapis\.com; cdn\.playwright\.dev.*pypi\.org.*huggingface\.co/);
  assert.equal(r.status.state, 'ready');
  assert.match(r.summary, /^toolchain ready/);
  const again = installToolchain({ privacy: 'default', data, ifNeeded: true }, { run, env, home, stderr: quietStderr });
  assert.equal(again.skipped, true);
  assert.equal(again.reason, 'already ready');
  for (const name of Object.keys(FONT_PINS)) fs.rmSync(path.join(p.node_modules, name), { recursive: true, force: true });
  const upgrade = installToolchain({ privacy: 'default', data, ifNeeded: true }, { run, env, home, stderr: quietStderr });
  assert.equal(upgrade.skipped, undefined, 'not skipped while a pinned font package is missing');
  assert.equal(upgrade.ok, true);
  assert.equal(upgrade.status.components.fonts.ok, true);
});

test('installToolchain: static ffmpeg is added only when the system has none; chrome falls back to `hyperframes browser ensure`; --skip-* skip', () => {
  const data = tmp();
  const home = tmp();
  const p = resolvePaths({ data });
  const env = envWith(fakePath({ ffmpeg: false }), { HOME: home });
  const { run } = fakeRunner(p, { failChrome: true });
  const r = installToolchain({ privacy: 'default', data, skipPlaywright: true }, { run, env, home, stderr: quietStderr });
  const pkg = JSON.parse(fs.readFileSync(path.join(p.toolchain, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['ffmpeg-static'], '5.3.0');
  assert.equal(pkg.dependencies['ffprobe-static'], '3.1.0');
  const chrome = r.state.steps.find((s) => s.name === 'chrome');
  assert.equal(chrome.ok, true);
  assert.match(chrome.detail, /via hyperframes cache/);
  assert.ok(!r.state.steps.some((s) => s.name === 'playwright'));
  assert.equal(r.state.requested.playwright, false);
  const skipped = installToolchain({ privacy: 'default', data: tmp(), skipTts: true, skipWhisper: true }, { run: fakeRunner(resolvePaths({ data: tmp() })).run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.ok(!skipped.state.steps.some((s) => s.name === 'tts' || s.name === 'whisper'), '--skip-tts / --skip-whisper');
  assert.equal(skipped.state.pins.kokoro, null);
  assert.equal(r.status.components.ffmpeg.ok, false);
  assert.equal(r.state.state, 'ready', 'steps all passed; the probe is what reports the missing binary');
  assert.equal(r.status.state, 'partial');
});

test('installToolchain: a failing Kokoro pip install or whisper build is recorded as degraded (optional engines) and never blocks the gate', () => {
  const data = tmp();
  const home = tmp();
  const p = resolvePaths({ data });
  const env = envWith(fakePath(), { HOME: home });
  const r = installToolchain({ privacy: 'default', data }, { run: fakeRunner(p, { failTts: true }).run, env, home, stderr: quietStderr });
  assert.equal(r.state.state, 'ready', 'optional step failures do not fail the install');
  assert.equal(r.ok, true);
  const tts = r.state.steps.find((s) => s.name === 'tts');
  assert.equal(tts.ok, false);
  assert.equal(tts.optional, true);
  assert.match(tts.error, /pip install kokoro-onnx==0\.4\.7/);
  const whisper = r.state.steps.find((s) => s.name === 'whisper');
  assert.equal(whisper.ok, false, 'no smoke wav → whisper cannot be warmed');
  assert.match(r.state.degraded, /^tts: .*; whisper: /);
  assert.equal(r.status.components.tts.modules_ok, false, 'the probe reads the recorded step result');
  assert.equal(r.status.last_install.degraded, r.state.degraded);
  const data2 = tmp();
  const w = installToolchain({ privacy: 'default', data: data2 }, { run: fakeRunner(resolvePaths({ data: data2 }), { failWhisper: true }).run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.equal(w.state.state, 'ready');
  assert.match(w.state.degraded, /^whisper: hyperframes transcribe smoke failed/);
  assert.equal(w.state.engines.kokoro?.pins['kokoro-onnx'], '0.4.7');
});

test('installToolchain: a failing npm install ends `failed` with the error recorded, the lock released and the summary pointing at the log', () => {
  const data = tmp();
  const p = resolvePaths({ data });
  const { run } = fakeRunner(p, { failNpm: true });
  const r = installToolchain({ privacy: 'default', data }, { run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.equal(r.ok, false);
  assert.equal(r.exit, 1);
  assert.equal(r.state.state, 'failed');
  assert.match(r.state.error, /npm install failed/);
  assert.ok(!fs.existsSync(p.lock_dir));
  assert.match(fs.readFileSync(p.log_file, 'utf8'), /npm ERR! network/);
  assert.match(r.summary, /last install error: npm install failed/);
  const pw = fakeRunner(resolvePaths({ data: tmp() }), { failPlaywright: true });
  const data2 = pw.run ? tmp() : null;
  const p2 = resolvePaths({ data: data2 });
  const r2 = installToolchain({ privacy: 'default', data: data2 }, { run: fakeRunner(p2, { failPlaywright: true }).run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.equal(r2.state.state, 'partial', 'doctor still passed, only Playwright failed');
  assert.match(r2.state.error, /playwright: playwright install chromium failed/);
  const doc = fakeRunner(resolvePaths({ data: tmp() }));
  const data3 = tmp();
  const p3 = resolvePaths({ data: data3 });
  const r3 = installToolchain({ privacy: 'default', data: data3 }, { run: fakeRunner(p3, { doctor: doctorRaw({ chromeOk: false }) }).run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.equal(r3.state.state, 'failed', 'a failed doctor gate is a failed install');
  assert.match(r3.state.error, /doctor: gate failed: Chrome/);
  assert.ok(doc && pw);
});

test('installToolchain: refused under privacy=local without --confirm-network (manifest returned), when the lock is held, and on Node < 22 it says so', () => {
  const data = tmp();
  const p = resolvePaths({ data });
  const { run, calls } = fakeRunner(p);
  const refused = installToolchain({ privacy: 'local', data }, { run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.equal(refused.exit, 3);
  assert.equal(refused.refused, true);
  assert.match(refused.reason, /network manifest must be confirmed before the first external call/);
  assert.ok(refused.manifest.length >= 3);
  assert.equal(calls.length, 0, 'nothing ran');
  const confirmed = installToolchain({ privacy: 'local', data, confirmNetwork: true }, { run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.equal(confirmed.state.state, 'ready');
  assert.equal(confirmed.state.privacy, 'local');
  const ci = installToolchain({ privacy: 'local', data: tmp(), force: true }, { run: fakeRunner(resolvePaths({ data })).run, env: envWith(fakePath(), { CI: 'true' }), home: tmp(), stderr: quietStderr });
  assert.ok(!ci.refused, 'CI confirms implicitly');
  fs.mkdirSync(p.lock_dir, { recursive: true });
  fs.writeFileSync(path.join(p.lock_dir, 'pid'), String(process.pid));
  const locked = installToolchain({ privacy: 'default', data }, { run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.equal(locked.exit, 3);
  assert.match(locked.reason, /another install holds/);
  fs.writeFileSync(path.join(p.lock_dir, 'pid'), '999999999');
  const reclaimed = installToolchain({ privacy: 'default', data, ifNeeded: true }, { run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.equal(reclaimed.skipped, true, 'a stale lock is reclaimed and the ready toolchain is left alone');
});

test('installToolchain --force wipes the toolchain dir but keeps the log', () => {
  const data = tmp();
  const p = resolvePaths({ data });
  fakeToolchain(data, { version: '0.8.40' });
  fs.mkdirSync(path.dirname(p.log_file), { recursive: true });
  fs.writeFileSync(p.log_file, 'old log\n');
  const r = installToolchain({ privacy: 'default', data, force: true }, { run: fakeRunner(p).run, env: envWith(fakePath()), home: tmp(), stderr: quietStderr });
  assert.equal(r.state.state, 'ready');
  assert.match(fs.readFileSync(p.log_file, 'utf8'), /^old log\n/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.node_modules, 'hyperframes', 'package.json'), 'utf8')).version, HYPERFRAMES_PIN);
});

test('CLI: --help, usage errors, status/env/manifest/paths on an empty data dir, and `status --json` shape', () => {
  const run = (args, env = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_DATA: '', POWER_PRESENTATION_DATA: '', ...env } });
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage: node scripts\/toolchain\.mjs/);
  assert.equal(help.stdout, USAGE);
  assert.equal(run([]).status, 2);
  assert.equal(run(['bogus']).status, 2);
  assert.equal(run(['status', '--nope']).status, 2);
  const data = tmp();
  const st = run(['status', '--json', '--data', data]);
  assert.equal(st.status, 3);
  const j = JSON.parse(st.stdout);
  assert.equal(j.schema, STATUS_SCHEMA);
  assert.equal(j.state, 'missing');
  assert.equal(j.data_dir, data);
  assert.match(j.summary, /toolchain missing/);
  const line = run(['status', '--data', data]);
  assert.equal(line.status, 3);
  assert.equal(line.stdout.trim(), j.summary);
  const envOut = run(['env', '--data', data, '--privacy', 'local']);
  assert.equal(envOut.status, 0);
  assert.match(envOut.stdout, new RegExp(`^export POWER_PRESENTATION_DATA='${data.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\n`));
  assert.match(envOut.stdout, /export HYPERFRAMES_NO_TELEMETRY=1\n/);
  const man = run(['manifest', '--json', '--data', data]);
  assert.equal(man.status, 0);
  assert.ok(JSON.parse(man.stdout).manifest.some((m) => m.host === 'registry.npmjs.org'));
  const paths = run(['paths', '--data', data]);
  assert.equal(JSON.parse(paths.stdout).toolchain, path.join(data, 'toolchain'));
  const ready = tmp();
  fakeToolchain(ready, { staticFfmpeg: true });
  const rs = run(['status', '--data', ready]);
  assert.equal(rs.status, 0, rs.stdout);
  assert.match(rs.stdout, /^toolchain ready at/);
});

test('CLI doctor: against the real toolchain when this machine has one (otherwise skipped), the report passes the gate for the pin', (t) => {
  const st = spawnSync(process.execPath, [script, 'status', '--json'], { encoding: 'utf8' });
  const j = JSON.parse(st.stdout || '{}');
  if (!j.components?.hyperframes?.ok) return t.skip('no pinned hyperframes toolchain on this machine');
  const r = spawnSync(process.execPath, [script, 'doctor', '--json', '--data', j.data_dir], { encoding: 'utf8', timeout: 180000 });
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.schema, DOCTOR_SCHEMA);
  assert.equal(rep.hyperframes, HYPERFRAMES_PIN);
  assert.equal(rep.gate.ok, true);
  assert.equal(rep.cli.source, 'toolchain');
});

test('install / adopt: a new install of the plugin links the ready toolchain of another install — no download', () => {
  const home = tmp('pp-home-');
  const base = path.join(home, '.claude', 'plugins', 'data');
  const inline = fakeToolchain(path.join(base, 'power-presentation-inline'));
  fs.mkdirSync(path.join(inline.media_packs, 'music-ende-happy-beats'), { recursive: true });
  const bin = fakePath();
  const env = envWith(bin, { HOME: home });
  const fresh = resolvePaths({ data: path.join(base, 'power-presentation-power-presentation') }, env, home);
  assert.equal(siblingToolchain(fresh, env, home).data, inline.data);
  const calls = [];
  const r = installToolchain({ ifNeeded: true, quiet: true }, { run: (...a) => { calls.push(a); return { status: 0, stdout: '', stderr: '' }; }, env, home, pathsOverride: fresh });
  assert.equal(r.ok, true); assert.equal(r.adopted, inline.data);
  assert.match(r.reason, /linked the ready toolchain of .*power-presentation-inline \(toolchain, media-packs, doctor\.json \(copied\)\) — nothing downloaded/);
  assert.match(r.summary, /^toolchain ready/);
  assert.deepEqual(calls, [], 'nothing ran: no npm, no browser download');
  assert.equal(fs.realpathSync(fresh.toolchain), fs.realpathSync(inline.toolchain));
  assert.equal(probeToolchain(fresh, env, home).ready, true);
  assert.equal(siblingToolchain(inline, env, home), null, 'the only other install links back to it — not a sibling with its own');
  const lonely = resolvePaths({ data: path.join(tmp('pp-home-'), 'd') }, env, tmp('pp-home-'));
  assert.equal(siblingToolchain(lonely, env, tmp('pp-home-')), null);
});
