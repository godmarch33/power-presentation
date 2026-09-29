import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOP_LIST, SECTIONS, LIMITS, parseShareCopy, lintShareCopy, buildSkeleton, parseArgs, DISCLOSURE_LINE, TIER_C_LINE } from './share-copy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, 'share-copy.mjs');
const run = (args, cwd) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', cwd });

const CLAIMS = [
  { id: 'c1', value: '3 days', number: 3, source: 'site/index.html:27', status: 'verified' },
  { id: 'c2', value: '98.5%', number: 98.5, source: 'site/index.html:36', status: 'verified' },
  { id: 'c3', value: '3.1 days', number: 3.1, source: 'site/index.html:40', status: 'verified' },
  { id: 'c4', value: '12', number: 12, source: 'site/index.html:27', status: 'verified' },
  { id: 'c5', value: '60-second', number: 60, source: 'BRIEF.md:9', status: 'verified' },
  { id: 'd1', value: '10x faster', number: 10, source: null, status: 'unverified' },
].map((c) => ({ id: c.id, number: c.number, sourced: Boolean(c.source) && c.status !== 'unverified' }));

const GOOD_SALES = `# share-copy.txt — power-presentation/share-copy@0.1
[caption]
Dana, Northbridge closes in 12 days. Ledgerly customers average 3.1.
One 60-second look at how — reply "yes" for Tuesday or Thursday.

[x]
Northbridge closes the books in 12 days; Ledgerly customers average 3.1. Reply "yes" — Tuesday or Thursday? https://ledgerly.example

[linkedin]
Close the books in 3 days, not 12.
Ledgerly auto-matches 98.5% of transactions. Reply "yes" and pick Tuesday or Thursday.

[email]
Subject: Northbridge — month-end close in 3 days
Dana, your team closes in 12 days. Ledgerly customers average 3.1 — the 60-second video shows the reconcile step on a ledger like yours. Reply "yes" and I will hold Tuesday or Thursday.
We found your business contact details in public sources (https://northbridge-retail.example); we use them only to send this one message and delete them after 30 days (GDPR Art. 14).
You can object to this at any time — reply "stop" and you will not hear from us again (GDPR Art. 21(2)).

[credits]
Music: "Happy Beats / Business Moves Vol. 9" by Sascha Ende / ende.app (CC BY 4.0)
Voice: synthetic (Kokoro). This video contains AI-generated narration (EU AI Act Art. 50).
`;

test('stop-list: every word is caught, ordinary copy is not', () => {
  const words = STOP_LIST.map((s) => s.word);
  for (const w of ['seamless', 'all-in-one', 'supercharge', 'unlock', 'empower', 'game-changing', 'cutting-edge', 'innovative', 'revolutionary', 'effortless', 'powerful', 'streamline']) {
    assert.ok(words.includes(w), `stop-list lacks ${w}`);
  }
  const hit = (text) => lintShareCopy(parseShareCopy(`[caption]\n${text}\n`), { mode: 'marketing' }).violations.filter((v) => v.rule === 'stop-list').map((v) => v.detail);
  assert.equal(hit('Seamlessly streamline your all-in-one workflow.').length, 3);
  assert.equal(hit("We're excited to announce Ledgerly.").length, 1);
  assert.equal(hit('So excited to share what we built.').length, 1);
  assert.equal(hit('AI-powered.').length, 1, 'AI-powered as the whole thesis');
  assert.equal(hit('AI-powered matching closes the books in 3 days, not 12.').length, 0, 'AI-powered inside a concrete sentence is not the whole thesis');
  assert.equal(hit('10x faster.').length, 1, '10x without a base');
  assert.equal(hit('10x faster than the manual close.').length, 0, '10x with a named base');
  assert.equal(hit('Close the books in 3 days, not 12.').length, 0);
});

test('sections per mode, lengths, placeholders, promise warning', () => {
  assert.deepEqual(SECTIONS.email.required, ['sales']);
  assert.deepEqual(SECTIONS['product-hunt'].required, ['marketing']);
  assert.deepEqual(SECTIONS['investor-note'].required, ['investors']);
  const r = lintShareCopy(parseShareCopy('[caption]\nTODO <promise>\n'), { mode: 'sales' });
  const rules = r.violations.map((v) => `${v.rule}:${v.section}`);
  assert.ok(rules.includes('placeholder:caption'));
  assert.ok(rules.includes('section-missing:x'));
  assert.ok(rules.includes('section-missing:linkedin'));
  assert.ok(rules.includes('section-missing:email'));
  assert.ok(!rules.includes('section-missing:product-hunt'));
  const long = lintShareCopy(parseShareCopy(`[caption]\n${'a'.repeat(281)}\n[x]\n${'b'.repeat(281)}\n[linkedin]\nx\n[product-hunt]\n${'t'.repeat(61)}\nmaker\n`), { mode: 'marketing' });
  assert.equal(long.violations.filter((v) => v.rule === 'length').length, 3);
  assert.equal(LIMITS.productHuntTagline, 60);
  const promise = lintShareCopy(parseShareCopy('[caption]\nThis first sentence is deliberately much longer than sixty characters in total. Then more.\n[x]\nx\n[linkedin]\nx\n[product-hunt]\nt\nm\n'), { mode: 'marketing' });
  assert.ok(promise.warnings.some((w) => w.rule === 'promise'));
});

test('numbers against the claims index (QA-12); GDPR and Art. lines exempt', () => {
  const p = parseShareCopy(GOOD_SALES);
  const clean = lintShareCopy(p, { mode: 'sales', claims: CLAIMS, syntheticVoice: true, musicCredit: 'Music: "Happy Beats / Business Moves Vol. 9" by Sascha Ende / ende.app (CC BY 4.0)' });
  assert.deepEqual(clean.violations, [], JSON.stringify(clean.violations));
  const bad = lintShareCopy(parseShareCopy(GOOD_SALES.replace('average 3.1.', 'average 2.9.')), { mode: 'sales', claims: CLAIMS });
  assert.ok(bad.violations.some((v) => v.rule === 'unsourced-number' && v.detail.includes('2.9')));
  const decoy = lintShareCopy(parseShareCopy(GOOD_SALES.replace('[linkedin]\n', '[linkedin]\n10x faster than the manual close.\n')), { mode: 'sales', claims: CLAIMS });
  assert.ok(decoy.violations.some((v) => v.rule === 'unsourced-number' && v.detail.includes('10x')), 'an unverified decoy is not a source');
  const unchecked = lintShareCopy(p, { mode: 'sales' });
  assert.ok(unchecked.warnings.some((w) => w.rule === 'numbers-unchecked'));
});

test('mandatory lines: disclosure, music credit, GDPR Art. 14 / 21(2), tier C', () => {
  const noCredits = GOOD_SALES.replace(/\[credits\][\s\S]*$/, '');
  const r = lintShareCopy(parseShareCopy(noCredits), { mode: 'sales', syntheticVoice: true, musicCredit: 'Music: "X" by Y (CC BY 4.0)' });
  const rules = r.violations.map((v) => v.rule);
  assert.ok(rules.includes('ai-disclosure'));
  assert.ok(rules.includes('music-credit'));
  const noGdpr = GOOD_SALES.replace(/\(GDPR Art\. 14\)/, '').replace(/\(GDPR Art\. 21\(2\)\)/, '');
  const g = lintShareCopy(parseShareCopy(noGdpr), { mode: 'sales' });
  assert.ok(g.violations.some((v) => v.rule === 'gdpr-14'));
  assert.ok(g.violations.some((v) => v.rule === 'gdpr-21'));
  const halfDisclosure = GOOD_SALES.replace(DISCLOSURE_LINE, 'Narration is AI-generated.');
  const h = lintShareCopy(parseShareCopy(halfDisclosure), { mode: 'sales', syntheticVoice: true });
  assert.ok(h.violations.some((v) => v.rule === 'ai-disclosure' && /Art\. 50/.test(v.detail)), 'the disclosure must name Art. 50');
  const tc = lintShareCopy(parseShareCopy('[caption]\nx\n[x]\nx\n[linkedin]\nx\n[product-hunt]\nt\nm\n'), { mode: 'marketing', tierC: true });
  assert.ok(tc.violations.some((v) => v.rule === 'tier-c' && v.detail.includes(TIER_C_LINE)));
});

test('init writes a skeleton per mode with the mandatory lines already in place; lint fails on its TODOs and passes once filled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-copy-'));
  try {
    const prospect = path.join(dir, 'prospect.json');
    fs.writeFileSync(prospect, JSON.stringify({ name: 'Dana Okafor', company: 'Northbridge Retail Group', role: 'Head of Finance', site: 'https://northbridge-retail.example' }));
    let r = run(['init', '--mode', 'sales', '--product', 'Ledgerly', '--prospect', prospect, '--synthetic-voice', '--music-credit', 'Music: "X" by Y (CC BY 4.0)', '--out', 'share-copy.txt'], dir);
    assert.equal(r.status, 0, r.stderr);
    const text = fs.readFileSync(path.join(dir, 'share-copy.txt'), 'utf8');
    assert.match(text, /^\[caption\]$/m);
    assert.match(text, /^\[email\]$/m);
    assert.match(text, /Dana Okafor/);
    assert.match(text, /northbridge-retail\.example\); we use them only/);
    assert.match(text, /GDPR Art\. 14/);
    assert.match(text, /GDPR Art\. 21\(2\)/);
    assert.match(text, /Music: "X" by Y \(CC BY 4\.0\)/);
    assert.ok(text.includes(DISCLOSURE_LINE));
    assert.ok(!/\[product-hunt\]/.test(text));
    r = run(['lint', 'share-copy.txt', '--mode', 'sales', '--synthetic-voice', '--json'], dir);
    assert.equal(r.status, 3);
    const rep = JSON.parse(r.stdout);
    assert.equal(rep.ok, false);
    assert.ok(rep.violations.every((v) => v.rule === 'placeholder'), JSON.stringify(rep.violations));
    fs.writeFileSync(path.join(dir, 'share-copy.txt'), GOOD_SALES);
    fs.writeFileSync(path.join(dir, 'claims-index.json'), JSON.stringify({ claims: [
      { id: 'c1', value: '3 days', number: 3, source: 'site/index.html:27', status: 'verified' },
      { id: 'c2', value: '98.5%', number: 98.5, source: 'site/index.html:36', status: 'verified' },
      { id: 'c3', value: '3.1 days', number: 3.1, source: 'site/index.html:40', status: 'verified' },
      { id: 'c4', value: '12', number: 12, source: 'site/index.html:27', status: 'verified' },
      { id: 'c5', value: '60-second', number: 60, source: 'BRIEF.md:9', status: 'verified' },
    ] }));
    fs.writeFileSync(path.join(dir, 'run-report.json'), JSON.stringify({ synthetic: { voice: true, presenter: false, broll: false } }));
    r = run(['lint', 'share-copy.txt', '--mode', 'sales', '--claims', 'claims-index.json', '--run-report', 'run-report.json'], dir);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /clean/);
    const m = buildSkeleton({ mode: 'marketing', product: 'Plausible', tierC: true });
    assert.match(m, /\[product-hunt\]/);
    assert.ok(m.includes(TIER_C_LINE));
    const i = buildSkeleton({ mode: 'investors', product: 'Northwind' });
    assert.match(i, /\[investor-note\]/);
    assert.match(i, /# nothing to credit/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: usage errors and --list-rules', () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(['lint']).status, 2, '--mode required');
  assert.equal(run(['init', '--mode', 'sales']).status, 2, '--product required');
  assert.equal(run(['lint', 'nope.txt', '--mode', 'sales']).status, 1);
  assert.equal(run(['--definitely-not-a-flag']).status, 2);
  assert.throws(() => parseArgs(['--mode', 'chaotic']), /--mode must be one of/);
  const r = run(['--list-rules']);
  assert.equal(r.status, 0);
  const rules = JSON.parse(r.stdout);
  assert.equal(rules.stop_list.length, STOP_LIST.length);
  assert.match(run(['--help']).stdout, /Usage/);
});
