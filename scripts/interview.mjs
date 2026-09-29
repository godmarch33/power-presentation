import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCHEMA = 'power-presentation/interview@0.1';
export const MAX_QUESTIONS = 4;
const SOURCE_FLAGS = ['url', 'staging_url', 'staging-url', 'local', 'recording', 'repo', 'source'];
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const opt = (label, description, value) => ({ label: label.slice(0, 60), description, value });

export function interviewForm({ declared = {}, profile = null, plan = null } = {}) {
  const questions = [];
  const decided = [];
  const web = plan?.routes?.find((r) => r.class === 'web-ui') ?? null;
  const app = plan?.options?.apps?.[0] ?? null;
  const LANDING_ORDER = ['landing', 'marketing', 'homepage', 'promo', 'www', 'website', 'home', 'site'];
  const rank = (o) => LANDING_ORDER.indexOf(String(o.dir).split('/').pop().toLowerCase());
  const landings = (plan?.options?.web ?? []).filter((o) => o.kind === 'static' && o.runnable && rank(o) >= 0).sort((a, b) => rank(a) - rank(b));
  const hints = plan?.options?.prod_url_hints ?? [];
  const hasSource = SOURCE_FLAGS.some((k) => declared[k] != null && declared[k] !== false);
  const surface = profile?.surface ?? plan?.surface ?? null;

  if (!declared.for) {
    questions.push({ id: 'for', field: 'for', header: 'Audience', question: 'Who is the video for?', multiSelect: false, options: [
      opt('Marketing (Recommended)', 'A launch or promo video for the site and social; voice off by default', 'marketing'),
      opt('Sales', 'Outreach to one prospect: their name and company in the first seconds', 'sales'),
      opt('Investors', 'A pitch with traction numbers from a metrics file and an ask card', 'investors'),
    ] });
  }

  const productHere = app ? `the app in ${app.dir}/ (${app.screens} screen${app.screens === 1 ? '' : 's'}${app.gated ? ', behind sign-in' : ''})` : surface && surface !== 'files/docs' && profile?.confidence !== 'low' && profile?.mode !== 'concept' ? `a ${surface} product` : null;
  if (!hasSource) {
    if (productHere && app) decided.push({ field: 'product', value: { kind: 'repo', path: plan?.repo ?? '.' }, reason: `this repository holds ${productHere}` });
    else {
      questions.push({ id: 'product', field: 'product', header: 'Product', question: `Where is the product itself?${productHere ? ` This folder looks like ${productHere}.` : ' The scan found no product app in this folder.'} (Other: type a path or a URL.)`, multiSelect: false, options: [
        ...(productHere ? [opt('This repository (Recommended)', `The scan found ${productHere}`, { kind: 'repo', path: plan?.repo ?? '.' })] : []),
        opt('Another repository', 'The product code lives elsewhere — give its path', { kind: 'repo', path: null }),
        opt('Only online', 'The product runs on the internet — give its URL', { kind: 'url', url: null }),
      ] });
    }
  }

  if (declared.url == null) {
    const options = [
      ...hints.slice(0, 2).map((h, i) => opt(`Online at ${h.url.replace(/^https?:\/\//, '')}${i === 0 ? ' (Recommended)' : ''}`, `Named by the repository (${h.from}) — the page is captured for the hook, promise, CTA and brand`, { kind: 'url', url: h.url })),
      ...landings.slice(0, 1).map((l) => opt(`${l.dir}/ in this repository`, 'Not deployed, or use the local copy — served from loopback', { kind: 'local', entry: l.entry })),
      opt(hints.length ? 'Online elsewhere' : 'It is online', 'Give the landing URL (Other)', { kind: 'url', url: null }),
      opt('No landing page', 'The video is built from the product alone', { kind: 'none' }),
    ].slice(0, 4);
    questions.push({ id: 'landing', field: 'landing', header: 'Landing', question: `Is there a landing page for the product, and is it online?${landings.length ? ` The scan found one in ${landings.map((l) => `${l.dir}/`).join(', ')}.` : ''} (Other: its URL or the path of its repository.)`, multiSelect: false, options });
  }

  const planQ = plan?.questions?.find((q) => q.id === 'product-demo') ?? plan?.questions?.find((q) => q.id === 'web-source') ?? null;
  const demo = web?.demo ?? null;
  if (planQ?.kind === 'landing-only') {
    const rebuild = opt('Rebuild from its screenshots', 'The app screens the landing publishes, rebuilt exactly and shown working, labelled "Screen images simulated" (tier C)', { kind: 'reconstruction', from: 'landing-screenshots' });
    const stills = opt('Its screenshots as stills', 'The app screens the landing publishes, as stills with camera moves (tier B)', { kind: 'shots', from: 'landing-screenshots' });
    const first = planQ.default?.demo === 'landing-shots' ? [stills, rebuild] : [rebuild, stills];
    const app = planQ.app_url ?? null;
    const online = app
      ? opt(`Record the app at ${app.replace(/^https?:\/\//, '').replace(/\/$/, '')} (Recommended)`, 'The working product, the first source — put a demo account into <P>/.demo-account.json first; recorded there (tier A)', { kind: 'url', url: app, needs_account: true })
      : opt('The app is online', 'Give the app URL (Other) and put a demo account into <P>/.demo-account.json — recorded there (tier A)', { kind: 'url', url: null });
    if (!app) first[0] = { ...first[0], label: `${first[0].label} (Recommended)` };
    const options = app ? [online, first[0], opt('I have a recording', 'A screen recording of the app (Other: its path) — tier B', { kind: 'recording', path: null }), first[1]] : [first[0], online, opt('I have a recording', 'A screen recording of the app (Other: its path) — tier B', { kind: 'recording', path: null }), first[1]];
    questions.push({ id: 'demo', field: 'demo', header: 'Demo', question: `The URL is the product's landing page, not the product.${app ? ` The landing links to the app at ${app}.` : ''} How should the video show the product working?`, multiSelect: false, options, yes: first[0].value, from: planQ.id });
  } else if (planQ || demo) {
    const options = [];
    if (demo?.start) options.push(opt(`Raise it locally (Recommended)`, `\`${demo.start.command}\` from a copy in the workspace (${demo.start.file}), record a walkthrough, stop it (\`${demo.start.stop ?? 'by PID'}\`)${demo.start.installs ? '; installs its dependencies first' : ''}`, { kind: 'start' }));
    else if (demo?.runnable) options.push(opt('Run it locally (Recommended)', `${demo.source === 'local-dev' ? 'Its dev server' : 'The built app'} in ${demo.dir}/, from a copy in the workspace`, { kind: 'start' }));
    options.push(opt('It is online', 'Give the product URL (Other) — recorded there', { kind: 'url', url: null }));
    if (web?.fallback?.shots?.length) options.push(opt('Use its screenshots', `${web.fallback.shots.length} screenshot(s) the repository keeps — tier B stills`, { kind: 'shots' }));
    options.push(opt('Reconstruct the screens', 'Built from the source, labelled "Screen images simulated" (tier C)', { kind: 'reconstruction' }));
    const signIn = demo?.sign_in?.length ? ` The app asks for sign-in (${demo.sign_in[0]}): put a demo account into <P>/.demo-account.json ({"email": …, "password": …}; the workspace is git-ignored, the recording masks the password field) — without one the walkthrough shows a fresh sign-up.` : '';
    questions.push({ id: 'demo', field: 'demo', header: 'Demo', question: `How should the video show the product working?${signIn}`, multiSelect: false, options: options.slice(0, 4), from: planQ?.id ?? null });
  }

  const pq = profile?.ambiguous ? profile.question : null;
  if (pq?.options?.length >= 2) {
    const top = [...new Set([pq.default, ...pq.options].filter(Boolean))].slice(0, 4);
    questions.push({ id: 'surface', field: 'surface', header: 'Product type', question: pq.text, multiSelect: false, options: top.map((c, i) => opt(`${c}${i === 0 ? ' (Recommended)' : ''}`, i === 0 ? 'What the scan leans to' : 'Another product type', c)) });
  }
  const kept = questions.slice(0, MAX_QUESTIONS);
  const dropped = questions.slice(MAX_QUESTIONS);
  for (const q of dropped) decided.push({ field: q.field, value: q.yes ?? q.options[0].value, reason: `the form holds ${MAX_QUESTIONS} questions — the ${q.yes ? 'unattended' : 'recommended'} answer is taken` });
  return { schema: SCHEMA, questions: kept, decided, dropped: dropped.map((q) => q.id) };
}

export function askPayload(form) {
  return { questions: form.questions.map((q) => ({ question: q.question, header: q.header.slice(0, 12), multiSelect: false, options: q.options.map((o) => ({ label: o.label, description: o.description })) })) };
}

export const USAGE = 'Usage: node scripts/interview.mjs --project <P> [--scan <dir>] [--json]\n\nThe questions /present asks after the scan (one form, at most four; see the file header).';

export function main(argv = process.argv.slice(2)) {
  const o = { project: null, scan: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--project') o.project = argv[++i];
    else if (a === '--scan') o.scan = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') { console.log(USAGE); return 0; }
    else { console.error(`unknown argument ${a}\n${USAGE}`); return 2; }
  }
  if (!o.project) { console.error(USAGE); return 2; }
  const scan = path.resolve(o.scan ?? o.project);
  const form = interviewForm({
    declared: readJson(path.join(path.resolve(o.project), 'intake.json'))?.declared ?? {},
    profile: readJson(path.join(scan, 'product-profile.json')),
    plan: readJson(path.join(scan, 'source-plan.json')),
  });
  console.log(o.json ? JSON.stringify({ ...form, ask: askPayload(form) }, null, 2) : form.questions.length ? form.questions.map((q) => `${q.header}: ${q.question}\n${q.options.map((x) => `  - ${x.label} — ${x.description}`).join('\n')}`).join('\n') : 'nothing to ask — the scan and the flags settle it');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
