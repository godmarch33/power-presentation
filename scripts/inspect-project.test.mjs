import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLASSES, SIGNALS, SCENES, CAPTURE_BY_CLASS, READ_DENY, UI_CLASSES, RUNNABLE_CLASSES, CONCEPT_CLASSES, UI_SIGNALS,
  SECONDARY_EVIDENCE, STRONG_RUNNABLE_SIGNALS,
  parseArgs, buildProfile, walkRepo, readDenied, scenesFor, scoreClasses, assessConfidence, secondaryClasses, tierOf, PROFILE_SCHEMA,
} from './inspect-project.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'inspect-project.mjs');
const examples = path.join(here, '..', 'examples');

const PRODUCT_CLASSES = ['web-ui', 'mobile', 'desktop', 'cli', 'api/backend', 'library/sdk', 'data/ml', 'mocks/design', 'files/docs'];
const ALL_SIGNALS = Object.values(SIGNALS).flatMap((e) => e.signals);
const ids = (p) => p.signals.map((s) => s.id).sort();

const tmpDirs = [];
function repo(tree) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-inspect-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(tree)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (rel.endsWith('/')) { fs.mkdirSync(abs, { recursive: true }); continue; }
    fs.writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

const pkg = (extra) => JSON.stringify({ name: 'x', version: '1.0.0', ...extra }, null, 2);
const FIGMA = 'https://www.figma.com/file/AbCdEf1234567890AbCdEf/app';

test('CLASSES are the nine classes, verbatim and in order; tiers split 3 UI / 7 runnable / 2 concept', () => {
  assert.deepEqual([...CLASSES], PRODUCT_CLASSES);
  assert.deepEqual([...UI_CLASSES], ['web-ui', 'mobile', 'desktop']);
  assert.deepEqual([...RUNNABLE_CLASSES], PRODUCT_CLASSES.slice(0, 7));
  assert.deepEqual([...CONCEPT_CLASSES], ['mocks/design', 'files/docs']);
  const all = ALL_SIGNALS.map((s) => s.id);
  for (const id of [...UI_SIGNALS, ...SECONDARY_EVIDENCE, ...STRONG_RUNNABLE_SIGNALS]) assert.ok(all.includes(id), `signal ${id} exists`);
  assert.equal(tierOf('web-ui', ['frontend-framework']), 'ui');
  assert.equal(tierOf('web-ui', ['frontend-tooling']), 'runnable', 'tooling alone is not a UI');
  assert.equal(tierOf('web-ui', ['html-files']), 'runnable', 'plain HTML files alone are not a UI');
  assert.equal(tierOf('web-ui', ['declared-url'], ['declared-url', 'package-bin']), 'declared', 'a URL alone drops below every runnable class next to a cli signal');
  assert.equal(tierOf('web-ui', ['declared-url'], ['declared-url', 'docs-dir']), 'ui');
  assert.equal(tierOf('cli', ['package-bin']), 'runnable');
  assert.equal(tierOf('files/docs', ['docs-dir']), 'concept');
});

test('SIGNALS has exactly one entry per class (all 9 covered, nothing extra)', () => {
  assert.deepEqual(Object.keys(SIGNALS).sort(), [...PRODUCT_CLASSES].sort());
});

test('every class has ≥ 1 signal; documented signals are weight 4; heuristics ≤ 3 except in the three heuristic-only classes', () => {
  for (const cls of PRODUCT_CLASSES) {
    const entry = SIGNALS[cls];
    assert.ok(Array.isArray(entry.signals) && entry.signals.length > 0, `${cls} must have signals`);
    const documented = entry.signals.some((s) => !/^heuristic/.test(s.source ?? ''));
    if (!documented) assert.match(entry.note ?? '', /heuristic/, `${cls} has only heuristics so its note must say so`);
    for (const s of entry.signals) {
      if (/^heuristic/.test(s.source ?? '') && !entry.note) assert.ok(s.weight <= 3, `${cls}/${s.id}: a heuristic next to signals must stay ≤ 3`);
    }
  }
  assert.ok(SIGNALS.mobile.note && SIGNALS.desktop.note && SIGNALS['library/sdk'].note, 'mobile, desktop, library/sdk keep their note');
});

test('every signal has a unique id, a known kind, a positive weight; a heuristic says so in its source', () => {
  const kinds = new Set(['glob', 'package-field', 'content', 'absence', 'declared']);
  const seen = new Set();
  for (const [cls, entry] of Object.entries(SIGNALS)) {
    for (const s of entry.signals) {
      assert.ok(typeof s.id === 'string' && !seen.has(s.id), `${cls}: duplicate or missing id ${s.id}`);
      seen.add(s.id);
      assert.ok(typeof s.signal === 'string' && s.signal.length > 0, `${cls}: signal text`);
      assert.ok(kinds.has(s.kind), `${cls}: unknown kind ${s.kind}`);
      assert.ok(Number.isInteger(s.weight) && s.weight >= 1 && s.weight <= 4, `${cls}/${s.id}: weight 1..4`);
      assert.ok(s.source === undefined || s.source === 'heuristic', `${cls}: signal "${s.id}" has an unknown source ${s.source}`);
    }
  }
});

test('the documented signals are all present, not heuristics and at the top weight', () => {
  const expected = [
    'frontend-framework', 'openapi-spec', 'dockerfile', 'package-bin', 'notebooks', 'figma-link', 'only-md', 'datasets-only',
  ];
  for (const id of expected) {
    const s = ALL_SIGNALS.find((x) => x.id === id);
    assert.ok(s, `missing signal ${id}`);
    assert.equal(s.source, undefined, `${id} is a documented signal, not a heuristic`);
    if (id !== 'dockerfile') assert.equal(s.weight, 4, `${id} carries the top weight`);
  }
  for (const id of ['bin-dir', 'pyproject-scripts', 'mocks-dir', 'docs-dir', 'data-dir', 'vhs-tape']) assert.ok(ALL_SIGNALS.some((x) => x.id === id && x.source === undefined), `documented signal ${id}`);
});

test('SCENES is the composition table: 9 rows, every class served by ≥ 1 MVP scene', () => {
  assert.equal(SCENES.length, 9);
  for (const cls of PRODUCT_CLASSES) {
    const mvp = SCENES.filter((s) => s.phase === 'MVP' && (s.classes.includes(cls) || s.classes.includes('*')) && s.type !== 'logo-outro');
    assert.ok(mvp.length >= 1, `${cls} has no MVP scene`);
    const own = scenesFor(cls).scenes.filter((s) => s.type !== 'logo-outro');
    assert.ok(own.length >= 1, `scenesFor(${cls}) must return a product scene`);
  }
  assert.equal(SCENES.find((s) => s.type === 'diagram').phase, 'v1');
  assert.deepEqual(scenesFor('api/backend', ['data/ml']).deferred.map((s) => s.type), ['diagram'], 'deferred scenes are deduped');
  assert.equal(scenesFor('cli').scenes.at(-1).type, 'logo-outro', 'outro is always last (QA-13)');
  assert.ok(Object.isFrozen(SIGNALS) && Object.isFrozen(CLASSES) && Object.isFrozen(SCENES));
});

test('CAPTURE_BY_CLASS: only web-ui needs a URL; every class has a backend', () => {
  for (const cls of PRODUCT_CLASSES) {
    assert.ok(CAPTURE_BY_CLASS[cls]?.backend, `${cls} backend`);
    assert.equal(CAPTURE_BY_CLASS[cls].needs_url, cls === 'web-ui', `${cls} needs_url`);
  }
});

test('READ_DENY covers .env*, *.pem and fixtures with glob semantics (any depth, any case)', () => {
  assert.equal(readDenied('.env'), 'env-files');
  assert.equal(readDenied('config/.env.production'), 'env-files');
  assert.equal(readDenied('.envrc'), 'env-files');
  assert.equal(readDenied('.ENV.md'), 'env-files');
  assert.equal(readDenied('.env_local'), 'env-files');
  assert.equal(readDenied('.env/lib/x.py'), 'env-files', 'anything under a .env* directory');
  assert.equal(readDenied('certs/server.PEM'), 'pem');
  assert.equal(readDenied('test/fixtures/users.json'), 'fixtures');
  assert.equal(readDenied('test/fixture/x.md'), 'fixtures');
  assert.equal(readDenied('src/__fixtures__/a.md'), 'fixtures');
  assert.equal(readDenied('test_data/x.md'), 'fixtures');
  assert.equal(readDenied('id_rsa'), 'keys-and-credentials');
  assert.equal(readDenied('src/index.ts'), null);
  assert.equal(readDenied('environment.yml'), null, 'environment.yml is not an env file');
  assert.equal(readDenied('fixtures.md'), null, 'a file named fixtures.md is not a fixtures directory');
});

test('parseArgs handles the documented flags and rejects unknown or malformed ones', () => {
  const o = parseArgs(['--repo', '/tmp/x', '--url', 'https://p.test', '--out', 'pp.json', '--print', '--max-files', '10', '--max-depth', '2']);
  assert.equal(o.repo, path.resolve('/tmp/x'));
  assert.equal(o.url, 'https://p.test');
  assert.equal(o.out, 'pp.json');
  assert.equal(o.print, true);
  assert.equal(o.maxFiles, 10);
  assert.equal(o.maxDepth, 2);
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['--list-signals']).listSignals, true);
  assert.equal(parseArgs(['--list-scenes']).listScenes, true);
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
  assert.throws(() => parseArgs(['--url', 'not a url']), /not a valid URL/);
  assert.throws(() => parseArgs(['--url', 'ftp://x.test']), /http\(s\)/);
  assert.throws(() => parseArgs(['--max-files', '0']), /positive integer/);
});

test('--list-signals / --list-scenes print JSON and exit 0; --help prints usage', () => {
  const r = spawnSync('node', [script, '--list-signals'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.deepEqual(parsed.classes, PRODUCT_CLASSES);
  assert.deepEqual(Object.keys(parsed.signals).sort(), [...PRODUCT_CLASSES].sort());
  assert.ok(parsed.read_deny.some((x) => x.id === 'env-files'));
  const s = spawnSync('node', [script, '--list-scenes'], { encoding: 'utf8' });
  assert.equal(s.status, 0);
  assert.equal(JSON.parse(s.stdout).scenes.length, 9);
  const h = spawnSync('node', [script, '--help'], { encoding: 'utf8' });
  assert.equal(h.status, 0);
  assert.match(h.stdout, /Usage/);
});

test('exit codes: 2 on usage error, 1 when --repo is not a (readable) directory, 0 on success (also when ambiguous)', (t) => {
  assert.equal(spawnSync('node', [script, '--nope'], { encoding: 'utf8' }).status, 2);
  const r1 = spawnSync('node', [script, '--repo', path.join(os.tmpdir(), 'pp-does-not-exist-' + process.pid), '--out', '-'], { encoding: 'utf8' });
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /not a readable directory/);
  const empty = repo({ LICENSE: 'MIT' });
  const r0 = spawnSync('node', [script, '--repo', empty, '--out', '-'], { encoding: 'utf8' });
  assert.equal(r0.status, 0, r0.stderr);
  const p = JSON.parse(r0.stdout);
  assert.equal(p.surface, null);
  assert.equal(p.ambiguous, true);
  assert.equal(p.mode, 'unknown');
  assert.ok(p.question && p.question.field === 'surface');
  assert.match(r0.stderr, /ambiguous/);
  if (process.getuid && process.getuid() === 0) return t.diagnostic('root ignores directory modes; unreadable-repo case skipped');
  const locked = repo({ 'README.md': '# x' });
  fs.chmodSync(locked, 0o000);
  try {
    const r2 = spawnSync('node', [script, '--repo', locked, '--out', '-'], { encoding: 'utf8' });
    assert.equal(r2.status, 1, 'an unreadable --repo is a runtime failure, not an empty profile');
  } finally {
    fs.chmodSync(locked, 0o755);
  }
});

test('--out writes product-profile.json (directories created) and the file equals --print output', () => {
  const dir = repo({ 'package.json': pkg({ bin: { acme: 'cli.js' } }), 'cli.js': '#!/usr/bin/env node\n' });
  const out = path.join(dir, 'nested', 'product-profile.json');
  const r = spawnSync('node', [script, '--repo', dir, '--out', out, '--print'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const fromFile = JSON.parse(fs.readFileSync(out, 'utf8'));
  const fromStdout = JSON.parse(r.stdout);
  assert.deepEqual(fromFile, fromStdout);
  assert.equal(fromFile.schema, PROFILE_SCHEMA);
  assert.equal(fromFile.surface, 'cli');
  assert.match(r.stderr, /surface=cli/);
});

const CASES = [
  ['web-ui', {
    'package.json': pkg({ private: true, dependencies: { react: '^19', 'react-dom': '^19', next: '^15' } }),
    'next.config.js': 'module.exports = {}', 'app/page.tsx': 'export default () => null', Dockerfile: 'FROM node',
  }, { confidence: 'high', needs_url: true, signals: ['dockerfile', 'frontend-framework', 'frontend-tooling'], secondary: [], scenes: ['product-ui', 'logo-outro'] }],
  ['mobile', {
    'package.json': pkg({ private: true, dependencies: { react: '^19', 'react-native': '^0.80', expo: '^53' } }),
    'App.tsx': 'export default () => null', 'app.json': '{}',
  }, { confidence: 'high', signals: ['mobile-framework'], secondary: [], scenes: ['product-ui', 'logo-outro'] }],
  ['desktop', {
    'package.json': pkg({ private: true, dependencies: { react: '^19' }, devDependencies: { electron: '^36' } }),
    'src/main.ts': 'app.whenReady()', 'src/index.html': '<html></html>',
  }, { confidence: 'high', signals: ['desktop-framework'], secondary: [], scenes: ['product-ui', 'logo-outro'] }],
  ['cli', {
    'pyproject.toml': '[project]\nname = "acmecli"\ndependencies = ["click>=8"]\n\n[project.scripts]\nacme = "acmecli.main:cli"\n',
    'src/acmecli/main.py': 'import click\n', 'demo.tape': 'Output demo.mp4\n',
  }, { confidence: 'high', needs_url: false, signals: ['cli-library', 'pyproject-scripts', 'vhs-tape'], secondary: [], scenes: ['terminal / code', 'logo-outro'] }],
  ['api/backend', {
    'package.json': pkg({ private: true, dependencies: { express: '^5' } }),
    'src/server.js': 'const app = require("express")()', Dockerfile: 'FROM node', 'openapi.yaml': 'openapi: 3.1.0\n',
    'docker-compose.yml': 'services: {}',
  }, { confidence: 'high', needs_url: false, signals: ['api-schema-files', 'dockerfile', 'no-frontend-framework', 'openapi-spec', 'server-framework'], secondary: [], scenes: ['api-card', 'logo-outro'] }],
  ['library/sdk', {
    'package.json': pkg({ main: 'dist/index.js', types: 'dist/index.d.ts', files: ['dist'], peerDependencies: { react: '>=18' }, devDependencies: { react: '^19', 'react-dom': '^19', tsup: '^8' } }),
    'src/index.ts': 'export const x = 1', 'README.md': '# lib\n\n## Quickstart\n', 'examples/basic.ts': 'import {x} from "x"',
  }, { confidence: 'high', signals: ['examples-dir', 'framework-plugin', 'frontend-tooling', 'npm-library', 'publish-signals'], secondary: [], scenes: ['terminal / code', 'comparison', 'logo-outro'] }],
  ['data/ml', {
    'requirements.txt': 'pandas\nscikit-learn\ntorch\n', 'notebooks/explore.ipynb': '{}', 'train.py': 'import torch',
    'data/train.csv': 'a,b\n1,2\n', 'dvc.yaml': 'stages: {}',
  }, { confidence: 'high', signals: ['data-dir', 'data-library', 'dataset-files', 'ml-pipeline-files', 'notebooks', 'notebooks-dir'], secondary: [], scenes: ['metrics / chart', 'logo-outro'] }],
  ['mocks/design', {
    'README.md': `# Concept\n\nFrames: ${FIGMA}\n`, 'mocks/home.png': 'png', 'design/flow.fig': 'fig',
  }, { confidence: 'high', mode: 'concept', signals: ['design-dir', 'design-files', 'figma-link', 'mocks-dir'], secondary: [], scenes: ['design-frames', 'logo-outro'] }],
  ['files/docs', {
    'README.md': '# Docs\n', 'docs/guide.md': '# Guide\n', 'docs/handbook.pdf': 'pdf', LICENSE: 'MIT',
  }, { confidence: 'high', mode: 'concept', signals: ['docs-dir', 'document-files', 'only-md'], secondary: [], scenes: ['file / doc', 'logo-outro'] }],
];

for (const [expected, tree, want] of CASES) {
  test(`detects ${expected} on a synthetic repository (exact signals, secondary and scenes)`, () => {
    const p = buildProfile(repo(tree));
    assert.equal(p.surface, expected, JSON.stringify(p.candidates));
    assert.equal(p.confidence, want.confidence, JSON.stringify(p.candidates));
    assert.deepEqual(ids(p), want.signals);
    assert.deepEqual(p.secondary, want.secondary);
    assert.deepEqual(p.scenes.map((s) => s.type), want.scenes);
    assert.equal(p.mode, want.mode ?? 'product');
    if (want.confidence === 'high') assert.equal(p.question, null, 'no question at high confidence');
    if (want.needs_url !== undefined) assert.equal(p.capture.needs_url, want.needs_url);
    assert.equal(p.capture.chrome_needed_for, ['web-ui', 'desktop'].includes(expected) ? p.capture.chrome_needed_for : 'render only');
    if (['web-ui', 'desktop'].includes(expected)) assert.match(p.capture.chrome_needed_for, /capture .*and render/);
    for (const s of p.signals) assert.ok(s.evidence.length > 0, `signal ${s.id} carries evidence`);
    if (expected !== 'web-ui') assert.ok(p.notes.some((n) => /Product without UI/.test(n)), 'non-UI note present');
    if (want.mode === 'concept') assert.ok(p.notes.some((n) => /Concept-video mode/.test(n)), 'concept note present');
    else assert.ok(!p.notes.some((n) => /Concept-video mode/.test(n)), 'no concept note for a product');
  });
}

test('single-signal trees: each documented signal fires alone and lands on its class', () => {
  const SINGLE = [
    [{ 'package.json': pkg({ bin: 'cli.js' }), 'cli.js': '' }, 'package-bin', 'cli'],
    [{ 'setup.cfg': '[metadata]\nname = t\n[options.entry_points]\nconsole_scripts =\n    t = t:main\n', 't.py': '' }, 'pyproject-scripts', 'cli'],
    [{ 'demo.tape': 'Output x.mp4' }, 'vhs-tape', 'cli'],
    [{ 'bin/acme': '#!/bin/sh\n' }, 'bin-dir', 'cli'],
    [{ 'openapi.json': '{}' }, 'openapi-spec', 'api/backend'],
    [{ 'api/swagger-v2.yaml': '' }, 'openapi-spec', 'api/backend'],
    [{ 'notebooks/a.ipynb': '{}' }, 'notebooks', 'data/ml'],
    [{ 'README.md': FIGMA }, 'figma-link', 'mocks/design'],
    [{ 'mocks/a.png': '' }, 'mocks-dir', 'mocks/design'],
    [{ 'data/a.csv': 'x' }, 'datasets-only', 'files/docs'],
    [{ 'docs/a.pdf': '' }, 'docs-dir', 'files/docs'],
  ];
  for (const [tree, id, cls] of SINGLE) {
    const p = buildProfile(repo(tree));
    assert.ok(ids(p).includes(id), `${id}: got ${ids(p)}`);
    assert.equal(p.surface, cls, `${id} → ${cls}, got ${p.surface}`);
  }
  const only = buildProfile(repo({ 'README.md': '# x', 'docs/a.md': '', 'logo.png': '', LICENSE: 'MIT' }));
  assert.deepEqual(ids(only), ['docs-dir', 'only-md'], 'images and LICENSE are inert for only-md');
});

test('datasets-only repository (CSV, no code, no notebooks) is files/docs, not data/ml — even with an inert manifest', () => {
  const p = buildProfile(repo({ 'data/a.csv': 'x\n1\n', 'data/b.parquet': 'bin', 'README.md': '# dataset\n' }));
  assert.equal(p.surface, 'files/docs');
  assert.ok(p.candidates[0].signals.includes('datasets-only'));
  assert.equal(p.mode, 'concept');
  const withRuff = buildProfile(repo({ 'pyproject.toml': '[tool.ruff]\nline-length = 88\n', 'data/train.csv': 'x', 'README.md': '# d' }));
  assert.equal(withRuff.surface, 'files/docs', 'a [tool.ruff] pyproject is not code');
  assert.equal(withRuff.facts.has_code, false);
  const docsWithPrettier = buildProfile(repo({ 'package.json': pkg({ private: true, devDependencies: { prettier: '^3' } }), 'README.md': '# d', 'docs/a.md': '' }));
  assert.equal(docsWithPrettier.confidence, 'high', 'a docs repo with a prettier package.json keeps only-md');
});

test('monorepo web + api + sdk: web-ui wins (high), api/backend and library/sdk are secondary', () => {
  const p = buildProfile(repo({
    'package.json': pkg({ private: true, workspaces: ['apps/*', 'packages/*'] }),
    'apps/web/package.json': pkg({ private: true, dependencies: { react: '^19', vite: '^6' } }),
    'apps/web/index.html': '<html></html>',
    'apps/api/package.json': pkg({ private: true, dependencies: { fastify: '^5' } }),
    'apps/api/src/server.ts': 'fastify()', 'apps/api/openapi.json': '{}', Dockerfile: 'FROM node',
    'packages/sdk/package.json': pkg({ name: '@acme/sdk', main: 'dist/index.js', types: 'dist/index.d.ts' }),
    'packages/sdk/src/index.ts': '',
  }));
  assert.equal(p.surface, 'web-ui', JSON.stringify(p.candidates));
  assert.equal(p.confidence, 'high', 'a backend next to a UI is a secondary class, not a doubt');
  assert.deepEqual(p.secondary, ['api/backend', 'library/sdk']);
  assert.ok(p.scenes.some((s) => s.type === 'api-card'));
});

test('a CLI with a Docusaurus website/ or apps/docs stays a CLI: the docs site is weight-1 evidence, no secondary, no product-ui scene', () => {
  for (const site of ['website', 'apps/docs']) {
    const p = buildProfile(repo({
      'package.json': pkg({ bin: { acme: 'bin/acme.js' } }), 'bin/acme.js': '', 'README.md': '# acme',
      [`${site}/package.json`]: pkg({ private: true, dependencies: { react: '^19', '@docusaurus/core': '^3' } }),
      [`${site}/docs/intro.md`]: '# intro',
    }));
    assert.equal(p.surface, 'cli', `${site}: ${JSON.stringify(p.candidates)}`);
    assert.equal(p.confidence, 'high');
    assert.ok(p.signals.some((s) => s.id === 'docs-site'));
    assert.ok(!p.signals.some((s) => s.id === 'frontend-framework'));
    assert.deepEqual(p.secondary, []);
    assert.deepEqual(p.scenes.map((s) => s.type), ['terminal / code', 'logo-outro']);
  }
});

test('Electron (devDependency), React Native and Ink hosts own their frontend evidence', () => {
  const electron = buildProfile(repo({ 'package.json': pkg({ private: true, dependencies: { vue: '^3' }, devDependencies: { electron: '^36' } }), 'index.html': '<html></html>', 'src/main.ts': '' }));
  assert.equal(electron.surface, 'desktop', JSON.stringify(electron.candidates));
  assert.ok(!electron.candidates.some((c) => c.class === 'web-ui'), 'no separate web-ui candidate');
  const rn = buildProfile(repo({ 'package.json': pkg({ private: true, dependencies: { react: '^19', 'react-native': '^0.80' } }), 'App.tsx': '' }));
  assert.equal(rn.surface, 'mobile');
  const ink = buildProfile(repo({ 'package.json': pkg({ bin: { acme: 'dist/cli.js' }, dependencies: { ink: '^5', react: '^18', commander: '^12' } }), 'src/cli.tsx': '', 'README.md': '# acme' }));
  assert.equal(ink.surface, 'cli', JSON.stringify(ink.candidates));
  assert.equal(ink.confidence, 'high');
  assert.ok(!ink.candidates.some((c) => c.class === 'web-ui'));
  const wails = buildProfile(repo({ 'wails.json': '{}', 'go.mod': 'module x\n\nrequire github.com/wailsapp/wails/v2 v2.9.0\n', 'main.go': 'package main', 'frontend/package.json': pkg({ private: true, dependencies: { svelte: '^5' } }), 'frontend/index.html': '' }));
  assert.equal(wails.surface, 'desktop', JSON.stringify(wails.candidates));
});

test('Go: single-line and block require forms both parse; // indirect is ignored; cobra → cli, gin + Dockerfile → api/backend', () => {
  const single = buildProfile(repo({ 'go.mod': 'module x\n\ngo 1.22\n\nrequire github.com/spf13/cobra v1.8.0\nrequire google.golang.org/grpc v1.60.0 // indirect\n', 'main.go': 'package main', 'cmd/root.go': 'package cmd' }));
  assert.equal(single.surface, 'cli', JSON.stringify(single.candidates));
  assert.ok(ids(single).includes('cli-library'), 'single-line require is parsed');
  assert.ok(!ids(single).includes('server-framework'), 'indirect grpc is not a product dependency');
  assert.equal(single.confidence, 'high');
  const block = buildProfile(repo({ 'go.mod': 'module x\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.10.0\n)\n', 'main.go': 'package main', Dockerfile: 'FROM golang' }));
  assert.equal(block.surface, 'api/backend', JSON.stringify(block.candidates));
  assert.ok(ids(block).includes('server-framework'));
  assert.ok(block.candidates[0].signals.includes('no-frontend-framework'));
});

test('Rust: clap + src/main.rs → cli; [lib] → library/sdk; workspace members are read', () => {
  const cli = buildProfile(repo({ 'Cargo.toml': '[package]\nname = "x"\n\n[dependencies]\nclap = "4"\n', 'src/main.rs': 'fn main(){}' }));
  assert.equal(cli.surface, 'cli');
  const lib = buildProfile(repo({ 'Cargo.toml': '[package]\nname = "x"\n\n[lib]\npath = "src/lib.rs"\n', 'src/lib.rs': '' }));
  assert.equal(lib.surface, 'library/sdk');
  const ws = buildProfile(repo({ 'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n', 'crates/core/Cargo.toml': '[package]\nname = "core"\n[lib]\n', 'crates/core/src/lib.rs': '' }));
  assert.equal(ws.surface, 'library/sdk', JSON.stringify(ws.candidates));
});

test('Python: Django site with templates is web-ui (high); FastAPI service is api/backend; a Django reusable app is a library', () => {
  const dj = buildProfile(repo({ 'requirements.txt': 'django\n', 'manage.py': '', 'app/templates/index.html': '<html>', Dockerfile: 'FROM python' }));
  assert.equal(dj.surface, 'web-ui', JSON.stringify(dj.candidates));
  assert.equal(dj.confidence, 'high');
  assert.ok(dj.secondary.includes('api/backend'));
  const fa = buildProfile(repo({ 'pyproject.toml': '[project]\nname = "svc"\ndependencies = ["fastapi", "uvicorn"]\n', 'app/main.py': '', Dockerfile: 'FROM python' }));
  assert.equal(fa.surface, 'api/backend', JSON.stringify(fa.candidates));
  assert.ok(!fa.candidates.some((c) => c.class === 'library/sdk'), 'a FastAPI service is not a library');
  const reusable = buildProfile(repo({
    'pyproject.toml': '[build-system]\nrequires = ["setuptools"]\n\n[project]  # metadata\nname = "django-widgets"\ndependencies = [\n  "django>=4.2",  # host\n]\n',
    'src/django_widgets/__init__.py': '', 'README.md': '# widgets',
  }));
  assert.equal(reusable.surface, 'library/sdk', JSON.stringify(reusable.candidates));
  assert.ok(!ids(reusable).includes('server-framework'), 'a server framework without a runtime entry is not a backend');
});

test('npm: a bare `main` (npm init) is not a library; Express middleware with express in peerDependencies is a library; serverless.yml is a backend', () => {
  const initExpress = buildProfile(repo({ 'package.json': pkg({ main: 'index.js', dependencies: { express: '^5' } }), 'index.js': 'require("express")()' }));
  assert.equal(initExpress.surface, 'api/backend', JSON.stringify(initExpress.candidates));
  assert.ok(!ids(initExpress).includes('npm-library'));
  const middleware = buildProfile(repo({ 'package.json': pkg({ main: 'lib/index.js', types: 'lib/index.d.ts', peerDependencies: { express: '>=4' }, devDependencies: { express: '^5' } }), 'lib/index.js': '', 'README.md': '# mw' }));
  assert.equal(middleware.surface, 'library/sdk', JSON.stringify(middleware.candidates));
  assert.ok(ids(middleware).includes('framework-plugin'));
  const sls = buildProfile(repo({ 'package.json': pkg({ main: 'handler.js' }), 'handler.js': '', 'serverless.yml': 'service: api\n' }));
  assert.equal(sls.surface, 'api/backend', JSON.stringify(sls.candidates));
});

test('an SDK shipping an example Next app or a playground stays a library (the sample app is examples evidence, not the product UI)', () => {
  for (const dir of ['examples/next-app', 'playground']) {
    const p = buildProfile(repo({
      'package.json': pkg({ main: 'dist/index.js', exports: './dist/index.js', types: 'dist/index.d.ts', files: ['dist'] }),
      'src/index.ts': '', 'README.md': '# sdk\n\n## Quickstart',
      [`${dir}/package.json`]: pkg({ private: true, dependencies: { react: '^19', next: '^15' } }),
      [`${dir}/index.html`]: '<html>', [`${dir}/app/page.tsx`]: '',
    }));
    assert.equal(p.surface, 'library/sdk', `${dir}: ${JSON.stringify(p.candidates)}`);
    assert.equal(p.confidence, 'high');
    assert.ok(!ids(p).includes('frontend-framework'));
    assert.ok(!p.candidates.some((c) => c.class === 'web-ui'));
  }
});

test('Ruby: a gem with bin/console + bin/setup is a library; exe/ makes it a CLI; Rails bin/ scaffold is not a CLI', () => {
  const gem = buildProfile(repo({ 'acme.gemspec': 'Gem::Specification.new do |s|\n  s.name = "acme"\nend\n', 'lib/acme.rb': '', 'bin/console': '#!/usr/bin/env ruby', 'bin/setup': '#!/bin/sh' }));
  assert.equal(gem.surface, 'library/sdk', JSON.stringify(gem.candidates));
  assert.ok(!ids(gem).includes('bin-dir'));
  const gemCli = buildProfile(repo({ 'acme.gemspec': 'Gem::Specification.new do |s|\n  s.executables = ["acme"]\nend\n', 'lib/acme.rb': '', 'exe/acme': '#!/usr/bin/env ruby' }));
  assert.equal(gemCli.surface, 'cli', JSON.stringify(gemCli.candidates));
  const rails = buildProfile(repo({ Gemfile: "gem 'rails'\n", 'app/views/home/index.html.erb': '', 'app/controllers/home_controller.rb': '', 'bin/rails': '', 'bin/rake': '', 'config/routes.rb': '' }));
  assert.equal(rails.surface, 'web-ui', JSON.stringify(rails.candidates));
  assert.equal(rails.confidence, 'high');
  assert.deepEqual(rails.secondary, []);
});

test('a Maven jar without Spring and a composer type=library are libraries; a Java repo with docs/ is never a concept video', () => {
  const jar = buildProfile(repo({ 'pom.xml': '<project><packaging>jar</packaging></project>', 'src/main/java/com/acme/Core.java': '', 'docs/guide.md': '', 'README.md': '# core' }));
  assert.equal(jar.surface, 'library/sdk', JSON.stringify(jar.candidates));
  assert.equal(jar.mode, 'product');
  const composer = buildProfile(repo({ 'composer.json': '{"name":"acme/lib","type":"library"}', 'src/Lib.php': '' }));
  assert.equal(composer.surface, 'library/sdk');
});

test('C1: mode follows the facts — code the table does not recognise is never a concept video, and a Dockerfile without code is not a product', () => {
  const cWithFigma = buildProfile(repo({ Makefile: 'all:\n\tcc main.c', 'src/main.c': 'int main(){}', 'README.md': `# app\n${FIGMA}\n` }));
  assert.equal(cWithFigma.mode, 'product', JSON.stringify(cWithFigma));
  assert.equal(cWithFigma.confidence, 'low', 'a concept-class winner over unrecognised code is low confidence');
  assert.equal(cWithFigma.ambiguous, true);
  assert.ok(cWithFigma.question && /holds code/.test(cWithFigma.question.text));
  assert.ok(!cWithFigma.notes.some((n) => /Concept-video mode/.test(n)));
  assert.ok(cWithFigma.notes.some((n) => /no class signal recognised/.test(n)));
  const dockerDocs = buildProfile(repo({ Dockerfile: 'FROM squidfunk/mkdocs-material', 'mkdocs.yml': 'site_name: x', 'docs/index.md': '', 'README.md': '# docs' }));
  assert.equal(dockerDocs.surface, 'files/docs', JSON.stringify(dockerDocs.candidates));
  assert.equal(dockerDocs.mode, 'concept');
  assert.ok(!ids(dockerDocs).includes('dockerfile'), 'a Dockerfile in a repo without code is not a backend');
  const terraform = buildProfile(repo({ 'main.tf': '', 'variables.tf': '', 'README.md': '# infra' }));
  assert.equal(terraform.facts.has_code, true, '.tf is code');
  assert.ok(!ids(terraform).includes('only-md'));
});

test('C5: a declared --url does not flip a CLI / API / notebook repo to web-ui; it becomes a secondary web surface with the question', () => {
  const cli = buildProfile(repo({ 'package.json': pkg({ bin: { acme: 'cli.js' }, dependencies: { commander: '^12' } }), 'cli.js': '', 'demo.tape': '' }), { url: 'https://acme.dev' });
  assert.equal(cli.surface, 'cli', JSON.stringify(cli.candidates));
  assert.deepEqual(cli.secondary, ['web-ui']);
  assert.ok(cli.notes.some((n) => /secondary web surface/.test(n)));
  assert.ok(cli.scenes.some((s) => s.type === 'product-ui'), 'the declared site still yields a product-ui scene');
  const docs = buildProfile(repo({ 'README.md': '# Product\n', 'expected-brief.md': '' }), { url: 'https://plausible.io' });
  assert.equal(docs.surface, 'web-ui', 'no repo signal → the URL decides (GS-01 shape)');
  assert.equal(docs.confidence, 'high');
  assert.equal(docs.story_sources[0].kind, 'hero-page');
  assert.ok(!ids(docs).includes('only-md'));
});

test('C9 / C10: dev-container Dockerfiles and lone tooling never flip or extend the plan', () => {
  const devc = buildProfile(repo({ 'package.json': pkg({ bin: { acme: 'cli.js' } }), 'cli.js': '', '.devcontainer/Dockerfile': 'FROM node', '.devcontainer/docker-compose.yml': 'services: {}' }));
  assert.equal(devc.surface, 'cli', JSON.stringify(devc.candidates));
  assert.equal(devc.confidence, 'high');
  assert.ok(!ids(devc).includes('dockerfile'));
  const vitest = buildProfile(repo({ 'package.json': pkg({ bin: { acme: 'cli.js' }, devDependencies: { vitest: '^3' } }), 'cli.js': '', 'vitest.config.ts': '' }));
  assert.deepEqual(vitest.secondary, [], 'a vitest config is not a web UI');
  assert.deepEqual(vitest.scenes.map((s) => s.type), ['terminal / code', 'logo-outro']);
  const spa = buildProfile(repo({ 'package.json': pkg({ private: true, dependencies: { react: '^19', 'react-dom': '^19' }, devDependencies: { vite: '^6' } }), 'index.html': '', 'src/main.tsx': '', Dockerfile: 'FROM nginx' }));
  assert.equal(spa.surface, 'web-ui');
  assert.deepEqual(spa.secondary, [], 'a Dockerfile alone does not make an api-card scene');
  const mvc = buildProfile(repo({ 'package.json': pkg({ private: true, dependencies: { express: '^5', mongoose: '^8' } }), 'server.js': '', 'models/User.js': '', 'routes/users.js': '' }));
  assert.ok(!ids(mvc).includes('ml-pipeline-files'), 'a models/ directory of JS is not an ML marker');
});

test('R2-C1/C5: a declared --url never wins a tie against a single strong signal — bin, tape, openapi, ipynb, scripts, GS-03', () => {
  const trees = [
    [{ 'package.json': pkg({ bin: { acme: 'cli.js' } }), 'cli.js': '' }, 'cli'],
    [{ 'demo.tape': 'Output x.mp4' }, 'cli'],
    [{ 'go.mod': 'module acme/api\n', 'main.go': 'package main', 'internal/handler.go': '', 'openapi.yaml': '', 'README.md': '# api' }, 'api/backend'],
    [{ 'analysis.ipynb': '{}', 'model.ipynb': '{}', 'README.md': '# ml' }, 'data/ml'],
    [{ 'pyproject.toml': '[project]\nname = "t"\n[project.scripts]\nt = "t:main"\n', 't.py': '' }, 'cli'],
    [{ 'package.json': pkg({ bin: { acme: 'cli.js' }, dependencies: { commander: '^12' } }), 'cli.js': '', 'public/index.html': '<h1>acme</h1>', 'public/style.css': '', 'README.md': '# acme' }, 'cli'],
  ];
  for (const [tree, expected] of trees) {
    const p = buildProfile(repo(tree), { url: 'https://acme.dev' });
    assert.equal(p.surface, expected, JSON.stringify(p.candidates));
    assert.ok(p.secondary.includes('web-ui'), `${expected}: the URL is a secondary web surface`);
    assert.equal(p.candidates.find((c) => c.class === 'web-ui').tier, 'declared');
    assert.ok(p.notes.some((n) => /secondary web surface/.test(n)));
    assert.ok(!p.notes.some((n) => /weak evidence only/.test(n)));
    if (p.question) assert.notEqual(p.question.default, 'web-ui', 'the default is the repo-derived class');
  }
  const gs03 = buildProfile(path.join(examples, 'gs-03-cli-api'), { url: 'https://acmejobs.example' });
  assert.equal(gs03.surface, 'cli');
  assert.deepEqual(gs03.secondary, ['api/backend', 'web-ui', 'mocks/design', 'files/docs']);
  assert.equal(gs03.capture.needs_url, false);
});

test('R2-C2: a Go/Rust server main entry or --port arg parser is not a CLI; a separate cmd/<tool> entry still is', () => {
  const gin = buildProfile(repo({ 'go.mod': 'module x\n\nrequire github.com/gin-gonic/gin v1.10.0\n', 'main.go': 'package main', 'internal/api/routes.go': '', Dockerfile: 'FROM golang', 'README.md': '# svc' }));
  assert.equal(gin.surface, 'api/backend');
  assert.deepEqual(gin.secondary, [], 'no phantom cli secondary');
  assert.ok(!gin.scenes.some((s) => s.type === 'terminal / code'));
  const axum = buildProfile(repo({ 'Cargo.toml': '[package]\nname = "svc"\n\n[dependencies]\naxum = "0.7"\ntokio = "1"\nclap = { version = "4", features = ["derive"] }\n', 'src/main.rs': 'fn main(){}', 'README.md': '# svc' }));
  assert.equal(axum.surface, 'api/backend', JSON.stringify(axum.candidates));
  assert.ok(!axum.candidates.some((c) => c.class === 'cli'));
  const both = buildProfile(repo({ 'go.mod': 'module x\n\nrequire (\n\tgithub.com/go-chi/chi/v5 v5.0.12\n\tgithub.com/spf13/cobra v1.8.0\n)\n', 'cmd/cli/main.go': '', 'cmd/server/main.go': '', 'internal/httpapi/handler.go': '', Makefile: '', 'README.md': '# ledger' }));
  assert.equal(both.surface, 'cli', JSON.stringify(both.candidates));
  assert.deepEqual(both.secondary, ['api/backend']);
});

test('R2-C3: a UI host in one workspace package owns only its own frontend evidence — the web app in another package still wins', () => {
  const inkMono = buildProfile(repo({
    'package.json': pkg({ private: true, workspaces: ['apps/*', 'packages/*'] }),
    'apps/web/package.json': pkg({ private: true, dependencies: { react: '^19', 'react-dom': '^19', next: '^15' } }), 'apps/web/app/page.tsx': '',
    'packages/cli/package.json': pkg({ name: '@acme/cli', bin: { acme: 'dist/cli.js' }, dependencies: { ink: '^5', react: '^18' } }), 'packages/cli/src/cli.tsx': '',
  }));
  assert.equal(inkMono.surface, 'web-ui', JSON.stringify(inkMono.candidates));
  assert.equal(inkMono.confidence, 'high');
  assert.deepEqual(inkMono.secondary, ['cli']);
  assert.deepEqual(inkMono.facts.hosted_packages, ['packages/cli/package.json:terminal']);
  const expoMono = buildProfile(repo({
    'package.json': pkg({ private: true, workspaces: ['apps/*'] }),
    'apps/web/package.json': pkg({ private: true, dependencies: { react: '^19', next: '^15' } }), 'apps/web/app/page.tsx': '',
    'apps/mobile/package.json': pkg({ private: true, dependencies: { react: '^19', 'react-native': '^0.80', expo: '^53' } }), 'apps/mobile/App.tsx': '',
  }));
  assert.equal(expoMono.surface, 'web-ui', JSON.stringify(expoMono.candidates));
  assert.deepEqual(expoMono.secondary, ['mobile']);
});

test('R2-C4: a private SvelteKit app with the framework only in devDependencies is a UI, even with Dockerfile + compose', () => {
  const p = buildProfile(repo({
    'package.json': pkg({ private: true, type: 'module', devDependencies: { '@sveltejs/adapter-node': '^5', '@sveltejs/kit': '^2', svelte: '^5', vite: '^6' } }),
    'svelte.config.js': '', 'vite.config.ts': '', 'src/app.html': '<html>', 'src/routes/+page.svelte': '', Dockerfile: 'FROM node', 'docker-compose.yml': 'services: {}',
  }));
  assert.equal(p.surface, 'web-ui', JSON.stringify(p.candidates));
  assert.equal(p.confidence, 'high');
  assert.equal(p.candidates[0].tier, 'ui');
  assert.ok(ids(p).includes('frontend-framework'));
  assert.ok(!ids(p).includes('no-frontend-framework'));
  assert.deepEqual(p.secondary, []);
  const lib = buildProfile(repo({ 'package.json': pkg({ main: 'dist/index.js', types: 'dist/index.d.ts', peerDependencies: { svelte: '^5' }, devDependencies: { svelte: '^5', vite: '^6' } }), 'src/index.ts': '' }));
  assert.equal(lib.surface, 'library/sdk', 'a publishable package keeps devDependencies as tooling');
});

test('R2-C6: any server framework with a views/ or templates/ set is a server-rendered UI (Express+EJS, Fastify+hbs, Sinatra+erb, Gin+templates)', () => {
  const trees = [
    { 'package.json': pkg({ private: true, dependencies: { express: '^5', ejs: '^3' }, scripts: { start: 'node app.js' } }), 'app.js': '', 'routes/index.js': '', 'views/index.ejs': '<h1>Hi</h1>', 'views/layout.ejs': '', 'public/style.css': '', 'README.md': '# app' },
    { 'package.json': pkg({ private: true, dependencies: { fastify: '^5', '@fastify/view': '^10', handlebars: '^4' } }), 'server.js': '', 'views/home.hbs': '<h1>Hi</h1>' },
    { Gemfile: "gem 'sinatra'\n", 'app.rb': '', 'views/index.erb': '<h1>Hi</h1>' },
    { 'go.mod': 'module x\n\nrequire github.com/gin-gonic/gin v1.10.0\n', 'main.go': 'package main', 'templates/index.html': '<h1>Hi</h1>' },
  ];
  for (const tree of trees) {
    const p = buildProfile(repo(tree));
    assert.equal(p.surface, 'web-ui', JSON.stringify(p.candidates));
    assert.equal(p.candidates[0].tier, 'ui');
    assert.ok(ids(p).includes('web-app-manifest'));
    assert.ok(!ids(p).includes('no-frontend-framework'), 'templates are a frontend');
    assert.ok(p.secondary.includes('api/backend'));
  }
  const emailOnly = buildProfile(repo({ 'package.json': pkg({ private: true, dependencies: { express: '^5' } }), 'server.js': '', 'emails/welcome.ejs': '', 'openapi.yaml': '' }));
  assert.equal(emailOnly.surface, 'api/backend', 'email templates are not a UI');
});

test('R2-C7: a static landing page under site/ or www/ is a companion next to a CLI / API, the product only when nothing runnable exists', () => {
  const cli = buildProfile(repo({ 'package.json': pkg({ bin: { acme: 'cli.js' }, dependencies: { commander: '^12' } }), 'cli.js': '', 'site/index.html': '<h1>acme</h1>', 'site/style.css': '', 'README.md': '# acme' }));
  assert.equal(cli.surface, 'cli', JSON.stringify(cli.candidates));
  assert.equal(cli.confidence, 'high');
  assert.ok(ids(cli).includes('docs-site') && !ids(cli).includes('html-entry'));
  assert.deepEqual(cli.secondary, []);
  const api = buildProfile(repo({ 'pyproject.toml': '[project]\nname = "svc"\ndependencies = ["fastapi"]\n', 'app/main.py': '', Dockerfile: 'FROM python', 'openapi.yaml': '', 'www/index.html': '<h1>docs</h1>' }));
  assert.equal(api.surface, 'api/backend', JSON.stringify(api.candidates));
  const alone = buildProfile(repo({ 'site/index.html': '<h1>x</h1>', 'README.md': '# x' }));
  assert.equal(alone.surface, 'web-ui', 'GS-02 shape: a lone static site is the product');
});

test('R2: Python UI frameworks (Streamlit/Dash/Gradio) are a web UI; static-site generators are a web UI in product mode; document-only repos are files/docs high', () => {
  const st = buildProfile(repo({ 'requirements.txt': 'streamlit\npandas\n', 'app.py': 'import streamlit', 'data/sales.csv': 'a\n1' }));
  assert.equal(st.surface, 'web-ui', JSON.stringify(st.candidates));
  assert.equal(st.confidence, 'high');
  assert.ok(st.secondary.includes('data/ml'));
  const jekyll = buildProfile(repo({ '_config.yml': 'title: blog', '_posts/2026-01-01-hello.md': '# hi', '_layouts/default.html': '<html>', 'index.md': '' }));
  assert.equal(jekyll.surface, 'web-ui', JSON.stringify(jekyll.candidates));
  assert.equal(jekyll.mode, 'product');
  assert.equal(jekyll.candidates[0].tier, 'ui');
  const hugo = buildProfile(repo({ 'hugo.toml': 'baseURL = "/"', 'layouts/index.html': '<html>', 'content/post.md': '' }));
  assert.equal(hugo.surface, 'web-ui');
  const notion = buildProfile(repo({ 'Roadmap.pdf': 'pdf', 'Notes.docx': 'docx', 'screenshot.png': 'png' }));
  assert.equal(notion.surface, 'files/docs', JSON.stringify(notion.candidates));
  assert.equal(notion.confidence, 'high');
  assert.equal(notion.mode, 'concept');
});

test('R2: JVM application mainClass / picocli → cli; Spring Boot Gradle plugin → api/backend; Dart CLI vs Flutter package', () => {
  const kotlin = buildProfile(repo({ 'build.gradle.kts': 'plugins { kotlin("jvm") version "2.0.0"\n application }\napplication { mainClass.set("acme.MainKt") }\ndependencies { implementation("com.github.ajalt.clikt:clikt:4.4.0") }\n', 'src/main/kotlin/acme/Main.kt': '', 'README.md': '# tool' }));
  assert.equal(kotlin.surface, 'cli', JSON.stringify(kotlin.candidates));
  assert.equal(kotlin.confidence, 'high');
  const spring = buildProfile(repo({ 'build.gradle': "plugins { id 'org.springframework.boot' version '3.3.0' }\ndependencies { implementation 'org.springframework.boot:spring-boot-starter' }\n", 'src/main/java/acme/App.java': '', Dockerfile: 'FROM eclipse-temurin' }));
  assert.equal(spring.surface, 'api/backend', JSON.stringify(spring.candidates));
  const flutterPkg = buildProfile(repo({ 'pubspec.yaml': 'name: widgets\nflutter:\n  plugin: {}\n', 'lib/widgets.dart': '', 'lib/src/a.dart': '', 'example/main.dart': '' }));
  assert.equal(flutterPkg.surface, 'library/sdk', JSON.stringify(flutterPkg.candidates));
  const dartCli = buildProfile(repo({ 'pubspec.yaml': 'name: tool\nexecutables:\n  tool:\n', 'bin/tool.dart': '', 'lib/tool.dart': '' }));
  assert.equal(dartCli.surface, 'cli', JSON.stringify(dartCli.candidates));
});

test('R2: workspace component library (pnpm), design-system monorepo and a docs/ folder next to a UI product', () => {
  const pnpm = buildProfile(repo({
    'package.json': pkg({ private: true }), 'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'packages/ui/package.json': pkg({ name: '@acme/ui', main: 'dist/index.js', types: 'dist/index.d.ts', files: ['dist'], peerDependencies: { react: '>=18' }, devDependencies: { react: '^19', vite: '^6' } }),
    'packages/ui/src/index.tsx': '', 'apps/storybook/package.json': pkg({ private: true, devDependencies: { storybook: '^8', react: '^19' } }), 'apps/storybook/.storybook/main.ts': '',
    'docs/getting-started.md': '# start', 'README.md': '# ui',
  }));
  assert.equal(pnpm.surface, 'library/sdk', JSON.stringify(pnpm.candidates));
  assert.equal(pnpm.confidence, 'high');
  assert.ok(ids(pnpm).includes('framework-plugin'));
  assert.ok(!pnpm.candidates.some((c) => c.class === 'web-ui' && c.tier === 'ui'));
  const nextDocs = buildProfile(repo({ 'package.json': pkg({ private: true, dependencies: { react: '^19', next: '^15' } }), 'app/page.tsx': '', 'docs/architecture.md': '', 'design/notes.md': '' }));
  assert.equal(nextDocs.surface, 'web-ui');
  assert.deepEqual(nextDocs.secondary, [], 'docs/ and design/ folders add no scene next to a UI product');
});

test('R2: null surface with code carries the "no signal recognised" note; unreadable files and dirs mark the scan truncated', (t) => {
  const p = buildProfile(repo({ 'src/Main.hx': '', 'build.hxml': '' }));
  assert.equal(p.surface, null);
  assert.equal(p.mode, 'product');
  assert.ok(p.notes.some((n) => /no class signal recognised/.test(n)));
  if (process.getuid && process.getuid() === 0) return t.diagnostic('root ignores file modes');
  const dir = repo({ 'package.json': pkg({ bin: 'x.js' }), 'x.js': '', 'README.md': '# x' });
  fs.chmodSync(path.join(dir, 'README.md'), 0o000);
  try {
    const q = buildProfile(dir);
    assert.deepEqual(q.scan.limits_hit.unreadable_files, ['README.md']);
    assert.equal(q.scan.truncated, true);
  } finally {
    fs.chmodSync(path.join(dir, 'README.md'), 0o644);
  }
});

test('GS-03 (CLI/API without UI): cli first (VHS tape for CLI first), api/backend + mocks/design + files/docs secondary, four product roles + outro, code via comparison', () => {
  const p = buildProfile(path.join(examples, 'gs-03-cli-api'));
  assert.equal(p.surface, 'cli', JSON.stringify(p.candidates));
  assert.deepEqual(p.secondary, ['api/backend', 'mocks/design', 'files/docs']);
  assert.equal(p.capture.needs_url, false, 'no URL required');
  assert.equal(p.capture.backend, 'vhs-tape');
  assert.deepEqual(p.scenes.map((s) => s.role), ['terminal', 'api', 'design', 'file', 'outro']);
  assert.ok(p.optional_scenes.some((s) => s.role === 'code' && s.type === 'comparison'), 'fixture README: the code role is reachable via the comparison scene');
  assert.ok(p.signals.some((s) => s.id === 'figma-link'), 'design/README.md Figma placeholder is detected');
  assert.ok(p.signals.some((s) => s.id === 'openapi-spec'));
  assert.ok(p.signals.some((s) => s.id === 'vhs-tape'));
  assert.equal(p.mode, 'product');
  assert.ok(p.signals.some((s) => s.id === 'bin-dir'), 'bin/acmejobs is the bin/ signal');
  assert.equal(p.confidence, 'high');
  assert.equal(p.ambiguous, false, 'two cli signals (tape + bin/) beat the single api/backend signal');
});

test('GS-02 (Ledgerly, synthetic site): web-ui from site/index.html, high', () => {
  const p = buildProfile(path.join(examples, 'gs-02-ledgerly'));
  assert.equal(p.surface, 'web-ui', JSON.stringify(p.candidates));
  assert.equal(p.confidence, 'high');
  assert.equal(p.capture.needs_url, true);
  assert.ok(!p.signals.some((s) => s.id === 'only-md'), 'an HTML page is a UI, not "only .md"');
});

test('GS-01 (Plausible): docs-only tree alone is files/docs; with the real URL it is web-ui', () => {
  const dir = path.join(examples, 'gs-01-plausible');
  assert.equal(buildProfile(dir).surface, 'files/docs');
  assert.equal(buildProfile(dir, { url: 'https://plausible.io' }).surface, 'web-ui');
});

test('.env*, *.pem and fixtures are counted but never opened — a Figma link or a manifest inside them is not a signal; content_read is exact', () => {
  const link = `${FIGMA}\n`;
  const dir = repo({
    '.env': `FIGMA=${link}`, '.env.local': link, '.envrc': link, 'certs/key.pem': link, 'test/fixtures/page.md': link, 'src/__fixtures__/x.html': link,
    'fixtures/package.json': pkg({ dependencies: { react: '^19' } }), 'id_rsa': link, 'src/index.ts': 'export {}', 'package.json': pkg({ main: 'src/index.ts', types: 'src/index.d.ts' }),
    'README.md': '# x', 'notes.txt': 'plain',
  });
  const p = buildProfile(dir);
  assert.ok(!p.signals.some((s) => s.id === 'figma-link'), 'denied files must not contribute evidence');
  assert.ok(!p.signals.some((s) => s.id === 'frontend-framework'), 'a package.json under fixtures/ is never read');
  assert.deepEqual(p.read_policy.denied_files_seen, { 'env-files': 3, pem: 1, fixtures: 3, 'keys-and-credentials': 1 });
  assert.deepEqual(p.read_policy.content_read, ['README.md', 'notes.txt', 'package.json'], 'exactly the files whose content was opened');
  assert.equal(p.read_policy.content_read_total, 3);
  for (const rel of p.read_policy.content_read) assert.equal(readDenied(rel), null, `${rel} was opened but is denied`);
});

test('walk: never follows symlinks, skips node_modules/.git/dist/build (files that would be signals), honours --max-files/--max-depth exactly', () => {
  const dir = repo({
    'package.json': pkg({ private: true }), 'src/a.ts': '', 'node_modules/left-pad/package.json': pkg({ name: 'left-pad', dependencies: { vue: '^3' } }),
    'node_modules/left-pad/README.md': FIGMA, 'dist/openapi.json': '{}', 'build/demo.tape': '', '.git/hooks/x.ipynb': '{}',
    'a/b/c/d/e/f/g/h/i/deep.ipynb': '{}',
    'power-presentation-out/shop-marketing/package.json': pkg({ dependencies: { react: '^18' } }), 'power-presentation-out/shop-marketing/demo.tape': '',
  });
  fs.symlinkSync(dir, path.join(dir, 'loop'));
  fs.symlinkSync(path.join(dir, 'node_modules', 'left-pad', 'README.md'), path.join(dir, 'README.md'));
  const p = buildProfile(dir, { maxDepth: 4 });
  assert.deepEqual(ids(p), [], 'nothing under ignored dirs, symlinks or beyond max-depth fires');
  assert.equal(p.scan.truncated, true);
  assert.deepEqual(p.scan.ignored_dirs, { '.git': 1, build: 1, dist: 1, node_modules: 1, 'power-presentation-out': 1 });
  const w1 = walkRepo(repo({ 'a/b/c.ipynb': '{}', 'a/x.md': '', 'root.md': '' }), { maxDepth: 1 });
  assert.deepEqual(w1.files.map((f) => f.rel), ['a/x.md', 'root.md']);
  assert.equal(w1.truncated, true);
  const w2 = walkRepo(repo({ 'a/b/c.ipynb': '{}', 'a/x.md': '', 'root.md': '' }), { maxDepth: 2 });
  assert.deepEqual(w2.files.map((f) => f.rel), ['a/b/c.ipynb', 'a/x.md', 'root.md']);
  assert.equal(w2.truncated, false);
  const capped = walkRepo(dir, { maxFiles: 2 });
  assert.equal(capped.files.length, 2);
  assert.equal(capped.truncated, true);
});

test('unreadable subdirectories are recorded, not silently skipped', (t) => {
  if (process.getuid && process.getuid() === 0) return t.skip('root ignores directory modes');
  const dir = repo({ 'package.json': pkg({ bin: 'x.js' }), 'x.js': '', 'src/a.ts': '' });
  fs.chmodSync(path.join(dir, 'src'), 0o000);
  try {
    const p = buildProfile(dir);
    assert.deepEqual(p.scan.unreadable_dirs, ['src']);
    assert.ok(p.notes.some((n) => /Unreadable directories/.test(n)));
  } finally {
    fs.chmodSync(path.join(dir, 'src'), 0o755);
  }
});

test('reader limits (oversized files, more than MAX_LINK_FILES) mark the scan truncated and are reported', () => {
  const tree = { 'package.json': pkg({ bin: 'x.js' }), 'x.js': '', 'big.md': 'x'.repeat(600 * 1024) };
  for (let i = 0; i < 70; i += 1) tree[`docs/d${String(i).padStart(2, '0')}.md`] = '# d';
  const p = buildProfile(repo(tree));
  assert.equal(p.scan.truncated, true);
  assert.ok(p.scan.limits_hit.link_files_skipped >= 1);
  assert.deepEqual(p.scan.limits_hit.oversized_files, ['big.md']);
  assert.ok(p.notes.some((n) => /Reader limits hit/.test(n)));
});

test('deterministic: two runs on the same tree produce identical profiles and no timestamps', () => {
  const dir = repo({ 'package.json': pkg({ bin: 'x.js' }), 'x.js': '', 'README.md': '# x', 'docs/a.md': '' });
  const a = JSON.stringify(buildProfile(dir));
  const b = JSON.stringify(buildProfile(dir));
  assert.equal(a, b);
  assert.doesNotMatch(a, /"(timestamp|generated_at|date)"/);
});

test('scoring: ui > runnable > concept; score, then distinct signals, then order; confidence boundaries; secondary rules', () => {
  const matched = [
    { id: 'figma-link', class: 'mocks/design', weight: 4 }, { id: 'mocks-dir', class: 'mocks/design', weight: 3 },
    { id: 'package-bin', class: 'cli', weight: 4 }, { id: 'openapi-spec', class: 'api/backend', weight: 4 },
  ];
  const c = scoreClasses(matched);
  assert.deepEqual(c.map((x) => x.class), ['cli', 'api/backend', 'mocks/design']);
  assert.deepEqual(c.map((x) => x.tier), ['runnable', 'runnable', 'concept']);
  assert.deepEqual(assessConfidence(c), { confidence: 'medium', ambiguous: true, margin: 0 });
  const ui = scoreClasses([...matched, { id: 'frontend-framework', class: 'web-ui', weight: 4 }]);
  assert.equal(ui[0].class, 'web-ui', 'a real UI outranks a higher-scoring backend (api/backend = no frontend)');
  assert.equal(ui[0].tier, 'ui');
  assert.deepEqual(assessConfidence(ui), { confidence: 'high', ambiguous: false, margin: 4 });
  assert.deepEqual(scoreClasses([{ id: 'package-bin', class: 'cli', weight: 4 }, { id: 'dockerfile', class: 'api/backend', weight: 2 }, { id: 'api-schema-files', class: 'api/backend', weight: 2 }]).map((x) => x.class), ['cli', 'api/backend']);
  assert.deepEqual(scoreClasses([{ id: 'vhs-tape', class: 'cli', weight: 4 }, { id: 'openapi-spec', class: 'api/backend', weight: 4 }, { id: 'dockerfile', class: 'api/backend', weight: 2 }, { id: 'compiled-cli-entry', class: 'cli', weight: 2 }]).map((x) => x.class), ['cli', 'api/backend']);
  assert.deepEqual(scoreClasses([{ id: 'openapi-spec', class: 'api/backend', weight: 4 }, { id: 'vhs-tape', class: 'cli', weight: 4 }]).map((x) => x.class), ['cli', 'api/backend']);
  assert.deepEqual(assessConfidence(scoreClasses([{ id: 'package-bin', class: 'cli', weight: 4 }, { id: 'cli-extras', class: 'cli', weight: 1 }, { id: 'notebooks', class: 'data/ml', weight: 4 }])), { confidence: 'medium', ambiguous: true, margin: 1 });
  assert.deepEqual(assessConfidence(scoreClasses([{ id: 'package-bin', class: 'cli', weight: 4 }, { id: 'cli-library', class: 'cli', weight: 2 }, { id: 'notebooks', class: 'data/ml', weight: 4 }])), { confidence: 'high', ambiguous: false, margin: 2 });
  assert.deepEqual(assessConfidence(scoreClasses([{ id: 'mocks-dir', class: 'mocks/design', weight: 3 }])), { confidence: 'medium', ambiguous: true, margin: 3 });
  assert.deepEqual(assessConfidence(scoreClasses([{ id: 'docs-dir', class: 'files/docs', weight: 2 }])), { confidence: 'low', ambiguous: true, margin: 2 });
  assert.deepEqual(assessConfidence(scoreClasses([{ id: 'figma-link', class: 'mocks/design', weight: 4 }]), { has_ui_or_code: true }), { confidence: 'low', ambiguous: true, margin: 4 });
  assert.deepEqual(assessConfidence([]), { confidence: 'low', ambiguous: true, margin: null });
  assert.deepEqual(secondaryClasses(scoreClasses([{ id: 'package-bin', class: 'cli', weight: 4 }, { id: 'docs-site', class: 'web-ui', weight: 1 }, { id: 'frontend-tooling', class: 'web-ui', weight: 2 }])), []);
  assert.deepEqual(secondaryClasses(scoreClasses([{ id: 'frontend-framework', class: 'web-ui', weight: 4 }, { id: 'dockerfile', class: 'api/backend', weight: 2 }])), []);
  assert.deepEqual(secondaryClasses(scoreClasses([{ id: 'frontend-framework', class: 'web-ui', weight: 4 }, { id: 'server-framework', class: 'api/backend', weight: 3 }])), ['api/backend']);
});
