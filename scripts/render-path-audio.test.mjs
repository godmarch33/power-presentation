import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DRIFT_DROPPED, mergeStoredLines, ttsLineKey, ttsLineStore, TTS_CACHE_FILE, TTS_CACHE_SCHEMA, TTS_SPEED, applyCamera, makeRunner, parseArgs, parseStoryboard, projectContext, runCommand,
  runNetworkManifest, scriptFrameMap, scriptLines, stageAudio, stageCamera, stageDeliver, targetLufsFor, ttsCacheCheck, ttsFingerprint,
  MUSIC_ONLY_LUFS,
} from './render-path.mjs';
import { DOCTOR_SCHEMA, networkManifest } from './toolchain.mjs';

const QUIET = { nice: null, cpuset: null, warnings: [] };

const STORYBOARD = `---
duration: 12s
---
## Frame 1 — Hook
- duration: 3s
- voiceover: "Close the books."
## Frame 2 — Card
- duration: 3s
## Frame 3 — Lock the period (STAR)
- duration: 3s
- voiceover: "Lock the period."
## Frame 4 — End
- duration: 3s
- voiceover: "Write to us."
`;

const line = (n, label, text) => `## Line ${n} — ${label} (Frame ${n})\n\n**Delivery:** calm.\n\n    ${text}\n`;
const SCRIPT = `# SCRIPT — test\n\n**Voice:** am_michael (Kokoro)\n\n---\n\n${line(1, 'Hook', 'Close the books.')}\n${line(3, 'Lock, STAR', 'Lock the period.')}\n${line(4, 'End', 'Write to us.')}`;

test('scriptLines(): the vendor reading — a heading with anything after N inside the parentheses joins the previous line (GS02I-01)', () => {
  const bad = SCRIPT.replace('## Line 3 — Lock, STAR (Frame 3)', '## Line 3 — Lock (Frame 3, STAR)');
  const r = scriptLines(bad);
  assert.deepEqual(r.lines.map((l) => [l.frame, l.text]), [[1, 'Close the books. Lock the period.'], [4, 'Write to us.']], 'the vendor regex skips the heading, so line 3 is spoken in frame 1');
  assert.deepEqual(r.stray, [{ heading: '## Line 3 — Lock (Frame 3, STAR)', into: 1 }]);
  assert.deepEqual(scriptLines(SCRIPT).stray, [], 'tags before the parenthesis are fine');
  assert.deepEqual(scriptLines(SCRIPT).lines.map((l) => l.frame), [1, 3, 4]);
  const notes = `${line(1, 'Hook', 'A.')}\n## Notes\n\nplain prose, not spoken\n`;
  assert.deepEqual(scriptLines(notes).stray, []);
  assert.deepEqual(scriptLines(`${notes}\n    spoken by mistake\n`).stray, [{ heading: '## Notes', into: 1 }]);
  assert.deepEqual(scriptLines('## Frame 2 — Card\n\n    text\n').stray, [{ heading: '## Frame 2 — Card', into: null }], 'a storyboard-style heading is not a line');
});

test('scriptFrameMap(): SCRIPT lines map 1:1 onto the frames that carry voiceover:, else a named refusal (C2)', () => {
  const sb = parseStoryboard(STORYBOARD);
  const ok = scriptFrameMap(SCRIPT, sb);
  assert.equal(ok.ok, true, ok.reason);
  assert.deepEqual(ok.voiced, [1, 3, 4], 'frame 2 has no voiceover:');
  const merged = scriptFrameMap(SCRIPT.replace('(Frame 3)', '(Frame 3, STAR)'), sb);
  assert.equal(merged.ok, false);
  assert.deepEqual(merged.problems, ['"## Line 3 — Lock, STAR (Frame 3, STAR)" is not a line heading — its text is spoken in frame 1', 'frame(s) 3 carry voiceover: but have no SCRIPT line']);
  assert.match(merged.reason, /`## Line <N> — <label> \(Frame <N>\)`/);
  assert.match(merged.reason, /## Line 9 — Lock, STAR \(Frame 9\)/, 'the reason shows where a tag goes');
  const dup = scriptFrameMap(`${SCRIPT}\n${line(4, 'Again', 'Twice.')}`, sb);
  assert.deepEqual(dup.problems, ['frame 4 has 2 SCRIPT lines']);
  const extra = scriptFrameMap(`${SCRIPT}\n${line(2, 'Card', 'Not voiced in the storyboard.')}`, sb);
  assert.deepEqual(extra.problems, ['SCRIPT line(s) for frame(s) 2, which carry no voiceover: in STORYBOARD.md']);
  const empty = scriptFrameMap(SCRIPT.replace('    Write to us.\n', ''), sb);
  assert.deepEqual(empty.problems, ['"## Line 4 — End (Frame 4)" has no indented spoken text — the vendor drops the line', 'frame(s) 4 carry voiceover: but have no SCRIPT line']);
  const silent = parseStoryboard(STORYBOARD.replace(/- voiceover: .*\n/g, '').replace('## Frame 4 — End\n- duration: 3s\n', '## Frame 4 — End\n- duration: 3s\n- voiceover: ""\n'));
  assert.equal(scriptFrameMap('# SCRIPT\n\nno lines yet\n', silent).ok, true, 'no lines, no voiced frames: nothing to map');
  for (const none of ['none', '—', '(silent)', 'None.', '(none)']) {
    assert.deepEqual(scriptFrameMap(SCRIPT, parseStoryboard(STORYBOARD.replace('## Frame 2 — Card\n- duration: 3s\n', `## Frame 2 — Card\n- duration: 3s\n- voiceover: ${none}\n`))).voiced, [1, 3, 4], `voiceover: ${none} is no line`);
  }
});

const STUB_AUDIO = `import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };
if (argv[0] === 'fetch-sfx' || argv[0] === 'sync-durations') process.exit(0);
const dir = flag('hyperframes');
fs.appendFileSync(path.join(dir, 'engine-calls.log'), (flag('voice') ?? '') + '\\n');
const voices = [];
let cur = null;
for (const l of fs.readFileSync(flag('script'), 'utf8').split('\\n')) {
  const h = l.match(/^#{2,3}\\s+.*?\\(frame\\s+(\\d+)\\)/i);
  if (h) { cur = { frame: Number(h[1]), text: '' }; voices.push(cur); continue; }
  const m = cur && l.match(/^(?: {4,}|\\t)(.+)$/);
  if (m) cur.text += m[1];
}
fs.mkdirSync(path.join(dir, 'assets', 'voice'), { recursive: true });
const out = voices.filter((v) => v.text).map((v) => {
  const rel = 'assets/voice/' + String(v.frame).padStart(2, '0') + '.wav';
  fs.writeFileSync(path.join(dir, rel), 'RIFF ' + v.text + ' ' + Date.now());
  return { frame: v.frame, path: rel, duration_s: 0.25 * v.text.split(' ').length, words: v.text.split(' ').map((t, i) => ({ id: 'w' + i, text: t, start: i * 0.25, end: i * 0.25 + 0.2 })) };
});
fs.writeFileSync(flag('out'), JSON.stringify({ bgm: null, bgm_pending: false, voices: out, sfx: [] }, null, 2));
`;

function stubProject({ script = SCRIPT, storyboard = STORYBOARD } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-audio-'));
  const skills = path.join(root, 'skills');
  const wf = path.join(skills, 'product-launch-video');
  fs.mkdirSync(path.join(wf, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(wf, 'SKILL.md'), '# stub\n');
  fs.writeFileSync(path.join(wf, 'scripts', 'audio.mjs'), STUB_AUDIO);
  for (const s of ['hyperframes', 'hyperframes-animation', 'media-use']) fs.mkdirSync(path.join(skills, s));
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'STORYBOARD.md'), storyboard);
  if (script != null) fs.writeFileSync(path.join(project, 'SCRIPT.md'), script);
  const opts = parseArgs(['audio', '--project', project, '--workflow-dir', wf, '--allow-drift', '--mode', 'investors', '--no-sfx']);
  const context = () => ({ ...projectContext(opts), kokoro: { ok: true } });
  const calls = () => (fs.existsSync(path.join(project, 'engine-calls.log')) ? fs.readFileSync(path.join(project, 'engine-calls.log'), 'utf8').split('\n').filter(Boolean).length : 0);
  return { root, project, opts, context, calls, run: makeRunner({ log: () => {}, throttle: QUIET }), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('stageAudio(): a SCRIPT heading the vendor cannot read stops the stage with exit 3 before the engine runs (GS02I-01)', () => {
  const s = stubProject({ script: SCRIPT.replace('(Frame 3)', '(Frame 3, STAR)') });
  try {
    const r = stageAudio(s.context(), s.opts, s.run);
    assert.equal(r.ok, false);
    assert.equal(r.exit, 3);
    assert.match(r.reason, /is not a line heading — its text is spoken in frame 1/);
    assert.equal(s.calls(), 0, 'no TTS time spent');
    assert.equal(fs.existsSync(path.join(s.project, 'audio_meta.json')), false);
    assert.equal(fs.readFileSync(path.join(s.project, 'STORYBOARD.md'), 'utf8'), STORYBOARD, 'no window grown');
  } finally { s.cleanup(); }
});

test('stageAudio(): an unchanged SCRIPT.md reuses the last synthesis — no second engine call; a changed line, voice or wav re-synthesises (C4, GS02I-14)', () => {
  const s = stubProject();
  const cacheFile = () => path.join(s.project, ...TTS_CACHE_FILE);
  try {
    const first = stageAudio(s.context(), s.opts, s.run);
    assert.equal(first.ok, true, first.reason);
    assert.equal(s.calls(), 1);
    assert.match(first.notes.join('\n'), /audio: synthesised \(no previous synthesis\) → \.media\/tts-cache\.json/);
    const cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
    assert.equal(cache.schema, TTS_CACHE_SCHEMA);
    assert.deepEqual(cache.inputs.lines.map((l) => l.frame), [1, 3, 4]);
    assert.equal(cache.inputs.voice, 'am_michael');
    assert.equal(cache.inputs.speed, TTS_SPEED);
    assert.deepEqual(cache.wavs.map((w) => w.path), ['assets/voice/01.wav', 'assets/voice/03.wav', 'assets/voice/04.wav']);
    fs.rmSync(path.join(s.project, 'audio_meta.json'));
    const second = stageAudio(s.context(), s.opts, s.run);
    assert.equal(second.ok, true, second.reason);
    assert.equal(s.calls(), 1, 'no second synthesis');
    assert.match(second.notes.join('\n'), /audio: 3 line\(s\) cached/);
    const meta = JSON.parse(fs.readFileSync(path.join(s.project, 'audio_meta.json'), 'utf8'));
    assert.deepEqual(meta.voices.map((v) => v.frame), [1, 3, 4]);
    assert.equal(meta.voice, 'am_michael', 'render-path still stamps its fields on the reused meta');
    fs.appendFileSync(path.join(s.project, 'assets', 'voice', '03.wav'), 'x');
    const tampered = stageAudio(s.context(), s.opts, s.run);
    assert.equal(s.calls(), 2);
    assert.match(tampered.notes.join('\n'), /synthesised \(assets\/voice\/03\.wav changed since it was synthesised\)/);
    const before01 = fs.readFileSync(path.join(s.project, 'assets', 'voice', '01.wav'), 'utf8');
    fs.writeFileSync(path.join(s.project, 'SCRIPT.md'), SCRIPT.replace('    Write to us.', '    Write to us today.'));
    const edited = stageAudio(s.context(), s.opts, s.run);
    assert.equal(s.calls(), 3);
    assert.match(edited.notes.join('\n'), /audio: 1 line\(s\) synthesised \(frames 4\), 2 reused from the per-line store/);
    const partial = fs.readFileSync(path.join(s.project, '.hyperframes', 'script.partial.md'), 'utf8');
    assert.match(partial, /\(Frame 4\)\n\n {4}Write to us today\./); assert.ok(!/\(Frame 1\)|\(Frame 3\)/.test(partial), partial);
    assert.equal(fs.readFileSync(path.join(s.project, 'assets', 'voice', '01.wav'), 'utf8'), before01, 'the stored line, not a new synthesis');
    const merged = JSON.parse(fs.readFileSync(path.join(s.project, 'audio_meta.json'), 'utf8'));
    assert.deepEqual(merged.voices.map((v) => [v.frame, v.path]), [[1, 'assets/voice/01.wav'], [3, 'assets/voice/03.wav'], [4, 'assets/voice/04.wav']]);
    assert.equal(merged.voices[2].words.length, 4, 'the new line keeps its own words');
    stageAudio(s.context(), s.opts, s.run);
    assert.equal(s.calls(), 3, 'the new script is cached in turn');
    const other = parseArgs(['audio', '--project', s.project, '--workflow-dir', s.opts.workflowDir, '--allow-drift', '--mode', 'investors', '--no-sfx', '--voice', 'af_heart']);
    stageAudio({ ...projectContext(other), kokoro: { ok: true } }, other, s.run);
    assert.equal(s.calls(), 4);
    assert.equal(fs.readFileSync(path.join(s.project, 'engine-calls.log'), 'utf8').trim().split('\n').at(-1), 'af_heart');
  } finally { s.cleanup(); }
});

test('ttsFingerprint() / ttsCacheCheck(): the fingerprint covers provider, voice, speed, line texts and the bed request', () => {
  const lines = [{ frame: 1, text: 'A.' }];
  const base = ttsFingerprint({ provider: 'kokoro', voice: 'am_michael', lines });
  assert.equal(base.sha256, ttsFingerprint({ provider: 'kokoro', voice: 'am_michael', lines: [{ frame: 1, text: 'A.', heading: 'ignored' }] }).sha256, 'only frame + text count');
  for (const change of [{ provider: 'elevenlabs' }, { voice: 'af_heart' }, { speed: 1.1 }, { lines: [{ frame: 1, text: 'B.' }] }, { lines: [{ frame: 2, text: 'A.' }] }, { bgm: { mode: 'none' } }]) {
    assert.notEqual(ttsFingerprint({ provider: 'kokoro', voice: 'am_michael', lines, ...change }).sha256, base.sha256, JSON.stringify(change));
  }
  assert.deepEqual(ttsCacheCheck(null, base.sha256, os.tmpdir()), { ok: false, reason: 'no previous synthesis' });
  assert.deepEqual(ttsCacheCheck({ schema: TTS_CACHE_SCHEMA, fingerprint: 'other', meta: { voices: [] }, wavs: [] }, base.sha256, os.tmpdir()), { ok: false, reason: 'SCRIPT.md lines, voice or speed changed' });
  assert.deepEqual(ttsCacheCheck({ schema: TTS_CACHE_SCHEMA, fingerprint: base.sha256, meta: { voices: [{}] }, wavs: [] }, base.sha256, os.tmpdir()), { ok: false, reason: 'the cache does not list every wav' });
  assert.deepEqual(ttsCacheCheck({ schema: TTS_CACHE_SCHEMA, fingerprint: base.sha256, meta: { voices: [{}] }, wavs: [{ path: 'nope/01.wav', sha256: 'x' }] }, base.sha256, os.tmpdir()), { ok: false, reason: 'nope/01.wav missing' });
});

test('applyCamera() / stageCamera(): a frame that declares capture_drift but has no <id>.autozoom.json is a visible warning (C3)', () => {
  const drift = { x: 0.8, y: 0.4, scale: 2, t0: 3, t1: 6 };
  const r = applyCamera('<html></html>', [{ id: '01-hook', start: 0, plan: null }, { id: '02-submit', start: 3, plan: null, drift }]);
  assert.deepEqual(r.skipped, [{ id: '02-submit', reason: DRIFT_DROPPED, drift: true }], 'no drift, no plan → skipped silently as before');
  assert.match(DRIFT_DROPPED, /--events \/dev\/null --manifest <capture>\/capture-manifest\.json/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-drift-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    const sb = parseStoryboard('## Frame 1 — Hook\n- duration: 3s\n## Frame 2 — Submit\n- src: compositions/frames/02-submit.html\n- duration: 7s\n- capture_window: 1.0-4.0\n- capture_hold: 4\n- capture_drift: 0.80,0.40 2.0 @ 3.0-6.0\n');
    const ctx = { p: (...a) => path.join(dir, ...a), storyboard: sb };
    const cam = stageCamera(ctx, { dryRun: false });
    assert.equal(cam.ok, true);
    assert.equal(cam.notes[0], 'camera: nothing to apply (no <frame>.autozoom.json next to a hoisted video)');
    assert.match(cam.notes[1], /^warning: camera: 02-submit — capture_drift declared but no 02-submit\.autozoom\.json — drift dropped; write the sidecar with autozoom --events \/dev\/null/);
    fs.mkdirSync(path.join(dir, 'compositions', 'frames'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'compositions', 'frames', '02-submit.autozoom.json'), JSON.stringify({ tracks: { '16:9': { keyframes: [] } } }));
    const withPlan = stageCamera(ctx, { dryRun: false });
    assert.equal(withPlan.notes.length, 1);
    assert.match(withPlan.notes[0], /02-submit: no hoisted video/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('parseArgs(time): --begin/--end <stage> (or --stage <s> --begin), design/story aliases, exactly one mark', () => {
  assert.deepEqual([parseArgs(['time', '--end', 'frames']).stage, parseArgs(['time', '--end', 'frames']).command], ['frames', 'time']);
  assert.equal(parseArgs(['--begin', 'frames', 'time']).command, 'time');
  const t = (...a) => parseArgs(['time', ...a, '--project', '.']);
  assert.deepEqual([t('--begin', 'intake').timeMark, t('--begin', 'intake').stage], ['begin', 'intake']);
  assert.deepEqual([t('--stage', 'capture', '--end').timeMark, t('--stage', 'capture', '--end').stage], ['end', 'capture']);
  assert.equal(t('--end', 'story').stage, 'storyboard');
  assert.equal(t('--begin', 'design').stage, 'design_spec');
  assert.equal(t('--stage', 'inspect', '--seconds', '29').seconds, 29);
  assert.throws(() => t('--begin', 'nope'), /--stage must be one of/);
  assert.throws(() => t('--stage', 'intake'), /time needs one of --begin/);
  assert.throws(() => t('--begin', 'intake', '--seconds', '3'), /time needs one of --begin/);
  assert.throws(() => t('--begin'), /time needs one of --begin/, 'a mark without a stage');
});

test('time --begin/--end: render-path stamps the wall clock into pp-stages.json; --end without --begin exits 3; --seconds is kept as reported (C5)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-time-'));
  const sink = { write: () => true };
  let clock = Date.parse('2026-09-27T02:17:12.000Z');
  const time = (...a) => runCommand(parseArgs(['time', ...a, '--project', dir]), { stderr: sink, now: () => clock });
  const ledger = () => JSON.parse(fs.readFileSync(path.join(dir, '.hyperframes', 'pp-stages.json'), 'utf8'));
  try {
    assert.equal(time('--begin', 'intake').exit, 0);
    assert.deepEqual(ledger().pending, { intake: '2026-09-27T02:17:12.000Z' });
    clock += 49_400;
    const end = time('--end', 'intake');
    assert.equal(end.exit, 0);
    assert.deepEqual([end.result.stage, end.result.seconds], ['intake', 49.4]);
    const l = ledger();
    assert.equal(l.stages_s.intake, 49.4);
    assert.deepEqual(l.pending, {});
    assert.equal(l.runs.at(-1).source, 'stamped');
    assert.match(l.runs.at(-1).detail, /stamped by render-path/);
    assert.equal(l.reported, undefined, 'nothing reported yet');
    const again = time('--end', 'intake');
    assert.equal(again.exit, 3, 'end without begin');
    assert.match(again.result.reason, /no `time --begin intake`/);
    time('--begin', 'story'); clock += 5_000; time('--begin', 'story'); clock += 1_472_000;
    assert.equal(time('--end', 'storyboard').result.seconds, 1472);
    assert.equal(ledger().stages_s.pitch, undefined, 'pitch is not invented');
    time('--stage', 'capture', '--seconds', '29');
    const r = ledger();
    assert.equal(r.stages_s.capture, 29);
    assert.equal(r.runs.at(-1).source, 'reported');
    assert.equal(r.runs.at(-1).detail, 'reported by the orchestrator (unmeasured)');
    assert.deepEqual(r.reported, ['capture']);
    assert.equal(r.wall_s, 49.4 + 1472 + 29);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('runNetworkManifest(): a bare run directory lists the registry npx will contact; the toolchain rows show while its gate fails (C6)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-manifest-'));
  const doctor = path.join(dir, 'doctor.json');
  const opted = { HYPERFRAMES_NO_TELEMETRY: '1' };
  const local = { declared: { source: { kind: 'local', value: 'site' } } };
  const ctx = (gateOk) => {
    fs.writeFileSync(doctor, JSON.stringify({ schema: DOCTOR_SCHEMA, gate: { ok: gateOk } }));
    return { project: dir, p: (...a) => path.join(dir, ...a), intake: local, env: opted, paths: { doctor_file: doctor } };
  };
  try {
    const bare = runNetworkManifest(ctx(true));
    assert.deepEqual(bare.map((r) => [r.host, r.stage]), [['registry.npmjs.org', 'project init (npx hyperframes init, before R init links the pinned CLI)']]);
    fs.mkdirSync(path.join(dir, 'node_modules', 'hyperframes'), { recursive: true });
    assert.deepEqual(runNetworkManifest(ctx(true)), [], 'after R init: nothing to fetch');
    const first = runNetworkManifest(ctx(false));
    assert.deepEqual(first.map((r) => r.host), networkManifest().map((r) => r.host), 'a failed doctor gate lists the first-run install hosts (the .active filter used to drop them all)');
    assert.ok(first.every((r) => r.stage === 'toolchain install (first run)'));
    assert.ok(first.some((r) => r.host === 'registry.npmjs.org'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('render-path manifest: runs on a run directory that holds only intake.json; under privacy local a pending fetch refuses (C6)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-manifest-cli-'));
  const sink = { write: () => true };
  try {
    fs.writeFileSync(path.join(dir, 'intake.json'), JSON.stringify({ privacy_profile: 'local', declared: { source: { kind: 'local', value: '.' } } }));
    const r = runCommand(parseArgs(['manifest', '--project', dir]), { env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1' }, stderr: sink });
    assert.equal(r.exit, 3, 'privacy local: the manifest must be empty');
    assert.ok(r.result.hosts.some((h) => h.host === 'registry.npmjs.org' && /npx hyperframes init/.test(h.stage)));
    assert.equal(fs.existsSync(path.join(dir, 'index.html')), false, 'no scaffold needed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('targetLufsFor(): --target-lufs wins; a bed with no voice is the music-only row (−18); a voice keeps the mode row', () => {
  assert.deepEqual(targetLufsFor({ flag: -17, mode: 'marketing', bed: true }), { target: -17, row: '--target-lufs' });
  assert.deepEqual(targetLufsFor({ mode: 'marketing', bed: true }), { target: MUSIC_ONLY_LUFS, row: 'music-only cinematic hero (−18…−20)' });
  assert.equal(MUSIC_ONLY_LUFS, -18);
  assert.equal(targetLufsFor({ mode: 'investors', bed: true }).target, -18, 'the row is the mix, whatever the mode');
  assert.deepEqual(targetLufsFor({ mode: 'marketing', voices: 3, bed: true }), { target: -14, row: 'social / YouTube, VO-led (−14)' });
  assert.deepEqual(targetLufsFor({ mode: 'investors', script: true }), { target: -16, row: 'VO-led premium / investor (−16…−18)' }, 'SCRIPT.md counts as a voice before audio_meta exists');
  assert.equal(targetLufsFor({ mode: 'sales', voices: 1 }).target, -14);
  assert.equal(targetLufsFor({}).target, -14, 'no mode, no mix: the old fallback');
  assert.match(targetLufsFor({ mode: 'marketing' }).row, /QA-08 has no row/);
});

test('stageDeliver(): loudnorm, the loudness record and wowprobe\'s QA-08 all use the music-only target for a bed without VO (GS03-15)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-deliver-'));
  try {
    const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
    w('STORYBOARD.md', '---\nduration: 6s\naudience: marketing\n---\n## Frame 1 — Hero\n- duration: 6s\n');
    w('audio_meta.json', JSON.stringify({ bgm: { path: 'assets/bgm/bed.mp3', volume: 0.9 }, voices: [], sfx: [] }));
    w('renders/final/x.mp4', 'not a video');
    w('renders/manifest.json', `${JSON.stringify({ status: 'ok', formats: { '16:9': 'renders/final/x.mp4' } })}\n`);
    w('QA/wowprobe.json', JSON.stringify({ gates_failed: [], not_measured: {} }));
    w('share-copy.txt', 'copy');
    const opts = parseArgs(['deliver', '--project', dir, '--mode', 'marketing']);
    const ctx = projectContext(opts);
    const calls = [];
    const measured = { input_i: '-18.4', input_tp: '-3.1', input_lra: '5', input_thresh: '-28', target_offset: '0.2' };
    const run = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: '', stderr: args.some((a) => /^loudnorm=/.test(a)) ? JSON.stringify(measured) : '', seconds: 0 }; };
    const r = stageDeliver(ctx, opts, run);
    assert.equal(ctx.targetLufs, -14, 'the mode default at context build…');
    const loud = calls.find((c) => c.some((a) => /^loudnorm=I=/.test(a)));
    assert.match(loud.find((a) => /^loudnorm=/.test(a)), /^loudnorm=I=-18:/, '…but deliver normalises to the music-only row');
    const probe = calls.find((c) => c.some((a) => /wowprobe\.py$/.test(a)));
    assert.equal(probe[probe.indexOf('--target-lufs') + 1], '-18', 'the QA-08 gate measures against the same target');
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'renders', 'final', 'x.loudness.json'), 'utf8'));
    assert.deepEqual([rec.target_lufs, rec.target_row], [-18, 'music-only cinematic hero (−18…−20)']);
    assert.ok(r.notes.some((n) => /QA-08 row: music-only cinematic hero/.test(n)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('C12: a storyboard `music: pack:<track>` becomes the mounted bed, and the vendor never sees a retrieval query', async () => {
  const { packMusic, storyboardWithoutBed } = await import('./render-path.mjs');
  assert.equal(packMusic('pack:happy-beats-2'), 'pack:happy-beats-2');
  assert.equal(packMusic('PACK: '), 'pack:auto');
  assert.equal(packMusic('none'), null);
  assert.equal(packMusic('calm cinematic underscore'), null);
  const md = '---\nformat: 1920x1080\nmusic: pack:happy-beats-2\nduration: 60s\n---\n\n## Frame 1 — Hook\nmusic: stays in a frame body\n';
  const out = storyboardWithoutBed(md);
  assert.match(out, /^music: none$/m);
  assert.equal(out.match(/music:/g).length, 2, 'only the first (top-block) music line changes');
  assert.match(out, /music: stays in a frame body/);
});

test('mergeStoredLines(): stored lines return to their frames in audio_meta.json and in the neutral sidecar fetch-sfx rebuilds from', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-lines-'));
  try {
    fs.mkdirSync(path.join(dir, 'assets', 'voice'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets', 'voice', '01.wav'), 'RIFF one');
    const store = ttsLineStore(dir);
    const key = ttsLineKey({ provider: 'kokoro', voice: 'am_michael', text: 'Close the books.' });
    store.put(key, { path: 'assets/voice/01.wav', duration_s: 1.5, words: [{ id: 'w0', text: 'Close', start: 0, end: 0.4 }] });
    assert.equal(store.valid(key), true);
    assert.notEqual(key, ttsLineKey({ provider: 'kokoro', voice: 'af_heart', text: 'Close the books.' }), 'another voice is another line');
    fs.writeFileSync(path.join(dir, 'audio_meta.json'), JSON.stringify({ bgm: null, bgm_pending: false, voices: [{ frame: 4, path: 'assets/voice/04.wav', duration_s: 2, words: [] }], sfx: [] }));
    fs.writeFileSync(path.join(dir, 'audio_engine_meta.json'), JSON.stringify({ voices: [{ id: '04', path: 'assets/voice/04.wav', duration_s: 2, words: [] }], sfx: [], total_duration_s: 2 }));
    mergeStoredLines(dir, [{ frame: 2, key }], store);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'audio_meta.json'), 'utf8'));
    assert.deepEqual(meta.voices.map((v) => [v.frame, v.path, v.duration_s]), [[2, 'assets/voice/02.wav', 1.5], [4, 'assets/voice/04.wav', 2]]);
    assert.equal(fs.readFileSync(path.join(dir, 'assets', 'voice', '02.wav'), 'utf8'), 'RIFF one');
    const neutral = JSON.parse(fs.readFileSync(path.join(dir, 'audio_engine_meta.json'), 'utf8'));
    assert.deepEqual(neutral.voices.map((v) => v.id), ['02', '04']);
    assert.equal(neutral.total_duration_s, 3.5);
    fs.appendFileSync(path.join(dir, '.hyperframes', 'tts-lines', `${key}.wav`), 'x');
    assert.equal(ttsLineStore(dir).valid(key), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
