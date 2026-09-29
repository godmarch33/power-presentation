import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cmdCheck, cmdDrift, cmdSeed, parseArgs, provenancePath, readProvenance, resolveTag, USAGE } from './vendor-workflow.mjs';
import { copyTree, diffTrees, findMedia, hashSkillBundle, listFilesSorted, TEXT_EXT } from './lib/skill-bundle.mjs';
import { HYPERFRAMES_PIN, UPSTREAM_REPO, VENDORED_WORKFLOW, upstreamTag } from './lib/versions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const script = path.join(here, 'vendor-workflow.mjs');
const vendor = path.join(repoRoot, 'vendor');
const tmpDirs = [];
function tmp(prefix = 'pp-vw-') { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); tmpDirs.push(d); return d; }
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function fakeSkill(dir, files = { 'SKILL.md': '---\nname: x\n---\n# X\n', 'scripts/a.mjs': 'export const a = 1;\n', 'references/r.md': 'ref\n' }) {
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}

test('hashSkillBundle: upstream algorithm — sorted paths, CRLF-normalised text, 16 hex; order-independent, content-sensitive, .DS_Store ignored', () => {
  const a = fakeSkill(path.join(tmp(), 'a'));
  const h1 = hashSkillBundle(a);
  assert.match(h1.hash, /^[0-9a-f]{16}$/);
  assert.equal(h1.files, 3);
  const b = fakeSkill(path.join(tmp(), 'b'), { 'references/r.md': 'ref\n', 'SKILL.md': '---\nname: x\n---\n# X\n', 'scripts/a.mjs': 'export const a = 1;\n' });
  assert.equal(hashSkillBundle(b).hash, h1.hash, 'creation order does not matter');
  fs.writeFileSync(path.join(b, 'SKILL.md'), '---\r\nname: x\r\n---\r\n# X\r\n');
  assert.equal(hashSkillBundle(b).hash, h1.hash, 'CRLF in a text file hashes like LF');
  fs.writeFileSync(path.join(b, '.DS_Store'), 'junk');
  assert.equal(hashSkillBundle(b).hash, h1.hash, '.DS_Store is skipped');
  fs.writeFileSync(path.join(b, 'SKILL.md'), '# changed\n');
  assert.notEqual(hashSkillBundle(b).hash, h1.hash);
  const c = fakeSkill(path.join(tmp(), 'c'));
  fs.writeFileSync(path.join(c, 'bin.dat'), Buffer.from([0x0d, 0x0a, 0x00]));
  const c1 = hashSkillBundle(c).hash;
  fs.writeFileSync(path.join(c, 'bin.dat'), Buffer.from([0x0a, 0x00]));
  assert.notEqual(hashSkillBundle(c).hash, c1, 'binary files are hashed byte-for-byte (no CRLF normalisation)');
  assert.ok(TEXT_EXT.has('.md') && TEXT_EXT.has('.mjs') && !TEXT_EXT.has('.dat'));
  const link = path.join(c, 'link.md');
  fs.symlinkSync(path.join(c, 'SKILL.md'), link);
  assert.ok(!listFilesSorted(c).includes(link), 'symlinks are not followed');
});

test('copyTree / diffTrees / findMedia', () => {
  const src = fakeSkill(path.join(tmp(), 'src'));
  fs.chmodSync(path.join(src, 'scripts', 'a.mjs'), 0o755);
  const dest = path.join(tmp(), 'dest');
  assert.equal(copyTree(src, dest), 3);
  assert.equal(hashSkillBundle(dest).hash, hashSkillBundle(src).hash);
  assert.equal(fs.statSync(path.join(dest, 'scripts', 'a.mjs')).mode & 0o777, 0o755, 'modes preserved');
  assert.deepEqual(diffTrees(src, dest), { same: true, only_a: [], only_b: [], changed: [] });
  fs.writeFileSync(path.join(dest, 'SKILL.md'), 'edited');
  fs.writeFileSync(path.join(dest, 'extra.md'), 'x');
  fs.rmSync(path.join(dest, 'references', 'r.md'));
  const d = diffTrees(src, dest);
  assert.deepEqual(d, { same: false, only_a: ['references/r.md'], only_b: ['extra.md'], changed: ['SKILL.md'] });
  fs.mkdirSync(path.join(dest, 'assets'));
  fs.writeFileSync(path.join(dest, 'assets', 'bed.mp3'), 'ID3');
  fs.writeFileSync(path.join(dest, 'assets', 'logo.PNG'), 'x');
  assert.deepEqual(findMedia(dest), ['assets/bed.mp3', 'assets/logo.PNG']);
  assert.deepEqual(findMedia(src), []);
});

test('parseArgs: commands and options; usage errors', () => {
  assert.equal(parseArgs([]).command, 'fetch');
  const o = parseArgs(['seed', '--skills-dir', '/s', '--vendor-dir', '/v', '--name', 'my-flow', '--force', '--json', '--tag', 'v1.2.3', '--commit', 'abc1234', '--keep-clone']);
  assert.deepEqual([o.command, o.skillsDir, o.vendorDir, o.name, o.force, o.json, o.tag, o.commit, o.keepClone], ['seed', '/s', '/v', 'my-flow', true, true, 'v1.2.3', 'abc1234', true]);
  assert.throws(() => parseArgs(['nope']), /unknown command/);
  assert.throws(() => parseArgs(['check', 'drift']), /unexpected argument/);
  assert.throws(() => parseArgs(['--name', '../x']), /plain skill slug/);
  assert.throws(() => parseArgs(['--commit', 'zz']), /hex sha/);
  assert.throws(() => parseArgs(['--tag']), /needs a value/);
  assert.equal(upstreamTag('0.8.47'), 'v0.8.47');
  assert.equal(upstreamTag('v0.8.47'), 'v0.8.47');
});

test('vendor/: the pristine copy is present, provenance matches the pin and the tag, the bundle hash equals upstream skills-manifest.json, licence + NOTICE travel with it, no media', () => {
  const r = cmdCheck({ vendorDir: vendor, name: VENDORED_WORKFLOW });
  assert.equal(r.ok, true, r.problems.join('\n'));
  assert.equal(r.exit, 0);
  const prov = r.provenance;
  assert.equal(prov.schema, 'power-presentation/vendored-skill@0.1');
  assert.equal(prov.skill, VENDORED_WORKFLOW);
  assert.equal(prov.hyperframes_pin, HYPERFRAMES_PIN);
  assert.equal(prov.upstream.repo, UPSTREAM_REPO);
  assert.equal(prov.upstream.tag, upstreamTag(HYPERFRAMES_PIN));
  assert.match(prov.upstream.commit, /^[0-9a-f]{40}$/);
  assert.equal(prov.upstream.path, `skills/${VENDORED_WORKFLOW}`);
  assert.equal(prov.bundle.hash, r.bundle.hash);
  assert.equal(prov.manifest_entry?.hash, prov.bundle.hash, 'hash equals the entry HyperFrames publishes for the same commit');
  assert.equal(prov.bundle.files, 30);
  assert.equal(prov.bundle.hash, 'd87f7ae140e88403', 'skills-manifest.json @ v0.8.47 (checked 2026-09-20)');
  assert.ok(fs.existsSync(path.join(vendor, 'LICENSE-hyperframes')));
  assert.match(fs.readFileSync(path.join(vendor, 'LICENSE-hyperframes'), 'utf8'), /Apache License\s+Version 2\.0/);
  assert.match(fs.readFileSync(path.join(vendor, 'NOTICE'), 'utf8'), new RegExp(`skills/${VENDORED_WORKFLOW}/ from https://github.com/${UPSTREAM_REPO}`));
  assert.deepEqual(findMedia(path.join(vendor, VENDORED_WORKFLOW)), []);
  for (const f of ['SKILL.md', 'sub-agents/frame-worker.md', 'scripts/assemble-index.mjs', 'scripts/build-frame.mjs', 'scripts/captions.mjs', 'references/story-design.md']) {
    assert.ok(fs.existsSync(path.join(vendor, VENDORED_WORKFLOW, f)), `upstream layout kept: ${f}`);
  }
  assert.ok(!fs.existsSync(path.join(vendor, VENDORED_WORKFLOW, 'VENDORED.md')), 'provenance lives next to the copy, never inside it (the hash must stay upstream\'s)');
  assert.equal(readProvenance(vendor, VENDORED_WORKFLOW).bundle.hash, prov.bundle.hash);
  assert.equal(provenancePath(vendor, VENDORED_WORKFLOW), path.join(vendor, `${VENDORED_WORKFLOW}.vendored.json`));
});

test('cmdCheck: an edited copy, a pin mismatch, media, or a missing licence fail with exit 3 and the reasons', () => {
  const v = tmp();
  fs.cpSync(vendor, v, { recursive: true });
  assert.equal(cmdCheck({ vendorDir: v, name: VENDORED_WORKFLOW }).ok, true);
  fs.appendFileSync(path.join(v, VENDORED_WORKFLOW, 'SKILL.md'), '\n<!-- plugin delta -->\n');
  const edited = cmdCheck({ vendorDir: v, name: VENDORED_WORKFLOW });
  assert.equal(edited.exit, 3);
  assert.match(edited.problems[0], /the copy was edited; plugin deltas belong in BRIEF\.md/);
  fs.cpSync(vendor, v, { recursive: true, force: true });
  const prov = readProvenance(v, VENDORED_WORKFLOW);
  fs.writeFileSync(provenancePath(v, VENDORED_WORKFLOW), JSON.stringify({ ...prov, hyperframes_pin: '0.8.46' }));
  assert.match(cmdCheck({ vendorDir: v, name: VENDORED_WORKFLOW }).problems[0], /vendored at hyperframes 0\.8\.46 but .* pins 0\.8\.47 — re-vendor/);
  fs.writeFileSync(provenancePath(v, VENDORED_WORKFLOW), JSON.stringify(prov));
  fs.writeFileSync(path.join(v, VENDORED_WORKFLOW, 'bed.wav'), 'RIFF');
  const media = cmdCheck({ vendorDir: v, name: VENDORED_WORKFLOW });
  assert.ok(media.problems.some((p) => /media binaries in the copy: bed\.wav/.test(p)));
  fs.rmSync(path.join(v, VENDORED_WORKFLOW, 'bed.wav'));
  fs.rmSync(path.join(v, 'LICENSE-hyperframes'));
  assert.ok(cmdCheck({ vendorDir: v, name: VENDORED_WORKFLOW }).problems.some((p) => /LICENSE-hyperframes missing/.test(p)));
  const empty = cmdCheck({ vendorDir: tmp(), name: VENDORED_WORKFLOW });
  assert.equal(empty.exit, 3);
  assert.match(empty.problems[0], /missing provenance/);
});

test('cmdSeed: installs the vendored copy when absent (hash verified), never overwrites without --force, backs up on --force; cmdDrift reports same / drift / not-installed', () => {
  const skills = path.join(tmp(), 'skills');
  const notInstalled = cmdDrift({ vendorDir: vendor, name: VENDORED_WORKFLOW, skillsDir: skills });
  assert.equal(notInstalled.state, 'not-installed');
  assert.equal(notInstalled.exit, 3);
  const s1 = cmdSeed({ vendorDir: vendor, name: VENDORED_WORKFLOW, skillsDir: skills, force: false });
  assert.equal(s1.seeded, true, s1.reason);
  assert.equal(s1.files, 30);
  assert.equal(s1.hash, 'd87f7ae140e88403');
  assert.equal(s1.backup, null);
  assert.ok(fs.existsSync(path.join(skills, VENDORED_WORKFLOW, 'SKILL.md')));
  const same = cmdDrift({ vendorDir: vendor, name: VENDORED_WORKFLOW, skillsDir: skills });
  assert.equal(same.state, 'same');
  assert.equal(same.exit, 0);
  assert.equal(same.installed_hash, same.vendored_hash);
  const s2 = cmdSeed({ vendorDir: vendor, name: VENDORED_WORKFLOW, skillsDir: skills, force: false });
  assert.equal(s2.seeded, false);
  assert.match(s2.reason, /already matches/);
  fs.appendFileSync(path.join(skills, VENDORED_WORKFLOW, 'SKILL.md'), '\nlocal edit\n');
  const s3 = cmdSeed({ vendorDir: vendor, name: VENDORED_WORKFLOW, skillsDir: skills, force: false });
  assert.equal(s3.seeded, false);
  assert.match(s3.reason, /differs from the vendored one; not overwritten/);
  assert.equal(s3.installed_matches_vendored, false);
  const drift = cmdDrift({ vendorDir: vendor, name: VENDORED_WORKFLOW, skillsDir: skills });
  assert.equal(drift.state, 'drift');
  assert.equal(drift.exit, 3);
  assert.deepEqual(drift.diff.changed, ['SKILL.md']);
  assert.match(drift.hint, /not the one the plugin was verified against/);
  const s4 = cmdSeed({ vendorDir: vendor, name: VENDORED_WORKFLOW, skillsDir: skills, force: true });
  assert.equal(s4.seeded, true);
  assert.match(s4.backup, new RegExp(`${VENDORED_WORKFLOW}\\.pre-seed-\\d+$`));
  assert.ok(fs.existsSync(path.join(s4.backup, 'SKILL.md')));
  assert.equal(cmdDrift({ vendorDir: vendor, name: VENDORED_WORKFLOW, skillsDir: skills }).state, 'same');
  const none = cmdSeed({ vendorDir: tmp(), name: VENDORED_WORKFLOW, skillsDir: skills, force: false });
  assert.equal(none.exit, 1);
  assert.match(none.reason, /no vendored copy/);
});

test('CLI: --help, usage exit 2, check exit 0 on the real vendor dir, seed/drift --json against a temp skills dir', () => {
  const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: '' } });
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.equal(help.stdout, USAGE);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run(['nope']).status, 2);
  const check = run(['check']);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /^vendor-workflow check: ok — product-launch-video at v0\.8\.47 \([0-9a-f]{12}\), hash d87f7ae140e88403, 30 files/);
  const bad = run(['check', '--vendor-dir', tmp()]);
  assert.equal(bad.status, 3);
  assert.match(bad.stdout, /FAILED/);
  const skills = path.join(tmp(), 'skills');
  const seed = run(['seed', '--skills-dir', skills, '--json']);
  assert.equal(seed.status, 0, seed.stderr);
  assert.equal(JSON.parse(seed.stdout).seeded, true);
  const drift = run(['drift', '--skills-dir', skills]);
  assert.equal(drift.status, 0);
  assert.match(drift.stdout, /^vendor-workflow drift: same/);
  const missing = run(['drift', '--skills-dir', path.join(tmp(), 'nothing')]);
  assert.equal(missing.status, 3);
  assert.match(missing.stdout, /not-installed/);
});

test('resolveTag: the pinned release tag exists upstream and matches the vendored commit (network; skipped offline)', (t) => {
  let sha;
  try { sha = resolveTag(`https://github.com/${UPSTREAM_REPO}.git`, upstreamTag(HYPERFRAMES_PIN)); } catch (err) { return t.skip(`no network: ${err.message}`); }
  assert.equal(sha, readProvenance(vendor, VENDORED_WORKFLOW).upstream.commit);
});
