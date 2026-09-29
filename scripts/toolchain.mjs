import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PLUGIN_ID, pluginData, pluginRoot, toolchainDir as defaultToolchainDir, userSkillsDir, vendorDir } from './lib/paths.mjs';
import {
  CHROME_HEADLESS_SHELL_BUILD, HYPERFRAMES_PIN, PLAYWRIGHT_PIN, PLUGIN_VERSION, VENDORED_WORKFLOW, satisfiesRange, GSAP_PIN, FONT_PINS } from './lib/versions.mjs';
import { diffTrees } from './lib/skill-bundle.mjs';
import { throttleSpec, throttled } from './lib/throttle.mjs';

export const TOOLCHAIN_SCHEMA = 'power-presentation/toolchain@0.1';
export const DOCTOR_SCHEMA = 'power-presentation/doctor@0.1';
export const STATUS_SCHEMA = 'power-presentation/toolchain-status@0.1';

export const FFMPEG_STATIC_PIN = '5.3.0';
export const FFPROBE_STATIC_PIN = '3.1.0';

export const KOKORO_PIP_PINS = { 'kokoro-onnx': '0.4.7', soundfile: '0.14.0' };
export const KOKORO_MODULES = ['kokoro_onnx', 'soundfile'];
export const KOKORO_SMOKE_TEXT = 'Toolchain check.';
export const WHISPER_MODEL = 'small.en';

export const REQUIRED_CHECKS = ['Node.js', 'Memory', 'Disk', 'Frames cache', 'Archive extractor', '/dev/shm', 'FFmpeg', 'FFprobe', 'Chrome'];
export const CORE_REQUIRED = ['Node.js', 'FFmpeg', 'FFprobe', 'Chrome'];
export const INFORMATIONAL_CHECKS = ['Version', 'CPU', 'Environment', 'whisper-cpp', 'TTS (Kokoro)', 'BGM (MusicGen)', 'Docker', 'Docker running'];

export const CORE_SKILLS = ['hyperframes', 'hyperframes-animation', 'hyperframes-audio', 'hyperframes-cli', 'hyperframes-core', 'hyperframes-creative', 'hyperframes-keyframes', 'hyperframes-registry', 'media-use'];

export const STEP_TIMEOUTS_S = { npm: 900, chrome: 900, playwright: 900, tts: 900, doctor: 120, probe: 20 };

export const USAGE = `Usage: node scripts/toolchain.mjs <status|install|adopt|doctor|env|manifest|paths> [options]

Install and gate the HyperFrames toolchain under \${CLAUDE_PLUGIN_DATA}.

Commands
  status            probe the toolchain, no network (exit 0 ready, 3 not ready)
  install           install / repair: hyperframes@${HYPERFRAMES_PIN}, playwright@${PLAYWRIGHT_PIN} (+ its Chromium),
                    chrome-headless-shell, static ffmpeg when ffmpeg is not on PATH, the Kokoro TTS venv
                    (kokoro-onnx ${KOKORO_PIP_PINS['kokoro-onnx']} + soundfile); then doctor (exit 0/1/2/3)
  adopt             no network: a data dir without a toolchain links the ready one of another install of this plugin
                    (~/.claude/plugins/data/power-presentation*: --plugin-dir and marketplace installs); exit 0 linked or
                    nothing to do, 3 none to link (install does the same before it downloads)
  doctor            run \`hyperframes doctor --json\`, write doctor.json with the gate (exit 0 ok, 3 failed)
  env               print export lines for \$CLAUDE_ENV_FILE
  manifest          print the network manifest of an install
  paths             print resolved directories as JSON

Options
  --data <dir>         data dir (default: CLAUDE_PLUGIN_DATA, POWER_PRESENTATION_DATA, ~/.claude/plugins/data/power-presentation*)
  --json               machine-readable stdout
  --if-needed          install: exit 0 at once when status is already ready
  --force              install: wipe toolchain/ first
  --skip-chrome        install: no chrome-headless-shell download (doctor's Chrome check must pass some other way)
  --skip-playwright    install: no Playwright browsers (record-flow captures will not work)
  --skip-tts           install: no Kokoro venv (voiceover then needs a cloud provider — never silently)
  --skip-whisper       install: do not build whisper.cpp / fetch the ${WHISPER_MODEL} model (captions then have no word timings)
  --with-ffmpeg        install: static ffmpeg/ffprobe even when the system has them
  --confirm-network    install: the user confirmed the network manifest (required under the privacy profile)
  --privacy <p>        default | local (else CLAUDE_PLUGIN_OPTION_PRIVACY / POWER_PRESENTATION_PRIVACY)
  --quiet              install: log to install.log only
  -h, --help           this text

Exit codes: 0 ok · 1 runtime failure · 2 usage · 3 not ready / gate failed / refused
`;

export function parseArgs(argv, env = process.env) {
  const opts = {
    command: null, data: null, json: false, ifNeeded: false, force: false, skipChrome: false, skipPlaywright: false,
    skipTts: false, skipWhisper: false, withFfmpeg: false, confirmNetwork: false, privacy: null, quiet: false, help: false,
  };
  const args = [...argv];
  const takeValue = (flag) => {
    if (args.length === 0 || args[0].startsWith('-')) throw new Error(`${flag} needs a value`);
    return args.shift();
  };
  while (args.length) {
    const a = args.shift();
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--json': opts.json = true; break;
      case '--if-needed': opts.ifNeeded = true; break;
      case '--force': opts.force = true; break;
      case '--skip-chrome': opts.skipChrome = true; break;
      case '--skip-playwright': opts.skipPlaywright = true; break;
      case '--skip-tts': opts.skipTts = true; break;
      case '--skip-whisper': opts.skipWhisper = true; break;
      case '--with-ffmpeg': opts.withFfmpeg = true; break;
      case '--confirm-network': opts.confirmNetwork = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--data': opts.data = takeValue(a); break;
      case '--privacy': {
        const v = takeValue(a);
        if (!['default', 'local'].includes(v)) throw new Error(`--privacy must be default or local, got ${v}`);
        opts.privacy = v; break;
      }
      default:
        if (a.startsWith('-')) throw new Error(`unknown flag ${a}`);
        if (opts.command) throw new Error(`unexpected argument ${a}`);
        if (!['status', 'install', 'adopt', 'doctor', 'env', 'manifest', 'paths'].includes(a)) throw new Error(`unknown command ${a}`);
        opts.command = a;
    }
  }
  if (!opts.help && !opts.command) throw new Error('a command is required');
  if (!opts.privacy) {
    const fromEnv = env.POWER_PRESENTATION_PRIVACY || env.CLAUDE_PLUGIN_OPTION_PRIVACY;
    opts.privacy = fromEnv === 'local' ? 'local' : 'default';
  }
  return opts;
}

export function resolvePaths(opts = {}, env = process.env, home = os.homedir()) {
  const data = opts.data ? path.resolve(opts.data) : pluginData(env, home);
  const toolchain = path.join(data, 'toolchain');
  return {
    plugin_root: pluginRoot(env),
    data,
    toolchain,
    node_modules: path.join(toolchain, 'node_modules'),
    bin: path.join(toolchain, 'node_modules', '.bin'),
    hyperframes_bin: path.join(toolchain, 'node_modules', '.bin', process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes'),
    chrome_cache: path.join(toolchain, 'chrome'),
    playwright_browsers: path.join(toolchain, 'ms-playwright'),
    venv: path.join(toolchain, 'venv'),
    venv_python: path.join(toolchain, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python'),
    state_file: path.join(toolchain, 'toolchain.json'),
    log_file: path.join(toolchain, 'install.log'),
    lock_dir: path.join(toolchain, '.install.lock'),
    doctor_file: path.join(data, 'doctor.json'),
    media_packs: path.join(data, 'media-packs'),
    skills_dir: userSkillsDir(env, home),
    vendor_dir: vendorDir(env),
  };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function packageVersion(nodeModules, name) {
  return readJson(path.join(nodeModules, name, 'package.json'))?.version ?? null;
}

function isExecutable(p) {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
}

function whichBinary(name, env = process.env) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      if (isExecutable(p)) return p;
    }
  }
  return null;
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

export function shellQuote(v) {
  return `'${String(v).replace(/'/g, `'\\''`)}'`;
}

export function defaultRunner(cmd0, args0, { cwd, env, timeoutMs, input } = {}) {
  const { cmd, args } = throttled(cmd0, args0, throttleSpec(process.env));
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, input, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error ? (r.error.code === 'ETIMEDOUT' ? `timed out after ${timeoutMs} ms` : r.error.message) : null, signal: r.signal };
}

export function chromeBuildFor(nodeModules) {
  try {
    const src = fs.readFileSync(path.join(nodeModules, 'hyperframes', 'dist', 'cli.js'), 'utf8');
    const m = /CHROME_VERSION\s*=\s*"(\d+\.\d+\.\d+\.\d+)"/.exec(src);
    if (m) return { build: m[1], source: 'cli' };
  } catch { }
  return { build: CHROME_HEADLESS_SHELL_BUILD, source: 'pin' };
}

export function chromeExecutableIn(cacheDir, build) {
  const base = path.join(cacheDir, 'chrome-headless-shell');
  let dirs;
  try { dirs = fs.readdirSync(base); } catch { return null; }
  const versioned = dirs.filter((d) => d.endsWith(`-${build}`));
  for (const d of versioned) {
    const inner = path.join(base, d);
    let subs;
    try { subs = fs.readdirSync(inner); } catch { continue; }
    for (const s of subs) {
      for (const exe of ['chrome-headless-shell', 'chrome-headless-shell.exe']) {
        const p = path.join(inner, s, exe);
        if (isExecutable(p)) return p;
      }
    }
  }
  return null;
}

export function findChrome(paths, build, env = process.env, home = os.homedir()) {
  const fromEnv = env.HYPERFRAMES_BROWSER_PATH;
  if (fromEnv && isExecutable(fromEnv)) return { ok: true, path: fromEnv, build: fromEnv.includes(build) ? build : null, source: 'env' };
  const inToolchain = chromeExecutableIn(paths.chrome_cache, build);
  if (inToolchain) return { ok: true, path: inToolchain, build, source: 'toolchain' };
  const inCache = chromeExecutableIn(path.join(home, '.cache', 'hyperframes', 'chrome'), build);
  if (inCache) return { ok: true, path: inCache, build, source: 'hyperframes-cache' };
  return { ok: false, path: null, build: null, source: null };
}

export function playwrightBrowsersIn(dir) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return { chromium: false, headless_shell: false }; }
  return {
    chromium: entries.some((e) => /^chromium-\d+$/.test(e)),
    headless_shell: entries.some((e) => /^chromium_headless_shell-\d+$/.test(e)),
  };
}

export function findKokoro(paths, env = process.env) {
  const override = env.HYPERFRAMES_PYTHON;
  if (override && isExecutable(override) && override !== paths.venv_python) return { ok: true, python: override, source: 'env', modules_ok: null };
  if (isExecutable(paths.venv_python)) {
    const state = readState(paths);
    const step = state?.steps?.find((st) => st.name === 'tts');
    return { ok: true, python: paths.venv_python, source: 'toolchain', modules_ok: step ? step.ok : null, pins: KOKORO_PIP_PINS };
  }
  return { ok: false, python: null, source: null, modules_ok: null };
}

export function findWhisper(env = process.env, home = os.homedir()) {
  const override = env.HYPERFRAMES_WHISPER_PATH;
  if (override && isExecutable(override)) return { ok: true, path: override, source: 'env' };
  const onPath = whichBinary('whisper-cli', env);
  if (onPath) return { ok: true, path: onPath, source: 'path' };
  for (const p of [path.join(home, '.cache', 'hyperframes', 'whisper', 'whisper.cpp', 'build', 'bin', 'whisper-cli'), path.join(home, '.cache', 'hyperframes', 'whisper', 'whisper.cpp', 'build', 'whisper-cli')]) {
    if (isExecutable(p)) return { ok: true, path: p, source: 'hyperframes-cache', model: fs.existsSync(path.join(home, '.cache', 'hyperframes', 'whisper', 'models', `ggml-${WHISPER_MODEL}.bin`)) ? WHISPER_MODEL : null };
  }
  return { ok: false, path: null, source: null };
}

export function findFfmpeg(paths, tool, env = process.env) {
  const envKey = tool === 'ffmpeg' ? 'HYPERFRAMES_FFMPEG_PATH' : 'HYPERFRAMES_FFPROBE_PATH';
  if (env[envKey] && isExecutable(env[envKey])) return { ok: true, path: env[envKey], source: 'env' };
  const staticPath = tool === 'ffmpeg'
    ? path.join(paths.node_modules, 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    : path.join(paths.node_modules, 'ffprobe-static', 'bin', process.platform, process.arch, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  if (isExecutable(staticPath)) return { ok: true, path: staticPath, source: 'toolchain' };
  const onPath = whichBinary(tool, env);
  if (onPath) return { ok: true, path: onPath, source: 'system' };
  return { ok: false, path: null, source: null };
}

export function readState(paths) {
  const st = readJson(paths.state_file);
  return st && st.schema === TOOLCHAIN_SCHEMA ? st : null;
}

export function readDoctor(paths) {
  const d = readJson(paths.doctor_file);
  return d && d.schema === DOCTOR_SCHEMA ? d : null;
}

export function lockStatus(paths) {
  const pid = Number.parseInt((() => { try { return fs.readFileSync(path.join(paths.lock_dir, 'pid'), 'utf8'); } catch { return ''; } })(), 10);
  if (!fs.existsSync(paths.lock_dir)) return { held: false, pid: null };
  return { held: pidAlive(pid), pid: Number.isInteger(pid) ? pid : null, stale: !pidAlive(pid) };
}

export function probeSkills(paths) {
  const present = (name) => fs.existsSync(path.join(paths.skills_dir, name, 'SKILL.md'));
  const core_missing = CORE_SKILLS.filter((n) => !present(n));
  const vendored = path.join(paths.vendor_dir, VENDORED_WORKFLOW);
  const installed = present(VENDORED_WORKFLOW);
  const vendoredExists = fs.existsSync(path.join(vendored, 'SKILL.md'));
  let matches_vendored = null;
  if (installed && vendoredExists) matches_vendored = diffTrees(vendored, path.join(paths.skills_dir, VENDORED_WORKFLOW)).same;
  return { dir: paths.skills_dir, core_missing, workflow: { name: VENDORED_WORKFLOW, installed, vendored: vendoredExists, matches_vendored } };
}

export function probeFonts(paths) {
  const missing = Object.entries(FONT_PINS).filter(([name, pin]) => packageVersion(paths.node_modules, name) !== pin).map(([name, pin]) => `${name}@${pin}`);
  return { ok: missing.length === 0, missing, pins: { ...FONT_PINS }, required: false, purpose: 'frame.md faces staged into assets/fonts/ by render-path packets' };
}

export function probeToolchain(paths, env = process.env, home = os.homedir()) {
  const state = readState(paths);
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  const hfVersion = packageVersion(paths.node_modules, 'hyperframes');
  const hfOnPath = whichBinary('hyperframes', env);
  const pwVersion = packageVersion(paths.node_modules, 'playwright');
  const chromeBuild = chromeBuildFor(paths.node_modules);
  const chrome = findChrome(paths, chromeBuild.build, env, home);
  const pwDir = env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(env.PLAYWRIGHT_BROWSERS_PATH) ? env.PLAYWRIGHT_BROWSERS_PATH : paths.playwright_browsers;
  const pwBrowsers = playwrightBrowsersIn(pwDir);
  const requested = state?.requested ?? { chrome: true, playwright: true };
  const components = {
    node: { ok: nodeMajor >= 22, version: process.version, path: process.execPath },
    hyperframes: {
      ok: hfVersion === HYPERFRAMES_PIN && isExecutable(paths.hyperframes_bin),
      version: hfVersion,
      path: isExecutable(paths.hyperframes_bin) ? paths.hyperframes_bin : null,
      source: hfVersion ? 'toolchain' : (hfOnPath ? 'path' : null),
      path_fallback: hfOnPath,
      pin: HYPERFRAMES_PIN,
      in_range: hfVersion ? satisfiesRange(hfVersion) : null,
    },
    chrome: { ...chrome, expected_build: chromeBuild.build, build_source: chromeBuild.source, required: requested.chrome !== false },
    playwright: {
      ok: pwVersion === PLAYWRIGHT_PIN && pwBrowsers.chromium && pwBrowsers.headless_shell,
      version: pwVersion, pin: PLAYWRIGHT_PIN, browsers_path: pwDir, ...pwBrowsers, required: requested.playwright !== false,
    },
    ffmpeg: findFfmpeg(paths, 'ffmpeg', env),
    ffprobe: findFfmpeg(paths, 'ffprobe', env),
    producer: { ok: packageVersion(paths.node_modules, '@hyperframes/producer') === HYPERFRAMES_PIN, version: packageVersion(paths.node_modules, '@hyperframes/producer'), pin: HYPERFRAMES_PIN, required: false, purpose: 'animation-map.mjs (QA-11)' },
    fonts: probeFonts(paths),
    tts: { ...findKokoro(paths, env), required: false, engine: 'kokoro' },
    whisper: { ...findWhisper(env, home), required: false, model: WHISPER_MODEL },
  };
  const doctor = readDoctor(paths);
  const lock = lockStatus(paths);
  const requiredOk = components.node.ok && components.hyperframes.ok && components.ffmpeg.ok && components.ffprobe.ok
    && (!components.chrome.required || components.chrome.ok) && (!components.playwright.required || components.playwright.ok);
  const doctorOk = Boolean(doctor?.gate?.ok) && doctor?.hyperframes === HYPERFRAMES_PIN;
  let stateName;
  if (lock.held) stateName = 'installing';
  else if (requiredOk && doctorOk) stateName = 'ready';
  else if (hfVersion && hfVersion !== HYPERFRAMES_PIN) stateName = 'outdated';
  else if (state?.state === 'failed' && !requiredOk) stateName = 'failed';
  else if (hfVersion || chrome.source === 'toolchain' || pwVersion) stateName = 'partial';
  else stateName = 'missing';
  return {
    schema: STATUS_SCHEMA,
    data_dir: paths.data,
    toolchain_dir: paths.toolchain,
    state: stateName,
    ready: stateName === 'ready',
    needs_install: ['missing', 'partial', 'outdated', 'failed'].includes(stateName),
    installing: lock.held ? { pid: lock.pid } : null,
    pins: { hyperframes: HYPERFRAMES_PIN, playwright: PLAYWRIGHT_PIN, chrome_headless_shell: chromeBuild.build },
    components,
    doctor: doctor ? { ok: doctorOk, checked_at: doctor.checked_at, hyperframes: doctor.hyperframes, failed: doctor.gate.failed.map((f) => f.name), optional_missing: doctor.gate.optional_missing, file: paths.doctor_file } : null,
    last_install: state ? { state: state.state, finished_at: state.finished_at ?? null, error: state.error ?? null, degraded: state.degraded ?? null, plugin_version: state.plugin_version ?? null } : null,
    skills: probeSkills(paths),
    log_file: paths.log_file,
  };
}

export function summaryLine(status, { pluginRootDir = pluginRoot() } = {}) {
  const c = status.components;
  const installCmd = `node ${path.join(pluginRootDir, 'scripts', 'toolchain.mjs')} install`;
  const parts = [];
  if (status.state === 'ready') {
    parts.push(`toolchain ready at ${status.toolchain_dir}: hyperframes ${c.hyperframes.version}, chrome-headless-shell ${c.chrome.build ?? c.chrome.expected_build} (${c.chrome.source}), playwright ${c.playwright.version}, ffmpeg ${c.ffmpeg.source}, kokoro ${c.tts?.ok ? `venv (${c.tts.source})` : 'absent — voiceover needs `toolchain.mjs install`'}`);
  } else if (status.state === 'installing') {
    parts.push(`toolchain install running (pid ${status.installing.pid}, log ${status.log_file}) — wait for it before capture/render`);
  } else {
    const missing = [];
    if (!c.node.ok) missing.push(`node ${c.node.version} (< 22)`);
    if (!c.hyperframes.ok) missing.push(c.hyperframes.version ? `hyperframes ${c.hyperframes.version} ≠ pin ${HYPERFRAMES_PIN}` : 'hyperframes CLI');
    if (c.chrome.required && !c.chrome.ok) missing.push(`chrome-headless-shell ${c.chrome.expected_build}`);
    if (c.playwright.required && !c.playwright.ok) missing.push(`playwright ${PLAYWRIGHT_PIN}${c.playwright.version ? ' browsers' : ''}`);
    if (!c.ffmpeg.ok) missing.push('ffmpeg');
    if (!c.ffprobe.ok) missing.push('ffprobe');
    if (missing.length === 0 && !(status.doctor?.ok)) missing.push(status.doctor ? `doctor gate failed (${status.doctor.failed.join(', ') || 'stale report'})` : 'doctor gate not run');
    parts.push(`toolchain ${status.state} under ${status.data_dir} (missing: ${missing.join(', ')}${status.last_install?.error ? `; last install error: ${status.last_install.error}` : ''}) — run \`${installCmd}\``);
  }
  if (status.doctor) {
    parts.push(status.doctor.ok
      ? `doctor gate ok${status.doctor.optional_missing.length ? ` (optional missing: ${status.doctor.optional_missing.join(', ')})` : ''}`
      : `doctor gate FAILED: ${status.doctor.failed.join(', ') || 'stale report'}`);
  }
  const sk = status.skills;
  if (c.fonts && !c.fonts.ok && status.state !== 'installing') parts.push(`font packages missing: ${c.fonts.missing.join(', ')} — render-path packets cannot stage the presets' faces until \`${installCmd}\` adds them`);
  if (!sk.workflow.installed) parts.push(`${VENDORED_WORKFLOW} skill not installed in ${sk.dir}${sk.workflow.vendored ? ' (vendored copy available — the hook seeds it)' : ''}`);
  else if (sk.workflow.matches_vendored === false) parts.push(`${VENDORED_WORKFLOW} in ${sk.dir} differs from the vendored copy (drift; \`node ${path.join(pluginRootDir, 'scripts', 'vendor-workflow.mjs')} drift\`)`);
  if (sk.core_missing.length) parts.push(`core skills missing: ${sk.core_missing.join(', ')} (\`npx hyperframes@${HYPERFRAMES_PIN} skills update\`, network)`);
  return parts.join('; ');
}

export function evaluateDoctor(raw) {
  const checks = Array.isArray(raw?.checks) ? raw.checks : [];
  const byName = new Map(checks.map((c) => [c.name, c]));
  const failed = [];
  const evaluated = [];
  for (const name of REQUIRED_CHECKS) {
    const c = byName.get(name);
    if (!c) {
      if (CORE_REQUIRED.includes(name)) failed.push({ name, detail: 'check not reported by this CLI version', hint: null });
      continue;
    }
    evaluated.push(name);
    if (c.ok !== true) failed.push({ name, detail: c.detail ?? '', hint: c.hint ?? null });
  }
  const optional_missing = checks.filter((c) => INFORMATIONAL_CHECKS.includes(c.name) && c.name !== 'Version' && c.ok !== true).map((c) => c.name);
  const unknown = checks.filter((c) => !REQUIRED_CHECKS.includes(c.name) && !INFORMATIONAL_CHECKS.includes(c.name)).map((c) => c.name);
  const version = byName.get('Version');
  return {
    ok: failed.length === 0 && checks.length > 0,
    required: evaluated,
    failed,
    optional_missing,
    unknown,
    raw_ok: raw?.ok === true,
    version_notice: version && version.ok !== true ? version.detail : null,
    update_available: raw?._meta?.updateAvailable === true,
  };
}

export function locateCli(paths, env = process.env) {
  if (isExecutable(paths.hyperframes_bin)) return { cmd: paths.hyperframes_bin, args: [], source: 'toolchain' };
  const onPath = whichBinary('hyperframes', env);
  if (onPath) return { cmd: onPath, args: [], source: 'path' };
  const npx = whichBinary('npx', env);
  if (npx) return { cmd: npx, args: ['--no-install', 'hyperframes'], source: 'npx' };
  return null;
}

export function cliEnv(paths, opts, env = process.env, home = os.homedir()) {
  const out = { ...env, HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_SKIP_SKILLS: '1', PUPPETEER_SKIP_DOWNLOAD: '1', npm_config_update_notifier: 'false' };
  const chrome = findChrome(paths, chromeBuildFor(paths.node_modules).build, env, home);
  if (chrome.ok && chrome.source === 'toolchain') out.HYPERFRAMES_BROWSER_PATH = chrome.path;
  if (fs.existsSync(paths.playwright_browsers)) out.PLAYWRIGHT_BROWSERS_PATH = paths.playwright_browsers;
  for (const [tool, key] of [['ffmpeg', 'HYPERFRAMES_FFMPEG_PATH'], ['ffprobe', 'HYPERFRAMES_FFPROBE_PATH']]) {
    const f = findFfmpeg(paths, tool, env);
    if (f.ok && f.source === 'toolchain') out[key] = f.path;
  }
  const kokoro = findKokoro(paths, env);
  if (kokoro.ok && kokoro.source === 'toolchain') out.HYPERFRAMES_PYTHON = kokoro.python;
  if (opts.privacy === 'local') Object.assign(out, { HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', POWER_PRESENTATION_PRIVACY: 'local' });
  return out;
}

export function runDoctor(paths, opts, { run = defaultRunner, env = process.env, home = os.homedir(), now = () => new Date() } = {}) {
  const cli = locateCli(paths, env);
  if (!cli) return { ok: false, exit: 1, error: 'no hyperframes CLI (toolchain, PATH or npx)' };
  const r = run(cli.cmd, [...cli.args, 'doctor', '--json'], { env: cliEnv(paths, opts, env, home), timeoutMs: STEP_TIMEOUTS_S.doctor * 1000 });
  let raw = null;
  const text = (r.stdout || '').trim();
  const start = text.indexOf('{');
  if (start >= 0) { try { raw = JSON.parse(text.slice(start)); } catch { raw = null; } }
  if (!raw) return { ok: false, exit: 1, error: `doctor --json produced no JSON (${r.error ?? `exit ${r.status}`}): ${(r.stderr || text).slice(-300)}` };
  const gate = evaluateDoctor(raw);
  const report = {
    schema: DOCTOR_SCHEMA,
    checked_at: now().toISOString(),
    hyperframes: raw._meta?.version ?? null,
    cli: { path: cli.cmd, source: cli.source },
    gate,
    raw,
    note: 'gate.ok = every REQUIRED_CHECKS entry ok. raw.ok also counts the pinned-version notice and optional engines, so it is false by design for a pinned CLI. does not name the required set; scripts/toolchain.mjs REQUIRED_CHECKS is the working definition.',
  };
  writeJson(paths.doctor_file, report);
  return { ok: gate.ok, exit: gate.ok ? 0 : 3, report };
}

export function envExports(paths, opts, env = process.env, home = os.homedir()) {
  const lines = [`export POWER_PRESENTATION_DATA=${shellQuote(paths.data)}`];
  if (isExecutable(paths.hyperframes_bin)) lines.push(`export PATH=${shellQuote(paths.bin)}":$PATH"`);
  const chrome = findChrome(paths, chromeBuildFor(paths.node_modules).build, env, home);
  if (chrome.ok && chrome.source === 'toolchain') lines.push(`export HYPERFRAMES_BROWSER_PATH=${shellQuote(chrome.path)}`);
  if (fs.existsSync(paths.playwright_browsers)) lines.push(`export PLAYWRIGHT_BROWSERS_PATH=${shellQuote(paths.playwright_browsers)}`);
  for (const [tool, key] of [['ffmpeg', 'HYPERFRAMES_FFMPEG_PATH'], ['ffprobe', 'HYPERFRAMES_FFPROBE_PATH']]) {
    const f = findFfmpeg(paths, tool, env);
    if (f.ok && f.source === 'toolchain') lines.push(`export ${key}=${shellQuote(f.path)}`);
  }
  const kokoro = findKokoro(paths, env);
  if (kokoro.ok && kokoro.source === 'toolchain') lines.push(`export HYPERFRAMES_PYTHON=${shellQuote(kokoro.python)}`);
  lines.push('export HYPERFRAMES_SKIP_SKILLS=1');
  if (opts.privacy === 'local') {
    lines.push('export HYPERFRAMES_NO_TELEMETRY=1', 'export DO_NOT_TRACK=1', 'export HYPERFRAMES_NO_UPDATE_CHECK=1', 'export POWER_PRESENTATION_PRIVACY=local');
  }
  return lines;
}

export function networkManifest({ chrome = true, playwright = true, ffmpeg = false, tts = true, whisper = true, build = CHROME_HEADLESS_SHELL_BUILD } = {}) {
  const rows = [
    { host: 'registry.npmjs.org', purpose: `npm install hyperframes@${HYPERFRAMES_PIN}, @hyperframes/producer@${HYPERFRAMES_PIN}, @hyperframes/core@${HYPERFRAMES_PIN}, playwright@${PLAYWRIGHT_PIN}, gsap@${GSAP_PIN}, the presets' OFL faces ${Object.entries(FONT_PINS).map(([k, v]) => `${k}@${v}`).join(', ')}${ffmpeg ? `, ffmpeg-static@${FFMPEG_STATIC_PIN}, ffprobe-static@${FFPROBE_STATIC_PIN}` : ''} and their dependencies`, active: true },
    { host: 'storage.googleapis.com', purpose: `chrome-headless-shell ${build} (Chrome for Testing) through @puppeteer/browsers`, active: chrome },
    { host: 'cdn.playwright.dev, playwright.download.prss.microsoft.com, playwright-akamai.azureedge.net', purpose: `Playwright ${PLAYWRIGHT_PIN} Chromium + headless shell`, active: playwright },
    { host: 'github.com, objects.githubusercontent.com', purpose: 'ffmpeg-static release binary (postinstall)', active: ffmpeg },
    { host: 'pypi.org, files.pythonhosted.org', purpose: `pip install kokoro-onnx@${KOKORO_PIP_PINS['kokoro-onnx']} soundfile@${KOKORO_PIP_PINS.soundfile} (+ onnxruntime, numpy, phonemizer) into toolchain/venv`, active: tts },
    { host: 'github.com, objects.githubusercontent.com', purpose: 'Kokoro-82M model + voices (kokoro-onnx model-files-v1.0, ≈ 354 MB) fetched by `hyperframes tts` into ~/.cache/hyperframes/tts on the first synthesis', active: tts },
    { host: 'github.com, huggingface.co', purpose: `whisper.cpp source (built by \`hyperframes transcribe\` into ~/.cache/hyperframes/whisper) and the ggml-${WHISPER_MODEL} model (≈ 466 MB)`, active: whisper },
  ];
  return rows.filter((r) => r.active).map(({ host, purpose }) => ({ host, purpose }));
}

class Logger {
  constructor(logFile, { quiet = false, stderr = process.stderr } = {}) {
    this.logFile = logFile; this.quiet = quiet; this.stderr = stderr;
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  }
  line(msg) {
    const stamped = `${new Date().toISOString()} ${msg}`;
    try { fs.appendFileSync(this.logFile, `${stamped}\n`); } catch { }
    if (!this.quiet) this.stderr.write(`toolchain: ${msg}\n`);
  }
}

export const CHROME_INSTALL_SCRIPT = `
const [pkgDir, cacheDir, buildId] = process.argv.slice(1);
const { createRequire } = await import('node:module');
const req = createRequire(pkgDir + '/package.json');
const { install, Browser, detectBrowserPlatform, computeExecutablePath } = await import(req.resolve('@puppeteer/browsers'));
const platform = detectBrowserPlatform();
if (!platform) throw new Error('unsupported platform ' + process.platform + ' ' + process.arch);
const r = await install({ cacheDir, browser: Browser.CHROMEHEADLESSSHELL, buildId, platform });
console.log(JSON.stringify({ executablePath: r.executablePath ?? computeExecutablePath({ cacheDir, browser: Browser.CHROMEHEADLESSSHELL, buildId, platform }), platform }));
`;

const realOrSelf = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

export function siblingToolchain(paths, env = process.env, home = os.homedir()) {
  const base = path.join(home, '.claude', 'plugins', 'data');
  let names = [];
  try { names = fs.readdirSync(base).sort(); } catch { return null; }
  for (const n of names) {
    if (n !== PLUGIN_ID && !n.startsWith(`${PLUGIN_ID}-`)) continue;
    const other = resolvePaths({ data: path.join(base, n) }, env, home);
    if (realOrSelf(other.data) === realOrSelf(paths.data) || !fs.existsSync(other.toolchain) || realOrSelf(other.toolchain) === realOrSelf(paths.toolchain)) continue;
    const st = probeToolchain({ ...other, skills_dir: paths.skills_dir, vendor_dir: paths.vendor_dir }, env, home);
    if (st.ready && st.components.fonts.ok) return other;
  }
  return null;
}

export function adoptToolchain(paths, sibling) {
  fs.mkdirSync(paths.data, { recursive: true });
  fs.symlinkSync(realOrSelf(sibling.toolchain), paths.toolchain, 'dir');
  const linked = ['toolchain'];
  if (!fs.existsSync(paths.media_packs) && fs.existsSync(sibling.media_packs)) { fs.symlinkSync(realOrSelf(sibling.media_packs), paths.media_packs, 'dir'); linked.push('media-packs'); }
  if (!fs.existsSync(paths.doctor_file) && fs.existsSync(sibling.doctor_file)) { fs.copyFileSync(sibling.doctor_file, paths.doctor_file); linked.push('doctor.json (copied)'); }
  return linked;
}

export function installToolchain(opts, { run = defaultRunner, env = process.env, home = os.homedir(), now = () => new Date(), stderr = process.stderr, pathsOverride = null } = {}) {
  const paths = pathsOverride ?? resolvePaths(opts, env, home);
  const started = now();
  const skipNetworkGate = opts.confirmNetwork || env.CI === 'true' || env.CI === '1';
  const ffmpegSystem = findFfmpeg(paths, 'ffmpeg', env).source === 'system' && findFfmpeg(paths, 'ffprobe', env).source === 'system';
  const wantStaticFfmpeg = opts.withFfmpeg || !ffmpegSystem;

  if (opts.ifNeeded) {
    const st = probeToolchain(paths, env, home);
    if (st.ready && st.components.fonts.ok) return { ok: true, exit: 0, skipped: true, reason: 'already ready', status: st };
    if (st.state === 'installing') return { ok: true, exit: 0, skipped: true, reason: `install already running (pid ${st.installing.pid})`, status: st };
  }
  if (!opts.force && !fs.existsSync(paths.toolchain)) {
    const sibling = siblingToolchain(paths, env, home);
    if (sibling) {
      const linked = adoptToolchain(paths, sibling);
      const st = probeToolchain(paths, env, home);
      if (st.ready) return { ok: true, exit: 0, adopted: sibling.data, reason: `linked the ready toolchain of ${sibling.data} (${linked.join(', ')}) — nothing downloaded`, status: st, summary: summaryLine(st) };
    }
  }
  if (opts.privacy === 'local' && !skipNetworkGate) {
    return {
      ok: false, exit: 3, refused: true,
      reason: 'privacy profile: the network manifest must be confirmed before the first external call — re-run with --confirm-network after showing it',
      manifest: networkManifest({ chrome: !opts.skipChrome, playwright: !opts.skipPlaywright, ffmpeg: wantStaticFfmpeg, tts: !opts.skipTts, whisper: !opts.skipWhisper }),
    };
  }
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 22) return { ok: false, exit: 1, error: `Node ${process.version} is too old — needs Node 22+ (the hook cannot install Node itself)` };

  fs.mkdirSync(paths.toolchain, { recursive: true });
  const lock = lockStatus(paths);
  if (lock.held) return { ok: false, exit: 3, refused: true, reason: `another install holds ${paths.lock_dir} (pid ${lock.pid})` };
  if (lock.stale) fs.rmSync(paths.lock_dir, { recursive: true, force: true });
  try { fs.mkdirSync(paths.lock_dir); } catch { return { ok: false, exit: 3, refused: true, reason: `could not take ${paths.lock_dir}` }; }
  fs.writeFileSync(path.join(paths.lock_dir, 'pid'), String(process.pid));

  const log = new Logger(paths.log_file, { quiet: opts.quiet, stderr });
  const steps = [];
  const state = {
    schema: TOOLCHAIN_SCHEMA, state: 'installing', plugin_version: PLUGIN_VERSION, started_at: started.toISOString(), finished_at: null,
    pins: { hyperframes: HYPERFRAMES_PIN, playwright: PLAYWRIGHT_PIN, chrome_headless_shell: CHROME_HEADLESS_SHELL_BUILD, ffmpeg_static: wantStaticFfmpeg ? FFMPEG_STATIC_PIN : null, kokoro: opts.skipTts ? null : KOKORO_PIP_PINS, whisper_model: opts.skipWhisper ? null : WHISPER_MODEL },
    requested: { chrome: !opts.skipChrome, playwright: !opts.skipPlaywright, static_ffmpeg: wantStaticFfmpeg, tts: !opts.skipTts, whisper: !opts.skipWhisper },
    engines: { kokoro: null, whisper: null },
    privacy: opts.privacy, platform: `${process.platform}-${process.arch}`, node: process.version, steps, error: null, log: paths.log_file,
  };
  const save = () => writeJson(paths.state_file, state);
  const step = (name, fn) => {
    const t0 = Date.now();
    log.line(`step ${name} …`);
    let rec;
    try {
      const out = fn() ?? {};
      rec = { name, ok: out.ok !== false, seconds: Math.round((Date.now() - t0) / 100) / 10, ...out };
    } catch (err) {
      rec = { name, ok: false, seconds: Math.round((Date.now() - t0) / 100) / 10, error: err.message };
    }
    steps.push(rec);
    log.line(`step ${name} ${rec.ok ? 'ok' : 'FAILED'}${rec.detail ? ` — ${rec.detail}` : ''}${rec.error ? ` — ${rec.error}` : ''} (${rec.seconds}s)`);
    save();
    return rec;
  };
  const runLogged = (cmd, args, extra = {}) => {
    log.line(`$ ${[cmd, ...args].join(' ')}${extra.cwd ? `  (cwd ${extra.cwd})` : ''}`);
    const r = run(cmd, args, extra);
    const tail = (s) => (s || '').trim().split('\n').slice(-12).join('\n');
    if (r.status !== 0) log.line(`exit ${r.status ?? 'null'}${r.error ? ` (${r.error})` : ''}\n${tail(r.stderr) || tail(r.stdout)}`);
    return r;
  };

  try {
    if (opts.force) {
      log.line(`--force: removing ${paths.toolchain} contents (keeping the lock and log)`);
      for (const e of fs.readdirSync(paths.toolchain)) {
        if (e === '.install.lock' || e === 'install.log') continue;
        fs.rmSync(path.join(paths.toolchain, e), { recursive: true, force: true });
      }
    }
    save();
    log.line(`install started: hyperframes ${HYPERFRAMES_PIN}, playwright ${PLAYWRIGHT_PIN}${opts.skipChrome ? '' : `, chrome-headless-shell`}${wantStaticFfmpeg ? ', static ffmpeg' : ''} → ${paths.toolchain}`);
    log.line(`network manifest: ${networkManifest({ chrome: !opts.skipChrome, playwright: !opts.skipPlaywright, ffmpeg: wantStaticFfmpeg, tts: !opts.skipTts, whisper: !opts.skipWhisper }).map((m) => m.host).join('; ')}`);

    const pre = step('preflight', () => {
      const npm = whichBinary('npm', env);
      if (!npm) return { ok: false, error: 'npm not found on PATH' };
      const r = runLogged(npm, ['--version'], { env, timeoutMs: 30000 });
      if (r.status !== 0) return { ok: false, error: `npm --version failed: ${r.error ?? r.stderr}` };
      return { ok: true, detail: `node ${process.version}, npm ${r.stdout.trim()}`, npm };
    });
    if (!pre.ok) throw new Error(pre.error);

    step('package', () => {
      const deps = { hyperframes: HYPERFRAMES_PIN, '@hyperframes/producer': HYPERFRAMES_PIN, '@hyperframes/core': HYPERFRAMES_PIN, playwright: PLAYWRIGHT_PIN, gsap: GSAP_PIN, ...FONT_PINS };
      if (wantStaticFfmpeg) Object.assign(deps, { 'ffmpeg-static': FFMPEG_STATIC_PIN, 'ffprobe-static': FFPROBE_STATIC_PIN });
      writeJson(path.join(paths.toolchain, 'package.json'), {
        name: 'power-presentation-toolchain', private: true, description: `HyperFrames toolchain for the power-presentation plugin — managed by scripts/toolchain.mjs, do not edit`,
        dependencies: deps,
      });
      fs.writeFileSync(path.join(paths.toolchain, '.npmrc'), 'audit=false\nfund=false\nprogress=false\nupdate-notifier=false\n');
      return { detail: Object.entries(deps).map(([k, v]) => `${k}@${v}`).join(' ') };
    });

    const npmStep = step('npm-install', () => {
      const r = runLogged(pre.npm, ['install', '--no-audit', '--no-fund', '--no-progress', '--loglevel=error'], {
        cwd: paths.toolchain, timeoutMs: STEP_TIMEOUTS_S.npm * 1000,
        env: { ...env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', PUPPETEER_SKIP_DOWNLOAD: '1', HYPERFRAMES_NO_TELEMETRY: '1', npm_config_update_notifier: 'false' },
      });
      if (r.status !== 0) return { ok: false, error: `npm install failed (${r.error ?? `exit ${r.status}`})` };
      const v = packageVersion(paths.node_modules, 'hyperframes');
      if (v !== HYPERFRAMES_PIN) return { ok: false, error: `hyperframes ${v ?? 'absent'} after install, expected ${HYPERFRAMES_PIN}` };
      const producer = packageVersion(paths.node_modules, '@hyperframes/producer');
      if (producer !== HYPERFRAMES_PIN) return { ok: false, error: `@hyperframes/producer ${producer ?? 'absent'} after install, expected ${HYPERFRAMES_PIN}` };
      const fonts = probeFonts(paths);
      if (!fonts.ok) return { ok: false, error: `font packages absent after install: ${fonts.missing.join(', ')}` };
      return { detail: `hyperframes ${v}, @hyperframes/producer ${producer}, playwright ${packageVersion(paths.node_modules, 'playwright')}, ${Object.keys(FONT_PINS).length} font packages` };
    });
    if (!npmStep.ok) throw new Error(npmStep.error);

    const cliStep = step('verify-cli', () => {
      const r = runLogged(paths.hyperframes_bin, ['--version'], { env: cliEnv(paths, opts, env, home), timeoutMs: STEP_TIMEOUTS_S.probe * 1000 });
      const v = (r.stdout || '').trim().split('\n').pop();
      if (r.status !== 0 || v !== HYPERFRAMES_PIN) return { ok: false, error: `hyperframes --version answered "${v}" (exit ${r.status})` };
      return { detail: v };
    });
    if (!cliStep.ok) throw new Error(cliStep.error);

    if (!opts.skipChrome) {
      step('chrome', () => {
        const { build, source } = chromeBuildFor(paths.node_modules);
        state.pins.chrome_headless_shell = build;
        const existing = chromeExecutableIn(paths.chrome_cache, build);
        if (existing) return { detail: `already present: ${existing}`, path: existing, build };
        fs.mkdirSync(paths.chrome_cache, { recursive: true });
        const r = runLogged(process.execPath, ['--input-type=module', '-e', CHROME_INSTALL_SCRIPT, '--', paths.toolchain, paths.chrome_cache, build], {
          cwd: paths.toolchain, timeoutMs: STEP_TIMEOUTS_S.chrome * 1000, env: { ...env, PUPPETEER_SKIP_DOWNLOAD: '1' },
        });
        const exe = chromeExecutableIn(paths.chrome_cache, build);
        if (r.status === 0 && exe) return { detail: `${build} (build id from ${source}) → ${exe}`, path: exe, build };
        log.line(`@puppeteer/browsers download failed (${r.error ?? `exit ${r.status}`}); falling back to \`hyperframes browser ensure\``);
        const f = runLogged(paths.hyperframes_bin, ['browser', 'ensure'], { env: cliEnv(paths, opts, env, home), timeoutMs: STEP_TIMEOUTS_S.chrome * 1000 });
        const cached = findChrome(paths, build, env, home);
        if (f.status === 0 && cached.ok) return { detail: `${build} via hyperframes cache → ${cached.path}`, path: cached.path, build, source: cached.source };
        return { ok: false, error: `chrome-headless-shell ${build} could not be installed (${r.error ?? f.error ?? 'download failed'})` };
      });
    }

    if (!opts.skipPlaywright) {
      step('playwright', () => {
        const have = playwrightBrowsersIn(paths.playwright_browsers);
        if (have.chromium && have.headless_shell) return { detail: `already present in ${paths.playwright_browsers}` };
        fs.mkdirSync(paths.playwright_browsers, { recursive: true });
        const cli = path.join(paths.node_modules, 'playwright', 'cli.js');
        const r = runLogged(process.execPath, [cli, 'install', 'chromium'], {
          cwd: paths.toolchain, timeoutMs: STEP_TIMEOUTS_S.playwright * 1000, env: { ...env, PLAYWRIGHT_BROWSERS_PATH: paths.playwright_browsers },
        });
        const after = playwrightBrowsersIn(paths.playwright_browsers);
        if (r.status !== 0 || !after.chromium || !after.headless_shell) return { ok: false, error: `playwright install chromium failed (${r.error ?? `exit ${r.status}`}); present: ${JSON.stringify(after)}` };
        return { detail: `chromium + headless shell in ${paths.playwright_browsers}` };
      });
    }

    if (!opts.skipTts) {
      step('tts', () => {
        const py = whichBinary('python3', env) || whichBinary('python', env);
        if (!py) return { ok: false, optional: true, error: 'python3 not found on PATH — Kokoro needs Python 3.10+ (does not install Python)' };
        if (!isExecutable(paths.venv_python)) {
          const v = runLogged(py, ['-m', 'venv', paths.venv], { cwd: paths.toolchain, timeoutMs: STEP_TIMEOUTS_S.tts * 1000, env });
          if (v.status !== 0 || !isExecutable(paths.venv_python)) return { ok: false, optional: true, error: `python -m venv failed (${v.error ?? `exit ${v.status}`})` };
        }
        const specs = Object.entries(KOKORO_PIP_PINS).map(([k, ver]) => `${k}==${ver}`);
        const pip = runLogged(paths.venv_python, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', ...specs], {
          cwd: paths.toolchain, timeoutMs: STEP_TIMEOUTS_S.tts * 1000, env: { ...env, PIP_NO_INPUT: '1' },
        });
        if (pip.status !== 0) return { ok: false, optional: true, error: `pip install ${specs.join(' ')} failed (${pip.error ?? `exit ${pip.status}`})` };
        const probe = runLogged(paths.venv_python, ['-c', `import importlib.util,sys; sys.exit(0 if all(importlib.util.find_spec(m) for m in ${JSON.stringify(KOKORO_MODULES)}) else 1)`], { timeoutMs: STEP_TIMEOUTS_S.probe * 1000, env });
        if (probe.status !== 0) return { ok: false, optional: true, error: `venv lacks ${KOKORO_MODULES.join(' / ')} after install` };
        const smoke = path.join(paths.toolchain, 'tts-smoke.wav');
        fs.rmSync(smoke, { force: true });
        const t = runLogged(paths.hyperframes_bin, ['tts', KOKORO_SMOKE_TEXT, '--output', smoke, '--json'], {
          cwd: paths.toolchain, timeoutMs: STEP_TIMEOUTS_S.tts * 1000, env: { ...cliEnv(paths, opts, env, home), HYPERFRAMES_PYTHON: paths.venv_python },
        });
        if (t.status !== 0 || !fs.existsSync(smoke)) return { ok: false, optional: true, error: `hyperframes tts smoke failed (${t.error ?? `exit ${t.status}`}): ${(t.stderr || t.stdout || '').trim().split('\n').pop()}` };
        state.engines.kokoro = { python: paths.venv_python, pins: KOKORO_PIP_PINS, smoke };
        return { detail: `venv ${paths.venv} (${specs.join(' ')}); smoke ${path.basename(smoke)}`, python: paths.venv_python, smoke };
      });
    }

    if (!opts.skipWhisper) {
      step('whisper', () => {
        const smoke = path.join(paths.toolchain, 'tts-smoke.wav');
        if (!fs.existsSync(smoke)) return { ok: false, optional: true, error: 'no tts-smoke.wav to transcribe (the tts step did not run) — `hyperframes transcribe` will build whisper.cpp on first use instead' };
        const dir = path.join(paths.toolchain, 'whisper-smoke');
        fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
        const r = runLogged(paths.hyperframes_bin, ['transcribe', smoke, '--model', WHISPER_MODEL, '--dir', dir, '--json'], {
          cwd: paths.toolchain, timeoutMs: STEP_TIMEOUTS_S.tts * 1000, env: cliEnv(paths, opts, env, home),
        });
        const transcript = path.join(dir, 'transcript.json');
        if (r.status !== 0 || !fs.existsSync(transcript)) return { ok: false, optional: true, error: `hyperframes transcribe smoke failed (${r.error ?? `exit ${r.status}`}): ${(r.stderr || r.stdout || '').trim().split('\n').pop()}` };
        state.engines.whisper = { model: WHISPER_MODEL, transcript };
        return { detail: `whisper.cpp + ggml-${WHISPER_MODEL} ready (transcript ${path.relative(paths.toolchain, transcript)})` };
      });
    }

    const doc = step('doctor', () => {
      const d = runDoctor(paths, opts, { run, env, home, now });
      if (d.error) return { ok: false, error: d.error };
      const g = d.report.gate;
      return { ok: g.ok, detail: g.ok ? `gate ok${g.optional_missing.length ? ` (optional missing: ${g.optional_missing.join(', ')})` : ''}` : `gate failed: ${g.failed.map((f) => `${f.name} (${f.detail})`).join('; ')}`, gate: g };
    });

    const failedSteps = steps.filter((s) => !s.ok && !s.optional);
    const degraded = steps.filter((s) => !s.ok && s.optional);
    state.state = failedSteps.length === 0 ? 'ready' : (doc.ok ? 'partial' : 'failed');
    state.error = failedSteps.length ? failedSteps.map((s) => `${s.name}: ${s.error ?? s.detail}`).join('; ') : null;
    state.degraded = degraded.length ? degraded.map((s) => `${s.name}: ${s.error ?? s.detail}`).join('; ') : null;
  } catch (err) {
    state.state = 'failed';
    state.error = err.message;
    log.line(`install FAILED: ${err.message}`);
  } finally {
    state.finished_at = now().toISOString();
    state.duration_s = Math.round((Date.now() - started.getTime()) / 1000);
    save();
    fs.rmSync(paths.lock_dir, { recursive: true, force: true });
  }
  const status = probeToolchain(paths, env, home);
  log.line(`install finished: ${state.state}${state.error ? ` — ${state.error}` : ''}${state.degraded ? ` — optional engines degraded: ${state.degraded}` : ''} (${state.duration_s}s)`);
  return { ok: state.state === 'ready', exit: state.state === 'ready' ? 0 : 1, error: state.error, state, status, summary: summaryLine(status) };
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { process.stderr.write(`toolchain: ${err.message}\n\n${USAGE}`); return 2; }
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  const paths = resolvePaths(opts);
  const emit = (obj) => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);

  if (opts.command === 'paths') { emit(paths); return 0; }
  if (opts.command === 'adopt') {
    if (fs.existsSync(paths.toolchain)) { if (opts.json) emit({ ok: true, adopted: null, reason: 'this data dir has its own toolchain' }); return 0; }
    const sibling = siblingToolchain(paths);
    if (!sibling) { if (opts.json) emit({ ok: false, adopted: null, reason: 'no ready toolchain of another install' }); return 3; }
    const linked = adoptToolchain(paths, sibling);
    if (opts.json) emit({ ok: true, adopted: sibling.data, linked });
    else process.stdout.write(`toolchain adopt: linked ${linked.join(', ')} from ${sibling.data}\n`);
    return 0;
  }

  if (opts.command === 'manifest') {
    const ffmpegSystem = findFfmpeg(paths, 'ffmpeg').source === 'system' && findFfmpeg(paths, 'ffprobe').source === 'system';
    const rows = networkManifest({ chrome: !opts.skipChrome, playwright: !opts.skipPlaywright, ffmpeg: opts.withFfmpeg || !ffmpegSystem, tts: !opts.skipTts, whisper: !opts.skipWhisper, build: chromeBuildFor(paths.node_modules).build });
    if (opts.json) emit({ manifest: rows, privacy: opts.privacy });
    else process.stdout.write(`Network manifest for \`toolchain.mjs install\` — hosts the install may contact:\n${rows.map((r) => `  - ${r.host} — ${r.purpose}`).join('\n')}\n`);
    return 0;
  }

  if (opts.command === 'env') {
    process.stdout.write(`${envExports(paths, opts).join('\n')}\n`);
    return 0;
  }

  if (opts.command === 'status') {
    const st = probeToolchain(paths);
    st.summary = summaryLine(st);
    if (opts.json) emit(st); else process.stdout.write(`${st.summary}\n`);
    return st.ready ? 0 : 3;
  }

  if (opts.command === 'doctor') {
    const d = runDoctor(paths, opts);
    if (d.error) { if (opts.json) emit({ ok: false, error: d.error }); process.stderr.write(`toolchain doctor: ${d.error}\n`); return 1; }
    if (opts.json) emit(d.report);
    else {
      const g = d.report.gate;
      process.stdout.write(`toolchain doctor: gate ${g.ok ? 'ok' : 'FAILED'} (hyperframes ${d.report.hyperframes}, ${d.report.cli.source}) — required ${g.required.join(', ')}${g.failed.length ? `; failed: ${g.failed.map((f) => `${f.name} (${f.detail}${f.hint ? `; ${f.hint}` : ''})`).join('; ')}` : ''}${g.optional_missing.length ? `; optional missing: ${g.optional_missing.join(', ')}` : ''}${g.version_notice ? `; version notice: ${g.version_notice} (pinned on purpose)` : ''}\n  report: ${paths.doctor_file}\n`);
    }
    return d.exit;
  }

  const r = installToolchain(opts);
  if (opts.json) emit(r);
  else if (r.skipped) process.stdout.write(`toolchain install: skipped — ${r.reason}\n`);
  else if (r.adopted) process.stdout.write(`toolchain install: ${r.reason}\n${r.summary}\n`);
  else if (r.refused) process.stdout.write(`toolchain install: refused — ${r.reason}${r.manifest ? `\n${r.manifest.map((m) => `  - ${m.host} — ${m.purpose}`).join('\n')}` : ''}\n`);
  else if (r.error) process.stderr.write(`toolchain install: ${r.error}\n`);
  else process.stdout.write(`toolchain install: ${r.state.state}${r.state.error ? ` — ${r.state.error}` : ''} (${r.state.duration_s}s, log ${paths.log_file})\n${r.summary}\n`);
  return r.exit;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
