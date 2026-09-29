import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'power-presentation/critic@0.1';
export const DIMENSIONS = Object.freeze(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
export const DIMENSION_NAMES = Object.freeze({
  C1: 'hook clarity', C2: 'product credibility', C3: 'one idea per scene', C4: 'readability', C5: 'brand', C6: 'motion craft', C7: 'ending and CTA',
});
export const OWNERS = Object.freeze({ C1: 'critic-pacing', C2: 'claims-auditor', C3: 'critic-design', C4: 'critic-readability', C5: 'critic-brand', C6: 'critic-design', C7: 'critic-pacing' });
export const AGENTS = Object.freeze([...new Set(Object.values(OWNERS))]);
export const PASS_MEAN = 3.0;
export const PASS_MIN = 2;
export const VOTES = 3;
export const KEYFRAMES = 12;

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

export function pngSize(file) {
  try {
    const b = Buffer.alloc(24);
    const fd = fs.openSync(file, 'r');
    fs.readSync(fd, b, 0, 24, 0);
    fs.closeSync(fd);
    if (b.toString('latin1', 1, 4) !== 'PNG') return null;
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  } catch { return null; }
}

export function criticInputs(project) {
  const p = (...s) => path.join(project, ...s);
  const problems = [];
  const sheet = p('QA', 'contact-sheet.png');
  const sheetSize = pngSize(sheet);
  if (!sheetSize) problems.push('QA/contact-sheet.png missing — run render-path deliver (wowprobe post-render)');
  else if (sheetSize.width !== 1920) problems.push(`QA/contact-sheet.png is ${sheetSize.width} px wide, the critic needs 1920`);
  const framesDir = p('QA', 'frames');
  const frames = fs.existsSync(framesDir) ? fs.readdirSync(framesDir).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.posix.join('QA', 'frames', f)) : [];
  if (frames.length !== KEYFRAMES) problems.push(`QA/frames holds ${frames.length} key frame(s), the critic needs ${KEYFRAMES}`);
  for (const f of frames) {
    const s = pngSize(p(f));
    if (!s || s.width !== 960 || s.height !== 540) problems.push(`${f} is ${s ? `${s.width}×${s.height}` : 'unreadable'}, the critic needs 960×540`);
  }
  for (const f of ['STORYBOARD.md', 'BRIEF.md', 'QA/wowprobe.json']) if (!fs.existsSync(p(f))) problems.push(`${f} missing`);
  return { contact_sheet: 'QA/contact-sheet.png', frames, storyboard: 'STORYBOARD.md', brief: 'BRIEF.md', wowprobe: 'QA/wowprobe.json', portrait: portraitInputs(project), problems };
}

export function portraitInputs(project) {
  const p = (...s) => path.join(project, ...s);
  if (!fs.existsSync(p('QA', 'contact-sheet-9x16.png'))) return null;
  const dir = p('QA', 'frames-9x16');
  const frames = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.posix.join('QA', 'frames-9x16', f)) : [];
  return { format: '9:16', contact_sheet: 'QA/contact-sheet-9x16.png', frames, wowprobe: fs.existsSync(p('QA', 'wowprobe-9x16.json')) ? 'QA/wowprobe-9x16.json' : null };
}

export function voteSheet(outputs) {
  const scores = {};
  const fixes = [];
  const ignored = [];
  const observations = [];
  for (const [agent, out] of Object.entries(outputs ?? {})) {
    for (const s of Array.isArray(out?.scores) ? out.scores : []) {
      const dim = String(s?.dimension ?? '').toUpperCase();
      if (!DIMENSIONS.includes(dim)) continue;
      if (OWNERS[dim] !== agent) { ignored.push(`${agent} scored ${dim} (owner ${OWNERS[dim]})`); continue; }
      const score = Number(s.score);
      if (!Number.isFinite(score) || score < 0 || score > 4) { ignored.push(`${agent} ${dim}: score ${JSON.stringify(s.score)} outside 0–4`); continue; }
      scores[dim] = score;
      fixes.push({ dimension: dim, score, critic: agent, evidence: s.evidence ?? null, fix: s.fix ?? null });
    }
    for (const g of Array.isArray(out?.gate_observations) ? out.gate_observations : []) observations.push({ critic: agent, ...g });
  }
  const missing = DIMENSIONS.filter((d) => scores[d] === undefined);
  const values = DIMENSIONS.filter((d) => scores[d] !== undefined).map((d) => scores[d]);
  const mean = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;
  const min = values.length ? Math.min(...values) : null;
  const pass = missing.length === 0 && mean >= PASS_MEAN && min >= PASS_MIN;
  return { scores, mean, min, pass, missing, ignored, fixes: fixes.sort((a, b) => a.score - b.score || a.dimension.localeCompare(b.dimension)), gate_failures: observations.filter((o) => o.status === 'fail') };
}

export function tallyVotes(sheets, votes = VOTES) {
  const dimensions = Object.fromEntries(DIMENSIONS.map((d) => [d, sheets.map((s) => s.scores[d] ?? null)]));
  const passing = sheets.filter((s) => s.pass).length;
  const complete = sheets.filter((s) => !s.missing.length);
  const means = complete.map((s) => s.mean);
  const mins = complete.map((s) => s.min);
  const reasons = [];
  if (sheets.length < votes) reasons.push(`${sheets.length} of ${votes} votes present`);
  for (const [i, s] of sheets.entries()) if (s.missing.length) reasons.push(`vote ${i + 1} incomplete: ${s.missing.join(', ')}`);
  const ship = sheets.length >= votes && passing > votes / 2;
  const fixes = sheets.flatMap((s, i) => s.fixes.filter((f) => f.score < PASS_MEAN).map((f) => ({ vote: i + 1, ...f })));
  return {
    votes: sheets.length, passing_votes: passing, ship, reasons,
    mean: means.length ? Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 100) / 100 : null,
    min: mins.length ? Math.min(...mins) : null,
    dimensions, fixes: fixes.sort((a, b) => a.score - b.score || a.dimension.localeCompare(b.dimension) || a.vote - b.vote),
  };
}

export function readVotes(project) {
  const dir = path.join(project, 'QA', 'critic');
  const voteDirs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => /^vote-\d+$/.test(d)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5))) : [];
  return voteDirs.map((v) => {
    const outputs = {};
    const unreadable = [];
    for (const f of fs.readdirSync(path.join(dir, v)).filter((x) => x.endsWith('.json'))) {
      const j = readJson(path.join(dir, v, f));
      if (j) outputs[j.critic ?? f.replace(/\.json$/, '')] = j; else unreadable.push(f);
    }
    return { vote: v, outputs, unreadable };
  });
}

export function tallyProject(project, { write = true } = {}) {
  const votes = readVotes(project);
  const sheets = votes.map((v) => ({ vote: v.vote, unreadable: v.unreadable, ...voteSheet(v.outputs) }));
  let n = VOTES;
  try { n = Number(JSON.parse(fs.readFileSync(path.join(project, 'QA', 'critic', 'dispatch.json'), 'utf8')).votes) || VOTES; } catch { }
  const t = tallyVotes(sheets, n);
  const out = {
    schema: SCHEMA, generated_by: 'scripts/critic.mjs',
    rule: `vote passes at mean ≥ ${PASS_MEAN} and min ≥ ${PASS_MIN} over ${DIMENSIONS.join('…')}; ship by majority of ${n}`,
    ...t,
    sheets: sheets.map((s) => ({ vote: s.vote, scores: s.scores, mean: s.mean, min: s.min, pass: s.pass, missing: s.missing, ignored: s.ignored, unreadable: s.unreadable, gate_failures: s.gate_failures })),
  };
  if (write) fs.writeFileSync(path.join(project, 'QA', 'critic.json'), `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

export const USAGE = `critic.mjs — the vision critic: dispatch bundle and vote tally → QA/critic.json

Usage:
  node scripts/critic.mjs prepare [--project <dir>] [--votes 3] [--json]
  node scripts/critic.mjs tally   [--project <dir>] [--json]

Votes live in QA/critic/vote-<n>/<agent>.json; owners: ${DIMENSIONS.map((d) => `${d} ${OWNERS[d]}`).join(', ')}.
Exit codes: 0 prepared / ship · 3 inputs missing / not ship · 2 usage · 1 unreadable input`;

export function parseArgs(argv) {
  const opts = { command: null, project: '.', votes: VOTES, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--project') opts.project = argv[++i] ?? '.';
    else if (a === '--votes') { opts.votes = Number(argv[++i]); if (!Number.isInteger(opts.votes) || opts.votes < 1) throw new Error('--votes must be a positive integer'); }
    else if (a === '--json') opts.json = true;
    else if (a === 'prepare' || a === 'tally') opts.command = a;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

export function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { console.error(`${err.message}\n\n${USAGE}`); return 2; }
  if (opts.help || !opts.command) { console.log(USAGE); return opts.help ? 0 : 2; }
  const project = path.resolve(opts.project);
  if (!fs.existsSync(project)) { console.error(`no project at ${project}`); return 1; }
  if (opts.command === 'prepare') {
    const inputs = criticInputs(project);
    const dispatch = {
      schema: SCHEMA, project, votes: opts.votes, owners: OWNERS, agents: AGENTS,
      inputs: { contact_sheet: inputs.contact_sheet, frames: inputs.frames, storyboard: inputs.storyboard, brief: inputs.brief, wowprobe: inputs.wowprobe, ...(inputs.portrait ? { portrait: inputs.portrait } : {}) },
      never: ['compositions/**', 'worker notes', 'commit messages', 'chat'],
      write_to: Array.from({ length: opts.votes }, (_, i) => `QA/critic/vote-${i + 1}/<agent>.json`),
      problems: inputs.problems,
    };
    if (!inputs.problems.length) {
      fs.mkdirSync(path.join(project, 'QA', 'critic'), { recursive: true });
      fs.writeFileSync(path.join(project, 'QA', 'critic', 'dispatch.json'), `${JSON.stringify(dispatch, null, 2)}\n`);
    }
    if (opts.json) console.log(JSON.stringify(dispatch, null, 2));
    else {
      console.log(`critic prepare: ${inputs.problems.length ? `${inputs.problems.length} problem(s)` : 'ready'} — ${inputs.frames.length} key frame(s), ${opts.votes} vote(s) × ${AGENTS.length} agents`);
      for (const x of inputs.problems) console.log(`  FAIL ${x}`);
    }
    return inputs.problems.length ? 3 : 0;
  }
  const t = tallyProject(project);
  if (opts.json) console.log(JSON.stringify(t, null, 2));
  else {
    console.log(`critic tally: ${t.ship ? 'SHIP' : 'not ship'} — ${t.passing_votes}/${t.votes} vote(s) pass, mean ${t.mean ?? '—'}, min ${t.min ?? '—'} → QA/critic.json`);
    for (const d of DIMENSIONS) console.log(`  ${d} ${DIMENSION_NAMES[d].padEnd(20)} ${t.dimensions[d].map((x) => (x === null ? '—' : x)).join(' / ')}`);
    for (const r of t.reasons) console.log(`  note ${r}`);
    for (const f of t.fixes.slice(0, 8)) console.log(`  fix  v${f.vote} ${f.dimension}=${f.score} (${f.critic}): ${f.fix ?? '—'}`);
  }
  return t.ship ? 0 : 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
