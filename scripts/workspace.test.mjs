import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { OUT_DIR, OUT_GITIGNORE, ensureScanDir, ensureWorkspace, main, productName, resolveRepo, slug, unfinishedRuns, videoName } from './workspace.mjs';
import { ensureProjectRepo, repoState } from './render-path.mjs';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ws-')));
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

test('slug() / productName() / videoName(): <product>-<mode>[-<prospect company>] from the repository manifest', () => {
  assert.equal(slug('  Ledgerly Close — v2! '), 'ledgerly-close-v2');
  assert.equal(slug('Łódź café'), 'odz-cafe');
  const repo = tmp();
  assert.equal(productName(repo), path.basename(repo), 'no manifest → the folder name');
  fs.writeFileSync(path.join(repo, 'pyproject.toml'), '[tool.x]\nname = "not-this"\n[project]\nname = "acme-cli"\nversion = "1"\n');
  assert.equal(productName(repo), 'acme-cli');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: '@acme/Ledgerly' }));
  assert.equal(productName(repo), 'Ledgerly', 'package.json wins, scope dropped');
  assert.equal(videoName({ repo, mode: 'investors' }), 'ledgerly-investors');
  fs.writeFileSync(path.join(repo, 'prospect.json'), JSON.stringify({ name: 'Dana Reyes', company: 'Harborline Logistics' }));
  assert.equal(videoName({ repo, mode: 'sales', prospect: 'prospect.json' }), 'ledgerly-sales-harborline-logistics');
  assert.equal(videoName({ repo, mode: 'sales', name: 'Q4 Outreach' }), 'q4-outreach');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('ensureWorkspace(): creates power-presentation-out/<name>/ and its own .gitignore, touches nothing else; re-entry finds the repo', () => {
  const repo = tmp();
  fs.writeFileSync(path.join(repo, 'index.html'), '<h1>the product page</h1>');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'shop', scripts: { dev: 'vite' } }));
  const before = fs.readdirSync(repo).sort();
  const w = ensureWorkspace({ repo, mode: 'marketing' });
  assert.deepEqual(w, { repo, out: path.join(repo, OUT_DIR), project: path.join(repo, OUT_DIR, 'shop-marketing'), name: 'shop-marketing', created: true, unfinished: null });
  assert.deepEqual(fs.readdirSync(repo).sort(), [...before, OUT_DIR].sort(), 'the repository gains one folder, nothing else');
  assert.equal(fs.readFileSync(path.join(repo, 'index.html'), 'utf8'), '<h1>the product page</h1>');
  assert.equal(fs.readFileSync(path.join(w.out, '.gitignore'), 'utf8'), OUT_GITIGNORE);
  assert.equal(ensureWorkspace({ repo, mode: 'marketing' }).created, false, 'the same video reuses its folder');
  assert.equal(resolveRepo(path.join(w.project, 'compositions')), repo, 'run from inside the workspace → the repository above it');
  assert.equal(ensureWorkspace({ repo: w.project, mode: 'marketing' }).project, w.project);
  const dry = ensureWorkspace({ repo, mode: 'investors', dryRun: true });
  assert.equal(dry.created, true); assert.equal(fs.existsSync(dry.project), false, '--dry-run writes nothing');
  assert.equal(main(['--for', 'nope']), 2);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('ensureProjectRepo(): a video project in the ignored workspace gets its own repository; a plain nested folder does not', () => {
  const repo = tmp();
  git(repo, 'init', '-q');
  fs.writeFileSync(path.join(repo, 'README.md'), '# shop\n');
  const w = ensureWorkspace({ repo, mode: 'sales', name: 'demo' });
  assert.match(ensureProjectRepo(w.project), /git init/);
  assert.equal(repoState(w.project).kind, 'own', 'versions commit into the project, never into the user repository');
  assert.equal(git(repo, 'status', '--porcelain').stdout, '?? README.md\n', 'the host repository sees no workspace file');
  const plain = path.join(repo, 'videos');
  fs.mkdirSync(plain);
  assert.match(ensureProjectRepo(plain), /version commits are skipped/);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('unfinishedRuns() / ensureWorkspace().unfinished: a run that started and never reached --finish is resumed, a finished one is not', () => {
  const repo = tmp();
  const w = ensureWorkspace({ repo, mode: 'marketing' });
  assert.equal(w.unfinished, null, 'a new workspace holds no run');
  fs.mkdirSync(path.join(w.project, '.hyperframes'), { recursive: true });
  const start = new Date(Date.now() - 600000).toISOString();
  fs.writeFileSync(path.join(w.project, '.hyperframes', 'pp-stages.json'), JSON.stringify({ runs: [{ stage: 'intake', at: new Date(Date.now() - 590000).toISOString(), seconds: 10, ok: true }], pending: { storyboard: new Date(Date.now() - 300000).toISOString() } }));
  fs.writeFileSync(path.join(w.project, 'intake.json'), JSON.stringify({ arguments_raw: '--for marketing' }));
  const runs = unfinishedRuns(repo);
  assert.deepEqual(runs.map((r) => [r.name, r.stage, r.label, r.arguments_raw]), [[w.name, 'storyboard', 'Writing the storyboard', '--for marketing']]);
  assert.equal(ensureWorkspace({ repo, mode: 'marketing' }).unfinished.stage, 'storyboard');
  const runStart = JSON.parse(fs.readFileSync(path.join(w.project, '.hyperframes', 'pp-stages.json'), 'utf8')).runs[0];
  fs.writeFileSync(path.join(w.project, '.hyperframes', 'progress.json'), JSON.stringify({ run_start: new Date(Date.parse(runStart.at) - 10000).toISOString(), finished_at: new Date().toISOString() }));
  assert.deepEqual(unfinishedRuns(repo), [], 'finished');
  assert.ok(start);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('ensureScanDir(): power-presentation-out/.scan/ under the folder\'s own .gitignore; unfinishedRuns() never lists it', () => {
  const repo = tmp();
  const scan = ensureScanDir(repo);
  assert.equal(scan, path.join(repo, OUT_DIR, '.scan'));
  assert.equal(fs.readFileSync(path.join(repo, OUT_DIR, '.gitignore'), 'utf8'), OUT_GITIGNORE);
  assert.deepEqual(unfinishedRuns(repo), []);
  fs.rmSync(repo, { recursive: true, force: true });
});
