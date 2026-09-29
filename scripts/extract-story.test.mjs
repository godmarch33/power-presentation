import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STORY_SCHEMA, CLAIMS_SCHEMA, SOURCE_ORDER, SCORING, TIE_BREAKS, NUMBER_PATTERNS, USAGE, MAX_CLAIMS,
  parseArgs, privacyLocal, decodeEntities, cleanText, blankNoise, relineHtml, lineAt, tokens, stem, sameFeature,
  numbersInLine, canonicalNumber, parseDeclaredNumber, unitsCompatible, sameClaimValue, lineStatesNumber,
  parseHeroHtml, parseAttribution, cardQuotes, parseMarkdown, readmeOneLiner, readmeExample, readmeInstall,
  commandFeatureName, changelogLatestAdded, entryFeatureName, parseTestimonialFile, parseE2E, stateChangeInText,
  scoreFeatures, heroCandidates, buildExtraction, loadDeclaredClaims, loadMetrics, toYaml, insideRepo, fetchHero,
  stripMdComments, pageEssence, listedParts, pageFlow, productEssence, productScreens,
} from './extract-story.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'extract-story.mjs');
const examples = path.join(here, '..', 'examples');

const tmpDirs = [];
function repo(tree) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-story-'));
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

function run(args, opts = {}) {
  return spawnSync('node', [script, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_OPTION_PRIVACY: '', POWER_PRESENTATION_PRIVACY: '', ...(opts.env ?? {}) }, cwd: opts.cwd });
}
function runAsync(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [script, ...args], { env: { ...process.env, CLAUDE_PLUGIN_OPTION_PRIVACY: '', POWER_PRESENTATION_PRIVACY: '', ...(opts.env ?? {}) }, cwd: opts.cwd });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}
const srcOf = (story, kind) => story.sources.find((x) => x.kind === kind);
const lineOf = (text, needle) => { const i = text.split('\n').findIndex((l) => l.includes(needle)); if (i < 0) throw new Error(`no line contains ${needle}`); return i + 1; };
function lineStates(dir, claim) {
  const m = String(claim.source).match(/^(.+?):(\d+)$/);
  if (!m) return false;
  const line = fs.readFileSync(path.join(dir, m[1]), 'utf8').split('\n')[Number(m[2]) - 1] ?? '';
  if (claim.kind === 'number') return lineStatesNumber(line, { value: claim.value, number: claim.number, unit: claim.unit, unit_kind: claim.unit_kind });
  const norm = (s) => cleanText(s).toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (claim.kind === 'quote') return norm(line).includes(norm(claim.value).slice(0, 40));
  return norm(line).includes(norm(claim.value)) || (claim.file && line.includes(path.posix.basename(claim.file)));
}

const SITE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Acme Sync - sync your files (fixture)</title>
  <meta property="og:site_name" content="Acme Sync">
  <meta property="og:description" content="Acme Sync mirrors folders in 2 seconds.">
</head>
<body>
  <nav><a href="/features">Features</a><a href="/pricing">Pricing</a></nav>
  <header>
    <h1>Sync every folder in 2 seconds, not 2 hours</h1>
    <p>Acme Sync mirrors your folders across machines for small teams.</p>
    <a class="cta" href="/signup">Start syncing free</a>
  </header>
  <section id="features">
    <h2>What Acme Sync does</h2>
    <div class="grid">
      <div class="card"><h3>Instant folder sync</h3><p>Changes land on every machine within 2 seconds.</p></div>
      <div class="card"><h3>Conflict-free merges</h3><p>Edits from two machines merge without a human touch.</p></div>
      <div class="card"><h3>Version history</h3><p>Roll back any file to any of the last 30 days.</p></div>
    </div>
  </section>
  <section id="proof">
    <h2>Teams that sync faster</h2>
    <p><span class="stat">1,200</span> teams sync with Acme.</p>
    <blockquote>
      <p>"We stopped emailing zip files. Sync just works."</p>
      <p class="muted">- Dana Ortiz, CTO, Northwind Labs</p>
    </blockquote>
    <div class="logos"><img alt="Northwind Labs" src="/logos/northwind.svg"><img alt="Globex" src="/logos/globex.svg"></div>
  </section>
  <section id="pricing"><h2>Pricing</h2><p>From $12 per user per month. v2.3.1 released in 2026.</p></section>
  <footer><img alt="Acme Sync logo" src="/logo.svg"><p>Acme Sync (fixture). Call 12:30.</p></footer>
</body>
</html>
`;

const README = `# Acme Sync

[![build](https://img.shields.io/github/actions/workflow/status/acme/sync/ci.yml)](https://github.com/acme/sync/actions)
[![downloads](https://img.shields.io/npm/dm/acme-sync)](https://www.npmjs.com/package/acme-sync)

Acme Sync mirrors folders across machines for small teams
in 2 seconds, with no cloud in between.

## Install

\`\`\`bash
npm install -g acme-sync
\`\`\`

## Usage

\`\`\`bash
acme-sync watch ./docs --to laptop   # starts the watcher
\`\`\`

![Instant folder sync demo](docs/sync.gif)

## Testimonials

> "We stopped emailing zip files. Sync just works."
> — Dana Ortiz, CTO, Northwind Labs
`;

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Realtime presence indicators (not shipped yet)

## [1.4.0] - 2026-08-01

### Added

- Conflict-free merges: edits from two machines merge without a human touch
- Version history rollback for the last 30 days
  (continuation line of the same entry)

### Changed

- faster startup

## [1.3.0] - 2026-06-01

### Added

- Instant folder sync
`;

const SPEC = `import { test, expect } from '@playwright/test';

test.describe('sync', () => {
  test('uploads a folder and sees it on the second machine', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('text=Add folder');
    await expect(page.getByText('Synced')).toBeVisible();
  });
  test('merges conflicting edits', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Merged')).toBeVisible();
  });
});
`;

test('SOURCE_ORDER is the source precedence (the running product, the repository, then the landing — owner decision 2026-09-28, reversed for facts); SCORING carries the owner (2026-09-28: the product +3, the repository +2 / +1, the landing +1) and 0-point generators', () => {
  assert.deepEqual([...SOURCE_ORDER], ['product-screens', 'e2e-tests', 'readme', 'changelog', 'hero-page', 'testimonials']);
  const points = Object.fromEntries(SCORING.map((r) => [r.rule, r.points]));
  assert.deepEqual(points, { 'product-screen': 3, 'product-heading': 2, 'readme-example': 2, 'changelog-added': 2, 'e2e-test': 1, 'first-feature-section': 1, h1: 1, 'readme-media-subject': 0, 'readme-example-unrelated': 0, 'e2e-plumbing': 0 });
  assert.ok(points.h1 < points['product-screen'] && points.h1 <= points['first-feature-section'], 'the H1 never outweighs the product');
  for (const r of SCORING) assert.ok(r.source, `${r.rule} is sourced`);
  assert.equal(TIE_BREAKS[0].id, 'feature-over-promise', 'a feature beats the H1 promise on a tie');
  assert.equal(TIE_BREAKS[1].id, 'state-change', 'then\'s visible state change');
  assert.ok(NUMBER_PATTERNS.every((p) => p.source));
  assert.match(STORY_SCHEMA, /story-extraction@/);
  assert.match(CLAIMS_SCHEMA, /claims-index@/);
});

test('parseArgs: defaults, validation, exclusive flags, --privacy', () => {
  const d = parseArgs([]);
  assert.equal(d.out, 'story-extraction.yaml');
  assert.equal(d.claimsOut, 'claims-index.json');
  assert.equal(d.fetch, false);
  assert.equal(d.privacy, null);
  assert.throws(() => parseArgs(['--url', 'ftp://x']), /http\(s\)/);
  assert.throws(() => parseArgs(['--url', 'nope']), /valid URL/);
  assert.throws(() => parseArgs(['--fetch']), /--fetch needs --url/);
  assert.throws(() => parseArgs(['--fetch', '--url', 'https://a.b', '--hero', 'x.html']), /exclusive/);
  assert.throws(() => parseArgs(['--max-files', '0']), /positive integer/);
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
  assert.throws(() => parseArgs(['--out']), /needs a value/);
  assert.throws(() => parseArgs(['--privacy', 'cloud']), /local \| default/);
  assert.equal(parseArgs(['--strict', '--print', '--privacy', 'local']).privacy, 'local');
  assert.equal(privacyLocal({ CLAUDE_PLUGIN_OPTION_PRIVACY: 'local' }), true);
  assert.equal(privacyLocal({ CLAUDE_PLUGIN_OPTION_PRIVACY: 'default' }), false);
  assert.equal(privacyLocal({}, 'local'), true, 'the per-run flag wins');
  assert.equal(privacyLocal({ CLAUDE_PLUGIN_OPTION_PRIVACY: 'local' }, 'default'), false, 'an explicit --privacy default overrides userConfig for this run');
  assert.equal(privacyLocal({}), false);
});

test('text utilities: entities, tags, JSX expressions, line numbers, tokens, stemming, feature identity', () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &#39;d&#39; &#x2014; &nbsp;x'), "a & b <c> 'd' —  x".replace(' ', ' '));
  assert.equal(cleanText('  <b>Hello</b>   {t("x")} **world** '), 'Hello world');
  const blanked = blankNoise('<p>a</p>\n<script>\nvar x = "<h1>no</h1>";\n</script>\n<style>h1{}</style><!-- <h1>c</h1> -->\n<p>b</p>');
  assert.equal(blanked.split('\n').length, 6, 'newlines are kept');
  assert.ok(!/no|c<\/h1>|h1\{\}/.test(blanked), 'script, style and comment bodies are blanked');
  assert.equal(lineAt('a\nb\nc', 4), 3);
  assert.equal(lineAt('a\nb\nc', 0), 1);
  assert.equal(lineAt('a\nb\nc', 99), 3);
  assert.deepEqual(tokens('The Instant folder syncs, for teams!'), ['instant', 'folder', 'sync', 'team']);
  assert.deepEqual(tokens('Conflict-free merges'), ['conflict', 'free', 'merge'], 'hyphens split');
  assert.equal(stem('merges'), 'merge');
  assert.equal(stem('invoices'), 'invoice');
  assert.equal(stem('pages'), 'page');
  assert.equal(stem('matches'), 'match');
  assert.equal(stem('histories'), 'history');
  assert.equal(stem('tracking'), 'track');
  assert.ok(sameFeature(tokens('Instant folder sync'), tokens('instant folder sync demo')));
  assert.ok(sameFeature(tokens('Conflict-free merges'), tokens('merges conflicting edits')));
  assert.ok(sameFeature(tokens('Instant folder sync'), tokens('Sync every folder in 2 seconds, not 2 hours')), 'a feature mentioned in the H1');
  assert.ok(!sameFeature(tokens('Fill every court, every hour'), tokens('Publish your courts. Add courts, opening hours and member prices.')), 'two generic words do not glue a short H1 to a long step');
  assert.ok(!sameFeature(tokens('Version history'), tokens('Instant folder sync')));
  assert.ok(!sameFeature(tokens('Export'), tokens('Export invoices to Excel')), 'a one-token mention never merges on overlap alone');
  assert.ok(!sameFeature([], tokens('x')));
});

test('lineAt is not quadratic: a 1.5 MB page with 30k blocks parses in seconds', () => {
  const big = `<html><body><h1>Big page</h1>${'<div class="card"><h3>Feature</h3><p>Text with 12 items and $5.</p></div>\n'.repeat(30000)}</body></html>`;
  const t0 = Date.now();
  const h = parseHeroHtml(big, 'big.html');
  const ms = Date.now() - t0;
  assert.ok(h.h1, 'parsed');
  assert.ok(ms < 8000, `parseHeroHtml took ${ms} ms`);
});

test('relineHtml: minified pages get one block element per line; formatted pages are untouched; idempotent', () => {
  const minified = `<html><body><div><h1>Title</h1><p>Para</p></div><section><dt>A</dt><dd>1</dd></section></body></html>${'x'.repeat(400)}`;
  const relined = relineHtml(minified);
  assert.ok(relined.split('\n').length >= 6, `got ${relined.split('\n').length} lines`);
  assert.equal(relineHtml(SITE), SITE, 'a formatted page keeps its lines');
  assert.equal(relineHtml(relined), relined, 'idempotent');
});

test('numbersInLine: currency, units, count nouns, scaled, N+, thousands (comma and space), ranges, signs, durations; versions, years, times, ids, ISO/issue numbers and runtime requirements are skipped', () => {
  const vals = (s) => numbersInLine(s).map((n) => n.value);
  assert.deepEqual(vals('Close the books in 3 days, not 12'), ['3 days']);
  assert.deepEqual(vals('98.5% of transactions auto-matched'), ['98.5%']);
  assert.deepEqual(vals('From EUR 190 per month per entity'), ['EUR 190']);
  assert.deepEqual(vals('240 finance teams run their close'), ['240']);
  assert.equal(numbersInLine('240 finance teams')[0].unit, 'teams');
  assert.deepEqual(vals('$9/month and 1,200 teams and 21k subscribers and 10M+ pageviews and 600+ requests'), ['$9', '1,200', '21k', '10M+', '600+']);
  assert.equal(numbersInLine('3.4k users')[0].number, 3400);
  assert.equal(numbersInLine('50,000 customers')[0].number, 50000);
  assert.equal(numbersInLine('50,000 customers')[0].unit, 'customers');
  assert.deepEqual(vals('12 000 entities and 1 000 000 rows'), ['12 000', '1 000 000'], 'space-grouped thousands');
  assert.equal(numbersInLine('12 000 entities')[0].number, 12000);
  assert.deepEqual(vals('Over 2 million downloads and 1.5 million users'), ['2 million', '1.5 million']);
  assert.equal(numbersInLine('1.5 million users')[0].number, 1500000);
  assert.deepEqual(vals('Our script is 54 times smaller'), ['54 times']);
  assert.equal(numbersInLine('54 times smaller')[0].unit, 'x');
  assert.deepEqual(vals('10x faster'), ['10x']);
  assert.deepEqual(vals('1920x1080 at 60 fps'), ['60 fps'], '1920x1080 is not a claim');
  assert.deepEqual(vals('v2.3.1 released in 2026, and #123 at 12:30'), []);
  assert.deepEqual(vals('hyperframes@0.8.47 pinned'), []);
  assert.deepEqual(vals('ISO 27001 certified, issue 12345, PR 777'), []);
  assert.deepEqual(vals('Node 18+ and Python 3.9+ required'), [], 'version requirements are not claims');
  assert.deepEqual(vals('Uptime (Last 90 days) 99.99%'), ['90 days', '99.99%']);
  assert.deepEqual(vals('a 12-day close'), ['12-day']);
  assert.deepEqual(vals('15–25 % reply rate and 3-5 days'), ['15–25 %', '3-5 days'], 'ranges are one token');
  assert.deepEqual(numbersInLine('15–25 % reply rate')[0].range, [15, 25]);
  assert.deepEqual(vals('churn −15 % and -3% and +12%'), ['−15 %', '-3%', '+12%']);
  assert.equal(numbersInLine('churn −15 %')[0].number, -15);
  assert.deepEqual(vals('a 3m 41s run and 1h 20m'), ['3m 41s', '1h 20m']);
  assert.equal(numbersInLine('3m 41s')[0].number, 221);
  assert.deepEqual(vals('11 hrs saved'), ['11 hrs']);
  assert.equal(numbersInLine('11 hrs saved')[0].unit, 'h', 'hr/hrs/hour/hours share one canonical unit');
  assert.equal(numbersInLine('11 hours saved')[0].unit, 'h');
  assert.deepEqual(vals('24/7 support'), []);
  assert.equal(canonicalNumber('1,234.5', 'k'), 1234500);
  assert.equal(canonicalNumber('2', 'million'), 2000000);
  assert.equal(parseDeclaredNumber('240').number, 240);
  assert.equal(parseDeclaredNumber('-15%').number, -15);
  assert.equal(parseDeclaredNumber('EUR 190').unit, 'EUR');
  assert.equal(parseDeclaredNumber('ten'), null);
});

test('unitsCompatible / sameClaimValue / lineStatesNumber: same unit, loose counts, never a bare number for a measure; digit substrings do not count', () => {
  assert.ok(unitsCompatible({ unit: 'days', unit_kind: 'measure' }, { unit: 'days', unit_kind: 'measure' }));
  assert.ok(unitsCompatible({ unit: 'teams', unit_kind: 'count' }, { unit: null, unit_kind: 'bare' }), 'a bare declared number may match a count');
  assert.ok(!unitsCompatible({ unit: 'months', unit_kind: 'measure' }, { unit: null, unit_kind: 'bare' }), '"3" is not "3 months"');
  assert.ok(!unitsCompatible({ unit: 'days', unit_kind: 'measure' }, { unit: 'h', unit_kind: 'measure' }));
  assert.ok(sameClaimValue({ kind: 'number', number: 11, unit: 'h', unit_kind: 'measure' }, parseDeclaredNumber('11 hrs')));
  assert.ok(sameClaimValue({ kind: 'number', number: 3400, unit: 'users', unit_kind: 'count' }, { value: '3.4k users' }));
  assert.ok(!sameClaimValue({ kind: 'number', number: 3, unit: 'months', unit_kind: 'measure' }, { value: '3' }));
  assert.ok(lineStatesNumber('Close the books in 3 days, not 12', parseDeclaredNumber('3 days')));
  assert.ok(lineStatesNumber('Close the books in 3 days, not 12', parseDeclaredNumber('12')), 'a bare number stated as a whole token');
  assert.ok(!lineStatesNumber('average 3.1 days', parseDeclaredNumber('3 days')), '3 is a digit substring of 3.1 — not the same claim');
  assert.ok(!lineStatesNumber('31 days', parseDeclaredNumber('1')));
});

test('parseHeroHtml: title, og, h1, subhead, CTA, first feature section, quote with attribution, logos (own brand marked), text lines with line numbers', () => {
  const h = parseHeroHtml(SITE, 'site/index.html');
  assert.equal(h.h1.text, 'Sync every folder in 2 seconds, not 2 hours');
  assert.equal(h.h1.source, `site/index.html:${lineOf(SITE, '<h1>Sync every folder')}`);
  assert.equal(h.h1.source, 'site/index.html:12');
  assert.equal(h.h1.brand_only, false);
  assert.equal(h.subhead.source, 'site/index.html:13');
  assert.equal(h.cta.text, 'Start syncing free');
  assert.equal(h.cta.href, '/signup');
  assert.equal(h.og['og:site_name'].text, 'Acme Sync');
  assert.equal(h.title.text, 'Acme Sync - sync your files (fixture)');
  assert.ok(h.feature_section, 'feature section found');
  assert.deepEqual(h.feature_section.items.map((i) => i.text), ['Instant folder sync', 'Conflict-free merges', 'Version history']);
  assert.equal(h.feature_section.items[0].source, 'site/index.html:19');
  assert.equal(h.quotes.length, 1);
  assert.equal(h.quotes[0].text, 'We stopped emailing zip files. Sync just works.');
  assert.equal(h.quotes[0].source, 'site/index.html:28', 'the quote line is the <p> that holds the text');
  assert.deepEqual(h.quotes[0].attribution, { name: 'Dana Ortiz', role: 'CTO', company: 'Northwind Labs', raw: 'Dana Ortiz, CTO, Northwind Labs' });
  assert.deepEqual(h.logos.map((l) => [l.text, l.own_brand]), [['Northwind Labs', false], ['Globex', false], ['Acme Sync logo', true]]);
  assert.equal(h.logos[0].source, 'site/index.html:31');
  assert.ok(h.text_lines.some((l) => l.line === 28 && l.in_quote), 'quote body lines are marked');
  assert.deepEqual(h.nav.map((n) => n.text), ['Features', 'Pricing']);
});

test('parseHeroHtml: URL provenance keeps the URL as source and the snapshot line separately', () => {
  const h = parseHeroHtml(SITE, 'https://acme.example', { isUrl: true, snapshotRef: 'hero-page.html' });
  assert.equal(h.h1.source, 'https://acme.example');
  assert.equal(h.h1.snapshot, 'hero-page.html:12');
});

test('parseHeroHtml: a header/logo H1 is skipped for the real hero H1; a brand-only H1 is flagged; a template-only H1 is reported as data-driven', () => {
  const page = '<html><head><title>MeetWell | Book meetings</title></head><body>\n<header><h1 class="logo">MeetWell</h1><nav><a href="/x">x</a></nav></header>\n<main><h1>Book every meeting in one click</h1><p>For busy teams.</p><a href="/signup">Start free</a></main>\n</body></html>';
  const h = parseHeroHtml(page, 'index.html');
  assert.equal(h.h1.text, 'Book every meeting in one click');
  assert.equal(h.h1.source, 'index.html:3');
  assert.deepEqual(h.skipped_h1.map((s) => [s.text, s.reason]), [['MeetWell', 'inside header/nav']]);
  const brand = parseHeroHtml('<html><head><meta property="og:site_name" content="Acme"></head><body><h1>Acme</h1><p>Sync files fast for teams.</p></body></html>', 'i.html');
  assert.equal(brand.h1.brand_only, true);
  const tpl = parseHeroHtml('<html><body><h1>{t("hero.title")}</h1><p>{t("hero.sub")}</p><blockquote><p>{q.text}</p></blockquote></body></html>', 'page.tsx');
  assert.equal(tpl.h1, null);
  assert.deepEqual(tpl.data_driven.map((d) => d.what), ['h1', 'quote']);
});

test('parseHeroHtml: heading-driven sections with <dt> items, testimonial cards, exact lines, avatars and template images excluded', () => {
  const page = relineHtml(`<html><body><header><img src="/logo.svg" alt="Acme"></header><div><h1>Simple analytics</h1><p>No cookies.</p><a href="/register">Get started</a></div><div><h2>Why use Acme?</h2><p>Because.</p><dl><div><dt>Automatic scroll depth</dt><dd>Tracked from 1 to 100 percent.</dd></div><div><dt>Monitor AI traffic</dt><dd>See which tools send visitors.</dd></div></dl></div><div><h2>People ❤️ Acme</h2><div><div><a href="https://x.com/a"><img alt="Profile image" src="/a.jpg"><div><div>Clem D</div><div>Co-founder and CEO at Hugging Face</div></div></a></div><div>We’re massive users of Acme here at Hugging Face and we love it.</div></div><div><div><div>Dana O</div><div>CTO, Northwind</div></div><div>We stopped emailing zip files to each other every single day.</div></div><div class="logos"><img alt="Hugging Face" src="/logos/hf.svg"><img alt="{{ logo.alt }}" src="{{ logo.src }}"></div></div><footer><p>© Acme</p></footer></body></html>${'x'.repeat(400)}`);
  const h = parseHeroHtml(page, 'hero-page.html');
  assert.ok(h.feature_section, 'h2-section fallback found a feature section');
  assert.deepEqual(h.feature_section.items.map((i) => i.text), ['Automatic scroll depth', 'Monitor AI traffic']);
  assert.equal(h.feature_section.items[0].source, `hero-page.html:${lineOf(page, 'Automatic scroll depth')}`);
  assert.equal(h.cta.text, 'Get started');
  assert.equal(h.quotes.length, 2, `quotes: ${JSON.stringify(h.quotes)}`);
  assert.deepEqual(h.quotes[0].attribution, { name: 'Clem D', role: 'Co-founder and CEO', company: 'Hugging Face', raw: 'Clem D, Co-founder and CEO at Hugging Face' });
  assert.equal(h.quotes[0].source, `hero-page.html:${lineOf(page, 'massive users')}`);
  assert.equal(h.quotes[1].attribution.company, 'Northwind');
  assert.deepEqual(h.logos.map((l) => [l.text, l.own_brand]), [['Acme', true], ['Hugging Face', false]], 'avatar and template images are not logos; the header logo is own brand');
  assert.equal(h.logos[1].source, `hero-page.html:${lineOf(page, 'logos/hf.svg')}`);
});

test('parseHeroHtml: multi-line cards cite the text line; blockquote <footer>/<cite> attribution; cards in a <section class="testimonials"> too', () => {
  const page = `<html><body>
<h1>Ship faster</h1>
<section id="features">
  <div class="card">
    <h3>Preview deploys</h3>
    <p>Every branch gets a URL.</p>
  </div>
  <div class="card">
    <h3>Rollbacks</h3>
  </div>
</section>
<section class="testimonials">
  <div class="quote">
    <p>"Deploys went from 40 minutes to 4 minutes for our team."</p>
    <p class="who">Ana Ruiz, Platform lead at Kettleworks</p>
  </div>
  <blockquote><p>"Rollbacks saved our launch day twice."</p><footer>— Ben Okafor, Head of Support at Kettleworks</footer></blockquote>
</section>
</body></html>`;
  const h = parseHeroHtml(page, 'index.html');
  assert.equal(h.feature_section.items[0].source, `index.html:${lineOf(page, '<h3>Preview deploys')}`);
  assert.equal(h.quotes.length, 2);
  assert.deepEqual(h.quotes.map((q) => q.attribution.company), ['Kettleworks', 'Kettleworks']);
  assert.equal(h.quotes.find((q) => /Rollbacks saved/.test(q.text)).attribution.role, 'Head of Support');
  assert.ok(h.text_lines.filter((l) => /40 minutes/.test(l.text)).every((l) => l.in_quote), 'numbers inside card quotes are quote lines');
});

const LANDING = [
  '<!doctype html><html><head>',
  '<script type="application/ld+json">',
  '{"@context":"https://schema.org","@graph":[',
  ' {"@type":"Organization","name":"Quill","description":"Quill is a writing coach for grant proposals."},',
  ' {"@type":"SoftwareApplication","name":"Quill","applicationSubCategory":"Grant writing practice",',
  '  "url":"https://app.quill.example/",',
  '  "description":"Writing coach for grant proposals. You draft each section; Quill marks what a reviewer will cut.",',
  '  "featureList":["Section-by-section drafting","A reviewer pass that marks cuts","A deadline plan"]},',
  ' {"@type":"VideoObject","name":"Quill in 60 seconds","duration":"PT1M0S","contentUrl":"https://cdn.example/quill.mp4",',
  '  "description":"A product film: the project setup, a draft of the aims page, the reviewer pass and the submission checklist. Every screen is rebuilt from the product."}',
  ']}',
  '</script>',
  '</head><body>',
  '<h1>Stop losing points on page one.</h1>',
  '<p>Quill is a writing coach for grant proposals. You draft; it marks what a reviewer will cut.</p>',
  '<figure><video src="https://cdn.example/quill.mp4" aria-label="Quill tour, 60 seconds: setup, aims page, reviewer pass and checklist."></video>',
  '<figcaption>A product film, not a screen recording.</figcaption></figure>',
  '<div class="steps">',
  '  <div class="step"><h3>Draft</h3><p>Write the section in the editor.</p></div>',
  '  <div class="step"><h3>Review</h3><p>The reviewer pass marks every cut.</p></div>',
  '  <div class="step"><h3>Fix</h3><p>Each cut comes back until it is gone.</p></div>',
  '</div>',
  '</body></html>',
].join('\n');

test('pageEssence / listedParts: JSON-LD application, organisation and film; <video> joins its VideoObject; numbered steps with details', () => {
  const h = parseHeroHtml(LANDING, 'https://quill.example', { isUrl: true, snapshotRef: 'page.html' });
  const E = h.essence;
  assert.equal(E.app.name.text, 'Quill');
  assert.equal(E.app.category.text, 'Grant writing practice');
  assert.equal(E.app.url.text, 'https://app.quill.example/');
  assert.deepEqual(E.app.features.map((f) => f.text), ['Section-by-section drafting', 'A reviewer pass that marks cuts', 'A deadline plan']);
  assert.equal(E.app.features[1].snapshot, `page.html:${lineOf(LANDING, 'featureList')}`, 'a feature cites the line that states it');
  assert.equal(E.org.description.text, 'Quill is a writing coach for grant proposals.');
  assert.equal(E.videos.length, 1, 'the <video> with the same source is the VideoObject, not a second film');
  assert.equal(E.videos[0].duration_s, 60);
  assert.match(E.videos[0].label.text, /^Quill tour, 60 seconds/);
  assert.equal(E.videos[0].caption, 'A product film, not a screen recording.');
  assert.deepEqual(E.steps.map((st) => [st.text, st.detail]), [['Draft', 'Write the section in the editor.'], ['Review', 'The reviewer pass marks every cut.'], ['Fix', 'Each cut comes back until it is gone.']]);
  assert.equal(E.steps[0].snapshot, `page.html:${lineOf(LANDING, '<h3>Draft')}`);
  assert.deepEqual(listedParts(E.videos[0].description.text), ['the project setup', 'a draft of the aims page', 'the reviewer pass', 'the submission checklist']);
  assert.deepEqual(listedParts('Fast, private and simple.'), ['Fast', 'private', 'simple'].slice(0, 0).concat(['Fast', 'private', 'simple']));
  assert.deepEqual(listedParts('One thing and another.'), [], 'fewer than three parts is no list');
  assert.deepEqual(pageEssence('<p>no structured data</p>', (t, l) => ({ text: t, line: l })), { app: null, org: null, site: null, videos: [], steps: [] });
  assert.deepEqual(pageEssence('<script type="application/ld+json">{ broken</script>', (t, l) => ({ text: t, line: l })).videos, [], 'broken JSON-LD is skipped');
});

test('productEssence / pageFlow: the definition names the product, the app URL is not the landing, the film is rebuilt; the flow takes the page steps, else the film parts', () => {
  const h = parseHeroHtml(LANDING, 'https://quill.example', { isUrl: true, snapshotRef: 'page.html' });
  const p = productEssence(h, { productName: { value: 'Quill' }, pageUrl: 'https://quill.example' });
  assert.equal(p.definition.from, 'subhead', 'the visible "<Name> is a …" sentence wins over structured data');
  assert.match(p.definition.text, /^Quill is a writing coach/);
  assert.equal(p.app_url.value, 'https://app.quill.example/');
  assert.equal(p.app_url.differs_from_page, true, 'landing ≠ product');
  assert.equal(p.category.text, 'Grant writing practice');
  assert.equal(p.videos[0].rebuilt, true);
  assert.deepEqual(p.videos[0].parts, ['the project setup', 'a draft of the aims page', 'the reviewer pass', 'the submission checklist']);
  const f = pageFlow(h);
  assert.equal(f.from, 'page-steps', "the page's own numbered steps come before a film description");
  assert.deepEqual([f.entry.text, f.key_action.text, f.result.text], ['Draft', 'Review', 'Fix']);
  const noSteps = parseHeroHtml(LANDING.replace(/<div class="steps">[\s\S]*?\n<\/div>/, ''), 'site/index.html');
  assert.equal(pageFlow(noSteps).from, 'product-video');
  assert.deepEqual(pageFlow(noSteps).steps.map((st) => st.text), ['the project setup', 'a draft of the aims page', 'the reviewer pass', 'the submission checklist']);
  assert.equal(productEssence(parseHeroHtml('<h1>Hello there friend</h1><p>We ship things.</p>', 'x.html')).definition, null, 'no defining sentence → null (a gap in buildExtraction)');
  const { story } = buildExtraction(repo({ 'n.txt': 'x\n' }), { url: 'https://quill.example', hero: { text: LANDING, ref: 'page.html' } });
  assert.deepEqual(story.features.filter((f) => f.rules.some((r) => r.rule === 'first-feature-section')).map((f) => f.name), ['Section-by-section drafting', 'A reviewer pass that marks cuts', 'A deadline plan']);
  assert.equal(story.hero_feature.name, 'Section-by-section drafting', 'the H1 promise loses the tie to a declared feature');
  assert.equal(story.hero_feature.tie_break, 'position');
  assert.ok(story.notes.some((n) => /declares its feature list \(JSON-LD featureList, 3 item\(s\)\)/.test(n)));
});

test('productEssence: the repository describes the product before the landing does (source precedence, owner decision 2026-09-28)', () => {
  const dir = repo({ 'package.json': { name: 'quill', description: 'Quill is a grant-writing editor that marks what a reviewer will cut.' } });
  const { story } = buildExtraction(dir, { url: 'https://quill.example', hero: { text: LANDING, ref: 'page.html' } });
  assert.equal(story.product.definition.from, 'package.json description');
  assert.equal(story.product.definition.tier, 'repository');
  assert.equal(story.product.definition.source, 'package.json:3');
  assert.deepEqual(story.product.definition_candidates.map((c) => c.tier), ['repository', 'landing', 'landing', 'landing']);
  assert.equal(story.promise.from, 'h1', 'the message stays landing-first');
  const bare = buildExtraction(repo({ 'package.json': { name: 'quill', description: 'wip' } }), { url: 'https://quill.example', hero: { text: LANDING, ref: 'page.html' } }).story;
  assert.equal(bare.product.definition.tier, 'landing', 'a repository silent on what it is leaves the landing to say it');
});

const SCREENS = [
  { step: null, action: 'goto', url: 'https://quill.example/', title: 'Quill — grant writing', description: null, headings: ['Stop losing points on page one.'], nav: [], buttons: [], text: 'Stop losing points on page one.' },
  { step: 3, action: 'click', url: 'http://127.0.0.1:4100/editor', title: 'Quill - Aims page', description: 'Quill is a grant-writing editor that marks what a reviewer will cut.', headings: ['Specific aims', 'Reviewer pass'], nav: ['Drafts', 'Deadlines'], buttons: ['Run reviewer pass', 'Settings'], text: 'Specific aims Reviewer pass 14 cuts marked in 2 minutes' },
  { step: 5, action: 'click', url: 'http://127.0.0.1:4100/checklist', title: 'Quill - Checklist', description: null, headings: ['Submission checklist'], nav: ['Drafts', 'Deadlines'], buttons: ['Mark ready'], text: 'Submission checklist 9 of 11 items ready' },
].map((x) => JSON.stringify(x)).join('\n') + '\n';

test('productScreens / --screens: the running product is the first source — its own words, flow and demonstrated numbers; the landing URL itself is skipped under --url-role landing', () => {
  const dir = repo({ 'package.json': { name: 'quill', description: 'A grant-writing editor.' } });
  const screens = { ref: '.media/capture/screens.jsonl', text: SCREENS };
  assert.deepEqual(productScreens(screens, { url: 'https://quill.example', urlRole: 'landing' }).skipped, 1);
  assert.equal(productScreens(screens, { url: 'https://quill.example', urlRole: 'product' }).kept.length, 3, 'a product URL keeps its own screens');
  assert.deepEqual(productScreens({ ref: 's', text: 'not json\n\n{}\n' }).kept.map((k) => k.line), [3]);
  const { story, claims } = buildExtraction(dir, { url: 'https://quill.example', urlRole: 'landing', screens, hero: { text: LANDING, ref: 'page.html' } });
  assert.equal(story.sources[0].kind, 'product-screens');
  assert.deepEqual([story.sources[0].screens, story.sources[0].skipped_landing], [2, 1]);
  assert.equal(story.product.definition.tier, 'product', 'what the running product says about itself outranks the package description');
  assert.equal(story.product.definition.source, '.media/capture/screens.jsonl:2');
  assert.deepEqual(story.product.screens.map((x) => [x.path, x.actions]), [['/editor', ['Run reviewer pass']], ['/checklist', ['Mark ready']]], 'generic chrome (Settings) is not an action');
  assert.equal(story.user_flow.from, 'product-screens');
  assert.match(story.user_flow.key_action.text, /Submission checklist — actions: Mark ready/);
  const demo = claims.claims.filter((c) => c.source_kind === 'product-screens');
  assert.ok(demo.some((c) => c.value === '2 minutes' && c.source === '.media/capture/screens.jsonl:2'), 'a number the product shows is a claim with its screen as source');
  assert.ok(demo.length && demo.every((c) => c.claim_type === 'demonstrated'), 'shown by the running product');
  assert.ok(story.features.some((f) => f.name === 'Run reviewer pass' && f.sources.includes('product-screens') && f.rules.map((r) => r.rule).join() === 'product-screen,product-heading,first-feature-section' && f.score === 6), 'the action "Run reviewer pass", the heading "Reviewer pass" and the declared "A reviewer pass that marks cuts" are one feature, named by the action');
  assert.equal(story.hero_feature.name, 'Run reviewer pass', 'the running product outweighs the landing H1 and its declared features');
  const m = (name, rule, kind, source, position = 0) => ({ name, rule, source_kind: kind, source, position, excerpt: name });
  const led = scoreFeatures([m('Close the books in 3 days, not 12', 'h1', 'hero-page', 'i.html:3'), m('98.5% of transactions auto-matched to invoices and bank lines', 'first-feature-section', 'hero-page', 'i.html:9', 1), m('Audit trail', 'product-heading', 'product-screens', 's.jsonl:2', 50), m('Auto-match', 'product-screen', 'product-screens', 's.jsonl:2', 0), m('Nordwell Bank EUR', 'product-heading', 'product-screens', 's.jsonl:2', 51)]);
  assert.deepEqual([led.ranked[0].name, led.ranked[0].score, led.ranked[0].sources], ['Auto-match', 4, ['product-screens', 'hero-page']]);
  assert.ok(led.ranked.find((r) => r.name === 'Nordwell Bank EUR').score < led.ranked[0].score, 'a heading (data on screen) weighs less than an action');
  assert.equal(story.promise.from, 'h1', 'the message stays the landing\'s');
  assert.ok(story.notes.some((n) => /1 recorded screen\(s\) are the landing/.test(n)));
  assert.equal(productScreens(screens, { landingH1: 'Stop losing points on page one.' }).skipped, 1);
  const again = buildExtraction(dir, { screens: { ref: 's.jsonl', text: SCREENS + SCREENS.split('\n')[2] + '\n' }, hero: { text: LANDING, ref: 'page.html' } }).claims;
  assert.equal(again.claims.filter((c) => c.source_kind === 'product-screens' && c.value === '2 minutes').length, 1, 'a value every step re-shows is one claim');
});

test('buildExtraction: a landing-only run gets product_name from JSON-LD, the product block and the page-derived user flow (regression 2026-09-28)', () => {
  const dir = repo({ 'notes.txt': 'nothing here\n' });
  const heroFile = path.join(dir, 'page.html');
  fs.writeFileSync(heroFile, LANDING.replace(/<\/?title>/g, ''));
  const { story } = buildExtraction(dir, { url: 'https://quill.example', hero: { text: fs.readFileSync(heroFile, 'utf8'), ref: 'page.html' } });
  assert.equal(story.product_name.value, 'Quill');
  assert.equal(story.product_name.from, 'ld:application name');
  assert.match(story.product.definition.text, /^Quill is a writing coach/);
  assert.equal(story.product.app_url.differs_from_page, true);
  assert.equal(story.user_flow.from, 'page-steps');
  assert.equal(story.user_flow.steps.length, 3);
  assert.ok(!story.gaps.some((g) => g.id === 'no-user-flow' || g.id === 'no-product-name' || g.id === 'no-product-definition'));
  assert.ok(story.notes.some((n) => /user flow from the page's numbered steps/.test(n)));
});

test('parseAttribution: comma form, "at" form, dash separator, "Head of X at Y", @company, fictional marker', () => {
  assert.deepEqual(parseAttribution('- Priya Menon, Controller, Harborline Logistics (fictional)'), { name: 'Priya Menon', role: 'Controller', company: 'Harborline Logistics', raw: 'Priya Menon, Controller, Harborline Logistics' });
  assert.deepEqual(parseAttribution('DHH Co-founder and CTO at 37signals'), { name: 'DHH', role: 'Co-founder and CTO', company: '37signals', raw: 'DHH Co-founder and CTO at 37signals' });
  assert.deepEqual(parseAttribution('Amira Haddad, CTO at Loopline'), { name: 'Amira Haddad', role: 'CTO', company: 'Loopline', raw: 'Amira Haddad, CTO at Loopline' });
  assert.deepEqual(parseAttribution('Rafael Costa — VP Engineering, Kettleworks'), { name: 'Rafael Costa', role: 'VP Engineering', company: 'Kettleworks', raw: 'Rafael Costa — VP Engineering, Kettleworks' });
  assert.deepEqual(parseAttribution('Ben Okafor, Head of Support at Kettleworks'), { name: 'Ben Okafor', role: 'Head of Support', company: 'Kettleworks', raw: 'Ben Okafor, Head of Support at Kettleworks' });
  assert.deepEqual(parseAttribution('Jane Doe, @Acme'), { name: 'Jane Doe', role: null, company: 'Acme', raw: 'Jane Doe, @Acme' });
  assert.deepEqual(parseAttribution(''), { name: null, role: null, company: null, raw: null });
  assert.equal(cardQuotes('<div><p>short</p></div>').length, 0);
});

test('parseMarkdown + README helpers: hard-wrapped one-liner, usage example on its command line (not the install block, not the fence), media subject, badges, quote with attribution', () => {
  const md = parseMarkdown(README, 'README.md');
  assert.equal(md.h1.text, 'Acme Sync');
  assert.equal(readmeOneLiner(md).text, 'Acme Sync mirrors folders across machines for small teams in 2 seconds, with no cloud in between.', 'hard-wrapped lines form one paragraph');
  assert.equal(readmeOneLiner(md).source, 'README.md:6');
  const ex = readmeExample(md);
  assert.equal(ex.command, 'acme-sync watch ./docs --to laptop', 'the usage block wins over the install block; the shell comment is cut');
  assert.equal(ex.feature, 'acme-sync watch');
  assert.equal(ex.source, `README.md:${lineOf(README, 'acme-sync watch')}`, 'provenance is the command line, not the ``` fence');
  assert.equal(ex.block_source, `README.md:${lineOf(README, 'acme-sync watch') - 1}`);
  assert.equal(readmeInstall(md).command, 'npm install -g acme-sync');
  assert.equal(readmeInstall(md).source, `README.md:${lineOf(README, 'npm install -g')}`);
  assert.equal(md.badges.length, 2);
  assert.equal(md.images.length, 1);
  assert.equal(md.images[0].alt, 'Instant folder sync demo');
  assert.equal(md.quotes.length, 1);
  assert.equal(md.quotes[0].text, 'We stopped emailing zip files. Sync just works.');
  assert.equal(md.quotes[0].attribution.company, 'Northwind Labs', 'a "> — Name" line inside the quote block is the attribution');
  assert.equal(md.quotes[0].source, `README.md:${lineOf(README, '> "We stopped')}`);
  assert.ok(!md.text_lines.some((l) => l.text.includes('npm install')), 'code blocks are not text lines');
  assert.ok(md.text_lines.some((l) => l.line === 6) && md.text_lines.some((l) => l.line === 7), 'text lines stay per physical line for number provenance');
});

test('parseMarkdown: README H1 with a linked badge, HTML <h1 align=center>, fence length (CommonMark), attribution after a blank line', () => {
  const a = parseMarkdown('# Acme [![Build](https://img.shields.io/x.svg)](https://ci.example)\n\nThe thing.\n', 'R.md');
  assert.equal(a.h1.text, 'Acme');
  assert.equal(a.badges.length, 1);
  const b = parseMarkdown('<h1 align="center">Acme Sync</h1>\n\n<p align="center">Sync files.</p>\n\n## Usage\n\n````md\n```bash\nnot a command\n```\n````\n\n```bash\nacme run\n```\n', 'R.md');
  assert.equal(b.h1.text, 'Acme Sync');
  assert.equal(b.code_blocks.length, 2, 'the 4-backtick fence is not closed by the inner 3-backtick fence');
  assert.equal(readmeExample(b).command, 'acme run');
  const c = parseMarkdown('> "Sync saved our Fridays, every single one."\n\n— Ana B, CTO, Real Co\n', 'T.md');
  assert.equal(c.quotes[0].attribution.company, 'Real Co', 'one blank line between the quote and its attribution is fine');
});

test('parseMarkdown: single-line HTML comments are not sources — "1.2 s" inside `<!-- … >= max(1.2 s, x) -->` is never a text line (regression GS03-08)', () => {
  const a = parseMarkdown('## H\n<!-- note: >= max(1.2 s, x) -->\n> Quote line.\n', 'R.md');
  const all = [...a.text_lines, ...a.paragraphs].map((l) => l.text).join('\n');
  assert.doesNotMatch(all, /1\.2|-->/);
  assert.equal(a.quotes.length, 1);
  assert.equal(a.quotes[0].text, 'Quote line.');
  assert.equal(a.quotes[0].source, 'R.md:3');
  const b = parseMarkdown('Syncs files\n<!-- TODO: 99% claim -->\nin 2 seconds.\n\nFast <!-- 7x --> and small.\n', 'R.md');
  assert.deepEqual(b.paragraphs.map((p) => [p.text, p.line]), [['Syncs files in 2 seconds.', 1], ['Fast and small.', 5]]);
  const c = parseMarkdown('# Tool <!-- omit in toc -->\n\nIntro <!-- hidden\n42 users\n--> Shown after.\n', 'R.md');
  assert.equal(c.h1.text, 'Tool');
  assert.deepEqual(c.text_lines.map((l) => [l.text, l.line]), [['Intro', 3], ['Shown after.', 5]]);
  const d = parseMarkdown('```html\n<!-- x -->\n<!-- open\n```\n\nAdd `<!-- more -->` to cut the post.\n', 'R.md');
  assert.deepEqual(d.code_blocks[0].lines, ['<!-- x -->', '<!-- open']);
  assert.equal(d.code_blocks.length, 1, 'an unclosed comment inside a fence does not swallow the closing fence');
  assert.match(d.text_lines[0].text, /^Add .* to cut the post\.$/);
  assert.deepEqual(stripMdComments('a <!-- b --> c <!-- d'), { text: 'a  c ', open: true });
  assert.deepEqual(stripMdComments('<!--> x <!---> y'), { text: ' x  y', open: false }, 'CommonMark 0.31: <!--> and <!---> are closed');
  assert.deepEqual(stripMdComments('`<!-- kept -->` <!-- gone -->'), { text: '`<!-- kept -->` ', open: false });
});

test('GS-03 fixture: the reading-floor note in docs/README.md:27 is a comment, so "1.2 s" is no README proof number (regression GS03-08)', () => {
  const readme = fs.readFileSync(path.join(examples, 'gs-03-cli-api', 'docs', 'README.md'), 'utf8');
  assert.match(readme.split('\n')[26], /^<!-- .*1\.2 s.* -->$/, 'the fixture still carries the single-line comment on line 27');
  const md = parseMarkdown(readme, 'docs/README.md');
  assert.ok(!md.text_lines.some((l) => l.line === 27), 'line 27 is an HTML comment');
  const { story, claims } = buildExtraction(repo({ 'docs/README.md': readme }), { profile: { surface: 'cli', __ref: 'product-profile.json:2' } });
  assert.ok(claims.claims.some((c) => c.source === 'docs/README.md:28'), 'the README is read (the line after the comment is still a source)');
  assert.ok(!(story.proof?.numbers ?? []).some((x) => x.value === '1.2 s' || x.source === 'docs/README.md:27'));
  assert.ok(!claims.claims.some((c) => c.source === 'docs/README.md:27'), 'was c001 "1.2 s", verified');
});

test('readmeExample: config / import / venv lines are not the canonical command; data-language blocks are skipped', () => {
  const md = parseMarkdown('# Tool\n\n## Quickstart\n\n```yaml\ncolumns:\n  - id\n```\n\n```python\nimport tool\nfrom tool import Client\nclient = Client()\nclient.export("report.csv")\n```\n\n## Run\n\n```bash\npython -m venv .venv\nsource .venv/bin/activate\npip install tool\ntool export --format csv\n```\n', 'R.md');
  const ex = readmeExample(md);
  assert.equal(ex.command, 'client.export("report.csv")', 'the first real statement of the first code block under Quickstart');
  assert.equal(ex.source, 'R.md:14');
});

test('commandFeatureName: flags, quoted values, paths and runners are stripped', () => {
  assert.equal(commandFeatureName('/present --for sales --duration 60 --local ./site --pain "manual month-end reconciliation"'), '/present');
  assert.equal(commandFeatureName('npx acmejobs submit --file report.csv'), 'acmejobs submit');
  assert.equal(commandFeatureName('acmejobs watch --last   # comment'), 'acmejobs watch');
  assert.equal(commandFeatureName('python -m mytool.cli render scene'), 'render scene');
  assert.equal(commandFeatureName('--only-flags'), null);
});

test('changelogLatestAdded: the latest RELEASED `### Added` block wins over [Unreleased]; continuation lines joined; Unreleased used only when nothing else has entries (flagged)', () => {
  const md = parseMarkdown(CHANGELOG, 'CHANGELOG.md');
  const added = changelogLatestAdded(md);
  assert.equal(added.version, '[1.4.0] - 2026-08-01');
  assert.equal(added.unreleased, false);
  assert.equal(added.items.length, 2);
  assert.equal(added.items[0].source, `CHANGELOG.md:${lineOf(CHANGELOG, '- Conflict-free merges')}`);
  assert.match(added.items[1].text, /continuation line/);
  assert.equal(added.items[1].lines.length, 2);
  assert.equal(entryFeatureName(added.items[0].text), 'Conflict-free merges');
  assert.equal(entryFeatureName('- `scripts/x.mjs` — the detector is implemented (roadmap item 6): nine classes'), 'scripts/x.mjs');
  const only = changelogLatestAdded(parseMarkdown('# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Presence indicators\n\n## 1.0.0 - 2026-01-01\n\n### Fixed\n\n- x\n', 'C.md'));
  assert.equal(only.unreleased, true);
  assert.equal(only.items[0].text, 'Presence indicators');
  assert.equal(changelogLatestAdded(parseMarkdown('# Changelog\n\n## 1.0.0\n\n### Fixed\n\n- x\n', 'C.md')), null);
});

test('parseTestimonialFile: JSON (escapes → located key line), YAML (inline and block scalars) and Markdown forms carry name/role/company and a line', () => {
  const json = `[\n  {\n    "name": "A B",\n    "quote": "Sync saved our Fridays \\u2014 every single one \\"twice\\".",\n    "role": "CTO",\n    "company": "C"\n  },\n  {\n    "quote": "Second quote with enough words in it.",\n    "name": "D E"\n  }\n]\n`;
  const j = parseTestimonialFile(json, 'testimonials.json', '.json');
  assert.equal(j.length, 2);
  assert.equal(j[0].attribution.company, 'C');
  assert.equal(j[0].source, 'testimonials.json:4', 'the line of the "quote" key, escapes notwithstanding');
  assert.equal(j[1].source, 'testimonials.json:9');
  const y = parseTestimonialFile('- quote: "Sync saved our Fridays, every single one."\n  name: A B\n  role: CTO\n  company: C\n- quote: >\n    Block scalar quotes fold\n    across lines nicely.\n  name: F G\n  company: H\n', 't.yml', '.yml');
  assert.equal(y.length, 2);
  assert.equal(y[0].attribution.name, 'A B');
  assert.equal(y[1].text, 'Block scalar quotes fold across lines nicely.');
  assert.equal(y[1].attribution.company, 'H');
  assert.equal(y[1].source, 't.yml:5');
  const m = parseTestimonialFile('# Customers\n\n> "Sync saved our Fridays, every single one."\n> — A B, CTO, C\n', 'customers.md', '.md');
  assert.equal(m.length, 1);
  assert.equal(m[0].attribution.role, 'CTO');
});

test('parseE2E: Playwright titles, goto, expectation calls (not the import line, not commented tests), action/plumbing flags; Python keeps snake_case; unit tests without e2e markers are ignored', () => {
  const e = parseE2E(SPEC, 'e2e/sync.spec.ts');
  assert.equal(e.tests.filter((t) => t.kind === 'test').length, 2);
  assert.equal(e.tests.find((t) => t.kind === 'group').title, 'sync');
  const t1 = e.tests.find((t) => t.title.startsWith('uploads'));
  assert.equal(t1.asserts, true);
  assert.equal(t1.action, true);
  assert.equal(t1.plumbing, false);
  assert.match(t1.expectation, /Synced/);
  assert.equal(t1.expectation_line, 7);
  assert.equal(e.entry.text, '/dashboard');
  assert.equal(e.first_expect.line, 7, 'the import line is not an expectation');
  const commented = parseE2E("import { test, expect } from '@playwright/test';\ntest('real one', async ({ page }) => {\n  // it('ghost test', () => {});\n  await page.goto('/');\n  await expect(page).toHaveTitle(/x/);\n});\n", 'e2e/a.spec.ts');
  assert.equal(commented.tests.length, 1);
  assert.equal(commented.tests[0].expectation_line, 5);
  const login = parseE2E("import { test, expect } from '@playwright/test';\ntest('logs in with a magic link', async ({ page }) => { await page.goto('/login'); await expect(page).toHaveURL(/dash/); });\n", 'cypress/e2e/login.cy.js');
  assert.equal(login.tests[0].plumbing, true);
  assert.equal(parseE2E("import { test } from 'node:test';\ntest('adds numbers', () => { assert.equal(1+1, 2); });", 'x.test.js'), null);
  const py = parseE2E('from playwright.sync_api import Page\n\ndef test_uploads_folder(page: Page):\n    page.goto("/")\n    assert page.get_by_text("Synced").is_visible()\n', 'tests/e2e/test_flow.py');
  assert.equal(py.tests[0].title, 'uploads folder');
  assert.match(py.tests[0].expectation, /get_by_text/, 'snake_case survives');
});

test('stateChangeInText: from→to, ", not X", instead of, a single short arrow; arrows in prose and sequences do not count', () => {
  assert.deepEqual(stateChangeInText('We went from a 12-day close to under 4.'), { before: 'a 12-day close', after: 'under 4', excerpt: 'from a 12-day close to under 4.' });
  const notForm = stateChangeInText('Close the books in 3 days, not 12');
  assert.equal(notForm.before, '12');
  assert.equal(notForm.after, '3 days');
  assert.equal(stateChangeInText('finish month-end close in days instead of weeks.').before, 'weeks');
  assert.deepEqual(stateChangeInText('draft → published'), { before: 'draft', after: 'published', excerpt: 'draft → published' });
  assert.equal(stateChangeInText('three-tier ranking (UI > runnable > concept, order on ties) → secondary classes, the scene plan from the composition table, capture backend and needs_url → mode'), null, 'two arrows in a long sentence are a sequence, not a state change');
  assert.equal(stateChangeInText('nothing here'), null);
});

test('scoreFeatures: the owner\'s points add up (the H1 never outweighs the product); mentions of one feature across sources merge; the candidate is named after the feature-shaped mention; ties break by state change, then source order', () => {
  const m = (name, rule, kind, source, position = 0, extra = {}) => ({ name, rule, source_kind: kind, source, position, excerpt: name, ...extra });
  const { ranked, tie_break } = scoreFeatures([
    m('Sync every folder in 2 seconds, not 2 hours', 'h1', 'hero-page', 'site/index.html:12', 0, { state_change: { kind: 'before-after copy', before: '2 hours', after: '2 seconds', excerpt: 'in 2 seconds, not 2 hours' } }),
    m('Instant folder sync', 'first-feature-section', 'hero-page', 'site/index.html:19', 1),
    m('Conflict-free merges', 'first-feature-section', 'hero-page', 'site/index.html:20', 2),
    m('acme-sync watch', 'readme-example', 'readme', 'README.md:17', 0),
    m('Instant folder sync demo', 'readme-media-subject', 'readme', 'README.md:20', 0),
    m('Conflict-free merges', 'changelog-added', 'changelog', 'CHANGELOG.md:13', 1),
    m('merges conflicting edits', 'e2e-test', 'e2e-tests', 'e2e/sync.spec.ts:9', 1, { state_change: { kind: 'e2e test asserts an outcome', excerpt: 'y' } }),
  ]);
  assert.equal(ranked[0].name, 'Conflict-free merges', 'the repository documents and tests it');
  assert.equal(ranked[0].score, 4);
  assert.deepEqual(ranked[0].rules.map((r) => r.rule), ['changelog-added', 'e2e-test', 'first-feature-section'], 'points first, then the source precedence');
  assert.equal(ranked[0].state_change_score, 1, 'the e2e assertion');
  assert.deepEqual(ranked[0].sources, ['e2e-tests', 'changelog', 'hero-page']);
  assert.equal(ranked[1].name, 'Instant folder sync', 'named after the feature-shaped mention, not the H1 sentence');
  assert.equal(ranked[1].score, 2);
  assert.deepEqual(ranked[1].rules.map((r) => r.rule), ['h1', 'first-feature-section']);
  assert.equal(ranked[1].evidence.length, 3, 'H1 + section item + README GIF subject (0 points, evidence only)');
  assert.equal(ranked.find((r) => r.name === 'acme-sync watch').score, 2);
  assert.equal(tie_break, null);
  const promise = scoreFeatures([m('Close the books in 3 days, not 12', 'h1', 'hero-page', 'i.html:3', 0, { state_change: { kind: 'before-after copy', excerpt: 'x' } }), m('Auto-matching', 'first-feature-section', 'hero-page', 'i.html:9', 1)]);
  assert.deepEqual([promise.ranked[0].name, promise.tie_break], ['Auto-matching', 'feature-over-promise']);
  const shown = scoreFeatures([m('Close the books in 3 days, not 12', 'h1', 'hero-page', 'i.html:3'), m('Faster close', 'first-feature-section', 'hero-page', 'i.html:9', 1), m('Lock period', 'product-screen', 'product-screens', 's.jsonl:4', 2)]);
  assert.deepEqual([shown.ranked[0].name, shown.ranked[0].score], ['Lock period', 3]);

  const tie = scoreFeatures([
    m('Alpha reports', 'first-feature-section', 'hero-page', 'i.html:5', 1),
    m('Beta exports', 'first-feature-section', 'hero-page', 'i.html:6', 2, { state_change: { kind: 'before-after copy', excerpt: 'z' } }),
  ]);
  assert.equal(tie.ranked[0].name, 'Beta exports');
  assert.equal(tie.tie_break, 'state-change');
  const tie2 = scoreFeatures([
    m('Alpha reports', 'first-feature-section', 'hero-page', 'i.html:5', 1),
    m('Beta exports', 'first-feature-section', 'hero-page', 'i.html:6', 2),
  ]);
  assert.equal(tie2.ranked[0].name, 'Alpha reports', 'equal state change → earlier position wins');
  assert.equal(tie2.tie_break, 'position');
  const tie3 = scoreFeatures([
    m('Gamma', 'changelog-added', 'changelog', 'C.md:5', 1),
    m('Delta', 'readme-example', 'readme', 'R.md:6', 0),
  ]);
  assert.equal(tie3.ranked[0].name, 'Delta', 'README outranks CHANGELOG on a tie (source precedence)');
  assert.equal(tie3.tie_break, 'source-order');
  assert.deepEqual(scoreFeatures([]).ranked, []);
});

function acmeRepo(extra = {}) {
  return repo({
    'package.json': { name: '@acme/sync', version: '1.4.0', bin: { 'acme-sync': 'bin/cli.js' } },
    'site/index.html': SITE,
    'README.md': README,
    'CHANGELOG.md': CHANGELOG,
    'e2e/sync.spec.ts': SPEC,
    'public/logos/northwind.svg': '<svg/>',
    '.env': 'SECRET=1 and 9,999 customers',
    'fixtures/data.json': '{"customers": 77777}',
    ...extra,
  });
}

test('buildExtraction: every field carries file:line provenance in source-precedence order; hero feature, user flow, proof, claims and gaps; every cited line states its claim', () => {
  const dir = acmeRepo();
  const { story, claims } = buildExtraction(dir);
  assert.equal(story.schema, STORY_SCHEMA);
  assert.equal(story.repo, path.basename(dir), 'no absolute machine path in the artefact');
  assert.deepEqual(story.sources.map((s) => s.kind), [...SOURCE_ORDER]);
  assert.equal(srcOf(story, 'hero-page').ref, 'site/index.html');
  assert.equal(srcOf(story, 'changelog').latest_added.version, '[1.4.0] - 2026-08-01');
  assert.equal(srcOf(story, 'changelog').latest_added.unreleased, false);
  assert.deepEqual(srcOf(story, 'e2e-tests').ref, ['e2e/sync.spec.ts']);
  assert.equal(story.product_name.value, 'Acme Sync');
  assert.equal(story.product_name.from, 'og:site_name');
  assert.equal(story.promise.stated, 'Sync every folder in 2 seconds, not 2 hours');
  assert.equal(story.promise.source, 'site/index.html:12');
  assert.equal(story.promise.claim_type, 'stated');
  assert.equal(story.promise.derived, null, 'the rewrite is the story director\'s');
  assert.equal(story.hero_feature.name, 'Conflict-free merges');
  assert.equal(story.hero_feature.score, 4);
  assert.deepEqual(story.hero_feature.rules.map((r) => [r.rule, r.points]), [['changelog-added', 2], ['e2e-test', 1], ['first-feature-section', 1]]);
  assert.equal(story.hero_feature.state_change.score, 1, `state change evidence: ${JSON.stringify(story.hero_feature.state_change)}`);
  assert.deepEqual([story.hero_feature.runner_up.name, story.hero_feature.runner_up.score], ['Version history', 3], 'also in the latest Added and the feature section');
  const merges = story.features.find((f) => f.name === 'Conflict-free merges');
  assert.deepEqual(merges.rules.map((r) => [r.rule, r.source]), [['changelog-added', `CHANGELOG.md:${lineOf(CHANGELOG, '- Conflict-free')}`], ['e2e-test', 'e2e/sync.spec.ts:9'], ['first-feature-section', 'site/index.html:20']], 'points first; equal points: the repository before the landing');
  assert.equal(merges.state_change_score, 1, 'the e2e test "merges conflicting edits" asserts an outcome; a noun-led CHANGELOG entry is not state-change evidence');
  assert.ok(!story.features.some((f) => f.name === 'Realtime presence indicators'), 'the [Unreleased] block is not the latest Added when a release has one');
  assert.equal(story.features.length >= 4, true);
  assert.equal(story.user_flow.from, 'e2e-tests');
  assert.equal(story.user_flow.entry.text, '/dashboard');
  assert.equal(story.user_flow.key_action.text, 'uploads a folder and sees it on the second machine');
  assert.equal(story.user_flow.result.source, 'e2e/sync.spec.ts:7');
  const values = story.proof.numbers.map((n) => n.value);
  assert.ok(values.includes('2 seconds') && values.includes('2 hours') && values.includes('1,200') && values.includes('$12') && values.includes('30 days'), values.join(','));
  assert.ok(!values.some((v) => /9,999|77777|2\.3\.1/.test(v)), 'denied files and versions are never claims');
  assert.equal(story.proof.numbers.find((n) => n.value === '1,200').source, 'site/index.html:26');
  assert.equal(story.proof.quotes.length, 2, 'site quote + README quote (different sources)');
  assert.equal(story.proof.quotes[0].name, 'Dana Ortiz');
  assert.ok(story.proof.logos.some((l) => l.file === 'public/logos/northwind.svg'));
  assert.ok(story.proof.logos.some((l) => l.name === 'Globex'));
  assert.ok(story.proof.logos.some((l) => l.name === 'Acme Sync logo' && l.own_brand === true));
  assert.equal(story.proof.badges.length, 2);
  assert.equal(story.cta.text, 'Start syncing free');
  assert.equal(story.audience.some((a) => /small teams/i.test(a.persona)), true, JSON.stringify(story.audience));
  assert.ok(story.competitive_alternatives.some((a) => a.marker === 'not' && a.source === 'site/index.html:12'));
  assert.ok(!story.competitive_alternatives.some((a) => a.sentence.includes('Call 12:30')), 'a bare "not" sentence is not a contrast');
  assert.equal(claims.schema, CLAIMS_SCHEMA);
  assert.equal(claims.repo, path.basename(dir));
  assert.ok(claims.claims.every((c) => c.status === 'verified' && typeof c.source === 'string' && c.claim_type === 'sourced'));
  assert.ok(claims.claims.every((c) => /^(https?:\/\/|[^:]+:\d+$|[^:]+\.(svg|png|jpe?g|webp|gif)$)/.test(c.source)), 'sources are file:line, URL or a logo file');
  for (const c of claims.claims.filter((x) => /:\d+$/.test(x.source))) assert.ok(lineStates(dir, c), `${c.kind} ${JSON.stringify(c.value)} is stated at ${c.source}`);
  assert.equal(claims.counts.unverified, 0);
  assert.ok(claims.claims.some((c) => c.kind === 'quote' && c.attribution.name === 'Dana Ortiz'));
  assert.ok(claims.claims.some((c) => c.kind === 'logo' && c.own_brand === false));
  assert.ok(claims.claims.every((c) => Array.isArray(c.used_in) && c.used_in.length === 0));
  assert.deepEqual(story.gaps.map((g) => g.id), ['badge-live-value']);
  assert.match(story.gaps[0].reason, /downloads/);
  assert.deepEqual(story.read_policy.rules, ['env-files', 'pem', 'fixtures', 'keys-and-credentials']);
  assert.ok(!story.read_policy.content_read.some((f) => /\.env|fixtures/.test(f)), story.read_policy.content_read.join(','));
  assert.ok(story.read_policy.content_read.includes('site/index.html') && story.read_policy.content_read.includes('e2e/sync.spec.ts'));
  assert.equal(story.read_policy.denied_files_seen['env-files'], 1);
  assert.equal(story.read_policy.external.length, 0);
});

test('buildExtraction: README-only repository — README H1 is the product name, so the H1 rule does not fire; usage example and install CTA come from README/docs', () => {
  const dir = repo({
    'package.json': { name: 'acmejobs', version: '0.1.0', bin: { acmejobs: 'bin.js' } },
    'README.md': '# acmejobs\n\nSubmit a file, watch it run, read the result.\n\n## Install\n\n```bash\nnpm install -g acmejobs\n```\n\n## Usage\n\n```bash\nacmejobs submit --file report.csv\n```\n',
  });
  const { story, claims } = buildExtraction(dir, { profile: { surface: 'cli', __ref: 'product-profile.json:2' } });
  assert.equal(story.product_name.value, 'acmejobs');
  assert.equal(story.promise.stated, 'Submit a file, watch it run, read the result.');
  assert.equal(story.promise.from, 'readme-one-liner');
  assert.equal(story.hero_feature.name, 'acmejobs submit');
  assert.equal(story.hero_feature.score, 2);
  assert.equal(story.hero_feature.rules[0].source, 'README.md:14', 'the command line');
  assert.ok(story.notes.some((n) => /product name, not a feature/.test(n)));
  assert.equal(story.cta.kind, 'readme-install');
  assert.equal(story.cta.text, 'npm install -g acmejobs');
  assert.equal(story.cta.source, 'README.md:8');
  assert.ok(story.audience.some((a) => a.persona === 'developers' && /surface=cli/.test(a.evidence) && a.source === 'product-profile.json:2'));
  assert.equal(story.user_flow.from, 'readme-example');
  assert.ok(story.gaps.some((g) => g.id === 'no-hero-page') && story.gaps.some((g) => g.id === 'no-numbers') && story.gaps.some((g) => g.id === 'no-e2e-flow'));
  assert.equal(claims.claims.length, 0);
  assert.ok(claims.gaps.some((g) => g.id === 'no-numbers'));
});

test('buildExtraction: a descriptive README H1 counts as H1 (+1) when there is no hero page, and the product\'s own command from the docs quickstart (+2) outranks it', () => {
  const dir = repo({
    'README.md': '# Acme Jobs — queue jobs from the terminal in one command\n\nA job queue.\n',
    'docs/README.md': '# Getting started\n\n## Submit your first job\n\n```bash\nacmejobs submit --file report.csv\n```\n',
  });
  const { story } = buildExtraction(dir);
  assert.equal(story.hero_feature.name, 'acmejobs submit');
  assert.deepEqual(story.hero_feature.rules.map((r) => [r.rule, r.source]), [['readme-example', 'docs/README.md:6']]);
  assert.ok(story.features.some((f) => f.name === 'Acme Jobs — queue jobs from the terminal in one command' && f.rules[0].rule === 'h1' && f.rules[0].source === 'README.md:1'), JSON.stringify(story.features));
  assert.ok(story.notes.some((n) => /docs quickstart/.test(n)));
});

test('buildExtraction: docs-only repository (no README) reads docs/index.md in its place; a hero H1 that is the product name falls back to the subhead as promise', () => {
  const dir = repo({
    'mkdocs.yml': 'site_name: Acme Docs\n',
    'docs/index.md': '# Acme\n\nShip docs that answer support tickets before they are filed, for 300 teams.\n\n## Quick start\n\n```bash\npip install acme-docs\nacme-docs build\n```\n',
  });
  const { story } = buildExtraction(dir);
  assert.equal(srcOf(story, 'readme').ref, 'docs/index.md');
  assert.ok(story.notes.some((n) => /no README at the repository root/.test(n)));
  assert.equal(story.promise.stated, 'Ship docs that answer support tickets before they are filed, for 300 teams.');
  assert.equal(story.hero_feature.name, 'acme-docs build');
  assert.equal(story.cta.text, 'pip install acme-docs');
  assert.ok(story.proof.numbers.some((n) => n.value === '300' && n.source === 'docs/index.md:3'));
  const brandH1 = repo({ 'index.html': '<html><head><meta property="og:site_name" content="Acme"></head><body><h1>Acme</h1><p>Sync files in 2 seconds for small teams.</p><a href="/signup">Start</a></body></html>' });
  const r = buildExtraction(brandH1);
  assert.equal(r.story.promise.from, 'subhead');
  assert.ok(!r.story.features.some((f) => f.rules.some((x) => x.rule === 'h1')), 'the brand-name H1 is not a feature');
});

test('buildExtraction: workspace monorepo — the landing page under apps/web and the CHANGELOG under packages/* are found', () => {
  const dir = repo({
    'package.json': { name: 'workspace-root', private: true, workspaces: ['apps/*', 'packages/*'] },
    'README.md': '# Monorepo\n\nThis repository contains the apps and packages.\n',
    'apps/web/src/app/page.tsx': 'export default function Page() { return (<main><h1>Secrets that rotate themselves</h1><p>Used by 350 engineering teams.</p><section id="features"><h3>Auto-rotation</h3><h3>Audit log</h3></section><a href="/signup">Start free</a></main>); }',
    'packages/sdk/README.md': '# @acme/sdk\n\n## Usage\n\n```ts\nimport { rotate } from "@acme/sdk";\nawait rotate("db-password");\n```\n',
    'packages/sdk/CHANGELOG.md': '# Changelog\n\n## 2.0.0 - 2026-05-01\n\n### Added\n\n- Auto-rotation for database passwords\n',
  });
  const { story } = buildExtraction(dir);
  assert.equal(srcOf(story, 'hero-page').ref, 'apps/web/src/app/page.tsx');
  assert.equal(story.promise.stated, 'Secrets that rotate themselves');
  assert.equal(srcOf(story, 'changelog').ref, 'packages/sdk/CHANGELOG.md');
  assert.equal(story.hero_feature.name, 'Auto-rotation', 'latest Added (+2) + first feature section (+1)');
  assert.equal(story.hero_feature.score, 3);
  assert.ok(story.proof.numbers.some((n) => n.value === '350' && n.source === 'apps/web/src/app/page.tsx:1'));
  assert.ok(story.features.some((f) => f.rules.some((r) => r.rule === 'readme-example' && r.source === 'packages/sdk/README.md:7')), 'the workspace README supplies the usage example when the root README has none');
});

test('buildExtraction: markdown landing page as --hero, hero from --url without content is a gap, JSX data-driven hero is a gap, empty repository', () => {
  const dir = repo({ 'README.md': '# X\n\nnothing\n' });
  const md = { text: '# Ship dashboards in minutes\n\nDashboards for finance teams.\n\n## Features\n\n- Live charts from 3 sources\n- Alerts within 30 seconds\n\n[Start free](https://x.example/signup)\n', ref: 'landing.md' };
  const { story } = buildExtraction(dir, { hero: md, url: 'https://x.example' });
  assert.equal(story.promise.stated, 'Ship dashboards in minutes');
  assert.equal(story.promise.source, 'https://x.example');
  assert.equal(story.promise.snapshot, 'landing.md:1');
  assert.deepEqual(story.features.filter((f) => f.rules[0].rule === 'first-feature-section').map((f) => f.name), ['Live charts from 3 sources', 'Alerts within 30 seconds']);
  assert.equal(story.cta.text, 'Start free');
  assert.ok(story.proof.numbers.some((n) => n.value === '30 seconds' && n.source === 'https://x.example' && n.snapshot === 'landing.md:8'), JSON.stringify(story.proof.numbers));

  const noHero = buildExtraction(dir, { url: 'https://x.example' });
  assert.ok(noHero.story.gaps.some((g) => g.id === 'no-hero-page' && /--hero|--fetch/.test(g.needed)));

  const jsx = buildExtraction(repo({ 'src/app/page.tsx': 'export default function Page() { return (<main><h1>{t("hero.title")}</h1><p>{t("hero.sub")}</p>{stats.map((s) => <div key={s.id}>{s.value}</div>)}</main>); }', 'README.md': '# Product\n\nA product for teams that need it.\n' }));
  assert.ok(jsx.story.gaps.some((g) => g.id === 'hero-data-driven' && /--hero <rendered html>/.test(g.needed)), JSON.stringify(jsx.story.gaps));

  const empty = buildExtraction(repo({ 'a.txt': 'x' }));
  assert.equal(empty.story.hero_feature, null);
  assert.equal(empty.story.promise.stated, null);
  assert.ok(['no-readme', 'no-hero-page', 'no-hero-feature', 'no-promise', 'no-product-name', 'no-cta'].every((id) => empty.story.gaps.some((g) => g.id === id)), empty.story.gaps.map((g) => g.id).join(','));
});

test('buildExtraction: gap branches — no-feature-section, hero-tie, metric-without-date, MAX_CLAIMS truncation, oversized file', () => {
  const noSection = buildExtraction(repo({ 'index.html': '<html><body><h1>Plan sprints in 5 minutes</h1><p>For engineering teams.</p></body></html>', 'README.md': '# Sprints\n\nPlan sprints.\n' }));
  assert.ok(noSection.story.gaps.some((g) => g.id === 'no-feature-section'));
  const tie = buildExtraction(repo({ 'index.html': '<html><body><h1>Acme</h1><section id="features"><h3>Alpha reports</h3><h3>Beta exports</h3></section></body></html>', 'README.md': '# Acme\n\nReports and exports.\n' }));
  assert.ok(tie.story.gaps.some((g) => g.id === 'hero-tie' && /broken by position/.test(g.reason)), JSON.stringify(tie.story.gaps));
  assert.equal(tie.story.hero_feature.tie_break, 'position');
  const metrics = { ref: 'metrics.csv', rows: [{ line: 2, source: 'metrics.csv:2', name: 'MRR', value: '$41,000', token: '$41,000', number: 41000, unit: '$', date: null, origin: 'Stripe' }] };
  const m = buildExtraction(repo({ 'README.md': '# Acme\n\nAcme.\n' }), { metrics });
  assert.ok(m.story.gaps.some((g) => g.id === 'metric-without-date' && g.value === '$41,000'));
  assert.equal(m.claims.claims[0].origin, 'Stripe');
  const many = Array.from({ length: MAX_CLAIMS + 20 }, (_, i) => `- ${i + 1} customers`).join('\n');
  const trunc = buildExtraction(repo({ 'README.md': `# Many\n\nMany numbers.\n\n${many}\n` }));
  assert.equal(trunc.claims.claims.filter((c) => c.kind === 'number').length, MAX_CLAIMS);
  assert.ok(trunc.story.notes.some((n) => /numbers truncated to 300/.test(n)));
  const big = buildExtraction(repo({ 'README.md': `# Big\n\n${'x'.repeat(600 * 1024)}\n`, 'index.html': '<html><body><h1>Big thing for teams</h1></body></html>' }));
  assert.deepEqual(big.story.read_policy.oversized, ['README.md']);
  assert.ok(big.story.gaps.some((g) => g.id === 'no-readme'));
});

test('buildExtraction: declared claims — merged by value, decoys unverified and in gaps, wrong lines rejected, units enforced, duplicates keep every id; metrics rows are claims', () => {
  const dir = repo({ 'site/index.html': SITE, 'README.md': README });
  const declared = { ref: 'claims.json', list: [
    { id: 'teams', kind: 'number', value: '1,200', source: 'site/index.html:26' },
    { id: 'teams-k', kind: 'number', value: '1.2k teams' },
    { id: 'price', kind: 'number', value: '$12', source: 'site/index.html:99' },
    { id: 'price-wrong-line', kind: 'number', value: '$12', source: 'site/index.html:12' },
    { id: 'decoy', kind: 'number', value: '10x faster' },
    { id: 'decoy-again', kind: 'number', value: '10x faster' },
    { id: 'bare-two', kind: 'number', value: '2', source: 'site/index.html:12' },
    { id: 'seconds-vs-hours', kind: 'number', value: '2 minutes', source: 'site/index.html:12' },
    { id: 'quote', kind: 'quote', value: 'We stopped emailing zip files. Sync just works.' },
    { id: 'logo', kind: 'logo', value: 'Globex' },
    { id: 'nologo', kind: 'logo', value: 'Initech' },
  ] };
  const metrics = { ref: 'metrics.csv', rows: [{ line: 2, source: 'metrics.csv:2', name: 'MRR', value: '$41,000', token: '$41,000', number: 41000, unit: '$', date: '2026-08', origin: null }, { line: 3, source: 'metrics.csv:3', name: 'churn', value: 'n/a', token: null, number: null, unit: null, date: null, origin: null }] };
  const { story, claims } = buildExtraction(dir, { declaredClaims: declared, metrics });
  const byId = (id) => claims.claims.find((c) => c.declared_id === id || (c.declared_ids ?? []).includes(id));
  assert.equal(byId('teams').status, 'verified');
  assert.equal(byId('teams').source, 'site/index.html:26');
  assert.equal(byId('teams').declared, true);
  assert.equal(claims.claims.filter((c) => c.kind === 'number' && c.value === '1,200').length, 1, 'no duplicate for a declared claim that matches an extracted one');
  assert.deepEqual(byId('teams').declared_ids, ['teams', 'teams-k'], '1.2k merged into the same 1,200 claim (canonical number)');
  assert.equal(byId('price').status, 'verified', 'a non-existent declared line is rejected but the value is found elsewhere');
  assert.match(byId('price').verification, /declared source rejected/);
  assert.equal(byId('price').source, 'site/index.html:33');
  assert.ok((byId('price').declared_ids ?? []).includes('price-wrong-line'), 'a declared line that does not state the value merges into the claim that does');
  assert.equal(claims.claims.filter((c) => c.value === '$12').length, 1);
  assert.equal(byId('decoy').status, 'unverified');
  assert.equal(byId('decoy').source, null);
  assert.equal(byId('decoy').claim_type, 'declared');
  assert.deepEqual(byId('decoy').declared_ids, ['decoy', 'decoy-again'], 'a duplicate unverified declaration keeps its id');
  assert.equal(byId('bare-two').status, 'unverified', '"2" alone is not stated on the H1 line — only "2 seconds" and "2 hours" are');
  assert.equal(byId('seconds-vs-hours').status, 'unverified', 'same digits, different unit');
  assert.match(byId('seconds-vs-hours').verification, /same number with the same unit required/);
  assert.equal(byId('quote').status, 'verified');
  assert.equal(byId('quote').source, 'site/index.html:28');
  assert.equal(byId('logo').status, 'verified');
  assert.equal(byId('nologo').status, 'unverified');
  assert.deepEqual(claims.gaps.filter((g) => g.id === 'unverified-claim').map((g) => g.value), ['10x faster', '10x faster', '2', '2 minutes', 'Initech', 'n/a']);
  assert.equal(claims.declared.unverified, 5);
  const mrr = claims.claims.find((c) => c.source === 'metrics.csv:2');
  assert.equal(mrr.number, 41000);
  assert.equal(mrr.date, '2026-08');
  assert.equal(mrr.status, 'verified');
  const churn = claims.claims.find((c) => c.value === 'n/a');
  assert.equal(churn.status, 'unverified');
  assert.equal(churn.source, null, 'an unverified row carries no source');
  assert.ok(story.gaps.some((g) => g.id === 'unverified-claim' && g.value === 'n/a'));
  assert.equal(claims.metrics.rows, 2);
});

test('buildExtraction: a declared URL source is verified against the hero page text, never accepted on its own', () => {
  const dir = repo({ 'README.md': '# Acme Sync\n\nSync.\n' });
  const declared = { ref: 'claims.json', list: [
    { id: 'ok', kind: 'number', value: '1,200 teams', source: 'https://acme.example' },
    { id: 'fake', kind: 'number', value: '50,000 customers', source: 'https://acme.example' },
    { id: 'other-url', kind: 'number', value: '1,200 teams', source: 'https://other.example/page' },
  ] };
  const { claims } = buildExtraction(dir, { hero: { text: SITE, ref: 'hero-page.html' }, url: 'https://acme.example', declaredClaims: declared });
  const byId = (id) => claims.claims.find((c) => c.declared_id === id || (c.declared_ids ?? []).includes(id));
  assert.equal(byId('ok').status, 'verified');
  assert.equal(byId('ok').source, 'https://acme.example');
  assert.equal(byId('ok').snapshot, 'hero-page.html:26');
  assert.equal(byId('fake').status, 'unverified');
  assert.match(byId('fake').verification, /does not state 50,000 customers/);
  assert.equal(byId('other-url').status, 'verified', 'the other URL is rejected as a source, but the value is found on the hero page');
  assert.match(byId('other-url').verification, /declared source rejected/);
});

test('loadDeclaredClaims / loadMetrics: file shapes, verbatim values, source column as origin, negative numbers, relative refs', () => {
  const dir = repo({
    'claims.json': { claims: [{ id: 'a', kind: 'number', value: '3 days' }, { bogus: true }] },
    'list.json': [{ value: '5' }],
    'bad.json': { nope: 1 },
    'metrics.csv': 'metric,value,as_of,unit,source\nMRR,"41,000",2026-08,USD,Stripe dashboard\nCustomers,240,2026-08,,\nChurn,-3%,2026-08,,\nRetention,n/a,2026-08,,\n',
  });
  assert.equal(loadDeclaredClaims(path.join(dir, 'claims.json')).list.length, 1);
  assert.equal(loadDeclaredClaims(path.join(dir, 'claims.json')).ref, 'claims.json');
  assert.equal(loadDeclaredClaims(path.join(dir, 'list.json')).list.length, 1);
  assert.throws(() => loadDeclaredClaims(path.join(dir, 'bad.json')), /expected an array/);
  const m = loadMetrics(path.join(dir, 'metrics.csv'));
  assert.equal(m.ref, 'metrics.csv');
  assert.equal(m.rows.length, 4);
  assert.equal(m.rows[0].value, '41,000', 'verbatim');
  assert.equal(m.rows[0].number, 41000);
  assert.equal(m.rows[0].unit, 'USD');
  assert.equal(m.rows[0].date, '2026-08');
  assert.equal(m.rows[0].origin, 'Stripe dashboard');
  assert.equal(m.rows[0].source, 'metrics.csv:2');
  assert.equal(m.rows[1].number, 240);
  assert.equal(m.rows[2].number, -3);
  assert.equal(m.rows[3].number, null);
});

test('GS-02 Ledgerly: the extractor reproduces every sourced line of claims.json and rejects both decoys (QA-12); every cited line states its claim', () => {
  const dir = path.join(examples, 'gs-02-ledgerly');
  const fixture = JSON.parse(fs.readFileSync(path.join(dir, 'claims.json'), 'utf8'));
  const { story, claims } = buildExtraction(dir, { declaredClaims: { ref: 'claims.json', list: fixture.claims } });
  assert.equal(story.product_name.value, 'Ledgerly');
  assert.equal(story.promise.stated, 'Close the books in 3 days, not 12');
  assert.equal(story.promise.source, 'site/index.html:27');
  assert.match(story.hero_feature.name, /^98\.5% of transactions auto-matched/);
  assert.equal(story.hero_feature.score, 1);
  assert.equal(story.features.find((f) => f.name === 'Close the books in 3 days, not 12').score, 1);
  assert.ok(story.features.every((f) => !f.rules.some((r) => r.rule === 'readme-example')), 'the fixture README example is not the product\'s');
  assert.ok(story.notes.some((n) => /README example `\/present .*names neither the product nor its package/.test(n)));
  assert.equal(story.cta.text, 'Start my free trial');
  for (const f of fixture.claims) {
    const c = claims.claims.find((x) => x.declared_id === f.id || (x.declared_ids ?? []).includes(f.id));
    assert.ok(c, `claim ${f.id} is in the index`);
    assert.equal(c.status, f.expected_status, `${f.id} status`);
    if (!f.decoy) assert.equal(c.source, f.source, `${f.id} source line`);
    else assert.equal(c.source, null);
  }
  assert.deepEqual(claims.gaps.filter((g) => g.id === 'unverified-claim').map((g) => g.value).sort(), ['10x faster', '50,000 customers']);
  assert.ok(!claims.claims.some((c) => c.kind === 'number' && /12-day|under 4/.test(c.value)), 'numbers inside the quote belong to the quote (GS-02 rule)');
  assert.ok(claims.claims.some((c) => c.kind === 'number' && c.value === '12' && c.source === 'site/index.html:27'), 'the bare "12" of the H1 before-state is indexed with the H1 line');
  assert.equal(claims.claims.filter((c) => c.kind === 'quote').length, 1);
  assert.equal(story.proof.quotes[0].name, 'Priya Menon');
  assert.equal(story.proof.quotes[0].source, 'site/index.html:54');
  for (const c of claims.claims.filter((x) => x.status === 'verified' && /:\d+$/.test(x.source))) assert.ok(lineStates(dir, c), `${c.kind} ${JSON.stringify(c.value)} is stated at ${c.source}`);
});

test('GS-03 CLI/API: no hero page, docs quickstart gives the usage example and the install CTA; provenance stays file:line', () => {
  const dir = path.join(examples, 'gs-03-cli-api');
  const { story, claims } = buildExtraction(dir, { profile: { surface: 'cli', __ref: 'product-profile.json:2' } });
  assert.ok(story.gaps.some((g) => g.id === 'no-hero-page'));
  assert.equal(story.cta.text, 'npm install -g acmejobs');
  assert.equal(story.cta.source, 'docs/README.md:10');
  assert.ok(story.audience.some((a) => a.persona === 'developers'));
  assert.ok(story.features.every((f) => f.rules.every((r) => /^[^:]+:\d+$/.test(r.source))));
  assert.ok(claims.claims.every((c) => /^[^:]+:\d+$/.test(c.source)));
  assert.ok(!story.read_policy.content_read.some((f) => /\.tape$|openapi\.yaml$/.test(f)), 'only story sources are opened, not the tape or the spec');
});

test('GS-01 Plausible: a declared URL without a snapshot is a gap, never an invented hero page (no network in tests)', () => {
  const { story } = buildExtraction(path.join(examples, 'gs-01-plausible'), { url: 'https://plausible.io' });
  assert.equal(srcOf(story, 'hero-page').opened, false);
  assert.equal(story.url, 'https://plausible.io');
  assert.ok(story.gaps.some((g) => g.id === 'no-hero-page'));
  assert.equal(story.read_policy.external.length, 0);
  assert.ok(story.promise.stated, 'the README one-liner still gives a stated promise');
});

test('.env*, *.pem, fixtures, key files and a testimonials file under fixtures/ are never opened; symlinks are not followed', (t) => {
  const outside = repo({ 'secret.md': '# Outside\n\n> "Do not read me — 4,444 customers"\n> — Mallory, CEO, Evil Corp\n' });
  const dir = repo({
    'README.md': '# Tool\n\nA tool for 5 teams.\n',
    '.env.local': 'API_KEY=abc 1,000 users',
    'server.pem': '-----BEGIN 99,999 users',
    'fixtures/testimonials.json': JSON.stringify([{ quote: 'Fixture quote that must never be read at all', name: 'F', role: 'R', company: 'C' }]),
    'credentials.json': '{"x": "7,777 users"}',
    'testimonials/customers.md': '> "Real quote from a real customer file here."\n> — Ana, CTO, Real Co\n',
  });
  try { fs.symlinkSync(outside, path.join(dir, 'linked')); } catch { return t.skip('symlinks unavailable'); }
  const { story, claims } = buildExtraction(dir);
  const read = story.read_policy.content_read;
  assert.deepEqual(read, ['README.md', 'testimonials/customers.md']);
  assert.ok(!claims.claims.some((c) => /1,000|99,999|7,777|4,444|Fixture quote|Do not read/.test(c.value)));
  assert.ok(claims.claims.some((c) => c.kind === 'quote' && c.attribution.company === 'Real Co'));
  assert.ok(story.read_policy.denied_files_seen['env-files'] >= 1 && story.read_policy.denied_files_seen.pem >= 1 && story.read_policy.denied_files_seen.fixtures >= 1);
});

test('a declared claim source cannot leave --repo (../, absolute path, symlinked directory) and never opens a denied file', (t) => {
  const outside = repo({ 'secret.txt': 'the password is 8,888 users\n' });
  const dir = repo({ 'README.md': '# Tool\n\nA tool for 5 teams.\n', '.env': 'TOKEN=abc 1,000 users' });
  let linked = true;
  try { fs.symlinkSync(outside, path.join(dir, 'linked')); } catch { linked = false; }
  assert.equal(insideRepo(dir, 'README.md'), true);
  assert.equal(insideRepo(dir, '../x'), false);
  assert.equal(insideRepo(dir, '/etc/passwd'), false);
  const rel = path.relative(dir, path.join(outside, 'secret.txt')).split(path.sep).join('/');
  const declared = { ref: 'claims.json', list: [
    { id: 'escape', kind: 'number', value: '8,888 users', source: `${rel}:1` },
    { id: 'abs', kind: 'number', value: '8,888 users', source: `${path.join(outside, 'secret.txt')}:1` },
    { id: 'env', kind: 'number', value: '1,000 users', source: '.env:1' },
    ...(linked ? [{ id: 'link', kind: 'number', value: '8,888 users', source: 'linked/secret.txt:1' }] : []),
  ] };
  const { story, claims } = buildExtraction(dir, { declaredClaims: declared });
  for (const c of claims.claims.filter((x) => x.declared)) {
    assert.equal(c.status, 'unverified', `${c.declared_id} must not verify`);
    assert.match(c.verification, /outside the repository or denied|could not be read/);
  }
  assert.deepEqual(story.read_policy.content_read, ['README.md']);
  if (!linked) t.diagnostic('symlinks unavailable: symlinked-directory case skipped');
});

test('heroCandidates: repo landing pages in priority order, never under examples/tests, workspace apps included; an app shell without text is skipped', () => {
  const files = ['examples/demo/index.html', 'public/index.html', 'src/app/page.tsx', 'README.md', 'tests/index.html', 'apps/web/src/app/page.tsx'].map((rel) => ({ rel, base: path.posix.basename(rel), depth: rel.split('/').length, denied: false }));
  assert.deepEqual(heroCandidates(files), ['public/index.html', 'src/app/page.tsx', 'apps/web/src/app/page.tsx']);
  const dir = repo({
    'public/index.html': '<!doctype html><html><head><title>App</title></head><body><div id="root"></div></body></html>',
    'src/app/page.tsx': 'export default function Page() { return (<main><h1>Plan sprints in 5 minutes</h1><p>For engineering teams.</p><a href="/signup" className="btn">Start free</a></main>); }',
  });
  const { story } = buildExtraction(dir);
  assert.equal(srcOf(story, 'hero-page').ref, 'src/app/page.tsx');
  assert.equal(story.promise.stated, 'Plan sprints in 5 minutes');
  assert.ok(story.notes.some((n) => /app shell/.test(n)));
});

test('determinism: the same tree yields byte-identical outputs; no timestamps; no absolute paths', () => {
  const dir = acmeRepo();
  const a = buildExtraction(dir);
  const b = buildExtraction(dir);
  assert.equal(toYaml(a.story), toYaml(b.story));
  assert.equal(JSON.stringify(a.claims), JSON.stringify(b.claims));
  assert.ok(!/20\d\d-\d\d-\d\dT/.test(JSON.stringify(a)), 'no ISO timestamps');
  assert.ok(!JSON.stringify(a).includes(os.tmpdir()), 'the temp dir path does not leak into the artefacts');
});

test('toYaml: block style, quoting of risky scalars, empty containers, nested lists of objects', () => {
  const y = toYaml({ a: 1, b: 'plain words', c: 'has: colon', d: 'true', e: '- dash', f: '#hash', g: '', h: null, i: true, j: [], k: {}, l: [{ x: 'y', z: [1, 2] }, 'str'], 'weird key': 'v', m: '3 days', n: 'Q2 2026', o: 'ok (paren) — dash ≤ 60', p: 'trailing:', q: ' lead' });
  const expected = [
    'a: 1', 'b: plain words', 'c: "has: colon"', 'd: "true"', 'e: "- dash"', 'f: "#hash"', 'g: ""', 'h: null', 'i: true', 'j: []', 'k: {}',
    'l:', '  - x: "y"', '    z:', '      - 1', '      - 2', '  - str', '"weird key": v', 'm: "3 days"', 'n: Q2 2026', 'o: "ok (paren) — dash ≤ 60"', 'p: "trailing:"', 'q: " lead"', '',
  ].join('\n');
  assert.equal(y, expected);
  assert.equal(toYaml('x'), 'x\n');
  assert.equal(toYaml([]), '[]\n');
});

test('CLI: --help and --list-scoring exit 0; usage errors exit 2; unreadable repo exits 1', () => {
  const h = run(['--help']);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /Usage: node scripts\/extract-story\.mjs/);
  assert.equal(h.stdout.trim(), USAGE.trim());
  const l = run(['--list-scoring']);
  assert.equal(l.status, 0);
  const parsed = JSON.parse(l.stdout);
  assert.deepEqual(parsed.source_order, [...SOURCE_ORDER]);
  assert.equal(parsed.scoring.find((r) => r.rule === 'h1').points, 1);
  assert.equal(parsed.scoring.find((r) => r.rule === 'product-screen').points, 3);
  assert.equal(run(['--nope']).status, 2);
  assert.equal(run(['--fetch']).status, 2);
  const nf = run(['--repo', path.join(os.tmpdir(), 'pp-story-does-not-exist')]);
  assert.equal(nf.status, 1);
  assert.match(nf.stderr, /not a readable directory/);
});

test('CLI: writes story-extraction.yaml + claims-index.json, prints a summary and the gaps; --print emits JSON; --out - streams YAML; --profile carries its line', () => {
  const dir = repo({ 'site/index.html': SITE, 'README.md': README, 'product-profile.json': '{\n  "schema": "x",\n  "surface": "cli"\n}\n' });
  const out = path.join(dir, 'out', 'story-extraction.yaml');
  const cl = path.join(dir, 'out', 'claims-index.json');
  const r = run(['--repo', dir, '--out', out, '--claims-out', cl, '--profile', path.join(dir, 'product-profile.json')]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /extract-story: product="Acme Sync" promise=yes hero_feature=/);
  assert.match(r.stderr, /gap no-changelog/);
  assert.equal(r.stdout, '', 'nothing on stdout without --print');
  const yaml = fs.readFileSync(out, 'utf8');
  assert.match(yaml, /^# story-extraction\.yaml — provenance per field/);
  assert.match(yaml, /\nhero_feature:\n  name: /);
  assert.match(yaml, /source: "product-profile\.json:3"/, 'the profile is referenced by name (it is outside the output directory), with the surface line');
  const json = JSON.parse(fs.readFileSync(cl, 'utf8'));
  assert.equal(json.schema, CLAIMS_SCHEMA);
  assert.ok(json.claims.length > 5);
  const p = run(['--repo', dir, '--out', '-', '--claims-out', '-', '--print']);
  assert.equal(p.status, 0);
  const both = JSON.parse(p.stdout);
  assert.ok(both.story && both.claims);
  const s = run(['--repo', dir, '--out', '-', '--claims-out', '-']);
  assert.match(s.stdout, /^# story-extraction\.yaml/);
  assert.ok(!fs.existsSync(path.join(dir, 'story-extraction.yaml')), '--out - writes no file');
});

test('CLI: --claims with decoys → exit 0 by default, 3 under --strict; the claims file is referenced by name, not by absolute path', () => {
  const dir = path.join(examples, 'gs-02-ledgerly');
  const outDir = repo({});
  const ok = run(['--repo', dir, '--claims', path.join(dir, 'claims.json'), '--out', path.join(outDir, 's.yaml'), '--claims-out', path.join(outDir, 'c.json')]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stderr, /unverified 2/);
  assert.match(ok.stderr, /gap unverified-claim "10x faster"/);
  const c = JSON.parse(fs.readFileSync(path.join(outDir, 'c.json'), 'utf8'));
  assert.equal(c.declared.ref, 'claims.json');
  assert.ok(!JSON.stringify(c).includes(os.homedir()), 'no home directory in the artefact');
  const strict = run(['--repo', dir, '--claims', path.join(dir, 'claims.json'), '--strict', '--out', '-', '--claims-out', '-']);
  assert.equal(strict.status, 3);
});

test('CLI: --hero snapshot with --url gives URL provenance; a minified or out-of-repo page is copied next to --out as hero-page.html (re-lined); symlinks and denied names are refused; --fetch refused under privacy=local and --privacy local', (t) => {
  const snap = repo({ 'hero-page.html': SITE });
  const hero = run(['--repo', path.join(examples, 'gs-01-plausible'), '--url', 'https://acme.example', '--hero', path.join(snap, 'hero-page.html'), '--out', path.join(snap, 'story.yaml'), '--claims-out', path.join(snap, 'claims.json')]);
  assert.equal(hero.status, 0, hero.stderr);
  const y = fs.readFileSync(path.join(snap, 'story.yaml'), 'utf8');
  assert.match(y, /stated: "Sync every folder in 2 seconds, not 2 hours"\n  source: "https:\/\/acme\.example"\n  snapshot: "hero-page\.html:12"/);
  const c = JSON.parse(fs.readFileSync(path.join(snap, 'claims.json'), 'utf8'));
  assert.ok(c.claims.filter((x) => x.source_kind === 'hero-page').every((x) => x.source === 'https://acme.example' && /^hero-page\.html:\d+$/.test(x.snapshot)));
  const elsewhere = repo({ 'captured.html': SITE.replace(/\n\s*/g, '') + 'x'.repeat(400) });
  const outDir = repo({});
  const min = run(['--repo', path.join(examples, 'gs-01-plausible'), '--hero', path.join(elsewhere, 'captured.html'), '--out', path.join(outDir, 'story.yaml'), '--claims-out', path.join(outDir, 'claims.json')]);
  assert.equal(min.status, 0, min.stderr);
  assert.match(min.stderr, /--hero copied to hero-page\.html \(re-lined/);
  const copy = fs.readFileSync(path.join(outDir, 'hero-page.html'), 'utf8');
  assert.ok(copy.split('\n').length > 20, 'the copy is re-lined');
  const y2 = fs.readFileSync(path.join(outDir, 'story.yaml'), 'utf8');
  assert.match(y2, /source: "hero-page\.html:\d+"/);
  assert.ok(!y2.includes(elsewhere), 'the original path does not leak into the artefact');
  const denied = run(['--repo', path.join(examples, 'gs-02-ledgerly'), '--hero', path.join(elsewhere, '.env'), '--out', '-', '--claims-out', '-']);
  assert.equal(denied.status, 2, 'a --hero name denied by is refused wherever it lives');
  try { fs.symlinkSync(path.join(elsewhere, 'captured.html'), path.join(elsewhere, 'link.html')); } catch { t.diagnostic('symlinks unavailable'); }
  if (fs.existsSync(path.join(elsewhere, 'link.html'))) assert.equal(run(['--repo', path.join(examples, 'gs-02-ledgerly'), '--hero', path.join(elsewhere, 'link.html'), '--out', '-', '--claims-out', '-']).status, 2, 'a symlinked --hero is refused');
  const refused = run(['--repo', path.join(examples, 'gs-02-ledgerly'), '--url', 'https://acme.example', '--fetch', '--out', '-', '--claims-out', '-'], { env: { CLAUDE_PLUGIN_OPTION_PRIVACY: 'local' } });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /refused under the privacy profile; network manifest: acme\.example/);
  const flag = run(['--repo', path.join(examples, 'gs-02-ledgerly'), '--url', 'https://acme.example', '--fetch', '--privacy', 'local', '--out', '-', '--claims-out', '-']);
  assert.equal(flag.status, 2, 'the per-run --privacy local flag refuses --fetch too');
});

test('CLI: --fetch against a local server — every host is announced before it is contacted, redirects are followed by hand, the final URL is the provenance, the snapshot is re-lined and saved next to --out, never into --repo', async () => {
  const minified = SITE.replace(/\n\s*/g, '');
  const server = http.createServer((req, res) => {
    if (req.url === '/start') { res.writeHead(302, { location: `http://127.0.0.1:${server.address().port}/landing` }); res.end(); return; }
    if (req.url === '/big') { res.writeHead(200, { 'content-type': 'text/html', 'content-length': String(3 * 1024 * 1024) }); res.end('x'); return; }
    if (req.url === '/json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(minified);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const dir = repo({ 'README.md': '# Acme Sync\n\nSync.\n' });
    const outDir = repo({});
    const r = await runAsync(['--repo', dir, '--url', `http://127.0.0.1:${port}/start`, '--fetch', '--out', path.join(outDir, 'story.yaml'), '--claims-out', path.join(outDir, 'claims.json')]);
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stderr.split('\n');
    const manifest = lines.filter((l) => /network: GET 127\.0\.0\.1:\d+/.test(l));
    assert.equal(manifest.length, 2, 'the first request and the redirect hop are both announced');
    assert.match(manifest[1], /\(redirect\)/);
    assert.ok(lines.indexOf(manifest[0]) < lines.findIndex((l) => /extract-story: product=/.test(l)), 'the manifest precedes the result');
    const y = fs.readFileSync(path.join(outDir, 'story.yaml'), 'utf8');
    assert.match(y, new RegExp(`fetched_url: "http://127\\.0\\.0\\.1:${port}/landing"`));
    assert.match(y, new RegExp(`stated: "Sync every folder in 2 seconds, not 2 hours"\\n  source: "http://127\\.0\\.0\\.1:${port}/landing"\\n  snapshot: "hero-page\\.html:\\d+"`));
    assert.match(y, /- "GET 127\.0\.0\.1:\d+"/, 'read_policy.external lists the hosts');
    const snapshot = fs.readFileSync(path.join(outDir, 'hero-page.html'), 'utf8');
    assert.ok(snapshot.split('\n').length > 20, 'the saved page is re-lined');
    assert.ok(!fs.existsSync(path.join(dir, 'hero-page.html')), 'nothing is written into --repo');
    const c = JSON.parse(fs.readFileSync(path.join(outDir, 'claims.json'), 'utf8'));
    for (const claim of c.claims.filter((x) => x.snapshot)) {
      const line = snapshot.split('\n')[Number(claim.snapshot.split(':')[1]) - 1];
      assert.ok(line !== undefined && (claim.kind !== 'number' || lineStatesNumber(line, claim)), `${claim.value} at ${claim.snapshot}`);
    }
    const cwd = repo({});
    const s = await runAsync(['--repo', dir, '--url', `http://127.0.0.1:${port}/landing`, '--fetch', '--out', '-', '--claims-out', '-'], { cwd });
    assert.equal(s.status, 0, s.stderr);
    assert.ok(fs.existsSync(path.join(cwd, 'hero-page.html')) && !fs.existsSync(path.join(dir, 'hero-page.html')));
    const big = await runAsync(['--repo', dir, '--url', `http://127.0.0.1:${port}/big`, '--fetch', '--out', '-', '--claims-out', '-'], { cwd });
    assert.equal(big.status, 1);
    assert.match(big.stderr, /larger than/);
    const json = await runAsync(['--repo', dir, '--url', `http://127.0.0.1:${port}/json`, '--fetch', '--out', '-', '--claims-out', '-'], { cwd });
    assert.equal(json.status, 1);
    assert.match(json.stderr, /not an HTML page/);
  } finally { server.close(); }
});

test('fetchHero: MAX_REDIRECTS and the host list (stubbed fetch, no network)', async () => {
  const calls = [];
  const fetchImpl = async (u) => { calls.push(u); return { status: 302, ok: false, headers: new Map([['location', `${u}/x`]]), body: null }; };
  const outDir = repo({});
  await assert.rejects(() => fetchHero('http://a.example', outDir, { fetchImpl, log: () => {} }), /more than 5 redirects/);
  assert.equal(calls.length, 6);
});

test('buildExtraction: --metrics rows typed date / email / url / text are sourced facts (the ask card); an unparsed quantity stays a gap', () => {
  const row = (line, name, value, unit, number = null) => ({ line, source: `metrics.csv:${line}`, name, value, token: value, number, unit, date: '2026-09-01', origin: null });
  const metrics = { ref: 'metrics.csv', rows: [row(2, 'Ask: raise', 'EUR 1,500,000', 'EUR', 1500000), row(3, 'Ask: deadline', '2026-12-15', 'date'), row(4, 'Ask: contact', 'founders@ledgerly.example', 'email'), row(5, 'Retention', 'n/a', '%')] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-metrics-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# Acme\n\nAcme.\n');
  const { claims } = buildExtraction(dir, { metrics });
  const by = (src) => claims.claims.find((c) => c.source === src || (c.source === null && c.value === 'n/a' && src === 'metrics.csv:5'));
  assert.deepEqual([by('metrics.csv:3').kind, by('metrics.csv:3').status, by('metrics.csv:3').date], ['text', 'verified', '2026-09-01']);
  assert.equal(by('metrics.csv:4').value, 'founders@ledgerly.example');
  assert.equal(by('metrics.csv:2').kind, 'number');
  assert.deepEqual(claims.gaps.filter((g) => /^metrics\.csv:/.test(g.where ?? '')).map((g) => g.value), ['n/a']);
  assert.equal(claims.counts.by_kind.text, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
