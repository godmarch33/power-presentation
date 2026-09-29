import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runProfile } from './lib/run-profile.mjs';

export const PROGRESS_SCHEMA = 'power-presentation/progress@0.1';
export const PROGRESS_FILE = path.join('.hyperframes', 'progress.json');
const OUT_DIR = 'power-presentation-out';

export const STEPS = Object.freeze([
  { key: 'intake', label: 'Reading the request', weight: 1, typical_s: 20 },
  { key: 'inspect', label: 'Scanning the product', weight: 2, typical_s: 40 },
  { key: 'capture', label: 'Recording the product', weight: 4, typical_s: 110 },
  { key: 'pitch', label: 'Choosing the concept', weight: 6, typical_s: 220 },
  { key: 'brief', label: 'Writing the brief', weight: 2, typical_s: 60 },
  { key: 'design_spec', label: 'Designing the look', weight: 1, typical_s: 15 },
  { key: 'storyboard', label: 'Writing the storyboard', weight: 22, typical_s: 850 },
  { key: 'audio', label: 'Recording the voiceover', weight: 2, typical_s: 45 },
  { key: 'frames', label: 'Building the frames', weight: 30, typical_s: 1300 },
  { key: 'assemble', label: 'Assembling the video', weight: 1, typical_s: 20 },
  { key: 'verify', label: 'Running the quality checks', weight: 9, typical_s: 300 },
  { key: 'review', label: 'Preparing the review', weight: 3, typical_s: 300 },
  { key: 'render', label: 'Rendering the video', weight: 6, typical_s: 120 },
  { key: 'deliver', label: 'Packaging the video', weight: 3, typical_s: 60 },
  { key: 'critic', label: 'Final review', weight: 5, typical_s: 400 },
]);
const INDEX = Object.fromEntries(STEPS.map((s, i) => [s.key, i]));
export const REVISION_BAND = 3;
const REVISION_STEPS = Object.freeze(['frames', 'assemble', 'verify', 'render', 'deliver', 'critic']);
const RUNS_INSIDE = Object.freeze({ storyboard: ['audio'] });

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const mtimeMs = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } };
const exists = (f) => mtimeMs(f) !== null;
const ms = (iso) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? t : null; };

export function bar(percent, width = 24) {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
  return `▕${'█'.repeat(filled)}${'░'.repeat(width - filled)}▏`;
}

export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function runStart(ledger) {
  const runs = ledger?.runs ?? [];
  const startOf = (r) => (ms(r.at) ?? 0) - (Number(r.seconds) || 0) * 1000;
  const pendingIntake = ms(ledger?.pending?.intake);
  if (pendingIntake !== null) return pendingIntake;
  const intakes = runs.filter((r) => r.stage === 'intake');
  if (intakes.length) return startOf(intakes.at(-1));
  const marks = [...runs.map(startOf), ...Object.values(ledger?.pending ?? {}).map(ms)].filter((t) => Number.isFinite(t) && t > 0);
  return marks.length ? Math.min(...marks) : null;
}

function frameCount(project, since) {
  const file = path.join(project, '.hyperframes', 'frame-packets', '_dispatch.json');
  if ((mtimeMs(file) ?? -1) < since - 1000) return null;
  const dispatch = readJson(file);
  const frames = Array.isArray(dispatch?.frames) ? dispatch.frames : null;
  if (!frames?.length) return null;
  return { done: frames.filter((f) => f?.src && exists(path.resolve(project, f.src))).length, total: frames.length };
}

function criticState(project, since) {
  const dir = path.join(project, 'QA', 'critic');
  const dispatchAt = mtimeMs(path.join(dir, 'dispatch.json'));
  const verdictFile = path.join(project, 'QA', 'critic.json');
  const verdictAt = mtimeMs(verdictFile);
  const round = dispatchAt !== null && dispatchAt >= since - 1000 ? dispatchAt : null;
  const out = { done: 0, total: 0, verdict: null, verdict_at: null, prior: null, prior_at: null };
  if (verdictAt !== null && verdictAt >= since - 1000) {
    if (round === null || verdictAt >= round) Object.assign(out, { verdict: readJson(verdictFile), verdict_at: verdictAt });
    else Object.assign(out, { prior: readJson(verdictFile), prior_at: verdictAt });
  }
  if (round === null) return out.verdict ? out : null;
  const dispatch = readJson(path.join(dir, 'dispatch.json'));
  const votes = Number(dispatch?.votes) || 0;
  out.total = votes * (Array.isArray(dispatch?.agents) ? dispatch.agents.length : 0);
  for (let v = 1; v <= votes; v += 1) {
    let names = [];
    try { names = fs.readdirSync(path.join(dir, `vote-${v}`)); } catch { }
    out.done += names.filter((n) => n.endsWith('.json') && (mtimeMs(path.join(dir, `vote-${v}`, n)) ?? -1) >= round).length;
  }
  out.done = Math.min(out.done, out.total);
  return out;
}

export function progressOf(project, { now = Date.now(), state = null } = {}) {
  const ledger = readJson(path.join(project, '.hyperframes', 'pp-stages.json'));
  const start = runStart(ledger);
  if (!ledger || start === null) return null;
  const saved = state ?? readJson(path.join(project, PROGRESS_FILE));
  const sameRun = saved?.run_start === new Date(start).toISOString();
  const runs = (ledger.runs ?? []).filter((r) => (ms(r.at) ?? 0) >= start - 1000);
  const okRuns = runs.filter((r) => r.ok !== false && r.stage in INDEX);
  const pending = Object.entries(ledger.pending ?? {}).filter(([k, at]) => k in INDEX && (ms(at) ?? 0) >= start - 1000
    && !okRuns.some((r) => INDEX[r.stage] > INDEX[k] && !(RUNS_INSIDE[k] ?? []).includes(r.stage) && (ms(r.at) ?? 0) > (ms(at) ?? 0)));
  const frames = frameCount(project, start);
  const critic = criticState(project, start);
  const criticOff = runProfile({ intake: readJson(path.join(project, 'intake.json')) }).critic === 'off';

  const done = new Set(okRuns.map((r) => r.stage));
  if (frames) { if (frames.done < frames.total) done.delete('frames'); else done.add('frames'); }
  for (const [k] of pending) done.delete(k);
  if (criticOff && done.has('deliver')) done.add('critic');

  const openedAt = sameRun ? ms(saved?.revision_verdict_at) : null;
  let revision = null;
  if (critic?.verdict) {
    if (critic.verdict.ship === false && !(openedAt !== null && critic.verdict_at > openedAt + 1)) revision = { since: critic.verdict_at, critic: false };
    else done.add('critic');
  } else if (critic?.prior?.ship === false) revision = { since: critic.prior_at, critic: true };
  if (revision) done.add('critic');

  const finished = Boolean(sameRun && saved?.finished_at);
  let current;
  if (pending.length && !revision) current = pending.sort((a, b) => (ms(b[1]) ?? 0) - (ms(a[1]) ?? 0))[0][0];
  else {
    const furthest = Math.max(-1, ...[...done].map((k) => INDEX[k]));
    current = STEPS[furthest + 1]?.key ?? null;
  }
  const idx = current === null ? STEPS.length : INDEX[current];
  let percent = STEPS.slice(0, idx).reduce((a, s) => a + s.weight, 0);
  let detail = null;
  let label = current === null ? 'Wrapping up' : STEPS[idx].label;
  if (revision) {
    const after = okRuns.filter((r) => (ms(r.at) ?? 0) > revision.since).map((r) => REVISION_STEPS.indexOf(r.stage));
    const ri = revision.critic ? REVISION_STEPS.length - 1 : Math.min(REVISION_STEPS.length - 1, Math.max(-1, ...after) + 1);
    let share = ri / REVISION_STEPS.length;
    if (revision.critic && critic.total) { share += (critic.done / critic.total) / REVISION_STEPS.length; detail = `${critic.done}/${critic.total}`; }
    percent = STEPS.reduce((a, s) => a + s.weight, 0) + REVISION_BAND * Math.min(0.95, share);
    label = `Revising · ${STEPS[INDEX[REVISION_STEPS[ri]]].label}`;
  } else if (current !== null) {
    const step = STEPS[idx];
    let share;
    if (current === 'frames' && frames) { share = frames.done / frames.total; detail = `${frames.done}/${frames.total}`; }
    else if (current === 'critic' && critic?.total) { share = critic.done / critic.total; detail = `${critic.done}/${critic.total}`; }
    else {
      const pendingAt = ms(ledger.pending?.[current]);
      const lastEnd = Math.max(start, ...runs.map((r) => ms(r.at) ?? 0));
      share = Math.min(0.9, Math.max(0, (now - (pendingAt ?? lastEnd)) / 1000 / step.typical_s));
    }
    percent += step.weight * Math.min(0.95, share);
  }
  if (!revision && current === null) percent = 99;
  if (finished) percent = 100;
  else percent = Math.min(99, percent);
  if (sameRun && Number.isFinite(saved?.percent) && !finished) percent = Math.max(percent, Math.min(99, saved.percent));
  const verdict = critic?.verdict ?? critic?.prior ?? null;
  return {
    schema: PROGRESS_SCHEMA, project, run_start: new Date(start).toISOString(), percent: Math.floor(percent), stage: finished ? 'done' : revision ? 'revision' : current,
    label: finished ? 'Done' : label, detail: finished ? null : detail, elapsed_s: Math.round(((finished ? ms(saved.finished_at) : now) - start) / 1000), finished,
    verdict: verdict ? (verdict.ship ? 'ship' : 'not ship') : null,
    revision_verdict_at: revision ? new Date(revision.since).toISOString() : (sameRun ? saved?.revision_verdict_at ?? null : null),
  };
}

export function lineOf(p, width = 24) {
  if (!p) return '';
  const parts = [`${bar(p.percent, width)} ${String(p.percent).padStart(3)}%`, p.label + (p.detail ? ` · ${p.detail}` : '')];
  parts.push(p.finished ? `took ${clock(p.elapsed_s)}` : clock(p.elapsed_s));
  return parts.join('  ');
}
export const keyOf = (p) => (p ? `${p.run_start}|${p.percent}|${p.label}|${p.detail ?? ''}` : '');
export const stageKeyOf = (p) => (p ? `${p.run_start}|${p.label}|${p.detail ?? ''}` : '');

export const OWNER_TTL_MS = 45 * 60 * 1000;
export const ACTIVE_MS = 2 * 3600 * 1000;

export function record(project, p, extra = {}) {
  const file = path.join(project, PROGRESS_FILE);
  const prev = readJson(file);
  const same = prev?.run_start === p.run_start;
  const next = {
    schema: PROGRESS_SCHEMA, run_start: p.run_start, percent: p.percent, key: keyOf(p), stage_key: stageKeyOf(p), line: lineOf(p),
    at: new Date().toISOString(), finished_at: same ? prev.finished_at ?? null : null, session_id: same ? prev.session_id ?? null : null,
    revision_verdict_at: p.revision_verdict_at ?? null, ...extra,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return next;
}

export function finish(project, now = Date.now()) {
  const p = progressOf(project, { now });
  if (!p) return null;
  return record(project, p, { finished_at: new Date(now).toISOString() });
}

export function changedLine(project, { now = Date.now(), width = 24, session = null, named = true } = {}) {
  const saved = readJson(path.join(project, PROGRESS_FILE));
  const p = progressOf(project, { now, state: saved });
  if (!p) return null;
  const sameRun = saved?.run_start === p.run_start;
  if (session && sameRun && saved?.session_id && saved.session_id !== session && now - (ms(saved.at) ?? 0) < OWNER_TTL_MS) return null;
  if (sameRun && (named ? saved?.key === keyOf(p) : saved?.stage_key === stageKeyOf(p))) return null;
  record(project, p, session ? { session_id: session } : {});
  return lineOf(p, width);
}

const NAME_STOP = new Set([...' \t\r\n"\'`*?<>|:;/\\,)}]']);
const PATH_STOP = new Set([...' \t\r\n"\'`*?<>|:;\\(){}[],=']);

export function workspacesIn(text) {
  const t = String(text ?? '').slice(0, 65536);
  const marker = `/${OUT_DIR}/`;
  const found = [];
  for (let i = t.indexOf(marker); i !== -1; i = t.indexOf(marker, i + marker.length)) {
    let e = i + marker.length;
    while (e < t.length && !NAME_STOP.has(t[e])) e += 1;
    if (e === i + marker.length) continue;
    let s = i;
    while (s > 0 && !PATH_STOP.has(t[s - 1])) s -= 1;
    let start = t.indexOf('/', s);
    if (start === i) {
      let q = s - 1;
      while (q >= 0 && q > s - 4096 && t[q] !== '"' && t[q] !== "'" && t[q] !== '\n') q -= 1;
      if (q < 0 || t[q] === '\n' || t[q + 1] !== '/' || !['"', "'", '/', '\\'].includes(t[e])) continue;
      start = q + 1;
    }
    found.push(t.slice(start, e).replace(/^\/+/, '/'));
  }
  return [...new Set(found)];
}

export function activeRuns(root, { now = Date.now(), maxAgeMs = ACTIVE_MS } = {}) {
  let names = [];
  try { names = fs.readdirSync(path.join(root, OUT_DIR)); } catch { return []; }
  return names.map((n) => path.join(root, OUT_DIR, n))
    .map((p) => ({ p, t: mtimeMs(path.join(p, '.hyperframes', 'pp-stages.json')) }))
    .filter((r) => r.t !== null && now - r.t < maxAgeMs).sort((a, b) => b.t - a.t).map((r) => r.p);
}

const hasRun = (p) => exists(path.join(p, '.hyperframes', 'pp-stages.json'));

const PATH_FIELDS = ['command', 'file_path', 'notebook_path', 'path', 'prompt', 'description'];
export const pathText = (toolInput) => PATH_FIELDS.map((k) => (typeof toolInput?.[k] === 'string' ? toolInput[k].slice(0, 16384) : '')).join('\n');

export const sessionsDir = (env = process.env) => path.join(env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'power-presentation'), 'progress-sessions');
const sidOf = (s) => (typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s) ? s : null);

export function hookOutput(input, { now = Date.now(), env = process.env } = {}) {
  if (env.POWER_PRESENTATION_PROGRESS === '0') return null;
  if (input?.agent_id && (input.hook_event_name ?? 'PostToolUse') === 'PostToolUse') return null;
  const sid = sidOf(input?.session_id);
  const pointer = sid ? path.join(sessionsDir(env), sid) : null;
  const active = (p) => { const t = p ? mtimeMs(path.join(p, '.hyperframes', 'pp-stages.json')) : null; return t !== null && now - t < ACTIVE_MS; };
  const named = workspacesIn(pathText(input?.tool_input)).find(hasRun) ?? null;
  if (named && pointer && readText(pointer) !== named) { fs.mkdirSync(path.dirname(pointer), { recursive: true }); fs.writeFileSync(pointer, named); }
  const followed = named ? null : [pointer ? readText(pointer) : null, workspacesIn(input?.cwd).find(hasRun)].find(active) ?? null;
  const project = named ?? followed;
  if (!project) return null;
  const line = changedLine(project, { now, session: sid, named: Boolean(named) });
  return line ? { systemMessage: line, suppressOutput: true } : null;
}

export function statusLine(input, { now = Date.now() } = {}) {
  const cwd = input?.workspace?.current_dir ?? input?.cwd ?? process.cwd();
  const inside = workspacesIn(cwd).find(hasRun);
  for (const p of inside ? [inside] : activeRuns(cwd, { now })) {
    const pr = progressOf(p, { now });
    if (pr && (!pr.finished || now - (ms(readJson(path.join(p, PROGRESS_FILE))?.finished_at) ?? 0) < 600 * 1000)) return `${path.basename(p)}  ${lineOf(pr)}`;
  }
  return '';
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; } };

export async function watch({ project = null, root = null, intervalMs = 5000, untilPid = null, idleMs = 3 * 3600 * 1000, out = (l) => process.stdout.write(`${l}\n`), now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxTicks = Infinity } = {}) {
  let last = '';
  let lastChange = now();
  let printed = 0;
  for (let tick = 0; tick < maxTicks; tick += 1) {
    const p = project ?? (root ? activeRuns(root, { now: now() })[0] : null);
    const pr = p && hasRun(p) ? progressOf(p, { now: now() }) : null;
    if (pr && keyOf(pr) !== last) {
      last = keyOf(pr);
      lastChange = now();
      out(root && !project ? `${path.basename(p)}  ${lineOf(pr)}` : lineOf(pr));
      printed += 1;
    }
    if (pr?.finished || (untilPid && !alive(untilPid)) || now() - lastChange > idleMs) break;
    await sleep(intervalMs);
  }
  return printed;
}

export const USAGE = `Usage:
  node scripts/progress.mjs --project <P> [--json] [--if-changed] [--width 24]   the run's progress line
  node scripts/progress.mjs --project <P> --finish                               mark the run done (100 %)
  node scripts/progress.mjs --hook          PostToolUse hook (stdin: hook JSON) → {"systemMessage": line} on change
  node scripts/progress.mjs --statusline    statusLine command (stdin: status JSON) → the newest active run's line
  node scripts/progress.mjs --watch (--project <P> | --root <dir>) [--interval 5] [--until-pid <pid>]
                                            print the line on every change (a headless run, a terminal, a log); read-only`;

const readStdin = () => { try { return JSON.parse(fs.readFileSync(0, 'utf8') || 'null'); } catch { return null; } };

export function main(argv = process.argv.slice(2)) {
  const o = { project: null, json: false, ifChanged: false, width: 24, mode: 'line', root: null, interval: 5, untilPid: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--project') o.project = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '--if-changed') o.ifChanged = true;
    else if (a === '--width') o.width = Math.max(8, Math.min(60, Number(argv[++i]) || 24));
    else if (a === '--finish') o.mode = 'finish';
    else if (a === '--hook') o.mode = 'hook';
    else if (a === '--statusline') o.mode = 'statusline';
    else if (a === '--watch') o.mode = 'watch';
    else if (a === '--root') o.root = argv[++i];
    else if (a === '--interval') o.interval = Math.max(1, Number(argv[++i]) || 5);
    else if (a === '--until-pid') o.untilPid = Number(argv[++i]) || null;
    else if (a === '-h' || a === '--help') { console.log(USAGE); return 0; }
    else { console.error(`unknown argument ${a}\n${USAGE}`); return 2; }
  }
  if (o.mode === 'hook') { try { const out = hookOutput(readStdin()); if (out) process.stdout.write(`${JSON.stringify(out)}\n`); } catch { } return 0; }
  if (o.mode === 'statusline') { try { const s = statusLine(readStdin()); if (s) process.stdout.write(`${s}\n`); } catch { } return 0; }
  if (o.mode === 'watch') {
    if (!o.project && !o.root) { console.error(USAGE); return 2; }
    return watch({ project: o.project ? path.resolve(o.project) : null, root: o.root ? path.resolve(o.root) : null, intervalMs: o.interval * 1000, untilPid: o.untilPid }).then(() => 0);
  }
  if (!o.project) { console.error(USAGE); return 2; }
  const project = path.resolve(o.project);
  if (o.mode === 'finish') { const r = finish(project); console.log(r ? 'progress: finished' : 'progress: no run here'); return 0; }
  if (o.ifChanged) { const line = changedLine(project, { width: o.width }); if (line) console.log(line); return 0; }
  const p = progressOf(project);
  if (o.json) console.log(JSON.stringify(p, null, 2));
  else if (p) console.log(lineOf(p, o.width));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = main();
  if (r instanceof Promise) r.then((code) => { process.exitCode = code; }); else process.exitCode = r;
}
