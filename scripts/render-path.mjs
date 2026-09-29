import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pluginRoot, userSkillsDir, vendorDir } from './lib/paths.mjs';
import { GSAP_PIN, HYPERFRAMES_PIN, PLUGIN_VERSION, VENDORED_WORKFLOW } from './lib/versions.mjs';
import { diffTrees } from './lib/skill-bundle.mjs';
import { describeThrottle, throttleSpec, throttled } from './lib/throttle.mjs';
import { cliEnv, findKokoro, locateCli, networkManifest, readDoctor, resolvePaths } from './toolchain.mjs';
import { clampFocus, gsapSnippet, poseTransform } from './autozoom.mjs';
import { buildHostSidecar } from './lib/motion-sidecar.mjs';
import { fontsSummary, missingFontsReason, stageFonts } from './lib/fonts.mjs';
import { freezeProject } from './media-ledger.mjs';
import { packsDir, resolveSfx, resolveTrack } from './media-packs.mjs';
import { HF_TELEMETRY, appendEgress, cliStageEgress, compositionRefs, telemetryOff } from './lib/egress.mjs';
import { ON_SCREEN_DISCLOSURE, endCardDisclosure } from './run-report.mjs';
import { stamp as stampProspectRetention } from './prospect-retention.mjs';
import { STOP_LIST } from './share-copy.mjs';
import { runProfile } from './lib/run-profile.mjs';

export const STAGES_SCHEMA = 'power-presentation/stage-times@0.1';
export const DISPATCH_SCHEMA = 'power-presentation/frame-dispatch@0.1';

export const TIMEOUTS_S = { packets: 60, audio: 900, captions: 60, assemble: 60, transitions: 60, lint: 60, check: 180, snapshot: 60, animation_map: 300, wowprobe: 300, render: 600, poster: 120, share_copy: 30, report: 30 };

export const PIPELINE_STAGE = { init: 'brief', packets: 'frames', audio: 'audio', frames: 'frames', assemble: 'assemble', captions: 'transitions_captions', transitions: 'transitions_captions', verify: 'verify', preflight: 'verify', render: 'render', deliver: 'deliver' };
export const PIPELINE_STAGES = ['intake', 'inspect', 'capture', 'pitch', 'brief', 'design_spec', 'storyboard', 'audio', 'frames', 'assemble', 'transitions_captions', 'verify', 'review', 'render', 'deliver'];
export const STAGE_ALIASES = Object.freeze({ design: 'design_spec', story: 'storyboard' });
const pipelineStageOf = (s) => STAGE_ALIASES[s] ?? s;
const COMMANDS = ['init', 'packets', 'audio', 'frames', 'assemble', 'verify', 'preflight', 'render', 'deliver', 'run', 'status', 'time', 'approve', 'comment', 'manifest', 'cost', 'profile'];

export const TARGET_LUFS = { marketing: -14, sales: -14, investors: -16 };
export const MUSIC_ONLY_LUFS = -18;
export const DEFAULT_DESTINATION = { marketing: 'hero-launch', sales: 'sales-outreach', investors: 'investors-demo' };
export const DEFAULT_VOICE = { marketing: 'af_heart', sales: 'am_michael', investors: 'am_michael' };
export const CAPTION_ZONE = 'x0=0;y0=.82;x1=1;y1=1;severity=error';

export const USAGE = `Usage: node scripts/render-path.mjs <command> --project <dir> [options]

Drive the deterministic half of the /present render path on a HyperFrames project (the
vendored product-launch-video scripts do the frame-packet / assembly / transition / caption work).

Commands
  init        scaffold with the pinned CLI when hyperframes.json is missing (only the files the project lacks),
              link it (bare \`npx hyperframes\` → toolchain), refuse an unpinned package.json script (exit 3), copy a capture
              (--capture <dir>: footage.mp4, events.jsonl, capture-manifest.json, autozoom.json → .media/capture/ + assets/)
  packets     stop-list on the on-screen copy, voiceover and SCRIPT.md (exit 3 with the recipe); stage
              frame.md's fonts → assets/fonts/ + a "## Staged fonts" section (exit 3 on a family with no face, C1),
              then STORYBOARD.md → .hyperframes/frame-packets/<id>.md + _role.md (workflow frame-packets.mjs) + _dispatch.json,
              absolute skill paths in each packet header
  audio       SCRIPT.md → Kokoro voice per frame + whisper words → audio_meta.json; a window grows to voice + the
              pause, never shrinks (plugin rule, not the vendor sync-durations); total vs brief (QA-01); [--bgm <file>] [--sfx]
              SCRIPT.md \`## Line <N> — <label> (Frame <N>)\` headings must map 1:1 onto the frames with a voiceover (exit 3
              before any TTS); the last synthesis is reused while lines, voice and speed are unchanged (.media/tts-cache.json),
              and a changed script re-synthesises only its new lines (per-line store.hyperframes/tts-lines/)
  frames      report which frame files the storyboard names are missing (exit 3 while any is)
  assemble    captions.mjs build (policy) → assemble-index.mjs → transitions.mjs inject + verify
  verify      hyperframes lint + check --frame-check --caption-zone → QA/; animation-map.mjs; wowprobe.py pre-render (exit 3 on a failed gate)
  preflight   a draft render (--quality draft, the storyboard fps) → renders/draft/, wowprobe's frame gates QA-03 / QA-07 / QA-09
              on it → QA/wowprobe-preflight.json (exit 3 on a failure) — before approval and the delivery render
  render      gates (doctor, check, wowprobe, capture not blocked, approved: v<N>, git diff inside renders/edit-scope.json)
              → hyperframes render --quality delivery → renders/final/ + manifest line
  deliver     wowprobe.py post-render on the master (+ contact sheet), poster-bake, SRT, share-copy init + lint, run-report.json
  run         audio → packets → frames → assemble → verify → render → deliver (stops at the first missing frame / failed gate)
  status      what exists and what is missing (text or --json)
  time        time a stage render-path does not run (intake, inspect, capture, design_spec, storyboard, frames, …):
              time --begin <stage> … time --end <stage> stamps the wall clock between the calls (end without begin: exit 3);
              time --stage <stage> --seconds <n> only for a duration the caller measured (kept as \`reported\`)
  cost        --estimate prints the token budget for this storyboard before dispatch; --actual <claude -p json>
              records the real cost after delivery → .hyperframes/tokens.json (run-report reads it)
  manifest    the hosts this run may contact (print before the first external call — needs only the run directory
              and its intake.json, no scaffold); exit 3 under --privacy local when it is not empty
  comment     record a review comment on one frame: --frame <N> --text <comment> [--approver <who>] →
              renders/comments.jsonl bound to the version and the storyboard / index / master sha256 (like approve)
  approve     record the user's "render?" yes: \`approved: v<N>\` in STORYBOARD.md + renders/approvals.jsonl bound to the
              storyboard / index / master sha256 [--approver <who>] [--request <text>]

Options
  --project <dir>        the HyperFrames project (default: .)
  --mode <m>             marketing | sales | investors (default: intake.json, then the storyboard's audience)
  --name <stem>          output stem (default: <project dir name>)
  --formats <list>       16:9[,9:16] (default: 16:9). 9:16 = reflow (owner decision 2026-09-26): the same frames in a
                         1080×1920 host built in.hyperframes/9x16/, footage on the autozoom 9:16 camera
  --voice <id>           Kokoro voice (default per mode: ${Object.entries(DEFAULT_VOICE).map(([k, v]) => `${k} ${v}`).join(', ')})
  --provider <p>         TTS provider for audio.mjs (default: kokoro — the zero-account path)
  --bgm <file|pack:<t>>  the bed: a local music file, or pack:<track|vol-N|auto> from the first-run media pack
                         (node scripts/media-packs.mjs fetch — credit line and beat cues come with it)
  --music-credit <line>  credit line for the bed (CC BY — share-copy lint requires it when --bgm is given)
  --cues <file>          <track>.music-cues.json for the beat-lock metric
  --no-sfx               skip audio.mjs fetch-sfx
  --captions <p>         on | off | auto (default auto = on for sales or 9:16, off for 16:9 without VO)
  --target-lufs <n>      QA-08 target (default from the mix at deliver: VO-led marketing/sales −14, investors −16;
                         music-only, no VO −18 — pass the story director's Q7 target when it names one)
  --destination <band>   QA-01 band (default per mode)
  --capture <dir>        init: capture directory to copy into the project
  --workflow-dir <dir>   the installed product-launch-video skill (default: ~/.claude/skills/product-launch-video; must equal vendor/)
  --allow-drift          proceed although the installed workflow differs from the vendored copy
  --begin|--end <stage>  for \`time\` (stage; \`design\` = design_spec, \`story\` = storyboard)
  --stage <s> --seconds <n>   for \`time\` (a reported, not a stamped, duration)
  --request <text>       the request this version answers — the \`v<N>: <request>\` commit after each gate (
                         default: intake.json arguments_raw)
  --audit-network        run every child process under \`strace -f -yy\` (connect + UDP sends): external traffic goes to
.media/egress.jsonl as observed egress, and under --privacy local fail the stage;
                         on by default under the profile when strace is installed (Linux)
  --dry-run              print the commands instead of running them
  --json                 machine-readable stdout
  -h, --help             this text

Exit codes: 0 ok · 1 runtime failure · 2 usage · 3 a gate or precondition failed (named on stderr)
`;

export function parseArgs(argv) {
  const opts = {
    command: null, project: '.', mode: null, name: null, formats: ['16:9'], voice: null, provider: 'kokoro', bgm: null, musicCredit: null, cues: null, sfx: true,
    captions: 'auto', targetLufs: null, destination: null, capture: null, workflowDir: null, allowDrift: false, stage: null, seconds: null, timeMark: null, dryRun: false, json: false, help: false,
    request: null, approver: null, frame: null, text: null, auditNetwork: false, estimate: false, actual: null, profile: null,
  };
  const args = [...argv];
  const take = (flag) => { if (!args.length || (args[0].startsWith('-') && !/^-\d/.test(args[0]))) throw new Error(`${flag} needs a value`); return args.shift(); };
  while (args.length) {
    const a = args.shift();
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--project': opts.project = take(a); break;
      case '--mode': { const v = take(a); if (!['marketing', 'sales', 'investors'].includes(v)) throw new Error(`--mode must be marketing|sales|investors, got ${v}`); opts.mode = v; break; }
      case '--name': opts.name = take(a); break;
      case '--formats': { opts.formats = take(a).split(',').map((s) => s.trim()).filter(Boolean); for (const f of opts.formats) if (!['16:9', '9:16', '1:1'].includes(f)) throw new Error(`unknown format ${f}`); break; }
      case '--voice': opts.voice = take(a); break;
      case '--provider': opts.provider = take(a); break;
      case '--bgm': opts.bgm = take(a); break;
      case '--music-credit': opts.musicCredit = take(a); break;
      case '--cues': opts.cues = take(a); break;
      case '--no-sfx': opts.sfx = false; break;
      case '--captions': { const v = take(a); if (!['on', 'off', 'auto'].includes(v)) throw new Error(`--captions must be on|off|auto`); opts.captions = v; break; }
      case '--target-lufs': opts.targetLufs = Number(take(a)); if (!Number.isFinite(opts.targetLufs)) throw new Error('--target-lufs needs a number'); break;
      case '--destination': opts.destination = take(a); break;
      case '--capture': opts.capture = take(a); break;
      case '--workflow-dir': opts.workflowDir = take(a); break;
      case '--allow-drift': opts.allowDrift = true; break;
      case '--stage': opts.stage = pipelineStageOf(take(a)); break;
      case '--seconds': opts.seconds = Number(take(a)); if (!Number.isFinite(opts.seconds)) throw new Error('--seconds needs a number'); break;
      case '--begin': case '--end': opts.timeMark = a.slice(2); if (args.length && !args[0].startsWith('-') && (PIPELINE_STAGES.includes(pipelineStageOf(args[0])) || !COMMANDS.includes(args[0]))) opts.stage = pipelineStageOf(args.shift()); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--json': opts.json = true; break;
      case '--request': opts.request = take(a); break;
      case '--approver': opts.approver = take(a); break;
      case '--frame': opts.frame = take(a); break;
      case '--text': opts.text = take(a); break;
      case '--audit-network': opts.auditNetwork = true; break;
      case '--estimate': opts.estimate = true; break;
      case '--actual': opts.actual = take(a); break;
      case '--profile': opts.profile = take(a); break;
      default:
        if (a.startsWith('-')) throw new Error(`unknown flag ${a}`);
        if (opts.command) throw new Error(`unexpected argument ${a}`);
        if (!COMMANDS.includes(a)) throw new Error(`unknown command ${a}`);
        opts.command = a;
    }
  }
  if (!opts.help && !opts.command) throw new Error('a command is required');
  if (opts.command === 'time' && (!opts.stage || (opts.timeMark ? 1 : 0) + (opts.seconds != null ? 1 : 0) !== 1)) throw new Error('time needs one of --begin <stage>, --end <stage> or --stage <stage> --seconds <n>');
  if (opts.stage && !PIPELINE_STAGES.includes(opts.stage)) throw new Error(`--stage must be one of ${PIPELINE_STAGES.join(', ')}`);
  if (opts.command === 'comment' && (!opts.frame || !opts.text)) throw new Error('comment needs --frame <N> and --text <comment>');
  return opts;
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const exists = (f) => { try { fs.accessSync(f); return true; } catch { return false; } };
const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const round1 = (n) => Math.round(n * 10) / 10;
const pad2 = (n) => String(n).padStart(2, '0');

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
}

export function parseStoryboard(md) {
  const out = { globals: {}, frames: [] };
  if (!md) return out;
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) for (const line of fm[1].split(/\r?\n/)) { const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/); if (m) out.globals[m[1]] = m[2].replace(/^"(.*)"$/, '$1').trim(); }
  const body = fm ? md.slice(fm[0].length) : md;
  const re = /^#{2,3}\s+(?:Frame|Beat|Scene)\s+(\d+)\s*[—–-]+\s*(.*)$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(body))) heads.push({ number: Number(m[1]), title: m[2].trim(), at: m.index, end: re.lastIndex });
  heads.forEach((h, i) => {
    const block = body.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : body.length);
    const frame = { number: h.number, title: h.title, keys: {}, texts: [] };
    for (const line of block.split(/\r?\n/)) {
      const b = line.match(/^\s*-\s+([A-Za-z_][\w-]*):\s*(.*)$/);
      if (!b) continue;
      if (b[1] === 'text' || b[1] === 'cta') frame.texts.push(b[2].trim());
      else if (!(b[1] in frame.keys)) frame.keys[b[1]] = b[2].trim().replace(/^"(.*)"$/, '$1');
    }
    out.frames.push(frame);
  });
  return out;
}

export function durationSeconds(v) {
  const m = String(v ?? '').match(/^\s*([\d.]+)\s*(ms|s)?\s*$/);
  if (!m) return null;
  return m[2] === 'ms' ? Number(m[1]) / 1000 : Number(m[1]);
}

export const REVEAL_PAUSE_S = 0.8;
const round3 = (n) => Math.round(n * 1000) / 1000;

export function syncDurations(md, audioMeta, { pauseS = REVEAL_PAUSE_S } = {}) {
  const voice = new Map();
  for (const v of audioMeta?.voices ?? []) if (v.frame != null && Number(v.duration_s) > 0) voice.set(Number(v.frame), Number(v.duration_s));
  const lines = String(md ?? '').split(/\r?\n/);
  const FRAME_RE = /^#{2,3}\s+(?:Frame|Beat|Scene)\s+(\d+)\b/i;
  let cur = null;
  const changes = [];
  const frames = [];
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(FRAME_RE);
    if (h) { cur = Number(h[1]); continue; }
    if (cur === null) continue;
    const m = lines[i].match(/^(\s*[-*]\s+duration\s*:\s*)(.*)$/i);
    if (!m) continue;
    const from = durationSeconds(m[2]);
    if (from === null) { cur = null; continue; }
    const v = voice.get(cur) ?? null;
    let to = from;
    if (v !== null) {
      const need = round3(v + pauseS);
      if (need > from) { to = need; lines[i] = `${m[1]}${to}s`; changes.push({ number: cur, from, to, voice_s: v }); }
    }
    frames.push({ number: cur, duration_s: to, voice_s: v });
    cur = null;
  }
  return { text: lines.join('\n'), changes, frames, total_s: round3(frames.reduce((a, f) => a + f.duration_s, 0)) };
}

export function briefBand(briefS, totalS, tolerance = 0.03) {
  if (!briefS) return { brief_s: null, total_s: totalS, delta_s: null, pct: null, within: null };
  const delta = round3(totalS - briefS);
  return { brief_s: briefS, total_s: totalS, delta_s: delta, pct: Math.round((delta / briefS) * 1000) / 10, within: Math.abs(delta) <= round3(tolerance * briefS) };
}

export function bandAdvice(band) {
  if (band?.within !== false) return null;
  return band.delta_s < 0
    ? `short by ${round3(-band.delta_s)}s — lengthen windows in STORYBOARD.md (a hold, the end card, a frame without voiceover) and re-run audio: unchanged lines are reused, no new synthesis; do not rewrite lines to fix the length`
    : `long by ${band.delta_s}s — trim windows longer than their voice line + the ${REVEAL_PAUSE_S}s pause, or cut a line, before the frames are built`;
}

export function frameIdOf(frame) {
  if (frame.keys.src) return path.basename(frame.keys.src).replace(/\.html$/, '');
  const slug = frame.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'frame';
  return `${pad2(frame.number)}-${slug}`;
}

export function captionsPolicy({ mode, formats, hasVoice, flag = 'auto' }) {
  if (flag === 'on') return { burn: true, reason: '--captions on' };
  if (flag === 'off') return { burn: false, reason: '--captions off' };
  if (formats.includes('9:16')) return { burn: true, reason: '9:16 in the run → burned-in, word-timed' };
  if (mode === 'sales') return { burn: true, reason: 'sales → burned-in, word-timed' };
  if (!hasVoice) return { burn: false, reason: '16:9 without VO → off (kicker cards carry the text); SRT still written' };
  if (mode === 'investors') return { burn: false, reason: 'investors 16:9 with VO → kicker cards + SRT, burned-in only by flag' };
  return { burn: false, reason: 'marketing 16:9 with VO → off by default (the table has no row for it); SRT still written' };
}

export function toSrt(cues) {
  const ts = (s) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3600000), mi = Math.floor((ms % 3600000) / 60000), se = Math.floor((ms % 60000) / 1000), r = ms % 1000;
    return `${pad2(h)}:${pad2(mi)}:${pad2(se)},${String(r).padStart(3, '0')}`;
  };
  return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}

export const SRT_RULES = { minHoldS: 0.8, maxCps: 20, lineChars: 42, maxLines: 2, maxGapS: 0.6 };
export function mergeSrtCues(cues, { minHoldS = SRT_RULES.minHoldS, maxCps = SRT_RULES.maxCps, lineChars = SRT_RULES.lineChars, maxLines = SRT_RULES.maxLines, maxGapS = SRT_RULES.maxGapS, duration = null } = {}) {
  const maxChars = lineChars * maxLines;
  const src = [...(cues ?? [])].filter((c) => c && c.text != null).map((c) => ({ start: Number(c.start), end: Number(c.end), text: String(c.text).replace(/\s+/g, ' ').trim() })).sort((a, b) => a.start - b.start);
  for (let i = 0; i + 1 < src.length; i += 1) if (src[i].end > src[i + 1].start) src[i].end = Math.max(src[i].start, src[i + 1].start);
  const out = [];
  const tooShort = (c) => c.end - c.start < minHoldS - 1e-9 || c.text.length / Math.max(c.end - c.start, 1e-6) > maxCps;
  for (let i = 0; i < src.length; i += 1) {
    const cur = { ...src[i] };
    while (tooShort(cur) && i + 1 < src.length && src[i + 1].start - cur.end <= maxGapS && `${cur.text} ${src[i + 1].text}`.length <= maxChars) { i += 1; cur.text = `${cur.text} ${src[i].text}`; cur.end = Math.max(cur.end, src[i].end); }
    if (cur.end - cur.start < minHoldS) {
      const ceiling = i + 1 < src.length ? src[i + 1].start : (duration ?? cur.start + minHoldS);
      cur.end = round3(Math.max(cur.end, Math.min(cur.start + minHoldS + 0.01, ceiling)));
    }
    cur.text = wrapSrtText(cur.text, lineChars, maxLines);
    out.push(cur);
  }
  return out;
}

export function wrapSrtText(text, lineChars = SRT_RULES.lineChars, maxLines = SRT_RULES.maxLines) {
  const words = String(text).split(' ').filter(Boolean);
  if (words.join(' ').length <= lineChars) return words.join(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > lineChars && lines.length < maxLines - 1) { lines.push(line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  lines.push(line);
  return lines.join('\n');
}

export function srtCues({ captionGroups, audioMeta, storyboard }) {
  if (Array.isArray(captionGroups?.groups) && captionGroups.groups.length) {
    const raw = captionGroups.groups.map((g) => ({ start: g.start, end: g.end, text: g.text }));
    const cues = mergeSrtCues(raw, { duration: storyboard ? storyboard.frames.reduce((a, f) => a + (durationSeconds(f.keys.duration) ?? 0), 0) : null });
    return { cues, source: `caption_groups.json (${raw.length} word-timed groups, captions.mjs → ${cues.length} cues at ≥ ${SRT_RULES.minHoldS} s, ≤ ${SRT_RULES.maxCps} cps)` };
  }
  const frames = storyboard.frames;
  const starts = [];
  let t = 0;
  for (const f of frames) { starts[f.number] = t; t += durationSeconds(f.keys.duration) ?? 0; }
  const cues = [];
  for (const v of audioMeta?.voices ?? []) {
    const base = starts[v.frame];
    if (base == null || !Array.isArray(v.words) || !v.words.length) continue;
    for (let i = 0; i < v.words.length; i += 4) {
      const chunk = v.words.slice(i, i + 4);
      cues.push({ start: base + chunk[0].start, end: base + chunk[chunk.length - 1].end + 0.12, text: chunk.map((w) => w.text).join(' ') });
    }
  }
  if (cues.length) {
    const merged = mergeSrtCues(cues, { duration: t });
    return { cues: merged, source: `audio_meta.json words grouped by 4 (no captions.mjs pass) → ${merged.length} cues at ≥ ${SRT_RULES.minHoldS} s, ≤ ${SRT_RULES.maxCps} cps` };
  }
  for (const f of frames) {
    const base = starts[f.number] ?? 0;
    for (const raw of f.texts) {
      const m = raw.match(/^"(.*)"\s*@\s*([\d.]+)\s*(?:-\s*([\d.]+)|\+\s*([\d.]+))/);
      if (!m) continue;
      const start = Number(m[2]);
      const end = m[3] != null ? Number(m[3]) : start + Number(m[4]);
      cues.push({ start: base + start, end: base + end, text: m[1].replace(/\s+\/\s+/g, '\n') });
    }
  }
  return { cues, source: cues.length ? 'STORYBOARD.md text timeline (no VO — the on-screen text as captions)' : 'nothing to caption' };
}

export function projectContext(opts, env = process.env, home = os.homedir()) {
  const project = path.resolve(opts.project);
  if (!exists(project)) throw new Error(`project directory not found: ${project}`);
  const paths = resolvePaths({}, env, home);
  const cli = locateCli(paths, env);
  const kokoro = findKokoro(paths, env);
  const workflowDir = path.resolve(opts.workflowDir ?? path.join(userSkillsDir(env, home), VENDORED_WORKFLOW));
  const intake = readJson(path.join(project, 'intake.json'));
  const storyboardText = readText(path.join(project, 'STORYBOARD.md'));
  const storyboard = parseStoryboard(storyboardText);
  const mode = opts.mode ?? intake?.declared?.for ?? intake?.derived?.for?.value ?? storyboard.globals.audience ?? null;
  const name = opts.name ?? path.basename(project);
  const p = (...s) => path.join(project, ...s);
  const baseEnv = { ...cliEnv(paths, { privacy: intake?.privacy_profile === 'local' ? 'local' : 'default' }, env, home) };
  if (cli && cli.source === 'toolchain') baseEnv.PATH = `${path.dirname(cli.cmd)}${path.delimiter}${baseEnv.PATH ?? ''}`;
  if (kokoro.ok) baseEnv.HYPERFRAMES_PYTHON = kokoro.python;
  baseEnv.HYPERFRAMES_NO_UPDATE_CHECK = '1';
  baseEnv.HYPERFRAMES_SKIP_SKILLS = '1';
  baseEnv.HYPERFRAMES_SKILL_PKG_VERSION = HYPERFRAMES_PIN;
  baseEnv.HYPERFRAMES_SKILL_NODE_MODULES = paths.node_modules;
  return {
    project, p, paths, cli, kokoro, workflowDir, intake, storyboard, storyboardText, mode, name, env: baseEnv,
    formats: opts.formats, targetLufs: opts.targetLufs ?? (mode ? TARGET_LUFS[mode] : null), destination: opts.destination ?? (mode ? DEFAULT_DESTINATION[mode] : null),
    voice: opts.voice ?? (mode ? DEFAULT_VOICE[mode] : 'am_michael'),
    pluginRootDir: pluginRoot(env), privacy: intake?.privacy_profile === 'local' ? 'local' : 'default',
    stagesFile: p('.hyperframes', 'pp-stages.json'),
  };
}

export function checkWorkflow(ctx, opts, env = process.env) {
  const vendored = path.join(vendorDir(env), VENDORED_WORKFLOW);
  if (!exists(path.join(ctx.workflowDir, 'SKILL.md'))) return { ok: false, reason: `workflow skill not installed at ${ctx.workflowDir} — the SessionStart hook seeds it (node scripts/vendor-workflow.mjs seed)` };
  for (const sib of ['hyperframes', 'hyperframes-animation', 'media-use']) {
    if (!exists(path.join(path.dirname(ctx.workflowDir), sib))) return { ok: false, reason: `core skill ${sib} missing next to ${ctx.workflowDir} (the workflow's scripts import it; \`npx hyperframes@${HYPERFRAMES_PIN} skills update\`)` };
  }
  let drift = null;
  try { drift = diffTrees(vendored, ctx.workflowDir); } catch (err) { drift = { error: err.message }; }
  const changed = drift?.error ? [] : [...(drift.changed ?? []), ...(drift.onlyA ?? drift.only_a ?? []), ...(drift.onlyB ?? drift.only_b ?? [])];
  if (changed.length && !opts.allowDrift) return { ok: false, reason: `installed workflow differs from vendor/${VENDORED_WORKFLOW} (${changed.length} file(s): ${changed.slice(0, 5).join(', ')}); re-seed with vendor-workflow.mjs seed --force or pass --allow-drift`, drift: changed };
  return { ok: true, drift: changed };
}

export class StageLedger {
  constructor(file) { this.file = file; this.data = readJson(file) ?? { schema: STAGES_SCHEMA, plugin: PLUGIN_VERSION, stages_s: {}, runs: [], wall_s: 0 }; }
  record(command, seconds, ok, detail, pipelineStage = PIPELINE_STAGE[command] ?? command, source = 'render-path') {
    this.data.runs.push({ command, stage: pipelineStage, at: new Date().toISOString(), seconds: round1(seconds), ok, detail: detail ?? null, source });
    this.data.stages_s[pipelineStage] = round1((this.data.stages_s[pipelineStage] ?? 0) + seconds);
    this.data.wall_s = round1(Object.values(this.data.stages_s).reduce((a, b) => a + b, 0));
    if (source === 'reported' && !(this.data.reported ?? []).includes(pipelineStage)) this.data.reported = [...(this.data.reported ?? []), pipelineStage];
    writeJson(this.file, this.data);
  }
  begin(stage, now = Date.now()) {
    const pending = (this.data.pending ??= {});
    const replaced = pending[stage] ?? null;
    pending[stage] = new Date(now).toISOString();
    writeJson(this.file, this.data);
    return { stage, at: pending[stage], replaced };
  }
  end(stage, now = Date.now()) {
    const at = this.data.pending?.[stage];
    if (!at) return null;
    const seconds = Math.max(0, (now - Date.parse(at)) / 1000);
    delete this.data.pending[stage];
    this.record(`external:${stage}`, seconds, true, `stamped by render-path (time --begin ${at} → --end)`, stage, 'stamped');
    return { stage, began: at, seconds: round1(seconds) };
  }
}

export const AUDIT_TRACE = 'trace=connect,sendto,sendmsg,sendmmsg';

const isLocalAddr = (family, addr) => (family === 'inet'
  ? /^127\./.test(addr) || addr === '0.0.0.0'
  : addr === '::1' || addr === '::' || /^::ffff:127\./i.test(addr));

function sockaddrOf(text) {
  let m = /sa_family=AF_INET, sin_port=htons\((\d+)\), sin_addr=inet_addr\("([\d.]+)"\)/.exec(text);
  if (m) return { family: 'inet', addr: m[2], port: Number(m[1]) };
  m = /sa_family=AF_INET6, sin6_port=htons\((\d+)\),[^}]*inet_pton\(AF_INET6, "([0-9a-fA-F:.]+)"/.exec(text);
  if (m) return { family: 'inet6', addr: m[2], port: Number(m[1]) };
  return null;
}

export function parseConnects(logText) {
  const out = [];
  const probes = [];
  const seen = new Set();
  const add = (list, c, via) => { const key = `${list === out ? 'e' : 'p'}${c.addr}:${c.port}`; if (!seen.has(key)) { seen.add(key); list.push({ family: c.family, addr: c.addr, port: c.port, ...(via ? { via } : {}) }); } };
  for (const line of String(logText ?? '').split('\n')) {
    const call = /\b(connect|sendto|sendmsg|sendmmsg)\((\d+)(?:<([A-Za-z0-9]+):)?/.exec(line);
    if (!call) continue;
    const [, name, , proto = null] = call;
    const udp = proto ? /^UDP/.test(proto) : false;
    if (name === 'connect') {
      const c = sockaddrOf(line);
      if (!c || isLocalAddr(c.family, c.addr)) continue;
      if (udp) add(probes, c, 'udp-connect'); else add(out, c, proto ? `${proto.toLowerCase()}-connect` : undefined);
      continue;
    }
    let c = sockaddrOf(line);
    if (!c) {
      const v6 = /->\[([0-9a-fA-F:.]+)\]:(\d+)/.exec(line);
      const v4 = /->([\d.]+):(\d+)/.exec(line);
      if (v6) c = { family: 'inet6', addr: v6[1], port: Number(v6[2]) };
      else if (v4) c = { family: 'inet', addr: v4[1], port: Number(v4[2]) };
    }
    if (c && !isLocalAddr(c.family, c.addr)) add(out, c, `${(proto ?? 'udp').toLowerCase()}-send`);
  }
  Object.defineProperty(out, 'probes', { value: probes.filter((p) => !out.some((e) => e.addr === p.addr && e.port === p.port)), enumerable: false });
  return out;
}

export function makeRunner({ dryRun = false, log = (s) => process.stderr.write(`${s}\n`), throttle = throttleSpec(), audit = false } = {}) {
  for (const w of throttle.warnings ?? []) log(`throttle: ${w}`);
  if (throttle.nice !== null || throttle.cpuset) log(`throttle: ${describeThrottle(throttle)} for every child process (lib/throttle.mjs)`);
  if (audit) log(`network audit: every child process runs under strace -f -yy -e ${AUDIT_TRACE}`);
  const observed = [];
  const probes = [];
  const runner = (cmd0, args0, { cwd, env, timeoutS = 120, input } = {}) => {
    const th = throttled(cmd0, args0, throttle);
    let traceFile = null;
    let { cmd, args } = th;
    if (audit && !dryRun) {
      traceFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pp-audit-')), 'connect.log');
      args = ['-f', '-qq', '-yy', '-e', AUDIT_TRACE, '-o', traceFile, cmd, ...args];
      cmd = 'strace';
    }
    log(`$ ${[cmd, ...args].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}${cwd ? `  (cwd ${cwd})` : ''}`);
    if (dryRun) return { status: 0, stdout: '', stderr: '', seconds: 0, dry: true };
    const t0 = Date.now();
    const r = spawnSync(cmd, args, { cwd, env, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutS * 1000 });
    const seconds = (Date.now() - t0) / 1000;
    if (traceFile) {
      const parsed = parseConnects(readText(traceFile) ?? '');
      for (const c of parsed) observed.push({ ...c, cmd: path.basename(cmd0) });
      for (const c of parsed.probes) probes.push({ ...c, cmd: path.basename(cmd0) });
      fs.rmSync(path.dirname(traceFile), { recursive: true, force: true });
    }
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', seconds, error: r.error ? (r.error.code === 'ETIMEDOUT' ? `timeout after ${timeoutS}s` : r.error.message) : null };
  };
  runner.observed = observed;
  runner.probes = probes;
  return runner;
}

const tail = (s, n = 12) => (s || '').trim().split('\n').slice(-n).join('\n');

export function stageInit(ctx, opts, run) {
  const notes = [];
  if (!ctx.cli || ctx.cli.source !== 'toolchain') return { ok: false, exit: 3, reason: `pinned hyperframes ${HYPERFRAMES_PIN} not in the toolchain (node scripts/toolchain.mjs install)` };
  notes.push(ensureProjectRepo(ctx.project, { dryRun: opts.dryRun }));
  const scaffold = scaffoldProject(ctx, opts, run);
  if (!scaffold.ok) return { ok: false, exit: 1, reason: scaffold.reason, notes };
  notes.push(...scaffold.notes);
  const nm = ctx.p('node_modules');
  const pkgDir = path.join(ctx.paths.node_modules, 'hyperframes');
  if (!opts.dryRun) {
    fs.mkdirSync(path.join(nm, '.bin'), { recursive: true });
    const link = path.join(nm, 'hyperframes');
    try { fs.rmSync(link, { force: true }); } catch { }
    fs.symlinkSync(pkgDir, link, 'dir');
    const bin = path.join(nm, '.bin', 'hyperframes');
    try { fs.rmSync(bin, { force: true }); } catch { }
    fs.symlinkSync(path.join('..', 'hyperframes', 'bin', 'hyperframes.mjs'), bin);
    for (const pkg of ['@hyperframes/producer', '@hyperframes/core']) {
      const src = path.join(ctx.paths.node_modules, pkg);
      if (!exists(src)) continue;
      const dst = path.join(nm, pkg);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      try { fs.rmSync(dst, { force: true }); } catch { }
      fs.symlinkSync(src, dst, 'dir');
    }
  }
  notes.push(`node_modules/hyperframes → toolchain ${HYPERFRAMES_PIN}`);
  const pkg = readJson(ctx.p('package.json'));
  const unpinned = unpinnedScripts(pkg);
  if (unpinned.length) return { ok: false, exit: 3, reason: `package.json script(s) ${unpinned.map((u) => `${u.script} (${u.spec})`).join(', ')} do not pin hyperframes@${HYPERFRAMES_PIN} — write \`npx --yes hyperframes@${HYPERFRAMES_PIN} <command>\`, or remove package.json and re-run \`render-path init\` (it scaffolds with the pinned CLI)`, notes };
  if (pkg && !Object.values(pkg.scripts ?? {}).some((c) => String(c).includes(`hyperframes@${HYPERFRAMES_PIN}`))) notes.push(`package.json has no hyperframes script (the repository's own — kept); the pinned CLI runs through node_modules/.bin`);
  if (opts.capture) {
    const src = path.resolve(opts.capture);
    const dst = ctx.p('.media', 'capture');
    if (!opts.dryRun) fs.mkdirSync(dst, { recursive: true });
    const copied = [];
    for (const f of ['footage.mp4', 'events.jsonl', 'capture-manifest.json', 'redactions.json', 'autozoom.json', 'index.html', 'demo.mp4', 'demo.tape', 'terminal.tape']) {
      if (!exists(path.join(src, f))) continue;
      if (!opts.dryRun) fs.copyFileSync(path.join(src, f), path.join(dst, f));
      copied.push(f);
    }
    if (exists(path.join(src, 'frames')) && !opts.dryRun && realpath(src) !== realpath(dst)) fs.cpSync(path.join(src, 'frames'), path.join(dst, 'frames'), { recursive: true });
    if (!opts.dryRun) {
      fs.mkdirSync(ctx.p('assets'), { recursive: true });
      for (const f of ['footage.mp4', 'demo.mp4']) if (exists(path.join(src, f))) fs.copyFileSync(path.join(src, f), ctx.p('assets', f));
    }
    const manifest = readJson(path.join(src, 'capture-manifest.json'));
    if (manifest?.blocked) return { ok: false, exit: 3, reason: 'capture-manifest.json is blocked by the OCR gate — confirm the findings with record-flow --confirm-findings first', notes };
    notes.push(`capture copied: ${copied.join(', ') || 'nothing found'} → .media/capture/ (+ assets/)`);
  }
  return { ok: true, exit: 0, notes };
}

export const DIRECTION_MARKER = '<!-- storyboard direction (render-path packets) -->';
export function storyboardDirection(text) {
  const body = String(text ?? '').replace(/^---\n[\s\S]*?\n---\n/, '');
  const firstFrame = body.search(/^## Frame\b/m);
  const head = firstFrame < 0 ? body : body.slice(0, firstFrame);
  const start = head.search(/^## /m);
  if (start < 0) return '';
  return head.slice(start).trim().replace(/^(#{2,5}) /gm, '#$1 ');
}

export function withDirection(packet, direction) {
  const text = String(packet ?? '');
  const i = text.indexOf(DIRECTION_MARKER);
  const base = i < 0 ? text : text.slice(0, i) + text.slice(text.indexOf('\n## Assigned storyboard block', i) + 1 || text.length);
  if (!direction) return base;
  const block = `${DIRECTION_MARKER}\n## Storyboard direction (every frame — read before your block)\n\n${direction}\n\n`;
  const at = base.indexOf('## Assigned storyboard block');
  return at < 0 ? `${base.trimEnd()}\n\n${block}` : base.slice(0, at) + block + base.slice(at);
}

export function assembleSummary(stdout) {
  const lines = String(stdout ?? '').split('\n');
  const at = lines.findIndex((l) => /^anomalies \(non-fatal\):/.test(l.trim()));
  if (at >= 0) {
    const items = lines.slice(at + 1).map((l) => l.trim()).filter((l) => l.startsWith('- ') && l !== '- null').map((l) => l.slice(2));
    if (items.length) return `${items.length} anomal${items.length === 1 ? 'y' : 'ies'} (non-fatal): ${items.join('; ')}`;
  }
  return lines.map((l) => l.trim()).find((l) => l.startsWith('total duration:')) ?? tail(stdout, 1);
}

export function stagePackets(ctx, opts, run) {
  const wf = checkWorkflow(ctx, opts);
  if (!wf.ok) return { ok: false, exit: 3, reason: wf.reason };
  if (!ctx.storyboardText) return { ok: false, exit: 3, reason: 'STORYBOARD.md missing — the story director writes it first (agents/story-director.md)' };
  const stop = stopListHits(ctx.storyboard, readText(ctx.p('SCRIPT.md')));
  if (stop.length) return { ok: false, exit: 3, reason: `stop-list: ${stop.map((h) => `${h.where}: ${h.word} ("${h.match}")`).join('; ')} — rewrite with the recipe [verb] + [object] + [number or deadline] + [named alternative] in STORYBOARD.md (and SCRIPT.md), then run packets again` };
  const fonts = stageFonts(ctx.project, { nodeModules: ctx.paths?.node_modules, dryRun: opts.dryRun });
  if (!fonts.ok) return { ok: false, exit: 3, reason: missingFontsReason(fonts.missing) };
  const script = path.join(ctx.workflowDir, 'scripts', 'frame-packets.mjs');
  const r = run(process.execPath, [script, '--project', ctx.project, '--storyboard', ctx.p('STORYBOARD.md')], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.packets });
  if (r.status !== 0) return { ok: false, exit: 1, reason: `frame-packets.mjs failed (${r.error ?? `exit ${r.status}`}): ${tail(r.stderr || r.stdout)}` };
  const packetsDir = ctx.p('.hyperframes', 'frame-packets');
  const fmt = (ctx.storyboard.globals.format ?? '1920x1080').split('x').map(Number);
  const audioMeta = readJson(ctx.p('audio_meta.json'));
  const policy = captionsPolicy({ mode: ctx.mode, formats: ctx.formats, hasVoice: Boolean(audioMeta?.voices?.length) || exists(ctx.p('SCRIPT.md')), flag: opts.captions });
  const dispatch = {
    schema: DISPATCH_SCHEMA, project: ctx.project, role: path.join(packetsDir, '_role.md'), plugin_delta: path.join(ctx.pluginRootDir, 'agents', 'frame-worker.md'),
    canvas: { width: fmt[0] || 1920, height: fmt[1] || 1080 }, captions: { enabled: policy.burn, keep_out_y: 0.82, reason: policy.reason },
    autozoom: exists(ctx.p('.media', 'capture', 'autozoom.json')) ? '.media/capture/autozoom.json' : null,
    footage: exists(ctx.p('assets', 'footage.mp4')) ? 'assets/footage.mp4' : null,
    frames: ctx.storyboard.frames.map((f) => {
      const id = frameIdOf(f);
      const src = f.keys.src ?? path.join('compositions', 'frames', `${id}.html`);
      return { frame_id: id, number: f.number, title: f.title, packet: path.join(packetsDir, `${id}.md`), src, exists: exists(ctx.p(src)), role: f.keys.role ?? null, evidence_tier: f.keys.evidence_tier ?? null, duration_s: durationSeconds(f.keys.duration) };
    }),
  };
  const direction = storyboardDirection(ctx.storyboardText);
  const skillLines = skillPathLines({ skillsRoot: path.dirname(ctx.workflowDir), workflowDir: ctx.workflowDir });
  if (!opts.dryRun) {
    writeJson(path.join(packetsDir, '_dispatch.json'), dispatch);
    for (const f of dispatch.frames) if (exists(f.packet)) fs.writeFileSync(f.packet, withSkillPaths(withDirection(fs.readFileSync(f.packet, 'utf8'), direction), skillLines));
  }
  return { ok: true, exit: 0, notes: [fontsSummary(fonts), `${dispatch.frames.length} packet(s) → ${path.relative(ctx.project, packetsDir)}/ (+ _dispatch.json; ${dispatch.frames.filter((f) => !f.exists).length} frame file(s) still to build)${direction ? '; storyboard direction copied into each' : ''}${skillLines.length ? `; ${skillLines.length} absolute skill path(s) in each header` : ''}`], dispatch };
}

export function stopListHits(storyboard, scriptMd = null) {
  const hits = [];
  const scan = (where, text) => {
    for (const { re, word } of STOP_LIST) {
      const m = String(text ?? '').match(re);
      if (m) hits.push({ where, word, match: m[0].trim() });
    }
  };
  for (const f of storyboard?.frames ?? []) {
    for (const t of f.texts ?? []) scan(`frame ${f.number} text`, /^"(.*?)"/.exec(t)?.[1] ?? t);
    if (f.keys?.voiceover) scan(`frame ${f.number} voiceover`, f.keys.voiceover);
  }
  if (scriptMd) for (const l of scriptLines(scriptMd).lines) scan(`SCRIPT.md line for frame ${l.frame}`, l.text);
  return hits;
}

export const SKILL_PATH_KEYS = ['HYPERFRAMES_CORE_REFS', 'EXAMPLES_DIR', 'CUT_CATALOG'];
export function skillPathLines({ skillsRoot, workflowDir }, present = exists) {
  const rows = [
    ['HYPERFRAMES_CORE_REFS', path.join(skillsRoot, 'hyperframes-core', 'references'), 'the role\'s `hyperframes-core` `references/*.md`'],
    ['EXAMPLES_DIR', path.join(skillsRoot, 'hyperframes-animation', 'examples'), 'the role\'s `../hyperframes-animation/examples/<id>.html`'],
    ['CUT_CATALOG', path.join(workflowDir, 'references', 'cut-catalog.md'), 'the role\'s `../references/cut-catalog.md`'],
  ];
  return rows.filter(([, p]) => present(p)).map(([k, p, what]) => `- ${k}: ${p} (${what})`);
}

export function withSkillPaths(packet, lines) {
  const keyRe = new RegExp(`^- (?:${SKILL_PATH_KEYS.join('|')}): .*\\n?`, 'gm');
  const base = String(packet ?? '').replace(keyRe, '');
  const m = /^- RULES_DIR: .*$/m.exec(base);
  if (!m || !lines?.length) return base;
  const at = m.index + m[0].length;
  return `${base.slice(0, at)}\n${lines.join('\n')}${base.slice(at)}`;
}

export const INIT_TIMEOUT_S = 120;

export function scaffoldProject(ctx, opts, run) {
  if (exists(ctx.p('hyperframes.json'))) return { ok: true, notes: ['hyperframes.json present — project already scaffolded'] };
  const name = String(ctx.name ?? path.basename(ctx.project)).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '') || 'presentation';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-init-'));
  try {
    const r = run(ctx.cli.cmd, [...(ctx.cli.args ?? []), 'init', name, '--non-interactive', '--example=blank', `--skill=${VENDORED_WORKFLOW}`], { cwd: tmpDir, env: { ...ctx.env, HYPERFRAMES_SKIP_SKILLS: '1' }, timeoutS: INIT_TIMEOUT_S });
    if (r.dry) return { ok: true, notes: [`would scaffold with the pinned hyperframes ${HYPERFRAMES_PIN} init and copy in the files the project lacks`] };
    const src = path.join(tmpDir, name);
    if (r.status !== 0 || !exists(path.join(src, 'hyperframes.json'))) return { ok: false, reason: `hyperframes ${HYPERFRAMES_PIN} init (toolchain) failed (${r.error ?? `exit ${r.status}`}): ${tail(r.stderr || r.stdout)}` };
    const copied = [];
    const kept = [];
    for (const e of fs.readdirSync(src).sort()) {
      if (exists(ctx.p(e))) { kept.push(e); continue; }
      fs.cpSync(path.join(src, e), ctx.p(e), { recursive: true });
      copied.push(e);
    }
    return { ok: true, notes: [`scaffolded with the pinned hyperframes ${HYPERFRAMES_PIN} (toolchain): ${copied.join(', ') || 'nothing new'}${kept.length ? `; kept the project's own ${kept.join(', ')}` : ''}`] };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function unpinnedScripts(pkg, pin = HYPERFRAMES_PIN) {
  const out = [];
  for (const [script, cmd] of Object.entries(pkg?.scripts ?? {})) {
    for (const m of String(cmd).matchAll(/(?:^|[\s;&|(])hyperframes(?:@([^\s;&|)]+))?(?=[\s;&|)]|$)/g)) {
      if (m[1] !== pin) out.push({ script, spec: m[1] ? `hyperframes@${m[1]}` : 'hyperframes' });
    }
  }
  return out;
}

export function lockWordsToScript(words, line) {
  const norm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const script = String(line ?? '').replace(/^"(.*)"$/, '$1').split(/\s+/).filter(Boolean);
  const out = [];
  let changed = 0;
  let i = 0;
  let j = 0;
  const ws = words ?? [];
  while (j < ws.length) {
    const target = i < script.length ? norm(script[i]) : null;
    if (target && norm(ws[j].text) === target) {
      const text = script[i].replace(/^["“]|["”]$/g, '');
      if (text !== ws[j].text) changed += 1;
      out.push({ ...ws[j], text }); i += 1; j += 1; continue;
    }
    let merged = false;
    if (target) {
      let acc = norm(ws[j].text);
      for (let k = 1; k < 4 && j + k < ws.length && acc.length < target.length; k += 1) {
        acc += norm(ws[j + k].text);
        if (acc === target) {
          out.push({ ...ws[j], text: script[i].replace(/^["“]|["”]$/g, ''), end: ws[j + k].end });
          changed += 1; i += 1; j += k + 1; merged = true; break;
        }
      }
    }
    if (merged) continue;
    if (i + 1 < script.length && norm(script[i + 1]) === norm(ws[j].text)) { i += 1; continue; }
    out.push(ws[j]); j += 1;
    if (target && i + 1 < script.length && j < ws.length && norm(ws[j].text) === norm(script[i + 1])) i += 1;
  }
  return { words: out, changed };
}

export function sfxCues(storyboard) {
  const cues = [];
  const freeText = [];
  for (const f of storyboard?.frames ?? []) {
    const line = String(f.keys.sfx ?? '').trim();
    if (!line || /^(none|no)\b/i.test(line)) continue;
    const parts = line.split(',').map((x) => x.trim()).filter(Boolean);
    const parsed = parts.map((x) => /^([a-z][a-z ]*?)\s*@\s*([\d.]+)\s*s?$/i.exec(x));
    if (parsed.every(Boolean)) for (const m of parsed) cues.push({ frame: f.number, cue: m[1].toLowerCase(), offset: Number(m[2]) });
    else freeText.push(f.number);
  }
  return { cues, freeText };
}

export function sfxDensity(times, window = 30) {
  const t = [...times].sort((a, b) => a - b);
  let max = 0;
  for (let i = 0, j = 0; i < t.length; i += 1) { while (t[i] - t[j] > window) j += 1; max = Math.max(max, i - j + 1); }
  return max;
}

export const SCRIPT_LINE_RE = /^#{2,3}\s+.*?\(frame\s+(\d+)\)/i;
const LINE_LIKE_RE = /^#{1,6}\s+(?:line|frame|beat|scene)\s+\d+|\(\s*frame\s+\d+/i;
const noVoiceover = (v) => /^\(?\s*(?:none|no|n\/a|silent|no vo|—|–|-)?\s*\)?\.?$/i.test(String(v ?? '').trim());

export function scriptLines(md) {
  const lines = [];
  const stray = [];
  let cur = null;
  let under = null;
  for (const raw of String(md ?? '').split(/\r?\n/)) {
    const h = raw.match(SCRIPT_LINE_RE);
    if (h) { cur = { frame: Number(h[1]), text: '', heading: raw.trim() }; lines.push(cur); under = null; continue; }
    if (/^#{1,6}\s/.test(raw)) {
      if (LINE_LIKE_RE.test(raw)) stray.push({ heading: raw.trim(), into: cur?.frame ?? null });
      else under = cur ? { heading: raw.trim(), into: cur.frame } : null;
      continue;
    }
    if (!cur || /^\s*\*\*/.test(raw)) continue;
    const m = raw.match(/^(?: {4,}|\t)(.+)$/);
    if (!m) continue;
    cur.text += (cur.text ? ' ' : '') + m[1].trim();
    if (under) { stray.push(under); under = null; }
  }
  return { lines, stray };
}

export function scriptFrameMap(md, storyboard) {
  const { lines, stray } = scriptLines(md);
  const voiced = (storyboard?.frames ?? []).filter((f) => !noVoiceover(f.keys.voiceover)).map((f) => f.number);
  const spoken = lines.filter((l) => l.text);
  const count = new Map();
  for (const l of spoken) count.set(l.frame, (count.get(l.frame) ?? 0) + 1);
  const problems = [];
  for (const s of stray) problems.push(`"${s.heading}" is not a line heading — ${s.into == null ? 'the text under it is never spoken' : `its text is spoken in frame ${s.into}`}`);
  for (const l of lines) if (!l.text) problems.push(`"${l.heading}" has no indented spoken text — the vendor drops the line`);
  for (const [frame, n] of count) if (n > 1) problems.push(`frame ${frame} has ${n} SCRIPT lines`);
  const missing = voiced.filter((n) => !count.has(n));
  if (missing.length) problems.push(`frame(s) ${missing.join(', ')} carry voiceover: but have no SCRIPT line`);
  const extra = [...count.keys()].filter((n) => !voiced.includes(n));
  if (extra.length) problems.push(`SCRIPT line(s) for frame(s) ${extra.join(', ')}, which carry no voiceover: in STORYBOARD.md`);
  return {
    ok: problems.length === 0, lines: spoken, voiced, problems,
    reason: problems.length ? `SCRIPT.md does not map 1:1 onto the storyboard frames that carry voiceover: (C2) — ${problems.join('; ')}. A line heading is exactly \`## Line <N> — <label> (Frame <N>)\` with nothing after N inside the parentheses (tags such as STAR go before it: \`## Line 9 — Lock, STAR (Frame 9)\`); fix SCRIPT.md, then run audio again` : null,
  };
}

export const TTS_CACHE_FILE = ['.media', 'tts-cache.json'];
export const TTS_CACHE_SCHEMA = 'power-presentation/tts-cache@0.1';
export const TTS_SPEED = 1;

export function ttsFingerprint({ provider, voice, speed = TTS_SPEED, lines, bgm = null }) {
  const inputs = { provider, voice, speed, hyperframes: HYPERFRAMES_PIN, lines: (lines ?? []).map((l) => ({ frame: l.frame, text: l.text })), bgm };
  return { inputs, sha256: crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex') };
}

export function ttsCacheCheck(cache, fingerprint, project) {
  if (!cache || cache.schema !== TTS_CACHE_SCHEMA || !Array.isArray(cache.meta?.voices)) return { ok: false, reason: 'no previous synthesis' };
  if (cache.fingerprint !== fingerprint) return { ok: false, reason: 'SCRIPT.md lines, voice or speed changed' };
  if ((cache.wavs ?? []).length !== cache.meta.voices.length) return { ok: false, reason: 'the cache does not list every wav' };
  for (const w of cache.wavs) {
    const file = path.join(project, w.path);
    if (!exists(file)) return { ok: false, reason: `${w.path} missing` };
    if (sha256File(file) !== w.sha256) return { ok: false, reason: `${w.path} changed since it was synthesised` };
  }
  return { ok: true, reason: null };
}

export const TTS_LINES_DIR = ['.hyperframes', 'tts-lines'];

export function ttsLineKey({ provider, voice, speed = TTS_SPEED, text }) {
  return crypto.createHash('sha256').update(JSON.stringify({ provider, voice, speed, hyperframes: HYPERFRAMES_PIN, text: String(text ?? '').trim() })).digest('hex').slice(0, 32);
}

export function ttsLineStore(project) {
  const dir = path.join(project, ...TTS_LINES_DIR);
  const indexFile = path.join(dir, 'index.json');
  const index = readJson(indexFile) ?? {};
  const wav = (key) => path.join(dir, `${key}.wav`);
  return {
    valid: (key) => Boolean(index[key]) && exists(wav(key)) && sha256File(wav(key)) === index[key].sha256,
    get: (key) => (index[key] ? { ...index[key], file: wav(key) } : null),
    put: (key, v) => {
      const src = path.join(project, v.path ?? '');
      if (!v.path || !exists(src)) return;
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src, wav(key));
      index[key] = { duration_s: v.duration_s ?? null, words: v.words ?? [], sha256: sha256File(wav(key)) };
      writeJson(indexFile, index);
    },
  };
}

export function partialScript(lines) {
  return `# SCRIPT — the lines the per-line store does not hold\n\n${lines.map((l, i) => `## Line ${i + 1} — partial (Frame ${l.frame})\n\n    ${l.text}\n`).join('\n')}`;
}

export function mergeStoredLines(project, stored, store) {
  const metaFile = path.join(project, 'audio_meta.json');
  const neutralFile = path.join(project, 'audio_engine_meta.json');
  const meta = readJson(metaFile) ?? { bgm: null, bgm_pending: false, voices: [], sfx: [] };
  const neutral = readJson(neutralFile);
  for (const { frame, key } of stored) {
    const s = store.get(key);
    const rel = `assets/voice/${pad2(frame)}.wav`;
    fs.mkdirSync(path.join(project, 'assets', 'voice'), { recursive: true });
    fs.copyFileSync(s.file, path.join(project, rel));
    meta.voices = [...(meta.voices ?? []).filter((v) => v.frame !== frame), { frame, path: rel, duration_s: s.duration_s, words: s.words }];
    if (neutral) neutral.voices = [...(neutral.voices ?? []).filter((v) => Number(v.id) !== frame), { id: pad2(frame), path: rel, duration_s: s.duration_s, words: s.words }];
  }
  meta.voices.sort((a, b) => a.frame - b.frame);
  writeJson(metaFile, meta);
  if (neutral) {
    neutral.voices.sort((a, b) => Number(a.id) - Number(b.id));
    neutral.total_duration_s = Math.round(neutral.voices.reduce((t, v) => t + (v.duration_s ?? 0), 0) * 1000) / 1000;
    writeJson(neutralFile, neutral);
  }
}

export function packMusic(music) {
  const m = /^pack:\s*(.*)$/i.exec(String(music ?? '').trim());
  return m ? `pack:${m[1].trim() || 'auto'}` : null;
}

export function storyboardWithoutBed(md) {
  return md.replace(/^(music:)[^\n]*$/m, '$1 none');
}

export function stageAudio(ctx, opts, run) {
  const wf = checkWorkflow(ctx, opts);
  if (!wf.ok) return { ok: false, exit: 3, reason: wf.reason };
  const notes = [];
  const scripts = path.join(ctx.workflowDir, 'scripts');
  const hasScript = exists(ctx.p('SCRIPT.md'));
  const music = (ctx.storyboard.globals.music ?? '').toLowerCase();
  const packBed = packMusic(ctx.storyboard.globals.music);
  if (packBed && !opts.bgm) { opts.bgm = packBed; notes.push(`bgm: storyboard music ${packBed} → --bgm ${packBed}`); }
  let vendorStoryboard = ctx.p('STORYBOARD.md');
  if (opts.bgm && music !== 'none') {
    vendorStoryboard = ctx.p('.hyperframes', 'storyboard.audio.md');
    if (!opts.dryRun) { fs.mkdirSync(path.dirname(vendorStoryboard), { recursive: true }); fs.writeFileSync(vendorStoryboard, storyboardWithoutBed(readText(ctx.p('STORYBOARD.md')))); }
  }
  if (!hasScript && music === 'none' && !opts.bgm) {
    const r = run(process.execPath, [path.join(scripts, 'audio.mjs'), '--script', ctx.p('SCRIPT.md'), '--storyboard', ctx.p('STORYBOARD.md'), '--hyperframes', ctx.project, '--out', ctx.p('audio_meta.json')], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.audio });
    return { ok: r.status === 0, exit: r.status === 0 ? 0 : 1, notes: ['silent project (music: none, no SCRIPT.md)'], reason: r.status === 0 ? null : tail(r.stderr) };
  }
  const map = hasScript ? scriptFrameMap(readText(ctx.p('SCRIPT.md')), ctx.storyboard) : null;
  if (map && !map.ok) return { ok: false, exit: 3, reason: map.reason };
  if (opts.provider === 'kokoro' && !ctx.kokoro.ok) return { ok: false, exit: 3, reason: 'Kokoro is not installed (node scripts/toolchain.mjs install) — the voiceover would silently fall back to nothing' };
  if (hasScript) {
    const g = ctx.storyboard.globals;
    const fp = ttsFingerprint({ provider: opts.provider, voice: ctx.voice, lines: map.lines, bgm: music === 'none' || opts.bgm ? { mode: 'none', mounted: opts.bgm ?? null } : { music: g.music ?? null, message: g.message ?? null, arc: g.arc ?? null } });
    const cacheFile = ctx.p(...TTS_CACHE_FILE);
    const cached = readJson(cacheFile);
    const reuse = ttsCacheCheck(cached, fp.sha256, ctx.project);
    if (reuse.ok) {
      if (!opts.dryRun) writeJson(ctx.p('audio_meta.json'), cached.meta);
      notes.push(`audio: ${cached.meta.voices.length} line(s) cached — SCRIPT.md lines, voice and speed unchanged, wav hashes checked; no engine call`);
    } else {
      const store = ttsLineStore(ctx.project);
      const keyOf = (l) => ttsLineKey({ provider: opts.provider, voice: ctx.voice, text: l.text });
      const have = map.lines.filter((l) => store.valid(keyOf(l)));
      const need = map.lines.filter((l) => !have.includes(l));
      const partial = have.length > 0 && need.length > 0;
      const scriptFile = partial ? ctx.p('.hyperframes', 'script.partial.md') : ctx.p('SCRIPT.md');
      if (partial && !opts.dryRun) { fs.mkdirSync(path.dirname(scriptFile), { recursive: true }); fs.writeFileSync(scriptFile, partialScript(need)); }
      const args = [path.join(scripts, 'audio.mjs'), '--script', scriptFile, '--storyboard', vendorStoryboard, '--hyperframes', ctx.project, '--out', ctx.p('audio_meta.json'), '--provider', opts.provider, '--voice', ctx.voice];
      const r = run(process.execPath, args, { cwd: ctx.project, env: { ...ctx.env, HF_TTS_PROVIDER: opts.provider }, timeoutS: TIMEOUTS_S.audio });
      if (r.status !== 0) return { ok: false, exit: 1, reason: `audio.mjs generate failed (${r.error ?? `exit ${r.status}`}): ${tail(r.stderr || r.stdout)}` };
      if (partial && !opts.dryRun) mergeStoredLines(ctx.project, have.map((l) => ({ frame: l.frame, key: keyOf(l) })), store);
      const raw = readJson(ctx.p('audio_meta.json'));
      if (!opts.dryRun) for (const v of raw?.voices ?? []) { const l = map.lines.find((x) => x.frame === v.frame); if (l) store.put(keyOf(l), v); }
      const wavs = (raw?.voices ?? []).map((v) => ({ frame: v.frame, path: v.path, sha256: v.path && exists(ctx.p(v.path)) ? sha256File(ctx.p(v.path)) : null }));
      if (!opts.dryRun && wavs.length && wavs.every((w) => w.sha256)) writeJson(cacheFile, { schema: TTS_CACHE_SCHEMA, fingerprint: fp.sha256, inputs: fp.inputs, at: new Date().toISOString(), wavs, meta: raw });
      notes.push(partial
        ? `audio: ${need.length} line(s) synthesised (frames ${need.map((l) => l.frame).join(', ')}), ${have.length} reused from the per-line store → ${TTS_CACHE_FILE.join('/')}`
        : `audio: synthesised (${reuse.reason}) → ${TTS_CACHE_FILE.join('/')}`);
    }
    const meta = readJson(ctx.p('audio_meta.json'));
    const voices = meta?.voices ?? [];
    const noWords = voices.filter((v) => !v.words?.length).map((v) => v.frame);
    notes.push(`${voices.length} voice line(s) via ${opts.provider} (${ctx.voice})${noWords.length ? `; no word timings for frame(s) ${noWords.join(', ')} (whisper missing? captions degrade to line timing)` : ''}`);
    if (!opts.dryRun && meta) {
      meta.tts_provider = opts.provider; meta.voice = ctx.voice; meta.transcribe_model = voices.some((v) => v.words?.length) ? 'small.en' : null;
      let locked = 0;
      for (const v of voices) {
        const frame = ctx.storyboard.frames.find((f) => f.number === Number(v.frame));
        if (!frame?.keys.voiceover || !v.words?.length) continue;
        const r = lockWordsToScript(v.words, frame.keys.voiceover);
        v.words = r.words; locked += r.changed;
      }
      if (locked) notes.push(`captions locked to the script: ${locked} word(s) re-spelled or merged (whisper → SCRIPT)`);
      writeJson(ctx.p('audio_meta.json'), meta);
    }
    const sync = syncDurations(readText(ctx.p('STORYBOARD.md')), meta ?? { voices: [] });
    if (!opts.dryRun && sync.changes.length) fs.writeFileSync(ctx.p('STORYBOARD.md'), sync.text);
    notes.push(sync.changes.length
      ? `durations: ${sync.changes.map((c) => `frame ${c.number} ${c.from}s → ${c.to}s (voice ${c.voice_s}s + ${REVEAL_PAUSE_S}s pause)`).join('; ')}`
      : 'durations: every director window already holds its voice line + the pause (STORYBOARD.md unchanged)');
    const band = briefBand(durationSeconds(ctx.storyboard.globals.duration), sync.total_s);
    if (band.brief_s !== null) notes.push(`total ${band.total_s}s vs brief ${band.brief_s}s (${band.delta_s >= 0 ? '+' : ''}${band.delta_s}s, ${band.pct}% — QA-01 band ±3 %${band.within ? ' ok' : `: OUT OF BAND, ${bandAdvice(band)}`})`);
  } else notes.push('no SCRIPT.md — no voiceover');
  if (opts.bgm) {
    let bgmFile = opts.bgm;
    let licence = 'CC BY 4.0 (declared by --music-credit)';
    let packRef = null;
    if (/^pack:/i.test(opts.bgm)) {
      const t = resolveTrack(opts.bgm.slice(5) || 'auto', { root: packsDir(ctx.env) });
      if (!t.ok) return { ok: false, exit: 3, reason: t.reason };
      bgmFile = t.file; packRef = t.pack; licence = t.licence;
      if (!opts.musicCredit) opts.musicCredit = t.credit;
      if (!opts.cues && t.cues) opts.cues = t.cues;
    }
    const src = path.resolve(bgmFile);
    if (!exists(src)) return { ok: false, exit: 2, reason: `--bgm file not found: ${src}` };
    if (!opts.musicCredit) return { ok: false, exit: 2, reason: '--bgm needs --music-credit "<line>" (CC BY credit line, / share-copy lint) — or use --bgm pack:<track>' };
    const rel = path.join('assets', 'bgm', path.basename(src));
    if (!opts.dryRun) {
      fs.mkdirSync(ctx.p('assets', 'bgm'), { recursive: true });
      fs.copyFileSync(src, ctx.p(rel));
      const meta = readJson(ctx.p('audio_meta.json')) ?? { bgm: null, bgm_pending: false, voices: [], sfx: [] };
      const hasVoice = (meta.voices ?? []).length > 0;
      meta.bgm = { path: rel, volume: hasVoice ? 0.12 : 0.9, query: null, duration_s: null, source: 'local file (--bgm)', credit: opts.musicCredit, sha256: sha256File(src) };
      meta.bgm_pending = false;
      writeJson(ctx.p('audio_meta.json'), meta);
      writeJson(ctx.p('.media', 'pp-music.json'), { file: rel, credit: opts.musicCredit, cues: opts.cues ? path.resolve(opts.cues) : null, sha256: meta.bgm.sha256, licence, pack: packRef });
    }
    notes.push(`bgm ${rel} (volume ${exists(ctx.p('SCRIPT.md')) ? 0.12 : 0.9}, credit "${opts.musicCredit}")`);
  }
  const sfx = sfxCues(ctx.storyboard);
  if (opts.sfx && sfx.cues.length) {
    const meta = readJson(ctx.p('audio_meta.json')) ?? { bgm: null, bgm_pending: false, voices: [], sfx: [] };
    const placed = [];
    const missing = [];
    let t = 0;
    const startOf = new Map(ctx.storyboard.frames.map((f) => { const s0 = t; t += durationSeconds(f.keys.duration) ?? 0; return [f.number, s0]; }));
    for (const c of sfx.cues) {
      const r = resolveSfx(c.cue, { root: packsDir(ctx.env) });
      if (!r.ok) { missing.push(`${c.cue} (frame ${c.frame}): ${r.reason}`); continue; }
      const rel = `assets/sfx/${r.path.replace(/\//g, '-')}`;
      if (!opts.dryRun) { fs.mkdirSync(ctx.p('assets', 'sfx'), { recursive: true }); fs.copyFileSync(r.file, ctx.p(rel)); }
      placed.push({ frame: c.frame, file: rel, offset_s: c.offset, duration_s: round3(Math.max(0.3, r.duration)), volume: 0.3, cue: c.cue, use: r.use, pack: r.pack, licence: r.licence, sha256: r.sha256 });
    }
    if (!opts.dryRun) { meta.sfx = placed; writeJson(ctx.p('audio_meta.json'), meta); }
    const density = sfxDensity(placed.map((x) => (startOf.get(x.frame) ?? 0) + x.offset_s));
    notes.push(`sfx: ${placed.length} cue(s) from the CC0 pack — ${placed.map((x) => `${x.cue}@f${x.frame}+${x.offset_s}`).join(', ') || 'none'}; densest 30 s window ${density} (3–5, polished 2–3)${missing.length ? `; missing: ${missing.join('; ')}` : ''}`);
    if (density > 5) notes.push(`warning: ${density} SFX cues in one 30 s window — keep it to 3–5 (not every staggered element gets a sound)`);
  }
  if (opts.sfx && sfx.freeText.length) {
    const r = run(process.execPath, [path.join(scripts, 'audio.mjs'), 'fetch-sfx', '--storyboard', ctx.p('STORYBOARD.md'), '--hyperframes', ctx.project], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.audio });
    notes.push(r.status === 0 ? `fetch-sfx ok (free-text cues in frame(s) ${sfx.freeText.join(', ')})` : `fetch-sfx failed (non-fatal): ${tail(r.stderr || r.stdout, 3)}`);
  }
  const bedMeta = readJson(ctx.p('.media', 'pp-music.json'));
  const cueFile = opts.cues ? path.resolve(opts.cues) : bedMeta?.cues ?? null;
  const mixed = readJson(ctx.p('audio_meta.json'));
  if (!opts.dryRun && cueFile && exists(cueFile) && mixed?.bgm) {
    const snap = beatSnap(readText(ctx.p('STORYBOARD.md')), readJson(cueFile), { floors: voiceFloors(mixed), briefS: durationSeconds(ctx.storyboard.globals.duration) });
    if (snap.moved.length) fs.writeFileSync(ctx.p('STORYBOARD.md'), snap.text);
    notes.push(snap.note);
  }
  return { ok: true, exit: 0, notes };
}

export function voiceFloors(audioMeta, pauseS = REVEAL_PAUSE_S) {
  const out = new Map();
  for (const v of audioMeta?.voices ?? []) if (v.frame != null && Number(v.duration_s) > 0) out.set(Number(v.frame), round3(Number(v.duration_s) + pauseS));
  return out;
}

export const BEAT_REVEAL_TOL_S = 0.15;

export function beatSnap(md, cues, { floors = new Map(), minFrameS = 0.5, briefS = null } = {}) {
  const offset = Number(cues?.offset_sec ?? 0) || 0;
  const beats = [...new Set([...(cues?.beats ?? []), ...(cues?.strongCues ?? [])].map((b) => Number(b?.time)).filter(Number.isFinite).map((t) => round3(t + offset)))].sort((a, b) => a - b);
  const lines = String(md ?? '').split(/\r?\n/);
  const FRAME_RE = /^#{2,3}\s+(?:Frame|Beat|Scene)\s+(\d+)\b/i;
  const frames = [];
  let cur = null;
  for (let i = 0; i < lines.length; i += 1) {
    const h = lines[i].match(FRAME_RE);
    if (h) { cur = Number(h[1]); continue; }
    if (cur === null) continue;
    const m = lines[i].match(/^(\s*[-*]\s+duration\s*:\s*)(.*)$/i);
    if (!m) continue;
    const d = durationSeconds(m[2]);
    if (d !== null) frames.push({ number: cur, line: i, prefix: m[1], from: d, to: d });
    cur = null;
  }
  const empty = { text: String(md ?? ''), moved: [], locked: 0, cuts: Math.max(0, frames.length - 1), total_s: round3(frames.reduce((a, f) => a + f.from, 0)) };
  if (beats.length < 2 || frames.length < 2) return { ...empty, note: `cuts on the beat: nothing to lock (${beats.length < 2 ? 'the cue grid has no beats' : 'one frame'})` };
  const gaps = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
  const maxShift = Math.min(0.3, gaps[Math.floor(gaps.length / 2)] / 2 + 0.001);
  const nearest = (t) => beats.reduce((best, b) => (Math.abs(b - t) < Math.abs(best - t) ? b : best), beats[0]);
  let t = 0;
  let drift = 0;
  for (const f of frames.slice(0, -1)) {
    const end = t + f.to;
    const floor = Math.max(floors.get(f.number) ?? 0, minFrameS);
    const after = beats.find((x) => x >= end - 1e-9);
    const before = [...beats].reverse().find((x) => x <= end + 1e-9);
    const options = [before, after].filter((b) => b != null)
      .map((b) => round3(b - end))
      .filter((d) => Math.abs(d) <= maxShift && f.to + d >= floor - 1e-9)
      .sort((a, b) => Math.abs(drift + a) - Math.abs(drift + b) || Math.abs(a) - Math.abs(b));
    const delta = options[0] ?? 0;
    if (Math.abs(delta) > 1e-9) { f.to = round3(f.to + delta); drift = round3(drift + delta); }
    t = round3(t + f.to);
  }
  const last = frames.at(-1);
  const lastFloor = Math.max(floors.get(last.number) ?? 0, minFrameS);
  if (last.to - drift >= lastFloor - 1e-9) last.to = round3(last.to - drift);
  const moved = frames.filter((f) => f.to !== f.from).map((f) => ({ frame: f.number, from: f.from, to: f.to }));
  for (const f of frames) if (f.to !== f.from) lines[f.line] = `${f.prefix}${f.to}s`;
  let at = 0;
  let locked = 0;
  for (const f of frames.slice(0, -1)) { at = round3(at + f.to); if (Math.abs(nearest(at) - at) <= BEAT_REVEAL_TOL_S) locked += 1; }
  const total = round3(frames.reduce((a, f) => a + f.to, 0));
  const kept = Math.abs(total - empty.total_s) < 1e-6;
  if (briefS && briefBand(briefS, empty.total_s).within && !briefBand(briefS, total).within) return { ...empty, note: `cuts on the beat: not applied — moving the cuts onto the beat would take the total to ${total}s, outside the QA-01 band of the ${briefS}s brief` };
  return {
    text: lines.join('\n'), moved, locked, cuts: frames.length - 1, total_s: total,
    note: `cuts on the beat: ${locked}/${frames.length - 1} cut(s) within ±${BEAT_REVEAL_TOL_S}s of a beat; ${moved.length} window(s) moved ≤ ${round3(maxShift)}s${kept ? ', total kept' : `, total ${empty.total_s}s → ${total}s (the last frame could not absorb it)`}`,
  };
}

export function stageFrames(ctx) {
  const missing = [];
  const present = [];
  for (const f of ctx.storyboard.frames) {
    const src = f.keys.src ?? path.join('compositions', 'frames', `${frameIdOf(f)}.html`);
    (exists(ctx.p(src)) ? present : missing).push({ number: f.number, id: frameIdOf(f), src });
  }
  if (!ctx.storyboard.frames.length) return { ok: false, exit: 3, reason: 'STORYBOARD.md has no frames', missing, present };
  if (missing.length) return { ok: false, exit: 3, reason: `${missing.length} frame file(s) not built yet — dispatch one frame-worker per packet (.hyperframes/frame-packets/_dispatch.json): ${missing.map((m) => m.src).join(', ')}`, missing, present };
  return { ok: true, exit: 0, notes: [`${present.length}/${present.length} frame files present`], missing, present };
}

export const HOIST_MARKER = '<!-- approved frame video hoisted by assemble-index -->';
export const FRAME_VIDEOS_FILE = ['.hyperframes', 'frame-videos.json'];
const HOIST_MARKER_RE = new RegExp(HOIST_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
const APPROVED_VIDEO_RE = /<video\b(?:[^>"']|"[^"]*"|'[^']*')*\bdata-frame-video\s*=\s*"approved"(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/video\s*>/gi;

export function approvedDeclarations(html) {
  const scan = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length))
    .replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, (m) => ' '.repeat(m.length))
    .replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, (m) => ' '.repeat(m.length));
  const out = [];
  let m;
  APPROVED_VIDEO_RE.lastIndex = 0;
  while ((m = APPROVED_VIDEO_RE.exec(scan))) out.push(String(html).slice(m.index, m.index + m[0].length));
  return out;
}

export function putBack(decls, html) {
  let i = 0;
  let restored = 0;
  const out = String(html ?? '').replace(HOIST_MARKER_RE, (m) => {
    if (i >= (decls ?? []).length) return m;
    restored += 1;
    return decls[i++];
  });
  return { html: out, restored, markers: (String(html ?? '').match(HOIST_MARKER_RE) ?? []).length };
}

export function restoreHoisted(before, after) {
  return putBack(approvedDeclarations(before), after);
}

export const STYLISTIC_EFFECTS = Object.freeze([
  ['grain', /-(film-)?grain-|-noise-|-fe-turbulence-/],
  ['glitch', /-glitch|-datamosh-|-rgb-(split|shift)-|-chromatic-|-aberration-|-fe-displacement-map-/],
  ['scanlines', /-scan-?lines?-|-crt-/],
  ['vhs', /-vhs-/],
  ['halftone', /-halftone-|-dither(ed)?-/],
  ['duotone', /-duotone-/],
  ['light-leak', /-light-leaks?-|-lens-flares?-|-flares?-/],
  ['vignette', /-vignette-/],
  ['bloom', /-bloom-/],
  ['pixelate', /-pixel-?(ate|ated|sort)-|-mosaic-/],
  ['film-burn', /-film-burn-/],
]);

export function styleTokens(html) {
  const src = String(html ?? '').replace(/<!--[\s\S]*?-->/g, ' ');
  const stem = (u) => path.basename(u).replace(/\.\w+$/, '');
  const out = [];
  for (const m of src.matchAll(/\b(?:class|id)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out.push(...(m[1] ?? m[2]).split(/\s+/).filter(Boolean));
  for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const x of css.matchAll(/[.#]([A-Za-z_][\w-]*)/g)) out.push(x[1]);
    for (const x of css.matchAll(/@keyframes\s+([\w-]+)/g)) out.push(x[1]);
    for (const x of css.matchAll(/url\(\s*['"]?([^'")]+)/g)) out.push(stem(x[1]));
  }
  for (const m of src.matchAll(/data-composition-src\s*=\s*["']([^"']+)["']/g)) out.push(stem(m[1]));
  for (const m of src.matchAll(/<(feTurbulence|feDisplacementMap)\b/g)) out.push(m[1]);
  return out;
}

export function stylisticEffects(html) {
  const found = new Set();
  for (const t of styleTokens(html)) {
    const k = `-${t.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/_/g, '-')}-`;
    for (const [family, re] of STYLISTIC_EFFECTS) if (re.test(k)) found.add(family);
  }
  return [...found];
}

export function effectsAcross(files) {
  const families = {};
  for (const { file, html } of files) for (const fam of stylisticEffects(html)) (families[fam] ??= []).push(file);
  return { families, count: Object.keys(families).length };
}

export function restraintWarning({ families, count }) {
  if (count <= 1) return null;
  return `warning: restraint: ${count} stylistic effects — ${Object.entries(families).map(([f, files]) => `${f} (${files.join(', ')})`).join('; ')} — keep one look treatment for the whole video`;
}

function frameFiles(dir) {
  return exists(dir) ? fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f)).sort() : [];
}

function listHtml(dir, rel = '') {
  let entries = [];
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : listHtml(dir, r);
    return /\.html?$/i.test(e.name) ? [r] : [];
  }).sort();
}

export function prepareFramesForHoist(framesDir, sidecarPath) {
  const recorded = readJson(sidecarPath)?.frames ?? {};
  const next = {};
  const rehydrated = [];
  const orphans = [];
  for (const f of frameFiles(framesDir)) {
    const file = path.join(framesDir, f);
    let html = fs.readFileSync(file, 'utf8');
    if (html.includes(HOIST_MARKER)) {
      const r = putBack(recorded[f], html);
      if (r.restored) { html = r.html; fs.writeFileSync(file, html); rehydrated.push({ file: f, restored: r.restored }); }
      if (r.markers > r.restored) { orphans.push({ file: f, markers: r.markers - r.restored }); if (recorded[f]) next[f] = recorded[f]; }
    }
    const decls = approvedDeclarations(html);
    if (decls.length) next[f] = decls;
  }
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  fs.writeFileSync(sidecarPath, `${JSON.stringify({ note: 'approved frame video declarations, put back before each vendor hoist (render-path assemble)', frames: next }, null, 2)}\n`);
  return { rehydrated, orphans, recorded: Object.values(next).reduce((n, d) => n + d.length, 0) };
}

export function digitLeadingSelectors(html) {
  const out = [];
  const add = (token, where) => { if (!out.some((x) => x.token === token && x.where === where)) out.push({ token, where }); };
  const src = String(html ?? '');
  for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
    let prelude = '';
    let depth = 0;
    const stack = [];
    for (const ch of css) {
      if (ch === '{') {
        const sel = prelude.trim();
        const inKeyframes = stack.some((x) => /^@(-webkit-)?keyframes\b/i.test(x));
        if (sel && !sel.startsWith('@') && !inKeyframes) for (const t of sel.matchAll(/(?:^|[\s,>+~(])([.#]\d[\w-]*)/g)) add(t[1], 'css');
        stack.push(sel); depth += 1; prelude = '';
      } else if (ch === '}') { stack.pop(); depth = Math.max(0, depth - 1); prelude = ''; }
      else if (ch === ';' ) prelude = '';
      else prelude += ch;
    }
  }
  for (const m of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1].matchAll(/["'`]\s*([^"'`]*?)["'`]/g)) {
      for (const sel of t[1].matchAll(/(?:^|[\s,>+~(])([.#]\d[\w-]*)/g)) {
        const tok = sel[1];
        if (/^#[0-9a-f]{3,8}$/i.test(tok)) continue;
        if (!/[A-Za-z_-]/.test(tok.slice(1))) continue;
        add(tok, 'js');
      }
    }
  }
  return out;
}

export function isOpaqueColor(value) {
  const v = String(value ?? '').trim().toLowerCase().replace(/\s*!important$/, '');
  if (!v || /^(transparent|none|initial|unset|inherit|revert|currentcolor)$/.test(v)) return false;
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 6) return true;
    if (h.length === 4) return h[3] === 'f';
    if (h.length === 8) return h.slice(6) === 'ff';
    return false;
  }
  m = v.match(/^(?:rgba?|hsla?)\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 4) return true;
    const a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return Number.isFinite(a) && a >= 1;
  }
  return /^[a-z]+$/.test(v);
}

export function opaqueRootGround(html) {
  const s = String(html ?? '');
  const tag = s.match(/<(?!template\b)[a-z][\w-]*\b[^>]*\bdata-composition-id\s*=[^>]*>/i);
  const id = tag?.[0].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!id) return null;
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const rule of s.matchAll(new RegExp(`#${esc}\\s*\\{([^}]*)\\}`, 'g'))) {
    const bg = rule[1].match(/(?:^|;|\s)background(?:-color)?\s*:\s*([^;]+)/i)?.[1]?.trim();
    if (bg && isOpaqueColor(bg)) return { selector: `#${id}`, background: bg };
  }
  return null;
}

export function framesDeclaringFootage(framesDir) {
  return frameFiles(framesDir)
    .map((f) => ({ file: f, count: approvedDeclarations(readText(path.join(framesDir, f))).length }))
    .filter((x) => x.count > 0);
}

export function stageAssemble(ctx, opts, run) {
  const wf = checkWorkflow(ctx, opts);
  if (!wf.ok) return { ok: false, exit: 3, reason: wf.reason };
  const fr = stageFrames(ctx);
  if (!fr.ok) return fr;
  const scripts = path.join(ctx.workflowDir, 'scripts');
  const notes = [];
  const audioMeta = readJson(ctx.p('audio_meta.json'));
  const hasVoice = Boolean(audioMeta?.voices?.length);
  const policy = captionsPolicy({ mode: ctx.mode, formats: [ctx.variant ?? '16:9'], hasVoice, flag: opts.captions });
  const captionsHtml = ctx.p('compositions', 'captions.html');
  if (policy.burn && hasVoice) {
    const r = run(process.execPath, [path.join(scripts, 'captions.mjs'), 'build', '--storyboard', ctx.p('STORYBOARD.md'), '--audio-meta', ctx.p('audio_meta.json'), '--hyperframes', ctx.project, '--out', ctx.p('caption_groups.json')], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.captions });
    if (r.status !== 0) return { ok: false, exit: 1, reason: `captions.mjs failed: ${tail(r.stderr || r.stdout)}` };
    notes.push(`captions: ${tail(r.stdout, 1)} (${policy.reason})`);
    const srt = srtCues({ captionGroups: readJson(ctx.p('caption_groups.json')), audioMeta, storyboard: ctx.storyboard });
    if (!opts.dryRun) { fs.mkdirSync(ctx.p('captions'), { recursive: true }); fs.writeFileSync(ctx.p('captions', 'en.srt'), toSrt(srt.cues)); }
    notes.push(`srt: ${srt.cues.length} cue(s) → captions/en.srt (${srt.source})`);
  } else {
    if (!opts.dryRun) { fs.rmSync(captionsHtml, { force: true }); }
    notes.push(`captions: not burned in (${policy.reason})`);
  }
  if (!opts.dryRun) {
    const prep = prepareFramesForHoist(ctx.p('compositions', 'frames'), ctx.p(...FRAME_VIDEOS_FILE));
    if (prep.rehydrated.length) notes.push(`frame footage re-declared for the hoist: ${prep.rehydrated.map((r) => `${r.file} (${r.restored})`).join(', ')} from ${FRAME_VIDEOS_FILE.join('/')}`);
    if (prep.orphans.length) notes.push(`warning: hoist marker(s) with no recorded declaration: ${prep.orphans.map((o) => `${o.file} (${o.markers})`).join(', ')} — that footage is not hoisted; the frame-worker re-declares it`);
    notes.push(`frame footage: ${prep.recorded} declaration(s) recorded in ${FRAME_VIDEOS_FILE.join('/')}`);
  }
  const clips = stageClips(ctx, opts, run);
  if (!clips.ok) return { ...clips, notes };
  notes.push(...clips.notes);
  const a = run(process.execPath, [path.join(scripts, 'assemble-index.mjs'), '--storyboard', ctx.p('STORYBOARD.md'), '--hyperframes', ctx.project, ...(exists(ctx.p('audio_meta.json')) ? ['--audio-meta', ctx.p('audio_meta.json')] : [])], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.assemble });
  if (a.status !== 0) return { ok: false, exit: 1, reason: `assemble-index.mjs failed (${a.error ?? `exit ${a.status}`}): ${tail(a.stderr || a.stdout)}`, notes };
  notes.push(`assemble: ${assembleSummary(a.stdout)}`);
  const framesDir = ctx.p('compositions', 'frames');
  const grounds = frameFiles(framesDir)
    .map((f) => ({ f, html: readText(path.join(framesDir, f)) ?? '' }))
    .filter((x) => x.html.includes(HOIST_MARKER))
    .map((x) => ({ file: x.f, ground: opaqueRootGround(x.html) }))
    .filter((x) => x.ground);
  if (grounds.length) notes.push(`warning: footage frame(s) paint an opaque ground over their footage: ${grounds.map((g) => `${g.file} (${g.ground.selector} background ${g.ground.background})`).join(', ')} — the footage renders under the frame; make that ground transparent (agents/frame-worker.md)`);
  const compositions = listHtml(ctx.p('compositions')).map((rel) => ({ file: rel, html: readText(ctx.p('compositions', rel)) ?? '' }));
  const restraint = restraintWarning(effectsAcross(compositions));
  if (restraint) notes.push(restraint);
  const ti = run(process.execPath, [path.join(scripts, 'transitions.mjs'), 'inject', '--storyboard', ctx.p('STORYBOARD.md'), '--hyperframes', ctx.project], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.transitions });
  if (ti.status !== 0) return { ok: false, exit: 1, reason: `transitions.mjs inject failed: ${tail(ti.stderr || ti.stdout)}` };
  const tv = run(process.execPath, [path.join(scripts, 'transitions.mjs'), 'verify', '--storyboard', ctx.p('STORYBOARD.md'), '--index', ctx.p('index.html')], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.transitions });
  if (tv.status !== 0) return { ok: false, exit: 1, reason: `transitions.mjs verify failed: ${tail(tv.stderr || tv.stdout)}` };
  notes.push(`transitions: ${tail(ti.stdout, 1)}; ${tail(tv.stdout, 1)}`);
  notes.push(localizeCdn(ctx, { dryRun: opts.dryRun }).note);
  const cam = stageCamera(ctx, opts);
  if (!cam.ok) return cam;
  notes.push(...cam.notes);
  const bed = stageBedAutomation(ctx, opts);
  if (bed.note) notes.push(bed.note);
  const carved = stageCarve(ctx, opts, run);
  if (carved.note) notes.push(carved.note);
  if (ctx.variant) return { ok: true, exit: 0, notes, captions: policy, camera: cam.applied };
  const led = freezeProject(ctx.project, { dryRun: opts.dryRun });
  const moved = led.changes.filter((c) => c.change !== 'drift' && c.change !== 'missing');
  notes.push(`media ledger: ${led.records.filter((r) => r.path).length} asset(s) — ${led.summary || 'none'}${moved.length ? `; ${moved.length} added / re-frozen` : ''} → .media/manifest.jsonl`);
  if (led.problems.length) notes.push(`warning: media ledger blocks the render: ${led.problems.map((x) => `${x.problem} ${x.path}`).join(', ')} — node scripts/media-ledger.mjs check`);
  if (ctx.formats.includes(PORTRAIT.key)) {
    const built = buildPortraitProject(ctx, { dryRun: opts.dryRun });
    notes.push(...built.notes);
    if (!opts.dryRun) {
      const pr = stageAssemble(portraitContext(ctx), opts, run);
      notes.push(...(pr.notes ?? []).map((n) => `9:16 ${n}`));
      if (!pr.ok) return { ...pr, reason: `9:16 assemble: ${pr.reason}`, notes };
    }
  }
  return { ok: true, exit: 0, notes, captions: policy, camera: cam.applied };
}

export const CAMERA_STYLE = `      /* power-presentation camera (render-path applyCamera): footage under the frame layer */
      .scene { z-index: 1; }
      #el-captions { z-index: 2; }
      .pp-cam-stage { position: absolute; overflow: hidden; z-index: 0; }
.pp-cam-framed { border-radius: 14px; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08); } /* the recording window framed */
      .pp-cam-framed.pp-cam-shadow { box-shadow: 0 28px 72px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08); } /* only where frame.md allows shadows */
      .pp-cam { position: absolute; left: 0; top: 0; transform-origin: 50% 50%; will-change: transform; }
      .pp-cam > video { display: block; } /* size + position are inline: the runtime's .clip rule sizes a clip to the canvas */
      .pp-cam-cursor { position: absolute; left: 0; top: 0; pointer-events: none; opacity: 0; }
      .pp-cam-ripple { position: absolute; left: 0; top: 0; border-radius: 50%; border: 2px solid #fff; opacity: 0; pointer-events: none; }`;

const HOIST_STYLE_RE = /position:absolute;left:(-?[\d.]+)px;top:(-?[\d.]+)px;width:([\d.]+)px;height:([\d.]+)px;object-fit:([a-z-]+)/;

export function hoistedVideos(indexHtml) {
  const out = [];
  const re = /<video\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/video\s*>/gi;
  let m;
  while ((m = re.exec(indexHtml))) {
    const attrs = m[1];
    const get = (name) => { const a = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(attrs); return a ? a[1] : null; };
    const track = Number(get('data-track-index'));
    if (!(track >= 1000)) continue;
    const style = HOIST_STYLE_RE.exec(get('style') ?? '');
    out.push({
      full: m[0], attrs, inner: m[2], id: get('id'), start: Number(get('data-start')), duration: Number(get('data-duration')), track,
      frameIndex: Math.floor((track - 1000) / 1000),
      box: style ? { left: Number(style[1]), top: Number(style[2]), width: Number(style[3]), height: Number(style[4]) } : null,
      fit: style ? style[5] : 'cover',
    });
  }
  return out;
}

export const MAX_ZOOM = 2;

export function footageTiming(frame) {
  const k = frame?.keys ?? {};
  const w = /^\s*([\d.]+)\s*[-–]\s*([\d.]+)\s*$/.exec(k.capture_window ?? '');
  if (!w) return null;
  const a = Number(w[1]), b = Number(w[2]);
  if (!(b > a)) return null;
  const hold = Number(k.capture_hold ?? 0) || 0;
  let drift = null;
  const d = /^\s*([\d.]+)\s*,\s*([\d.]+)\s+([\d.]+)\s*@\s*([\d.]+)\s*[-–]\s*([\d.]+)\s*$/.exec(k.capture_drift ?? '');
  if (d) drift = { x: Number(d[1]), y: Number(d[2]), scale: Number(d[3]), t0: Number(d[4]), t1: Number(d[5]) };
  else {
    const p = /hold drift\s+([\d.]+)\s*[-–]\s*([\d.]+)[^()]*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)\s*,\s*[\d.]+\s*(?:→|->)\s*([\d.]+)/.exec(k.camera ?? '');
    if (p) drift = { x: Number(p[3]), y: Number(p[4]), scale: Number(p[5]), t0: Number(p[1]), t1: Number(p[2]) };
  }
  if (drift && drift.scale > MAX_ZOOM) drift = { ...drift, scale: MAX_ZOOM, clamped_from: drift.scale };
  return { a, b, hold, drift };
}

export function clipArgs(footage, { a, b, hold }, out) {
  const vf = `fps=30${hold > 0 ? `,tpad=stop_mode=clone:stop_duration=${round3(hold)}` : ''}`;
  return ['-v', 'error', '-y', '-ss', String(round3(a)), '-to', String(round3(b)), '-i', footage, '-vf', vf, '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-t', String(round3(b - a + hold)), out];
}

export function retargetDeclaration(tag, src, duration) {
  const set = (t, name, value) => (new RegExp(`\\s${name}\\s*=\\s*"[^"]*"`).test(t) ? t.replace(new RegExp(`(\\s${name}\\s*=\\s*)"[^"]*"`), `$1"${value}"`) : t.replace(/<video\b/, `<video ${name}="${value}"`));
  return set(set(set(tag, 'src', src), 'data-media-start', '0'), 'data-duration', String(duration));
}

export function stageClips(ctx, opts, run) {
  const footage = ctx.p('assets', 'footage.mp4');
  const notes = [];
  const frames = ctx.storyboard.frames.map((f) => ({ id: frameIdOf(f), duration: durationSeconds(f.keys.duration) ?? 0, timing: footageTiming(f) })).filter((f) => f.timing);
  if (!frames.length) return { ok: true, notes };
  if (!exists(footage)) return { ok: false, exit: 3, reason: 'capture windows declared but assets/footage.mp4 is missing (render-path init --capture)' };
  let cut = 0;
  for (const f of frames) {
    const hold = Math.max(f.timing.hold, round3(f.duration - (f.timing.b - f.timing.a)));
    const rel = `assets/clips/${f.id}.mp4`;
    const out = ctx.p(rel);
    const meta = { footage_sha256: opts.dryRun ? null : sha256File(footage), a: f.timing.a, b: f.timing.b, hold: round3(hold), fps: 30 };
    const prev = readJson(`${out}.json`);
    if (!opts.dryRun && !(exists(out) && prev && JSON.stringify(prev) === JSON.stringify(meta))) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const r = run('ffmpeg', clipArgs(footage, { ...f.timing, hold }, out), { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.poster });
      if (r.status !== 0) return { ok: false, exit: 1, reason: `clip ${f.id} failed: ${tail(r.stderr, 3)}` };
      writeJson(`${out}.json`, meta);
      cut += 1;
    }
    const file = ctx.p('compositions', 'frames', `${f.id}.html`);
    const html = readText(file);
    if (html && !opts.dryRun) {
      const next = html.replace(/<video\b(?:[^>"']|"[^"]*"|'[^']*')*\bdata-frame-video\s*=\s*"approved"(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => retargetDeclaration(tag, rel, round3(f.duration)));
      if (next !== html) fs.writeFileSync(file, next);
    }
  }
  notes.push(`footage windows: ${frames.length} frame(s) on held clips in assets/clips/ (${cut} cut, ${frames.length - cut} cached) — ${frames.map((f) => `${f.id} ${f.timing.a}–${f.timing.b}${f.timing.hold ? ` +${f.timing.hold}s hold` : ''}${f.timing.drift ? ` drift→${f.timing.drift.scale}${f.timing.drift.clamped_from ? ` (clamped from ${f.timing.drift.clamped_from}, ≤ ${MAX_ZOOM}×)` : ''}` : ''}`).join('; ')}`);
  return { ok: true, notes };
}

export function driftTween(track, drift, { wrapper, offset }) {
  if (!drift || !track?.wrapper) return null;
  const zmax = Number(track.zoom_factor?.max) || 2;
  const scale = round3(1 + (drift.scale - 1) * Math.min(1, (zmax - 1) / (2 - 1)));
  const pose = poseTransform(clampFocus({ x: drift.x, y: drift.y }, scale, track.wrapper), scale);
  return `tl.to(${JSON.stringify(wrapper)}, { scale: ${pose.scale}, xPercent: ${pose.xPercent}, yPercent: ${pose.yPercent}, duration: ${round3(drift.t1 - drift.t0)}, ease: "sine.inOut" }, ${round3(offset + drift.t0)}); // hold drift`;
}

export function cameraWrapper(track, box) {
  const c = track?.canvas, w = track?.wrapper;
  if (!c || !w) return { left: 0, top: 0, width: box.width, height: box.height };
  const sx = box.width / c.width, sy = box.height / c.height;
  return { left: round3(w.left * sx), top: round3(w.top * sy), width: round3(w.width * sx), height: round3(w.height * sy) };
}

const CURSOR_PATH = 'M1 1 L1 19 L5.5 14.5 L8.5 22 L11.5 20.5 L8.5 13 L15 13 Z';
export const DRIFT_DROPPED = 'capture_drift declared but no <frame_id>.autozoom.json — drift dropped; write the sidecar with autozoom --events /dev/null --manifest <capture>/capture-manifest.json (a home-pose track the drift is stamped on)';

export function framedBox(box, canvas) {
  if (!box || !canvas) return false;
  return box.width < canvas.width - 1 || box.height < canvas.height - 1;
}

export function windowEdges(box, canvas, min = 16) {
  if (!framedBox(box, canvas)) return [];
  const edges = [];
  if (box.left < min) edges.push('left');
  if (box.top < min) edges.push('top');
  if (canvas.width - (box.left + box.width) < min) edges.push('right');
  if (canvas.height - (box.top + box.height) < min) edges.push('bottom');
  return edges;
}

export function frameAllowsShadow(frameMd) {
  return !/\bno (?:drop[- ]?)?shadows?\b|\bshadow:\s*["']?none\b|\bnever shadowed\b|\bwithout (?:drop[- ]?)?shadows?\b|\bshadowless\b/i.test(String(frameMd ?? ''));
}

export function applyCamera(indexHtml, frames, { formatKey = '16:9', shadow = true } = {}) {
  let html = String(indexHtml);
  html = html.replace(/\n    <\/script>\n    <script data-pp-camera>[\s\S]*?<\/script>\n    <script>/g, '').replace(`\n${CAMERA_STYLE}`, '');
  html = html.replace(
    /<div id="pp-cam-[^"]+-stage" class="pp-cam-stage(?: pp-cam-framed)?(?: pp-cam-shadow)?" data-pp-frame="[^"]*" style="left:(-?[\d.]+)px;top:(-?[\d.]+)px;width:([\d.]+)px;height:([\d.]+)px">\s*<div id="pp-cam-[^"]+" class="pp-cam" data-layout-allow-overflow style="[^"]*">\s*<video ([^>]*?) class="clip" style="position:absolute;left:0;top:0;width:[\d.]+px;height:[\d.]+px;object-fit:([a-z-]+)">([\s\S]*?)<\/video>[\s\S]*?<\/svg>\s*<\/div>\s*<\/div>/g,
    (m, l, t, w, h, attrs, fit, inner) => `<video ${attrs} class="clip" style="position:absolute;left:${l}px;top:${t}px;width:${w}px;height:${h}px;object-fit:${fit}">${inner}</video>`,
  );
  const applied = [];
  const skipped = [];
  const script = [];
  const videos = hoistedVideos(html);
  for (const [i, f] of frames.entries()) {
    if (!f.plan) { if (f.drift) skipped.push({ id: f.id, reason: DRIFT_DROPPED, drift: true }); continue; }
    const track = f.plan.tracks?.[formatKey];
    if (!track) { skipped.push({ id: f.id, reason: `no ${formatKey} track in the plan` }); continue; }
    const v = videos.find((x) => x.frameIndex === i && Math.abs(x.start - f.start) < 0.002) ?? videos.find((x) => x.frameIndex === i);
    if (!v) { skipped.push({ id: f.id, reason: 'no hoisted video for this frame (no approved declaration?)' }); continue; }
    if (!v.box) { skipped.push({ id: f.id, reason: 'hoisted video has no host geometry (data-frame-video-x/y/width/height)' }); continue; }
    const cam = `pp-cam-${f.id}`;
    const px = Math.max(12, Math.round(v.box.height * 0.024));
    const attrs = v.attrs.replace(/\sstyle\s*=\s*"[^"]*"/, '').replace(/\sclass\s*=\s*"[^"]*"/, '').replace(/\s+/g, ' ').trim();
    const wrap = cameraWrapper(track, v.box);
    const markup = [
      `<div id="${cam}-stage" class="pp-cam-stage${framedBox(v.box, track.canvas) ? ` pp-cam-framed${shadow ? ' pp-cam-shadow' : ''}` : ''}" data-pp-frame="${f.id}" style="left:${v.box.left}px;top:${v.box.top}px;width:${v.box.width}px;height:${v.box.height}px">`,
      `        <div id="${cam}" class="pp-cam" data-layout-allow-overflow style="${wrap.left || wrap.top ? `left:${wrap.left}px;top:${wrap.top}px;` : ''}width:${wrap.width}px;height:${wrap.height}px">`,
      `          <video ${attrs} class="clip" style="position:absolute;left:0;top:0;width:${wrap.width}px;height:${wrap.height}px;object-fit:${v.fit}">${v.inner}</video>`,
      `          <div id="${cam}-cursor-ripple" class="pp-cam-ripple" style="width:${px}px;height:${px}px;margin:${-px / 2}px 0 0 ${-px / 2}px"></div>`,
      `          <svg id="${cam}-cursor" class="pp-cam-cursor" viewBox="0 0 16 24" aria-hidden="true" style="width:${px}px;height:${Math.round(px * 1.5)}px"><path d="${CURSOR_PATH}" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
      `        </div>`,
      `      </div>`,
    ].join('\n');
    html = html.replace(v.full, markup);
    const lines = gsapSnippet(f.plan, formatKey, { wrapper: `#${cam}`, cursor: `#${cam}-cursor`, timeline: 'tl', offset: f.start, size: { width: wrap.width, height: wrap.height } });
    const hasCursor = Boolean(f.plan.cursor?.path?.length);
    script.push(`        // ${f.id}: host ${f.start}s–${round3(f.start + v.duration)}s, box ${v.box.width}×${v.box.height} @ ${v.box.left},${v.box.top}`);
    if (hasCursor) script.push(`        tl.set("#${cam}-cursor", { autoAlpha: 1 }, ${round3(f.start)});`, `        tl.set("#${cam}-cursor", { autoAlpha: 0 }, ${round3(f.start + v.duration)});`);
    script.push(...lines.split('\n').map((l) => `        ${l}`));
    const drift = driftTween(track, f.drift, { wrapper: `#${cam}`, offset: f.start });
    if (drift) script.push(`        ${drift}`);
    applied.push({ id: f.id, box: v.box, wrapper: wrap, keyframes: track.keyframes.length, drift: Boolean(drift), clicks: f.plan.cursor?.clicks?.length ?? 0, cursor: hasCursor, ...(windowEdges(v.box, track.canvas).length ? { edges: windowEdges(v.box, track.canvas) } : {}) });
  }
  if (applied.length) {
    const anchor = 'window.__timelines["main"] = gsap.timeline({ paused: true });';
    if (!html.includes(anchor)) throw new Error('applyCamera: index.html has no main timeline anchor (assemble-index output expected)');
    const block = [
      '    <script data-pp-camera>',
      '      // power-presentation camera: zoom keyframes, cursor path and click ripples on the hoisted',
      '      // footage, from compositions/frames/<frame_id>.autozoom.json — stamped at each frame\'s host start.',
      '      (function () { var tl = window.__timelines["main"];',
      ...script,
      '      })();',
      '    </script>',
    ].join('\n');
    html = html.replace(anchor, `${anchor}\n    </script>\n${block}\n    <script>`);
    html = html.replace('    </style>', `${CAMERA_STYLE}\n    </style>`);
  }
  return { html, applied, skipped };
}

export function stageCamera(ctx, opts) {
  const indexFile = ctx.p('index.html');
  const html = readText(indexFile);
  if (!html) return { ok: false, exit: 3, reason: 'index.html missing — assemble-index did not run' };
  let t = 0;
  const frames = ctx.storyboard.frames.map((f) => {
    const id = frameIdOf(f);
    const start = round3(t);
    t += durationSeconds(f.keys.duration) ?? 0;
    return { id, start, plan: readJson(ctx.p('compositions', 'frames', `${id}.autozoom.json`)), drift: footageTiming(f)?.drift ?? null };
  });
  const shadow = frameAllowsShadow(readText(ctx.p('frame.md')) ?? readText(ctx.parent?.p?.('frame.md') ?? '') ?? '');
  const r = applyCamera(html, frames, { formatKey: ctx.variant ?? '16:9', shadow });
  if (!opts.dryRun && r.applied.length) fs.writeFileSync(indexFile, r.html);
  const other = r.skipped.filter((x) => !x.drift);
  const dropped = r.skipped.filter((x) => x.drift);
  const note = r.applied.length
    ? `camera: ${r.applied.map((a) => `${a.id} ${a.keyframes - 1} zoom(s), ${a.clicks} click(s)${a.cursor ? '' : ', no cursor'}`).join('; ')}${other.length ? `; skipped ${other.map((x) => `${x.id} (${x.reason})`).join(', ')}` : ''}`
    : `camera: nothing to apply${other.length ? ` — ${other.map((x) => `${x.id}: ${x.reason}`).join('; ')}` : ' (no <frame>.autozoom.json next to a hoisted video)'}`;
  const notes = [note];
  if (dropped.length) notes.push(`warning: camera: ${dropped.map((x) => x.id).join(', ')} — ${DRIFT_DROPPED.replace('<frame_id>', dropped.length === 1 ? dropped[0].id : '<frame_id>')}; send the frame back to its worker`);
  const edged = r.applied.filter((a) => a.edges);
  if (edged.length) notes.push(`warning: window: ${edged.map((a) => `${a.id} touches the ${a.edges.join(' / ')} edge`).join('; ')} — a framed recording window keeps padding round it (a full-bleed box is a background role)`);
  const still = r.applied.filter((a) => a.keyframes <= 1 && !a.drift);
  if (still.length) notes.push(`warning: camera: ${still.map((a) => a.id).join(', ')} — footage with no camera move (no zoom in its window, no capture_drift); give its window a click to zoom on or declare a drift`);
  return { ok: true, exit: 0, notes, applied: r.applied, skipped: r.skipped, still: still.map((a) => a.id) };
}

export const DROPOUT_RANGE_S = Object.freeze([0.3, 0.5]);
export const BED_FADE_IN_S = 0.4;
export const BED_FADE_OUT_S = 1.5;
const DIP_RAMP_S = 0.06;
const RETURN_RAMP_S = 0.03;

export function parseDropout(v) {
  const m = /^\s*([\d.]+)\s*s?\s*(?:@\s*([\d.]+)\s*s?)?\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const len = Math.min(DROPOUT_RANGE_S[1], Math.max(DROPOUT_RANGE_S[0], Number(m[1])));
  return { len: round3(len), at: m[2] != null ? Number(m[2]) : 0 };
}

export function bedVolumeLane({ base, duration, dips = [], fadeIn = BED_FADE_IN_S, fadeOut = BED_FADE_OUT_S }) {
  const pts = [{ t: 0, v: 0 }, { t: Math.min(fadeIn, duration / 4), v: base }];
  const outStart = Math.max(duration - Math.min(fadeOut, duration / 4), 0);
  let last = pts[1].t;
  for (const d of [...dips].sort((a, b) => a.t - b.t)) {
    const down = d.t - d.len;
    if (down - DIP_RAMP_S <= last || d.t + RETURN_RAMP_S >= outStart) continue;
    pts.push({ t: round3(down - DIP_RAMP_S), v: base }, { t: round3(down), v: 0 }, { t: round3(d.t), v: 0 }, { t: round3(d.t + RETURN_RAMP_S), v: base });
    last = d.t + RETURN_RAMP_S;
  }
  pts.push({ t: round3(outStart), v: base }, { t: round3(duration), v: 0 });
  return { target: 'volume', points: pts };
}

const unescapeAttr = (v) => String(v).replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function withBedAutomation(html, lane) {
  return String(html).replace(/<audio\b([^>]*\bid="el-bgm"[^>]*)>/, (m, attrs) => {
    const prev = /\sdata-automation="([^"]*)"/.exec(attrs)?.[1];
    let kept = [];
    try { kept = prev ? (JSON.parse(unescapeAttr(prev)).lanes ?? []).filter((l) => l.target !== lane.target) : []; } catch { kept = []; }
    return `<audio${attrs.replace(/\s+data-automation="[^"]*"/, '')} data-automation="${escapeAttr(JSON.stringify({ version: 1, lanes: [...kept, lane] }))}">`;
  });
}

export const CARVE_STRENGTH = 0.35;
export const VOICE_GROUP = 'voiceover';

export function withVoiceGroup(html) {
  return String(html).replace(/<audio\b([^>]*\bid="el-[^"]*-voice"[^>]*)>/g, (m, attrs) => (/data-audio-group=/.test(attrs) ? m : `<audio${attrs} data-audio-group="${VOICE_GROUP}">`));
}

export function stageCarve(ctx, opts, run) {
  const indexFile = ctx.p('index.html');
  const html = readText(indexFile);
  if (!html || !/id="el-bgm"/.test(html) || !/id="el-[^"]*-voice"/.test(html)) return { note: null };
  const carve = path.join(path.dirname(ctx.workflowDir), 'hyperframes-audio', 'scripts', 'carve.mjs');
  if (!exists(carve)) return { note: `warning: voiceover carve skipped — ${carve} missing (the hyperframes-audio skill; \`npx hyperframes@${HYPERFRAMES_PIN} skills update\`)` };
  if (opts.dryRun) return { note: `voiceover carve: would carve the bed at strength ${CARVE_STRENGTH}` };
  fs.writeFileSync(indexFile, withVoiceGroup(html));
  const args = [carve, '--comp', indexFile, '--bed', 'el-bgm', '--strength', String(CARVE_STRENGTH), ...(ctx.paths?.node_modules ? ['--core', ctx.paths.node_modules] : [])];
  const r = run(process.execPath, args, { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.assemble });
  if (r.status !== 0) { fs.writeFileSync(indexFile, html); return { note: `warning: voiceover carve failed (${r.error ?? `exit ${r.status}`}): ${tail(r.stderr || r.stdout)} — the bed stays static` }; }
  return { note: `voiceover carve: ${tail(r.stdout, 4).replace(/\n/g, '; ')}` };
}

export function stageBedAutomation(ctx, opts) {
  const indexFile = ctx.p('index.html');
  const html = readText(indexFile);
  const tag = html && /<audio\b[^>]*\bid="el-bgm"[^>]*>/.exec(html)?.[0];
  if (!tag) return { ok: true, note: null };
  const base = Number(/data-volume="([\d.]+)"/.exec(tag)?.[1] ?? 1);
  const bedStart = Number(/data-start="([\d.]+)"/.exec(tag)?.[1] ?? 0);
  const duration = Number(/data-duration="([\d.]+)"/.exec(tag)?.[1] ?? 0);
  if (!(duration > 0)) return { ok: true, note: null };
  let t = 0;
  const dips = [];
  for (const f of ctx.storyboard.frames) {
    const d = parseDropout(f.keys.dropout);
    if (d) dips.push({ t: round3(t + d.at - bedStart), len: d.len, frame: f.number });
    t += durationSeconds(f.keys.duration) ?? 0;
  }
  const lane = bedVolumeLane({ base, duration, dips });
  const kept = lane.points.filter((p, i) => i > 1 && p.v === 0 && lane.points[i + 1]?.v === 0).length;
  if (!opts.dryRun) fs.writeFileSync(indexFile, withBedAutomation(html, lane));
  return { ok: true, note: `bed: fade-in ${BED_FADE_IN_S}s, fade-out ${BED_FADE_OUT_S}s${dips.length ? `; silence before the reveal in frame(s) ${dips.map((d) => `${d.frame} (${d.len}s)`).join(', ')}${kept < dips.length ? ` — ${dips.length - kept} without room between the fades` : ''}` : ''} → data-automation on the bed` };
}

function wowprobeArgs(ctx, { video = null, sheet = false, trend = null, suffix = '' } = {}) {
  const args = [path.join(ctx.pluginRootDir, 'scripts', 'wowprobe.py'), '--storyboard', ctx.p('STORYBOARD.md'), '--project', ctx.project, '--out', ctx.p('QA', `wowprobe${suffix}.json`)];
  if (ctx.mode) args.push('--mode', ctx.mode);
  if (exists(ctx.p('claims-index.json'))) args.push('--claims', ctx.p('claims-index.json'));
  const checkFile = exists(ctx.p('QA', `check${suffix}.json`)) ? ctx.p('QA', `check${suffix}.json`) : ctx.p('QA', 'check.json');
  if (exists(checkFile)) args.push('--check', checkFile);
  if (exists(ctx.p('.hyperframes', 'anim-map', 'animation-map.json'))) args.push('--animation-map', ctx.p('.hyperframes', 'anim-map', 'animation-map.json'));
  if (exists(ctx.p('captions', 'en.srt'))) args.push('--srt', ctx.p('captions', 'en.srt'));
  if (exists(ctx.p('QA.md'))) args.push('--qa-md', ctx.p('QA.md'));
  const music = readJson(ctx.p('.media', 'pp-music.json'));
  if (music?.cues && exists(music.cues)) args.push('--cues', music.cues);
  if (ctx.storyboard.globals.reveal) args.push('--reveal', ctx.storyboard.globals.reveal);
  if (ctx.storyboard.globals.register) args.push('--register', ctx.storyboard.globals.register);
  if (ctx.destination) args.push('--destination', ctx.destination);
  const briefDuration = durationSeconds(ctx.intake?.declared?.duration ?? ctx.intake?.derived?.duration?.value ?? ctx.storyboard.globals.duration);
  if (briefDuration) args.push('--brief-duration', String(briefDuration));
  if (video) {
    args.push('--video', video);
    if (ctx.targetLufs != null) args.push('--target-lufs', String(ctx.targetLufs));
    if (sheet) args.push('--sheet', ctx.p('QA', `contact-sheet${suffix}.png`), '--frames-dir', ctx.p('QA', `frames${suffix}`));
    else args.push('--no-sheet');
    if (trend) args.push('--trend', trend, '--label', `${ctx.name}${suffix}`);
  } else args.push('--no-sheet');
  return args;
}

export function runNetworkManifest(ctx) {
  const rows = [];
  const add = (host, purpose, stage) => { if (host && !rows.some((r) => r.host === host && r.stage === stage)) rows.push({ host, purpose, stage }); };
  const doctor = readDoctor(ctx.paths);
  if (!doctor?.gate?.ok) for (const r of networkManifest()) add(r.host, r.purpose, 'toolchain install (first run)');
  if (!exists(ctx.p('node_modules', 'hyperframes'))) add('registry.npmjs.org', `a bare \`npx hyperframes\` resolves the package on the npm registry while the project has no node_modules/hyperframes (\`R init\` links the pinned ${HYPERFRAMES_PIN} CLI there)`,'project init (npx hyperframes init, before R init links the pinned CLI)');
  const src = ctx.intake?.declared?.source;
  if (src && ['url', 'staging-url'].includes(src.kind)) { try { add(new URL(src.value).host, `the product at ${src.value}: extract-story --fetch + record-flow capture`, 'inspect / capture'); } catch { } }
  for (const r of compositionRefs(ctx.project)) add(r.host, `composition asset ${r.url} (${r.file})`, 'verify / render');
  if (!telemetryOff(ctx.env)) add(HF_TELEMETRY.host, 'HyperFrames CLI telemetry — HYPERFRAMES_NO_TELEMETRY / DO_NOT_TRACK not set', 'every CLI call');
  return rows;
}

export const LOCAL_GSAP_DIR = ['assets', 'vendor', `gsap@${GSAP_PIN}`];
const GSAP_CDN_RES = [
  /https?:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/gsap@([\d.]+)\/dist\/([\w.-]+\.js)/g,
  /https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/([\d.]+)\/([\w.-]+\.js)/g,
];

export function localizeGsap(html, available = () => true) {
  const used = new Set();
  const skipped = new Set();
  const pinned = new Set();
  let out = String(html ?? '');
  for (const re of GSAP_CDN_RES) {
    out = out.replace(re, (m, ver, file) => {
      if (!/^3(?:\.|$)/.test(ver) || !available(file)) { skipped.add(m); return m; }
      used.add(file);
      if (ver !== GSAP_PIN) pinned.add(`${m} → ${GSAP_PIN}`);
      return `${LOCAL_GSAP_DIR.join('/')}/${file}`;
    });
  }
  return { html: out, used: [...used], skipped: [...skipped], pinned: [...pinned] };
}

export function localizeCdn(ctx, { dryRun = false } = {}) {
  const dist = ctx.paths?.node_modules ? path.join(ctx.paths.node_modules, 'gsap', 'dist') : null;
  const has = (file) => Boolean(dist && exists(path.join(dist, file)));
  const files = [];
  if (exists(ctx.p('index.html'))) files.push(ctx.p('index.html'));
  const walk = (dir) => { if (!exists(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.html?$/i.test(e.name)) files.push(f); } };
  walk(ctx.p('compositions'));
  const copied = new Set();
  const skipped = new Set();
  const pinned = new Set();
  let rewritten = 0;
  for (const f of files) {
    const r = localizeGsap(readText(f), has);
    r.skipped.forEach((x) => skipped.add(x));
    r.pinned.forEach((x) => pinned.add(x));
    if (!r.used.length) continue;
    rewritten += 1;
    if (!dryRun) {
      for (const file of r.used) if (!copied.has(file)) { fs.mkdirSync(ctx.p(...LOCAL_GSAP_DIR), { recursive: true }); fs.copyFileSync(path.join(dist, file), ctx.p(...LOCAL_GSAP_DIR, file)); copied.add(file); }
      fs.writeFileSync(f, r.html);
    } else r.used.forEach((x) => copied.add(x));
  }
  const left = skipped.size ? `warning: gsap stays on the CDN — ${dist && exists(dist) ? `not a GSAP 3 file the toolchain has: ${[...skipped].join(', ')} (point the frame at gsap@${GSAP_PIN})` : `gsap@${GSAP_PIN} not in the toolchain (node scripts/toolchain.mjs install)`}` : null;
  const pin = pinned.size ? `; another GSAP 3 pinned to ${GSAP_PIN}: ${[...pinned].join(', ')}` : '';
  const note = rewritten
    ? `gsap served from the project: ${rewritten} file(s) → ${LOCAL_GSAP_DIR.join('/')}/ (${[...copied].join(', ')})${pin}${left ? `; ${left}` : ''}`
    : (left ?? 'gsap: no CDN reference');
  return { rewritten, copied: [...copied], skipped: [...skipped], pinned: [...pinned], note };
}

export function cliEgress(ctx, opts, stage) {
  const refs = compositionRefs(ctx.project);
  if (ctx.privacy === 'local' && refs.length) {
    return { ok: false, exit: 3, reason: `privacy local: the composition loads ${[...new Set(refs.map((r) => r.host))].join(', ')} — ${refs.map((r) => `${r.url} (${r.file})`).join(', ')}; vendor it into assets/ so the network manifest stays empty` };
  }
  const lines = cliStageEgress({ stage, env: ctx.env, refs, at: new Date().toISOString() });
  if (!opts.dryRun) appendEgress(ctx.project, lines);
  return { ok: true, note: `egress: ${[...new Set(lines.map((l) => l.host))].join(', ') || 'none'} → .media/egress.jsonl` };
}

export function stageVerify(ctx, opts, run) {
  if (!exists(ctx.p('index.html'))) return { ok: false, exit: 3, reason: 'index.html missing — run assemble first' };
  if (!ctx.cli) return { ok: false, exit: 3, reason: 'no hyperframes CLI (node scripts/toolchain.mjs install)' };
  const fps = storyboardFps(ctx.storyboard.globals);
  if (!fps.ok) return { ok: false, exit: 3, reason: fps.reason };
  const notes = [];
  if (!opts.dryRun) fs.mkdirSync(ctx.p('QA'), { recursive: true });
  const badSel = frameFiles(ctx.p('compositions', 'frames')).map((f) => ({ f, bad: digitLeadingSelectors(readText(ctx.p('compositions', 'frames', f)) ?? '') })).filter((x) => x.bad.length);
  if (badSel.length) return { ok: false, exit: 3, reason: `frame selectors start with a digit — CSS drops those rules and querySelectorAll throws, so the frame renders unstyled: ${badSel.map((x) => `${x.f}: ${x.bad.slice(0, 6).map((b) => `${b.token} (${b.where})`).join(', ')}`).join('; ')} — rename (e.g. .f08-proof-quote)` };
  const eg = cliEgress(ctx, opts, 'verify');
  if (!eg.ok) return eg;
  notes.push(eg.note);
  const cli = [ctx.cli.cmd, ...ctx.cli.args];
  let t0 = 0;
  const sidecarFrames = ctx.storyboard.frames.map((f) => { const id = frameIdOf(f); const start = round3(t0); t0 += durationSeconds(f.keys.duration) ?? 0; return { id, start, sidecar: readJson(ctx.p('compositions', 'frames', `${id}.motion.json`)) }; });
  const host = buildHostSidecar(sidecarFrames, { duration: round3(t0) });
  if (!opts.dryRun) { if (host.json.assertions.length) writeJson(ctx.p('index.motion.json'), host.json); else fs.rmSync(ctx.p('index.motion.json'), { force: true }); }
  notes.push(`motion sidecar: ${host.json.assertions.length} assertion(s) → index.motion.json from ${host.report.filter((r) => !r.missing).length}/${host.report.length} frame sidecar(s)${host.report.some((r) => r.missing) ? ` (missing: ${host.report.filter((r) => r.missing).map((r) => r.id).join(', ')})` : ''}; keepsMoving dropped (QA-07 on the master)`);
  const lint = run(cli[0], [...cli.slice(1), 'lint', ctx.project, '--json'], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.lint });
  if (!opts.dryRun) fs.writeFileSync(ctx.p('QA', 'lint.json'), lint.stdout || '{}');
  let lintJson = null;
  try { lintJson = JSON.parse(lint.stdout.slice(lint.stdout.indexOf('{'))); } catch { }
  const lintErrors = Array.isArray(lintJson?.findings) ? lintJson.findings.filter((f) => f.severity === 'error').length : (lint.status !== 0 ? 1 : 0);
  notes.push(`lint: ${lintJson ? `${lintJson.findings?.length ?? 0} finding(s), ${lintErrors} error(s)` : `exit ${lint.status}`}`);
  const check = run(cli[0], [...cli.slice(1), 'check', ctx.project, '--json', '--frame-check', '--caption-zone', CAPTION_ZONE], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.check });
  const checkText = check.stdout || '';
  const start = checkText.indexOf('{');
  if (start < 0) return { ok: false, exit: 1, reason: `hyperframes check produced no JSON (${check.error ?? `exit ${check.status}`}): ${tail(check.stderr || checkText)}` };
  if (!opts.dryRun) fs.writeFileSync(ctx.p('QA', 'check.json'), checkText.slice(start));
  const checkJson = readJson(ctx.p('QA', 'check.json'));
  notes.push(`check: ok=${checkJson?.ok ?? '?'} (${check.seconds.toFixed(1)}s, exit ${check.status}) → QA/check.json`);
  const am = run(process.execPath, [path.join(path.dirname(ctx.workflowDir), 'hyperframes-animation', 'scripts', 'animation-map.mjs'), ctx.project, '--out', ctx.p('.hyperframes', 'anim-map')], { cwd: ctx.project, env: { ...ctx.env, HYPERFRAMES_SKILL_DEPS_BOOTSTRAPPED: '1' }, timeoutS: TIMEOUTS_S.animation_map });
  if (am.status !== 0) notes.push(`animation-map: failed (${am.error ?? `exit ${am.status}`}) — QA-11 stays not measured: ${tail(am.stderr || am.stdout, 3)}`);
  else notes.push(`animation-map: ${tail(am.stdout.split('\n').filter((l) => /Animation map/.test(l)).join('\n'), 1) || 'ok'} → .hyperframes/anim-map/animation-map.json`);
  const w = run('python3', wowprobeArgs(ctx), { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.wowprobe });
  const probe = readJson(ctx.p('QA', 'wowprobe.json'));
  if (!probe && !opts.dryRun) return { ok: false, exit: 1, reason: `wowprobe.py wrote nothing (${w.error ?? `exit ${w.status}`}): ${tail(w.stderr)}` };
  const failed = probe?.gates_failed ?? [];
  notes.push(`wowprobe pre-render: gates_failed ${JSON.stringify(failed)}; not measured ${Object.keys(probe?.not_measured ?? {}).join(', ') || 'none'}; scorecard ${probe?.scorecard?.total ?? 'n/a'}`);
  if (failed.length) return { ok: false, exit: 3, reason: `pre-render gates failed: ${failed.join(', ')} (QA/wowprobe.json)`, notes };
  if (ctx.formats.includes(PORTRAIT.key)) {
    const pc = portraitCheck(ctx, opts, run);
    notes.push(...pc.notes);
    if (!pc.ok) return { ok: false, exit: pc.exit, reason: pc.reason, notes };
  }
  return { ok: true, exit: 0, notes };
}

export function portraitCheck(ctx, opts, run) {
  const dir = ctx.p(...PORTRAIT.dir);
  if (!exists(path.join(dir, 'index.html'))) return { ok: false, exit: 3, reason: '9:16 host missing — run assemble with --formats 16:9,9:16', notes: [] };
  const cli = [ctx.cli.cmd, ...ctx.cli.args];
  const notes = [];
  const lint = run(cli[0], [...cli.slice(1), 'lint', dir, '--json'], { cwd: dir, env: ctx.env, timeoutS: TIMEOUTS_S.lint });
  let lintJson = null;
  try { lintJson = JSON.parse(lint.stdout.slice(lint.stdout.indexOf('{'))); } catch { }
  notes.push(`9:16 lint: ${lintJson ? `${lintJson.findings?.length ?? 0} finding(s), ${(lintJson.findings ?? []).filter((f) => f.severity === 'error').length} error(s)` : `exit ${lint.status}`}`);
  const check = run(cli[0], [...cli.slice(1), 'check', dir, '--json', '--frame-check', '--caption-zone', CAPTION_ZONE], { cwd: dir, env: ctx.env, timeoutS: TIMEOUTS_S.check });
  const text = check.stdout || '';
  const start = text.indexOf('{');
  if (start < 0) return { ok: false, exit: 1, reason: `9:16 hyperframes check produced no JSON (${check.error ?? `exit ${check.status}`}): ${tail(check.stderr || text)}`, notes };
  if (!opts.dryRun) fs.writeFileSync(ctx.p('QA', 'check-9x16.json'), text.slice(start));
  const j = readJson(ctx.p('QA', 'check-9x16.json'));
  notes.push(`9:16 check: ok=${j?.ok ?? '?'} (${check.seconds.toFixed(1)}s, exit ${check.status}) → QA/check-9x16.json`);
  if (!opts.dryRun && j?.ok !== true) return { ok: false, exit: 3, reason: '9:16 hyperframes check is not ok (QA-02 / QA-14 on the portrait host — QA/check-9x16.json)', notes };
  return { ok: true, exit: 0, notes };
}

export const ALLOWED_FPS = Object.freeze([15, 24, 30]);
export const DEFAULT_FPS = 30;

export function storyboardFps(globals) {
  const raw = globals?.fps;
  if (raw == null || String(raw).trim() === '') return { fps: DEFAULT_FPS, declared: false, ok: true };
  const n = Number(String(raw).trim());
  if (ALLOWED_FPS.includes(n)) return { fps: n, declared: true, ok: true };
  return { fps: DEFAULT_FPS, declared: true, ok: false, reason: `STORYBOARD.md \`fps: ${raw}\` — the frame rate is ${ALLOWED_FPS.join(', ')} (default ${DEFAULT_FPS}), chosen on purpose` };
}

export function renderPreconditions(ctx) {
  const reasons = [];
  const doctor = readDoctor(ctx.paths);
  if (!doctor?.gate?.ok || doctor.hyperframes !== HYPERFRAMES_PIN) reasons.push(`doctor gate not ok for ${HYPERFRAMES_PIN} (node scripts/toolchain.mjs doctor)`);
  const check = readJson(ctx.p('QA', 'check.json'));
  if (!check) reasons.push('QA/check.json missing — run verify (QA-02)');
  else if (check.ok !== true) reasons.push('QA/check.json is not ok (QA-02)');
  const probe = readJson(ctx.p('QA', 'wowprobe.json'));
  if (!probe) reasons.push('QA/wowprobe.json missing — run verify');
  else if ((probe.gates_failed ?? []).length) reasons.push(`wowprobe gates failed: ${probe.gates_failed.join(', ')}`);
  const cap = readJson(ctx.p('.media', 'capture', 'capture-manifest.json'));
  if (cap?.blocked) reasons.push('capture is blocked by the OCR gate');
  if (cap && cap.redaction?.layer2_ocr_gate && cap.redaction.layer2_ocr_gate.ran === false && !cap.redaction.layer2_ocr_gate.confirmed) reasons.push('capture OCR gate did not run and is not confirmed');
  if (!exists(ctx.p('index.html'))) reasons.push('index.html missing');
  const fps = storyboardFps(ctx.storyboard?.globals);
  if (!fps.ok) reasons.push(fps.reason);
  if (!/^[ \t]*(?:-[ \t]*)?approved:[ \t]*v\d+/m.test(ctx.storyboardText ?? readText(ctx.p('STORYBOARD.md')) ?? '')) reasons.push('STORYBOARD.md has no `approved: v<N>` — record the "render?" answer with `render-path approve` (silence or --yes = yes) first');
  reasons.push(...editScopeProblems(ctx.project));
  const audio = readJson(ctx.p('audio_meta.json'));
  if (Array.isArray(audio?.voices) && audio.voices.length && !endCardDisclosure(ctx.storyboard)) reasons.push(`the voice is synthetic (${audio.tts_provider ?? 'tts'}) but the end card carries no disclosure line — add \`- text: "${ON_SCREEN_DISCLOSURE}" @ a-b\` to the last frame of STORYBOARD.md and to its frame`);
  if (ctx.formats?.includes(PORTRAIT.key)) {
    const c9 = readJson(ctx.p('QA', 'check-9x16.json'));
    if (!c9) reasons.push('QA/check-9x16.json missing — run verify with --formats 16:9,9:16 (QA-02)');
    else if (c9.ok !== true) reasons.push('QA/check-9x16.json is not ok (QA-02 on the 9:16 host)');
  }
  const ledger = freezeProject(ctx.project, { dryRun: true });
  for (const x of ledger.problems) reasons.push(`media ledger: ${x.problem} ${x.path} — ${x.detail}`);
  const declaring = framesDeclaringFootage(ctx.p('compositions', 'frames'));
  if (declaring.length) reasons.push(`frame(s) still declare their footage: ${declaring.map((d) => d.file).join(', ')} — the render would mount it a second time, unsized, over the camera; run render-path assemble`);
  return reasons;
}

export const PREFLIGHT_GATES = Object.freeze(['QA-03', 'QA-07', 'QA-09']);
export const PREFLIGHT_QA07_MARGIN_PP = 3;
export const QA07_FREEZE_MAX_PCT = 25;

export function stagePreflight(ctx, opts, run) {
  if (!exists(ctx.p('index.html'))) return { ok: false, exit: 3, reason: 'index.html missing — run assemble first' };
  if (!ctx.cli) return { ok: false, exit: 3, reason: 'no hyperframes CLI (node scripts/toolchain.mjs install)' };
  const eg = cliEgress(ctx, opts, 'render');
  if (!eg.ok) return eg;
  const notes = [eg.note];
  const { fps } = storyboardFps(ctx.storyboard.globals);
  const draft = ctx.p('renders', 'draft', `${ctx.name}_draft.mp4`);
  if (!opts.dryRun) fs.mkdirSync(path.dirname(draft), { recursive: true });
  const cli = [ctx.cli.cmd, ...ctx.cli.args];
  const r = run(cli[0], [...cli.slice(1), 'render', ctx.project, '--quality', 'draft', '--fps', String(fps), '--output', draft, '--json'], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.render });
  if (r.status !== 0 || (!opts.dryRun && !exists(draft))) return { ok: false, exit: 1, reason: `draft render failed (${r.error ?? `exit ${r.status}`}): ${tail(r.stderr || r.stdout)}`, notes };
  const w = run('python3', wowprobeArgs(ctx, { video: draft, suffix: '-preflight' }), { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.wowprobe });
  const probe = readJson(ctx.p('QA', 'wowprobe-preflight.json'));
  if (!probe && !opts.dryRun) return { ok: false, exit: 1, reason: `wowprobe.py on the draft wrote nothing (${w.error ?? `exit ${w.status}`}): ${tail(w.stderr)}`, notes };
  const gate = (id) => probe?.gates?.[id];
  const fmt = (id) => { const g = gate(id); return g ? `${id} ${g.pass === false ? 'FAIL' : 'ok'}${g.value != null ? ` (${g.value}${id === 'QA-07' ? ' % frozen' : ''})` : ''}` : `${id} —`; };
  notes.push(`preflight (draft render, ${fps} fps → ${path.relative(ctx.project, draft)}): ${PREFLIGHT_GATES.map(fmt).join(', ')}`);
  const frozen = Number(gate('QA-07')?.value);
  if (Number.isFinite(frozen) && gate('QA-07')?.pass !== false && frozen >= QA07_FREEZE_MAX_PCT - PREFLIGHT_QA07_MARGIN_PP) notes.push(`warning: preflight QA-07 ${frozen} % frozen is within ${PREFLIGHT_QA07_MARGIN_PP} points of the ${QA07_FREEZE_MAX_PCT} % ceiling — the draft reads ±2 points off the master; give the stillest scene motion before approval`);
  const failed = PREFLIGHT_GATES.filter((id) => (probe?.gates_failed ?? []).includes(id));
  if (failed.length) return { ok: false, exit: 3, reason: `preflight: ${failed.map(fmt).join(', ')} on the draft render — fix the frames (QA-07: motion in the still scenes, or a declared hold) before approval and the delivery render`, notes, failed };
  return { ok: true, exit: 0, notes };
}

export function stageRender(ctx, opts, run) {
  const pre = renderPreconditions(ctx);
  if (pre.length && !opts.dryRun) return { ok: false, exit: 3, reason: `render refused: ${pre.join('; ')}` };
  const notes = [];
  const outDir = ctx.p('renders', 'final');
  if (!opts.dryRun) fs.mkdirSync(outDir, { recursive: true });
  const eg = cliEgress(ctx, opts, 'render');
  if (!eg.ok) return eg;
  notes.push(eg.note);
  const cli = [ctx.cli.cmd, ...ctx.cli.args];
  const version = ctx.storyboard.globals.version ?? 'v1';
  const { fps } = storyboardFps(ctx.storyboard.globals);
  const targets = [{ key: '16:9', dir: ctx.project }, ...(ctx.formats.includes(PORTRAIT.key) ? [{ key: PORTRAIT.key, dir: ctx.p(...PORTRAIT.dir) }] : [])];
  const line = { version, at: new Date().toISOString(), hyperframes: HYPERFRAMES_PIN, quality: 'delivery', fps, resolution: '1920x1080', formats: {}, not_produced: {}, duration_s: {}, sha256: {}, index_sha256: null, index_sha256_by_format: {}, scene_keys: [], status: 'ok', wall_s: 0, capture_path: null, gpu: null };
  for (const t of targets) {
    const master = path.join(outDir, `${ctx.name}_${FORMAT_STEM[t.key]}.mp4`);
    const t0 = Date.now();
    const r = run(cli[0], [...cli.slice(1), 'render', t.dir, '--quality', 'delivery', '--fps', String(fps), '--output', master, '--json'], { cwd: t.dir, env: ctx.env, timeoutS: TIMEOUTS_S.render });
    const wall = (Date.now() - t0) / 1000;
    line.wall_s = round1(line.wall_s + wall);
    if (r.status !== 0 || (!opts.dryRun && !exists(master))) {
      const failed = { ...line, status: r.error?.startsWith('timeout') ? 'timeout' : 'failed', failed_format: t.key, error: tail(r.stderr || r.stdout, 6) };
      if (!opts.dryRun) fs.appendFileSync(ctx.p('renders', 'manifest.json'), `${JSON.stringify(failed)}\n`);
      return { ok: false, exit: 1, reason: `hyperframes render ${t.key} failed (${r.error ?? `exit ${r.status}`}): ${tail(r.stderr || r.stdout)}`, notes };
    }
    let summary = null;
    try { summary = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { }
    if (t.key === '16:9') { line.fps = summary?.fps ?? fps; line.capture_path = summary?.capturePath ?? summary?.capture ?? null; line.gpu = summary?.gpu ?? null; }
    line.formats[t.key] = path.relative(ctx.project, master);
    line.duration_s[t.key] = opts.dryRun ? null : ffprobeDuration(master, ctx.env);
    if (!opts.dryRun) { line.sha256[t.key] = sha256File(master); line.index_sha256_by_format[t.key] = sha256File(path.join(t.dir, 'index.html')); }
    notes.push(`render ${version} ok: ${t.key} ${line.duration_s[t.key] ?? '?'}s ${line.formats[t.key]}; wall ${round1(wall)}s`);
  }
  line.index_sha256 = line.index_sha256_by_format['16:9'] ?? null;
  if (!opts.dryRun) fs.appendFileSync(ctx.p('renders', 'manifest.json'), `${JSON.stringify(line)}\n`);
  notes.push(`hyperframes ${HYPERFRAMES_PIN}; formats ${Object.keys(line.formats).join(' + ')}`);
  return { ok: true, exit: 0, notes, master: ctx.p(line.formats['16:9']), line };
}

function ffprobeDuration(file, env) {
  const r = spawnSync(env.HYPERFRAMES_FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', env });
  const n = Number((r.stdout || '').trim());
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

export const LOUDNORM_LRA = 11;
export const LOUDNORM_TP = -1.5;

export function loudnormMeasureArgs(master, targetLufs) {
  return ['-nostats', '-hide_banner', '-i', master, '-af', `loudnorm=I=${targetLufs}:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}:print_format=json`, '-f', 'null', '-'];
}

export function parseLoudnorm(stderr) {
  const m = /\{[\s\S]*?"target_offset"[\s\S]*?\}/.exec(stderr ?? '');
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export const QA08_TP_MAX = -1;

export function loudnormApplyArgs(master, out, targetLufs, measured, { tp = LOUDNORM_TP } = {}) {
  const af = [`loudnorm=I=${targetLufs}`, `TP=${tp}`, `LRA=${LOUDNORM_LRA}`,
    `measured_I=${measured.input_i}`, `measured_TP=${measured.input_tp}`, `measured_LRA=${measured.input_lra}`, `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`, 'linear=true', 'print_format=summary'].join(':');
  return ['-nostats', '-hide_banner', '-y', '-i', master, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-af', af, '-ar', '48000', '-c:a', 'aac', '-aac_coder', 'fast', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out];
}

export function normalizeLoudness(run, master, targetLufs, { env = process.env, cwd, dryRun = false, timeoutS = 300 } = {}) {
  const ffmpeg = env.HYPERFRAMES_FFMPEG_PATH || 'ffmpeg';
  const m = run(ffmpeg, loudnormMeasureArgs(master, targetLufs), { cwd, env, timeoutS });
  if (dryRun) return { ok: true, before: null, target: targetLufs, note: 'dry-run', error: null };
  const measured = parseLoudnorm(m.stderr);
  if (m.status !== 0 || !measured) return { ok: false, before: null, target: targetLufs, note: null, error: `loudnorm measure failed (${m.error ?? `exit ${m.status}`}): ${tail(m.stderr, 3)}` };
  const before = { integrated_lufs: Number(measured.input_i), true_peak_dbtp: Number(measured.input_tp), lra_lu: Number(measured.input_lra) };
  if (Math.abs(before.integrated_lufs - targetLufs) <= 1 && before.true_peak_dbtp <= -1) return { ok: true, before, target: targetLufs, note: `already within QA-08 (${before.integrated_lufs} LUFS, TP ${before.true_peak_dbtp} dBTP)`, error: null };
  const out = master.replace(/\.mp4$/, '.loudnorm.tmp.mp4');
  const apply = (values, tp) => {
    const a = run(ffmpeg, loudnormApplyArgs(master, out, targetLufs, values, { tp }), { cwd, env, timeoutS });
    if (a.status !== 0 || !exists(out)) return `loudnorm apply failed (${a.error ?? `exit ${a.status}`}): ${tail(a.stderr, 3)}`;
    fs.renameSync(out, master);
    return null;
  };
  const measure = () => {
    const r = run(ffmpeg, loudnormMeasureArgs(master, targetLufs), { cwd, env, timeoutS });
    const v = r.status === 0 ? parseLoudnorm(r.stderr) : null;
    return v ? { values: v, integrated_lufs: Number(v.input_i), true_peak_dbtp: Number(v.input_tp), lra_lu: Number(v.input_lra) } : null;
  };
  const err = apply(measured, LOUDNORM_TP);
  if (err) return { ok: false, before, target: targetLufs, note: null, error: err };
  let after = measure();
  let passes = 1;
  if (after && after.true_peak_dbtp > QA08_TP_MAX) {
    const tp = Math.round((LOUDNORM_TP - (after.true_peak_dbtp - LOUDNORM_TP) - 0.2) * 10) / 10;
    const err2 = apply(after.values, tp);
    if (err2) return { ok: false, before, target: targetLufs, note: null, error: err2 };
    after = measure();
    passes = 2;
  }
  const afterOut = after ? { integrated_lufs: after.integrated_lufs, true_peak_dbtp: after.true_peak_dbtp, lra_lu: after.lra_lu } : null;
  return { ok: true, before, after: afterOut, passes, target: targetLufs, note: `${before.integrated_lufs} LUFS / TP ${before.true_peak_dbtp} dBTP → ${afterOut ? `${afterOut.integrated_lufs} LUFS / TP ${afterOut.true_peak_dbtp} dBTP` : 'not re-measured'} (target ${targetLufs} LUFS, TP ≤ ${LOUDNORM_TP} dBTP; two-pass loudnorm${passes > 1 ? ' + a corrective pass for the encoder overshoot' : ''}, video copied)`, error: null };
}

export function targetLufsFor({ flag = null, mode = null, voices = 0, script = false, bed = false } = {}) {
  if (flag != null) return { target: flag, row: '--target-lufs' };
  const voiced = voices > 0 || script;
  if (!voiced && bed) return { target: MUSIC_ONLY_LUFS, row: 'music-only cinematic hero (−18…−20)' };
  const target = TARGET_LUFS[mode] ?? -14;
  if (!voiced) return { target, row: `no voice and no bed — QA-08 has no row; the ${mode ?? 'default'} VO-led target` };
  return { target, row: mode === 'investors' ? 'VO-led premium / investor (−16…−18)' : 'social / YouTube, VO-led (−14)' };
}

export function stageDeliver(ctx, opts, run) {
  const manifestLines = (readText(ctx.p('renders', 'manifest.json')) ?? '').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const last = [...manifestLines].reverse().find((l) => l.status === 'ok' && l.formats?.['16:9']);
  if (!last) return { ok: false, exit: 3, reason: 'no successful render in renders/manifest.json — run render first' };
  const master = ctx.p(last.formats['16:9']);
  if (!exists(master)) return { ok: false, exit: 3, reason: `master missing: ${master}` };
  const notes = [];
  const mix = readJson(ctx.p('audio_meta.json'));
  const lufs = targetLufsFor({ flag: opts.targetLufs ?? null, mode: ctx.mode, voices: mix?.voices?.length ?? 0, script: exists(ctx.p('SCRIPT.md')), bed: Boolean(mix?.bgm) || exists(ctx.p('.media', 'pp-music.json')) });
  const target = lufs.target;
  const probeCtx = { ...ctx, targetLufs: target };
  const trend = ctx.privacy === 'local' ? null : path.join(ctx.paths.data, 'evals', 'results', 'trend.tsv');
  const srt = srtCues({ captionGroups: readJson(ctx.p('caption_groups.json')), audioMeta: readJson(ctx.p('audio_meta.json')), storyboard: ctx.storyboard });
  if (!opts.dryRun) { fs.mkdirSync(ctx.p('captions'), { recursive: true }); fs.writeFileSync(ctx.p('captions', 'en.srt'), toSrt(srt.cues)); }
  const failed = [];
  const notMeasured = [];
  let probe = null;
  for (const [key, rel] of Object.entries(last.formats)) {
    const file = ctx.p(rel);
    if (!exists(file)) return { ok: false, exit: 3, reason: `${key} master missing: ${file}`, notes };
    const stem = file.replace(/\.mp4$/, '');
    const tag = key === '16:9' ? '' : `${key} `;
    const suffix = key === '16:9' ? '' : `-${FORMAT_STEM[key]}`;
    const ln = normalizeLoudness(run, file, target, { env: ctx.env, cwd: ctx.project, dryRun: opts.dryRun, timeoutS: TIMEOUTS_S.render });
    if (!ln.ok) notes.push(`${tag}loudness: ${ln.error} — QA-08 will measure the unnormalised master`);
    else { notes.push(`${tag}loudness: ${ln.note} — QA-08 row: ${lufs.row}`); if (!opts.dryRun) writeJson(`${stem}.loudness.json`, { target_lufs: target, target_row: lufs.row, true_peak_max_dbtp: LOUDNORM_TP, before: ln.before, after: ln.after ?? null, passes: ln.passes ?? 0, method: 'ffmpeg loudnorm two-pass, linear, video copied', at: new Date().toISOString() }); }
    const w = run('python3', wowprobeArgs(probeCtx, { video: file, sheet: true, trend, suffix }), { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.wowprobe });
    const pr = readJson(ctx.p('QA', `wowprobe${suffix}.json`));
    if (!pr && !opts.dryRun) return { ok: false, exit: 1, reason: `wowprobe.py post-render (${key}) wrote nothing (${w.error ?? `exit ${w.status}`}): ${tail(w.stderr)}`, notes };
    if (key === '16:9') probe = pr;
    for (const g of pr?.gates_failed ?? []) failed.push(key === '16:9' ? g : `${g} (${key})`);
    for (const g of Object.keys(pr?.not_measured ?? {})) notMeasured.push(key === '16:9' ? g : `${g} (${key})`);
    notes.push(`${tag}wowprobe post-render: gates_failed ${JSON.stringify(pr?.gates_failed ?? [])}; not measured ${Object.keys(pr?.not_measured ?? {}).join(', ') || 'none'}; scorecard ${pr?.scorecard?.total ?? 'n/a'}; sheet ${pr?.contact_sheet?.file ? path.relative(ctx.project, pr.contact_sheet.file) : 'none'}`);
    const pb = run('bash', [path.join(ctx.pluginRootDir, 'scripts', 'poster-bake.sh'), '--video', file, '--storyboard', ctx.p('STORYBOARD.md'), '--json'], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.poster });
    let poster = null;
    try { poster = JSON.parse(pb.stdout.slice(pb.stdout.indexOf('{'))); } catch { }
    if (pb.status !== 0 || !poster) notes.push(`${tag}poster-bake failed (${pb.error ?? `exit ${pb.status}`}): ${tail(pb.stderr, 3)}`);
    else {
      if (!opts.dryRun) writeJson(`${stem}.poster.json`, { ...poster, baked: true, reason: poster.why ?? null });
      notes.push(`${tag}poster: ${path.relative(ctx.project, poster.poster_png ?? `${stem}.poster.png`)} @ ${poster.at}s (${poster.why ?? 'picked'}), baked into frame 0`);
    }
    if (!opts.dryRun) fs.writeFileSync(`${stem}.en.srt`, toSrt(srt.cues));
    notes.push(`${tag}srt: ${srt.cues.length} cue(s) from ${srt.source} → ${path.relative(ctx.project, `${stem}.en.srt`)}${key === '16:9' ? ' (+ captions/en.srt)' : ''}`);
  }
  const audioMeta = readJson(ctx.p('audio_meta.json'));
  const synthetic = Boolean(audioMeta?.voices?.length);
  const music = readJson(ctx.p('.media', 'pp-music.json'));
  const tierC = ctx.storyboard.frames.some((f) => (f.keys.evidence_tier ?? '').toUpperCase() === 'C' && ['ui', 'demo', 'recording', 'terminal', 'code', 'api', 'design', 'file'].includes(f.keys.role));
  const scArgs = ['--mode', ctx.mode ?? 'marketing', ...(synthetic ? ['--synthetic-voice'] : []), ...(music?.credit ? ['--music-credit', music.credit] : []), ...(tierC ? ['--tier-c'] : [])];
  if (!exists(ctx.p('share-copy.txt'))) {
    const prospect = ctx.intake?.declared?.prospect ? [ '--prospect', path.resolve(ctx.project, ctx.intake.declared.prospect) ] : [];
    const init = run(process.execPath, [path.join(ctx.pluginRootDir, 'scripts', 'share-copy.mjs'), 'init', '--product', ctx.storyboard.globals.product ?? ctx.name, '--video', path.relative(ctx.project, master), ...scArgs, ...prospect, '--out', ctx.p('share-copy.txt')], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.share_copy });
    notes.push(init.status === 0 ? 'share-copy.txt skeleton written (fill the copy, then lint)' : `share-copy init failed: ${tail(init.stderr || init.stdout, 3)}`);
  }
  const lint = run(process.execPath, [path.join(ctx.pluginRootDir, 'scripts', 'share-copy.mjs'), 'lint', ctx.p('share-copy.txt'), ...scArgs, ...(exists(ctx.p('claims-index.json')) ? ['--claims', ctx.p('claims-index.json')] : []), '--json'], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.share_copy });
  if (!opts.dryRun) { try { const j = JSON.parse(lint.stdout.slice(lint.stdout.indexOf('{'))); writeJson(ctx.p('QA', 'share-copy-lint.json'), { ...j, ok: lint.status === 0 }); } catch { writeJson(ctx.p('QA', 'share-copy-lint.json'), { ok: lint.status === 0, raw: tail(lint.stdout || lint.stderr) }); } }
  notes.push(`share-copy lint: ${lint.status === 0 ? 'clean' : `exit ${lint.status} — violations in QA/share-copy-lint.json`}`);
  if (ctx.mode === 'sales' && ctx.intake?.declared?.prospect) {
    const ret = stampProspectRetention(ctx.project, { dryRun: opts.dryRun });
    if (ret.record) notes.push(`prospect data: delete after ${ret.record.delete_after}${ret.created ? '' : ' (stamped at the first delivery)'} — node scripts/prospect-retention.mjs purge; the controller's legitimate-interest assessment: references/legitimate-interest.md`);
  }
  const rr = run(process.execPath, [path.join(ctx.pluginRootDir, 'scripts', 'run-report.mjs'), '--project', ctx.project, ...(exists(ctx.p('.hyperframes', 'tokens.json')) ? ['--tokens', ctx.p('.hyperframes', 'tokens.json')] : []), '--share-copy-lint', ctx.p('QA', 'share-copy-lint.json'), '--doctor', ctx.paths.doctor_file, ...(ctx.intake?.declared?.prospect ? ['--prospect', path.resolve(ctx.project, ctx.intake.declared.prospect)] : [])], { cwd: ctx.project, env: ctx.env, timeoutS: TIMEOUTS_S.report });
  notes.push(rr.status === 0 ? `run-report: ${tail(rr.stderr, 1)}` : `run-report failed: ${tail(rr.stderr, 3)}`);
  const ok = failed.length === 0;
  return { ok, exit: ok ? 0 : 3, reason: ok ? null : `post-render gates failed: ${failed.join(', ')} (QA/wowprobe.json; deliverables were still written)`, notes, gates_failed: failed, not_measured: notMeasured, scorecard: probe?.scorecard?.total ?? null };
}

export function statusReport(ctx) {
  const probe = readJson(ctx.p('QA', 'wowprobe.json'));
  const fr = ctx.storyboard.frames.length ? stageFrames(ctx) : { missing: [], present: [] };
  const manifest = (readText(ctx.p('renders', 'manifest.json')) ?? '').split(/\r?\n/).filter(Boolean);
  const last = manifest.length ? (() => { try { return JSON.parse(manifest[manifest.length - 1]); } catch { return null; } })() : null;
  return {
    project: ctx.project, mode: ctx.mode, name: ctx.name, hyperframes: ctx.cli ? { cmd: ctx.cli.cmd, source: ctx.cli.source } : null, kokoro: ctx.kokoro.ok,
    workflow: checkWorkflow(ctx, { allowDrift: true }),
    files: Object.fromEntries(['intake.json', 'BRIEF.md', 'frame.md', 'STORYBOARD.md', 'SCRIPT.md', 'claims-index.json', 'audio_meta.json', 'caption_groups.json', 'index.html', 'QA/check.json', 'QA/wowprobe.json', 'QA/contact-sheet.png', 'share-copy.txt', 'run-report.json', '.media/capture/capture-manifest.json', '.media/capture/autozoom.json', '.hyperframes/frame-packets/_dispatch.json', '.hyperframes/anim-map/animation-map.json'].map((f) => [f, exists(ctx.p(f))])),
    frames: { total: ctx.storyboard.frames.length, present: fr.present?.length ?? 0, missing: (fr.missing ?? []).map((m) => m.src) },
    gates: probe ? { gates_failed: probe.gates_failed, not_measured: Object.keys(probe.not_measured ?? {}), scorecard: probe.scorecard?.total ?? null, video: probe.video ?? null } : null,
    last_render: last, stages: readJson(ctx.stagesFile)?.stages_s ?? null,
    comments: frameComments(ctx).map((c) => ({ frame: c.frame, version: c.version, at: c.at, text: c.text })),
  };
}

export const PORTRAIT = Object.freeze({ key: '9:16', dir: ['.hyperframes', '9x16'], width: 1080, height: 1920 });
export const FORMAT_STEM = Object.freeze({ '16:9': '16x9', '9:16': '9x16' });
const PORTRAIT_COPY = ['SCRIPT.md', 'BRIEF.md', 'frame.md', 'audio_meta.json', 'caption-overrides.json', 'meta.json', 'hyperframes.json', 'package.json', 'intake.json', 'claims-index.json', 'prospect.json', '.hyperframes/caption-skin.html'];

export function portraitStoryboard(text) {
  const t = String(text ?? '');
  const fm = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const line = `format: ${PORTRAIT.width}x${PORTRAIT.height}`;
  if (!fm) return `---\n${line}\n---\n\n${t}`;
  const body = /^format:.*$/m.test(fm[1]) ? fm[1].replace(/^format:.*$/m, line) : `${line}\n${fm[1]}`;
  return t.replace(fm[0], fm[0].replace(fm[1], body));
}

export function portraitFrameHtml(html, decls) {
  let out = putBack(decls ?? [], html).html;
  out = out.replace(/<[a-z][\w-]*\b[^>]*\bdata-composition-id\s*=[^>]*>/gi, (tag) => tag
    .replace(/\bdata-width\s*=\s*"\d+"/, `data-width="${PORTRAIT.width}"`)
    .replace(/\bdata-height\s*=\s*"\d+"/, `data-height="${PORTRAIT.height}"`));
  out = out.replace(/<video\b(?:[^>"']|"[^"]*"|'[^']*')*\bdata-frame-video\s*=\s*"approved"(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => {
    const decl = /\bdata-frame-video-portrait\s*=\s*"\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*"/.exec(tag);
    const [x, y, w, h] = decl ? decl.slice(1, 5) : ['0', '0', String(PORTRAIT.width), String(PORTRAIT.height)];
    return tag
      .replace(/\bdata-frame-video-x\s*=\s*"[^"]*"/, `data-frame-video-x="${x}"`)
      .replace(/\bdata-frame-video-y\s*=\s*"[^"]*"/, `data-frame-video-y="${y}"`)
      .replace(/\bdata-frame-video-width\s*=\s*"[^"]*"/, `data-frame-video-width="${w}"`)
      .replace(/\bdata-frame-video-height\s*=\s*"[^"]*"/, `data-frame-video-height="${h}"`)
      .replace(/\bdata-frame-video-fit\s*=\s*"[^"]*"/, 'data-frame-video-fit="cover"');
  });
  return out;
}

function linkOrCopy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try { fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); }
}
function copyTreeWith(srcDir, dstDir, fileFn) {
  if (!exists(srcDir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, e.name), d = path.join(dstDir, e.name);
    if (e.isDirectory()) n += copyTreeWith(s, d, fileFn);
    else if (e.isFile()) { fs.mkdirSync(dstDir, { recursive: true }); fileFn(s, d, e.name); n += 1; }
  }
  return n;
}

export function buildPortraitProject(ctx, { dryRun = false } = {}) {
  const dir = ctx.p(...PORTRAIT.dir);
  if (dryRun) return { dir, notes: [`9:16: would build the portrait working copy in ${path.relative(ctx.project, dir)}`] };
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const rel of PORTRAIT_COPY) if (exists(ctx.p(rel))) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(ctx.p(rel), path.join(dir, rel)); }
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), portraitStoryboard(readText(ctx.p('STORYBOARD.md'))));
  const decls = readJson(ctx.p(...FRAME_VIDEOS_FILE))?.frames ?? {};
  let reflowed = 0;
  const comps = copyTreeWith(ctx.p('compositions'), path.join(dir, 'compositions'), (src, dst, name) => {
    if (path.basename(path.dirname(src)) === 'frames' && /\.html?$/i.test(name)) { fs.writeFileSync(dst, portraitFrameHtml(fs.readFileSync(src, 'utf8'), decls[name])); reflowed += 1; }
    else if (!(name === 'captions.html' && path.dirname(src) === ctx.p('compositions'))) fs.copyFileSync(src, dst);
  });
  const media = copyTreeWith(ctx.p('assets'), path.join(dir, 'assets'), (src, dst) => linkOrCopy(src, dst));
  if (exists(ctx.p('capture'))) copyTreeWith(ctx.p('capture'), path.join(dir, 'capture'), (src, dst) => linkOrCopy(src, dst));
  if (exists(ctx.p('node_modules'))) fs.symlinkSync(fs.realpathSync(ctx.p('node_modules')), path.join(dir, 'node_modules'));
  return { dir, notes: [`9:16: portrait working copy ${path.relative(ctx.project, dir)} — ${reflowed} frame(s) reflowed, ${comps} composition file(s), ${media} asset(s) linked`] };
}

export function portraitContext(ctx) {
  const dir = ctx.p(...PORTRAIT.dir);
  const p = (...s) => path.join(dir, ...s);
  const storyboardText = readText(p('STORYBOARD.md'));
  return { ...ctx, project: dir, p, storyboardText, storyboard: parseStoryboard(storyboardText), formats: [PORTRAIT.key], variant: PORTRAIT.key, parent: ctx };
}

export const COST_ANCHORS = Object.freeze({ economy: 15, 'all-sonnet': 15, 'opus-orchestrator': 22, 'all-opus': 36 });
export const COST_CEILING_USD = 25;

const COST_RUNS = Object.freeze({
  'opus-orchestrator': Object.freeze([
    Object.freeze({ run: 'GS-01 marketing', frames: 12, usd: 18.13 }),
    Object.freeze({ run: 'GS-02 investors', frames: 13, usd: 17.13 }),
    Object.freeze({ run: 'GS-03 marketing', frames: 11, usd: 19.15 }),
    Object.freeze({ run: 'GS-02 sales (revision round + re-render)', frames: 12, usd: 30.88 }),
  ]),
});
const COST_RULE = (anchor, frames, critics = 4, revisions = 1) => anchor * (0.2 + 0.6 * (frames / 8) + 0.2 * (critics / 4)) * (1 + 0.35 * Math.max(0, revisions - 1));
const median = (xs) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const COST_CALIBRATION = Object.freeze(Object.fromEntries(Object.entries(COST_RUNS).map(([profile, runs]) => {
  const ratios = runs.map((r) => r.usd / COST_RULE(COST_ANCHORS[profile], r.frames));
  return [profile, Object.freeze({ factor: Math.round(median(ratios) * 100) / 100, spread: [Math.round(Math.min(...ratios) * 100) / 100, Math.round(Math.max(...ratios) * 100) / 100], measured: '2026-09-27', runs: Object.freeze(runs.map((r) => `${r.run}: ${r.frames} frames, $${r.usd}`)) })];
})));

export function estimateCost({ frames, critics = 4, revisions = 1, profile = 'opus-orchestrator' }) {
  const anchor = COST_ANCHORS[profile] ?? COST_ANCHORS['opus-orchestrator'];
  const rule = COST_RULE(anchor, frames, critics, revisions);
  const cal = COST_CALIBRATION[profile] ?? null;
  const usd = rule * (cal?.factor ?? 1);
  const round = (v) => Math.round(v * 100) / 100;
  return { usd: round(usd), rule_usd: round(rule), calibration: cal ? { factor: cal.factor, spread: [...cal.spread], measured: cal.measured, runs: [...cal.runs] } : null, profile, frames, critics, revisions, anchor_usd: anchor, ceiling_usd: COST_CEILING_USD, over_ceiling: usd > COST_CEILING_USD, rule: 'anchor × (0.2 + 0.6·frames/8 + 0.2·critics/4) × (1 + 0.35·(revisions−1)) — scaling; × the measured calibration' };
}

export function actualFromClaudeResult(j) {
  const u = j?.usage ?? {};
  return { usd: j?.total_cost_usd ?? j?.cost_usd ?? null, input: u.input_tokens ?? null, output: u.output_tokens ?? null, cache_read: u.cache_read_input_tokens ?? null, cache_write: u.cache_creation_input_tokens ?? null, turns: j?.num_turns ?? null, duration_s: j?.duration_ms != null ? Math.round(j.duration_ms / 100) / 10 : null, source: 'claude -p --output-format json' };
}

export const PROJECT_GITIGNORE = ['node_modules/', '*.mp4', '*.mov', '*.webm', '*.wav', '*.mp3', '*.m4a', 'snapshots/', 'QA/frames/', 'QA/*.png', '.hyperframes/anim-map/', '.media/capture/*.jpg', '.media/capture/*.png'];
export const VERSIONED_STAGES = ['verify', 'render', 'deliver'];

function git(cwd, args) { return spawnSync('git', args, { cwd, encoding: 'utf8' }); }
function realpath(p) { try { return fs.realpathSync(p); } catch { return path.resolve(p); } }

export function repoState(project) {
  const r = git(project, ['rev-parse', '--show-toplevel']);
  if (r.status !== 0) return { kind: 'none', top: null };
  const top = realpath(r.stdout.trim());
  return { kind: top === realpath(project) ? 'own' : 'nested', top };
}

export function ignoredBy(top, dir) {
  return git(top, ['check-ignore', '-q', path.relative(top, realpath(dir)) || '.']).status === 0;
}

export function ensureProjectRepo(project, { dryRun = false } = {}) {
  const st = repoState(project);
  if (st.kind === 'own') return 'versions: project repository present';
  if (st.kind === 'nested' && !ignoredBy(st.top, project)) return `versions: the project sits inside ${st.top} — no repository of its own, version commits are skipped`;
  if (dryRun) return 'versions: would git init the project';
  const r = git(project, ['init', '-q']);
  if (r.status !== 0) return `warning: versions: git init failed — ${(r.stderr || '').trim()}`;
  const gi = path.join(project, '.gitignore');
  if (!exists(gi)) fs.writeFileSync(gi, `# power-presentation: media stay out of history,.media/manifest.jsonl pins them\n${PROJECT_GITIGNORE.join('\n')}\n`);
  return 'versions: git init +.gitignore (media pinned by the ledger, not committed)';
}

export function requestText(ctx, opts) {
  const raw = opts.request ?? ctx.intake?.arguments_raw ?? null;
  const text = (Array.isArray(raw) ? raw.join(' ') : String(raw ?? '')).replace(/\s+/g, ' ').trim();
  return (text || 'render').slice(0, 72);
}

export function commitVersion(ctx, opts, stage) {
  const st = repoState(ctx.project);
  if (st.kind !== 'own') return `versions: not committed — ${st.kind === 'nested' ? `project inside ${st.top}` : 'no repository (run init)'}`;
  const version = ctx.storyboard?.globals?.version ?? 'v1';
  const add = git(ctx.project, ['add', '-A']);
  if (add.status !== 0) return `warning: versions: git add failed — ${(add.stderr || '').trim()}`;
  if (git(ctx.project, ['diff', '--cached', '--quiet']).status === 0) return `versions: ${stage} — nothing new to commit`;
  const msg = `${version}: ${requestText(ctx, opts)}`;
  const c = git(ctx.project, ['commit', '-q', '-m', msg, '-m', `gate passed: ${stage} (scripts/render-path.mjs)`]);
  if (c.status !== 0) return `warning: versions: git commit failed — ${(c.stderr || c.stdout || '').trim()}`;
  const sha = git(ctx.project, ['rev-parse', '--short', 'HEAD']).stdout.trim();
  return `versions: ${sha} "${msg}" (${stage})`;
}

function sha256Of(file) { try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return null; } }

export function approveVersion(ctx, opts, now = new Date().toISOString()) {
  const sbFile = ctx.p('STORYBOARD.md');
  const text = readText(sbFile);
  if (text === null) return { ok: false, exit: 3, reason: 'STORYBOARD.md missing — nothing to approve' };
  const version = ctx.storyboard?.globals?.version ?? 'v1';
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let next;
  if (!fm) next = `---\napproved: ${version}\n---\n\n${text}`;
  else if (/^approved:.*$/m.test(fm[1])) next = text.replace(fm[0], fm[0].replace(/^approved:.*$/m, `approved: ${version}`));
  else next = text.replace(fm[0], fm[0].replace(/\r?\n---$/, `\napproved: ${version}\n---`));
  const manifest = (readText(ctx.p('renders', 'manifest.json')) ?? '').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const last = [...manifest].reverse().find((l) => l.status === 'ok' && l.version === version) ?? null;
  const record = {
    version, at: now, by: opts.approver ?? 'user', request: requestText(ctx, opts),
    storyboard_sha256: crypto.createHash('sha256').update(next).digest('hex'),
    index_sha256: sha256Of(ctx.p('index.html')),
    master_sha256: last?.sha256?.['16:9'] ?? null,
  };
  const notes = [`approved ${version}: storyboard ${record.storyboard_sha256.slice(0, 12)}, index ${record.index_sha256?.slice(0, 12) ?? '—'}, master ${record.master_sha256?.slice(0, 12) ?? 'not rendered yet'} → renders/approvals.jsonl`];
  if (!opts.dryRun) {
    fs.writeFileSync(sbFile, next);
    fs.mkdirSync(ctx.p('renders'), { recursive: true });
    fs.appendFileSync(ctx.p('renders', 'approvals.jsonl'), `${JSON.stringify(record)}\n`);
    notes.push(commitVersion(ctx, opts, 'approve'));
  }
  return { ok: true, exit: 0, notes, approval: record };
}

export function commentFrame(ctx, opts, now = new Date().toISOString()) {
  const n = Number(String(opts.frame).replace(/^0+(?=\d)/, ''));
  const frame = (ctx.storyboard?.frames ?? []).find((f) => f.number === n);
  if (!frame) return { ok: false, exit: 3, reason: `STORYBOARD.md has no frame ${opts.frame} (frames: ${(ctx.storyboard?.frames ?? []).map((f) => f.number).join(', ') || 'none'})` };
  const version = ctx.storyboard?.globals?.version ?? 'v1';
  const manifest = (readText(ctx.p('renders', 'manifest.json')) ?? '').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const last = [...manifest].reverse().find((l) => l.status === 'ok') ?? null;
  const comment = {
    version, frame: n, frame_id: frameIdOf(frame), text: String(opts.text), by: opts.approver ?? 'user', at: now, status: 'open',
    storyboard_sha256: sha256Of(ctx.p('STORYBOARD.md')), index_sha256: sha256Of(ctx.p('index.html')), master_sha256: last?.sha256?.['16:9'] ?? null, master_version: last?.version ?? null,
  };
  if (!opts.dryRun) { fs.mkdirSync(ctx.p('renders'), { recursive: true }); fs.appendFileSync(ctx.p('renders', 'comments.jsonl'), `${JSON.stringify(comment)}\n`); }
  return { ok: true, exit: 0, notes: [`comment on frame ${n} (${comment.frame_id}, ${version}) → renders/comments.jsonl: "${comment.text.slice(0, 80)}"`], comment };
}

export function frameComments(ctx) {
  return (readText(ctx.p('renders', 'comments.jsonl')) ?? '').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export const EDIT_SCOPE_EXEMPT = Object.freeze(['renders/edit-scope.json', '.hyperframes/pp-stages.json', '.hyperframes/progress.json', '.hyperframes/tokens.json', '.media/egress.jsonl']);

export function editScopeProblems(project) {
  if (repoState(project).kind !== 'own') return [];
  const out = (args) => git(project, args).stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  const changed = [...new Set([...out(['diff', '--name-only', 'HEAD']), ...out(['ls-files', '--others', '--exclude-standard'])])].filter((f) => !EDIT_SCOPE_EXEMPT.includes(f) && !/^\.hyperframes\/progress\.json\.\d+\.tmp$/.test(f));
  if (!changed.length) return [];
  const scope = readJson(path.join(project, 'renders', 'edit-scope.json'));
  if (!Array.isArray(scope?.files)) return [`uncommitted changes and no renders/edit-scope.json — run verify / approve (each commits v<N>) or declare {"version":"v<N>","files":[…]} first. Changed: ${changed.join(', ')}`];
  const outside = changed.filter((f) => !scope.files.includes(f));
  return outside.length ? [`git diff is wider than renders/edit-scope.json — outside the declared set: ${outside.join(', ')}`] : [];
}

const STAGE_FNS = { init: stageInit, packets: stagePackets, audio: stageAudio, frames: (ctx) => stageFrames(ctx), assemble: stageAssemble, verify: stageVerify, preflight: stagePreflight, render: stageRender, deliver: stageDeliver };
const RUN_ORDER = ['audio', 'packets', 'frames', 'assemble', 'verify', 'render', 'deliver'];

export function runCommand(opts, { env = process.env, home = os.homedir(), stderr = process.stderr, now = Date.now } = {}) {
  const ctx = projectContext(opts, env, home);
  const log = (s) => stderr.write(`render-path: ${s}\n`);
  const strace = spawnSync('strace', ['-V'], { encoding: 'utf8' }).status === 0;
  const audit = strace && (opts.auditNetwork || ctx.privacy === 'local');
  if ((opts.auditNetwork || ctx.privacy === 'local') && !strace) log('network audit: strace not installed — connects are not observed (relies on the declared egress only)');
  const run = makeRunner({ dryRun: opts.dryRun, log: (s) => stderr.write(`  ${s}\n`), audit });
  const ledger = new StageLedger(ctx.stagesFile);
  if (opts.command === 'status') return { exit: 0, result: statusReport(ctx) };
  if (opts.command === 'profile') return { exit: 0, result: runProfile({ intake: ctx.intake }) };
  if (opts.command === 'cost') {
    const file = ctx.p('.hyperframes', 'tokens.json');
    const cur = readJson(file) ?? { schema: 'power-presentation/tokens@0.1' };
    if (opts.estimate || !cur.estimate) {
      const rp = runProfile({ intake: ctx.intake });
      const e = estimateCost({ frames: ctx.storyboard.frames.length, critics: rp.critic === 'off' ? 0 : 4, profile: opts.profile ?? rp.model_mix });
      cur.estimate = { ...e, printed_before_dispatch: true };
      cur.model_mix = { profile: e.profile, roles: rp.roles, critic: rp.critic };
      log(`cost estimate: ~$${e.usd} for ${e.frames} frame(s), ${e.critics} critics, ${e.revisions} revision round(s) — ${e.profile}${e.calibration ? ` (rule $${e.rule_usd} × ${e.calibration.factor}, measured ${e.calibration.measured}; runs so far ×${e.calibration.spread[0]}–${e.calibration.spread[1]}, up to ~$${Math.round(e.rule_usd * e.calibration.spread[1])})` : ' (uncalibrated rule)'}; ceiling $${e.ceiling_usd}${e.over_ceiling ? ' — OVER the default ceiling' : ''}`);
    }
    if (opts.actual) {
      const j = readJson(path.resolve(opts.actual));
      if (!j) return { exit: 1, result: { command: 'cost', stopped_at: 'cost', reason: `--actual ${opts.actual}: not JSON` } };
      cur.actual = actualFromClaudeResult(j);
      log(`cost actual: $${cur.actual.usd ?? '?'} (${cur.actual.input ?? '?'} in / ${cur.actual.output ?? '?'} out tokens, ${cur.actual.turns ?? '?'} turns, ${cur.actual.duration_s ?? '?'} s)`);
    }
    if (!opts.dryRun) writeJson(file, cur);
    return { exit: 0, result: { command: 'cost', tokens: cur } };
  }
  if (opts.command === 'manifest') {
    const rows = runNetworkManifest(ctx);
    for (const r of rows) log(`  ${r.host.padEnd(28)} ${r.stage} — ${r.purpose}`);
    log(`network manifest: ${rows.length ? `${rows.length} host(s)` : 'empty — this run contacts no host'}`);
    const refuse = ctx.privacy === 'local' && rows.length > 0;
    if (refuse) log('STOP: privacy local — the manifest must be empty');
    return { exit: refuse ? 3 : 0, result: { command: 'manifest', privacy: ctx.privacy, hosts: rows, ...(refuse ? { stopped_at: 'manifest', reason: 'privacy local: the network manifest is not empty' } : {}) } };
  }
  if (opts.command === 'comment') { const c = commentFrame(ctx, opts); for (const n of c.notes ?? []) log(n); if (!c.ok) log(`STOP: ${c.reason}`); return { exit: c.exit, result: c.ok ? { command: 'comment', comment: c.comment } : { command: 'comment', stopped_at: 'comment', reason: c.reason } }; }
  if (opts.command === 'approve') { const a = approveVersion(ctx, opts); for (const n of a.notes ?? []) log(n); if (!a.ok) log(`STOP: ${a.reason}`); return { exit: a.exit, result: a.ok ? { command: 'approve', approval: a.approval } : { command: 'approve', stopped_at: 'approve', reason: a.reason } }; }
  if (opts.command === 'time') {
    if (opts.dryRun) return { exit: 0, result: { command: 'time', stage: opts.stage, mark: opts.timeMark ?? 'seconds', dry_run: true } };
    if (opts.timeMark === 'begin') {
      const b = ledger.begin(opts.stage, now());
      log(`time: ${opts.stage} begun at ${b.at}${b.replaced ? ` (restarted — the unfinished start ${b.replaced} is dropped)` : ''}`);
      return { exit: 0, result: { command: 'time', ...b } };
    }
    if (opts.timeMark === 'end') {
      const e = ledger.end(opts.stage, now());
      if (!e) { const reason = `no \`time --begin ${opts.stage}\` in ${path.relative(ctx.project, ctx.stagesFile)} — nothing to end (C5: bracket the stage, never type a number)`; log(`STOP: ${reason}`); return { exit: 3, result: { command: 'time', stopped_at: 'time', reason } }; }
      log(`time: ${opts.stage} ${e.seconds}s (stamped since ${e.began}) → ${path.relative(ctx.project, ctx.stagesFile)}`);
      return { exit: 0, result: { command: 'time', ...e, stages_s: ledger.data.stages_s } };
    }
    ledger.record(`external:${opts.stage}`, opts.seconds, true, 'reported by the orchestrator (unmeasured)', opts.stage, 'reported');
    return { exit: 0, result: { command: 'time', stage: opts.stage, seconds: opts.seconds, reported: true, stages_s: ledger.data.stages_s } };
  }
  const order = opts.command === 'run' ? RUN_ORDER : [opts.command];
  const results = [];
  for (const name of order) {
    const t0 = Date.now();
    log(`stage ${name} …`);
    let res;
    try { res = STAGE_FNS[name](ctx, opts, run); } catch (err) { res = { ok: false, exit: 1, reason: err.message }; }
    const seconds = (Date.now() - t0) / 1000;
    if (audit) {
      const fresh = run.observed.splice(0);
      if (fresh.length && !opts.dryRun) appendEgress(ctx.project, fresh.map((c) => ({ at: new Date().toISOString(), host: `${c.addr}:${c.port}`, purpose: `observed connect() by ${c.cmd} (strace audit)`, by: `render-path ${name}`, observed: true })));
      const quiet = [...new Map(run.probes.splice(0).map((c) => [`${c.addr}:${c.port}`, c])).values()];
      (res.notes ??= []).push(`network audit: ${fresh.length ? `${fresh.length} external connect(s) — ${fresh.map((c) => `${c.addr}:${c.port} (${c.cmd})`).join(', ')}` : 'no external connect'}${quiet.length ? `; ${quiet.length} UDP route probe(s) with no packet sent, not egress — ${quiet.map((c) => `${c.addr}:${c.port} (${c.cmd})`).join(', ')}` : ''}`);
      if (fresh.length && ctx.privacy === 'local' && res.ok) res = { ...res, ok: false, exit: 3, reason: `privacy local: external connect(s) observed during ${name}: ${fresh.map((c) => `${c.addr}:${c.port} (${c.cmd})`).join(', ')}` };
    }
    if (!opts.dryRun && name !== 'frames') ledger.record(name, seconds, res.ok, res.reason ?? (res.notes ?? []).join(' | '));
    if (!opts.dryRun && res.ok && name === 'packets' && !ledger.data.pending?.frames) ledger.begin('frames', now());
    if (!opts.dryRun && res.ok && name === 'assemble' && ledger.data.pending?.frames) ledger.end('frames', now());
    for (const n of res.notes ?? []) log(`  ${n}`);
    if (res.reason) log(`  ${res.ok ? 'note' : 'STOP'}: ${res.reason}`);
    log(`stage ${name} ${res.ok ? 'ok' : `FAILED (exit ${res.exit})`} (${seconds.toFixed(1)}s)`);
    results.push({ stage: name, ok: res.ok, exit: res.exit, seconds: round1(seconds), reason: res.reason ?? null, notes: res.notes ?? [] });
    if (!res.ok) return { exit: res.exit, result: { command: opts.command, stages: results, stopped_at: name, reason: res.reason } };
    if (VERSIONED_STAGES.includes(name) && !opts.dryRun) { const v = commitVersion(ctx, opts, name); log(`  ${v}`); results.at(-1).notes.push(v); }
    if (name === 'audio') { ctx.storyboardText = readText(ctx.p('STORYBOARD.md')); ctx.storyboard = parseStoryboard(ctx.storyboardText); }
  }
  return { exit: 0, result: { command: opts.command, stages: results } };
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { process.stderr.write(`render-path: ${err.message}\n\n${USAGE}`); return 2; }
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  let r;
  try { r = runCommand(opts); } catch (err) { process.stderr.write(`render-path: ${err.message}\n`); return 1; }
  if (opts.json || opts.command === 'status' || opts.command === 'profile') process.stdout.write(`${JSON.stringify(r.result, null, 2)}\n`);
  else if (r.result.stopped_at) process.stdout.write(`render-path ${opts.command}: stopped at ${r.result.stopped_at} — ${r.result.reason}\n`);
  else process.stdout.write(`render-path ${opts.command}: ok (${r.result.stages?.map((s) => `${s.stage} ${s.seconds}s`).join(', ') ?? ''})\n`);
  return r.exit;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
