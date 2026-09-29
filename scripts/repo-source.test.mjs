import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCHEMA, appRoutes, appUrlOf, backendNeeds, buildPlan, chooseRoutes, demoOf, e2eFlows, htmlHasContent, localWebOptions, main, pageFacts, prodUrlHints, productApps, productBins, productShots, readmeCommands, repoArtefacts, runCopy, startCommands, urlRole, webPortOf } from './repo-source.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.join(here, '..', 'examples');
const tmpDirs = [];
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });
function repo(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pp-rs-')));
  tmpDirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    if (body === null) fs.mkdirSync(path.join(dir, rel), { recursive: true });
    else fs.writeFileSync(path.join(dir, rel), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return dir;
}
const SHELL = '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
const PAGE = '<!doctype html><html><body><h1>Close the month in 3 days</h1><p>Ledgerly matches every bank line.</p></body></html>';

test('htmlHasContent(): an <h1> or ≥ 300 characters of text is a page; an SPA shell is not', () => {
  assert.equal(htmlHasContent(PAGE), true);
  assert.equal(htmlHasContent(SHELL), false);
  assert.equal(htmlHasContent(`<p>${'word '.repeat(80)}</p>`), true);
  assert.equal(htmlHasContent('<script>document.write("<h1>x</h1>")</script>'), false, 'script text never counts');
});

test('prodUrlHints(): declared (package.json homepage, CNAME) before mentioned (a README "live / demo" link); never code hosts, badges or examples', () => {
  const dir = repo({
    'package.json': { name: 'shop', homepage: 'https://shop.acme.dev/' },
    CNAME: 'www.acme.dev\n',
    'README.md': '# Shop\n[![build](https://img.shields.io/x)](https://github.com/acme/shop)\nLive demo: https://demo.acme.dev.\nSource: https://github.com/acme/shop\nTry the app at https://example.com/app\n',
  });
  assert.deepEqual(prodUrlHints(dir), [
    { url: 'https://shop.acme.dev', from: 'package.json:homepage', strength: 'declared' },
    { url: 'https://www.acme.dev', from: 'CNAME:1', strength: 'declared' },
    { url: 'https://demo.acme.dev', from: 'README.md:3', strength: 'mentioned' },
  ]);
  assert.deepEqual(prodUrlHints(repo({ 'package.json': { homepage: 'https://github.com/acme/shop#readme' } })), [], 'a repository page is not the product site');
});

test('localWebOptions(): dev servers (runnable only with node_modules or no dependencies), built apps, static sites; shells are not runnable', () => {
  const vite = repo({ 'package.json': { scripts: { dev: 'vite' }, devDependencies: { vite: '^6' } }, 'index.html': SHELL });
  assert.deepEqual(localWebOptions(vite), [
    { kind: 'dev-server', dir: '.', script: 'dev', command: 'npm run dev', runnable: false, reason: 'dependencies are not installed (no node_modules) — the plugin never installs into the repository' },
  ], 'the root index.html of a package is the app shell its dev server fills, not a static site');
  assert.deepEqual(localWebOptions(repo({ 'public/index.html': SHELL })), [{ kind: 'static', dir: 'public', entry: 'public/index.html', runnable: false, reason: 'an app shell with no content — it needs its build or dev server' }]);
  fs.mkdirSync(path.join(vite, 'node_modules'));
  fs.mkdirSync(path.join(vite, 'dist'));
  fs.writeFileSync(path.join(vite, 'dist', 'index.html'), SHELL);
  const opts = localWebOptions(vite);
  assert.equal(opts.find((o) => o.kind === 'dev-server').runnable, true);
  assert.deepEqual(opts.find((o) => o.kind === 'build-output'), { kind: 'build-output', dir: 'dist', entry: 'dist/index.html', runnable: true, reason: 'a built app, served from loopback as it is' });
  const mono = repo({ 'apps/web/package.json': { scripts: { start: 'node server.mjs' } }, 'site/index.html': PAGE });
  const m = localWebOptions(mono);
  assert.deepEqual(m.map((o) => [o.kind, o.dir, o.runnable]), [['dev-server', 'apps/web', true], ['static', 'site', true]], 'no dependencies → runnable as is');
});

test('productBins() / readmeCommands(): the documented commands of the product executables with their documented output; installs left out', () => {
  const dir = repo({
    'package.json': { name: '@acme/jobs', bin: { acmejobs: 'bin/acmejobs.js' } },
    'README.md': '# acmejobs\n\n```bash\nnpm install -g @acme/jobs\n$ acmejobs submit --file report.csv\nJob 42 queued\n$ acmejobs watch --last\n```\n\n```js\nacmejobs.submit()\n```\n',
  });
  assert.deepEqual(productBins(dir), ['acmejobs']);
  assert.deepEqual(readmeCommands(dir), [
    { file: 'README.md', line: 5, command: 'acmejobs submit --file report.csv', output: ['Job 42 queued'] },
    { file: 'README.md', line: 7, command: 'acmejobs watch --last', output: [] },
  ]);
});

test('chooseRoutes(): the web order dev → build → static → declared URL → question + tier C; sales/investors must confirm a reconstruction', () => {
  const base = { surface: 'web-ui', hints: [], tapes: [], specs: [], commands: [] };
  const dev = { kind: 'dev-server', dir: '.', script: 'dev', command: 'npm run dev', runnable: true, reason: 'dependencies installed' };
  const idle = { ...dev, runnable: false, reason: 'dependencies are not installed' };
  const built = { kind: 'build-output', dir: 'dist', entry: 'dist/index.html', runnable: true };
  const stat = { kind: 'static', dir: 'site', entry: 'site/index.html', runnable: true };
  const route = (web, extra = {}) => chooseRoutes({ ...base, web, ...extra }).routes[0];
  assert.equal(route([stat, built, dev]).source, 'local-dev');
  assert.match(route([dev]).how, /run-copy --repo "<REPO>" --dest "<P>\/\.source" && .*record-flow\.mjs --local --repo "<P>\/\.source"/);
  assert.equal(route([stat, built, idle]).source, 'local-build');
  assert.equal(route([stat, idle]).source, 'local-static');
  assert.match(route([stat]).how, /--local --repo "<REPO>\/site"/);
  assert.deepEqual([route([idle], { hints: [{ url: 'https://shop.acme.dev', from: 'package.json:homepage', strength: 'declared' }] }).source, route([idle], { hints: [{ url: 'https://shop.acme.dev', from: 'package.json:homepage', strength: 'declared' }] }).url], ['prod-url', 'https://shop.acme.dev']);
  const none = chooseRoutes({ ...base, web: [idle], hints: [{ url: 'https://demo.acme.dev', from: 'README.md:3', strength: 'mentioned' }] });
  assert.equal(none.routes[0].source, 'reconstruction'); assert.equal(none.routes[0].tier, 'C'); assert.equal(none.routes[0].needs_confirmation, false, 'marketing may reconstruct with the label');
  assert.match(none.questions[0].text, /\(1\) install the dependencies in \. \(`npm install`\) .*\(2\) use https:\/\/demo\.acme\.dev \(README\.md:3\).*\(3\) give a production or staging URL.*\(4\) reconstruct/);
  assert.deepEqual(none.questions[0].default, { source: 'prod-url', url: 'https://demo.acme.dev' });
  assert.equal(chooseRoutes({ ...base, web: [], mode: 'investors' }).routes[0].needs_confirmation, true, '');
  const role = { role: 'landing', evidence: ['reads like a marketing page'] };
  const lo = chooseRoutes({ ...base, web: [], url: 'https://usegadfly.com', role });
  assert.deepEqual([lo.routes[0].source, lo.routes[0].tier, lo.routes[0].from, lo.routes[0].message.url, lo.routes[0].needs_confirmation], ['reconstruction', 'C', 'landing-screenshots', 'https://usegadfly.com', false]);
  assert.match(lo.routes[0].how, /screenshots and copy the landing publishes/);
  assert.match(lo.routes[0].message.use, /never a product beat/);
  assert.deepEqual([lo.questions[0].id, lo.questions[0].kind, lo.questions[0].default], ['product-demo', 'landing-only', { demo: 'landing-reconstruction' }]);
  assert.match(lo.questions[0].text, /is the product's landing page, not the product/);
  assert.deepEqual(chooseRoutes({ ...base, web: [], url: 'https://usegadfly.com', role, mode: 'sales' }).questions[0].default, { demo: 'landing-shots' });
  assert.equal(chooseRoutes({ ...base, web: [], url: 'https://x.io', role: { role: 'unknown' } }).questions[0].id, 'web-source', 'an unclear URL keeps the old question');
  const named = chooseRoutes({ ...base, web: [], url: 'https://usegadfly.com', role: { ...role, app_url: { url: 'https://app.usegadfly.com/', from: 'JSON-LD application url' } } });
  assert.equal(named.questions[0].app_url, 'https://app.usegadfly.com/');
  assert.match(named.questions[0].text, /\(1\) record the working product at https:\/\/app\.usegadfly\.com\/ \(the landing links to it\) — the first source/);
  const ld = '<script type="application/ld+json">{"@graph":[{"@type":"SoftwareApplication","url":"https://app.usegadfly.com/"}]}</script>';
  assert.deepEqual(appUrlOf(ld, 'https://usegadfly.com'), { url: 'https://app.usegadfly.com/', from: 'JSON-LD application url' });
  assert.deepEqual(appUrlOf('<a href="https://dashboard.acme.io/start">Open</a>', 'https://acme.io'), { url: 'https://dashboard.acme.io/', from: 'a link to dashboard.acme.io' });
  assert.deepEqual(appUrlOf('<a href="https://acme.cloud/sign-in">Sign in</a>', 'https://acme.io'), { url: 'https://acme.cloud/', from: 'a link to acme.cloud' });
  assert.equal(appUrlOf('<a href="/pricing">Pricing</a><a href="https://twitter.com/acme">X</a>', 'https://acme.io'), null);
  const cli = (extra) => chooseRoutes({ ...base, surface: 'cli', secondary: ['api/backend', 'files/docs'], web: [], ...extra }).routes;
  assert.deepEqual(cli({ tapes: ['demo.tape'], specs: ['openapi.yaml'] }).map((r) => [r.class, r.source, r.tier]), [['cli', 'vhs-tape', 'A'], ['api/backend', 'api-spec', 'B'], ['files/docs', 'scene-plan', null]]);
  assert.equal(cli({ commands: [{ file: 'README.md', line: 5, command: 'acmejobs submit', output: [] }] })[0].source, 'readme-commands');
  assert.equal(cli({})[0].source, 'code');
});

test('buildPlan() on the golden-set fixtures: GS-02 its static site, GS-03 its tape + spec + documented commands, GS-01 a question defaulting to the site its README names', () => {
  const gs02 = buildPlan(path.join(examples, 'gs-02-ledgerly'), { profile: { surface: 'web-ui' } });
  assert.equal(gs02.schema, SCHEMA); assert.equal(gs02.writes_to_repo, false);
  assert.deepEqual(gs02.routes.map((r) => [r.class, r.source, r.tier, r.dir]), [['web-ui', 'local-static', 'A', 'site']]);
  const gs03 = buildPlan(path.join(examples, 'gs-03-cli-api'), { profile: { surface: 'cli', secondary: ['api/backend', 'mocks/design', 'files/docs'] } });
  assert.deepEqual(gs03.routes.map((r) => r.source), ['vhs-tape', 'api-spec', 'scene-plan', 'scene-plan']);
  assert.deepEqual(repoArtefacts(path.join(examples, 'gs-03-cli-api')), { tapes: ['demo.tape'], specs: ['openapi.yaml'] });
  assert.ok(gs03.options.readme_commands.some((c) => c.command.startsWith('acmejobs submit')));
  const gs01 = buildPlan(path.join(examples, 'gs-01-plausible'), { profile: { surface: 'web-ui' } });
  assert.equal(gs01.routes[0].source, 'reconstruction');
  assert.equal(gs01.questions[0].default.url, 'https://plausible.io');
});

test('runCopy(): the repository files a dev server needs, in the workspace — no .env, no keys, no power-presentation-out, node_modules linked; the repository is not written', () => {
  const dir = repo({ 'package.json': { scripts: { dev: 'vite' } }, 'index.html': SHELL, 'src/main.tsx': 'x', '.env': 'SECRET=1', 'certs/dev.pem': 'k', 'power-presentation-out/shop-marketing/index.html': 'old', 'node_modules/vite/package.json': { name: 'vite' } });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  const before = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout;
  const dest = path.join(dir, 'power-presentation-out', 'shop-marketing', '.source');
  const r = runCopy(dir, dest);
  assert.ok(fs.existsSync(path.join(dest, 'src', 'main.tsx')) && fs.existsSync(path.join(dest, 'index.html')));
  assert.equal(fs.existsSync(path.join(dest, '.env')), false, '.env is never copied');
  assert.equal(fs.existsSync(path.join(dest, 'certs', 'dev.pem')), false);
  assert.equal(fs.existsSync(path.join(dest, 'power-presentation-out')), false);
  assert.deepEqual(r.linked, ['node_modules']);
  assert.equal(fs.realpathSync(path.join(dest, 'node_modules')), fs.realpathSync(path.join(dir, 'node_modules')));
  assert.ok(r.denied.includes('.env'));
  fs.writeFileSync(path.join(dir, 'power-presentation-out', '.gitignore'), '*\n');
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout.replace(/.*power-presentation-out.*\n/, ''), before.replace(/.*power-presentation-out.*\n/, ''), 'nothing in the repository changed');
});

test('main(): plan writes source-plan.json; usage errors exit 2', () => {
  const dir = repo({ 'site/index.html': PAGE });
  const out = path.join(dir, 'plan.json');
  assert.equal(main(['plan', '--repo', dir, '--out', out]), 0);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).routes.length, 0, 'no profile, no surface: options only');
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).options.web[0].dir, 'site');
  assert.equal(main(['plan']), 2);
  assert.equal(main(['run-copy', '--repo', dir]), 2);
});

const LANDING = '<!doctype html><html><head><title>Gadfly — interview coach</title></head><body><h1>Knowing the answer is not passing the interview.</h1><section>a</section><section>b</section><section>Pricing $12/mo</section><section>FAQ</section><a href="/signup">Start free</a><footer>©</footer></body></html>';
function productRepo(extra = {}) {
  return repo({
    'landing/index.html': LANDING,
    'web/package.json': { name: 'app', scripts: { dev: 'next dev -p 3000' }, dependencies: { next: '15' } },
    'web/node_modules/next/package.json': { name: 'next' },
    'web/app/page.tsx': 'export default () => null',
    'web/app/program/page.tsx': 'x', 'web/app/stats/progress/page.tsx': 'x', 'web/app/session/[id]/page.tsx': 'x',
    'web/app/signin/page.tsx': 'x', 'web/app/landing/page.tsx': 'x', 'web/app/(marketing)/about/page.tsx': 'x',
    'web/lib/api.ts': "export const API = process.env.NEXT_PUBLIC_API ?? 'http://127.0.0.1:8790';\nfetch(`${API}/x`);\n",
    Makefile: 'install:\n\tuv pip install -e .\n\nup: install  ## run everything: backend + web\n\tbash tools/stack.sh up\n\ndown:  ## stop it\n\tbash tools/stack.sh down\n\ndev: install  ## backend on :8790\n\tuvicorn pkg.server:app --port 8790\n\ndocker-up: ## product in containers (db + backend + web) on :3000\n\tdocker compose -f ops/docker-compose.yml up -d\n\ndocker-down:\n\tdocker compose -f ops/docker-compose.yml down\n',
    'tests/e2e_browser/test_marketing_shots.py': 'SCREENS = [("program", "/program", "h1"), ("progress", "/stats/progress", "h1")]\ndef test_capture(capture): capture("/program")\n',
    'tests/e2e_browser/test_session.py': 'def test_x(page):\n    page.goto(f"{base}/signin")\n    page.get_by_role("button").click()\n    page.goto(f"{base}/session/{sid}")\n',
    'var/shots/program.png': 'png', 'var/shots/progress.png': 'png',
    ...extra,
  });
}

test('appRoutes(): screens from the file-system router, groups dropped, auth plumbing marked, dynamic segments kept', () => {
  const dir = productRepo();
  const r = appRoutes(dir, 'web');
  assert.deepEqual(r.map((x) => x.route), ['/', '/about', '/landing', '/program', '/session/[id]', '/signin', '/stats/progress']);
  assert.equal(r.find((x) => x.route === '/signin').auth, true);
  assert.equal(r.find((x) => x.route === '/session/[id]').dynamic, true);
  const kit = repo({ 'app/package.json': { scripts: { dev: 'vite dev' } }, 'app/src/routes/+page.svelte': 'x', 'app/src/routes/login/+page.svelte': 'x', 'app/src/routes/boards/[id]/+page.svelte': 'x' });
  assert.deepEqual(appRoutes(kit, 'app').map((x) => [x.route, x.auth]), [['/', false], ['/boards/[id]', false], ['/login', true]]);
});

test('backendNeeds(): an API env name / loopback port with evidence; an app with its own API routes needs none', () => {
  const dir = productRepo();
  assert.deepEqual(backendNeeds(dir, 'web'), { needs_backend: true, own_api_routes: false, env: ['NEXT_PUBLIC_API'], ports: [8790], evidence: ['web/lib/api.ts:1'] });
  const own = repo({ 'web/lib/api.ts': 'fetch(process.env.NEXT_PUBLIC_API_URL)', 'web/app/api/items/route.ts': 'x' });
  assert.equal(backendNeeds(own, 'web').needs_backend, false);
});

test('startCommands(): documented starts ranked (the web app in the comment, the API port), each with its own stop and whether it installs', () => {
  const s = startCommands(productRepo(), { ports: [8790] });
  assert.deepEqual(s.map((x) => [x.command, x.scope, x.stop, x.installs]), [
    ['make docker-up', 'product', 'make docker-down', false],
    ['make up', 'product', 'make down', true],
    ['make dev', 'backend', null, true],
  ], '`uvicorn pkg.server:app` is a backend: the recipe\'s own words never make it the web app');
  const compose = startCommands(repo({ 'docker-compose.yml': 'services:\n  db:\n    image: pg\n  web:\n    build: .\n' }));
  assert.deepEqual(compose.map((x) => [x.kind, x.command, x.stop]), [['compose', 'docker compose -f docker-compose.yml up -d', 'docker compose -f docker-compose.yml down']]);
});

test('productShots() / e2eFlows(): the product\'s own screenshots; walkthroughs with the paths they visit, screen tables matched to the app\'s routes', () => {
  const dir = productRepo({ 'README.md': '# App\n![dash](docs/dash.png)\n![remote](https://x.io/a.png)\n', 'docs/dash.png': 'png' });
  assert.deepEqual(productShots(dir).map((x) => [x.path, x.from]), [['var/shots/program.png', 'var/shots'], ['var/shots/progress.png', 'var/shots'], ['docs/dash.png', 'README.md']]);
  const flows = e2eFlows(dir, { routes: appRoutes(dir, 'web').map((r) => r.route) });
  assert.deepEqual(flows.map((f) => [f.file, f.screenshots, f.paths]), [
    ['tests/e2e_browser/test_marketing_shots.py', true, ['/program', '/stats/progress']],
    ['tests/e2e_browser/test_session.py', false, ['/signin', '/session/{sid}']],
  ]);
});

test('pageFacts() / urlRole(): a landing by its H1 in the repository or by marketing signals; an app by host/path or app-screen signals; unknown without a page', () => {
  const f = pageFacts(LANDING);
  assert.equal(f.h1, 'Knowing the answer is not passing the interview.');
  assert.ok(f.marketing >= 3);
  const landings = [{ entry: 'landing/index.html', html: LANDING }];
  assert.equal(urlRole({ url: 'https://gadfly.io', heroHtml: LANDING.replace('<footer>©</footer>', ''), landings }).role, 'landing');
  assert.match(urlRole({ url: 'https://gadfly.io', heroHtml: LANDING, landings }).evidence[0], /H1 .* landing\/index\.html/);
  assert.equal(urlRole({ url: 'https://other.io', heroHtml: LANDING, landings: [] }).role, 'landing', 'marketing signals alone');
  assert.equal(urlRole({ url: 'https://app.gadfly.io', heroHtml: LANDING, landings }).role, 'product', 'the host names an app');
  assert.equal(urlRole({ url: 'https://gadfly.io/dashboard', heroHtml: null }).role, 'product');
  assert.equal(urlRole({ url: 'https://x.io', heroHtml: '<html><body><aside class="sidebar">Projects</aside><h2>Dashboard</h2><button>Sign out</button><input type="password"></body></html>' }).role, 'product');
  assert.equal(urlRole({ url: 'https://gadfly.io', heroHtml: null }).role, 'unknown');
});

test('webPortOf() / productApps() / demoOf(): the app (not the landing), its port; raised by the product start and recorded at its URL; not runnable when its backend has no start', () => {
  assert.deepEqual([webPortOf('next dev -p 3001'), webPortOf('vite'), webPortOf('PORT=8080 node s.js'), webPortOf('node s.js')], [3001, 5173, 8080, null]);
  const dir = productRepo();
  const apps = productApps(dir, localWebOptions(dir)).map((a) => ({ ...a, port: 3000 }));
  assert.deepEqual(apps.map((a) => [a.dir, a.gated, a.backend.needs_backend]), [['web', true, true]]);
  const starts = startCommands(dir, { ports: [8790] });
  const d = demoOf(apps[0], starts, []);
  assert.equal(d.runnable, true);
  assert.deepEqual(d.start, { command: 'make docker-up', file: 'Makefile:13', note: 'product in containers (db + backend + web) on :3000', scope: 'product', installs: false, stop: 'make docker-down' });
  assert.match(d.how, /run-copy .*&& \(cd "<P>\/\.source" && make docker-up\) && .*record-flow\.mjs --url http:\/\/127\.0\.0\.1:3000 .* ; \(cd "<P>\/\.source" && make docker-down\)/);
  assert.deepEqual(d.screens, ['/', '/about', '/program', '/session/[id]', '/stats/progress'], 'the app\'s own /landing is not a demo screen');
  assert.deepEqual(d.sign_in, ['/signin']);
  const backendOnly = demoOf(apps[0], starts.filter((x) => x.scope === 'backend'), []);
  assert.match(backendOnly.how, /make dev &\) && .*record-flow\.mjs --local --repo "<P>\/\.source\/web"/, 'a backend start: the app\'s own dev server next to it');
  assert.equal(demoOf(apps[0], [], []).runnable, false, 'needs a backend and none is documented');
});

test('buildPlan() with a landing URL: combined — the landing for the message, the app raised and recorded for the demo, screenshots as fallback, one product-demo question', () => {
  const dir = productRepo();
  const plan = buildPlan(dir, { profile: { surface: 'web-ui', secondary: ['api/backend'] }, url: 'https://gadfly.io', heroHtml: LANDING });
  assert.equal(plan.url_role.role, 'landing');
  const web = plan.routes.find((r) => r.class === 'web-ui');
  assert.equal(web.source, 'combined');
  assert.equal(web.tier, 'A');
  assert.deepEqual([web.message.source, web.message.url, web.message.role], ['prod-url', 'https://gadfly.io', 'landing']);
  assert.deepEqual([web.demo.source, web.demo.dir, web.demo.start.command, web.demo.port], ['local-dev', 'web', 'make docker-up', 3000]);
  assert.deepEqual(web.fallback.shots, ['var/shots/program.png', 'var/shots/progress.png']);
  assert.equal(web.demo.flows[0].file, 'tests/e2e_browser/test_marketing_shots.py');
  assert.match(web.reason, /landing page; the product itself is the app in web\/ \(5 screen\(s\), behind sign-in, needs its backend NEXT_PUBLIC_API :8790\)/);
  assert.equal(plan.questions.length, 1);
  assert.equal(plan.questions[0].id, 'product-demo');
  assert.match(plan.questions[0].text, /\(1\) raise the whole product with `make docker-up` .*\(2\) the app asks for sign-in \(\/signin\).*18|2 screenshot/);
  const prod = buildPlan(dir, { profile: { surface: 'web-ui' }, url: 'https://app.gadfly.io', heroHtml: LANDING });
  assert.notEqual(prod.routes[0].source, 'combined');
  const local = buildPlan(dir, { profile: { surface: 'web-ui' } });
  assert.deepEqual([local.routes[0].source, local.routes[0].message.source, local.routes[0].message.entry], ['combined', 'local-static', 'landing/index.html']);
  const bare = productRepo({ Makefile: 'lint:\n\truff .\n', 'var/shots/program.png': null, 'var/shots/progress.png': null });
  fs.rmSync(path.join(bare, 'var'), { recursive: true, force: true });
  const b = buildPlan(bare, { profile: { surface: 'web-ui' }, url: 'https://gadfly.io', heroHtml: LANDING });
  assert.equal(b.routes[0].tier, 'C');
  assert.deepEqual(b.questions[0].default, { demo: 'reconstruction' });
});

test('readmeCommands(): a list of product commands in one block — each is a command, none is the previous one\'s output', () => {
  const dir = repo({ 'pyproject.toml': '[project]\nname = "sensei"\n[project.scripts]\nsensei = "sensei.cli:main"\n', 'README.md': '```bash\nsensei plan      # what to do now\nsensei drill     # drills\nPlan ready.\n```\n' });
  assert.deepEqual(readmeCommands(dir).map((c) => [c.command, c.output]), [['sensei plan      # what to do now', []], ['sensei drill     # drills', ['Plan ready.']]]);
});
