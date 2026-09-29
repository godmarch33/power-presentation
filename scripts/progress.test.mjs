import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROGRESS_FILE, REVISION_BAND, STEPS, activeRuns, bar, changedLine, clock, finish, hookOutput, lineOf, progressOf, record, runStart, statusLine, watch, workspacesIn } from './progress.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const T0 = Date.parse('2026-09-27T10:00:00Z');
const iso = (s) => new Date(T0 + s * 1000).toISOString();
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pp-progress-')));

function workspace({ name = 'acme-marketing', runs = [], pending = {}, repo = tmp() } = {}) {
  const p = path.join(repo, 'power-presentation-out', name);
  fs.mkdirSync(path.join(p, '.hyperframes'), { recursive: true });
  const ledger = {
    schema: 'power-presentation/stage-times@0.1', stages_s: {},
    runs: runs.map(([stage, end, seconds, ok = true]) => ({ command: stage, stage, at: iso(end), seconds, ok, source: 'stamped' })),
    pending: Object.fromEntries(Object.entries(pending).map(([k, s]) => [k, iso(s)])),
  };
  fs.writeFileSync(path.join(p, '.hyperframes', 'pp-stages.json'), JSON.stringify(ledger));
  return { repo, p, ledger };
}
const setLedger = (p, mutate) => {
  const f = path.join(p, '.hyperframes', 'pp-stages.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8')); mutate(d); fs.writeFileSync(f, JSON.stringify(d));
};
function frames(p, total, built) {
  const dir = path.join(p, '.hyperframes', 'frame-packets');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(p, 'compositions', 'frames'), { recursive: true });
  const list = Array.from({ length: total }, (_, i) => ({ frame_id: `f0${i + 1}`, src: `compositions/frames/f0${i + 1}.html`, exists: false }));
  fs.writeFileSync(path.join(dir, '_dispatch.json'), JSON.stringify({ frames: list }));
  for (const f of list.slice(0, built)) fs.writeFileSync(path.join(p, f.src), '<template></template>');
}
const EARLY = [['intake', 20, 20], ['inspect', 60, 40], ['capture', 170, 110]];

test('STEPS: order + the critic, weights + the revision band sum to 100', () => {
  assert.equal(STEPS.reduce((a, s) => a + s.weight, 0) + REVISION_BAND, 100);
  assert.deepEqual(STEPS.map((s) => s.key), ['intake', 'inspect', 'capture', 'pitch', 'brief', 'design_spec', 'storyboard', 'audio', 'frames', 'assemble', 'verify', 'review', 'render', 'deliver', 'critic']);
});

test('bar() / clock(): fixed-width bar, human clock', () => {
  assert.equal(bar(0, 10), '▕░░░░░░░░░░▏');
  assert.equal(bar(50, 10), '▕█████░░░░░▏');
  assert.equal(bar(100, 10), '▕██████████▏');
  assert.equal(bar(140, 4), '▕████▏');
  assert.deepEqual([clock(45), clock(754), clock(3900)], ['45 s', '12 min', '1 h 05 min']);
});

test('progressOf(): null without a stage clock; the intake stamp starts the run', () => {
  const dir = tmp();
  assert.equal(progressOf(dir), null);
  const { p } = workspace({ pending: { intake: 0 } });
  const r = progressOf(p, { now: T0 + 5000 });
  assert.equal(r.stage, 'intake');
  assert.equal(r.label, 'Reading the request');
  assert.equal(r.percent, 0);
  assert.equal(r.elapsed_s, 5);
  assert.equal(r.run_start, iso(0));
});

test('progressOf(): the stage after the furthest one finished; skipped stages count as passed', () => {
  const { p } = workspace({ runs: [...EARLY, ['brief', 200, 30]] });
  const r = progressOf(p, { now: T0 + 200 * 1000 });
  assert.equal(r.stage, 'design_spec', 'pitch was never stamped (booked under storyboard) — passed, not current');
  assert.equal(r.percent, 1 + 2 + 4 + 6 + 2);
});

test('progressOf(): a begun stage wins over one finished early (audio measured inside the storyboard dispatch)', () => {
  const { p } = workspace({ runs: [...EARLY, ['audio', 400, 40]], pending: { storyboard: 200 } });
  const r = progressOf(p, { now: T0 + 625 * 1000 });
  assert.equal(r.stage, 'storyboard');
  assert.equal(r.label, 'Writing the storyboard');
  assert.equal(r.percent, 16 + 11);
});

test('progressOf(): frames are done only when every frame file exists (packets books `frames` early); detail k/N', () => {
  const { p } = workspace({ runs: [...EARLY, ['storyboard', 900, 700], ['audio', 950, 40], ['frames', 960, 2], ['frames', 961, 0.5, false]] });
  frames(p, 10, 0);
  let r = progressOf(p, { now: T0 + 970 * 1000 });
  assert.equal(r.stage, 'frames');
  assert.equal(r.detail, '0/10');
  assert.equal(r.percent, 40);
  frames(p, 10, 6);
  r = progressOf(p, { now: T0 + 1500 * 1000 });
  assert.equal(r.detail, '6/10');
  assert.equal(r.label, 'Building the frames');
  assert.equal(r.percent, 40 + 18);
  frames(p, 10, 10);
  r = progressOf(p, { now: T0 + 1600 * 1000 });
  assert.equal(r.stage, 'assemble', 'all frames built → the next stage');
});

test('progressOf(): a failed verify keeps "quality checks" current; critic votes k/N; the verdict → wrapping up / revising', () => {
  const { p } = workspace({ runs: [...EARLY, ['storyboard', 900, 700], ['frames', 1500, 500], ['assemble', 1510, 5], ['verify', 1700, 190, false]] });
  frames(p, 4, 4);
  let r = progressOf(p, { now: T0 + 1710 * 1000 });
  assert.equal(r.stage, 'verify');
  setLedger(p, (d) => d.runs.push(...[['verify', 1900], ['render', 2000], ['deliver', 2060]].map(([stage, e]) => ({ stage, at: iso(e), seconds: 10, ok: true }))));
  const critic = path.join(p, 'QA', 'critic');
  fs.mkdirSync(path.join(critic, 'vote-1'), { recursive: true });
  fs.writeFileSync(path.join(critic, 'dispatch.json'), JSON.stringify({ votes: 3, agents: ['a', 'b', 'c', 'd', 'e'] }));
  for (const a of ['a', 'b', 'c']) fs.writeFileSync(path.join(critic, 'vote-1', `${a}.json`), '{}');
  r = progressOf(p, { now: Date.now() });
  assert.equal(r.stage, 'critic');
  assert.equal(r.detail, '3/15');
  fs.writeFileSync(path.join(p, 'QA', 'critic.json'), JSON.stringify({ ship: false }));
  r = progressOf(p, { now: Date.now() });
  assert.equal(r.stage, 'revision');
  assert.equal(r.label, 'Revising · Building the frames');
  assert.equal(r.percent, 97, 'the revision round has its own band, not 99 for a quarter of the run');
  assert.equal(r.verdict, 'not ship');
});

test('progressOf(): the revision round walks its band; round-2 votes count against the new dispatch; the next verdict ends it', async () => {
  const pause = () => new Promise((res) => setTimeout(res, 20));
  const { p } = workspace({ runs: [...EARLY, ['storyboard', 900, 700], ['assemble', 1510, 5], ['verify', 1700, 190], ['render', 2000, 10], ['deliver', 2060, 10]] });
  frames(p, 4, 4);
  const critic = path.join(p, 'QA', 'critic');
  fs.mkdirSync(path.join(critic, 'vote-1'), { recursive: true });
  fs.writeFileSync(path.join(critic, 'dispatch.json'), JSON.stringify({ votes: 1, agents: ['a', 'b', 'c'] }));
  for (const a of ['a', 'b', 'c']) fs.writeFileSync(path.join(critic, 'vote-1', `${a}.json`), '{}');
  await pause();
  fs.writeFileSync(path.join(p, 'QA', 'critic.json'), JSON.stringify({ ship: false }));
  record(p, progressOf(p));
  await pause();
  const later = (stage) => setLedger(p, (d) => d.runs.push({ stage, at: new Date(Date.now() + 1000).toISOString(), seconds: 1, ok: true }));
  later('verify');
  let r = progressOf(p);
  assert.equal(r.label, 'Revising · Rendering the video');
  assert.ok(r.percent >= 97 && r.percent < 100);
  await pause();
  fs.writeFileSync(path.join(critic, 'dispatch.json'), JSON.stringify({ votes: 1, agents: ['a', 'b', 'c'] }));
  r = progressOf(p);
  assert.equal(r.label, 'Revising · Final review');
  assert.equal(r.detail, '0/3', 'round-1 votes do not count for round 2');
  await pause();
  fs.writeFileSync(path.join(critic, 'vote-1', 'a.json'), '{}');
  assert.equal(progressOf(p).detail, '1/3');
  record(p, progressOf(p));
  await pause();
  fs.writeFileSync(path.join(p, 'QA', 'critic.json'), JSON.stringify({ ship: false }));
  r = progressOf(p);
  assert.equal(r.label, 'Wrapping up', 'the verdict after the revision ends the run, whatever it says');
  assert.equal(r.percent, 99);
});

test('progressOf(): a second version of the same video starts from its own intake, not from the first version\'s frame files', () => {
  const { p } = workspace({ runs: [...EARLY, ['storyboard', 900, 700], ['frames', 1500, 500], ['assemble', 1510, 5], ['verify', 1700, 190], ['render', 2000, 10], ['deliver', 2060, 10]] });
  frames(p, 4, 4);
  const old = (T0 + 1400 * 1000) / 1000;
  fs.utimesSync(path.join(p, '.hyperframes', 'frame-packets', '_dispatch.json'), old, old);
  setLedger(p, (d) => d.runs.push({ stage: 'intake', at: iso(5020), seconds: 20, ok: true }, { stage: 'inspect', at: iso(5060), seconds: 30, ok: true }));
  const r = progressOf(p, { now: T0 + 5070 * 1000 });
  assert.equal(r.stage, 'capture');
  assert.ok(r.percent < 10, `${r.percent}% — v1's frames must not count`);
});

test('progressOf(): a bracket never closed does not freeze the label once later stages finished after it', () => {
  const { p } = workspace({ runs: [...EARLY, ['storyboard', 900, 700], ['frames', 1500, 500], ['assemble', 1510, 5], ['verify', 1700, 190], ['render', 1900, 60]], pending: { review: 1750 } });
  frames(p, 4, 4);
  const r = progressOf(p, { now: T0 + 1910 * 1000 });
  assert.equal(r.stage, 'deliver', 'review was begun at 1750 and never ended; render finished at 1900');
});

test('changedLine() / finish(): a line only when it changed; never backwards in a run; Done at 100 after --finish; a new run resets', () => {
  const { p } = workspace({ runs: EARLY, pending: { storyboard: 200 } });
  const first = changedLine(p, { now: T0 + 625 * 1000 });
  assert.match(first, /^▕█+░+▏\s+27%  Writing the storyboard  10 min$/);
  assert.equal(changedLine(p, { now: T0 + 626 * 1000 }), null, 'same percent and stage → nothing new');
  assert.ok(fs.existsSync(path.join(p, PROGRESS_FILE)));
  setLedger(p, (d) => { d.pending.storyboard = iso(700); });
  assert.equal(progressOf(p, { now: T0 + 710 * 1000 }).percent, 27);
  finish(p, T0 + 800 * 1000);
  const done = changedLine(p, { now: T0 + 900 * 1000 });
  assert.match(done, /100%  Done  took 13 min$/);
  setLedger(p, (d) => { d.pending = { intake: iso(5000) }; });
  const again = progressOf(p, { now: T0 + 5001 * 1000 });
  assert.equal(again.percent, 0);
  assert.equal(again.finished, false);
});

test('runStart(): the latest recorded intake when none is pending; the earliest mark without any intake', () => {
  assert.equal(runStart({ runs: [{ stage: 'intake', at: iso(20), seconds: 20 }, { stage: 'intake', at: iso(1000), seconds: 10 }] }), T0 + 990 * 1000);
  assert.equal(runStart({ runs: [{ stage: 'verify', at: iso(50), seconds: 10 }], pending: { frames: iso(10) } }), T0 + 10 * 1000);
  assert.equal(runStart({ runs: [] }), null);
});

test('workspacesIn(): bare, quoted-with-spaces and JSON-escaped workspace paths; never a root-level one', () => {
  assert.deepEqual(workspacesIn('cd "/srv/u/repo/power-presentation-out/acme-sales" && node x.mjs --project .'), ['/srv/u/repo/power-presentation-out/acme-sales']);
  assert.deepEqual(workspacesIn('cd "/srv/u/my repo/power-presentation-out/acme-sales" && ls'), ['/srv/u/my repo/power-presentation-out/acme-sales']);
  assert.deepEqual(workspacesIn(JSON.stringify({ command: 'cd "/srv/u/my repo/power-presentation-out/acme-sales" && cat "/srv/u/my repo/power-presentation-out/acme-sales/QA/x.json"' })), ['/srv/u/my repo/power-presentation-out/acme-sales']);
  assert.deepEqual(workspacesIn('/w/power-presentation-out/v1/compositions/frames/f01.html'), ['/w/power-presentation-out/v1']);
  assert.deepEqual(workspacesIn('PROJECT_DIR=/a/power-presentation-out/x REPO_DIR=/a'), ['/a/power-presentation-out/x']);
  assert.deepEqual(workspacesIn('node s.mjs --project=/a/power-presentation-out/x --json'), ['/a/power-presentation-out/x']);
  assert.deepEqual(workspacesIn('ls /a/power-presentation-out/x/power-presentation-out/y'), ['/a/power-presentation-out/x', '/a/power-presentation-out/x/power-presentation-out/y']);
  assert.deepEqual(workspacesIn('see my repo/power-presentation-out/x and /power-presentation-out/y'), [], 'unquoted with spaces or root-level: no path');
  assert.deepEqual(workspacesIn('nothing here'), []);
});

test('workspacesIn(): linear — a long token of slashes or a data URI never stalls the hook (the first regex took 1.7 s on 29 slashes)', () => {
  const t0 = Date.now();
  workspacesIn('Qk/'.repeat(5000));
  workspacesIn(`ls ${'/srv/u/node_modules/.pnpm/@babel+core@7.24.0/node_modules/@babel/core/lib/config/files/index.js'.repeat(200)}`);
  workspacesIn(`${'a/'.repeat(20000)}power-presentation-out/x ${'/b'.repeat(20000)}`);
  assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0} ms`);
});

test('hookOutput(): the changed line as {systemMessage}; the session follows the run it named; another session and subagents stay silent', () => {
  const now = Date.now();
  const data = tmp();
  const env = { CLAUDE_PLUGIN_DATA: data };
  const { repo, p } = workspace({ pending: { intake: 0 } });
  setLedger(p, (d) => { d.pending.intake = new Date(now - 3000).toISOString(); });
  const input = { session_id: 's-main', cwd: repo, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: `cd "${p}" && node render-path.mjs time --project . --begin intake` } };
  assert.equal(hookOutput(input, { now, env: { ...env, POWER_PRESENTATION_PROGRESS: '0' } }), null);
  const out = hookOutput(input, { now, env });
  assert.deepEqual(Object.keys(out).sort(), ['suppressOutput', 'systemMessage']);
  assert.match(out.systemMessage, /Reading the request/);
  assert.equal(fs.readFileSync(path.join(data, 'progress-sessions', 's-main'), 'utf8'), p, 'the session remembers its run');
  assert.equal(hookOutput(input, { now: now + 1000, env }), null, 'unchanged → silent');
  assert.equal(hookOutput({ session_id: 's-x', tool_name: 'Write', tool_input: { file_path: '/tmp/a.md', content: `see ${p}` } }, { now, env }), null);
  setLedger(p, (d) => { d.pending.inspect = new Date(now + 2000).toISOString(); });
  assert.equal(hookOutput({ ...input, agent_id: 'a1', agent_type: 'power-presentation:frame-worker' }, { now: now + 3000, env }), null);
  const stop = { session_id: 's-main', cwd: repo, hook_event_name: 'Stop', stop_hook_active: false };
  assert.match(hookOutput(stop, { now: now + 4000, env }).systemMessage, /Scanning the product/);
  setLedger(p, (d) => { d.pending.capture = new Date(now + 5000).toISOString(); });
  assert.equal(hookOutput({ ...stop, session_id: 's-other' }, { now: now + 6000, env }), null);
  assert.equal(hookOutput({ ...input, session_id: 's-other' }, { now: now + 6000, env }), null, 'even a call naming the run: the owner keeps it');
  assert.match(hookOutput(stop, { now: now + 7000, env }).systemMessage, /Recording the product/);
});

test('hookOutput(): a run followed without being named shows a new stage or count, not a percentage that only crept with the clock', () => {
  const now = Date.now();
  const env = { CLAUDE_PLUGIN_DATA: tmp() };
  const { p } = workspace({ runs: EARLY, pending: { storyboard: 0 } });
  setLedger(p, (d) => { d.runs = d.runs.map((r) => ({ ...r, at: new Date(now - 60000).toISOString() })); d.pending.storyboard = new Date(now - 50000).toISOString(); });
  const named = { session_id: 's1', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: `ls ${p}` } };
  assert.match(hookOutput(named, { now, env }).systemMessage, /Writing the storyboard/);
  const stop = { session_id: 's1', cwd: '/elsewhere', hook_event_name: 'Stop' };
  assert.equal(hookOutput(stop, { now: now + 400 * 1000, env }), null, 'the clock moved the bar, nothing else did');
  assert.match(hookOutput(named, { now: now + 400 * 1000, env }).systemMessage, /Writing the storyboard/, 'a call naming the run shows it');
});

test('statusLine() / activeRuns(): the newest run under <cwd>/power-presentation-out/, prefixed with its name', () => {
  const now = Date.now();
  const { repo, p } = workspace({ name: 'acme-investors', pending: { intake: 0 } });
  setLedger(p, (d) => { d.pending.intake = new Date(now - 60 * 1000).toISOString(); });
  assert.deepEqual(activeRuns(repo, { now }), [p]);
  const stale = path.join(repo, 'power-presentation-out', 'old-sales');
  fs.mkdirSync(path.join(stale, '.hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(stale, '.hyperframes', 'pp-stages.json'), '{}');
  const old = (now - 3 * 3600 * 1000) / 1000;
  fs.utimesSync(path.join(stale, '.hyperframes', 'pp-stages.json'), old, old);
  fs.writeFileSync(path.join(stale, PROGRESS_FILE), '{}');
  assert.deepEqual(activeRuns(repo, { now }), [p]);
  assert.match(statusLine({ workspace: { current_dir: repo } }, { now }), /^acme-investors  ▕.*Reading the request  1 min$/);
  assert.equal(statusLine({ workspace: { current_dir: tmp() } }, { now }), '');
});

test('CLI: --hook reads stdin and prints one JSON object; --project prints the line; unknown flag = exit 2', () => {
  const now = Date.now();
  const { p } = workspace({ pending: { intake: 0 } });
  setLedger(p, (d) => { d.pending.intake = new Date(now).toISOString(); });
  const cli = (args, input) => spawnSync(process.execPath, [path.join(here, 'progress.mjs'), ...args], { input, encoding: 'utf8', env: { ...process.env, POWER_PRESENTATION_PROGRESS: '' } });
  const hook = cli(['--hook'], JSON.stringify({ cwd: '/x', tool_input: { command: `cd "${p}" && ls` } }));
  assert.equal(hook.status, 0);
  assert.match(JSON.parse(hook.stdout).systemMessage, /Reading the request/);
  assert.equal(cli(['--hook'], 'not json').stdout, '', 'bad input → silent, exit 0');
  assert.match(cli(['--project', p]).stdout, /Reading the request/);
  assert.equal(cli(['--nope']).status, 2);
  assert.match(lineOf(progressOf(p)), /▕/);
});

test('hooks/progress.sh: silent off-run and under POWER_PRESENTATION_PROGRESS=0; the systemMessage JSON for a run; Stop follows the session', () => {
  const now = Date.now();
  const data = tmp();
  const { repo, p } = workspace({ pending: { intake: 0 } });
  setLedger(p, (d) => { d.pending.intake = new Date(now).toISOString(); });
  const hook = path.join(here, '..', 'hooks', 'progress.sh');
  const run = (input, env = {}) => spawnSync('bash', [hook], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: path.join(here, '..'), CLAUDE_PLUGIN_DATA: data, POWER_PRESENTATION_PROGRESS: '', ...env } });
  const call = { session_id: 's-main', cwd: repo, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: `cd "${p}" && ls` } };
  assert.equal(run({ session_id: 's-main', cwd: tmp(), tool_name: 'Bash', tool_input: { command: 'ls' } }).stdout, '', 'no run named, none followed');
  assert.equal(run(call, { POWER_PRESENTATION_PROGRESS: '0' }).stdout, '');
  const r = run(call);
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /Reading the request/);
  assert.equal(run(call).stdout, '', 'unchanged → silent');
  setLedger(p, (d) => { d.pending.inspect = new Date(now + 1000).toISOString(); });
  assert.match(JSON.parse(run({ session_id: 's-main', cwd: '/x', hook_event_name: 'Stop' }).stdout).systemMessage, /Scanning the product/, 'Stop: the wrapper finds the session file');
  assert.equal(run({ session_id: 's-new', cwd: '/x', hook_event_name: 'Stop' }).stdout, '', 'a session that follows no run');
});

test('watch(): a headless run\'s line on every change, read-only, found under --root once it appears; ends when the run is done', async () => {
  const repoDir = tmp();
  const lines = [];
  let t = Date.now();
  let step = 0;
  let p = null;
  const sleep = async () => {
    step += 1;
    t += 10000;
    if (step === 1) ({ p } = workspace({ repo: repoDir, pending: { intake: 0 } }));
    if (step === 1) setLedger(p, (d) => { d.pending.intake = new Date(t).toISOString(); });
    if (step === 3) setLedger(p, (d) => { d.pending.inspect = new Date(t).toISOString(); });
    if (step === 5) fs.writeFileSync(path.join(p, PROGRESS_FILE), JSON.stringify({ run_start: JSON.parse(fs.readFileSync(path.join(p, '.hyperframes', 'pp-stages.json'), 'utf8')).pending.intake, finished_at: new Date(t).toISOString() }));
  };
  const printed = await watch({ root: repoDir, out: (l) => lines.push(l), now: () => t, sleep, maxTicks: 20 });
  assert.equal(printed, 3);
  assert.match(lines[0], /^acme-marketing  ▕.*Reading the request/);
  assert.match(lines[1], /Scanning the product/);
  assert.match(lines[2], /100%  Done/);
  assert.ok(step < 20, 'stopped at Done');
  assert.equal(JSON.parse(fs.readFileSync(path.join(p, PROGRESS_FILE), 'utf8')).key, undefined, 'the watcher never records');
});
