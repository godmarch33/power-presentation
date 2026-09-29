import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { EXAMPLE_DIRS_RE, readDenied, walkRepo } from './inspect-project.mjs';
import { OUT_DIR } from './workspace.mjs';

export const SCHEMA = 'power-presentation/source-plan@0.1';
export const BUILD_DIRS = Object.freeze(['dist', 'build', 'out', '.output/public', 'public/build']);
export const STATIC_DIRS = Object.freeze(['', 'site', 'www', 'website', 'landing', 'web', 'static', 'public', 'docs']);
const NOT_PRODUCT_HOSTS = /(^|\.)(github\.com|githubusercontent\.com|gitlab\.com|bitbucket\.org|npmjs\.(com|org)|pypi\.org|crates\.io|shields\.io|badgen\.net|codecov\.io|travis-ci\.(com|org)|circleci\.com|opensource\.org|creativecommons\.org|jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|readthedocs\.io|img\.youtube\.com|youtube\.com|twitter\.com|x\.com|discord\.(gg|com)|linkedin\.com|example\.(com|org|net))$/i;
const SHELL_LANGS = /^(bash|sh|shell|console|zsh|terminal|shell-session|sh-session)$/i;

const readText = (abs, max = 512 * 1024) => { try { const st = fs.statSync(abs); if (!st.isFile() || st.size > max) return null; return fs.readFileSync(abs, 'utf8'); } catch { return null; } };
const readJson = (abs) => { try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { return null; } };
const exists = (abs) => { try { fs.accessSync(abs); return true; } catch { return false; } };
const join = (...s) => s.filter((x) => x !== '').join('/');

export function htmlHasContent(html) {
  const body = String(html ?? '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
  if (/<h1[\s>]/i.test(body)) return true;
  return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length >= 300;
}

export function prodUrlHints(repo) {
  const out = [];
  const add = (url, from, strength) => {
    let u;
    try { u = new URL(url); } catch { return; }
    if (!/^https?:$/.test(u.protocol) || NOT_PRODUCT_HOSTS.test(u.hostname) || /^(localhost|127\.|0\.0\.0\.0)/.test(u.hostname)) return;
    const norm = u.href.replace(/\/$/, '');
    if (!out.some((h) => h.url === norm)) out.push({ url: norm, from, strength });
  };
  const pkg = readJson(path.join(repo, 'package.json'));
  if (typeof pkg?.homepage === 'string') add(pkg.homepage, 'package.json:homepage', 'declared');
  const cname = readText(path.join(repo, 'CNAME'))?.split(/\r?\n/)[0]?.trim();
  if (cname && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cname)) add(`https://${cname}`, 'CNAME:1', 'declared');
  const readme = ['README.md', 'readme.md', 'README.mdx', 'README'].map((n) => ({ n, t: readText(path.join(repo, n)) })).find((x) => x.t);
  if (readme) {
    readme.t.split(/\r?\n/).forEach((line, i) => {
      if (!/\b(live|demo|website|web ?site|homepage|try it|try the|app|production|hosted|visit)\b/i.test(line) || /badge|shields\.io|!\[/i.test(line)) return;
      for (const m of line.matchAll(/https?:\/\/[^\s)<>\]"'`]+/g)) add(m[0].replace(/[.,;:]+$/, ''), `${readme.n}:${i + 1}`, 'mentioned');
    });
  }
  return out.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'declared' ? -1 : 1));
}

export function localWebOptions(repo) {
  const out = [];
  const pkgDirs = [''];
  for (const parent of ['apps', 'packages', 'web', 'frontend', 'client', 'site', 'app']) {
    const abs = path.join(repo, parent);
    if (exists(path.join(abs, 'package.json'))) pkgDirs.push(parent);
    else {
      let subs = [];
      try { subs = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory() && !EXAMPLE_DIRS_RE.test(e.name)).map((e) => join(parent, e.name)); } catch { }
      for (const s of subs) if (exists(path.join(repo, s, 'package.json'))) pkgDirs.push(s);
    }
  }
  for (const dir of pkgDirs) {
    const pkg = readJson(path.join(repo, dir, 'package.json'));
    const script = ['dev', 'start'].find((s) => typeof pkg?.scripts?.[s] === 'string');
    if (!script) continue;
    const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
    const installed = exists(path.join(repo, dir, 'node_modules')) || (dir !== '' && exists(path.join(repo, 'node_modules')));
    const runnable = installed || deps.length === 0;
    out.push({ kind: 'dev-server', dir: dir || '.', script, command: `npm run ${script}`, runnable, reason: runnable ? (installed ? 'dependencies installed' : 'no dependencies to install') : 'dependencies are not installed (no node_modules) — the plugin never installs into the repository' });
  }
  for (const dir of BUILD_DIRS) {
    const entry = join(dir, 'index.html');
    if (exists(path.join(repo, entry))) out.push({ kind: 'build-output', dir, entry, runnable: true, reason: 'a built app, served from loopback as it is' });
  }
  for (const dir of STATIC_DIRS) {
    const entry = join(dir, 'index.html');
    if (readDenied(entry) || exists(path.join(repo, dir, 'package.json'))) continue;
    const html = readText(path.join(repo, entry));
    if (html === null) continue;
    if (!htmlHasContent(html)) { out.push({ kind: 'static', dir: dir || '.', entry, runnable: false, reason: 'an app shell with no content — it needs its build or dev server' }); continue; }
    out.push({ kind: 'static', dir: dir || '.', entry, runnable: true, reason: 'a static site with content, served from loopback' });
  }
  return out;
}

export function productBins(repo) {
  const bins = new Set();
  const pkg = readJson(path.join(repo, 'package.json'));
  if (typeof pkg?.bin === 'string' && pkg.name) bins.add(pkg.name.replace(/^@[^/]+\//, ''));
  else if (pkg?.bin && typeof pkg.bin === 'object') for (const k of Object.keys(pkg.bin)) bins.add(k);
  const py = readText(path.join(repo, 'pyproject.toml'));
  const block = py?.match(/^\[project\.scripts\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
  for (const m of block?.matchAll(/^([A-Za-z0-9_.-]+)\s*=/gm) ?? []) bins.add(m[1]);
  try { for (const e of fs.readdirSync(path.join(repo, 'bin'), { withFileTypes: true })) if (e.isFile() && !e.name.startsWith('.')) bins.add(e.name.replace(/\.(js|mjs|cjs|py|sh)$/, '')); } catch { }
  return [...bins].filter(Boolean).sort();
}

export function readmeCommands(repo, bins = productBins(repo), { max = 12 } = {}) {
  const files = ['README.md', 'readme.md', 'README.mdx', 'docs/README.md', 'docs/quickstart.md', 'docs/getting-started.md', 'docs/usage.md'];
  const out = [];
  const binRe = bins.length ? new RegExp(`^(?:\\./)?(?:bin/)?(${bins.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:\\s|$)`) : null;
  for (const f of files) {
    const text = readText(path.join(repo, f));
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    let fence = null;
    for (let i = 0; i < lines.length && out.length < max; i += 1) {
      const open = lines[i].match(/^\s*(```|~~~)\s*([\w-]*)/);
      if (open) { fence = fence ? null : { lang: open[2], at: i }; continue; }
      if (!fence || (fence.lang && !SHELL_LANGS.test(fence.lang))) continue;
      const raw = lines[i].replace(/^\s*[$>]\s+/, '');
      const prompted = /^\s*[$>]\s+/.test(lines[i]);
      if (!raw.trim() || /^(npm|pnpm|yarn|pip3?|pipx|brew|cargo install|go install|apt(-get)?|curl .*\|\s*(ba)?sh|cd|export|source|git clone|sudo)\b/.test(raw.trim())) continue;
      if (!(binRe?.test(raw.trim()) || (prompted && bins.length === 0))) continue;
      const output = [];
      for (let j = i + 1; j < lines.length && !/^\s*(```|~~~)/.test(lines[j]) && !/^\s*[$>]\s+/.test(lines[j]) && !binRe?.test(lines[j].trim()) && output.length < 8; j += 1) if (lines[j].trim()) output.push(lines[j]);
      if (!out.some((c) => c.command === raw.trim())) out.push({ file: f, line: i + 1, command: raw.trim(), output });
    }
  }
  return out;
}

export function repoArtefacts(repo) {
  const walk = walkRepo(repo, { maxDepth: 4, maxFiles: 20000 });
  const usable = walk.files.filter((f) => !f.denied && !f.rel.split('/').slice(0, -1).some((s) => EXAMPLE_DIRS_RE.test(s)));
  return {
    tapes: usable.filter((f) => f.ext === '.tape').map((f) => f.rel),
    specs: usable.filter((f) => /^(openapi|swagger)[\w.-]*\.(ya?ml|json)$/i.test(f.base)).map((f) => f.rel),
  };
}

export const LANDING_DIRS_RE = /^(landing|site|www|website|marketing|homepage|home|promo|docs?)$/i;
export const AUTH_ROUTES_RE = /(^|\/)(sign-?in|sign-?up|log-?in|register|forgot-password|reset-password|confirm-email|verify|oauth|callback|auth)(\/|$)/i;
const SRC_EXT_RE = /\.(tsx?|jsx?|mjs|cjs|vue|svelte)$/;

function listFiles(repo, dir, { maxFiles = 3000, maxDepth = 8 } = {}) {
  const out = [];
  const walk = (rel, depth) => {
    if (out.length >= maxFiles || depth > maxDepth) return;
    let entries = [];
    try { entries = fs.readdirSync(path.join(repo, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!/^(node_modules|\.next|\.nuxt|\.svelte-kit|\.output|dist|build|out|coverage|\.turbo|\.cache)$/.test(e.name) && !e.name.startsWith('.')) walk(r, depth + 1); }
      else if (e.isFile() && !readDenied(r)) out.push(r);
      if (out.length >= maxFiles) return;
    }
  };
  walk(dir === '.' ? '' : dir, 0);
  return out;
}

export function appRoutes(repo, dir) {
  const base = dir === '.' ? '' : `${dir}/`;
  const routes = [];
  const add = (route, file) => {
    const r = `/${route.replace(/\/?index$/, '').replace(/\([^)]*\)\/?/g, '').replace(/\/+$/, '')}`.replace(/\/+/g, '/');
    if (!routes.some((x) => x.route === r)) routes.push({ route: r, file, auth: AUTH_ROUTES_RE.test(r), dynamic: /\[[^\]]+\]/.test(r) });
  };
  for (const f of listFiles(repo, dir)) {
    const rel = base && f.startsWith(base) ? f.slice(base.length) : f;
    let m;
    if ((m = rel.match(/^(?:src\/)?app\/(.*?)\/?page\.(tsx|jsx|ts|js|mdx)$/)) && !/\/api\//.test(`/${m[1]}/`)) add(m[1], f);
    else if ((m = rel.match(/^(?:src\/)?pages\/(.*)\.(tsx|jsx|ts|js)$/)) && !/(^|\/)(_app|_document|_error|api\/)/.test(m[1])) add(m[1], f);
    else if ((m = rel.match(/^src\/routes\/(.*?)\/?\+page\.svelte$/))) add(m[1], f);
    else if ((m = rel.match(/^pages\/(.*)\.vue$/))) add(m[1], f);
  }
  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

export function backendNeeds(repo, dir) {
  const env = new Set();
  const ports = new Set();
  const evidence = [];
  const files = listFiles(repo, dir, { maxFiles: 1500 }).filter((f) => SRC_EXT_RE.test(f) && !/\.(test|spec)\./.test(f));
  const ownApi = files.some((f) => /(^|\/)(src\/)?(app|pages)\/api\//.test(f));
  for (const f of files.slice(0, 1500)) {
    const text = readText(path.join(repo, f), 256 * 1024);
    if (!text || !/API|localhost|127\.0\.0\.1/.test(text)) continue;
    text.split(/\r?\n/).forEach((line, i) => {
      if (evidence.length >= 12) return;
      let hit = false;
      for (const m of line.matchAll(/\b(?:process\.env|import\.meta\.env)\.((?:NEXT_PUBLIC|VITE|REACT_APP|PUBLIC|NUXT_PUBLIC)_[A-Z0-9_]*API[A-Z0-9_]*)/g)) { env.add(m[1]); hit = true; }
      for (const m of line.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/g)) { if (/API|fetch|axios|base|url/i.test(line)) { ports.add(Number(m[1])); hit = true; } }
      if (hit) evidence.push(`${f}:${i + 1}`);
    });
  }
  return { needs_backend: !ownApi && (env.size > 0 || ports.size > 0), own_api_routes: ownApi, env: [...env].sort(), ports: [...ports].sort((a, b) => a - b), evidence };
}

export function startCommands(repo, { ports = [] } = {}) {
  const out = [];
  const mk = readText(path.join(repo, 'Makefile')) ?? readText(path.join(repo, 'makefile'));
  if (mk) {
    const lines = mk.split(/\r?\n/);
    const targets = {};
    lines.forEach((line, i) => {
      const m = line.match(/^([A-Za-z0-9_.-]+)\s*:(?!=)\s*([^#]*?)\s*(?:##\s*(.*))?$/);
      if (!m) return;
      const recipe = [];
      for (let j = i + 1; j < lines.length && /^\t/.test(lines[j]); j += 1) recipe.push(lines[j].trim());
      targets[m[1]] = { line: i + 1, deps: m[2].split(/\s+/).filter(Boolean), comment: m[3] ?? '', recipe: recipe.join(' ; ') };
    });
    const stopOf = (name) => [name.replace(/up$/, 'down'), name.replace(/^start$/, 'stop'), name === 'up' ? 'down' : null].find((t) => t && t !== name && targets[t]) ?? null;
    for (const [name, t] of Object.entries(targets)) {
      if (!/^(up|dev|start|run|serve|demo|stack|all|docker-up|compose-up)$/i.test(name)) continue;
      const text = `${t.comment} ${t.recipe}`;
      const web = /(^|[\s(,+])(web|front(end)?|ui|site|everything|all|stack)(?=$|[\s),+:])/i.test(t.comment) || (/\bapp\b/i.test(t.comment) && !/backend|api/i.test(t.comment)) || /stack\.sh|docker[ -]compose|concurrently|honcho|foreman/i.test(t.recipe);
      const port = ports.find((p) => text.includes(String(p))) ?? null;
      const installs = t.deps.some((d) => /install|venv|deps|setup|bootstrap/i.test(d));
      const stop = stopOf(name) ? `make ${stopOf(name)}` : null;
      const score = (web ? 4 : 0) + (port ? 2 : 0) + (/^(up|stack|demo)$/.test(name) ? 1 : 0) + (stop ? 1 : 0) - (installs ? 2 : 0);
      out.push({ kind: 'make', command: `make ${name}`, file: `Makefile:${t.line}`, note: t.comment || null, scope: web ? 'product' : port ? 'backend' : 'unknown', port, installs, stop, score });
    }
  }
  for (const f of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', 'ops/docker-compose.yml', 'deploy/docker-compose.yml']) {
    const text = readText(path.join(repo, f));
    if (!text) continue;
    const services = [...text.matchAll(/^ {2}([A-Za-z0-9_.-]+):\s*$/gm)].map((m) => m[1]);
    const web = services.some((sv) => /web|front|app|ui|next|vite|client/i.test(sv));
    out.push({ kind: 'compose', command: `docker compose -f ${f} up -d`, file: f, note: `services: ${services.join(', ')}`, scope: web ? 'product' : 'services', port: null, installs: false, stop: `docker compose -f ${f} down`, score: web ? 3 : 0 });
  }
  const proc = readText(path.join(repo, 'Procfile'));
  if (proc) out.push({ kind: 'procfile', command: 'honcho start  # or: foreman start', file: 'Procfile', note: proc.split(/\r?\n/).filter(Boolean).map((l) => l.split(':')[0]).join(', '), scope: 'product', port: null, installs: false, stop: null, score: 3 });
  const pkg = readJson(path.join(repo, 'package.json'));
  for (const [name, cmd] of Object.entries(pkg?.scripts ?? {})) {
    if (/^(dev|start|up)(:all)?$/.test(name) && /concurrently|npm-run-all|turbo|nx |run-p /.test(String(cmd))) out.push({ kind: 'npm', command: `npm run ${name}`, file: 'package.json:scripts', note: String(cmd).slice(0, 120), scope: 'product', port: null, installs: false, stop: null, score: 3 });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function productShots(repo, { max = 40 } = {}) {
  const found = [];
  const seen = new Set();
  const add = (rel, from) => { if (!seen.has(rel) && found.length < max && !readDenied(rel)) { seen.add(rel); found.push({ path: rel, from }); } };
  const walk = (rel, depth) => {
    if (depth > 3) return;
    let entries = [];
    try { entries = fs.readdirSync(path.join(repo, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || /^(node_modules|power-presentation-out|dist|build|out|third_party|vendor)$/.test(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (/^(shots|screenshots?|screens|showcase|marketing-shots)$/i.test(e.name)) {
        let imgs = [];
        try { imgs = fs.readdirSync(path.join(repo, r)).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).sort(); } catch { }
        for (const n of imgs) add(`${r}/${n}`, r);
      } else walk(r, depth + 1);
    }
  };
  walk('', 0);
  const readme = readText(path.join(repo, 'README.md'));
  for (const m of readme?.matchAll(/!\[[^\]]*\]\(([^)\s]+\.(?:png|jpe?g|webp|gif))\)/gi) ?? []) {
    if (!/^https?:/i.test(m[1]) && exists(path.join(repo, m[1]))) add(m[1].replace(/^\.\//, ''), 'README.md');
  }
  return found;
}

export function e2eFlows(repo, { max = 12, routes = [] } = {}) {
  const routeRes = routes.map((r) => new RegExp(`^${r.replace(/[.*+?^${}()|\\]/g, (c) => (c === '[' || c === ']' ? c : `\\${c}`)).replace(/\[[^\]]+\]/g, '[^/]+')}/?$`));
  const out = [];
  const files = walkRepo(repo, { maxDepth: 6, maxFiles: 20000 }).files
    .filter((f) => !f.denied && /(^|\/)(e2e[\w-]*|playwright|cypress|browser[\w-]*|tests?\/[\w-]*browser[\w-]*)\//i.test(f.rel) && /\.(spec|test|cy)\.(t|j)sx?$|^test_[\w-]+\.py$|_test\.py$/.test(f.base));
  for (const f of files) {
    if (out.length >= max) break;
    const text = readText(path.join(repo, f.rel), 256 * 1024);
    if (!text || !/goto\(|visit\(|\.get\(\s*["'`]https?:|navigate|screenshot|capture\(/i.test(text)) continue;
    const visited = [...text.matchAll(/(?:goto|visit|navigate(?:_to)?)\(\s*(?:f?["'`])(?:\{[^}]*\}|\$\{[^}]*\}|https?:\/\/[^/"'`]+)?(\/[^"'`\s)]*)/g)].map((m) => m[1]);
    const listed = routeRes.length ? [...text.matchAll(/["'`](\/[A-Za-z0-9_\-/{}[\]]*)["'`]/g)].map((m) => m[1]).filter((x) => routeRes.some((re) => re.test(x.split(/[?#]/)[0]))) : [];
    const paths = [...new Set([...visited, ...listed])].slice(0, 20);
    if (!paths.length) continue;
    out.push({ file: f.rel, paths, screenshots: /screenshot|\bcapture\(|shots?\b/i.test(`${f.base} ${text.slice(0, 4000)}`), steps: (text.match(/\.(click|fill|type|press|check|select_option|selectOption|get_by_role|getByRole)\(/g) ?? []).length });
  }
  return out.sort((a, b) => Number(b.screenshots) - Number(a.screenshots) || b.paths.length - a.paths.length);
}

export function pageFacts(html) {
  const h = String(html ?? '');
  const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
  const strip = (x) => String(x ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
  const marketing = [/\bpricing\b|\bplans?\b.*\/(mo|month)|\$\d+\s*\/\s*(mo|month)/i, /get started|start (for )?free|free trial|sign up|join (the )?waitlist|book a demo|request (a )?demo|try (it )?(for )?free/i, /testimonial|what (our )?(users|customers) say|trusted by|loved by/i, /\bfaq\b|frequently asked/i, /<footer[\s>]/i]
    .filter((re) => re.test(h)).length + ((h.match(/<section[\s>]/gi) ?? []).length >= 4 ? 1 : 0);
  const app = [/<input[^>]+type=["']?password/i, /\b(dashboard|sign out|log ?out|my account|settings)\b/i, /<(nav|aside)[^>]*(sidebar|side-nav|drawer)/i, /\b(new project|create new|untitled)\b/i]
    .filter((re) => re.test(h)).length;
  return { title: strip(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]), h1: strip(h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]), marketing, app, text_chars: text.length };
}

const norm = (x) => String(x ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

export function appUrlOf(heroHtml, url = null) {
  const h = String(heroHtml ?? '');
  let page = null;
  try { page = url ? new URL(url) : null; } catch { page = null; }
  const other = (v) => { try { const u = new URL(v, page ?? undefined); return /^https?:$/.test(u.protocol) && (!page || u.host !== page.host || /^\/(app|dashboard|console|workspace)(\/|$)/i.test(u.pathname)) ? u : null; } catch { return null; } };
  for (const m of h.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let doc; try { doc = JSON.parse(m[1]); } catch { continue; }
    for (const n of [].concat(doc?.['@graph'] ?? [], Array.isArray(doc) ? doc : [doc])) {
      const t = [].concat(n?.['@type'] ?? []).map(String);
      if (t.some((x) => /^(SoftwareApplication|WebApplication|MobileApplication)$/.test(x)) && typeof n.url === 'string' && other(n.url)) return { url: other(n.url).href, from: 'JSON-LD application url' };
    }
  }
  for (const m of h.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    const u = other(m[1]);
    if (u && (/^(app|dashboard|console|portal|my)\./i.test(u.hostname) || (page && u.host !== page.host && /\/(log-?in|sign-?in)\b/i.test(u.pathname)))) return { url: `${u.origin}/`, from: `a link to ${u.host}` };
  }
  return null;
}

export function urlRole({ url = null, heroHtml = null, landings = [] } = {}) {
  let u = null;
  try { u = url ? new URL(url) : null; } catch { }
  const evidence = [];
  if (u && (/^(app|dashboard|console|portal|my|admin)\./i.test(u.hostname) || /^\/(app|dashboard|console|workspace)(\/|$)/i.test(u.pathname))) return { role: 'product', evidence: [`${u.host}${u.pathname} names an app`] };
  if (!heroHtml) return { role: 'unknown', evidence: ['no saved copy of the page (§ 4: hyperframes capture … -o capture)'] };
  const facts = pageFacts(heroHtml);
  for (const l of landings) {
    const lf = pageFacts(l.html);
    const same = (a, b) => a && b && norm(a).length >= 6 && norm(a) === norm(b);
    if (same(facts.h1, lf.h1) || same(facts.title, lf.title)) return { role: 'landing', evidence: [`the page's ${same(facts.h1, lf.h1) ? `H1 "${facts.h1}"` : `title "${facts.title}"`} is the one of ${l.entry} in the repository`], facts };
  }
  if (facts.marketing >= 2 && facts.marketing > facts.app) evidence.push(`reads like a marketing page (${facts.marketing} signals: pricing / sign-up CTA / testimonials / FAQ / footer / sections)`);
  else if (facts.app >= 2 && facts.app > facts.marketing) return { role: 'product', evidence: [`reads like an app screen (${facts.app} signals: password field / dashboard / sign out / sidebar)`], facts };
  const role = evidence.length ? 'landing' : 'unknown';
  const app = role === 'landing' ? appUrlOf(heroHtml, url) : null;
  return { role, evidence: evidence.length ? evidence : ['neither a landing site of the repository nor clear page signals'], facts, ...(app ? { app_url: app } : {}) };
}

export function productApps(repo, web) {
  const apps = [];
  for (const o of web) {
    if (!['dev-server', 'build-output'].includes(o.kind)) continue;
    const top = String(o.dir).split('/').pop();
    if (LANDING_DIRS_RE.test(top)) continue;
    const routes = o.kind === 'dev-server' ? appRoutes(repo, o.dir) : [];
    const screens = routes.filter((r) => !r.auth);
    if (o.kind === 'dev-server' && routes.length && screens.length < 2 && !routes.some((r) => r.auth)) continue;
    apps.push({ ...o, routes, screens: screens.length, gated: routes.some((r) => r.auth), backend: o.kind === 'dev-server' ? backendNeeds(repo, o.dir) : { needs_backend: false, env: [], ports: [], evidence: [] } });
  }
  return apps.sort((a, b) => b.screens - a.screens);
}

export function webPortOf(script) {
  const t = String(script ?? '');
  const m = t.match(/(?:-p|--port)[\s=]+(\d{2,5})|\bPORT=(\d{2,5})/);
  if (m) return Number(m[1] ?? m[2]);
  if (/\bnext\b|\bnuxt\b|\bremix\b|react-scripts/.test(t)) return 3000;
  if (/\bvite\b|svelte-kit|astro/.test(t)) return /astro/.test(t) ? 4321 : 5173;
  return null;
}

export function demoOf(app, starts = [], flows = []) {
  if (!app) return null;
  const needs = app.backend?.needs_backend === true;
  const product = starts.find((st) => st.scope === 'product');
  const backend = starts.find((st) => st.scope === 'backend' && (!st.port || (app.backend?.ports ?? []).includes(st.port)));
  const start = needs ? (product ?? backend ?? null) : null;
  const src = `<P>/.source${app.dir === '.' ? '' : `/${app.dir}`}`;
  const copy = 'node ${CLAUDE_PLUGIN_ROOT}/scripts/repo-source.mjs run-copy --repo "<REPO>" --dest "<P>/.source"';
  const port = app.port ?? null;
  let how;
  let runnable = app.runnable !== false;
  if (app.kind === 'build-output') how = `node \${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --local --repo "<REPO>/${app.dir}" --flow .media/flow.json --out .media/capture/`;
  else if (needs && !start) { how = null; runnable = false; }
  else if (start?.scope === 'product') how = `${copy} && (cd "<P>/.source" && ${start.command}) && node \${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --url http://127.0.0.1:${port ?? '<app port>'} --flow .media/flow.json --out .media/capture/ ; (cd "<P>/.source" && ${start.stop ?? '<stop what it started, by PID>'})`;
  else if (start) how = `${copy} && (cd "<P>/.source" && ${start.command} &) && node \${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --local --repo "${src}" --flow .media/flow.json --out .media/capture/ ; stop the backend by its PID`;
  else how = `${copy} && node \${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --local --repo "${src}" --flow .media/flow.json --out .media/capture/`;
  return {
    source: app.kind === 'dev-server' ? 'local-dev' : 'local-build', tier: 'A', dir: app.dir, runnable, port,
    screens: (app.routes ?? []).filter((r) => !r.auth && !LANDING_DIRS_RE.test(r.route.split('/').pop())).map((r) => r.route).slice(0, 40),
    sign_in: (app.routes ?? []).filter((r) => r.auth).map((r) => r.route).sort((a, b) => Number(!/sign-?in|log-?in/i.test(a)) - Number(!/sign-?in|log-?in/i.test(b))),
    backend: app.backend ? { needs_backend: needs, env: app.backend.env, ports: app.backend.ports, evidence: app.backend.evidence.slice(0, 6) } : null,
    start: start ? { command: start.command, file: start.file, note: start.note, scope: start.scope, installs: start.installs, stop: start.stop } : null,
    start_alternatives: needs ? starts.filter((st) => st !== start && st.scope !== 'unknown').map((st) => `${st.command} (${st.file}${st.note ? `: ${st.note}` : ''})`).slice(0, 4) : [],
    flows: flows.slice(0, 5).map((f) => ({ file: f.file, paths: f.paths.slice(0, 12), screenshots: f.screenshots })),
    how,
  };
}

export function chooseRoutes({ surface, secondary = [], web, hints, tapes, specs, commands, mode = 'marketing', url = null, role = null, apps = [], starts = [], shots = [], flows = [] }) {
  const classes = [...new Set([surface, ...secondary].filter(Boolean))];
  const routes = [];
  const questions = [];
  const app = apps.find((a) => a.runnable) ?? apps[0] ?? null;
  const landing = web.find((o) => o.kind === 'static' && o.runnable && LANDING_DIRS_RE.test(String(o.dir).split('/').pop()));
  const fallback = shots.length ? { source: 'product-shots', tier: 'B', shots: shots.map((x) => x.path), how: 'the product\'s own screenshots as stills (camera moves, no fake UI), labelled "product screenshots" — tier B' } : null;
  const combined = (message) => {
    const demo = demoOf(app, starts, flows);
    const route = { class: 'web-ui', source: 'combined', tier: demo.runnable ? 'A' : fallback ? 'B' : 'C', message, demo, fallback, reason: `${message.source === 'prod-url' ? `${message.url} is the product's ${message.role === 'landing' ? 'landing page' : 'site (landing or app — unclear)'}` : `${message.entry} is the product's landing page`}; the product itself is the app in ${app.dir}/ (${demo.screens.length} screen(s)${demo.sign_in.length ? ', behind sign-in' : ''}${demo.backend?.needs_backend ? `, needs its backend ${[...demo.backend.env, ...demo.backend.ports.map((x) => `:${x}`)].join(' ')}` : ''}) — the landing gives the promise, the app shows it working` };
    if (demo.start || demo.sign_in.length || !demo.runnable) {
      const parts = [];
      if (demo.start) parts.push(`raise the whole product with \`${demo.start.command}\` (${demo.start.file}${demo.start.note ? `: ${demo.start.note}` : ''}) from a copy in the workspace${demo.start.installs ? ' — it installs its dependencies first (network; refused under --privacy local)' : ''}, record a walkthrough of the app (tier A) and stop it again${demo.start.stop ? ` (\`${demo.start.stop}\`)` : ''}`);
      else if (!demo.runnable) parts.push(`the app in ${app.dir}/ cannot run as it is (${app.reason ?? 'its backend has no documented start'})`);
      if (demo.sign_in.length) parts.push(`the app asks for sign-in (${demo.sign_in.slice(0, 3).join(', ')}): name a demo account to sign in with (the recording masks the password field), or the walkthrough shows what a fresh sign-up sees`);
      questions.push({ id: 'product-demo', class: 'web-ui', text: `The video should show the product, not only its landing page. ${parts.map((x, i) => `(${i + 1}) ${x}`).join('; ')}.${fallback ? ` Otherwise the product scenes use the ${fallback.shots.length} screenshot(s) the repository keeps (${[...new Set(shots.map((x) => x.from))].join(', ')}; tier B).` : ' Otherwise the product scenes are reconstructed from the source (tier C, labelled).'}`, default: demo.runnable ? { demo: 'record', account: null } : { demo: fallback ? 'product-shots' : 'reconstruction' }, counts_toward: 'the § 2 form (its demo question)' });
    }
    return route;
  };
  if (classes.includes('web-ui') && app && url && role?.role !== 'product') {
    routes.push(combined({ source: 'prod-url', url, role: role?.role ?? 'unknown', evidence: role?.evidence ?? [], use: 'hook, promise, CTA, brand tokens and stills — `hyperframes capture <url> -o capture --skip-vision` (§ 4)' }));
  } else if (classes.includes('web-ui') && app && !url && landing) {
    routes.push(combined({ source: 'local-static', entry: landing.entry, dir: landing.dir, use: 'hook, promise, CTA and stills of the landing, served from loopback (`hyperframes capture file://<REPO>/' + landing.entry + ' -o capture --skip-vision`)' }));
  } else if (classes.includes('web-ui') && app?.backend?.needs_backend && !url && app.kind === 'dev-server') {
    const demo = demoOf(app, starts, flows);
    if (demo.runnable) routes.push({ class: 'web-ui', ...demo, fallback, reason: `the app in ${app.dir}/ with its backend raised by \`${demo.start.command}\` (${demo.start.file})` });
  }
  if (classes.includes('web-ui') && !routes.some((r) => r.class === 'web-ui')) {
    const dev = apps.find((a) => a.kind === 'dev-server' && a.runnable && !a.backend?.needs_backend) ?? web.find((o) => o.kind === 'dev-server' && o.runnable && !apps.some((a) => a.dir === o.dir && a.backend?.needs_backend));
    const built = web.find((o) => o.kind === 'build-output');
    const stat = web.find((o) => o.kind === 'static' && o.runnable);
    const declared = hints.find((h) => h.strength === 'declared');
    const idle = web.find((o) => o.kind === 'dev-server' && !o.runnable);
    if (dev) routes.push({ class: 'web-ui', source: 'local-dev', tier: 'A', dir: dev.dir, how: `node \${CLAUDE_PLUGIN_ROOT}/scripts/repo-source.mjs run-copy --repo "<REPO>" --dest "<P>/.source" && node \${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --local --repo "<P>/.source${dev.dir === '.' ? '' : `/${dev.dir}`}" --flow .media/flow.json --out .media/capture/`, reason: `\`${dev.command}\` in ${dev.dir} — ${dev.reason}; it runs from a copy in the workspace, so its caches never land in the repository` });
    else if (built) routes.push({ class: 'web-ui', source: 'local-build', tier: 'A', dir: built.dir, how: `node \${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --local --repo "<REPO>/${built.dir}" --flow .media/flow.json --out .media/capture/`, reason: `the built app in ${built.dir}/ served from loopback (no build is run)` });
    else if (stat) routes.push({ class: 'web-ui', source: 'local-static', tier: 'A', dir: stat.dir, how: `node \${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --local --repo "<REPO>${stat.dir === '.' ? '' : `/${stat.dir}`}" --flow .media/flow.json --out .media/capture/`, reason: `the static site ${stat.entry} served from loopback` });
    else if (declared) routes.push({ class: 'web-ui', source: 'prod-url', tier: 'A', url: declared.url, how: `node \${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --url ${declared.url} --flow .media/flow.json --out .media/capture/`, reason: `nothing in the repository runs without an install; its own ${declared.from} names the production site (prod)` });
    else if (url && role?.role === 'landing') {
      const rebuild = mode === 'marketing';
      const appAt = role.app_url?.url ?? null;
      questions.push({ id: 'product-demo', class: 'web-ui', kind: 'landing-only', ...(appAt ? { app_url: appAt } : {}), text: `${url} is the product's landing page, not the product. How should the video show the product working? (1) ${appAt ? `record the working product at ${appAt} (the landing links to it) — the first source; put a demo account into <P>/.demo-account.json` : 'give the app\'s URL and put a demo account into <P>/.demo-account.json'} — recorded there (tier A); (2) a screen recording of the app you made (--recording, tier B); (3) rebuild the app screens from the screenshots the landing publishes, labelled "Screen images simulated" (tier C); (4) show those screenshots as stills (tier B).`, default: { demo: rebuild ? 'landing-reconstruction' : 'landing-shots' }, counts_toward: 'the § 2 form (its demo question)' });
      routes.push({ class: 'web-ui', source: 'reconstruction', tier: 'C', from: 'landing-screenshots', message: { source: 'prod-url', url, role: 'landing', evidence: role.evidence ?? [], use: 'hook, promise, CTA, brand tokens — the landing, never a product beat (its demo widgets included)' }, how: 'an exact HTML reconstruction of the app screens from the screenshots and copy the landing publishes (`capture/assets/`, capture-chain.md § 6), labelled "Screen images simulated"', stills: 'the same screenshots as tier-B stills — the sales / investors default', reason: `${url} is the product's landing (${(role.evidence ?? []).join('; ') || 'reads like a marketing page'}); the product app is not in this repository and not recorded — product beats stand on its published screens`, needs_confirmation: !rebuild });
    } else {
      const mentioned = hints.find((h) => h.strength === 'mentioned');
      const ask = [idle ? `install the dependencies in ${idle.dir} (\`npm install\`) so \`${idle.command}\` can run` : null, mentioned ? `use ${mentioned.url} (${mentioned.from})` : null, 'give a production or staging URL'].filter(Boolean);
      questions.push({ id: 'web-source', class: 'web-ui', text: `The repository has no web UI the plugin can run as it is. ${ask.map((a, i) => `(${i + 1}) ${a}`).join('; ')}; or (${ask.length + 1}) reconstruct the screens from the source, labelled "Screen images simulated" (tier C).`, default: mentioned ? { source: 'prod-url', url: mentioned.url } : { source: 'reconstruction' }, counts_toward: 'the § 2 form (its demo question)' });
      routes.push({ class: 'web-ui', source: 'reconstruction', tier: 'C', how: 'HTML reconstruction of the product screens from the repository source (tier C, label)', reason: 'nothing runnable, no declared production URL', needs_confirmation: mode !== 'marketing' });
    }
  }
  if (classes.includes('cli') || classes.includes('library/sdk')) {
    if (tapes.length) routes.push({ class: classes.includes('cli') ? 'cli' : 'library/sdk', source: 'vhs-tape', tier: 'A', tapes, how: 'node ${CLAUDE_PLUGIN_ROOT}/scripts/record-terminal.mjs --repo "<REPO>" --out .media/capture/ --frames', reason: `the repository's own tape${tapes.length > 1 ? 's' : ''} ${tapes.join(', ')}` });
    else if (commands.length) routes.push({ class: classes.includes('cli') ? 'cli' : 'library/sdk', source: 'readme-commands', tier: 'B', commands: commands.map((c) => `${c.file}:${c.line}`), how: 'terminal cards of the documented commands and their documented output, labelled "from the docs" — the plugin never runs them', reason: `${commands.length} command(s) documented in ${[...new Set(commands.map((c) => c.file))].join(', ')}` });
    else routes.push({ class: classes.includes('cli') ? 'cli' : 'library/sdk', source: 'code', tier: 'B', how: 'code scenes from the README usage block (non-ui-products.md)', reason: 'no tape and no documented command with its output' });
  }
  if (classes.includes('api/backend') && specs.length) routes.push({ class: 'api/backend', source: 'api-spec', tier: 'B', specs, how: 'api cards built from the spec\'s examples, each field with its file:line, labelled "from the spec" (SKILL § 5)', reason: `${specs.join(', ')}` });
  for (const c of classes) if (!routes.some((r) => r.class === c) && !['web-ui', 'cli', 'library/sdk', 'api/backend'].includes(c)) routes.push({ class: c, source: 'scene-plan', tier: null, how: 'the scenes of product-profile.json for this class (no capture)', reason: 'this class needs no recording' });
  return { routes, questions };
}

export function buildPlan(repo, { profile = null, mode = 'marketing', url = null, heroHtml = null } = {}) {
  const root = path.resolve(repo);
  const surface = profile?.surface ?? null;
  const secondary = Array.isArray(profile?.secondary) ? profile.secondary : [];
  const web = localWebOptions(root);
  const hints = prodUrlHints(root);
  const { tapes, specs } = repoArtefacts(root);
  const bins = productBins(root);
  const commands = readmeCommands(root, bins);
  const apps = productApps(root, web).map((a) => ({ ...a, port: a.kind === 'dev-server' ? webPortOf(readJson(path.join(root, a.dir, 'package.json'))?.scripts?.[a.script]) : null }));
  const starts = startCommands(root, { ports: apps.flatMap((a) => a.backend.ports) });
  const shots = productShots(root);
  const flows = e2eFlows(root, { routes: apps.flatMap((a) => a.routes.map((r) => r.route)) });
  const landings = web.filter((o) => o.kind === 'static' && o.runnable).map((o) => ({ entry: o.entry, html: readText(path.join(root, o.entry)) }));
  const role = url ? urlRole({ url, heroHtml, landings }) : null;
  const { routes, questions } = chooseRoutes({ surface, secondary, web, hints, tapes, specs, commands, mode, url, role, apps, starts, shots, flows });
  return {
    schema: SCHEMA,
    repo: root, surface, secondary, mode, url, url_role: role,
    options: { web, prod_url_hints: hints, tapes, specs, bins, readme_commands: commands, apps: apps.map((a) => ({ dir: a.dir, kind: a.kind, runnable: a.runnable, port: a.port, screens: a.screens, gated: a.gated, routes: a.routes.map((r) => r.route), backend: a.backend })), starts, shots, e2e_flows: flows },
    routes, questions,
    writes_to_repo: false,
    note: 'the repository is read only; a dev server runs from a copy in the workspace (run-copy)',
  };
}

export function runCopy(repo, dest) {
  const root = path.resolve(repo);
  let files = null;
  const g = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (g.status === 0) files = g.stdout.split('\0').filter(Boolean);
  else files = walkRepo(root, { maxFiles: 50000, maxDepth: 12 }).files.map((f) => f.rel);
  const copied = [];
  const denied = [];
  for (const rel of files) {
    if (rel.split('/')[0] === OUT_DIR || rel.split('/').includes('node_modules')) continue;
    if (readDenied(rel)) { denied.push(rel); continue; }
    const src = path.join(root, rel);
    let st;
    try { st = fs.lstatSync(src); } catch { continue; }
    if (!st.isFile()) continue;
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.copyFileSync(src, path.join(dest, rel));
    copied.push(rel);
  }
  const linked = [];
  for (const dir of ['', ...new Set(copied.filter((f) => path.posix.basename(f) === 'package.json').map((f) => path.posix.dirname(f)).filter((d) => d !== '.'))]) {
    const nm = path.join(root, dir, 'node_modules');
    const to = path.join(dest, dir, 'node_modules');
    if (exists(nm) && !exists(to)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.symlinkSync(nm, to, 'dir'); linked.push(join(dir, 'node_modules')); }
  }
  return { dest: path.resolve(dest), copied: copied.length, denied, linked };
}

export const USAGE = `Usage:
  node scripts/repo-source.mjs plan     --repo <dir> [--profile product-profile.json] [--mode marketing|sales|investors]
                                        [--url <declared url> --hero capture/extracted/page.html] [--out source-plan.json] [--json]
  node scripts/repo-source.mjs run-copy --repo <dir> --dest <dir>

plan: how the repository can show its product — dev server, built app, static site, declared production URL, VHS
tapes, README commands, API specs, and the product app behind a landing page (its screens, the backend it needs, the
documented start / stop, its own screenshots and browser walkthroughs) — and the route per scene class; with --url the
URL is classified (landing / product) and a landing is combined with the app; reads only.
run-copy: the repository's files (no .env / keys / power-presentation-out) in <dest> with node_modules linked, for a dev
server to run in without writing into the repository.`;

export function main(argv = process.argv.slice(2)) {
  const o = { command: null, repo: null, profile: null, mode: 'marketing', out: null, dest: null, json: false, url: null, hero: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--repo') o.repo = argv[++i];
    else if (a === '--profile') o.profile = argv[++i];
    else if (a === '--mode' || a === '--for') o.mode = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--dest') o.dest = argv[++i];
    else if (a === '--url') o.url = argv[++i];
    else if (a === '--hero') o.hero = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') { console.log(USAGE); return 0; }
    else if (!o.command && ['plan', 'run-copy'].includes(a)) o.command = a;
    else { console.error(`unknown argument ${a}\n${USAGE}`); return 2; }
  }
  if (!o.command || !o.repo || (o.command === 'run-copy' && !o.dest)) { console.error(USAGE); return 2; }
  if (!exists(o.repo)) { console.error(`repo-source: ${o.repo} does not exist`); return 2; }
  try {
    if (o.command === 'run-copy') {
      const r = runCopy(o.repo, o.dest);
      console.log(o.json ? JSON.stringify(r, null, 2) : `run copy: ${r.copied} file(s) → ${r.dest}; node_modules linked: ${r.linked.join(', ') || 'none'}; left out: ${r.denied.length}`);
      return 0;
    }
    const plan = buildPlan(o.repo, { profile: o.profile ? readJson(path.resolve(o.profile)) : null, mode: o.mode, url: o.url, heroHtml: o.hero ? readText(path.resolve(o.hero), 4 * 1024 * 1024) : null });
    if (o.out) fs.writeFileSync(path.resolve(o.out), `${JSON.stringify(plan, null, 2)}\n`);
    if (o.json || !o.out) console.log(JSON.stringify(plan, null, 2));
    else console.log(`source plan → ${o.out}: ${plan.routes.map((r) => `${r.class}: ${r.source}${r.tier ? ` (tier ${r.tier})` : ''}`).join('; ') || 'no route'}${plan.questions.length ? `; ${plan.questions.length} question(s)` : ''}`);
    return 0;
  } catch (err) { console.error(`repo-source: ${err.message}`); return 1; }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
