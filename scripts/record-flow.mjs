import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { pluginData, projectRoot } from './lib/paths.mjs';
import { PLUGIN_VERSION } from './lib/versions.mjs';
import { serveStatic } from './lib/static-server.mjs';

export const CAPTURE_SPEC = Object.freeze({
  viewport: { width: 1920, height: 1080, dpr: 2 },
  screencastSize: { width: 3840, height: 2160 },
  encoder: { codec: 'libx264', crf: 18, fps: 30 },
  cursor: 'none',
  bannedApi: 'recordVideo',
  artifacts: ['footage.mp4', 'events.jsonl', 'capture-manifest.json'],
  bashTimeoutSec: 300,
  defaultDwellMs: 3000,
  stepTimeoutMs: 8000,
  navTimeoutMs: 30000,
});

export const OCR_SAMPLE_FPS = 2;

export const OCR_CONCURRENCY = Math.max(1, Math.min(4, typeof os.availableParallelism === 'function' ? os.availableParallelism() : 2));

export const SECRET_PATTERNS = Object.freeze([
  { id: 'aws-akid', name: 'AWS Access Key ID', re: /AKIA[0-9A-Z]{16}/g },
  { id: 'generic-sk', name: 'sk-style secret key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'github-token', name: 'GitHub token', re: /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}\b/g, ocrRe: /\b(?:ghp|gho|github[_ ]?pat)[_ ]?[A-Za-z0-9_]{20,}\b/g },
  { id: 'slack-token', name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'jwt', name: 'JWT', re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { id: 'pem-private-key', name: 'PEM private key', re: /-----BEGIN[ A-Z]*PRIVATE KEY-----/g },
  { id: 'postgres-uri', name: 'Postgres connection string with credentials', re: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^\s:@/]+@[^\s/]+/g },
  { id: 'email', name: 'e-mail address', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { id: 'e164-phone', name: 'E.164 phone number', re: /\+\d{8,15}\b/g },
  { id: 'ipv4', name: 'IPv4 address', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
]);

export const ALWAYS_MASK_SELECTORS = Object.freeze([
  'input[type="password"]',
  '[autocomplete^="cc-"]',
  '[autocomplete="one-time-code"]',
  '.sentry-mask', '[data-sentry-mask]', '.sentry-block', '[data-sentry-block]',
  '.ph-no-capture', '[data-ph-no-capture]',
  '.rr-mask', '.rr-block',
]);

export const DEFAULT_FIXED_TIME = '2026-01-01T00:00:00.000Z';

const FLOW_ACTIONS = new Set(['goto', 'click', 'type', 'key', 'wait', 'scroll', 'hover']);

export const USAGE = `Usage: node scripts/record-flow.mjs (--url <url> | --staging-url <url> | --local | --recording <file>)
       [--flow <file>] [--out capture/] [--repo <dir>] [--tier A|B|C] [--env prod|staging|local]
       [--fixed-time <iso>] [--seed <plan.json>] [--confirm-findings] [--skip-ocr-gate] [--print]
       node scripts/record-flow.mjs --help

Records a product flow with CDP Page.startScreencast (never Playwright recordVideo)
and writes footage.mp4 + events.jsonl + capture-manifest.json. Runs the
three-layer redaction: seeded data (--seed: API routes answered from fixture files, an init
script) + fixed clock before, DOM masking during capture, tesseract OCR + gitleaks + regex after.
A Layer-2 hit blocks (exit 3) until --confirm-findings.
Each --flow step gets ${CAPTURE_SPEC.stepTimeoutMs / 1000} s (goto ${CAPTURE_SPEC.navTimeoutMs / 1000} s); a failed step stops the flow, the capture
so far is kept and the manifest's "flow" block names the failed step (exit 4).
Chain: exactly one of --url | --staging-url | --local | --recording; none given
prints {"needs_input": true} and exits 0 (the skill must ask the question).
--local starts the "dev" or "start" script of --repo's package.json (default: the current
working directory) and captures the http://localhost URL it prints; a --repo with index.html and no
package.json (a static site) is served from 127.0.0.1 instead.`;

export function parseArgs(argv) {
  const opts = {
    url: null, stagingUrl: null, local: false, recording: null,
    flow: null, out: 'capture', repo: projectRoot(), tier: 'A', env: null,
    fixedTime: DEFAULT_FIXED_TIME, confirmFindings: false, skipOcrGate: false,
    seed: null, print: false, help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--url') opts.url = argv[++i] ?? null;
    else if (a === '--staging-url') opts.stagingUrl = argv[++i] ?? null;
    else if (a === '--local') opts.local = true;
    else if (a === '--recording') opts.recording = argv[++i] ?? null;
    else if (a === '--flow') opts.flow = argv[++i] ?? null;
    else if (a === '--out') opts.out = argv[++i] ?? opts.out;
    else if (a === '--repo') opts.repo = path.resolve(argv[++i] ?? '.');
    else if (a === '--tier') opts.tier = argv[++i] ?? opts.tier;
    else if (a === '--env') opts.env = argv[++i] ?? null;
    else if (a === '--fixed-time') opts.fixedTime = argv[++i] ?? opts.fixedTime;
    else if (a === '--seed') opts.seed = argv[++i] ?? null;
    else if (a === '--confirm-findings') opts.confirmFindings = true;
    else if (a === '--skip-ocr-gate') opts.skipOcrGate = true;
    else if (a === '--print') opts.print = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!['A', 'B', 'C'].includes(opts.tier)) throw new Error(`--tier must be A, B or C, got ${opts.tier}`);
  if (Number.isNaN(Date.parse(opts.fixedTime))) throw new Error(`--fixed-time must be a valid ISO date, got ${opts.fixedTime}`);
  return opts;
}

export function resolveChainStep(opts) {
  if (opts.url) return { step: 'prod', url: opts.url, environment: 'prod' };
  if (opts.stagingUrl) return { step: 'staging', url: opts.stagingUrl, environment: 'staging' };
  if (opts.local) return { step: 'local', environment: 'local' };
  if (opts.recording) return { step: 'recording', file: opts.recording, environment: 'recording' };
  return {
    step: 'ask',
    question: 'Which source should record-flow capture — production URL, staging URL, ' +
      'start the local dev server, or use a user-supplied recording? (counts toward ' +
      'the three-question limit)',
  };
}

export function parseFlowFile(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`--flow is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(data)) throw new Error('--flow must be a JSON array of {action, ...} steps');
  data.forEach((step, i) => {
    if (step === null || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`--flow[${i}] must be an object, got ${JSON.stringify(step)}`);
    }
    if (!FLOW_ACTIONS.has(step.action)) {
      throw new Error(`--flow[${i}].action must be one of ${[...FLOW_ACTIONS].join(', ')}, got ${JSON.stringify(step.action)}`);
    }
    const need = (field) => {
      if (typeof step[field] !== 'string' || step[field] === '') {
        throw new Error(`--flow[${i}] (action "${step.action}") needs a non-empty string "${field}"`);
      }
    };
    if (step.action === 'goto') need('url');
    if (step.action === 'click' || step.action === 'hover' || step.action === 'scroll') need('selector');
    if (step.action === 'type') { need('selector'); need('text'); }
    if (step.action === 'key') need('key');
    if (step.action === 'wait') {
      const hasMs = typeof step.ms === 'number' && step.ms >= 0;
      const hasSelector = typeof step.selector === 'string' && step.selector !== '';
      if (!hasMs && !hasSelector) throw new Error(`--flow[${i}] (action "wait") needs "ms" (number) or "selector" (string)`);
    }
  });
  return data;
}

export function luhnValid(digits) {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function findCardNumbers(text) {
  const hits = [];
  const re = /\b\d(?:[ -]?\d){12,18}\b/g;
  let m;
  while ((m = re.exec(text))) {
    const digits = m[0].replace(/[ -]/g, '');
    if (luhnValid(digits)) hits.push({ match: m[0], index: m.index, digits });
    else re.lastIndex = m.index + 1;
  }
  return hits;
}

export function scanText(text, { includeCards = true, mode = 'dom' } = {}) {
  const findings = [];
  for (const p of SECRET_PATTERNS) {
    const re = mode === 'ocr' && p.ocrRe ? p.ocrRe : p.re;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      findings.push({ id: p.id, name: p.name, index: m.index, length: m[0].length });
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  if (includeCards) {
    for (const c of findCardNumbers(text)) {
      findings.push({ id: 'card-number', name: 'Luhn-valid card number', index: c.index, length: c.match.length });
    }
  }
  return findings.sort((a, b) => a.index - b.index);
}

export function maskingInitScript() {
  const selectors = JSON.stringify(ALWAYS_MASK_SELECTORS);
  const patterns = SECRET_PATTERNS.map((p) => ({ id: p.id, source: p.re.source, flags: p.re.flags }));
  return `(() => {
  if (window.__ppMaskingInstalled) return;
  window.__ppMaskingInstalled = true;
  const SELECTORS = ${selectors};
  const PATTERNS = ${JSON.stringify(patterns)}.map(p => ({ id: p.id, re: new RegExp(p.source, p.flags) }));
  const SKIP_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const OBSERVE = { childList: true, subtree: true, characterData: true };
  ${luhnValid.toString()}
  ${findCardNumbers.toString()}
  window.__ppRedactions = window.__ppRedactions || [];

  async function sha256Hex(s) {
    const buf = new TextEncoder().encode(s);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function placeholder(len) { return '•'.repeat(Math.max(1, len)); }
  function record(entry, original) {
    sha256Hex(original)
      .then((sha256) => { window.__ppRedactions.push({ ...entry, length: original.length, sha256 }); })
      .catch(() => { window.__ppRedactions.push({ ...entry, length: original.length, sha256: null }); });
  }
  function firstHit(text) {
    for (const p of PATTERNS) { p.re.lastIndex = 0; if (p.re.test(text)) return p.id; }
    return findCardNumbers(text).length > 0 ? 'card-number' : null;
  }
  function isField(el) { return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement; }

  function maskElement(el) { // always-mask selector: whole value / text, no grammar needed
    if (el.dataset && el.dataset.ppMasked === '1') return;
    const original = isField(el) ? el.value : (el.textContent ?? '');
    if (!original) return;
    if (isField(el)) el.value = placeholder(original.length); else el.textContent = placeholder(original.length);
    if (el.dataset) el.dataset.ppMasked = '1';
    record({ reason: 'always-mask-selector' }, original);
  }
  function maskFieldValue(el) { // input / textarea whose value matches the grammar
    const v = el.value;
    if (typeof v !== 'string' || !v) return;
    const hit = firstHit(v);
    if (!hit) return;
    el.value = placeholder(v.length);
    record({ reason: 'secret-grammar', patternId: hit }, v);
  }
  function maskTextNode(node) {
    const parent = node.parentNode;
    if (parent && SKIP_PARENTS.has(parent.nodeName)) return;
    const text = node.nodeValue || '';
    const hit = firstHit(text);
    if (!hit) return;
    node.nodeValue = placeholder(text.length); // replace first, hash afterwards
    record({ reason: 'secret-grammar', patternId: hit }, text);
  }
  function sweep(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { maskTextNode(root); return; }
    if (!root.querySelectorAll) return;
    if (root.matches) {
      for (const sel of SELECTORS) if (root.matches(sel)) { maskElement(root); break; }
      if (isField(root) && root.type !== 'password') maskFieldValue(root);
    }
    for (const sel of SELECTORS) root.querySelectorAll(sel).forEach(maskElement);
    root.querySelectorAll('input:not([type="password"]), textarea').forEach(maskFieldValue);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) maskTextNode(n);
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') maskTextNode(m.target);
      else m.addedNodes.forEach(sweep);
    }
  });
  mo.observe(document, OBSERVE);

  const nativeAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function attachShadow(init) {
    const root = nativeAttachShadow.call(this, init);
    try { mo.observe(root, OBSERVE); sweep(root); } catch (_) { /* never break the page */ }
    return root;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => sweep(document.documentElement));
  else sweep(document.documentElement);
})();`;
}

export function eventLoggerInitScript() {
  return `(() => {
  function rectOf(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }
  function selectorOf(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return '#' + el.id;
    return el.tagName ? el.tagName.toLowerCase() : null;
  }
  function send(type, e) {
    if (typeof window.__ppRecordEvent !== 'function') return;
    const target = e && e.target;
    window.__ppRecordEvent(JSON.stringify({
      type,
      selector: selectorOf(target), tag: target && target.tagName ? target.tagName.toLowerCase() : null,
      rect: rectOf(target),
    }));
  }
  ['click', 'focus', 'scroll'].forEach((type) => {
    window.addEventListener(type, (e) => send(type, e), { capture: true, passive: true });
  });
  window.addEventListener('keydown', (e) => send('key', e), { capture: true });
})();`;
}

export function parseSeedPlan(raw, baseDir) {
  let plan;
  try { plan = JSON.parse(raw); } catch (err) { throw new Error(`--seed: not JSON (${err.message})`); }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('--seed: the plan must be an object { routes, init }');
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const routes = (plan.routes ?? []).map((r, i) => {
    if (!r || typeof r.url !== 'string' || !r.url.trim()) throw new Error(`--seed: routes[${i}].url must be a URL glob`);
    if (typeof r.file !== 'string') throw new Error(`--seed: routes[${i}].file must name a fixture file`);
    const file = path.resolve(baseDir, r.file);
    if (!fs.existsSync(file)) throw new Error(`--seed: routes[${i}].file not found: ${r.file}`);
    const contentType = r.contentType ?? (/\.json$/i.test(file) ? 'application/json' : /\.html?$/i.test(file) ? 'text/html' : 'application/octet-stream');
    return { url: r.url, file, status: Number.isInteger(r.status) ? r.status : 200, contentType, sha256: sha(file) };
  });
  let init = null;
  if (plan.init != null) {
    const file = path.resolve(baseDir, String(plan.init));
    if (!fs.existsSync(file)) throw new Error(`--seed: init script not found: ${plan.init}`);
    init = { file, sha256: sha(file) };
  }
  if (!routes.length && !init) throw new Error('--seed: the plan seeds nothing (no routes, no init)');
  return { routes, init };
}

export async function applySeed(browser, page, plan) {
  if (!plan) return;
  if (plan.init) await browser.addInitScript(page, fs.readFileSync(plan.init.file, 'utf8'));
  for (const r of plan.routes) await browser.route(page, r.url, { file: r.file, status: r.status, contentType: r.contentType });
}

export function buildManifest({ tier, chain, url, redaction, eventsCount, artifacts, createdAt, timeline = null, seed = null, flow = null }) {
  return {
    seed: seed ? { routes: seed.routes.map((r) => ({ url: r.url, file: path.basename(r.file), sha256: r.sha256 })), init: seed.init ? { file: path.basename(seed.init.file), sha256: seed.init.sha256 } : null } : null,
    schema: 'power-presentation/capture-manifest@0.1',
    plugin_version: PLUGIN_VERSION,
    tier,
    environment: chain.environment,
    chain_step: chain.step,
    url: url ?? null,
    capture: chain.step === 'recording'
      ? { backend: 'user-supplied-recording' }
      : {
        backend: 'playwright-cdp-screencast',
        viewport: CAPTURE_SPEC.viewport,
        screencast_size: CAPTURE_SPEC.screencastSize,
        encoder: CAPTURE_SPEC.encoder,
        cursor: CAPTURE_SPEC.cursor,
      },
    artifacts,
    events: { count: eventsCount, file: 'events.jsonl' },
    timeline: timeline ? { footage_start_ms: timeline.startT, footage_end_ms: timeline.endT, events_origin: 'epoch-ms; footage_t = t - footage_start_ms' } : null,
    flow: flow ? { steps_total: flow.stepsTotal, steps_done: flow.stepsDone, failed_step: flow.failedStep ?? null } : null,
    redaction,
    created_at: createdAt,
  };
}

export async function runRedactionGate(frameFiles, deps, { concurrency = OCR_CONCURRENCY } = {}) {
  const { ocr, gitleaks } = deps;
  if (!ocr.available()) {
    return { ran: false, reason: 'tesseract not available', findings: [], sampledFrames: 0, ocrFrames: 0, gitleaks: gitleaks.available() ? 'ok' : 'unavailable' };
  }
  const unique = new Map();
  const digests = frameFiles.map((f) => {
    const key = fileDigest(f);
    if (!unique.has(key)) unique.set(key, f);
    return key;
  });
  const files = [...unique.values()];
  const texts = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      texts[i] = await ocr.recognize(files[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, files.length || 1)) }, worker));
  const combined = texts.join('\n----\n');
  const regexFindings = scanText(combined, { mode: 'ocr' }).filter((f) => f.id !== 'ipv4');
  const gitleaksState = gitleaks.available() ? 'ok' : 'unavailable';
  const gitleaksFindings = gitleaksState === 'ok' ? gitleaks.detect(combined) : [];
  const textByDigest = new Map([...unique.keys()].map((k, i) => [k, texts[i] ?? '']));
  return {
    ran: true,
    sampledFrames: frameFiles.length,
    ocrFrames: files.length,
    gitleaks: gitleaksState,
    findings: [...regexFindings, ...gitleaksFindings],
    texts: digests.map((k) => textByDigest.get(k)),
  };
}

function fileDigest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function selectSampleFrames(frames, events) {
  if (frames.length === 0) return [];
  const start = frames[0].t;
  const end = frames[frames.length - 1].t;
  const stepMs = 1000 / OCR_SAMPLE_FPS;
  const wanted = new Set();
  for (let t = start; t <= end; t += stepMs) wanted.add(nearest(frames, t).file);
  for (const e of events) {
    if (e.type === 'click' || e.type === 'navigation') wanted.add(nearest(frames, e.t).file);
  }
  return frames.filter((f) => wanted.has(f.file));
}

function nearest(frames, t) {
  let best = frames[0];
  let bestDiff = Math.abs(frames[0].t - t);
  for (const f of frames) {
    const diff = Math.abs(f.t - t);
    if (diff < bestDiff) { best = f; bestDiff = diff; }
  }
  return best;
}

export function realGitleaksDriver(bin = 'gitleaks') {
  return {
    available() {
      const r = spawnSync(bin, ['version'], { encoding: 'utf8' });
      return !r.error && r.status === 0;
    },
    detect(text) {
      const reportPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pp-gitleaks-')), 'report.json');
      const r = spawnSync(bin, [
        'detect', '--pipe', '--no-banner', '--redact',
        '--report-format', 'json', '--report-path', reportPath, '--exit-code', '0',
      ], { input: text, encoding: 'utf8' });
      if (r.error) {
        fs.rmSync(path.dirname(reportPath), { recursive: true, force: true });
        return [{ id: 'gitleaks-error', name: `gitleaks failed to run: ${r.error.message}`, index: -1, length: 0 }];
      }
      let report = [];
      try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { }
      finally { fs.rmSync(path.dirname(reportPath), { recursive: true, force: true }); }
      return (Array.isArray(report) ? report : []).map((f) => ({
        id: `gitleaks:${f.RuleID ?? 'unknown'}`, name: f.Description ?? f.RuleID ?? 'gitleaks finding',
        index: -1, length: 0,
      }));
    },
  };
}

export function realOcrDriver(bin = 'tesseract') {
  return {
    available() {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
      return !r.error && (r.status === 0 || r.status === null);
    },
    recognize(file) {
      return new Promise((resolve) => {
        const child = spawn(bin, [file, 'stdout'], { stdio: ['ignore', 'pipe', 'ignore'] });
        const chunks = [];
        child.stdout.on('data', (c) => chunks.push(c));
        child.on('error', () => resolve(''));
        child.on('close', (code) => resolve(code === 0 ? Buffer.concat(chunks).toString('utf8') : ''));
      });
    },
  };
}

export function extractRecordingFrames(file, { fps = OCR_SAMPLE_FPS, ffmpegBin = 'ffmpeg', execFn = defaultExec } = {}) {
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-rec-frames-'));
  const r = execFn(ffmpegBin, ['-v', 'error', '-y', '-i', file, '-vf', `fps=${fps}`, '-q:v', '3', path.join(framesDir, 'f-%06d.jpg')]);
  if (r.status !== 0) {
    fs.rmSync(framesDir, { recursive: true, force: true });
    throw new Error(`ffmpeg could not sample --recording ${file} (exit ${r.status}): ${r.stderr ?? ''}`);
  }
  const files = fs.readdirSync(framesDir).filter((n) => n.endsWith('.jpg')).sort().map((n) => path.join(framesDir, n));
  return { framesDir, files };
}

export async function loadPlaywright(env = process.env) {
  const toolchainPath = path.join(pluginData(env), 'toolchain', 'node_modules', 'playwright', 'index.mjs');
  if (fs.existsSync(toolchainPath)) {
    try { return await import(pathToFileURL(toolchainPath).href); } catch { }
  }
  try { return await import('playwright'); } catch { return null; }
}

export async function startLocalDevServer(projectRoot, { spawnFn = defaultSpawn, timeoutMs = 30000 } = {}) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath) && fs.existsSync(path.join(projectRoot, 'index.html'))) {
    const s = await serveStatic(projectRoot);
    return { url: s.url, stop: () => { s.server.close(); }, static: true };
  }
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { throw new Error(`--local: no readable package.json at ${pkgPath}`); }
  const scriptName = ['dev', 'start'].find((s) => pkg.scripts && typeof pkg.scripts[s] === 'string');
  if (!scriptName) throw new Error(`--local: package.json has no "dev" or "start" script`);
  const child = spawnFn('npm', ['run', scriptName], { cwd: projectRoot });
  const stop = () => {
    if (process.platform !== 'win32' && typeof child.pid === 'number') {
      try { process.kill(-child.pid, 'SIGTERM'); return; } catch { }
    }
    child.kill?.();
  };
  const streams = [child.stdout, child.stderr].filter((st) => st && typeof st.on === 'function');
  const url = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => { cleanup(); stop(); reject(new Error(`--local: "${scriptName}" printed no http://localhost URL within ${timeoutMs}ms`)); }, timeoutMs);
    const onData = (chunk) => {
      buf += String(chunk);
      const m = buf.match(/https?:\/\/localhost:\d+[^\s'"]*/);
      if (m) { cleanup(); resolve(m[0]); }
    };
    const drain = () => {};
    const cleanup = () => { clearTimeout(timer); for (const st of streams) { st.off?.('data', onData); st.on('data', drain); } };
    for (const st of streams) st.on('data', onData);
    child.once?.('error', (err) => { cleanup(); reject(err); });
  });
  return { url, stop };
}

function defaultSpawn(cmd, args, opts) {
  return spawn(cmd, args, { ...opts, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function assembleFootage(frames, outFile, { endT = null, ffmpegBin = 'ffmpeg', execFn = defaultExec } = {}) {
  if (frames.length === 0) throw new Error('assembleFootage: no frames captured');
  const listDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-concat-'));
  const listFile = path.join(listDir, 'frames.txt');
  const lines = [];
  const last = frames[frames.length - 1];
  const tailMs = endT !== null && endT > last.t ? endT - last.t : 40;
  for (let i = 0; i < frames.length; i += 1) {
    const durMs = i + 1 < frames.length ? Math.max(1, frames[i + 1].t - frames[i].t) : tailMs;
    lines.push(`file '${frames[i].file.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${(durMs / 1000).toFixed(3)}`);
  }
  lines.push(`file '${last.file.replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(listFile, lines.join('\n'));
  const r = execFn(ffmpegBin, [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `scale=in_range=jpeg:out_range=mpeg,format=yuv420p,fps=${CAPTURE_SPEC.encoder.fps}`, '-color_range', 'tv',
    '-c:v', CAPTURE_SPEC.encoder.codec, '-crf', String(CAPTURE_SPEC.encoder.crf),
    '-t', ((last.t + tailMs - frames[0].t) / 1000).toFixed(3),
    outFile,
  ]);
  fs.rmSync(listDir, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`ffmpeg failed (exit ${r.status}): ${r.stderr ?? ''}`);
  return outFile;
}

function defaultExec(bin, args) {
  return spawnSync(bin, args, { encoding: 'utf8' });
}

export function snapshotInPage() {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const txt = (el) => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const pick = (sel, max, len) => [...new Set([...document.querySelectorAll(sel)].filter(vis).map(txt).filter((t) => t && t.length <= len))].slice(0, max);
  const meta = document.querySelector('meta[name="description"]');
  return {
    url: location.origin + location.pathname,
    title: document.title || null,
    description: meta ? meta.getAttribute('content') : null,
    headings: pick('h1, h2, h3', 20, 120),
    nav: pick('nav a, nav button, [role="navigation"] a, [role="tab"], aside a', 30, 40),
    buttons: pick('button, [role="button"]', 30, 40),
    text: document.body ? txt(document.body).slice(0, 4000) : '',
  };
}

export function sanitizeSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return null;
  const clean = (s) => {
    if (typeof s !== 'string') return s ?? null;
    let out = s;
    for (const f of scanText(s).reverse()) out = out.slice(0, f.index) + '\u2588'.repeat(f.length) + out.slice(f.index + f.length);
    return out;
  };
  let url = null;
  try { const u = new URL(String(snap.url)); url = u.origin + u.pathname; } catch { url = null; }
  return { url, title: clean(snap.title), description: clean(snap.description), headings: (snap.headings ?? []).map(clean), nav: (snap.nav ?? []).map(clean), buttons: (snap.buttons ?? []).map(clean), text: clean(snap.text ?? '') };
}

async function captureSession(chain, opts, browser) {
  let page = null;
  let framesDir = null;
  try {
    page = await browser.newPage({ viewport: { width: CAPTURE_SPEC.viewport.width, height: CAPTURE_SPEC.viewport.height }, deviceScaleFactor: CAPTURE_SPEC.viewport.dpr });
    await browser.setFixedTime(page, opts.fixedTime);
    await browser.addInitScript(page, maskingInitScript());
    await browser.addInitScript(page, eventLoggerInitScript());
    await applySeed(browser, page, opts.seedPlan ?? null);
    const events = [];
    await browser.exposeFunction(page, '__ppRecordEvent', (json) => { events.push({ t: Date.now(), ...JSON.parse(json) }); });

    framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-frames-'));
    const frames = [];
    await browser.startScreencast(page, CAPTURE_SPEC, (jpegBuffer, t = Date.now()) => {
      const file = path.join(framesDir, `f-${String(frames.length).padStart(6, '0')}-${t}.jpg`);
      fs.writeFileSync(file, jpegBuffer);
      frames.push({ file, t });
    });

    const flowStart = Date.now();
    events.push({ t: flowStart, type: 'navigation', selector: null, tag: null, rect: null });
    if (chain.step !== 'recording') await browser.goto(page, chain.url);
    const screens = [];
    const snap = async (step, action) => {
      if (!browser.snapshotScreen) return;
      const s = sanitizeSnapshot(await browser.snapshotScreen(page).catch(() => null));
      if (!s) return;
      const prev = screens.at(-1);
      if (prev && prev.url === s.url && prev.title === s.title && prev.text === s.text) return;
      screens.push({ step, action, t: Date.now(), ...s });
    };
    await snap(null, 'goto');

    const steps = opts.flowSteps ?? [];
    let stepsDone = 0;
    let failedStep = null;
    for (const [index, step] of steps.entries()) {
      const t = Date.now();
      try {
        await runFlowStep(browser, page, step, events);
      } catch (err) {
        failedStep = {
          index, action: step.action, selector: step.selector ?? null,
          ...(step.url ? { url: step.url } : {}), ...(step.key ? { key: step.key } : {}),
          error: String(err?.message ?? err).split('\n')[0], t,
        };
        break;
      }
      stepsDone += 1;
      await snap(index, step.action);
    }
    if (steps.length === 0) await browser.wait(CAPTURE_SPEC.defaultDwellMs);

    const redactions = await browser.getRedactions(page);
    const endT = Date.now();
    return { frames, events, framesDir, redactions, screens, startT: flowStart, endT, flow: { stepsTotal: steps.length, stepsDone, failedStep } };
  } catch (err) {
    if (framesDir) fs.rmSync(framesDir, { recursive: true, force: true });
    throw err;
  } finally {
    try { if (page) await browser.stopScreencast(page); } catch { }
    try { await browser.close(page); } catch { }
  }
}

async function runFlowStep(browser, page, step, events) {
  if (step.action === 'goto') { await browser.goto(page, step.url); events.push({ t: Date.now(), type: 'navigation', selector: null, tag: null, rect: null }); }
  else if (step.action === 'click') await browser.click(page, step.selector);
  else if (step.action === 'hover') await browser.hover(page, step.selector);
  else if (step.action === 'type') await browser.type(page, step.selector, step.text);
  else if (step.action === 'key') await browser.pressKey(page, step.key);
  else if (step.action === 'scroll') await browser.scrollIntoView(page, step.selector);
  else if (step.action === 'wait') { if (step.selector) await browser.waitForSelector(page, step.selector); else await browser.wait(step.ms); }
}

export function realBrowserDriver(playwright) {
  let browserHandle = null;
  let cdpSession = null;
  let screencastFrameHandler = null;
  return {
    async newPage(pageOpts) {
      browserHandle = await playwright.chromium.launch({ headless: true, args: [`--force-device-scale-factor=${pageOpts.deviceScaleFactor}`] });
      const context = await browserHandle.newContext({ viewport: pageOpts.viewport, deviceScaleFactor: pageOpts.deviceScaleFactor });
      const page = await context.newPage();
      page.setDefaultTimeout(CAPTURE_SPEC.stepTimeoutMs);
      return page;
    },
    async setFixedTime(page, iso) { await page.clock.install({ time: new Date(iso) }); await page.clock.setFixedTime(new Date(iso)); },
    async addInitScript(page, src) { await page.addInitScript(src); },
    async exposeFunction(page, name, fn) { await page.exposeFunction(name, fn); },
    async goto(page, url) { await page.goto(url, { waitUntil: 'load', timeout: CAPTURE_SPEC.navTimeoutMs }); },
    async click(page, selector) { await page.click(selector); },
    async hover(page, selector) { await page.hover(selector); },
    async type(page, selector, text) { await page.fill(selector, text); },
    async pressKey(page, key) { await page.keyboard.press(key); },
    async scrollIntoView(page, selector) { await page.locator(selector).scrollIntoViewIfNeeded(); },
    async waitForSelector(page, selector) { await page.waitForSelector(selector); },
    async route(page, url, spec) { await page.route(url, (r) => r.fulfill({ path: spec.file, status: spec.status, contentType: spec.contentType })); },
    async wait(ms) { await new Promise((r) => setTimeout(r, ms)); },
    async startScreencast(page, spec, onFrame) {
      cdpSession = await page.context().newCDPSession(page);
      screencastFrameHandler = async (frame) => {
        const ts = frame.metadata && typeof frame.metadata.timestamp === 'number' ? Math.round(frame.metadata.timestamp * 1000) : Date.now();
        onFrame(Buffer.from(frame.data, 'base64'), ts);
        await cdpSession.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
      };
      cdpSession.on('Page.screencastFrame', screencastFrameHandler);
      await cdpSession.send('Page.startScreencast', {
        format: 'jpeg', quality: 90, maxWidth: spec.screencastSize.width, maxHeight: spec.screencastSize.height, everyNthFrame: 1,
      });
    },
    async stopScreencast() { if (cdpSession) await cdpSession.send('Page.stopScreencast').catch(() => {}); },
    async getRedactions(page) { return page.evaluate(() => window.__ppRedactions || []).catch(() => []); },
    async snapshotScreen(page) { return page.evaluate(snapshotInPage).catch(() => null); },
    async close(page) { await page?.close().catch(() => {}); await browserHandle?.close().catch(() => {}); },
  };
}

export async function main(argv, deps = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(String(err.message));
    console.error(USAGE);
    return 2;
  }
  if (opts.help) { console.log(USAGE); return 0; }

  const chain = resolveChainStep(opts);
  if (chain.step === 'ask') {
    console.log(JSON.stringify({ needs_input: true, question: chain.question }, null, 2));
    return 0;
  }
  if (opts.env) chain.environment = opts.env;

  let flowSteps = [];
  if (opts.flow) {
    let raw;
    try { raw = fs.readFileSync(opts.flow, 'utf8'); } catch (err) { console.error(`cannot read --flow ${opts.flow}: ${err.message}`); return 1; }
    try { flowSteps = parseFlowFile(raw); } catch (err) { console.error(String(err.message)); return 2; }
  }

  let seedPlan = null;
  if (opts.seed) {
    let raw;
    try { raw = fs.readFileSync(opts.seed, 'utf8'); } catch (err) { console.error(`cannot read --seed ${opts.seed}: ${err.message}`); return 1; }
    try { seedPlan = parseSeedPlan(raw, path.dirname(path.resolve(opts.seed))); } catch (err) { console.error(String(err.message)); return 2; }
  }

  const playwright = deps.browser ? null : await loadPlaywright();
  if (!playwright && !deps.browser && chain.step !== 'recording') {
    console.error('runtime failure: Playwright not found — install the toolchain with `node scripts/toolchain.mjs install`. ' +
      'For local testing: npm install --no-save playwright && npx playwright install chromium. See.');
    return 1;
  }

  fs.mkdirSync(opts.out, { recursive: true });

  let frames = [];
  let events = [];
  let framesDir = null;
  let redactionsLog = [];
  let captureEndT = null;
  let flow = null;
  if (chain.step === 'recording') {
    if (!opts.recording || !fs.existsSync(opts.recording)) { console.error(`--recording file not found: ${opts.recording}`); return 1; }
    fs.copyFileSync(opts.recording, path.join(opts.out, 'footage.mp4'));
    fs.writeFileSync(path.join(opts.out, 'events.jsonl'), '');
  } else {
    let devServer = null;
    if (chain.step === 'local') {
      try {
        devServer = await startLocalDevServer(opts.repo);
        chain.url = devServer.url;
      } catch (err) { console.error(String(err.message)); return 1; }
    }
    const browser = deps.browser ?? realBrowserDriver(playwright);
    let captured;
    try {
      captured = await captureSession(chain, { ...opts, flowSteps, seedPlan }, browser);
    } catch (err) {
      console.error(`runtime failure during capture: ${err.message}`);
      devServer?.stop();
      return 1;
    }
    devServer?.stop();
    ({ frames, events, framesDir, flow } = captured);
    captureEndT = captured.endT;
    try {
      assembleFootage(frames, path.join(opts.out, 'footage.mp4'), { endT: captured.endT, ...(deps.execFn ? { execFn: deps.execFn } : {}) });
    } catch (err) {
      console.error(`runtime failure: ${err.message}`);
      fs.rmSync(framesDir, { recursive: true, force: true });
      return 1;
    }
    if (flow.failedStep && frames.length) flow.failedStep.footage_t_sec = Math.max(0, Math.round((flow.failedStep.t - frames[0].t) / 10) / 100);
    fs.writeFileSync(path.join(opts.out, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
    redactionsLog = captured.redactions ?? [];
    fs.writeFileSync(path.join(opts.out, 'redactions.json'), JSON.stringify(redactionsLog, null, 2));
    const screens = (captured.screens ?? []).map((s) => ({ ...s, footage_t_sec: frames.length ? Math.max(0, Math.round((s.t - frames[0].t) / 10) / 100) : null }));
    if (screens.length) fs.writeFileSync(path.join(opts.out, 'screens.jsonl'), screens.map((s) => JSON.stringify(s)).join('\n') + '\n');
  }

  let redaction = {
    layer1_dom_masking: chain.step === 'recording'
      ? { applied: false, reason: 'tier B recording — no page to mask' }
      : { applied: true, replacements: redactionsLog.length },
    layer2_ocr_gate: { ran: false, skipped: true },
  };
  let blocked = false;
  if (opts.skipOcrGate) {
    redaction.layer2_ocr_gate = { ran: false, skipped: true, reason: '--skip-ocr-gate' };
  } else {
    let sampleFiles;
    let recordingFramesDir = null;
    if (chain.step === 'recording') {
      try {
        ({ framesDir: recordingFramesDir, files: sampleFiles } = extractRecordingFrames(path.join(opts.out, 'footage.mp4')));
      } catch (err) { console.error(`runtime failure: ${err.message}`); return 1; }
    } else {
      sampleFiles = selectSampleFrames(frames, events).map((f) => f.file);
    }
    const gate = await runRedactionGate(sampleFiles, { ocr: deps.ocr ?? realOcrDriver(), gitleaks: deps.gitleaks ?? realGitleaksDriver() });
    if (recordingFramesDir) fs.rmSync(recordingFramesDir, { recursive: true, force: true });
    redaction.layer2_ocr_gate = { ran: gate.ran, sampled_frames: gate.sampledFrames, ocr_frames: gate.ocrFrames, gitleaks: gate.gitleaks, findings: gate.findings.length };
    if (!gate.ran) redaction.layer2_ocr_gate.reason = gate.reason;
    if (gate.findings.length > 0) {
      fs.writeFileSync(path.join(opts.out, 'redaction-findings.json'), JSON.stringify(gate.findings, null, 2));
      blocked = !opts.confirmFindings;
    }
    redaction.layer2_ocr_gate.confirmed = opts.confirmFindings;
  }
  if (framesDir) fs.rmSync(framesDir, { recursive: true, force: true });

  const artifacts = ['footage.mp4', 'events.jsonl', 'capture-manifest.json'];
  if (chain.step !== 'recording') artifacts.push('redactions.json');
  if (fs.existsSync(path.join(opts.out, 'screens.jsonl'))) artifacts.push('screens.jsonl');
  if (fs.existsSync(path.join(opts.out, 'redaction-findings.json'))) artifacts.push('redaction-findings.json');
  const manifest = buildManifest({
    tier: opts.tier, chain, url: chain.url ?? null, redaction, eventsCount: events.length,
    artifacts, createdAt: new Date().toISOString(),
    timeline: frames.length ? { startT: frames[0].t, endT: captureEndT } : null, seed: seedPlan, flow,
  });
  manifest.blocked = blocked;
  fs.writeFileSync(path.join(opts.out, 'capture-manifest.json'), JSON.stringify(manifest, null, 2));

  if (opts.print) console.log(JSON.stringify(manifest, null, 2));
  const failed = manifest.flow?.failed_step;
  if (failed) {
    console.error(`flow step --flow[${failed.index}] (${failed.action} ${failed.selector ?? failed.url ?? failed.key ?? ''}) failed: ${failed.error} — ` +
      `the flow stopped after ${manifest.flow.steps_done}/${manifest.flow.steps_total} steps; the capture up to ${failed.footage_t_sec ?? '?'} s is kept in ${opts.out} (capture-manifest.json "flow").`);
  }
  if (blocked) {
    console.error(`BLOCKED: ${manifest.redaction.layer2_ocr_gate.findings} potential secret/PII match(es) in captured frames — see ${path.join(opts.out, 'redaction-findings.json')}. Re-run with --confirm-findings after review to proceed.`);
    return 3;
  }
  if (failed) return 4;
  console.log(`record-flow: tier=${opts.tier} chain=${chain.step} frames=${frames.length} events=${events.length} -> ${opts.out}`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code));
