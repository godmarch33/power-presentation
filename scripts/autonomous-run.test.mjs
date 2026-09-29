import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_TOOLS, MAX_AGENTS_VAR, WALL_LIMIT_S, PARENT_SESSION_VARS, RUNS, SESSION_EFFORT, SESSION_ENV, SESSION_MODEL, agentCap, agentCapPrompt, buildCommand, deliverables, excluded, isolationArgs, main, pluginFiles, projectSlug, sessionEnv, stagePlugin, stagedPluginDir, verdict, workDir } from './autonomous-run.mjs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('RUNS: every invocation is unattended (--yes) and copies inputs the fixture has', () => {
  for (const [key, spec] of Object.entries(RUNS)) {
    assert.match(spec.args, /--yes\b/, key);
    for (const c of spec.copy) assert.ok(fs.existsSync(path.join(root, spec.fixture, c)), `${key}: ${spec.fixture}/${c}`);
  }
  assert.match(RUNS['gs-02-investors'].args, /--for investors .*--metrics metrics\.csv/);
});

test('buildCommand(): a headless plugin session with JSON output and pre-allowed tools', () => {
  const cmd = buildCommand(RUNS['gs-02-investors'], { repo: '/repo', claudeBin: 'claude' });
  assert.deepEqual(cmd.slice(0, 3), ['claude', '-p', '/power-presentation:present --for investors --duration 90 --local ./site --metrics metrics.csv --yes']);
  assert.deepEqual(cmd.slice(3), ['--plugin-dir', '/repo', '--model', 'opus', '--effort', 'high', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', ALLOWED_TOOLS.join(',')]);
  assert.deepEqual([SESSION_MODEL, SESSION_EFFORT], ['opus', 'high']);
});

test('agentCap() / buildCommand(): the operator subagent cap is appended to the system prompt, never invented', () => {
  assert.deepEqual(agentCap({}), { max: null, warning: null });
  assert.deepEqual(agentCap({ [MAX_AGENTS_VAR]: ' 2 ' }), { max: 2, warning: null });
  for (const bad of ['0', '-1', '1.5', 'two']) {
    const c = agentCap({ [MAX_AGENTS_VAR]: bad });
    assert.equal(c.max, null, bad);
    assert.match(c.warning, /ignored/);
  }
  const plain = buildCommand(RUNS['gs-02-investors'], { repo: '/repo' });
  assert.ok(!plain.includes('--append-system-prompt'));
  const capped = buildCommand(RUNS['gs-02-investors'], { repo: '/repo', maxAgents: 2 });
  assert.deepEqual(capped.slice(0, plain.length), plain);
  assert.deepEqual(capped.slice(plain.length), ['--append-system-prompt', agentCapPrompt(2)]);
  assert.match(agentCapPrompt(2), /more than 2 subagents .*batches of at most 2/);
  assert.match(agentCapPrompt(1), /more than 1 subagent \(/);
});

test('pluginFiles(): the session never gets the answer keys, the earlier runs or the dev-only files', () => {
  const kept = pluginFiles(['agents/story-director.md', 'examples/gs-01-plausible/expected-brief.md', 'evals/baseline/runs/plugin/gs-02/STORYBOARD.md', '.claude/CLAUDE.md', 'AGENTS.md', '.github/workflows/ci.yml', 'scripts/render-path.mjs', 'skills/present/references/examples-note.md',
    'scripts/autonomous-run.mjs', 'scripts/baseline.mjs', 'scripts/golden-set.mjs', 'scripts/render-path.test.mjs', 'scripts/test_wowprobe.py', 'CHANGELOG.md', 'README.md', 'scripts/README.md']);
  assert.deepEqual(kept, ['agents/story-director.md', 'scripts/render-path.mjs', 'skills/present/references/examples-note.md', 'scripts/README.md']);
  assert.equal(excluded('scripts/lib/x.test.mjs'), true);
  assert.equal(excluded('scripts/wowprobe.py'), false);
  assert.equal(excluded('vendor/product-launch-video/scripts/audio.test.mjs'), false);
  assert.equal(stagedPluginDir('/a/power-presentation-runs/plausible'), '/a/power-presentation-runs/.plugin/plausible');
});

test('pluginFiles(): no shipped script imports a file the staged plugin leaves out (GS-03: record-terminal → golden-set)', () => {
  const tracked = spawnSync('git', ['ls-files', 'scripts'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter((f) => f.endsWith('.mjs'));
  const shipped = pluginFiles(tracked);
  const broken = [];
  for (const f of shipped) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/^import\s[^;]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      if (excluded(target)) broken.push(`${f} → ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('stagePlugin(): this repository stages as a loadable plugin without examples/ or evals/', () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-stage-'));
  try {
    const rec = stagePlugin(root, dest);
    assert.ok(rec.files > 50 && /^[0-9a-f]{40}$/.test(rec.commit), JSON.stringify(rec));
    for (const f of ['.claude-plugin/plugin.json', 'skills/present/SKILL.md', 'agents/story-director.md', 'hooks/hooks.json', 'scripts/render-path.mjs']) assert.ok(fs.existsSync(path.join(dest, f)), f);
    for (const f of ['examples', 'evals', '.claude', 'AGENTS.md', '.git', 'README.md', 'CHANGELOG.md', 'scripts/autonomous-run.mjs', 'scripts/render-path.test.mjs']) assert.equal(fs.existsSync(path.join(dest, f)), false, f);
    assert.equal(fs.statSync(path.join(dest, 'scripts', 'render-path.mjs')).mode & 0o777, fs.statSync(path.join(root, 'scripts', 'render-path.mjs')).mode & 0o777);
    const hits = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/expected-brief|storyboard-skeleton|evals\/baseline\/runs/.test(fs.readFileSync(p, 'latin1'))) hits.push(path.relative(dest, p)); } };
    walk(dest);
    assert.deepEqual(hits, []);
  } finally { fs.rmSync(dest, { recursive: true, force: true }); }
});

test('verdict(): an undelivered run meets no limit, however fast and cheap; the session waits for its agents', () => {
  const early = verdict({ total_cost_usd: 5.19, num_turns: 58 }, 939, { delivered: { masters: [], run_report: false, complete: false } });
  assert.deepEqual([early.wall.pass, early.cost.pass], [false, false]);
  assert.equal(SESSION_ENV.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS, '0');
  assert.deepEqual(deliverables('/nonexistent'), { masters: [], run_report: false, complete: false });
});

test('verdict(): by wall time, by total_cost_usd (unknown without it)', () => {
  const ok = verdict({ total_cost_usd: 18.2, num_turns: 90 }, 1800);
  assert.deepEqual([ok.wall.pass, ok.cost.pass, ok.usd, ok.turns], [true, true, 18.2, 90]);
  const slow = verdict({ total_cost_usd: 31, is_error: true }, WALL_LIMIT_S + 1);
  assert.deepEqual([slow.wall.pass, slow.cost.pass, slow.is_error], [false, false, true]);
  assert.equal(verdict(null, 10).cost.pass, null);
});

test('main(): usage errors, and --dry-run prints the command without touching the run directory', () => {
  assert.equal(main([]), 2);
  assert.equal(main(['--run', 'gs-99']), 2);
  const logs = [];
  const orig = console.log;
  console.log = (s) => logs.push(String(s));
  try { assert.equal(main(['--run', 'gs-02-investors', '--out', '/nonexistent/pp-run', '--dry-run']), 0); } finally { console.log = orig; }
  assert.equal(main(['--run', 'gs-02-investors', '--out', path.join(root, 'evals', 'x')]), 2, 'a run dir inside the plugin is refused');
  assert.equal(workDir('gs-02-investors', '/a/power-presentation'), '/a/power-presentation-runs/ledgerly-investors');
  assert.match(logs.join('\n'), /run dir: \/nonexistent\/pp-run[\s\S]*plugin: \/nonexistent\/\.plugin\/pp-run[\s\S]*claude -p "\/power-presentation:present --for investors[\s\S]*--plugin-dir \/nonexistent\/\.plugin\/pp-run/);
  assert.equal(fs.existsSync('/nonexistent/pp-run'), false);
});

test('isolation: the session sees its run dir, its transcripts and the plugin (read-only) — not the repo, the other runs or other sessions', () => {
  const a = isolationArgs({ repo: '/r', out: '/x/runs/plausible', pluginDir: '/x/runs/.plugin/plausible', projectsDir: '/h/.claude/projects', tmpDir: '/tmp/claude-1000' });
  assert.deepEqual(a, ['--dev-bind', '/', '/', '--tmpfs', '/tmp/claude-1000', '--tmpfs', '/r', '--tmpfs', '/x/runs', '--bind', '/x/runs/plausible', '/x/runs/plausible', '--ro-bind', '/x/runs/.plugin/plausible', '/x/runs/.plugin/plausible', '--tmpfs', '/h/.claude/projects', '--bind', '/h/.claude/projects/-x-runs-plausible', '/h/.claude/projects/-x-runs-plausible']);
  assert.equal(projectSlug('/srv/u/power-presentation-runs/_smoke/r1'), '-srv-u-power-presentation-runs--smoke-r1');
  const env = sessionEnv({ PATH: '/bin', CLAUDE_CODE_SESSION_ID: 'parent', CLAUDE_EFFORT: 'xhigh', CLAUDE_CODE_MESSAGING_TOKEN: 't', POWER_PRESENTATION_NICE: '10' });
  assert.deepEqual(env, { PATH: '/bin', POWER_PRESENTATION_NICE: '10', CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' });
  assert.ok(PARENT_SESSION_VARS.includes('CLAUDE_CODE_BRIDGE_SESSION_ID'));
  for (const spec of Object.values(RUNS)) assert.doesNotMatch(spec.slug, /gs-\d/, 'a run directory name must not name the fixture');
});

import { HARNESS_FILES, collect, rootLeaks, runWorkspace } from './autonomous-run.mjs';

test('runWorkspace() / rootLeaks() / collect(): the pass lives in <run>/power-presentation-out/<name>/; anything beside the inputs is a leak', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ar-ws-'));
  fs.mkdirSync(path.join(out, 'site'));
  fs.writeFileSync(path.join(out, 'claims.json'), '{}');
  assert.equal(runWorkspace(out), out, 'no workspace (a pass from before the layout) → the run directory');
  const ws = path.join(out, 'power-presentation-out', 'ledgerly-sales');
  fs.mkdirSync(path.join(ws, 'renders', 'final'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'renders', 'final', 'ledgerly-sales_16x9.mp4'), 'mp4');
  fs.writeFileSync(path.join(ws, 'run-report.json'), '{}');
  fs.writeFileSync(path.join(ws, 'STORYBOARD.md'), '# sb');
  for (const f of HARNESS_FILES) fs.writeFileSync(path.join(out, f), '{}');
  assert.equal(runWorkspace(out), ws);
  assert.equal(deliverables(runWorkspace(out)).complete, true);
  assert.deepEqual(rootLeaks(out, ['site', 'claims.json']), [], 'inputs, harness files and the workspace only');
  fs.writeFileSync(path.join(out, 'index.html'), '<div id="root">');
  fs.mkdirSync(path.join(out, 'compositions'));
  assert.deepEqual(rootLeaks(out, ['site', 'claims.json']), ['compositions', 'index.html'], 'a scaffold in the project root is a leak');
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ar-dest-'));
  fs.mkdirSync(path.join(dest, 'compositions', 'frames'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'compositions', 'frames', '04-old-pass.html'), 'first pass');
  fs.writeFileSync(path.join(dest, 'notes.md'), '# kept');
  const copied = collect(ws, dest, { run: out });
  assert.equal(fs.existsSync(path.join(dest, 'compositions', 'frames', '04-old-pass.html')), false, 'an earlier pass never lingers in the record');
  assert.equal(fs.readFileSync(path.join(dest, 'notes.md'), 'utf8'), '# kept', 'the hand-written notes stay');
  assert.ok(copied.includes('STORYBOARD.md') && copied.includes('run-report.json') && copied.includes('claude-result.json') && copied.includes('autonomous-run.json'), copied.join(', '));
  assert.ok(copied.some((c) => c.startsWith('final.mp4 (= renders/final/ledgerly-sales_16x9.mp4)')));
  fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(dest, { recursive: true, force: true });
});

import { expectChecks } from './autonomous-run.mjs';

test('gs-02-repo / expectChecks(): the --repo pass must show the repository route — intake source kind and the source plan', () => {
  const spec = RUNS['gs-02-repo'];
  assert.match(spec.args, /--repo --yes$/); assert.doesNotMatch(spec.args, /--local|--url/, 'the repository is the only source');
  assert.deepEqual(spec.copy, ['site', 'claims.json'], 'no fixture README: it is the answer key');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ar-expect-'));
  assert.deepEqual(expectChecks(spec, work).failed, ['source_kind', 'route:web-ui']);
  fs.writeFileSync(path.join(work, 'intake.json'), JSON.stringify({ declared: { source: { kind: 'repo', value: '/r' } } }));
  fs.writeFileSync(path.join(work, 'source-plan.json'), JSON.stringify({ routes: [{ class: 'web-ui', source: 'local-static' }] }));
  assert.deepEqual(expectChecks(spec, work), { ok: true, failed: [], results: [
    { check: 'source_kind', ok: true, detail: 'intake.json source.kind = repo (expected repo)' },
    { check: 'route:web-ui', ok: true, detail: 'source-plan.json web-ui → local-static' },
  ] });
  assert.equal(expectChecks(RUNS['gs-03-marketing'], work), null, 'a run without expectations');
  fs.rmSync(work, { recursive: true, force: true });
});
