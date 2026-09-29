import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  STAGED_FONTS_HEADING, declaredFamilies, faceOf, familyOfFace, fontFaceRule, missingFontsReason, stageFonts, upsertSection,
} from './lib/fonts.mjs';
import { HYPERFRAMES_PIN } from './lib/versions.mjs';
import { frameIdOf, parseStoryboard, skillPathLines, stageInit, stagePackets, unpinnedScripts, withDirection, withSkillPaths } from './render-path.mjs';

const tmpDirs = [];
function tmp(prefix = 'pp-fonts-') { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); tmpDirs.push(d); return d; }
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function nameTable(strings) {
  const recs = Object.entries(strings).map(([id, text]) => ({ id: Number(id), buf: Buffer.from(text, 'utf16le').swap16() }));
  const head = Buffer.alloc(6 + recs.length * 12);
  head.writeUInt16BE(recs.length, 2); head.writeUInt16BE(head.length, 4);
  let off = 0;
  recs.forEach((r, i) => {
    const o = 6 + i * 12;
    head.writeUInt16BE(3, o); head.writeUInt16BE(1, o + 2); head.writeUInt16BE(0x409, o + 4);
    head.writeUInt16BE(r.id, o + 6); head.writeUInt16BE(r.buf.length, o + 8); head.writeUInt16BE(off, o + 10);
    off += r.buf.length;
  });
  return Buffer.concat([head, ...recs.map((r) => r.buf)]);
}
function font({ family, weight = 400, italic = false, wght = null }) {
  const os2 = Buffer.alloc(78);
  os2.writeUInt16BE(weight, 4); os2.writeUInt16BE(italic ? 0x81 : 0x40, 62);
  const tables = { name: nameTable({ 1: family, 13: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.', 14: 'https://openfontlicense.org' }), 'OS/2': os2 };
  if (wght) {
    const fvar = Buffer.alloc(16 + 20);
    fvar.writeUInt16BE(1, 0); fvar.writeUInt16BE(16, 4); fvar.writeUInt16BE(1, 8); fvar.writeUInt16BE(20, 10);
    fvar.write('wght', 16, 'latin1'); fvar.writeInt32BE(wght[0] * 65536, 20); fvar.writeInt32BE(400 * 65536, 24); fvar.writeInt32BE(wght[1] * 65536, 28);
    tables.fvar = fvar;
  }
  const tags = Object.keys(tables).sort();
  const dir = Buffer.alloc(12 + tags.length * 16);
  dir.writeUInt32BE(0x00010000, 0); dir.writeUInt16BE(tags.length, 4);
  let off = dir.length;
  const bodies = [];
  tags.forEach((tag, i) => {
    const e = 12 + i * 16;
    dir.write(tag, e, 'latin1'); dir.writeUInt32BE(off, e + 8); dir.writeUInt32BE(tables[tag].length, e + 12);
    const padded = Buffer.concat([tables[tag], Buffer.alloc((4 - (tables[tag].length % 4)) % 4)]);
    bodies.push(padded); off += padded.length;
  });
  return Buffer.concat([dir, ...bodies]);
}

function fakeFontsource(packages) {
  const nm = tmp('pp-fonts-nm-');
  for (const { family, weights, italic = [], faceFamily = family } of packages) {
    const id = family.toLowerCase().replace(/\s+/g, '-');
    const dir = path.join(nm, '@fontsource', id);
    fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ id, family, weights, styles: italic.length ? ['italic', 'normal'] : ['normal'], license: { type: 'OFL-1.1' } }));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `@fontsource/${id}`, version: '5.3.0', license: 'OFL-1.1' }));
    for (const w of weights) fs.writeFileSync(path.join(dir, 'files', `${id}-latin-${w}-normal.woff2`), font({ family: faceFamily, weight: w }));
    for (const w of italic) fs.writeFileSync(path.join(dir, 'files', `${id}-latin-${w}-italic.woff2`), font({ family: faceFamily, weight: w, italic: true }));
  }
  return nm;
}

const FRAME_MD = `---
version: alpha
name: Test preset — Frame
typography:
  # — reading ramp —
  body:    { fontFamily: "Inter", cqw: 0.85, weight: 400, lineHeight: 1.6 }
  h4-eyebrow:{ fontFamily: "Space Grotesk", cqw: 0.8, weight: 600, tracking: "0.08em", upper: true }
  h1:      { fontFamily: "Space Grotesk", cqw: 4.2, weight: 700, lineHeight: 1.08 }
  quote:   { fontFamily: "Space Grotesk", cqw: 2.4, weight: 500, italic: true }
  code:    { fontFamily: monospace, weight: 400 }
spacing:
  unit: 8
---

## Overview

The frame.
`;

const NM_SPEC = [
  { family: 'Inter', weights: [100, 400, 500, 700, 900] },
  { family: 'Space Grotesk', weights: [300, 400, 500, 600, 700], italic: [], faceFamily: 'Space Grotesk Light' },
];

function project(md = FRAME_MD) {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'frame.md'), md);
  return dir;
}
const realDir = (d) => { try { return fs.realpathSync(d); } catch { return d; } };
const fontsIn = (dir) => { try { return fs.readdirSync(path.join(dir, 'assets', 'fonts')).sort(); } catch { return []; } };

test('declaredFamilies(): every typography family with its weights and italic weights; generic keywords and other blocks ignored', () => {
  assert.deepEqual(declaredFamilies(FRAME_MD), [
    { family: 'Inter', weights: [400], italic: [] },
    { family: 'Space Grotesk', weights: [500, 600, 700], italic: [500] },
  ]);
  assert.deepEqual(declaredFamilies('# no frontmatter\n'), []);
  assert.deepEqual(declaredFamilies('typography:\n  a: { fontFamily: \'EB Garamond\', weight: 400 }\n  b: { fontFamily: "Inter, sans-serif" }\n'), [
    { family: 'EB Garamond', weights: [400], italic: [] }, { family: 'Inter', weights: [400], italic: [] },
  ], 'single quotes; a stack keeps its first family; no weight = 400');
});

test('faceOf() / familyOfFace(): weight, italic and a variable range from the file\'s own tables; a style word may follow the family, another word may not', () => {
  assert.deepEqual(faceOf(font({ family: 'Inter', weight: 700 })), { family: 'Inter', weight: 700, style: 'normal', variable: false });
  assert.deepEqual(faceOf(font({ family: 'EB Garamond', italic: true })), { family: 'EB Garamond', weight: 400, style: 'italic', variable: false });
  assert.deepEqual(faceOf(font({ family: 'Space Grotesk Light', weight: 300, wght: [300, 700] })).weight, [300, 700]);
  const fams = ['Inter', 'Space Grotesk', 'Inter Display'];
  assert.equal(familyOfFace({ family: 'Space Grotesk Light' }, fams), 'Space Grotesk', '@fontsource Space Grotesk names its faces "Space Grotesk Light"');
  assert.equal(familyOfFace({ family: 'Inter Medium' }, fams), 'Inter');
  assert.equal(familyOfFace({ family: 'Inter Display' }, fams), 'Inter Display', 'the longest declared key wins');
  assert.equal(familyOfFace({ family: 'Inter Tight' }, fams), null, 'Inter Tight is another family, not an Inter weight');
  assert.equal(familyOfFace(null, fams, 'TT_Inter_Bold.woff2'), null);
  assert.equal(familyOfFace(null, fams, 'SpaceGrotesk-latin-wght.woff2'), 'Space Grotesk', 'unreadable tables: the file name prefix (captions.mjs)');
});

test('fontFaceRule() / upsertSection(): root-relative rule; the section is appended once and replaced in place between headings', () => {
  assert.equal(fontFaceRule({ family: 'Space Grotesk', file: 'SpaceGrotesk-latin-wght.woff2', weight: [300, 700], style: 'normal' }),
    '@font-face { font-family: "Space Grotesk"; src: url("assets/fonts/SpaceGrotesk-latin-wght.woff2") format("woff2"); font-weight: 300 700; font-style: normal; font-display: block; }');
  const one = upsertSection('# F\n\n## A\n\ntext\n', `${STAGED_FONTS_HEADING}\n\nv1\n`);
  assert.equal(one, `# F\n\n## A\n\ntext\n\n${STAGED_FONTS_HEADING}\n\nv1\n`);
  assert.equal(upsertSection(one, `${STAGED_FONTS_HEADING}\n\nv1\n`), one, 'idempotent');
  const mid = `# F\n\n${STAGED_FONTS_HEADING}\n\nold\nold\n\n## Next\n\nkeep\n`;
  assert.equal(upsertSection(mid, `${STAGED_FONTS_HEADING}\n\nnew\n`), `# F\n\n${STAGED_FONTS_HEADING}\n\nnew\n\n## Next\n\nkeep\n`);
});

test('stageFonts(): a preset run stages the declared weights (+ 400/700) from the pinned package, writes ## Staged fonts, and is idempotent (C1, D1, GS02I-03)', () => {
  const dir = project();
  const nm = fakeFontsource(NM_SPEC);
  const r = stageFonts(dir, { nodeModules: nm });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.families, ['Inter', 'Space Grotesk']);
  assert.deepEqual(fontsIn(dir), ['Inter-400.woff2', 'Inter-700.woff2', 'SpaceGrotesk-400.woff2', 'SpaceGrotesk-500.woff2', 'SpaceGrotesk-600.woff2', 'SpaceGrotesk-700.woff2']);
  assert.ok(r.notes.some((n) => /Space Grotesk 500 italic/.test(n)), 'an italic the package lacks is named, not invented');
  const md = fs.readFileSync(path.join(dir, 'frame.md'), 'utf8');
  assert.ok(md.startsWith(FRAME_MD.trimEnd()), 'frame.md above the section is untouched');
  const section = md.slice(md.indexOf(STAGED_FONTS_HEADING));
  assert.match(section, /^## Staged fonts\n/);
  assert.match(section, /```css\n@font-face \{ font-family: "Inter"; src: url\("assets\/fonts\/Inter-400\.woff2"\) format\("woff2"\); font-weight: 400; font-style: normal; font-display: block; \}\n/);
  assert.equal((section.match(/@font-face/g) ?? []).length, 6);
  assert.doesNotMatch(section, /googleapis|gstatic/, 'nothing remote');
  const again = stageFonts(dir, { nodeModules: nm });
  assert.equal(again.changed, false);
  assert.deepEqual(again.staged, []);
  assert.equal(fs.readFileSync(path.join(dir, 'frame.md'), 'utf8'), md, 'a second run leaves frame.md byte-identical');
});

test('stageFonts(): brand faces already in assets/fonts/ are used as they are; the package only fills a declared weight they miss; a variable face covers its range', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, 'assets', 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'fonts', 'brand-inter-regular.woff2'), font({ family: 'Inter', weight: 400 }));
  fs.writeFileSync(path.join(dir, 'assets', 'fonts', 'SpaceGrotesk-latin-wght.woff2'), font({ family: 'Space Grotesk Light', weight: 300, wght: [300, 700] }));
  fs.writeFileSync(path.join(dir, 'assets', 'fonts', 'Other-700.woff2'), font({ family: 'Roboto', weight: 700 }));
  const r = stageFonts(dir, { nodeModules: fakeFontsource(NM_SPEC) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.staged, [], 'Inter 400 and the whole Space Grotesk range are local: nothing comes from the toolchain');
  assert.deepEqual(r.rules, [
    '@font-face { font-family: "Inter"; src: url("assets/fonts/brand-inter-regular.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: block; }',
    '@font-face { font-family: "Space Grotesk"; src: url("assets/fonts/SpaceGrotesk-latin-wght.woff2") format("woff2"); font-weight: 300 700; font-style: normal; font-display: block; }',
  ], 'a face of an undeclared family (Roboto) is not listed');
  const md = FRAME_MD.replace('weight: 400, lineHeight: 1.6', 'weight: 500, lineHeight: 1.6');
  const dir2 = project(md);
  fs.mkdirSync(path.join(dir2, 'assets', 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(dir2, 'assets', 'fonts', 'Inter-Regular.woff2'), font({ family: 'Inter', weight: 400 }));
  const r2 = stageFonts(dir2, { nodeModules: fakeFontsource(NM_SPEC) });
  assert.ok(fontsIn(dir2).includes('Inter-500.woff2'), 'the declared 500 the brand files lack comes from the pinned package');
  assert.ok(!fontsIn(dir2).includes('Inter-700.woff2'), 'no 400/700 extras next to brand files');
  assert.equal(r2.ok, true);
});

test('stageFonts(): a declared family with no face fails before anything is copied or written; the reason names it; no frame.md = nothing to do', () => {
  const md = FRAME_MD.replace('fontFamily: "Inter"', 'fontFamily: "Archivo"');
  const dir = project(md);
  const r = stageFonts(dir, { nodeModules: fakeFontsource(NM_SPEC) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['Archivo']);
  assert.deepEqual(fontsIn(dir), [], 'Space Grotesk is not half-staged');
  assert.equal(fs.readFileSync(path.join(dir, 'frame.md'), 'utf8'), md);
  assert.match(missingFontsReason(r.missing), /"Archivo".*toolchain\.mjs install.*QA-14; no Google Fonts fetch/);
  assert.equal(stageFonts(dir, { nodeModules: null }).missing.length, 2, 'no toolchain → every family is missing');
  const none = stageFonts(tmp(), { nodeModules: null });
  assert.equal(none.ok, true);
  assert.match(none.notes[0], /frame\.md missing/);
  const dry = project();
  const d = stageFonts(dry, { nodeModules: fakeFontsource(NM_SPEC), dryRun: true });
  assert.equal(d.ok, true); assert.equal(d.rules.length, 6);
  assert.deepEqual(fontsIn(dry), []); assert.equal(fs.readFileSync(path.join(dry, 'frame.md'), 'utf8'), FRAME_MD, '--dry-run writes nothing');
});

function packetsCtx(dir, nodeModules) {
  const skills = tmp('pp-fonts-skills-');
  const workflowDir = path.join(skills, 'product-launch-video');
  for (const d of ['hyperframes', 'hyperframes-animation', 'media-use']) fs.mkdirSync(path.join(skills, d), { recursive: true });
  fs.mkdirSync(path.join(workflowDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(workflowDir, 'SKILL.md'), '# fake');
  const storyboardText = '---\nformat: 1920x1080\n---\n## Frame 1 — Hook\n- duration: 3s\n';
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), storyboardText);
  return {
    project: dir, p: (...s) => path.join(dir, ...s), workflowDir, storyboardText, storyboard: parseStoryboard(storyboardText),
    paths: { node_modules: nodeModules }, pluginRootDir: tmp('pp-fonts-plugin-'), mode: 'marketing', formats: ['16:9'], env: {},
  };
}
function recorder() {
  const calls = [];
  const run = (cmd, args) => { calls.push([cmd, ...args].join(' ')); return { status: 0, stdout: '', stderr: '', seconds: 0 }; };
  return { run, calls };
}

test('stagePackets(): fonts are staged before frame-packets.mjs runs; a family with no face stops the stage (exit 3) and no packet is built', () => {
  const dir = project();
  const ok = recorder();
  const r = stagePackets(packetsCtx(dir, fakeFontsource(NM_SPEC)), { allowDrift: true }, ok.run);
  assert.equal(r.ok, true, r.reason);
  assert.equal(ok.calls.length, 1);
  assert.match(ok.calls[0], /frame-packets\.mjs/);
  assert.match(r.notes[0], /^fonts: 2 families \(Inter, Space Grotesk\) → 6 @font-face rule\(s\) in frame\.md ## Staged fonts; 6 face\(s\) staged/);
  assert.match(fs.readFileSync(path.join(dir, 'frame.md'), 'utf8'), /## Staged fonts/);

  const bad = project(FRAME_MD.replace('fontFamily: "Inter"', 'fontFamily: "Archivo"'));
  const no = recorder();
  const r2 = stagePackets(packetsCtx(bad, fakeFontsource(NM_SPEC)), { allowDrift: true }, no.run);
  assert.equal(r2.ok, false);
  assert.equal(r2.exit, 3);
  assert.match(r2.reason, /"Archivo"/);
  assert.deepEqual(no.calls, [], 'the workers are never dispatched without their fonts');
});

function initRunner({ fail = false, version = HYPERFRAMES_PIN } = {}) {
  const calls = [];
  const run = (cmd, args, o = {}) => {
    calls.push({ cmd, args, cwd: o.cwd, env: o.env });
    const at = args.indexOf('init');
    if (at < 0) return { status: 0, stdout: '', stderr: '', seconds: 0 };
    if (fail) return { status: 1, stdout: '', stderr: 'Directory already exists and is not empty', seconds: 0 };
    const out = path.join(o.cwd, args[at + 1]);
    fs.mkdirSync(out, { recursive: true });
    const spec = `hyperframes@${version}`;
    fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: args[at + 1], private: true, type: 'module', scripts: { dev: `npx --yes ${spec} preview`, check: `npx --yes ${spec} check`, render: `npx --yes ${spec} render` } }));
    fs.writeFileSync(path.join(out, 'hyperframes.json'), JSON.stringify({ authoringSkill: 'product-launch-video' }));
    for (const f of ['index.html', 'meta.json', 'AGENTS.md', 'CLAUDE.md']) fs.writeFileSync(path.join(out, f), `scaffold ${f}\n`);
    return { status: 0, stdout: '', stderr: '', seconds: 0.1 };
  };
  return { run, calls };
}
function initCtx(dir) {
  const nm = tmp('pp-init-nm-');
  return { project: dir, p: (...s) => path.join(dir, ...s), name: 'Acme Jobs launch', cli: { cmd: '/toolchain/node_modules/.bin/hyperframes', args: [], source: 'toolchain' }, paths: { node_modules: nm }, env: { HYPERFRAMES_SKIP_SKILLS: '0' } };
}

test('unpinnedScripts(): a script at another version or with none is named; the pin, @hyperframes/* and hyperframes.json are not the CLI', () => {
  assert.deepEqual(unpinnedScripts({ scripts: {
    dev: `npx --yes hyperframes@${HYPERFRAMES_PIN} preview`, render: 'npx --yes hyperframes@0.8.78 render', check: 'npx hyperframes check',
    map: 'node node_modules/@hyperframes/producer/x.js && cat hyperframes.json', lint: 'hyperframes lint && npx hyperframes@latest check',
  } }), [
    { script: 'render', spec: 'hyperframes@0.8.78' }, { script: 'check', spec: 'hyperframes' },
    { script: 'lint', spec: 'hyperframes' }, { script: 'lint', spec: 'hyperframes@latest' },
  ]);
  assert.deepEqual(unpinnedScripts({ scripts: { test: 'node --test' } }), [], "a repository's own package.json passes");
  assert.deepEqual(unpinnedScripts(null), []);
});

test('stageInit(): scaffolds with the pinned toolchain CLI in a temp dir and copies only what the project lacks (GS02I-08, GS03-04)', () => {
  const dir = tmp('pp-init-');
  fs.writeFileSync(path.join(dir, 'intake.json'), '{}');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), "# the repository's own\n");
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'acme', scripts: { test: 'node --test' } }));
  const { run, calls } = initRunner();
  const r = stageInit(initCtx(dir), {}, run);
  assert.equal(r.ok, true, r.reason);
  const init = calls.find((c) => c.args.includes('init'));
  assert.equal(init.cmd, '/toolchain/node_modules/.bin/hyperframes', 'the toolchain binary, never npx');
  assert.deepEqual(init.args, ['init', 'acme-jobs-launch', '--non-interactive', '--example=blank', '--skill=product-launch-video']);
  assert.notEqual(realDir(init.cwd), realDir(dir), 'init refuses a non-empty directory — it runs elsewhere');
  assert.equal(init.env.HYPERFRAMES_SKIP_SKILLS, '1');
  assert.ok(!fs.existsSync(init.cwd), 'the temp dir is removed');
  for (const f of ['hyperframes.json', 'index.html', 'meta.json', 'AGENTS.md']) assert.ok(fs.existsSync(path.join(dir, f)), f);
  assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), "# the repository's own\n", 'kept');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name, 'acme', 'kept');
  assert.ok(r.notes.some((n) => /scaffolded with the pinned hyperframes .*: AGENTS\.md, hyperframes\.json, index\.html, meta\.json; kept the project's own CLAUDE\.md, package\.json/.test(n)), r.notes.join('\n'));
  assert.ok(r.notes.some((n) => /package\.json has no hyperframes script/.test(n)), 'a repo package.json is a note, not a failure');
  assert.ok(fs.lstatSync(path.join(dir, 'node_modules', '.bin', 'hyperframes')).isSymbolicLink());

  const again = initRunner();
  const r2 = stageInit(initCtx(dir), {}, again.run);
  assert.equal(r2.ok, true);
  assert.ok(!again.calls.some((c) => c.args.includes('init')), 'hyperframes.json present → no second scaffold');

  const fresh = tmp('pp-init-');
  const r3 = stageInit(initCtx(fresh), {}, initRunner().run);
  assert.equal(r3.ok, true, r3.reason);
  assert.deepEqual(unpinnedScripts(JSON.parse(fs.readFileSync(path.join(fresh, 'package.json'), 'utf8'))), [], 'the pinned scaffold writes the pin');
});

test('stageInit(): a package.json script at npm latest or unversioned is refused (exit 3); a failed scaffold is a runtime failure', () => {
  const dir = tmp('pp-init-');
  const r = stageInit(initCtx(dir), {}, initRunner({ version: '0.8.78' }).run);
  assert.equal(r.ok, false);
  assert.equal(r.exit, 3);
  assert.match(r.reason, /dev \(hyperframes@0\.8\.78\), check \(hyperframes@0\.8\.78\), render \(hyperframes@0\.8\.78\) do not pin hyperframes@0\.8\.47/);
  const bare = tmp('pp-init-');
  fs.writeFileSync(path.join(bare, 'hyperframes.json'), '{}');
  fs.writeFileSync(path.join(bare, 'package.json'), JSON.stringify({ scripts: { dev: 'npx hyperframes preview' } }));
  assert.equal(stageInit(initCtx(bare), {}, initRunner().run).exit, 3);
  const failed = stageInit(initCtx(tmp('pp-init-')), {}, initRunner({ fail: true }).run);
  assert.equal(failed.ok, false);
  assert.equal(failed.exit, 1);
  assert.match(failed.reason, /init \(toolchain\) failed \(exit 1\): Directory already exists/);
  const dry = tmp('pp-init-');
  const d = stageInit(initCtx(dry), { dryRun: true }, () => ({ status: 0, stdout: '', stderr: '', dry: true }));
  assert.equal(d.ok, true);
  assert.deepEqual(fs.readdirSync(dry), [], '--dry-run scaffolds nothing');
});

const VENDOR_PACKET = (id) => `# Frame packet: ${id}\n\n## Project inputs\n\n- Project: /p\n- Design tokens: /p/frame.md\n- RULES_DIR: /skills/hyperframes-animation/rules\n\n## Assigned storyboard block\n\n## Frame 1 — Hook\n`;

test('skillPathLines() / withSkillPaths(): the role\'s relative skill citations become absolute header lines after RULES_DIR — only paths that exist, idempotently (D10)', () => {
  const all = skillPathLines({ skillsRoot: '/skills', workflowDir: '/skills/product-launch-video' }, () => true);
  assert.deepEqual(all, [
    "- HYPERFRAMES_CORE_REFS: /skills/hyperframes-core/references (the role's `hyperframes-core` `references/*.md`)",
    "- EXAMPLES_DIR: /skills/hyperframes-animation/examples (the role's `../hyperframes-animation/examples/<id>.html`)",
    "- CUT_CATALOG: /skills/product-launch-video/references/cut-catalog.md (the role's `../references/cut-catalog.md`)",
  ]);
  assert.deepEqual(skillPathLines({ skillsRoot: '/skills', workflowDir: '/skills/product-launch-video' }, (p) => p.endsWith('cut-catalog.md')).map((l) => l.split(':')[0]), ['- CUT_CATALOG'], 'a missing path is never cited');
  const once = withSkillPaths(VENDOR_PACKET('01-hook'), all);
  assert.match(once, /- RULES_DIR: \/skills\/hyperframes-animation\/rules\n- HYPERFRAMES_CORE_REFS: .*\n- EXAMPLES_DIR: .*\n- CUT_CATALOG: .*\n\n## Assigned storyboard block/);
  assert.equal(withSkillPaths(once, all), once, 'idempotent');
  const moved = withSkillPaths(once, [all[2].replace('/skills/', '/other/')]);
  assert.equal((moved.match(/CUT_CATALOG/g) ?? []).length, 1, 'an earlier copy is replaced, not duplicated');
  assert.doesNotMatch(moved, /HYPERFRAMES_CORE_REFS/);
  assert.equal(withSkillPaths('# no header\n', all), '# no header\n', 'no RULES_DIR line → the packet is left as it is');
  const both = withDirection(withSkillPaths(VENDOR_PACKET('01-hook'), all), '### Video direction\n\nbox');
  assert.equal(withSkillPaths(withDirection(both, '### Video direction\n\nbox'), all), both, 'composes with the storyboard direction');
});

test('stagePackets(): every vendor packet gets the absolute skill paths that exist on this machine (D10)', () => {
  const dir = project();
  const ctx = packetsCtx(dir, fakeFontsource(NM_SPEC));
  const skills = path.dirname(ctx.workflowDir);
  fs.mkdirSync(path.join(skills, 'hyperframes-core', 'references'), { recursive: true });
  fs.mkdirSync(path.join(ctx.workflowDir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(ctx.workflowDir, 'references', 'cut-catalog.md'), '# cuts');
  const run = () => {
    const out = path.join(dir, '.hyperframes', 'frame-packets');
    fs.mkdirSync(out, { recursive: true });
    for (const f of ctx.storyboard.frames) fs.writeFileSync(path.join(out, `${frameIdOf(f)}.md`), VENDOR_PACKET(frameIdOf(f)));
    return { status: 0, stdout: '', stderr: '', seconds: 0 };
  };
  const r = stagePackets(ctx, { allowDrift: true }, run);
  assert.equal(r.ok, true, r.reason);
  const packet = fs.readFileSync(r.dispatch.frames[0].packet, 'utf8');
  assert.ok(packet.includes(`- HYPERFRAMES_CORE_REFS: ${path.join(skills, 'hyperframes-core', 'references')} `));
  assert.ok(packet.includes(`- CUT_CATALOG: ${path.join(ctx.workflowDir, 'references', 'cut-catalog.md')} `));
  assert.doesNotMatch(packet, /EXAMPLES_DIR/, 'hyperframes-animation/examples does not exist here');
});
