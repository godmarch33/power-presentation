import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MASTER, findTape, main, parseArgs, prepareTape, sizeProblem } from './record-terminal.mjs';

const TAPE = `# demo
Output demo.mp4
Output frames/          # stills
Set Width 1920
Set Height 1080
Env TOOL_BIN "__REPO__/bin"
Hide
Type 'export PATH="$TOOL_BIN:$PATH"' Enter
Show
Type "tool run"
`;

test('prepareTape(): every Output replaced by one footage.mp4 in --out, __REPO__ resolved, the size read', () => {
  const p = prepareTape(TAPE, { out: '/p/.media/capture', repo: '/repo' });
  const outputs = p.tape.split('\n').filter((l) => /^\s*Output\b/.test(l));
  assert.deepEqual(outputs, ['Output "/p/.media/capture/footage.mp4"']);
  assert.equal(p.tape.split('\n')[1], outputs[0], 'placed where the first Output was');
  assert.match(p.tape, /Env TOOL_BIN "\/repo\/bin"/);
  assert.deepEqual(p.size, { width: 1920, height: 1080 });
  assert.deepEqual(p.droppedOutputs, ['demo.mp4', 'frames/']);
  assert.match(prepareTape('Type "x"\n', { out: '/o', repo: '/r' }).tape, /^Output "\/o\/footage\.mp4"\nType/);
});

test('sizeProblem(): a tape below the 1920×1080 master (or VHS\'s 1200×600 default) is refused', () => {
  assert.equal(sizeProblem({ width: 1920, height: 1080 }), null);
  assert.match(sizeProblem({ width: 1280, height: 720 }), /capture_size_below_output: the tape renders 1280×720/);
  assert.match(sizeProblem(null), /1200×600/);
  assert.deepEqual(MASTER, { width: 1920, height: 1080 });
});

test('findTape() / parseArgs() / main(): one tape is found, none or two are usage errors; a small tape exits 3 before VHS runs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-tape-'));
  assert.match(findTape(dir).error, /no \*\.tape/);
  fs.writeFileSync(path.join(dir, 'a.tape'), 'Set Width 800\nSet Height 600\n');
  assert.equal(findTape(dir), path.join(dir, 'a.tape'));
  assert.deepEqual([parseArgs(['--repo', dir]).out, parseArgs(['--repo', dir, '--frames']).frames], [path.join(dir, '.media', 'capture'), true]);
  const errs = [];
  const orig = console.error;
  console.error = (s) => errs.push(String(s));
  try { assert.equal(await main(['--repo', dir]), 3); } finally { console.error = orig; }
  assert.match(errs.join('\n'), /800×600/);
  assert.equal(fs.existsSync(path.join(dir, '.media')), false, 'nothing written before the size check passes');
  fs.writeFileSync(path.join(dir, 'b.tape'), '');
  assert.match(findTape(dir).error, /more than one tape/);
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
  fs.rmSync(dir, { recursive: true, force: true });
});

import { fileURLToPath } from 'node:url';
import { FINE_FPS, VHS_DEFAULTS, lenientCounter, lenientMatcher, tapeBeats, timeTapeBeats, vhsDurationMs } from './record-terminal.mjs';

const GS03_TAPE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'gs-03-cli-api', 'demo.tape'), 'utf8');

test('vhsDurationMs(): ms, s, m and bare seconds; anything else is null', () => {
  assert.deepEqual(['300ms', '1.5s', '2', '1m', ' 50ms ', 'fast', '', undefined].map(vhsDurationMs), [300, 1500, 2000, 60000, 50, null, null, null]);
  assert.deepEqual(VHS_DEFAULTS, { typingSpeedMs: 50, waitPattern: '>$', playbackSpeed: 1 });
  assert.equal(FINE_FPS, 10);
});

test('tapeBeats(): shown Type / key / Sleep / Wait in order with tape-known durations; Hide…Show left out; several commands per line; @speed, counts, Set TypingSpeed / WaitPattern / PlaybackSpeed', () => {
  const g = tapeBeats(GS03_TAPE);
  assert.equal(g.playbackSpeed, 1);
  assert.ok(!g.steps.some((s) => /export|clear/.test(s.text ?? '')), 'the hidden setup (Hide … Show) is not in the footage');
  assert.deepEqual(g.steps.slice(0, 4), [
    { kind: 'type', text: 'acmejobs submit --file report.csv', dur_ms: 33 * 50, line: 22 },
    { kind: 'sleep', dur_ms: 300, line: 23 },
    { kind: 'key', key: 'Enter', count: 1, dur_ms: 50, line: 24 },
    { kind: 'wait', scope: 'Screen', pattern: 'job_[a-z0-9]+ queued', prompt: false, line: 25 },
  ]);
  assert.deepEqual(g.steps.filter((s) => s.kind === 'wait').map((s) => s.pattern), ['job_[a-z0-9]+ queued', 'status: running', 'status: done', '"status": "done"']);

  const t = tapeBeats([
    'Set TypingSpeed 100ms', 'Set WaitPattern /\\$ $/', 'Set PlaybackSpeed 2',
    'Hide', 'Type "secret setup" Enter', 'Show',
    'Type "ls # not a comment" Enter   # a comment', 'Type@20ms "ab"', 'Enter 2', 'Backspace@10ms 3', 'Ctrl+C', 'Wait', 'Wait+Line@5s /done/', 'Sleep 1.5s',
    'Screenshot shot.png', 'Env A "b"',
  ].join('\n'));
  assert.equal(t.playbackSpeed, 2);
  assert.deepEqual(t.steps.map((s) => [s.kind, s.text ?? s.key ?? s.pattern ?? null, s.dur_ms ?? null, s.line]), [
    ['type', 'ls # not a comment', 18 * 100, 7], ['key', 'Enter', 100, 7],
    ['type', 'ab', 40, 8], ['key', 'Enter', 200, 9], ['key', 'Backspace', 30, 10],
    ['wait', '\\$ $', null, 12], ['wait', 'done', null, 13], ['sleep', null, 1500, 14],
  ]);
  assert.equal(t.steps[5].prompt, true, 'a bare Wait waits for the WaitPattern prompt');
  assert.equal(t.steps[6].scope, 'Line');
});

test('lenientMatcher(): the regex as written, else OCR-tolerant — `_` dropped or a space, curly quotes, case; a bad regex never throws', () => {
  const q = lenientMatcher('job_[a-z0-9]+ queued');
  assert.ok(q('uploading … ok\njob_7f3k2 queued'));
  assert.ok(q('job 7f3k2 queued'), 'OCR reads _ as a space');
  assert.ok(q('job7f3k2 Queued'), 'OCR drops _');
  assert.ok(!q('job_7f3k2 running'));
  assert.ok(!q(null));
  const j = lenientMatcher('"status": "done"');
  assert.ok(j('{\n  “status”: “done”,'));
  assert.ok(!j('"status": "running"'));
  assert.ok(lenientMatcher('a_+b')('a b'), '`_` before a quantifier stays a (loosened) atom');
  assert.equal(lenientMatcher('(unclosed')('(unclosed'), false);
  assert.equal(lenientCounter('status: done')('status: done\nstatus:  Done\nstatus: running'), 2);
  assert.equal(lenientCounter('job_7f3k2')('job_7f3k2 queued\njob 7f3k2 running'), 2);
  assert.equal(lenientCounter('$')('a\nb'), 2);
  assert.equal(lenientCounter('x')(undefined), 0);
});

const SESSION = [
  { type: 'acmejobs submit --file report.csv', from: 0, to: 1.5 },
  { out: 'uploading report.csv .. ok', at: 1.9 }, { out: 'job_7f3k2 queued', at: 2.0 },
  { type: 'acmejobs watch --last', from: 2.95, to: 4.0 },
  { out: 'watching job_7f3k2', at: 4.35 }, { out: 'status: queued', at: 4.35 }, { out: 'status: running', at: 5.15 }, { out: 'status: done', at: 7.25 },
  { type: 'acmejobs result --last --json | head -n 12', from: 8.2, to: 10.3 },
  { out: '{', at: 10.55 }, { out: '  "status": "done",', at: 10.55 },
];
const screen = (session = SESSION) => (t) => {
  const lines = [];
  for (const e of session) {
    if (e.type != null) {
      if (t < e.from - 1e-9) break;
      const n = t >= e.to - 1e-9 ? e.type.length : Math.floor((e.type.length * (t - e.from)) / (e.to - e.from));
      lines.push(`$ ${e.type.slice(0, n)}ff`);
    } else if (t >= e.at - 1e-9) lines.push(e.out);
    else break;
  }
  return lines.join('\n').replace(/_/g, ' ');
};
const coarseOf = (at, dur = 13) => Array.from({ length: Math.floor(dur * 2) + 1 }, (_, i) => ({ t: i / 2, text: at(i / 2) }));
const fineOf = (at, calls = []) => async (t) => { calls.push(t); return at(t); };

test('timeTapeBeats(): each typed command where its text appears in full, each Wait on its first new match (2 fps, refined at 10 fps); keys bridged by the tape; compressed idle time does not drift the beats (GS03-06)', async () => {
  const calls = [];
  const beats = await timeTapeBeats(tapeBeats(GS03_TAPE), { coarse: coarseOf(screen()), fine: fineOf(screen(), calls) });
  assert.deepEqual(beats.map((b) => [b.kind, b.t_sec, b.end_sec ?? null, b.timed_by]), [
    ['type', 0, 1.5, 'ocr'], ['key', 1.8, null, 'tape'], ['wait', 2, null, 'ocr'],
    ['type', 2.95, 4, 'ocr'], ['key', 4.3, null, 'tape'], ['wait', 5.2, null, 'ocr'], ['wait', 7.3, null, 'ocr'],
    ['type', 8.2, 10.3, 'ocr'], ['key', 10.6, null, 'tape'], ['wait', 10.6, null, 'ocr'],
  ]);
  assert.equal(beats[1].command, 'acmejobs submit --file report.csv');
  assert.ok(beats.filter((b) => b.kind === 'wait').every((b) => b.matched === true));
  assert.ok(calls.length <= 7 * 4, `a binary search per anchor, got ${calls.length} fine OCRs`);

  const coarseOnly = await timeTapeBeats(tapeBeats(GS03_TAPE), { coarse: coarseOf(screen()) });
  assert.deepEqual(coarseOnly.filter((b) => b.timed_by === 'ocr').map((b) => b.end_sec ?? b.t_sec), [1.5, 2, 4, 5.5, 7.5, 10.5, 11]);

  const early = SESSION.map((e) => (e.out && e.at === 10.55 ? { ...e, at: 10.45 } : e));
  const clamped = await timeTapeBeats(tapeBeats(GS03_TAPE), { coarse: coarseOf(screen(early)), fine: fineOf(screen(early)) });
  assert.deepEqual(clamped.slice(-2).map((b) => [b.kind, b.t_sec]), [['key', 10.5], ['wait', 10.5]]);
});

test('timeTapeBeats(): an unmatched Wait is null and so are the tape-timed beats after it until the next anchor; no OCR → only the beats before the first Wait; a Wait needs a NEW match, not an earlier command\'s line', async () => {
  const noRunning = SESSION.filter((e) => e.out !== 'status: running');
  const a = await timeTapeBeats(tapeBeats(GS03_TAPE), { coarse: coarseOf(screen(noRunning)), fine: fineOf(screen(noRunning)) });
  assert.deepEqual(a.filter((b) => b.kind === 'wait').map((b) => [b.t_sec, b.matched, b.timed_by]), [[2, true, 'ocr'], [null, false, 'ocr'], [7.3, true, 'ocr'], [10.6, true, 'ocr']]);

  const tape = 'Set Width 1920\nType "echo hello"\nEnter\nWait /hello$/\nSleep 1\nEnter\nType "ls"\nType "echo again"\nEnter\n';
  const session = [{ type: 'echo hello', from: 0, to: 0.5 }, { type: 'ls', from: 2, to: 2.1 }];
  const b = await timeTapeBeats(tapeBeats(tape), { coarse: coarseOf(screen(session), 4), fine: fineOf(screen(session)) });
  assert.deepEqual(b.map((x) => [x.kind, x.t_sec]), [['type', 0], ['key', 0.5], ['wait', null], ['key', null], ['type', null], ['type', null], ['key', null]]);

  const none = await timeTapeBeats(tapeBeats(GS03_TAPE), {});
  assert.deepEqual(none.map((x) => x.t_sec), [0, 1.95, null, null, null, null, null, null, null, null]);
  assert.ok(none.filter((x) => x.kind === 'wait').every((x) => x.matched === false && x.timed_by === 'none'));

  const twice = 'Type "acmejobs watch --last"\nEnter\nWait+Screen /status: done/\nSleep 1\nType "acmejobs watch --last"\nEnter\nWait+Screen /status: done/\n';
  const run2 = [
    { type: 'acmejobs watch --last', from: 0, to: 1 }, { out: 'status: done', at: 1.5 },
    { type: 'acmejobs watch --last', from: 2, to: 3 }, { out: 'status: done', at: 4.25 },
  ];
  const c = await timeTapeBeats(tapeBeats(twice), { coarse: coarseOf(screen(run2), 5), fine: fineOf(screen(run2)) });
  assert.deepEqual(c.filter((x) => x.kind === 'wait').map((x) => x.t_sec), [1.5, 4.3]);
  assert.deepEqual(c.filter((x) => x.kind === 'type').map((x) => [x.t_sec, x.end_sec]), [[0, 1], [1.95, 3]]);
});
