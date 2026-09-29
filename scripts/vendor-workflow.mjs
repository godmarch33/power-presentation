import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pluginRoot, userSkillsDir, vendorDir } from './lib/paths.mjs';
import { HYPERFRAMES_PIN, UPSTREAM_REPO, VENDORED_WORKFLOW, upstreamTag, PLUGIN_VERSION } from './lib/versions.mjs';
import { copyTree, diffTrees, findMedia, hashSkillBundle } from './lib/skill-bundle.mjs';

export const USAGE = `Usage: node scripts/vendor-workflow.mjs [fetch|check|seed|drift] [options]

Vendor the HyperFrames \`${VENDORED_WORKFLOW}\` workflow at the pinned release.

Commands
  fetch          fetch skills/${VENDORED_WORKFLOW} from ${UPSTREAM_REPO} at ${upstreamTag(HYPERFRAMES_PIN)} into vendor/ (default; git + network)
  check          verify vendor/${VENDORED_WORKFLOW} against the provenance record (offline; exit 3 on mismatch)
  seed           copy the vendored workflow into <skills-dir>/${VENDORED_WORKFLOW} when it is absent
  drift          compare the installed <skills-dir>/${VENDORED_WORKFLOW} with the vendored copy (exit 3 when they differ)

Options
  --tag <tag>           git tag to fetch (default v<pin> = ${upstreamTag(HYPERFRAMES_PIN)})
  --commit <sha>        exact commit to fetch instead of the tag (still recorded with --tag for display)
  --name <skill>        workflow skill name (default ${VENDORED_WORKFLOW})
  --vendor-dir <dir>    where the copy lives (default <plugin>/vendor)
  --skills-dir <dir>    user-level skills dir for seed/drift (default ~/.claude/skills)
  --force               seed: replace an existing installed copy (default: never overwrite)
  --keep-clone          fetch: keep the temporary clone directory (printed)
  --json                machine-readable result on stdout
  -h, --help            this text

Exit codes: 0 ok · 1 runtime failure · 2 usage · 3 check failed / drift / media binaries in the fetched tree
`;

export function parseArgs(argv) {
  const opts = {
    command: 'fetch', tag: null, commit: null, name: VENDORED_WORKFLOW, vendorDir: null, skillsDir: null,
    force: false, keepClone: false, json: false, help: false,
  };
  const args = [...argv];
  const takeValue = (flag) => {
    if (args.length === 0 || args[0].startsWith('-')) throw new Error(`${flag} needs a value`);
    return args.shift();
  };
  let commandSeen = false;
  while (args.length) {
    const a = args.shift();
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--json': opts.json = true; break;
      case '--force': opts.force = true; break;
      case '--keep-clone': opts.keepClone = true; break;
      case '--tag': opts.tag = takeValue(a); break;
      case '--commit': opts.commit = takeValue(a); break;
      case '--name': opts.name = takeValue(a); break;
      case '--vendor-dir': opts.vendorDir = takeValue(a); break;
      case '--skills-dir': opts.skillsDir = takeValue(a); break;
      default:
        if (a.startsWith('-')) throw new Error(`unknown flag ${a}`);
        if (commandSeen) throw new Error(`unexpected argument ${a}`);
        if (!['fetch', 'check', 'seed', 'drift'].includes(a)) throw new Error(`unknown command ${a}`);
        opts.command = a; commandSeen = true;
    }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(opts.name)) throw new Error(`--name must be a plain skill slug, got ${opts.name}`);
  if (opts.commit && !/^[0-9a-f]{7,40}$/i.test(opts.commit)) throw new Error('--commit must be a hex sha');
  return opts;
}

export function provenancePath(dir, name) {
  return path.join(dir, `${name}.vendored.json`);
}

export function readProvenance(dir, name) {
  try { return JSON.parse(fs.readFileSync(provenancePath(dir, name), 'utf8')); } catch { return null; }
}

function git(args, cwd, { timeoutMs = 120000 } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.error) throw new Error(`git ${args[0]}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed (${r.status}): ${(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
  return r.stdout;
}

export function resolveTag(repoUrl, tag) {
  const out = git(['ls-remote', '--tags', repoUrl, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], undefined, { timeoutMs: 60000 });
  const lines = out.trim().split('\n').filter(Boolean).map((l) => l.split(/\s+/));
  const peeled = lines.find((l) => l[1] === `refs/tags/${tag}^{}`);
  const plain = lines.find((l) => l[1] === `refs/tags/${tag}`);
  const sha = (peeled ?? plain)?.[0];
  if (!sha) throw new Error(`tag ${tag} not found at ${repoUrl}`);
  return sha;
}

export function sparseFetch(repoUrl, commit, sparsePaths, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  git(['init', '-q'], workDir);
  git(['remote', 'add', 'origin', repoUrl], workDir);
  git(['config', 'core.sparseCheckout', 'true'], workDir);
  git(['sparse-checkout', 'init', '--cone'], workDir);
  git(['sparse-checkout', 'set', ...sparsePaths], workDir);
  git(['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', commit], workDir, { timeoutMs: 300000 });
  git(['checkout', '-q', 'FETCH_HEAD'], workDir);
  const meta = git(['log', '-1', '--format=%H%n%cI%n%s', 'FETCH_HEAD'], workDir).trim().split('\n');
  return { dir: workDir, commit: meta[0], committed_at: meta[1], subject: meta[2] ?? '' };
}

export function manifestEntry(cloneDir, name) {
  try {
    const raw = git(['show', `FETCH_HEAD:skills-manifest.json`], cloneDir);
    const m = JSON.parse(raw);
    return m?.skills?.[name] ?? null;
  } catch { return null; }
}

export function writeNotice(vendor, name, prov) {
  const text = `NOTICE — vendored HyperFrames workflow

${name}/ is an unmodified copy of skills/${name}/ from https://github.com/${prov.upstream.repo}
at tag ${prov.upstream.tag} (commit ${prov.upstream.commit}, ${prov.upstream.committed_at}).

HyperFrames is Copyright (c) HeyGen and contributors and is licensed under the
Apache License, Version 2.0 — see LICENSE-hyperframes in this directory (the LICENSE
file of the same commit). The upstream repository ships no NOTICE file at that commit;
this file records the attribution the plugin owes for the copy.

The copy is kept pristine (bundle hash ${prov.bundle.hash}, ${prov.bundle.files} files —
the same hash HyperFrames publishes in skills-manifest.json). Plugin deltas never edit it:
they ride in BRIEF.md \`## Customizations\` / \`## Notes\` and in the plugin's own
skills/, agents/, scripts/. Re-vendor with:

  node scripts/vendor-workflow.mjs fetch      # at the pinned tag (scripts/lib/versions.mjs)
  node scripts/vendor-workflow.mjs check      # offline integrity check (CI)
`;
  fs.writeFileSync(path.join(vendor, 'NOTICE'), text);
}

export function cmdFetch(opts, { log = (s) => process.stderr.write(`${s}\n`) } = {}) {
  const vendor = opts.vendorDir ?? vendorDir();
  const name = opts.name;
  const repoUrl = `https://github.com/${UPSTREAM_REPO}.git`;
  const tag = opts.tag ?? upstreamTag(HYPERFRAMES_PIN);
  const commit = opts.commit ?? resolveTag(repoUrl, tag);
  log(`vendor-workflow: ${name} from ${UPSTREAM_REPO} @ ${tag} (${commit})`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-vendor-'));
  const cloneDir = path.join(work, 'clone');
  try {
    const fetched = sparseFetch(repoUrl, commit, [`skills/${name}`], cloneDir);
    const srcSkill = path.join(cloneDir, 'skills', name);
    if (!fs.existsSync(path.join(srcSkill, 'SKILL.md'))) throw new Error(`skills/${name}/SKILL.md is not in ${UPSTREAM_REPO}@${commit}`);
    const media = findMedia(srcSkill);
    if (media.length) {
      return { ok: false, exit: 3, error: `upstream skills/${name} carries media binaries (forbids them in the package): ${media.join(', ')}`, media };
    }
    const bundle = hashSkillBundle(srcSkill);
    const manifest = manifestEntry(cloneDir, name);
    if (manifest && manifest.hash !== bundle.hash) {
      return { ok: false, exit: 3, error: `bundle hash ${bundle.hash} differs from upstream skills-manifest.json (${manifest.hash}) — the checkout is not the published bundle` };
    }
    let license = null;
    try { license = git(['show', 'FETCH_HEAD:LICENSE'], cloneDir); } catch { }
    let upstreamNotice = null;
    try { upstreamNotice = git(['show', 'FETCH_HEAD:NOTICE'], cloneDir); } catch { }

    const dest = path.join(vendor, name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(vendor, { recursive: true });
    const copied = copyTree(srcSkill, dest);
    const verify = hashSkillBundle(dest);
    if (verify.hash !== bundle.hash) throw new Error(`copy hash ${verify.hash} != source ${bundle.hash}`);

    const prov = {
      schema: 'power-presentation/vendored-skill@0.1',
      skill: name,
      vendored_at: new Date().toISOString(),
      plugin_version: PLUGIN_VERSION,
      hyperframes_pin: HYPERFRAMES_PIN,
      upstream: { repo: UPSTREAM_REPO, tag, commit: fetched.commit, committed_at: fetched.committed_at, subject: fetched.subject, path: `skills/${name}` },
      bundle: { hash: bundle.hash, files: bundle.files, algorithm: 'hyperframes skills-manifest (sha256 over sorted rel paths + content, text CRLF→LF, 16 hex)' },
      manifest_entry: manifest,
      license: license ? { file: 'LICENSE-hyperframes', spdx: 'Apache-2.0', source: 'LICENSE at the same commit' } : null,
      upstream_notice: upstreamNotice ? 'NOTICE-hyperframes' : null,
      rules: [
        'entry into the workflow only through BRIEF.md; the copy seeds ~/.claude/skills/<name>, nothing imports vendor/ directly',
        're-vendor at every HyperFrames bump and re-run the golden set',
        'no media binaries in the package',
        'keep the Apache-2.0 LICENSE/NOTICE with the copy',
      ],
    };
    fs.writeFileSync(provenancePath(vendor, name), `${JSON.stringify(prov, null, 2)}\n`);
    if (license) fs.writeFileSync(path.join(vendor, 'LICENSE-hyperframes'), license);
    if (upstreamNotice) fs.writeFileSync(path.join(vendor, 'NOTICE-hyperframes'), upstreamNotice);
    writeNotice(vendor, name, prov);
    log(`vendor-workflow: ${copied} files → ${path.relative(process.cwd(), dest) || dest} (hash ${bundle.hash})`);
    return { ok: true, exit: 0, dest, provenance: prov, clone: opts.keepClone ? cloneDir : null };
  } finally {
    if (!opts.keepClone) fs.rmSync(work, { recursive: true, force: true });
  }
}

export function cmdCheck(opts) {
  const vendor = opts.vendorDir ?? vendorDir();
  const name = opts.name;
  const dest = path.join(vendor, name);
  const prov = readProvenance(vendor, name);
  const problems = [];
  if (!prov) problems.push(`missing provenance ${path.relative(process.cwd(), provenancePath(vendor, name)) || provenancePath(vendor, name)} — run \`node scripts/vendor-workflow.mjs fetch\``);
  if (!fs.existsSync(path.join(dest, 'SKILL.md'))) problems.push(`missing ${name}/SKILL.md under ${vendor}`);
  let bundle = null;
  if (problems.length === 0) {
    bundle = hashSkillBundle(dest);
    if (bundle.hash !== prov.bundle.hash || bundle.files !== prov.bundle.files) {
      problems.push(`vendored tree hashes to ${bundle.hash} (${bundle.files} files) but the provenance record says ${prov.bundle.hash} (${prov.bundle.files}) — the copy was edited; plugin deltas belong in BRIEF.md / skills/, not in vendor/`);
    }
    if (prov.hyperframes_pin !== HYPERFRAMES_PIN) {
      problems.push(`vendored at hyperframes ${prov.hyperframes_pin} but scripts/lib/versions.mjs pins ${HYPERFRAMES_PIN} — re-vendor`);
    }
    const media = findMedia(dest);
    if (media.length) problems.push(`media binaries in the copy: ${media.join(', ')}`);
    if (!fs.existsSync(path.join(vendor, 'LICENSE-hyperframes'))) problems.push('LICENSE-hyperframes missing next to the copy');
    if (!fs.existsSync(path.join(vendor, 'NOTICE'))) problems.push('NOTICE missing next to the copy');
  }
  return { ok: problems.length === 0, exit: problems.length === 0 ? 0 : 3, name, dir: dest, provenance: prov, bundle, problems };
}

export function cmdSeed(opts, { skillsDir = opts.skillsDir ?? userSkillsDir() } = {}) {
  const vendor = opts.vendorDir ?? vendorDir();
  const name = opts.name;
  const src = path.join(vendor, name);
  const dest = path.join(skillsDir, name);
  const prov = readProvenance(vendor, name);
  if (!fs.existsSync(path.join(src, 'SKILL.md')) || !prov) {
    return { ok: false, exit: 1, seeded: false, reason: `no vendored copy at ${src} (run fetch)`, dest };
  }
  const installed = fs.existsSync(path.join(dest, 'SKILL.md'));
  if (installed && !opts.force) {
    const same = diffTrees(src, dest).same;
    return { ok: true, exit: 0, seeded: false, reason: same ? 'installed copy already matches the vendored one' : 'installed copy present (differs from the vendored one; not overwritten — use --force or `hyperframes skills update`)', dest, installed_matches_vendored: same };
  }
  const bak = installed ? `${dest}.pre-seed-${Date.now()}` : null;
  if (bak) fs.renameSync(dest, bak);
  fs.mkdirSync(skillsDir, { recursive: true });
  const copied = copyTree(src, dest);
  const verify = hashSkillBundle(dest);
  if (verify.hash !== prov.bundle.hash) {
    return { ok: false, exit: 1, seeded: true, reason: `seeded copy hashes to ${verify.hash}, expected ${prov.bundle.hash}`, dest, backup: bak };
  }
  return { ok: true, exit: 0, seeded: true, reason: bak ? `replaced the installed copy (backup at ${bak})` : 'installed from the vendored copy', dest, files: copied, hash: verify.hash, backup: bak, installed_matches_vendored: true };
}

export function cmdDrift(opts, { skillsDir = opts.skillsDir ?? userSkillsDir() } = {}) {
  const vendor = opts.vendorDir ?? vendorDir();
  const name = opts.name;
  const src = path.join(vendor, name);
  const dest = path.join(skillsDir, name);
  if (!fs.existsSync(path.join(src, 'SKILL.md'))) return { ok: false, exit: 1, state: 'no-vendored-copy', vendored: src, installed: dest };
  if (!fs.existsSync(path.join(dest, 'SKILL.md'))) return { ok: false, exit: 3, state: 'not-installed', vendored: src, installed: dest, hint: 'node scripts/vendor-workflow.mjs seed' };
  const diff = diffTrees(src, dest);
  const installedHash = hashSkillBundle(dest);
  return {
    ok: diff.same, exit: diff.same ? 0 : 3, state: diff.same ? 'same' : 'drift', vendored: src, installed: dest,
    vendored_hash: hashSkillBundle(src).hash, installed_hash: installedHash.hash, diff,
    hint: diff.same ? null : 'the installed workflow is not the one the plugin was verified against: re-seed with `node scripts/vendor-workflow.mjs seed --force` to pin it, or re-vendor after re-running the golden set',
  };
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { process.stderr.write(`vendor-workflow: ${err.message}\n\n${USAGE}`); return 2; }
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  let result;
  try {
    if (opts.command === 'fetch') result = cmdFetch(opts);
    else if (opts.command === 'check') result = cmdCheck(opts);
    else if (opts.command === 'seed') result = cmdSeed(opts);
    else result = cmdDrift(opts);
  } catch (err) {
    if (opts.json) process.stdout.write(`${JSON.stringify({ ok: false, error: err.message })}\n`);
    process.stderr.write(`vendor-workflow ${opts.command}: ${err.message}\n`);
    return 1;
  }
  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (opts.command === 'check') {
    process.stdout.write(result.ok
      ? `vendor-workflow check: ok — ${result.name} at ${result.provenance.upstream.tag} (${result.provenance.upstream.commit.slice(0, 12)}), hash ${result.bundle.hash}, ${result.bundle.files} files\n`
      : `vendor-workflow check: FAILED\n${result.problems.map((p) => `  - ${p}`).join('\n')}\n`);
  } else if (opts.command === 'seed') {
    process.stdout.write(`vendor-workflow seed: ${result.seeded ? 'seeded' : 'skipped'} — ${result.reason} (${result.dest})\n`);
  } else if (opts.command === 'drift') {
    process.stdout.write(`vendor-workflow drift: ${result.state}${result.diff ? ` (changed ${result.diff.changed.length}, only vendored ${result.diff.only_a.length}, only installed ${result.diff.only_b.length})` : ''}${result.hint ? `\n  ${result.hint}` : ''}\n`);
  } else {
    process.stdout.write(result.ok ? `vendor-workflow fetch: ${result.provenance.skill} @ ${result.provenance.upstream.tag} → ${result.dest}\n` : `vendor-workflow fetch: FAILED — ${result.error}\n`);
  }
  return result.exit ?? (result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
