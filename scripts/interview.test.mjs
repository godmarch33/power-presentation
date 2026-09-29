import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_QUESTIONS, askPayload, interviewForm, main } from './interview.mjs';

const APP = { dir: 'web', screens: 29, gated: true };
const DEMO = { source: 'local-dev', dir: 'web', runnable: true, sign_in: ['/signin'], start: { command: 'make docker-up', file: 'Makefile:207', stop: 'make docker-down', installs: false } };
const planWith = (extra = {}) => ({
  repo: '/r', surface: 'web-ui',
  options: { apps: [APP], web: [{ kind: 'static', dir: 'site', entry: 'site/index.html', runnable: true }, { kind: 'static', dir: 'landing', entry: 'landing/index.html', runnable: true }], prod_url_hints: [] },
  routes: [{ class: 'web-ui', source: 'combined', demo: DEMO, fallback: { shots: ['var/shots/a.png', 'var/shots/b.png'] } }],
  questions: [{ id: 'product-demo' }],
  ...extra,
});

test('interviewForm(): no parameters — audience, landing and demo asked; the product is settled by the scan (an app in this repository)', () => {
  const f = interviewForm({ declared: {}, profile: { surface: 'web-ui', confidence: 'high' }, plan: planWith() });
  assert.deepEqual(f.questions.map((q) => q.id), ['for', 'landing', 'demo']);
  assert.deepEqual(f.decided, [{ field: 'product', value: { kind: 'repo', path: '/r' }, reason: 'this repository holds the app in web/ (29 screens, behind sign-in)' }]);
  const landing = f.questions.find((q) => q.id === 'landing');
  assert.equal(landing.options[0].label, 'landing/ in this repository', '`landing/` before a generic `site/`');
  assert.match(landing.question, /found one in landing\/, site\//);
  const demo = f.questions.find((q) => q.id === 'demo');
  assert.deepEqual(demo.options.map((o) => o.value.kind), ['start', 'url', 'shots', 'reconstruction']);
  assert.match(demo.options[0].description, /`make docker-up` .*`make docker-down`/);
  assert.match(demo.question, /sign-in \(\/signin\): put a demo account into <P>\/\.demo-account\.json/);
  assert.ok(f.questions.every((q) => q.header.length <= 12 && q.options.length >= 2 && q.options.length <= 4));
});

test('interviewForm(): only what is open — --for and --url typed leave the demo; a landing-only folder asks where the product is', () => {
  const typed = interviewForm({ declared: { for: 'sales', url: 'https://gadfly.io' }, plan: planWith() });
  assert.deepEqual(typed.questions.map((q) => q.id), ['demo']);
  const landingOnly = interviewForm({ declared: { for: 'marketing' }, profile: { surface: 'web-ui', confidence: 'low' }, plan: { repo: '/l', options: { apps: [], web: [{ kind: 'static', dir: 'landing', entry: 'landing/index.html', runnable: true }], prod_url_hints: [{ url: 'https://gadfly.io', from: 'CNAME:1' }] }, routes: [], questions: [] } });
  assert.deepEqual(landingOnly.questions.map((q) => q.id), ['product', 'landing']);
  assert.deepEqual(landingOnly.questions[0].options.map((o) => o.value.kind), ['repo', 'url'], 'no "this repository" option when the scan found no product here');
  assert.equal(landingOnly.questions[1].options[0].label, 'Online at gadfly.io (Recommended)');
  assert.deepEqual(landingOnly.questions[1].options[0].value, { kind: 'url', url: 'https://gadfly.io' });
  const cli = interviewForm({ declared: { for: 'marketing', repo: true }, profile: { surface: 'cli', confidence: 'high' }, plan: { options: { apps: [], web: [], prod_url_hints: [] }, routes: [], questions: [] } });
  assert.deepEqual(cli.questions.map((q) => q.id), ['landing'], 'a source flag settles the product');
});

test('interviewForm(): a landing-only URL (Gadfly 0.2.0) — the demo question offers the app\'s own screens, rebuilt first in marketing, stills first in sales', () => {
  const plan = (def) => ({ options: { apps: [], web: [], prod_url_hints: [] }, routes: [], questions: [{ id: 'product-demo', kind: 'landing-only', default: { demo: def } }] });
  const m = interviewForm({ declared: { for: 'marketing', url: 'https://usegadfly.com' }, plan: plan('landing-reconstruction') });
  assert.deepEqual(m.questions.map((q) => q.id), ['demo']);
  const q = m.questions[0];
  assert.match(q.question, /landing page, not the product/);
  assert.deepEqual(q.options.map((o) => o.value.kind), ['reconstruction', 'url', 'recording', 'shots']);
  assert.equal(q.options[0].label, 'Rebuild from its screenshots (Recommended)');
  assert.match(q.options[0].description, /Screen images simulated/);
  const s = interviewForm({ declared: { for: 'sales', url: 'https://usegadfly.com' }, plan: plan('landing-shots') }).questions[0];
  assert.deepEqual(s.options.map((o) => o.value.kind), ['shots', 'url', 'recording', 'reconstruction']);
  assert.equal(s.options[0].label, 'Its screenshots as stills (Recommended)');
  assert.ok(s.options.every((o) => o.label.length <= 60));
  const withApp = { options: { apps: [], web: [], prod_url_hints: [] }, routes: [], questions: [{ id: 'product-demo', kind: 'landing-only', app_url: 'https://app.usegadfly.com/', default: { demo: 'landing-reconstruction' } }] };
  const a = interviewForm({ declared: { for: 'marketing', url: 'https://usegadfly.com' }, plan: withApp }).questions[0];
  assert.equal(a.options[0].label, 'Record the app at app.usegadfly.com (Recommended)');
  assert.deepEqual(a.options[0].value, { kind: 'url', url: 'https://app.usegadfly.com/', needs_account: true });
  assert.deepEqual(a.options.map((o) => o.value.kind), ['url', 'reconstruction', 'recording', 'shots']);
  assert.deepEqual(a.yes, { kind: 'reconstruction', from: 'landing-screenshots' }, '--yes has no demo account');
  assert.match(a.question, /links to the app at https:\/\/app\.usegadfly\.com\//);
  assert.ok(!('yes' in askPayload({ questions: [a] }).questions[0]), 'the unattended answer never reaches the form');
});

test('askPayload() / main(): the AskUserQuestion shape without ids or values; at most four questions; the CLI reads the scan', () => {
  const f = interviewForm({ declared: {}, plan: planWith() });
  const p = askPayload(f);
  assert.ok(p.questions.length <= MAX_QUESTIONS);
  assert.deepEqual(Object.keys(p.questions[0]).sort(), ['header', 'multiSelect', 'options', 'question']);
  assert.deepEqual(Object.keys(p.questions[0].options[0]).sort(), ['description', 'label']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-iv-'));
  fs.writeFileSync(path.join(dir, 'intake.json'), JSON.stringify({ declared: { for: 'marketing', url: 'https://x.io' } }));
  fs.writeFileSync(path.join(dir, 'source-plan.json'), JSON.stringify({ options: { apps: [], web: [], prod_url_hints: [] }, routes: [], questions: [] }));
  assert.equal(main(['--project', dir, '--json']), 0);
  assert.equal(main([]), 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('interviewForm(): the detector\'s product-type question joins last; a full form takes its recommended answer', () => {
  const profile = { surface: 'cli', confidence: 'medium', ambiguous: true, question: { text: 'Which best describes the product?', options: ['cli', 'library/sdk', 'api/backend'], default: 'cli' } };
  const roomy = interviewForm({ declared: { for: 'marketing', url: 'https://x.io' }, profile, plan: { options: { apps: [], web: [], prod_url_hints: [] }, routes: [], questions: [] } });
  assert.deepEqual(roomy.questions.map((q) => q.id), ['surface']);
  assert.equal(roomy.questions[0].options[0].label, 'cli (Recommended)');
  const full = interviewForm({ declared: {}, profile, plan: planWith({ options: { apps: [], web: [{ kind: 'static', dir: 'landing', entry: 'landing/index.html', runnable: true }], prod_url_hints: [] } }) });
  assert.deepEqual(full.questions.map((q) => q.id), ['for', 'product', 'landing', 'demo']);
  assert.deepEqual(full.dropped, ['surface']);
  assert.deepEqual(full.decided.at(-1), { field: 'surface', value: 'cli', reason: 'the form holds 4 questions — the recommended answer is taken' });
});
