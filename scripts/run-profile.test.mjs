import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MIX, MODEL_MIXES, ROLES, runProfile } from './lib/run-profile.mjs';
import { buildReport } from './run-report.mjs';
import { progressOf } from './progress.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('runProfile(): defaults — opus-orchestrator, critic on with 3 votes, no agent cap', () => {
  const p = runProfile({ intake: null, env: {} });
  assert.equal(p.model_mix, DEFAULT_MIX);
  assert.deepEqual([p.critic, p.critic_votes, p.agents_at_once, p.fix_rounds], ['on', 3, null, 1]);
  assert.deepEqual(p.roles, { orchestrator: 'inherit', story_director: 'opus', frame_worker: 'sonnet', critics: 'sonnet' });
  assert.deepEqual(p.source, { model_mix: 'default', critic: 'default' });
  assert.deepEqual(MODEL_MIXES, ['economy', 'all-sonnet', 'opus-orchestrator', 'all-opus']);
  for (const m of MODEL_MIXES) assert.ok(ROLES[m], m);
});

test('runProfile(): economy — Sonnet everywhere, no critic, two agents at a time; --critic brings one vote back', () => {
  const e = runProfile({ env: { CLAUDE_PLUGIN_OPTION_MODEL_MIX: 'economy' } });
  assert.deepEqual([e.model_mix, e.critic, e.critic_votes, e.agents_at_once], ['economy', 'off', 0, 2]);
  assert.deepEqual(e.roles, { orchestrator: 'inherit', story_director: 'sonnet', frame_worker: 'sonnet', critics: null });
  assert.deepEqual(e.source, { model_mix: 'userConfig:model_mix', critic: 'economy profile' });
  const back = runProfile({ intake: { declared: { critic: true } }, env: { CLAUDE_PLUGIN_OPTION_MODEL_MIX: 'economy' } });
  assert.deepEqual([back.critic, back.critic_votes, back.roles.critics, back.source.critic], ['on', 1, 'sonnet', 'flag']);
});

test('runProfile(): flags beat the options; the critic option auto/on/off; unknown values fall back', () => {
  assert.equal(runProfile({ intake: { model_mix: 'all-opus' }, env: { CLAUDE_PLUGIN_OPTION_MODEL_MIX: 'economy' } }).model_mix, 'all-opus');
  assert.equal(runProfile({ intake: { critic: 'off' }, env: {} }).critic, 'off');
  assert.equal(runProfile({ intake: { declared: { critic: false } }, env: {} }).critic, 'off');
  assert.equal(runProfile({ env: { CLAUDE_PLUGIN_OPTION_CRITIC: 'off' } }).source.critic, 'userConfig:critic');
  assert.equal(runProfile({ env: { CLAUDE_PLUGIN_OPTION_CRITIC: 'auto' } }).critic, 'on');
  assert.equal(runProfile({ intake: { model_mix: 'cheap' }, env: { CLAUDE_PLUGIN_OPTION_MODEL_MIX: 'turbo' } }).model_mix, DEFAULT_MIX);
});

test('render-path profile prints the resolved profile; run-report marks a switched-off critic as off, not failed; the bar ends after deliver', () => {
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pp-rp-')));
  try {
    fs.writeFileSync(path.join(project, 'intake.json'), JSON.stringify({ declared: { for: 'marketing', critic: false }, model_mix: 'economy' }));
    const r = spawnSync(process.execPath, [path.join(here, 'render-path.mjs'), 'profile', '--project', project], { encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_OPTION_MODEL_MIX: '', CLAUDE_PLUGIN_OPTION_CRITIC: '' } });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual([out.model_mix, out.critic, out.agents_at_once], ['economy', 'off', 2]);
    const intake = JSON.parse(fs.readFileSync(path.join(project, 'intake.json'), 'utf8'));
    const report = buildReport({ project, intake, storyboard: '## Frame 1 — Hook\n- role: hook\n- duration: 3s\n', read: [], missing: [] }, { now: '2026-09-28T00:00:00.000Z' });
    assert.deepEqual([report.critic.off, report.critic.off_by, report.ship.critic_ok], [true, 'flag', null]);
    assert.match(report.ship.note, /critic was switched off \(flag\)/);
    assert.equal(report.model_mix.profile, 'economy');
    fs.mkdirSync(path.join(project, '.hyperframes'));
    const at = (s) => new Date(Date.parse('2026-09-28T10:00:00Z') + s * 1000).toISOString();
    const runs = ['intake', 'inspect', 'capture', 'storyboard', 'frames', 'assemble', 'verify', 'render', 'deliver'].map((stage, i) => ({ stage, at: at((i + 1) * 60), seconds: 30, ok: true }));
    fs.writeFileSync(path.join(project, '.hyperframes', 'pp-stages.json'), JSON.stringify({ runs, pending: {} }));
    const pr = progressOf(project, { now: Date.parse('2026-09-28T10:10:00Z') });
    assert.deepEqual([pr.stage, pr.label, pr.percent], [null, 'Wrapping up', 99]);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
