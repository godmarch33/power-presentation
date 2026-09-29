import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findVhs, runVhs } from './lib/vhs.mjs';
import { OCR_SAMPLE_FPS, extractRecordingFrames, realGitleaksDriver, realOcrDriver, runRedactionGate } from './record-flow.mjs';
import { PLUGIN_VERSION } from './lib/versions.mjs';

export const MASTER = { width: 1920, height: 1080 };

export const VHS_DEFAULTS = Object.freeze({ typingSpeedMs: 50, waitPattern: '>$', playbackSpeed: 1 });

export const FINE_FPS = 10;

export function vhsDurationMs(literal) {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(String(literal ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'ms' ? n : m[2] === 'm' ? n * 60000 : n * 1000;
}

function tapeTokens(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '#') break;
    if (c === '"' || c === "'" || c === '`') {
      const j = line.indexOf(c, i + 1);
      out.push({ str: line.slice(i + 1, j < 0 ? line.length : j) });
      i = j < 0 ? line.length : j + 1;
      continue;
    }
    if (c === '/') {
      let j = i + 1;
      while (j < line.length && (line[j] !== '/' || line[j - 1] === '\\')) j += 1;
      out.push({ re: line.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < line.length && !/\s/.test(line[j])) j += 1;
    out.push({ word: line.slice(i, j) });
    i = j;
  }
  return out;
}

const TAPE_KEYS = new Set(['Enter', 'Backspace', 'Delete', 'Insert', 'Tab', 'Space', 'Up', 'Down', 'Left', 'Right', 'Escape', 'PageUp', 'PageDown', 'ScrollUp', 'ScrollDown']);

export function tapeBeats(text) {
  const steps = [];
  let speed = VHS_DEFAULTS.typingSpeedMs;
  let waitPattern = VHS_DEFAULTS.waitPattern;
  let playback = VHS_DEFAULTS.playbackSpeed;
  let hidden = false;
  String(text).split('\n').forEach((raw, i) => {
    const line = i + 1;
    const toks = tapeTokens(raw);
    for (let k = 0; k < toks.length; k += 1) {
      const t = toks[k];
      if (!t.word) continue;
      const [name, at] = t.word.split('@');
      const push = (step) => { if (!hidden) steps.push({ ...step, line }); };
      if (name === 'Set') {
        const key = toks[k + 1]?.word;
        const val = toks[k + 2];
        if (key === 'TypingSpeed') speed = vhsDurationMs(val?.word) ?? speed;
        else if (key === 'WaitPattern' && val?.re != null) waitPattern = val.re;
        else if (key === 'PlaybackSpeed' && Number(val?.word) > 0) playback = Number(val.word);
        break;
      }
      if (['Output', 'Env', 'Require', 'Source', 'Screenshot', 'Copy'].includes(name)) break;
      if (name === 'Hide') { hidden = true; continue; }
      if (name === 'Show') { hidden = false; continue; }
      if (name === 'Type') {
        const s = toks[k + 1]?.str;
        if (s == null) continue;
        k += 1;
        push({ kind: 'type', text: s, dur_ms: [...s].length * (vhsDurationMs(at) ?? speed) });
      } else if (name === 'Sleep') {
        const ms = vhsDurationMs(toks[k + 1]?.word);
        if (ms == null) continue;
        k += 1;
        push({ kind: 'sleep', dur_ms: ms });
      } else if (/^Wait(?:\+(?:Screen|Line))?$/.test(name)) {
        const re = toks[k + 1]?.re;
        if (re != null) k += 1;
        push({ kind: 'wait', scope: name.includes('+Screen') ? 'Screen' : 'Line', pattern: re ?? waitPattern, prompt: re == null });
      } else if (TAPE_KEYS.has(name)) {
        let n = 1;
        if (/^\d+$/.test(toks[k + 1]?.word ?? '')) { n = Number(toks[k + 1].word); k += 1; }
        push({ kind: 'key', key: name, count: n, dur_ms: n * (vhsDurationMs(at) ?? speed) });
      }
    }
  });
  return { steps, playbackSpeed: playback };
}

function loosenPattern(src) {
  let out = '';
  let inClass = false;
  const quantified = (i) => /[*+?{]/.test(src[i + 1] ?? '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '\\') { out += c + (src[i + 1] ?? ''); i += 1; continue; }
    if (inClass) { if (c === ']') inClass = false; out += c === '_' ? '_ ' : c; continue; }
    if (c === '[') { inClass = true; out += c; continue; }
    if (c === '_') out += quantified(i) ? '[_ ]' : '[_ ]?';
    else if (c === '"') out += '["“”]';
    else if (c === "'") out += "['‘’]";
    else if (c === ' ') out += quantified(i) ? '\\s' : '\\s*';
    else out += c;
  }
  return out;
}

const safeRegExp = (src, flags) => { try { return new RegExp(src, flags); } catch { return null; } };

export function lenientCounter(pattern) {
  const strict = safeRegExp(pattern, 'gm');
  const loose = safeRegExp(loosenPattern(pattern), 'gmi');
  const count = (re, text) => {
    if (!re) return 0;
    let n = 0;
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) { n += 1; if (!m[0].length) re.lastIndex += 1; }
    return n;
  };
  return (text) => (typeof text === 'string' ? Math.max(count(strict, text), count(loose, text)) : 0);
}

export function lenientMatcher(pattern) {
  const count = lenientCounter(pattern);
  return (text) => count(text) > 0;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const MIN_ANCHOR_CHARS = 4;

export async function timeTapeBeats(parsed, { coarse = [], fine = null, fineFps = FINE_FPS, coarseFps = OCR_SAMPLE_FPS } = {}) {
  const r2 = (x) => Math.round(x * 100) / 100;
  const scale = 1 / (parsed.playbackSpeed || 1);
  const half = 0.5 / coarseFps;
  const beats = [];
  let clock = 0;
  let known = true;
  let command = '';
  let anchor = { t: 0, text: coarse[0]?.text ?? '' };
  const anchorOn = async (count) => {
    if (!coarse.length) return null;
    const base = count(anchor.text);
    const k = coarse.findIndex((c) => c.t >= anchor.t - 1e-6 && count(c.text) > base);
    if (k < 0) return null;
    let hit = { t: coarse[k].t, text: coarse[k].text };
    if (fine) {
      let a = Math.ceil(Math.max(anchor.t, k > 0 ? coarse[k - 1].t - half : 0) * fineFps - 1e-6);
      let b = Math.round((coarse[k].t + half) * fineFps);
      let found = null;
      while (a <= b) {
        const mid = (a + b) >> 1;
        const text = await fine(mid / fineFps);
        if (count(text) > base) { found = { t: mid / fineFps, text }; b = mid - 1; } else a = mid + 1;
      }
      if (found) hit = found;
    }
    return hit;
  };
  for (const s of parsed.steps) {
    const dur = ((s.dur_ms ?? 0) / 1000) * scale;
    if (s.kind === 'sleep') { clock += dur; continue; }
    if (s.kind === 'type') {
      const lit = s.text.trim();
      const hit = lit.length >= MIN_ANCHOR_CHARS ? await anchorOn(lenientCounter(escapeRegExp(lit))) : null;
      if (hit) {
        beats.push({ kind: 'type', t_sec: r2(Math.max(anchor.t, hit.t - dur)), end_sec: r2(hit.t), text: s.text, tape_line: s.line, timed_by: 'ocr' });
        anchor = hit; clock = hit.t; known = true;
      } else {
        beats.push({ kind: 'type', t_sec: known ? r2(clock) : null, end_sec: known ? r2(clock + dur) : null, text: s.text, tape_line: s.line, timed_by: 'tape' });
        clock += dur;
      }
      command += s.text;
    } else if (s.kind === 'key') {
      beats.push({ kind: 'key', key: s.key, ...(s.count !== 1 ? { count: s.count } : {}), t_sec: known ? r2(clock) : null, ...(s.key === 'Enter' && command ? { command } : {}), tape_line: s.line, timed_by: 'tape' });
      if (s.key === 'Enter') command = '';
      clock += dur;
    } else if (s.kind === 'wait') {
      const wait = { kind: 'wait', wait: `/${s.pattern}/`, scope: s.scope, ...(s.prompt ? { prompt: true } : {}) };
      const hit = await anchorOn(lenientCounter(s.pattern));
      if (!hit) {
        beats.push({ ...wait, t_sec: null, matched: false, tape_line: s.line, timed_by: coarse.length ? 'ocr' : 'none' });
        known = false;
        continue;
      }
      beats.push({ ...wait, t_sec: r2(hit.t), matched: true, tape_line: s.line, timed_by: 'ocr' });
      anchor = hit; clock = hit.t; known = true;
    }
  }
  let ceiling = Infinity;
  for (let i = beats.length - 1; i >= 0; i -= 1) {
    const b = beats[i];
    if (b.timed_by !== 'ocr') {
      if (b.t_sec != null && b.t_sec > ceiling) b.t_sec = ceiling;
      if (b.end_sec != null && b.end_sec > ceiling) b.end_sec = ceiling;
    }
    if (b.t_sec != null) ceiling = Math.min(ceiling, b.t_sec);
  }
  return beats;
}

export const USAGE = `Usage: node scripts/record-terminal.mjs [--tape <file>] [--repo <dir>] [--out .media/capture/] [--frames]
       [--confirm-findings] [--skip-ocr-gate] [--print]

Records a VHS tape into footage.mp4 + capture-manifest.json with the Layer-2 gate. --tape defaults to
the only *.tape in --repo (default: the working directory). The manifest's timeline.beats gives the footage second of
every shown Type / key / Wait of the tape (typed text and Waits found on the OCR'd frames) for capture_window bounds.
Exit 0 ok, 3 blocked / tape below 1920x1080, 2 usage, 1 runtime.`;

export function parseArgs(argv) {
  const o = { tape: null, repo: process.cwd(), out: null, frames: false, confirmFindings: false, skipOcrGate: false, print: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--tape') o.tape = next();
    else if (a === '--repo') o.repo = next();
    else if (a === '--out') o.out = next();
    else if (a === '--frames') o.frames = true;
    else if (a === '--confirm-findings') o.confirmFindings = true;
    else if (a === '--skip-ocr-gate') o.skipOcrGate = true;
    else if (a === '--print') o.print = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  o.repo = path.resolve(o.repo);
  o.out = path.resolve(o.out ?? path.join(o.repo, '.media', 'capture'));
  return o;
}

export function prepareTape(text, { out, repo }) {
  const lines = String(text).replace(/__REPO__/g, repo).split('\n');
  const outLine = `Output ${JSON.stringify(path.join(out, 'footage.mp4'))}`;
  const kept = [];
  const dropped = [];
  let placed = false;
  for (const line of lines) {
    const m = /^\s*Output\s+(\S+)/.exec(line);
    if (!m) { kept.push(line); continue; }
    dropped.push(m[1]);
    if (!placed) { kept.push(outLine); placed = true; }
  }
  if (!placed) kept.unshift(outLine);
  const num = (key) => { const m = new RegExp(`^\\s*Set\\s+${key}\\s+(\\d+)`, 'm').exec(text); return m ? Number(m[1]) : null; };
  const width = num('Width');
  const height = num('Height');
  return { tape: kept.join('\n'), size: width && height ? { width, height } : null, droppedOutputs: dropped };
}

export function sizeProblem(size, master = MASTER) {
  const s = size ?? { width: 1200, height: 600 };
  return s.width < master.width || s.height < master.height ? `capture_size_below_output: the tape renders ${s.width}×${s.height}, the master is ${master.width}×${master.height} — add \`Set Width ${master.width}\` / \`Set Height ${master.height}\`` : null;
}

export function findTape(repo) {
  const tapes = fs.readdirSync(repo).filter((n) => n.endsWith('.tape')).sort();
  return tapes.length === 1 ? path.join(repo, tapes[0]) : { error: tapes.length ? `more than one tape in ${repo}: ${tapes.join(', ')} — pass --tape` : `no *.tape in ${repo} — write one (Hide/Show, Wait /regex/, a fictitious Env) or pass --tape` };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export async function main(argv = process.argv.slice(2)) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(e.message); console.error(USAGE); return 2; }
  if (o.help) { console.log(USAGE); return 0; }
  let tapeFile = o.tape ? path.resolve(o.tape) : findTape(o.repo);
  if (tapeFile?.error) { console.error(tapeFile.error); return 2; }
  if (!fs.existsSync(tapeFile)) { console.error(`tape not found: ${tapeFile}`); return 2; }
  const raw = fs.readFileSync(tapeFile, 'utf8');
  const prepared = prepareTape(raw, { out: o.out, repo: o.repo });
  const small = sizeProblem(prepared.size);
  if (small) { console.error(small); return 3; }
  const vhs = findVhs();
  if (!vhs) { console.error('vhs not found on PATH nor in ${CLAUDE_PLUGIN_DATA}/toolchain/bin — VHS 0.11.0 + ttyd are system dependencies (vhs 0.12.0 renders nothing)'); return 1; }
  fs.mkdirSync(o.out, { recursive: true });
  for (const stale of ['footage.mp4', 'redaction-findings.json']) fs.rmSync(path.join(o.out, stale), { force: true });
  const runTape = path.join(o.out, 'terminal.tape');
  fs.writeFileSync(runTape, prepared.tape);
  const env = vhs === 'vhs' ? process.env : { ...process.env, PATH: `${path.dirname(vhs)}${path.delimiter}${process.env.PATH ?? ''}` };
  const r = runVhs(vhs, runTape, { cwd: o.repo, env, timeoutMs: 300000 });
  if (r.sandboxError) console.error(`record-terminal: headless Chrome's sandbox would not start (${r.sandboxError}) — VHS re-ran with VHS_NO_SANDBOX=true (it renders only the tape's local terminal)`);
  const footage = path.join(o.out, 'footage.mp4');
  if (r.status !== 0 || !fs.existsSync(footage)) { console.error(`vhs failed (exit ${r.status ?? r.error?.message}): ${(r.stderr || r.stdout || '').trim().slice(-400)}`); return 1; }

  let frameCount = 0;
  if (o.frames) {
    const framesDir = path.join(o.out, 'frames');
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });
    spawnSync(process.env.HYPERFRAMES_FFMPEG_PATH || 'ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', footage, '-vf', 'fps=10', path.join(framesDir, 'frame-%05d.png')], { timeout: 120000 });
    frameCount = fs.readdirSync(framesDir).filter((n) => n.endsWith('.png')).length;
  }

  const redaction = { layer1_fictitious_env: { applied: /^\s*Env\s+/m.test(raw), hidden_setup: /^\s*Hide\b/m.test(raw) }, layer2_ocr_gate: { ran: false, skipped: true } };
  let blocked = false;
  let coarse = [];
  let ocrState = 'not run: --skip-ocr-gate';
  if (o.skipOcrGate) redaction.layer2_ocr_gate = { ran: false, skipped: true, reason: '--skip-ocr-gate' };
  else {
    let sample;
    try { sample = extractRecordingFrames(footage); } catch (err) { console.error(`runtime failure: ${err.message}`); return 1; }
    const gate = await runRedactionGate(sample.files, { ocr: realOcrDriver(), gitleaks: realGitleaksDriver() });
    fs.rmSync(sample.framesDir, { recursive: true, force: true });
    redaction.layer2_ocr_gate = { ran: gate.ran, sampled_frames: gate.sampledFrames, ocr_frames: gate.ocrFrames, gitleaks: gate.gitleaks, findings: gate.findings.length, confirmed: o.confirmFindings };
    if (!gate.ran) redaction.layer2_ocr_gate.reason = gate.reason;
    if (gate.findings.length) {
      fs.writeFileSync(path.join(o.out, 'redaction-findings.json'), JSON.stringify(gate.findings, null, 2));
      blocked = !o.confirmFindings;
    }
    if (gate.ran) coarse = (gate.texts ?? []).map((text, i) => ({ t: i / OCR_SAMPLE_FPS, text }));
    ocrState = gate.ran ? 'ok' : `not run: ${gate.reason}`;
  }

  const parsed = tapeBeats(raw);
  let fineDir = null;
  const fine = coarse.length && parsed.steps.some((s) => s.kind === 'wait' || s.kind === 'type') ? stillsAt(o.frames && frameCount ? path.join(o.out, 'frames') : null, footage, (d) => { fineDir = d; }) : null;
  const beats = await timeTapeBeats(parsed, { coarse, fine });
  if (fineDir) fs.rmSync(fineDir, { recursive: true, force: true });
  const probe = probeFootage(footage);
  const timeline = {
    footage_start_ms: 0, footage_end_ms: probe?.duration != null ? Math.round(probe.duration * 1000) : null,
    events_origin: 'footage ms (vhs, no events.jsonl); beats[].t_sec are footage seconds',
    beats_source: 'OCR anchors (a Type where its text appears in full, a Wait on the first frame with a new match) + tape durations between them', ocr: ocrState,
    beats,
  };
  const unmatched = beats.filter((b) => b.kind === 'wait' && !b.matched).length;
  const artifacts = ['footage.mp4', 'terminal.tape', 'capture-manifest.json'];
  if (fs.existsSync(path.join(o.out, 'redaction-findings.json'))) artifacts.push('redaction-findings.json');
  if (frameCount) artifacts.push('frames/');
  const version = spawnSync(vhs, ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null;
  const manifest = {
    schema: 'power-presentation/capture-manifest@0.1', plugin_version: PLUGIN_VERSION,
    tier: 'A', environment: 'local', chain_step: 'vhs', url: null,
    capture: {
      backend: 'vhs', vhs: version, tape: path.relative(o.repo, tapeFile), tape_sha256: sha256(Buffer.from(raw)), size: prepared.size, outputs_replaced: prepared.droppedOutputs,
      screencast_size: probe?.width && probe?.height ? { width: probe.width, height: probe.height } : prepared.size, viewport: prepared.size,
      chrome_sandbox: r.noSandbox ? { used: false, reason: r.sandboxError ?? 'VHS_NO_SANDBOX set by the caller' } : { used: true },
    },
    artifacts, events: { count: 0, file: null }, timeline, redaction, blocked, created_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(o.out, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (o.print) console.log(JSON.stringify(manifest, null, 2));
  if (unmatched) console.error(`record-terminal: ${unmatched} Wait beat(s) matched no OCR'd frame (${ocrState}) — their times, and the tape-timed beats after them up to the next anchor, are null in capture-manifest.json timeline.beats`);
  if (blocked) {
    console.error(`BLOCKED: ${redaction.layer2_ocr_gate.findings} potential secret/PII match(es) in the terminal frames — see ${path.join(o.out, 'redaction-findings.json')}. Re-run with --confirm-findings after review.`);
    return 3;
  }
  console.log(`record-terminal: tier=A backend=vhs ${prepared.size.width}x${prepared.size.height}${frameCount ? ` frames=${frameCount}` : ''} gate=${redaction.layer2_ocr_gate.ran ? `${redaction.layer2_ocr_gate.findings} finding(s)` : 'not run'} beats=${beats.length} -> ${o.out}`);
  return 0;
}

function probeFootage(file) {
  const r = spawnSync(process.env.HYPERFRAMES_FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const s = j.streams?.[0] ?? {};
    return { width: s.width ?? null, height: s.height ?? null, duration: Number.isFinite(Number(j.format?.duration)) ? Number(j.format.duration) : null };
  } catch { return null; }
}

function stillsAt(framesDir, footage, onDir) {
  const ocr = realOcrDriver();
  if (!ocr.available()) return null;
  let files = null;
  const cache = new Map();
  return async (t) => {
    if (!files) {
      if (framesDir) files = fs.readdirSync(framesDir).filter((n) => n.endsWith('.png')).sort().map((n) => path.join(framesDir, n));
      else {
        try { const s = extractRecordingFrames(footage, { fps: FINE_FPS }); onDir(s.framesDir); files = s.files; } catch { files = []; }
      }
    }
    const f = files[Math.round(t * FINE_FPS)];
    if (!f) return null;
    if (!cache.has(f)) cache.set(f, await ocr.recognize(f));
    return cache.get(f);
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().then((code) => process.exit(code), (err) => { console.error(err?.stack ?? String(err)); process.exit(1); });
