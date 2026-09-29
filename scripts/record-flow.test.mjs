import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CAPTURE_SPEC, OCR_SAMPLE_FPS, OCR_CONCURRENCY, SECRET_PATTERNS, ALWAYS_MASK_SELECTORS, DEFAULT_FIXED_TIME, USAGE,
  parseArgs, resolveChainStep, parseFlowFile, luhnValid, findCardNumbers, scanText,
  maskingInitScript, eventLoggerInitScript, buildManifest, runRedactionGate, selectSampleFrames,
  realGitleaksDriver, realOcrDriver, extractRecordingFrames, loadPlaywright, startLocalDevServer, assembleFootage,
  snapshotInPage, sanitizeSnapshot,
} from './record-flow.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'record-flow.mjs');
const source = fs.readFileSync(script, 'utf8');

const tmpDirs = [];
function tmp(prefix = 'pp-rf-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function run(args, opts = {}) {
  return spawnSync('node', [script, ...args], { encoding: 'utf8', cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) } });
}
function runAsync(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [script, ...args], { cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}
function binAvailable(bin, args = ['--version']) {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  return !r.error && (r.status === 0 || r.status === null);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function fakeDeps({ texts = {}, ocrAvailable = true, gitleaksAvailable = true, gitleaksFindings = [], delayMs = 0, calls = [] } = {}) {
  let inFlight = 0; let peak = 0;
  return {
    peak: () => peak,
    ocr: {
      available: () => ocrAvailable,
      recognize(file) {
        calls.push(file);
        inFlight += 1; peak = Math.max(peak, inFlight);
        return new Promise((resolve) => setTimeout(() => { inFlight -= 1; resolve(texts[path.basename(file)] ?? ''); }, delayMs));
      },
    },
    gitleaks: { available: () => gitleaksAvailable, detect: () => gitleaksFindings },
  };
}

test('CAPTURE_SPEC pins 1920x1080 at DPR 2 (screencast 3840x2160), libx264 CRF 18, no cursor, recordVideo banned, 300 s', () => {
  assert.deepEqual(CAPTURE_SPEC.viewport, { width: 1920, height: 1080, dpr: 2 });
  assert.deepEqual(CAPTURE_SPEC.screencastSize, { width: 3840, height: 2160 });
  assert.deepEqual(CAPTURE_SPEC.encoder, { codec: 'libx264', crf: 18, fps: 30 });
  assert.equal(CAPTURE_SPEC.cursor, 'none');
  assert.equal(CAPTURE_SPEC.bannedApi, 'recordVideo');
  assert.deepEqual(CAPTURE_SPEC.artifacts, ['footage.mp4', 'events.jsonl', 'capture-manifest.json']);
  assert.equal(CAPTURE_SPEC.bashTimeoutSec, 300);
  assert.ok(Object.isFrozen(CAPTURE_SPEC));
  assert.equal(OCR_SAMPLE_FPS, 2);
  assert.ok(OCR_CONCURRENCY >= 1 && OCR_CONCURRENCY <= 4);
});

test('the module never passes recordVideo to Playwright; the DSF launch flag and CDP screencast are the capture path', () => {
  assert.doesNotMatch(source, /recordVideo\s*:\s*\{/, 'a recordVideo option object would enable the banned API');
  assert.match(source, /Page\.startScreencast/);
  assert.match(source, /--force-device-scale-factor=\$\{pageOpts\.deviceScaleFactor\}/, 'headless screencast ignores the context DSF — the launch flag is what yields 3840x2160');
});

test('SECRET_PATTERNS: unique ids, global regexes, every ocrRe global too; ALWAYS_MASK_SELECTORS covers password / cc / OTP and the Sentry, PostHog, rrweb conventions', () => {
  const ids = SECRET_PATTERNS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of SECRET_PATTERNS) {
    assert.ok(p.re instanceof RegExp && p.re.global, `${p.id} must be a global RegExp`);
    assert.equal(typeof p.name, 'string');
    if (p.ocrRe) assert.ok(p.ocrRe.global, `${p.id}.ocrRe must be global`);
  }
  for (const sel of ['input[type="password"]', '[autocomplete^="cc-"]', '[autocomplete="one-time-code"]', '.sentry-mask', '[data-sentry-block]', '.ph-no-capture', '.rr-mask', '.rr-block']) {
    assert.ok(ALWAYS_MASK_SELECTORS.includes(sel), `missing ${sel}`);
  }
  assert.equal(Date.parse(DEFAULT_FIXED_TIME), Date.parse('2026-01-01T00:00:00.000Z'));
});

test('parseArgs: defaults, every flag, --repo resolved, validation of --tier and --fixed-time, unknown flag throws', () => {
  const d = parseArgs([]);
  assert.equal(d.out, 'capture');
  assert.equal(d.tier, 'A');
  assert.equal(d.fixedTime, DEFAULT_FIXED_TIME);
  assert.equal(d.repo, path.resolve(process.cwd()));
  assert.equal(d.confirmFindings, false);
  assert.equal(d.skipOcrGate, false);
  const o = parseArgs(['--url', 'https://p.test', '--staging-url', 'https://s.test', '--local', '--recording', 'r.mp4',
    '--flow', 'f.json', '--out', 'cap', '--repo', 'sub/dir', '--tier', 'B', '--env', 'staging', '--fixed-time', '2025-05-05T00:00:00Z',
    '--confirm-findings', '--skip-ocr-gate', '--print']);
  assert.equal(o.url, 'https://p.test');
  assert.equal(o.stagingUrl, 'https://s.test');
  assert.equal(o.local, true);
  assert.equal(o.recording, 'r.mp4');
  assert.equal(o.flow, 'f.json');
  assert.equal(o.out, 'cap');
  assert.equal(o.repo, path.resolve('sub/dir'));
  assert.equal(o.tier, 'B');
  assert.equal(o.env, 'staging');
  assert.equal(o.fixedTime, '2025-05-05T00:00:00Z');
  assert.equal(o.confirmFindings, true);
  assert.equal(o.skipOcrGate, true);
  assert.equal(o.print, true);
  assert.equal(parseArgs(['-h']).help, true);
  assert.throws(() => parseArgs(['--tier', 'D']), /--tier must be A, B or C/);
  assert.throws(() => parseArgs(['--fixed-time', 'yesterday']), /--fixed-time must be a valid ISO date/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument: --nope/);
  assert.match(USAGE, /--url <url> \| --staging-url <url> \| --local \| --recording <file>/);
  assert.match(USAGE, /--repo <dir>/);
});

test('resolveChainStep: priority prod > staging > local > recording, never reordered; nothing given → ask (counts toward the question limit)', () => {
  const all = { url: 'https://p', stagingUrl: 'https://s', local: true, recording: 'r.mp4' };
  assert.deepEqual(resolveChainStep(all), { step: 'prod', url: 'https://p', environment: 'prod' });
  assert.deepEqual(resolveChainStep({ ...all, url: null }), { step: 'staging', url: 'https://s', environment: 'staging' });
  assert.deepEqual(resolveChainStep({ ...all, url: null, stagingUrl: null }), { step: 'local', environment: 'local' });
  assert.deepEqual(resolveChainStep({ recording: 'r.mp4' }), { step: 'recording', file: 'r.mp4', environment: 'recording' });
  const ask = resolveChainStep({});
  assert.equal(ask.step, 'ask');
  assert.match(ask.question, /three-question limit/);
});

test('parseFlowFile: accepts every action with its required fields; rejects bad JSON, non-arrays, non-object steps, unknown actions and missing fields with the step index', () => {
  const ok = parseFlowFile(JSON.stringify([
    { action: 'goto', url: 'https://x' }, { action: 'click', selector: '#a' }, { action: 'hover', selector: '#a' },
    { action: 'scroll', selector: '#a' }, { action: 'type', selector: '#i', text: 'hi' }, { action: 'key', key: 'Enter' },
    { action: 'wait', ms: 0 }, { action: 'wait', selector: '.ready' },
  ]));
  assert.equal(ok.length, 8);
  assert.throws(() => parseFlowFile('{'), /--flow is not valid JSON/);
  assert.throws(() => parseFlowFile('{}'), /must be a JSON array/);
  assert.throws(() => parseFlowFile('[1]'), /--flow\[0\] must be an object/);
  assert.throws(() => parseFlowFile('[{"action":"drag"}]'), /--flow\[0\]\.action must be one of/);
  assert.throws(() => parseFlowFile('[{"action":"goto"}]'), /--flow\[0\] \(action "goto"\) needs a non-empty string "url"/);
  assert.throws(() => parseFlowFile('[{"action":"click","selector":""}]'), /needs a non-empty string "selector"/);
  assert.throws(() => parseFlowFile('[{"action":"type","selector":"#i"}]'), /needs a non-empty string "text"/);
  assert.throws(() => parseFlowFile('[{"action":"key"}]'), /needs a non-empty string "key"/);
  assert.throws(() => parseFlowFile('[{"action":"wait"}]'), /needs "ms" \(number\) or "selector" \(string\)/);
  assert.throws(() => parseFlowFile('[{"action":"wait","ms":-1}]'), /needs "ms"/);
  assert.throws(() => parseFlowFile('[{"action":"goto","url":"https://x"},{"action":"click"}]'), /--flow\[1\]/);
});

test('luhnValid / findCardNumbers: Luhn-valid 13-19 digit runs with spaces or dashes; non-Luhn runs, short and long runs are ignored', () => {
  assert.equal(luhnValid('4242424242424242'), true);
  assert.equal(luhnValid('4111111111111111'), true);
  assert.equal(luhnValid('5555555555554444'), true);
  assert.equal(luhnValid('1234567890123456'), false);
  assert.equal(luhnValid('424242424242'), false, '12 digits: too short');
  assert.equal(luhnValid('42424242424242424242'), false, '20 digits: too long');
  assert.equal(luhnValid('4242 4242'), false, 'digits only');
  const hits = findCardNumbers('pay with 4242 4242 4242 4242 or 5555-5555-5555-4444, not 1234 5678 9012 3456; order 20260920123456 ok');
  assert.deepEqual(hits.map((h) => h.digits), ['4242424242424242', '5555555555554444']);
  assert.equal(hits[0].index, 9);
  assert.equal(hits[0].match, '4242 4242 4242 4242', 'no trailing separator in the match');
  assert.deepEqual(findCardNumbers('ip 10.0.0.1 4242 4242 4242 4242 end').map((h) => h.match), ['4242 4242 4242 4242'], 'a failed run is retried one character later');
  assert.deepEqual(findCardNumbers('id 1 4111111111111111').map((h) => h.digits), ['4111111111111111']);
});

test('scanText: one finding per pattern hit with index + length only — never the matched text; sorted; cards optional; OCR mode tolerates the dropped underscore of ghp_ (regression 2026-09-20)', () => {
  const text = [
    'AKIAABCDEFGHIJKLMNOP', 'sk-abcdefghijklmnopqrstuvwxyz1234', 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    'xoxb-1234567890-abcdefghij', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF123', '-----BEGIN RSA PRIVATE KEY-----',
    'postgres://user:pw@db.internal:5432/app', 'ops@ledgerly.test', '+380501234567', '10.0.0.1', '4242 4242 4242 4242',
  ].join(' ');
  const findings = scanText(text);
  const ids = findings.map((f) => f.id);
  for (const id of ['aws-akid', 'generic-sk', 'github-token', 'slack-token', 'jwt', 'pem-private-key', 'postgres-uri', 'email', 'e164-phone', 'ipv4', 'card-number']) {
    assert.ok(ids.includes(id), `missing ${id}: ${ids}`);
  }
  for (let i = 1; i < findings.length; i += 1) assert.ok(findings[i].index >= findings[i - 1].index, 'sorted by index');
  const json = JSON.stringify(findings);
  for (const secret of ['AKIAABCDEFGHIJKLMNOP', 'sk-abcdefghijklmnopqrstuvwxyz1234', 'ghp_', 'ops@ledgerly.test', '4242']) {
    assert.ok(!json.includes(secret), `findings must not carry the secret ${secret}`);
  }
  for (const f of findings) assert.deepEqual(Object.keys(f).sort(), ['id', 'index', 'length', 'name']);
  assert.ok(!scanText(text, { includeCards: false }).some((f) => f.id === 'card-number'));
  assert.deepEqual(scanText('nothing secret: version 2.3.4, 2026-09-20, order #1234'), []);

  const ocr = 'token: ghp ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  assert.deepEqual(scanText(ocr).map((f) => f.id), [], 'DOM mode: the strict regex needs the underscore');
  assert.deepEqual(scanText(ocr, { mode: 'ocr' }).map((f) => f.id), ['github-token']);
  assert.deepEqual(scanText('github pat ABCDEFGHIJKLMNOPQRSTUVWXYZ0123', { mode: 'ocr' }).map((f) => f.id), ['github-token']);
  assert.deepEqual(scanText('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', { mode: 'ocr' }).map((f) => f.id), ['github-token'], 'OCR mode still matches the intact form');
});

test('maskingInitScript: valid JS; carries the selectors, every pattern, the inlined Luhn functions, the skip list, characterData + attachShadow handling; replaces before hashing; never logs plaintext', () => {
  const src = maskingInitScript();
  assert.doesNotThrow(() => new vm.Script(src));
  for (const sel of ALWAYS_MASK_SELECTORS) assert.ok(src.includes(JSON.stringify(sel).slice(1, -1)), `selector ${sel}`);
  for (const p of SECRET_PATTERNS) assert.ok(src.includes(`"id":"${p.id}"`), `pattern ${p.id}`);
  assert.match(src, /function luhnValid\(/);
  assert.match(src, /function findCardNumbers\(/);
  assert.match(src, /SKIP_PARENTS = new Set\(\['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'\]\)/);
  assert.match(src, /m\.type === 'characterData'/);
  assert.match(src, /Element\.prototype\.attachShadow = function/);
  assert.match(src, /mo\.observe\(document, OBSERVE\)/, 'observer attached to the document itself, before a root exists');
  const replaceAt = src.indexOf('node.nodeValue = placeholder(text.length)');
  const hashAt = src.indexOf("record({ reason: 'secret-grammar', patternId: hit }, text)");
  assert.ok(replaceAt > 0 && hashAt > replaceAt, 'placeholder written before the hash is computed');
  assert.match(src, /sha256/);
  assert.doesNotMatch(src, /__ppRedactions\.push\(\{[^}]*\boriginal\b(?!\.length)/, 'the log entry never carries the original value');
  assert.match(src, /'•'\.repeat/);
});

test('eventLoggerInitScript: valid JS; streams click/focus/scroll/key with selector + rect and takes NO timestamp (the page clock is frozen — regression 2026-09-20)', () => {
  const src = eventLoggerInitScript();
  assert.doesNotThrow(() => new vm.Script(src));
  assert.match(src, /\['click', 'focus', 'scroll'\]/);
  assert.match(src, /'keydown'/);
  assert.match(src, /__ppRecordEvent/);
  assert.doesNotMatch(src, /Date\.now\(\)/);
  assert.doesNotMatch(src, /performance\.now\(\)/);
  assert.match(source, /events\.push\(\{ t: Date\.now\(\), \.\.\.JSON\.parse\(json\) \}\)/, 'Node side stamps the event on arrival');
});

test('buildManifest: schema, capture block per chain step, artifacts and redaction passed through, pure', () => {
  const base = { tier: 'A', chain: { step: 'prod', environment: 'prod' }, url: 'https://p', redaction: { x: 1 }, eventsCount: 3, artifacts: ['a'], createdAt: '2026-09-20T00:00:00.000Z' };
  const m = buildManifest(base);
  assert.equal(m.schema, 'power-presentation/capture-manifest@0.1');
  assert.equal(m.capture.backend, 'playwright-cdp-screencast');
  assert.deepEqual(m.capture.viewport, CAPTURE_SPEC.viewport);
  assert.deepEqual(m.capture.screencast_size, CAPTURE_SPEC.screencastSize);
  assert.equal(m.capture.cursor, 'none');
  assert.deepEqual(m.events, { count: 3, file: 'events.jsonl' });
  assert.equal(m.timeline, null);
  assert.deepEqual(buildManifest({ ...base, timeline: { startT: 10, endT: 20 } }).timeline, { footage_start_ms: 10, footage_end_ms: 20, events_origin: 'epoch-ms; footage_t = t - footage_start_ms' });
  assert.deepEqual(m.redaction, { x: 1 });
  assert.equal(m.created_at, base.createdAt);
  const rec = buildManifest({ ...base, tier: 'B', chain: { step: 'recording', environment: 'recording' }, url: null });
  assert.deepEqual(rec.capture, { backend: 'user-supplied-recording' });
  assert.equal(rec.url, null);
  assert.deepEqual(buildManifest(base), m);
});

test('selectSampleFrames: ~OCR_SAMPLE_FPS keyframes plus the frame nearest every click / navigation, sorted, no duplicates, empty in → empty out', () => {
  const t0 = 1_000_000;
  const frames = Array.from({ length: 125 }, (_, i) => ({ file: `f${i}`, t: t0 + i * 40 }));
  const base = selectSampleFrames(frames, []);
  assert.ok(base.length >= 10 && base.length <= 12, `expected ~11 keyframes for 5 s at 2 fps, got ${base.length}`);
  assert.deepEqual(base.map((f) => f.file), [...new Set(base.map((f) => f.file))]);
  for (let i = 1; i < base.length; i += 1) assert.ok(base[i].t > base[i - 1].t);
  const withClick = selectSampleFrames(frames, [{ type: 'click', t: t0 + 1_235 }, { type: 'navigation', t: t0 + 3_333 }, { type: 'focus', t: t0 + 2_222 }]);
  assert.ok(withClick.some((f) => f.file === 'f31'), 'frame nearest the click (t0+1240)');
  assert.ok(withClick.some((f) => f.file === 'f83'), 'frame nearest the navigation (t0+3320)');
  assert.equal(withClick.length, base.length + 2);
  assert.deepEqual(selectSampleFrames([], [{ type: 'click', t: 1 }]), []);
});

test('runRedactionGate: tesseract missing → ran:false with the reason; findings = OCR regex (IPv4 dropped, OCR-tolerant) + gitleaks; a missing gitleaks is stamped "unavailable" — degraded, visible, never a finding that blocks a clean page', async () => {
  const dir = tmp();
  const f1 = path.join(dir, 'a.jpg'); fs.writeFileSync(f1, 'AAA');
  const f2 = path.join(dir, 'b.jpg'); fs.writeFileSync(f2, 'BBB');
  const off = await runRedactionGate([f1], fakeDeps({ ocrAvailable: false }));
  assert.deepEqual(off, { ran: false, reason: 'tesseract not available', findings: [], sampledFrames: 0, ocrFrames: 0, gitleaks: 'ok' });

  const texts = { 'a.jpg': 'Support ops@ledgerly.test at 10.0.0.1', 'b.jpg': 'token ghp ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 card 4242 4242 4242 4242' };
  const on = await runRedactionGate([f1, f2], fakeDeps({ texts, gitleaksFindings: [{ id: 'gitleaks:aws-access-token', name: 'AWS', index: -1, length: 0 }] }));
  assert.equal(on.ran, true);
  assert.equal(on.gitleaks, 'ok');
  assert.equal(on.sampledFrames, 2);
  assert.equal(on.ocrFrames, 2);
  const ids = on.findings.map((f) => f.id);
  assert.deepEqual(ids.filter((id) => id !== 'gitleaks:aws-access-token').sort(), ['card-number', 'email', 'github-token']);
  assert.ok(ids.includes('gitleaks:aws-access-token'));
  assert.ok(!ids.includes('ipv4'), 'IPv4 alone is too noisy after OCR');

  const noGl = await runRedactionGate([f1], fakeDeps({ texts, gitleaksAvailable: false }));
  assert.equal(noGl.gitleaks, 'unavailable', 'an absent gitleaks is visible in the manifest');
  assert.deepEqual(noGl.findings.map((f) => f.id), ['email'], 'own regexes still run; no synthetic finding');
  const clean = await runRedactionGate([f1], fakeDeps({ texts: { 'a.jpg': 'hello' }, gitleaksAvailable: false }));
  assert.deepEqual(clean.findings, [], 'a clean page without gitleaks never blocks');
});

test('runRedactionGate: byte-identical frames are OCR\'d once; at most `concurrency` OCR processes run at a time; frame order does not change the findings', async () => {
  const dir = tmp();
  const files = [];
  for (let i = 0; i < 6; i += 1) { const f = path.join(dir, `f${i}.jpg`); fs.writeFileSync(f, i < 3 ? 'SAME' : `DIFF${i}`); files.push(f); }
  const calls = [];
  const deps = fakeDeps({ texts: { 'f0.jpg': 'ops@ledgerly.test', 'f4.jpg': 'AKIAABCDEFGHIJKLMNOP' }, delayMs: 15, calls });
  const r = await runRedactionGate(files, deps, { concurrency: 2 });
  assert.equal(r.sampledFrames, 6);
  assert.equal(r.ocrFrames, 4, '3 identical + 3 distinct = 4 unique');
  assert.equal(calls.length, 4);
  assert.ok(calls.includes(files[0]) && !calls.includes(files[1]) && !calls.includes(files[2]), 'the first of the identical frames is the one OCR\'d');
  assert.equal(deps.peak(), 2);
  assert.deepEqual(r.findings.map((f) => f.id).sort(), ['aws-akid', 'email']);
  const one = await runRedactionGate([files[4]], fakeDeps({ texts: { 'f4.jpg': 'AKIAABCDEFGHIJKLMNOP' } }), { concurrency: 1 });
  assert.deepEqual(one.findings.map((f) => f.id), ['aws-akid']);
  assert.deepEqual(r.texts, ['ops@ledgerly.test', 'ops@ledgerly.test', 'ops@ledgerly.test', '', 'AKIAABCDEFGHIJKLMNOP', '']);
});

test('realOcrDriver / realGitleaksDriver: a missing binary is reported unavailable, recognize() resolves to "" instead of throwing', async () => {
  const ocr = realOcrDriver('definitely-not-a-binary-pp');
  assert.equal(ocr.available(), false);
  assert.equal(await ocr.recognize('/nonexistent.jpg'), '');
  const gl = realGitleaksDriver('definitely-not-a-binary-pp');
  assert.equal(gl.available(), false);
  const r = gl.detect('AKIAABCDEFGHIJKLMNOP');
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'gitleaks-error');
});

test('realGitleaksDriver against the real binary (skips without gitleaks): AWS key → gitleaks:aws-access-token, no secret text in the finding, clean text → []', (t) => {
  if (!binAvailable('gitleaks', ['version'])) return t.skip('gitleaks not on PATH');
  const gl = realGitleaksDriver();
  assert.equal(gl.available(), true);
  const hits = gl.detect('key AKIAABCDEFGHIJKLMNOP in the footer');
  assert.ok(hits.some((h) => h.id === 'gitleaks:aws-access-token'), JSON.stringify(hits));
  assert.ok(!JSON.stringify(hits).includes('AKIAABCDEFGHIJKLMNOP'));
  assert.deepEqual(gl.detect('nothing to see, version 1.2.3'), []);
});

test('assembleFootage: concat list with per-frame durations, last frame until endT, last entry repeated, quotes escaped; libx264 CRF 18 limited-range yuv420p; failures throw; the list dir is cleaned up', () => {
  const dir = tmp();
  const frames = [
    { file: path.join(dir, "f'0.jpg"), t: 10_000 }, { file: path.join(dir, 'f1.jpg'), t: 10_040 }, { file: path.join(dir, 'f2.jpg'), t: 11_000 },
  ];
  let seen = null; let list = null; let listDir = null;
  const execFn = (bin, args) => {
    seen = { bin, args };
    const i = args.indexOf('-i');
    listDir = path.dirname(args[i + 1]);
    list = fs.readFileSync(args[i + 1], 'utf8');
    return { status: 0 };
  };
  const out = assembleFootage(frames, path.join(dir, 'footage.mp4'), { endT: 13_500, execFn });
  assert.equal(out, path.join(dir, 'footage.mp4'));
  assert.equal(seen.bin, 'ffmpeg');
  assert.ok(seen.args.includes('libx264') && seen.args.includes('18'));
  assert.ok(seen.args.includes('scale=in_range=jpeg:out_range=mpeg,format=yuv420p,fps=30') && seen.args.includes('-color_range'));
  assert.equal(seen.args[seen.args.indexOf('-t') + 1], '3.500', 'constant 30 fps, cut at the capture span: 10.000 s → 13.500 s');
  assert.ok(!seen.args.includes('recordVideo'));
  const lines = list.split('\n');
  assert.equal(lines[0], `file '${path.join(dir, "f'\\''0.jpg")}'`);
  assert.equal(lines[1], 'duration 0.040');
  assert.equal(lines[3], 'duration 0.960');
  assert.equal(lines[5], 'duration 2.500', 'last frame lasts until the screencast stopped');
  assert.equal(lines[6], `file '${path.join(dir, 'f2.jpg')}'`, 'ffmpeg concat quirk: last entry repeated');
  assert.equal(fs.existsSync(listDir), false, 'temp list dir removed');

  assembleFootage(frames.slice(0, 1), path.join(dir, 'one.mp4'), { execFn });
  assert.equal(list.split('\n')[1], 'duration 0.040', 'no endT: one 25 fps frame');
  assert.throws(() => assembleFootage([], 'x.mp4', { execFn }), /no frames captured/);
  assert.throws(() => assembleFootage(frames, 'x.mp4', { execFn: () => ({ status: 1, stderr: 'boom' }) }), /ffmpeg failed \(exit 1\): boom/);
});

test('extractRecordingFrames: samples with ffmpeg at OCR_SAMPLE_FPS into a temp dir, returns the sorted files; a failing ffmpeg throws and removes the dir', () => {
  let seen = null;
  const execFn = (bin, args) => {
    seen = args;
    const outPattern = args[args.length - 1];
    const dir = path.dirname(outPattern);
    for (const n of ['f-000002.jpg', 'f-000001.jpg']) fs.writeFileSync(path.join(dir, n), n);
    return { status: 0 };
  };
  const r = extractRecordingFrames('/some/rec.mp4', { execFn });
  tmpDirs.push(r.framesDir);
  assert.ok(seen.includes(`fps=${OCR_SAMPLE_FPS}`) && seen.includes('/some/rec.mp4'));
  assert.deepEqual(r.files.map((f) => path.basename(f)), ['f-000001.jpg', 'f-000002.jpg']);
  let failedDir = null;
  assert.throws(() => extractRecordingFrames('/some/rec.mp4', { execFn: (b, a) => { failedDir = path.dirname(a[a.length - 1]); return { status: 1, stderr: 'bad file' }; } }), /could not sample --recording \/some\/rec\.mp4 \(exit 1\): bad file/);
  assert.equal(fs.existsSync(failedDir), false);
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

test('startLocalDevServer: needs package.json with a "dev" or "start" script (dev preferred), resolves the first http://localhost URL printed, stop() kills the child, silence → timeout error', async () => {
  const noPkg = tmp();
  await assert.rejects(startLocalDevServer(noPkg, { spawnFn: () => fakeChild() }), /--local: no readable package\.json/);
  const noScript = tmp(); fs.writeFileSync(path.join(noScript, 'package.json'), JSON.stringify({ scripts: { test: 'x' } }));
  await assert.rejects(startLocalDevServer(noScript, { spawnFn: () => fakeChild() }), /no "dev" or "start" script/);

  const both = tmp(); fs.writeFileSync(path.join(both, 'package.json'), JSON.stringify({ scripts: { start: 'node server', dev: 'vite' } }));
  let spawned = null; let child = null;
  const spawnFn = (cmd, args, opts) => { spawned = { cmd, args, opts }; child = fakeChild(); setTimeout(() => { child.stdout.emit('data', 'ready on '); child.stdout.emit('data', 'http://localhost:5173/app?x=1 in 120ms\n'); }, 5); return child; };
  const dev = await startLocalDevServer(both, { spawnFn, timeoutMs: 2000 });
  assert.deepEqual(spawned, { cmd: 'npm', args: ['run', 'dev'], opts: { cwd: both } });
  assert.equal(dev.url, 'http://localhost:5173/app?x=1');
  dev.stop();
  assert.equal(child.killed, true);

  const silent = tmp(); fs.writeFileSync(path.join(silent, 'package.json'), JSON.stringify({ scripts: { start: 'node server' } }));
  await assert.rejects(startLocalDevServer(silent, { spawnFn: () => fakeChild(), timeoutMs: 30 }), /"start" printed no http:\/\/localhost URL within 30ms/);
});

test('startLocalDevServer: a static site (index.html, no package.json) is served from loopback; nothing outside it', async () => {
  const site = tmp();
  fs.writeFileSync(path.join(site, 'index.html'), '<h1>Ledgerly</h1>');
  fs.mkdirSync(path.join(site, 'app')); fs.writeFileSync(path.join(site, 'app', 'index.html'), 'app');
  fs.writeFileSync(path.join(path.dirname(site), `secret-${path.basename(site)}.txt`), 'no');
  const s = await startLocalDevServer(site, { spawnFn: () => { throw new Error('npm must not run'); } });
  assert.equal(s.static, true);
  assert.match(s.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  const get = async (p) => { const r = await fetch(new URL(p, s.url)); return [r.status, r.headers.get('content-type'), await r.text()]; };
  assert.deepEqual(await get('/'), [200, 'text/html; charset=utf-8', '<h1>Ledgerly</h1>']);
  assert.deepEqual((await get('/app/')).slice(0, 1), [200]);
  assert.equal((await get(`/..%2Fsecret-${path.basename(site)}.txt`))[0], 403);
  assert.equal((await get('/missing.css'))[0], 404);
  s.stop();
});

test('loadPlaywright: the ${CLAUDE_PLUGIN_DATA}/toolchain copy wins over module resolution; a missing toolchain falls back and never throws', async () => {
  const data = tmp();
  const pw = path.join(data, 'toolchain', 'node_modules', 'playwright');
  fs.mkdirSync(pw, { recursive: true });
  fs.writeFileSync(path.join(pw, 'index.mjs'), 'export const chromium = "from-toolchain";');
  const mod = await loadPlaywright({ CLAUDE_PLUGIN_DATA: data });
  assert.equal(mod.chromium, 'from-toolchain');
  const fallback = await loadPlaywright({ CLAUDE_PLUGIN_DATA: tmp() });
  assert.ok(fallback === null || typeof fallback.chromium === 'object', 'null without a local install, the real module with one');
});

test('CLI: --help exits 0 with usage; unknown flag / bad --tier / bad --flow exit 2 with usage on stderr; nothing is written', () => {
  const dir = tmp();
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage: node scripts\/record-flow\.mjs/);
  for (const args of [['--definitely-not-a-flag'], ['--url', 'https://x', '--tier', 'Z']]) {
    const r = run([...args, '--out', path.join(dir, 'cap')]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /Usage:/);
    assert.equal(r.stdout, '');
  }
  const bad = path.join(dir, 'flow.json'); fs.writeFileSync(bad, '[{"action":"click"}]');
  const r = run(['--url', 'https://x', '--flow', bad, '--out', path.join(dir, 'cap')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--flow\[0\] \(action "click"\) needs a non-empty string "selector"/);
  assert.equal(fs.existsSync(path.join(dir, 'cap')), false);
});

test('CLI: no source flag → {"needs_input": true} with the question on stdout, exit 0, nothing written (the skill asks; the script never does)', () => {
  const dir = tmp();
  const r = run([], { cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.needs_input, true);
  assert.match(out.question, /production URL, staging URL/);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('CLI: unreadable --flow and a missing --recording file exit 1 with a runtime message; --local without a dev script exits 1 citing', () => {
  const dir = tmp();
  const r1 = run(['--url', 'https://x', '--flow', path.join(dir, 'nope.json'), '--out', path.join(dir, 'cap')]);
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /cannot read --flow/);
  const r2 = run(['--recording', path.join(dir, 'nope.mp4'), '--out', path.join(dir, 'cap')]);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /--recording file not found/);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'true' } }));
  const r3 = run(['--local', '--repo', dir, '--out', path.join(dir, 'cap')]);
  if (r3.stderr.includes('Playwright not found')) return;
  assert.equal(r3.status, 1, r3.stderr);
  assert.match(r3.stderr, /no "dev" or "start" script/);
});

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Ledgerly demo</title>
<style>body{font:28px/1.4 sans-serif;margin:40px;background:#fff;color:#111} canvas{display:block;margin-top:16px}</style>
</head><body>
<h1 id="title">Ledgerly dashboard</h1>
<p>Support: <span id="mail">ops@ledgerly.test</span> · Card on file: <span id="card">4242 4242 4242 4242</span></p>
<p>Key: <code id="key">AKIAABCDEFGHIJKLMNOP</code> · Phone: <span id="phone">+380501234567</span></p>
<input type="password" id="pw" value="hunter2-secret"> <input type="text" id="apikey" value="sk-abcdefghijklmnopqrstuvwxyz1234">
<p id="live">loading…</p>
<div id="host"></div>
<canvas id="cv" width="1600" height="100"></canvas>
<button id="go">Go</button>
<script>
  // Layer 1 cannot see canvas text — that is what the Layer-2 OCR gate is for.
  const c = document.getElementById('cv').getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 1600, 100); c.fillStyle = '#000'; c.font = '44px monospace';
  c.fillText('token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 20, 66);
  // framework-style in-place text update (characterData mutation)
  setTimeout(() => { document.getElementById('live').firstChild.nodeValue = 'admin@ledgerly.test'; }, 100);
  // open shadow root with a secret
  const root = document.getElementById('host').attachShadow({ mode: 'open' });
  root.innerHTML = '<span id="shadow-mail">ceo@ledgerly.test</span>';
  document.getElementById('go').addEventListener('click', () => { document.getElementById('title').textContent = 'Clicked'; });
  // decoy in script text: must NOT be masked (never rendered) — the JS still runs
  const decoy = 'ghp_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
  window.__decoyLen = decoy.length;
</script>
</body></html>`;

function serve(html) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) }));
  });
}
function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name,pix_fmt,color_range:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  return { ...j.streams[0], duration: Number(j.format.duration) };
}
async function toolchainMissing() {
  const pw = await loadPlaywright();
  if (!pw) return 'Playwright not installed (npm install --no-save playwright && npx playwright install chromium)';
  try { const b = await pw.chromium.launch({ headless: true }); await b.close(); } catch (err) { return `Chromium not launchable: ${String(err.message).split('\n')[0]}`; }
  if (!binAvailable('ffmpeg', ['-version'])) return 'ffmpeg not on PATH';
  if (!binAvailable('tesseract')) return 'tesseract not on PATH';
  return null;
}

test('end-to-end: a real capture — 3840x2160 yuv420p footage as long as the flow, Node-clock events, Layer 1 masks DOM/values/characterData/shadow text but not script text, Layer 2 catches the canvas token and blocks (exit 3), --confirm-findings passes, tier B re-runs the gate on the footage', async (t) => {
  const missing = await toolchainMissing();
  if (missing) return t.skip(missing);
  const dir = tmp();
  const flow = path.join(dir, 'flow.json');
  fs.writeFileSync(flow, JSON.stringify([{ action: 'wait', ms: 600 }, { action: 'click', selector: '#go' }, { action: 'wait', ms: 600 }]));
  const srv = await serve(PAGE);
  try {
    const out = path.join(dir, 'cap');
    const t0 = Date.now();
    const r = await runAsync(['--url', srv.url, '--flow', flow, '--out', out, '--print']);
    const wall = Date.now() - t0;
    assert.equal(r.status, 3, `expected the block, got ${r.status}: ${r.stderr}`);
    assert.match(r.stderr, /BLOCKED/);
    assert.ok(wall < CAPTURE_SPEC.bashTimeoutSec * 1000, `within the budget (${wall} ms)`);

    for (const f of ['footage.mp4', 'events.jsonl', 'capture-manifest.json', 'redactions.json', 'redaction-findings.json']) assert.ok(fs.existsSync(path.join(out, f)), f);
    const manifest = readJson(path.join(out, 'capture-manifest.json'));
    assert.deepEqual(JSON.parse(r.stdout), manifest, '--print echoes the manifest');
    assert.equal(manifest.blocked, true);
    assert.equal(manifest.chain_step, 'prod');
    assert.equal(manifest.environment, 'prod');
    assert.equal(manifest.url, srv.url);
    assert.equal(manifest.capture.backend, 'playwright-cdp-screencast');
    assert.equal(manifest.redaction.layer2_ocr_gate.ran, true);
    assert.ok(['ok', 'unavailable'].includes(manifest.redaction.layer2_ocr_gate.gitleaks));
    assert.ok(manifest.redaction.layer2_ocr_gate.sampled_frames >= 1);
    assert.equal(manifest.redaction.layer2_ocr_gate.confirmed, false);

    const probe = ffprobe(path.join(out, 'footage.mp4'));
    assert.equal(probe.width, 3840, 'DPR 2 must reach the footage (regression: headless screencast at CSS pixels)');
    assert.equal(probe.height, 2160);
    assert.equal(probe.codec_name, 'h264');
    assert.equal(probe.pix_fmt, 'yuv420p');
    assert.equal(probe.color_range, 'tv');
    const span = (manifest.timeline.footage_end_ms - manifest.timeline.footage_start_ms) / 1000;
    assert.ok(span >= 1.15 && span < 30, `first paint to stop covers the 1.2 s flow (the first frame may land just after goto resolves), got ${span}`);
    assert.ok(Math.abs(probe.duration - span) < 0.1, `footage (${probe.duration} s) as long as the capture (${span} s) — last frame lasts until the stop (regression)`);

    const events = fs.readFileSync(path.join(out, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(events[0].type, 'navigation');
    const click = events.find((e) => e.type === 'click');
    assert.ok(click, 'click recorded');
    assert.equal(click.selector, '#go');
    assert.ok(click.rect && click.rect.w > 0 && click.rect.h > 0);
    assert.ok(click.t > events[0].t + 500 && click.t < events[0].t + 30_000, `click stamped with the Node clock after the 600 ms wait (regression: frozen page clock), got +${click.t - events[0].t} ms`);
    assert.ok(click.t >= manifest.timeline.footage_start_ms && click.t <= manifest.timeline.footage_end_ms, 'the click maps inside the footage timeline');
    assert.ok(Math.abs(click.t - Date.parse(DEFAULT_FIXED_TIME)) > 86_400_000, 'never the fixed time');
    for (let i = 1; i < events.length; i += 1) assert.ok(events[i].t >= events[i - 1].t, 'monotonic');
    assert.equal(manifest.events.count, events.length);

    const redactions = readJson(path.join(out, 'redactions.json'));
    const byId = (id) => redactions.filter((x) => x.patternId === id);
    assert.equal(redactions.filter((x) => x.reason === 'always-mask-selector').length, 1, 'the password field');
    assert.equal(byId('email').length, 3, 'span text + characterData update + shadow root');
    assert.equal(byId('card-number').length, 1, 'Luhn card in Layer 1 (regression)');
    assert.equal(byId('aws-akid').length, 1);
    assert.equal(byId('e164-phone').length, 1);
    assert.equal(byId('generic-sk').length, 1, 'the text input value');
    assert.ok(!redactions.some((x) => x.length > 200), 'script text never masked (regression: 486-char <script> node)');
    assert.equal(manifest.redaction.layer1_dom_masking.replacements, redactions.length);
    for (const x of redactions) {
      assert.match(x.sha256, /^[0-9a-f]{64}$/);
      assert.deepEqual(Object.keys(x).sort(), x.reason === 'secret-grammar' ? ['length', 'patternId', 'reason', 'sha256'] : ['length', 'reason', 'sha256']);
    }
    const everything = fs.readFileSync(path.join(out, 'redactions.json'), 'utf8') + fs.readFileSync(path.join(out, 'redaction-findings.json'), 'utf8') + JSON.stringify(manifest) + fs.readFileSync(path.join(out, 'events.jsonl'), 'utf8');
    for (const secret of ['hunter2', 'ops@ledgerly', 'admin@ledgerly', 'ceo@ledgerly', '4242', 'AKIAABCDEFGHIJKLMNOP', '+380501234567', 'sk-abcdef', 'ghp_']) {
      assert.ok(!everything.includes(secret), `no artifact carries the plaintext ${secret}`);
    }

    const findings = readJson(path.join(out, 'redaction-findings.json'));
    assert.ok(findings.some((f) => f.id === 'github-token'), `github-token expected (OCR-tolerant match), got ${JSON.stringify(findings)}`);
    assert.equal(findings.length, manifest.redaction.layer2_ocr_gate.findings);

    const mid = path.join(dir, 'mid.png');
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, probe.duration - 0.2)), '-i', path.join(out, 'footage.mp4'), '-frames:v', '1', mid]);
    const ocr = spawnSync('tesseract', [mid, 'stdout'], { encoding: 'utf8' }).stdout;
    assert.match(ocr, /Clicked/, 'the flow click happened on screen (input coordinates survive the DSF flag)');
    assert.doesNotMatch(ocr, /4242/, 'card digits masked before paint');
    assert.doesNotMatch(ocr, /ledgerly\.test/, 'e-mails masked');
    assert.doesNotMatch(ocr, /AKIA/, 'AWS key masked');
    assert.doesNotMatch(ocr, /hunter2/, 'password masked');
    assert.doesNotMatch(ocr, /sk-abc/, 'input value masked');
    assert.match(ocr, /ghp/, 'the canvas token is the one leak Layer 1 cannot reach');

    const out2 = path.join(dir, 'cap2');
    const r2 = await runAsync(['--url', srv.url, '--flow', flow, '--out', out2, '--confirm-findings']);
    assert.equal(r2.status, 0, r2.stderr);
    const m2 = readJson(path.join(out2, 'capture-manifest.json'));
    assert.equal(m2.blocked, false);
    assert.equal(m2.redaction.layer2_ocr_gate.confirmed, true);
    assert.ok(m2.redaction.layer2_ocr_gate.findings >= 1);
    assert.ok(fs.existsSync(path.join(out2, 'redaction-findings.json')));

    const rec = path.join(dir, 'user.mp4');
    fs.copyFileSync(path.join(out, 'footage.mp4'), rec);
    const out3 = path.join(dir, 'cap3');
    const r3 = await runAsync(['--recording', rec, '--tier', 'B', '--out', out3]);
    assert.equal(r3.status, 3, `tier B must still block on the canvas token (regression: empty gate), got ${r3.status}: ${r3.stderr}`);
    const m3 = readJson(path.join(out3, 'capture-manifest.json'));
    assert.equal(m3.tier, 'B');
    assert.equal(m3.chain_step, 'recording');
    assert.deepEqual(m3.capture, { backend: 'user-supplied-recording' });
    assert.equal(m3.redaction.layer1_dom_masking.applied, false);
    assert.equal(m3.timeline, null);
    assert.ok(m3.redaction.layer2_ocr_gate.sampled_frames >= 1);
    assert.ok(m3.redaction.layer2_ocr_gate.ocr_frames >= 1);
    assert.deepEqual(m3.artifacts, ['footage.mp4', 'events.jsonl', 'capture-manifest.json', 'redaction-findings.json']);
    assert.equal(fs.readFileSync(path.join(out3, 'events.jsonl'), 'utf8'), '');
    assert.ok(!fs.existsSync(path.join(out3, 'redactions.json')), 'no DOM to mask in tier B');
  } finally {
    await srv.close();
  }
});

test('end-to-end: a clean page passes — exit 0, gate ran with 0 findings, no findings file; --skip-ocr-gate is stamped, never a fake clean gate', async (t) => {
  const missing = await toolchainMissing();
  if (missing) return t.skip(missing);
  const dir = tmp();
  const srv = await serve('<!doctype html><title>Clean</title><h1>Hello, world</h1><p>Nothing to hide. Version 2.3.4, released 2026-09-20.</p>');
  try {
    const out = path.join(dir, 'cap');
    const r = await runAsync(['--url', srv.url, '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /record-flow: tier=A chain=prod frames=\d+ events=\d+/);
    const m = readJson(path.join(out, 'capture-manifest.json'));
    assert.equal(m.blocked, false);
    assert.equal(m.redaction.layer2_ocr_gate.ran, true);
    assert.equal(m.redaction.layer2_ocr_gate.findings, 0);
    assert.equal(m.redaction.layer1_dom_masking.replacements, 0);
    assert.ok(!fs.existsSync(path.join(out, 'redaction-findings.json')));
    assert.deepEqual(m.artifacts, ['footage.mp4', 'events.jsonl', 'capture-manifest.json', 'redactions.json']);
    const probe = ffprobe(path.join(out, 'footage.mp4'));
    assert.equal(probe.width, 3840);
    assert.ok(probe.duration >= CAPTURE_SPEC.defaultDwellMs / 1000 - 0.5, `no --flow: the default dwell is captured, got ${probe.duration}`);

    const out2 = path.join(dir, 'cap2');
    const r2 = await runAsync(['--url', srv.url, '--out', out2, '--skip-ocr-gate']);
    assert.equal(r2.status, 0, r2.stderr);
    const m2 = readJson(path.join(out2, 'capture-manifest.json'));
    assert.deepEqual(m2.redaction.layer2_ocr_gate, { ran: false, skipped: true, reason: '--skip-ocr-gate' });
  } finally {
    await srv.close();
  }
});

test('end-to-end: --local starts the repo\'s dev script, captures the printed localhost URL and stops it afterwards', async (t) => {
  const missing = await toolchainMissing();
  if (missing) return t.skip(missing);
  const repo = tmp();
  fs.writeFileSync(path.join(repo, 'server.mjs'), `import http from 'node:http';
const s = http.createServer((q, r) => { r.writeHead(200, {'content-type': 'text/html'}); r.end('<!doctype html><h1>Local app</h1>'); });
s.listen(0, '127.0.0.1', () => console.log('listening on http://localhost:' + s.address().port + '/'));
`);
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'local-app', private: true, scripts: { dev: 'node server.mjs' } }));
  const out = path.join(repo, 'cap');
  const r = await runAsync(['--local', '--repo', repo, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const m = readJson(path.join(out, 'capture-manifest.json'));
  assert.equal(m.chain_step, 'local');
  assert.equal(m.environment, 'local');
  assert.match(m.url, /^http:\/\/localhost:\d+\/$/);
  assert.equal(ffprobe(path.join(out, 'footage.mp4')).width, 3840);
  const port = Number(new URL(m.url).port);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => { res.resume(); assert.fail('dev server still running after the capture'); });
    req.on('error', () => resolve());
  });
});

const guardHook = path.join(here, '..', 'hooks', 'guard-render.sh');

function guardProject(manifest) {
  const dir = tmp('pp-guard-');
  fs.mkdirSync(path.join(dir, 'QA'));
  fs.writeFileSync(path.join(dir, 'QA', 'check.json'), '{"ok":true}');
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '---\napproved: v1\n---\n# Storyboard\n');
  if (manifest) {
    fs.mkdirSync(path.join(dir, '.media', 'capture'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.media', 'capture', 'capture-manifest.json'), JSON.stringify(manifest));
  }
  const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'v1: fixture');
  return dir;
}
function guardDataDir(doctor = { schema: 'power-presentation/doctor@0.1', hyperframes: '0.8.47', gate: { ok: true, failed: [] } }) {
  const dir = tmp('pp-guard-data-');
  if (doctor) fs.writeFileSync(path.join(dir, 'doctor.json'), JSON.stringify(doctor));
  return dir;
}
function runGuard(dir, { enforce = true, command = 'npx hyperframes@0.8.47 render index.html --quality delivery', dataDir = guardDataDir() } = {}) {
  const input = JSON.stringify({ cwd: dir, tool_name: 'Bash', tool_input: { command } });
  return spawnSync('bash', [guardHook], { input, encoding: 'utf8', env: { ...process.env, POWER_PRESENTATION_HOOKS_ENFORCE: enforce ? '1' : '0', CLAUDE_PLUGIN_DATA: dataDir, POWER_PRESENTATION_DATA: '' } });
}
function guardAvailable() {
  return binAvailable('bash') && binAvailable('git') && (binAvailable('jq') || binAvailable('python3'));
}

test('guard-render.sh: a blocked capture-manifest.json denies `hyperframes render` in enforce mode, names the findings file and --confirm-findings; dry-run only logs', (t) => {
  if (!guardAvailable()) return t.skip('bash, git and jq/python3 needed');
  const dir = guardProject({ blocked: true, redaction: { layer2_ocr_gate: { ran: true, sampled_frames: 4, ocr_frames: 3, gitleaks: 'ok', findings: 2, confirmed: false } } });
  const r = runGuard(dir);
  assert.equal(r.status, 0, 'the deny travels in the JSON, never in the exit code');
  const out = JSON.parse(r.stdout.trim());
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /\.media\/capture\/capture-manifest\.json is blocked — 2 potential secret\/PII match/);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /redaction-findings\.json/);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /--confirm-findings/);
  assert.doesNotMatch(out.hookSpecificOutput.permissionDecisionReason, /storyboard-approved|edit-scope|QA-02/, 'only the capture gate fails on this fixture');
  const dry = runGuard(dir, { enforce: false });
  assert.equal(dry.status, 0);
  assert.equal(dry.stdout, '', 'dry-run never writes to stdout');
  assert.match(dry.stderr, /would DENY .*capture-clean/);
});

test('guard-render.sh: a confirmed manifest, a clean one and no manifest at all pass; a gate that did not run (--skip-ocr-gate, no tesseract) denies unless confirmed; non-render commands are ignored', (t) => {
  if (!guardAvailable()) return t.skip('bash, git and jq/python3 needed');
  const pass = (dir, why) => { const r = runGuard(dir); assert.equal(r.status, 0); assert.equal(r.stdout, '', `${why}: ${r.stdout}`); assert.match(r.stderr, /gates pass .*captures clean/); };
  const deny = (dir, re) => { const r = runGuard(dir); const out = JSON.parse(r.stdout.trim()); assert.match(out.hookSpecificOutput.permissionDecisionReason, re); };
  pass(guardProject({ blocked: false, redaction: { layer2_ocr_gate: { ran: true, sampled_frames: 4, ocr_frames: 3, gitleaks: 'ok', findings: 2, confirmed: true } } }), 'confirmed findings');
  pass(guardProject({ blocked: false, redaction: { layer2_ocr_gate: { ran: true, sampled_frames: 4, ocr_frames: 3, gitleaks: 'unavailable', findings: 0, confirmed: false } } }), 'clean capture, degraded gitleaks is not a block');
  pass(guardProject(null), 'no capture (tier C reconstruction)');
  deny(guardProject({ blocked: false, redaction: { layer2_ocr_gate: { ran: false, skipped: true, reason: '--skip-ocr-gate' } } }), /did not run \(--skip-ocr-gate\).*unscanned/);
  deny(guardProject({ blocked: false, redaction: { layer2_ocr_gate: { ran: false, reason: 'tesseract not available', sampled_frames: 0, ocr_frames: 0, gitleaks: 'ok', findings: 0, confirmed: false } } }), /did not run \(tesseract not available\)/);
  pass(guardProject({ blocked: false, redaction: { layer2_ocr_gate: { ran: false, reason: 'tesseract not available', sampled_frames: 0, ocr_frames: 0, gitleaks: 'ok', findings: 0, confirmed: true } } }), 'unscanned but knowingly confirmed');
  const blocked = guardProject({ blocked: true, redaction: { layer2_ocr_gate: { ran: true, findings: 1, confirmed: false } } });
  const other = runGuard(blocked, { command: 'npx hyperframes check --json' });
  assert.equal(other.stdout, '', 'not a render — the guard stays silent');
});

test('guard-render.sh: bookkeeping the plugin rewrites on every call (stage clock, progress line, its tmp file) is not an edit; a real edit still is', (t) => {
  if (!guardAvailable()) return t.skip('bash, git and jq/python3 needed');
  const dir = guardProject(null);
  fs.mkdirSync(path.join(dir, '.hyperframes'), { recursive: true });
  for (const f of ['pp-stages.json', 'progress.json', 'progress.json.4242.tmp']) fs.writeFileSync(path.join(dir, '.hyperframes', f), '{}');
  assert.equal(runGuard(dir).stdout, '', 'only bookkeeping changed → the render passes');
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '---\napproved: v1\n---\n# Storyboard, edited\n');
  assert.match(JSON.parse(runGuard(dir).stdout.trim()).hookSpecificOutput.permissionDecisionReason, /edit-scope: .*STORYBOARD\.md/);
});

test('guard-render.sh: a render in the run workspace is judged on the workspace, not the session cwd (cd <P> &&, render <dir>, --project)', (t) => {
  if (!guardAvailable()) return t.skip('bash, git and jq/python3 needed');
  const repo = tmp('pp-guard-repo-');
  const ws = path.join(repo, 'power-presentation-out', 'shop-marketing');
  fs.mkdirSync(path.dirname(ws), { recursive: true });
  fs.renameSync(guardProject(null), ws);
  const run = (command) => { const input = JSON.stringify({ cwd: repo, tool_name: 'Bash', tool_input: { command } }); return spawnSync('bash', [guardHook], { input, encoding: 'utf8', env: { ...process.env, POWER_PRESENTATION_HOOKS_ENFORCE: '1', CLAUDE_PLUGIN_DATA: guardDataDir(), POWER_PRESENTATION_DATA: '' } }); };
  for (const command of [`cd "${ws}" && npx hyperframes@0.8.47 render . --quality delivery`, 'cd power-presentation-out/shop-marketing && hyperframes render', `npx hyperframes@0.8.47 render "${ws}" --quality delivery`, `hyperframes render --project ${ws}`]) {
    const r = run(command);
    assert.equal(r.stdout, '', `${command}: ${r.stdout}`);
    assert.match(r.stderr, /gates pass/, command);
  }
  const root = run('npx hyperframes@0.8.47 render index.html');
  assert.match(JSON.parse(root.stdout.trim()).hookSpecificOutput.permissionDecisionReason, /QA-02: QA\/check\.json missing/, 'the repository root itself is no project');
});

test('guard-render.sh: the toolchain-ready gate — no doctor.json, a report from another CLI version, or a failed gate deny the render and name `toolchain.mjs doctor`; a passing report for the pin is silent', (t) => {
  if (!guardAvailable()) return t.skip('bash, git and jq/python3 needed');
  const project = guardProject(null);
  const deny = (dataDir, re) => {
    const r = runGuard(project, { dataDir });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout.trim());
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, re);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /toolchain\.mjs doctor/);
    assert.doesNotMatch(out.hookSpecificOutput.permissionDecisionReason, /storyboard-approved|edit-scope|QA-02|capture-clean/, 'only the toolchain gate fails on this fixture');
  };
  deny(guardDataDir(null), /no doctor report at .*doctor\.json/);
  deny(guardDataDir({ schema: 'power-presentation/doctor@0.1', hyperframes: '0.8.46', gate: { ok: true, failed: [] } }), /produced by hyperframes 0\.8\.46, not the pinned 0\.8\.47/);
  deny(guardDataDir({ schema: 'power-presentation/doctor@0.1', hyperframes: '0.8.47', gate: { ok: false, failed: [{ name: 'Chrome', detail: 'not found' }, { name: 'FFmpeg', detail: 'missing' }] } }), /doctor gate failed \(Chrome FFmpeg\)/);
  const ok = runGuard(project);
  assert.equal(ok.stdout, '', 'a passing report for the pin adds nothing');
  assert.match(ok.stderr, /toolchain ready/);
  const dry = runGuard(project, { enforce: false, dataDir: guardDataDir(null) });
  assert.equal(dry.stdout, '');
  assert.match(dry.stderr, /would DENY .*toolchain-ready/);
});

test('no script hard-codes a home directory or a machine path', () => {
  assert.doesNotMatch(source, /\/home\/[a-z]/);
  assert.doesNotMatch(source, /\/Users\/[a-z]/);
  assert.ok(pathToFileURL(script).href.endsWith('/scripts/record-flow.mjs'));
});

import { applySeed, parseSeedPlan } from './record-flow.mjs';

test('parseSeedPlan() / applySeed(): API routes answered from fixtures + an init script; bad plans refused; the manifest records sha256s', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'fixtures'));
  fs.writeFileSync(path.join(dir, 'fixtures', 'lines.json'), '[{"id":1,"counterparty":"Alder & Finch (demo)"}]');
  fs.writeFileSync(path.join(dir, 'seed-init.js'), 'window.__DEMO__ = true;');
  const plan = parseSeedPlan(JSON.stringify({ routes: [{ url: '**/api/lines*', file: 'fixtures/lines.json' }], init: 'seed-init.js' }), dir);
  assert.equal(plan.routes[0].contentType, 'application/json');
  assert.equal(plan.routes[0].status, 200);
  assert.match(plan.routes[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(plan.init.file, path.join(dir, 'seed-init.js'));
  assert.throws(() => parseSeedPlan('{', dir), /not JSON/);
  assert.throws(() => parseSeedPlan('{"routes":[{"url":"**/x","file":"missing.json"}]}', dir), /not found: missing\.json/);
  assert.throws(() => parseSeedPlan('{"routes":[]}', dir), /seeds nothing/);
  assert.throws(() => parseSeedPlan('{"routes":[{"file":"fixtures/lines.json"}]}', dir), /url must be/);
  const calls = [];
  const fake = { addInitScript: async (page, src) => calls.push(['init', src]), route: async (page, url, spec) => calls.push(['route', url, path.basename(spec.file), spec.status, spec.contentType]) };
  await applySeed(fake, {}, plan);
  assert.deepEqual(calls, [['init', 'window.__DEMO__ = true;'], ['route', '**/api/lines*', 'lines.json', 200, 'application/json']]);
  await applySeed(fake, {}, null);
  assert.equal(calls.length, 2, 'no plan → nothing installed');
  const m = buildManifest({ tier: 'A', chain: { step: 'prod', environment: 'prod' }, url: 'http://x', redaction: {}, eventsCount: 0, artifacts: [], createdAt: 'now', seed: plan });
  assert.deepEqual(m.seed.routes.map((r) => [r.url, r.file]), [['**/api/lines*', 'lines.json']]);
  assert.equal(m.seed.init.file, 'seed-init.js');
  assert.equal(buildManifest({ tier: 'A', chain: { step: 'prod', environment: 'prod' }, url: null, redaction: {}, eventsCount: 0, artifacts: [], createdAt: 'now' }).seed, null);
});

import { main, realBrowserDriver } from './record-flow.mjs';

function fakeBrowser({ failOn = () => false, failGoto = false, screens = null } = {}) {
  const calls = [];
  let paint = null;
  let n = 0;
  const frame = () => paint?.(Buffer.from(`jpeg-${n++}`), Date.now());
  const act = (name) => async (page, arg) => {
    calls.push([name, arg]);
    if (failOn({ name, arg })) throw new Error(`page.${name}: Timeout 8000ms exceeded.\nCall log:\n  - waiting for locator('${arg}')`);
    frame();
  };
  return {
    calls,
    async newPage() { calls.push(['newPage']); return { id: 'page' }; },
    async setFixedTime() {}, async addInitScript() {}, async exposeFunction() {}, async route() {},
    async goto(page, url) { calls.push(['goto', url]); if (failGoto) throw new Error('page.goto: net::ERR_NAME_NOT_RESOLVED'); frame(); },
    click: act('click'), hover: act('hover'), type: act('fill'), pressKey: act('press'), scrollIntoView: act('scroll'), waitForSelector: act('waitForSelector'),
    async wait(ms) { calls.push(['wait', ms]); await new Promise((r) => setTimeout(r, Math.min(ms, 20))); },
    async startScreencast(page, spec, onFrame) { calls.push(['startScreencast']); paint = onFrame; },
    async stopScreencast() { calls.push(['stopScreencast']); paint = null; },
    async getRedactions() { return []; },
    ...(screens ? { async snapshotScreen() { calls.push(['snapshot']); return screens(calls.filter((c) => c[0] === 'click').length); } } : {}),
    async close() { calls.push(['close']); },
  };
}
const fakeFfmpeg = (bin, args) => { fs.writeFileSync(args[args.length - 1], 'mp4'); return { status: 0 }; };

async function runMain(t, argv, deps) {
  const err = []; const out = [];
  t.mock.method(console, 'error', (...a) => { err.push(a.join(' ')); });
  t.mock.method(console, 'log', (...a) => { out.push(a.join(' ')); });
  try {
    const code = await main(argv, { ocr: { available: () => true, recognize: () => '' }, gitleaks: { available: () => false }, execFn: fakeFfmpeg, ...deps });
    return { code, stderr: err.join('\n'), stdout: out.join('\n') };
  } finally {
    t.mock.restoreAll();
  }
}

test('screens.jsonl: what the running product says on each step — URL without query, secrets re-masked, unchanged steps skipped (source precedence)', async (t) => {
  const dir = tmp();
  const flowFile = path.join(dir, 'flow.json');
  fs.writeFileSync(flowFile, JSON.stringify([{ action: 'click', selector: '#reports' }, { action: 'hover', selector: '#x' }, { action: 'click', selector: '#close' }]));
  const page = (clicks) => clicks === 0
    ? { url: 'https://app.test/home?token=abc#frag', title: 'Home', description: null, headings: ['Welcome back'], nav: ['Home', 'Reports', 'Settings'], buttons: ['New report'], text: 'Welcome back New report' }
    : { url: 'https://app.test/reports', title: 'Reports', description: 'Monthly close', headings: ['Reports'], nav: ['Home', 'Reports'], buttons: ['Export'], text: 'Reports key AKIAABCDEFGHIJKLMNOP Export' };
  const browser = fakeBrowser({ screens: page });
  const out = path.join(dir, 'cap');
  const r = await runMain(t, ['--url', 'https://app.test/home', '--flow', flowFile, '--out', out], { browser });
  assert.equal(r.code, 0, r.stderr);
  const lines = fs.readFileSync(path.join(out, 'screens.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => [l.step, l.action, l.url]), [[null, 'goto', 'https://app.test/home'], [0, 'click', 'https://app.test/reports']], 'the hover and the second click changed nothing on screen');
  assert.deepEqual(lines[0].nav, ['Home', 'Reports', 'Settings']);
  assert.ok(!lines[1].text.includes('AKIA'), 'a secret the page still shows is masked in the text');
  assert.match(lines[1].text, /Reports key \u2588{20} Export/);
  assert.equal(typeof lines[1].footage_t_sec, 'number');
  assert.ok(readJson(path.join(out, 'capture-manifest.json')).artifacts.includes('screens.jsonl'));
  assert.equal(sanitizeSnapshot(null), null);
  assert.equal(sanitizeSnapshot({ url: 'not a url', text: 'x' }).url, null);
  assert.equal(typeof snapshotInPage, 'function', 'serialisable for page.evaluate');
  const noSnap = fakeBrowser();
  const out2 = path.join(dir, 'cap2');
  assert.equal((await runMain(t, ['--url', 'https://app.test/home', '--flow', flowFile, '--out', out2], { browser: noSnap })).code, 0);
  assert.ok(!fs.existsSync(path.join(out2, 'screens.jsonl')), 'a driver without snapshots writes none');
});

test('CAPTURE_SPEC: 8 s per flow step, goto keeps 30 s; the real driver sets the page default timeout and passes goto its own (gs-01:D3)', async () => {
  assert.equal(CAPTURE_SPEC.stepTimeoutMs, 8000);
  assert.equal(CAPTURE_SPEC.navTimeoutMs, 30000);
  assert.match(USAGE, /Each --flow step gets 8 s \(goto 30 s\).*exit 4/s);
  const seen = [];
  const page = {
    setDefaultTimeout: (ms) => seen.push(['setDefaultTimeout', ms]),
    goto: async (url, o) => seen.push(['goto', url, o]),
    close: async () => seen.push(['page.close']),
  };
  const pw = { chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => page }), close: async () => seen.push(['browser.close']) }) } };
  const d = realBrowserDriver(pw);
  const p = await d.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await d.goto(p, 'https://x');
  assert.deepEqual(seen.slice(0, 2), [['setDefaultTimeout', 8000], ['goto', 'https://x', { waitUntil: 'load', timeout: 30000 }]]);
  await d.close(null);
  assert.deepEqual(seen.slice(2), [['browser.close']]);
});

test('main: a failed flow step stops the flow, keeps footage + events + redactions + manifest with the `flow` block, exits 4; later steps never run; the browser is closed (gs-01:D3, C7)', async (t) => {
  const dir = tmp();
  const flowFile = path.join(dir, 'flow.json');
  fs.writeFileSync(flowFile, JSON.stringify([
    { action: 'click', selector: '#tab-sources' },
    { action: 'click', selector: 'text="ENTRY PAGES"' },
    { action: 'click', selector: '#tab-goals' },
  ]));
  const browser = fakeBrowser({ failOn: ({ arg }) => arg === 'text="ENTRY PAGES"' });
  const out = path.join(dir, 'cap');
  const r = await runMain(t, ['--url', 'https://plausible.test/', '--flow', flowFile, '--out', out], { browser });
  assert.equal(r.code, 4, r.stderr);
  assert.match(r.stderr, /flow step --flow\[1\] \(click text="ENTRY PAGES"\) failed: page\.click: Timeout 8000ms exceeded\. — the flow stopped after 1\/3 steps/);
  for (const f of ['footage.mp4', 'events.jsonl', 'redactions.json', 'capture-manifest.json']) assert.ok(fs.existsSync(path.join(out, f)), f);
  const m = readJson(path.join(out, 'capture-manifest.json'));
  assert.equal(m.flow.steps_total, 3);
  assert.equal(m.flow.steps_done, 1);
  const fstep = m.flow.failed_step;
  assert.equal(fstep.index, 1);
  assert.equal(fstep.action, 'click');
  assert.equal(fstep.selector, 'text="ENTRY PAGES"');
  assert.equal(fstep.error, 'page.click: Timeout 8000ms exceeded.', 'first line of the Playwright error only');
  assert.ok(fstep.t >= m.timeline.footage_start_ms && fstep.t <= m.timeline.footage_end_ms, 'the failed step maps onto the footage (epoch ms, like events.jsonl)');
  assert.equal(typeof fstep.footage_t_sec, 'number');
  assert.equal(m.blocked, false);
  assert.equal(m.redaction.layer2_ocr_gate.ran, true, 'the Layer-2 gate still runs on a partial capture');
  assert.deepEqual(m.artifacts, ['footage.mp4', 'events.jsonl', 'capture-manifest.json', 'redactions.json']);
  const events = fs.readFileSync(path.join(out, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(events[0].type, 'navigation');
  assert.equal(m.events.count, events.length);
  const names = browser.calls.map((c) => c[0]);
  assert.deepEqual(browser.calls.filter((c) => c[0] === 'click').map((c) => c[1]), ['#tab-sources', 'text="ENTRY PAGES"'], 'step 3 never runs on a state the flow did not reach');
  assert.ok(names.indexOf('stopScreencast') > names.lastIndexOf('click') && names.at(-1) === 'close', 'screencast stopped, browser closed');

  const ok = fakeBrowser();
  const out2 = path.join(dir, 'cap2');
  const r2 = await runMain(t, ['--url', 'https://plausible.test/', '--flow', flowFile, '--out', out2], { browser: ok });
  assert.equal(r2.code, 0, r2.stderr);
  assert.deepEqual(readJson(path.join(out2, 'capture-manifest.json')).flow, { steps_total: 3, steps_done: 3, failed_step: null });

  const dead = fakeBrowser({ failGoto: true });
  const out3 = path.join(dir, 'cap3');
  const r3 = await runMain(t, ['--url', 'https://nope.test/', '--flow', flowFile, '--out', out3], { browser: dead });
  assert.equal(r3.code, 1);
  assert.match(r3.stderr, /runtime failure during capture: page\.goto: net::ERR_NAME_NOT_RESOLVED/);
  assert.ok(!fs.existsSync(path.join(out3, 'capture-manifest.json')));
  assert.deepEqual(dead.calls.slice(-2).map((c) => c[0]), ['stopScreencast', 'close']);
});

test('buildManifest: `flow` is null unless given; steps_total / steps_done / failed_step pass through (C7)', () => {
  const base = { tier: 'A', chain: { step: 'prod', environment: 'prod' }, url: 'https://p', redaction: {}, eventsCount: 0, artifacts: [], createdAt: 'now' };
  assert.equal(buildManifest(base).flow, null);
  assert.deepEqual(buildManifest({ ...base, flow: { stepsTotal: 2, stepsDone: 2, failedStep: null } }).flow, { steps_total: 2, steps_done: 2, failed_step: null });
  const failedStep = { index: 0, action: 'hover', selector: '#x', error: 'boom', t: 1, footage_t_sec: 0 };
  assert.deepEqual(buildManifest({ ...base, flow: { stepsTotal: 2, stepsDone: 0, failedStep } }).flow.failed_step, failedStep);
});
