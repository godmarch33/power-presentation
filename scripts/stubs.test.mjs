import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const NOT_IMPLEMENTED = 64;

const STUBS = [
  ['render-scenes.mjs', ['node'], 'render-scenes.mjs'],
  ['scene-key.mjs', ['node'], 'scene-key.mjs'],
];

function run(interp, script, args) {
  return spawnSync(interp[0], [...interp.slice(1), path.join(here, script), ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: '', CLAUDE_PLUGIN_DATA: '' },
  });
}

function interpreterAvailable(interp) {
  const probe = spawnSync(interp[0], ['--version'], { encoding: 'utf8' });
  return !probe.error && probe.status === 0;
}

for (const [name, interp, script] of STUBS) {
  test(`${name}: bare run exits ${NOT_IMPLEMENTED} with NOT IMPLEMENTED on stderr`, (t) => {
    if (!interpreterAvailable(interp)) return t.skip(`${interp[0]} not available`);
    const r = run(interp, script, []);
    assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
    assert.equal(r.status, NOT_IMPLEMENTED, `exit code was ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stderr, /NOT IMPLEMENTED/, 'stderr must say NOT IMPLEMENTED');
    assert.match(r.stderr, /planned for v1/, 'stderr says when it lands');
    assert.equal(r.stdout.trim(), '', 'a stub must not print anything that looks like a result on stdout');
  });

  test(`${name}: --help exits 0 and prints usage`, (t) => {
    if (!interpreterAvailable(interp)) return t.skip(`${interp[0]} not available`);
    const r = run(interp, script, ['--help']);
    assert.equal(r.status, 0, `exit code was ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /[Uu]sage/, 'help output must contain "Usage"');
  });

  test(`${name}: an unknown flag never yields exit 0`, (t) => {
    if (!interpreterAvailable(interp)) return t.skip(`${interp[0]} not available`);
    const r = run(interp, script, ['--definitely-not-a-flag']);
    assert.notEqual(r.status, 0);
  });
}

test('stubs with realistic arguments still exit 64 (never fake success)', (t) => {
  const cases = [
    [['node'], 'render-scenes.mjs', ['--scenes', '01,02', '--final', '--fps', '30', '--quality', 'delivery', '--resolution', '1920x1080']],
    [['node'], 'scene-key.mjs', ['--project', '.', '--scene', '01']],
  ];
  for (const [interp, script, args] of cases) {
    if (!interpreterAvailable(interp)) {
      t.diagnostic(`skipping ${script}: ${interp[0]} not available`);
      continue;
    }
    const r = run(interp, script, args);
    assert.equal(r.status, NOT_IMPLEMENTED, `${script} ${args.join(' ')} -> ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stderr, /NOT IMPLEMENTED/);
  }
});

test('analyze_music_cues.py: ported verbatim with the MIT attribution header (THIRD_PARTY_NOTICES.md)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(path.join(here, 'analyze_music_cues.py'), 'utf8');
  const lines = src.split('\n');
  assert.equal(lines[0], '#!/usr/bin/env python3', 'shebang must stay on line 1');
  assert.match(src, /Ported from latent-spaces\/brag v0\.2\.2 \(MIT\)/);
  assert.match(src, /THIRD_PARTY_NOTICES\.md/);
  assert.match(src, /^import librosa$/m, 'librosa import kept (optional dependency, see scripts/README.md)');
  assert.match(src, /def analyze_track\(/, 'original body present');
});
