import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLUGIN_VERSION } from './lib/versions.mjs';
import { walkRepo, readDenied, READ_DENY, EXAMPLE_DIRS_RE } from './inspect-project.mjs';

export const STORY_SCHEMA = 'power-presentation/story-extraction@0.1';
export const CLAIMS_SCHEMA = 'power-presentation/claims-index@0.1';

export const SOURCE_ORDER = Object.freeze(['product-screens', 'e2e-tests', 'readme', 'changelog', 'hero-page', 'testimonials']);

export const SCORING = Object.freeze([
  { rule: 'product-screen', points: 3, source: 'owner decision 2026-09-28 (the working product first)', where: 'an action the running product offers on a recorded screen (a button — record-flow screens.jsonl)' },
  { rule: 'product-heading', points: 2, source: 'owner decision 2026-09-28 (the working product first)', where: 'a heading of a recorded screen (the product has that screen or panel)' },
  { rule: 'readme-example', points: 2, source: 'the README usage example', where: 'first Usage / Quick start code block of README' },
  { rule: 'changelog-added', points: 2, source: 'the latest Added block of the CHANGELOG', where: 'entries of the latest `### Added` block of CHANGELOG' },
  { rule: 'e2e-test', points: 1, source: 'owner decision 2026-09-28 (the repository\'s code before the landing)', where: 'titles of e2e tests that act on the product (not auth / smoke / navigation plumbing)' },
  { rule: 'first-feature-section', points: 1, source: 'owner decision 2026-09-28 (+2 → +1: the landing last)', where: 'items of the first feature section of the hero page' },
  { rule: 'h1', points: 1, source: 'owner decision 2026-09-28 (+3 → +1: the H1 is the promise, it never outweighs the product)', where: 'hero page <h1> / README H1 when no hero page exists' },
  { rule: 'readme-media-subject', points: 0, source: 'evidence only', where: 'alt text of the first README GIF / screenshot' },
  { rule: 'readme-example-unrelated', points: 0, source: 'owner decision 2026-09-28 (with the H1 at +1 an unrelated command would win)', where: 'a README code block that names neither the product, its package, its binary nor the document it sits in' },
  { rule: 'e2e-plumbing', points: 0, source: 'candidate only', where: 'titles of e2e tests that exercise plumbing (auth, smoke, navigation, error pages)' },
]);

export const TIE_BREAKS = Object.freeze([
  { id: 'feature-over-promise', source: 'owner decision 2026-09-28', rule: 'a candidate with feature evidence (a product screen, the repository, a feature section) wins over one that only the H1 names' },
  { id: 'state-change', source: 'visible state change', rule: 'more visible state-change evidence wins' },
  { id: 'source-count', source: 'heuristic', rule: 'more distinct sources win' },
  { id: 'source-order', source: 'source precedence (owner decision 2026-09-28; order reversed for facts)', rule: 'earlier first source wins: the running product → e2e tests → README → CHANGELOG → hero page → testimonials' },
  { id: 'position', source: 'heuristic (the item the team leads with)', rule: 'earlier position inside that source wins' },
  { id: 'name', source: 'determinism', rule: 'lexicographic name' },
]);

export const MAX_HERO_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_BYTES = 512 * 1024;
export const MAX_TESTIMONIAL_FILES = 20;
export const MAX_E2E_FILES = 40;
export const MAX_LOGO_FILES = 60;
export const MAX_CLAIMS = 300;
export const MAX_ALTERNATIVES = 12;
export const MAX_CARD_BLOCKS = 2000;
export const FETCH_TIMEOUT_MS = 15000;

export const USAGE = `Usage: node scripts/extract-story.mjs [--repo <dir>] [--url <prod-url>] [--hero <file>] [--fetch]
                                       [--profile product-profile.json] [--claims <file>] [--metrics <csv>]
                                       [--screens .media/capture/screens.jsonl] [--url-role landing|product|unknown]
                                       [--out story-extraction.yaml] [--claims-out claims-index.json]
                                       [--print] [--strict] [--max-files 20000] [--max-depth 8]
       node scripts/extract-story.mjs ... --fetch [--privacy local|default]
       node scripts/extract-story.mjs --list-scoring
       node scripts/extract-story.mjs --help

Writes story-extraction.yaml (every field with file:line or URL provenance; hero feature by the
scoring) and claims-index.json (every number, logo and quote with a source; declared
claims without one are \`unverified\` and listed in \`gaps\` — QA-12). Sources by precedence (owner decision
2026-09-28): the running product (--screens, record-flow's screens.jsonl), e2e tests, README, CHANGELOG, the hero
page, testimonials; the promise and the CTA stay landing-first. With --url-role landing, a recorded screen on the
--url itself is the landing, not the product, and is skipped. Never opens.env*, *.pem, fixtures or key files;
never touches the network unless --fetch is given outside the privacy profile.
Exit: 0 ok (gaps are normal), 1 runtime failure, 2 usage error / refused fetch, 3 --strict with unverified claims.`;

export function parseArgs(argv) {
  const opts = {
    repo: process.cwd(), url: null, hero: null, fetch: false, profile: null, claims: null, metrics: null, screens: null, urlRole: null,
    out: 'story-extraction.yaml', claimsOut: 'claims-index.json', print: false, strict: false, privacy: null,
    maxFiles: 20000, maxDepth: 8, listScoring: false, help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--list-scoring') opts.listScoring = true;
    else if (a === '--print') opts.print = true;
    else if (a === '--strict') opts.strict = true;
    else if (a === '--fetch') opts.fetch = true;
    else if (a === '--privacy') { const v = next(); if (v !== 'local' && v !== 'default') throw new Error('--privacy takes local | default'); opts.privacy = v; }
    else if (a === '--repo') opts.repo = path.resolve(next());
    else if (a === '--url') opts.url = next();
    else if (a === '--hero') opts.hero = path.resolve(next());
    else if (a === '--screens') opts.screens = path.resolve(next());
    else if (a === '--url-role') { const v = next(); if (!/^(landing|product|unknown)$/.test(v)) throw new Error('--url-role takes landing | product | unknown'); opts.urlRole = v; }
    else if (a === '--profile') opts.profile = path.resolve(next());
    else if (a === '--claims') opts.claims = path.resolve(next());
    else if (a === '--metrics') opts.metrics = path.resolve(next());
    else if (a === '--out') opts.out = next();
    else if (a === '--claims-out') opts.claimsOut = next();
    else if (a === '--max-files' || a === '--max-depth') {
      const v = Number.parseInt(next(), 10);
      if (!Number.isInteger(v) || v < 1) throw new Error(`${a} needs a positive integer`);
      if (a === '--max-files') opts.maxFiles = v; else opts.maxDepth = v;
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (opts.url !== null) {
    let parsed;
    try { parsed = new URL(opts.url); } catch { throw new Error(`--url is not a valid URL: ${opts.url}`); }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error(`--url must be http(s): ${opts.url}`);
  }
  if (opts.fetch && opts.url === null) throw new Error('--fetch needs --url');
  if (opts.fetch && opts.hero !== null) throw new Error('--fetch and --hero are exclusive: the snapshot already is the page');
  return opts;
}

export function privacyLocal(env = process.env, flag = null) {
  if (flag === 'local') return true;
  if (flag === 'default') return false;
  return String(env.CLAUDE_PLUGIN_OPTION_PRIVACY ?? '').toLowerCase() === 'local' || String(env.POWER_PRESENTATION_PRIVACY ?? '').toLowerCase() === 'local';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', times: '×', euro: '€', pound: '£', dollar: '$' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

export function cleanText(s) {
  return decodeEntities(String(s))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^{}\n]{0,80}\}/g, ' ')
    .replace(/[*_`]{1,3}(?=\S)|(?<=\S)[*_`]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const BLOCK_TAGS = 'address|article|aside|blockquote|dd|div|dl|dt|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul|img|a|button|q|cite|span';
export function relineHtml(html) {
  const s = String(html);
  const lines = s.split('\n');
  if (lines.length > 1 && s.length / lines.length <= 300) return s;
  return s.replace(new RegExp(`(?<!\\n)\\s*(?=<(?:${BLOCK_TAGS})\\b)`, 'gi'), '\n').replace(new RegExp(`(?<!\\n)\\s*(?=</(?:${BLOCK_TAGS})\\s*>)`, 'gi'), '\n');
}

export function blankNoise(html) {
  const keepLines = (m) => m.replace(/[^\n]/g, ' ');
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, keepLines)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, keepLines)
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, keepLines)
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, keepLines)
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, keepLines);
}

const LINE_CACHE = [];
function lineStarts(text) {
  for (const e of LINE_CACHE) if (e.text === text) return e.starts;
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  LINE_CACHE.push({ text, starts });
  if (LINE_CACHE.length > 8) LINE_CACHE.shift();
  return starts;
}

export function lineAt(text, offset) {
  const starts = lineStarts(text);
  const target = Math.max(0, Math.min(offset, text.length));
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= target) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

const STOP = new Set(('the a an and or of to in on for with your you our we it is are be by at from as that this into via per not no all any every without within now new more less than just only one first last also so can will get use using run runs make makes their its his her they them there here what which who when how why do does did done has have had been being was were i my me us up out over under about after before again off then once here very s t').split(' '));

export function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && /(?:s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokens(s) {
  const out = [];
  const seen = new Set();
  for (const raw of cleanText(s).toLowerCase().replace(/[^a-z0-9%€$£₴×+.]+/g, ' ').split(' ')) {
    const w = raw.replace(/^\.+|\.+$/g, '');
    if (!w || STOP.has(w)) continue;
    const t = /^[a-z]/.test(w) ? stem(w) : w;
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

export function sameFeature(aTokens, bTokens) {
  const a = new Set(aTokens);
  let shared = 0;
  for (const t of bTokens) if (a.has(t)) shared += 1;
  const min = Math.min(aTokens.length, bTokens.length);
  const max = Math.max(aTokens.length, bTokens.length);
  if (min === 0) return false;
  if (shared >= 3) return true;
  if (min === 1) return max === 1 && shared === 1;
  return shared >= 2 && shared / min >= 0.6 && shared / max >= 0.3;
}

function truncate(s, n = 160) {
  const t = cleanText(s);
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

const CURRENCY = '(?:EUR|USD|GBP|CHF|CAD|AUD|UAH|PLN|JPY|\\$|€|£|₴|¥)';
const MEASURE_UNITS = '(?:%|percent|×|x|times|ms|msec|s|sec|seconds?|min|mins|minutes?|h|hrs?|hours?|days?|weeks?|months?|years?|yrs?|MB|GB|TB|KB|fps|px|wpm|rpm|qps|rps|ops)';
const COUNT_NOUNS = '(?:teams?|users?|customers?|clients?|companies|company|developers?|devs|engineers?|founders?|startups?|orgs?|organi[sz]ations?|installs?|installations?|downloads?|stars?|forks?|contributors?|releases?|commits?|countries|languages?|integrations?|requests?|events?|transactions?|invoices?|reports?|projects?|repos?|repositories|people|members?|employees?|seats?|sites?|websites?|pages?|files?|jobs?|tasks?|deals?|leads?|calls?|messages?|emails?|entities|accounts?|plans?|apps?|agencies|brands?|stores?|merchants?|sellers?|buyers?|partners?|workspaces?|servers?|nodes?|clusters?|models?|datasets?|rows?|records?|queries|documents?|videos?|images?|assets?|tests?|checks?|deploys?|deployments?|builds?|pipelines?|endpoints?|tickets?|issues?|bugs?|sessions?|visits?|visitors?|subscribers?|readers?|students?|patients?|doctors?|drivers?|riders?|orders?|shipments?|payments?|reviews?|pageviews?|views?|signups?|sign-ups|trials?|bookings?|courts?|venues?|locations?|branches?|devices?|machines?|containers?|functions?|calls?)';
const NUM = '(?:\\d{1,3}(?:[,\\u00a0\\u202f ]\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const SIGN = '(?:[-−+](?=\\d))?';
const WORD_SCALE = '(?:k|K|M|B|bn|mn|thousand|million|billion)';
const NO_LEAD = '(?<![\\w.:/\\u00a0\\u202f-])';

export const NUMBER_PATTERNS = Object.freeze([
  { id: 'duration', re: new RegExp(`${NO_LEAD}(\\d+)\\s?(h|hr|hrs)\\s?(\\d{1,2})\\s?(m|min|mins)(?![\\w-])|${NO_LEAD}(\\d+)\\s?(m|min|mins)\\s?(\\d{1,2})\\s?(s|sec)(?![\\w-])`, 'g'), source: 'heuristic: compound durations ("3m 41s", "1h 20m") are one visible token' },
  { id: 'range', re: new RegExp(`${NO_LEAD}(${SIGN}${NUM})\\s?[-–—]\\s?(${SIGN}${NUM})\\s?(${MEASURE_UNITS}|${COUNT_NOUNS})(?![\\w-])`, 'g'), source: 'heuristic: a range ("15–25 %", "3-5 days") is one visible token; `number` is the low end, `range` holds both' },
  { id: 'currency', re: new RegExp(`${NO_LEAD}${CURRENCY}\\s?(${SIGN}${NUM})\\s?(${WORD_SCALE})?(?![\\w])`, 'g'), source: 'proof inventory (currency)' },
  { id: 'currency-after', re: new RegExp(`${NO_LEAD}(${SIGN}${NUM})\\s?(${WORD_SCALE})?\\s?(EUR|USD|GBP|CHF|CAD|AUD|UAH|PLN|€|£|₴)(?![\\w])`, 'g'), source: 'proof inventory (currency)' },
  { id: 'plus', re: new RegExp(`${NO_LEAD}(${NUM})\\s?(${WORD_SCALE})?\\+(?![\\w])`, 'g'), source: 'proof inventory (N+)' },
  { id: 'measure', re: new RegExp(`${NO_LEAD}(${SIGN}${NUM})\\s?(?:-\\s?)?(${MEASURE_UNITS})(?![\\w-])`, 'g'), source: 'proof inventory (unit)' },
  { id: 'scaled', re: new RegExp(`${NO_LEAD}(${SIGN}${NUM})\\s?(${WORD_SCALE})(?![\\w-])(?:\\s(?:[A-Za-z][A-Za-z-]*\\s)?(${COUNT_NOUNS})(?![\\w-]))?`, 'g'), source: 'proof inventory (scaled: 21k, 1.5 million downloads)' },
  { id: 'count', re: new RegExp(`${NO_LEAD}(${SIGN}${NUM})\\s?(?:[A-Za-z][A-Za-z-]*\\s)?(${COUNT_NOUNS})(?![\\w-])`, 'g'), source: 'proof inventory (count noun)' },
  { id: 'large', re: new RegExp(`${NO_LEAD}(\\d{1,3}(?:[,\\u00a0\\u202f ]\\d{3})+|\\d{5,})(?![\\w.,:/-])`, 'g'), source: 'heuristic: a thousands-separated or ≥ 5-digit count reads as a claim' },
]);

const UNIT_CANON = { percent: '%', '×': 'x', times: 'x', msec: 'ms', sec: 's', second: 's', seconds: 's', mins: 'min', minute: 'min', minutes: 'min', h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h', day: 'days', days: 'days', week: 'weeks', weeks: 'weeks', month: 'months', months: 'months', year: 'years', years: 'years', yr: 'years', yrs: 'years', kb: 'KB', mb: 'MB', gb: 'GB', tb: 'TB' };
const SCALE = { k: 1e3, K: 1e3, M: 1e6, B: 1e9, bn: 1e9, mn: 1e6, thousand: 1e3, million: 1e6, billion: 1e9 };
const RUNTIME_BEFORE_RE = /\b(?:node(?:\.?js)?|python|ruby|php|java|go|golang|rust|dotnet|\.net|ios|android|macos|windows|ubuntu|debian|react|vue|angular|django|rails|postgres(?:ql)?|mysql|redis|typescript|es|ecmascript|chrome|firefox|safari|edge|kubernetes|k8s|docker|sdk|api\s+v?)\s?$/i;

export function canonicalNumber(digits, scale = null) {
  const n = Number.parseFloat(String(digits).replace(/[,\u00a0\u202f ]/g, '').replace(/^−/, '-'));
  if (!Number.isFinite(n)) return null;
  const f = scale ? SCALE[scale] ?? SCALE[String(scale).toLowerCase()] : null;
  return f ? n * f : n;
}

function canonicalUnit(u) {
  if (!u) return null;
  if (UNIT_CANON[u] !== undefined) return UNIT_CANON[u];
  const k = u.toLowerCase();
  if (UNIT_CANON[k] !== undefined) return UNIT_CANON[k];
  return /^[A-Z]{1,3}$/.test(u) ? u : k;
}

function skipNumber(line, start, end, patternId) {
  const before = line.slice(Math.max(0, start - 14), start);
  const after = line.slice(end, end + 12);
  const text = line.slice(start, end);
  if (/\bv(?:ersion)?\s?$/i.test(before) || /^\.\d/.test(after)) return true;
  if (/^\s*:\s*\d/.test(after) || /\d:\s*$/.test(before)) return true;
  if (/^(19|20)\d\d$/.test(text.trim())) return true;
  if (/#\s*$/.test(before) || /\b(?:issue|pr|rfc|iso|soc|fr|nfr|qa|gs|cve|rfc|ticket|no|nr|№)[-\s.]?$/i.test(before)) return true;
  if (/^\s*(?:[-–]\s*)?(?:19|20)\d\d\b/.test(after) && /^\d{1,2}$/.test(text.trim())) return true;
  if (/\d[\u00a0\u202f ]$/.test(before) && /^\d{3}\b/.test(text)) return true;
  if (patternId === 'plus' && RUNTIME_BEFORE_RE.test(before)) return true;
  return false;
}

export function numbersInLine(line) {
  const found = [];
  const taken = [];
  const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
  const clean = (v) => v.replace(/\s+/g, ' ').trim();
  for (const p of NUMBER_PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end) || skipNumber(line, start, end, p.id)) continue;
      let value = clean(m[0]); let number; let unit; let unitKind; let range;
      if (p.id === 'duration') {
        if (m[1] !== undefined) { number = Number(m[1]) * 60 + Number(m[3]); unit = 'min'; } else { number = Number(m[5]) * 60 + Number(m[7]); unit = 's'; }
        unitKind = 'measure';
      } else if (p.id === 'range') {
        const u = m[3];
        const isMeasure = new RegExp(`^${MEASURE_UNITS}$`).test(u);
        number = canonicalNumber(m[1]);
        range = [canonicalNumber(m[1]), canonicalNumber(m[2])];
        unit = isMeasure ? canonicalUnit(u) : u.toLowerCase();
        unitKind = isMeasure ? 'measure' : 'count';
        if (!isMeasure) value = clean(m[0].slice(0, m[0].length - u.length));
      } else if (p.id === 'currency') {
        const cur = m[0].match(new RegExp(CURRENCY))[0];
        number = canonicalNumber(m[1], m[2] ?? null);
        unit = cur;
        unitKind = 'currency';
      } else if (p.id === 'currency-after') {
        number = canonicalNumber(m[1], m[2] ?? null);
        unit = m[3];
        unitKind = 'currency';
      } else if (p.id === 'measure') {
        number = canonicalNumber(m[1]);
        unit = canonicalUnit(m[2]);
        unitKind = 'measure';
      } else if (p.id === 'scaled') {
        number = canonicalNumber(m[1], m[2]);
        unit = m[3] ? m[3].toLowerCase() : null;
        unitKind = m[3] ? 'count' : 'scaled';
        value = clean(m[0].slice(0, m[0].indexOf(m[2], m[1].length) + m[2].length));
      } else if (p.id === 'count') {
        number = canonicalNumber(m[1]);
        unit = m[2].toLowerCase();
        unitKind = 'count';
        value = clean(m[1]);
      } else if (p.id === 'plus') {
        number = canonicalNumber(m[1], m[2] ?? null);
        unit = '+';
        unitKind = 'plus';
      } else {
        number = canonicalNumber(m[1]);
        unit = null;
        unitKind = 'bare';
      }
      taken.push([start, end]);
      found.push({ value, number, unit, unit_kind: unitKind, pattern: p.id, start, end, ...(range ? { range } : {}) });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`(?<![\\w-])${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : null;
}

function elements(html, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push({ attrs: m[1], inner: m[2], start: m.index, end: m.index + m[0].length, line: lineAt(html, m.index), text: cleanText(m[2]) });
  return out;
}

function nestedBlocks(html, tag) {
  const open = new RegExp(`<${tag}\\b[^>]*>|<\\/${tag}\\s*>`, 'gi');
  const out = [];
  const stack = [];
  let m;
  while ((m = open.exec(html)) !== null) {
    if (m[0][1] !== '/') stack.push({ start: m.index, attrs: m[0] });
    else if (stack.length > 0) {
      const o = stack.pop();
      out.push({ attrs: o.attrs, start: o.start, end: m.index + m[0].length, inner: html.slice(o.start + o.attrs.length, m.index), line: lineAt(html, o.start), depth: stack.length });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const APP_TYPES = /^(SoftwareApplication|WebApplication|MobileApplication|Product|Service|VideoGame)$/;
export function pageEssence(raw, item) {
  const out = { app: null, org: null, site: null, videos: [], steps: [] };
  const text = (v) => (typeof v === 'string' ? cleanText(v) : null);
  const types = (n) => [].concat(n?.['@type'] ?? []).map(String);
  for (const m of String(raw).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let doc;
    try { doc = JSON.parse(m[1]); } catch { continue; }
    const base = m.index + m[0].indexOf(m[1]);
    const lineOf = (needle) => { const i = typeof needle === 'string' ? m[1].indexOf(needle) : -1; return lineAt(raw, i >= 0 ? base + i : base); };
    const nodes = [].concat(doc?.['@graph'] ?? [], Array.isArray(doc) ? doc : [doc]).filter((n) => n && typeof n === 'object');
    for (const n of nodes) {
      const t = types(n);
      const name = text(n.name);
      const desc = text(n.description);
      const at = (field) => item(field === 'name' ? name : desc, lineOf(JSON.stringify(n[field] ?? '').slice(1, 40)));
      if (t.some((x) => APP_TYPES.test(x)) && !out.app && (name || desc)) {
        const cat = text(n.applicationSubCategory) ?? text(n.applicationCategory) ?? text(n.category);
        out.app = {
          type: t.find((x) => APP_TYPES.test(x)),
          name: name ? at('name') : null,
          description: desc ? at('description') : null,
          category: cat ? item(cat, lineOf(cat)) : null,
          url: typeof n.url === 'string' ? item(n.url, lineOf(n.url)) : null,
          features: [].concat(n.featureList ?? []).flatMap((f) => (typeof f === 'string' ? f.split(/\s*[\n;]\s*/) : [])).map(text).filter(Boolean).map((f) => item(truncate(f, 200), lineOf(f.slice(0, 40)))),
        };
      } else if (t.includes('Organization') && !out.org && (name || desc)) out.org = { name: name ? at('name') : null, description: desc ? at('description') : null };
      else if (t.includes('WebSite') && !out.site && name) out.site = { name: at('name') };
      else if (t.includes('VideoObject') && (name || desc)) {
        const iso = typeof n.duration === 'string' ? n.duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/) : null;
        const url = typeof n.contentUrl === 'string' ? n.contentUrl : (typeof n.embedUrl === 'string' ? n.embedUrl : null);
        out.videos.push({ name: name ?? null, description: desc ? at('description') : null, duration_s: iso ? (Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0)) || null : null, url, from: 'ld:VideoObject', ...item(name ?? desc, lineOf(name ?? desc)) });
      }
    }
  }
  const html = blankNoise(raw);
  for (const f of [...nestedBlocks(html, 'figure'), { attrs: '', inner: html, start: 0, line: 1, whole: true }]) {
    for (const v of elements(f.inner, 'video')) {
      const src = attr(`<x ${v.attrs}>`, 'src') ?? (v.inner.match(/<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? null);
      const label = attr(`<x ${v.attrs}>`, 'aria-label') ?? attr(`<x ${v.attrs}>`, 'title');
      const cap = f.whole ? null : elements(f.inner, 'figcaption')[0]?.text ?? null;
      if (!label && !cap) continue;
      const line = f.line + lineAt(f.inner, v.start) - 1;
      const same = out.videos.find((x) => (src && x.url === src) || x.line === line);
      if (same) { same.label ??= label ? item(cleanText(label), line) : null; same.caption ??= cap; continue; }
      out.videos.push({ name: null, description: null, duration_s: null, url: src, from: 'video', label: label ? item(cleanText(label), line) : null, caption: cap, ...item(cleanText(label ?? cap), line) });
    }
  }
  for (const b of [...nestedBlocks(html, 'div'), ...nestedBlocks(html, 'ol'), ...nestedBlocks(html, 'section')].sort((x, y) => x.start - y.start)) {
    const label = `${attr(b.attrs, 'id') ?? ''} ${attr(b.attrs, 'class') ?? ''}`;
    if (!/(^|[\s_-])(steps|how-?it-?works|process|workflow)($|[\s_-])/i.test(label)) continue;
    const heads = [...elements(b.inner, 'h3'), ...elements(b.inner, 'h4')].filter((h) => h.text).sort((x, y) => x.start - y.start);
    const lis = heads.length >= 3 ? [] : elements(b.inner, 'li').filter((l) => l.text);
    const picked = heads.length >= 3 ? heads : lis;
    if (picked.length < 3) continue;
    out.steps = picked.map((h, i) => {
      const next = picked[i + 1]?.start ?? b.inner.length;
      const p = heads.length >= 3 ? elements(b.inner.slice(h.end, next), 'p')[0]?.text ?? null : null;
      return { ...item(truncate(h.text, 120), b.line + lineAt(b.inner, h.start) - 1), detail: p ? truncate(p, 200) : null };
    });
    out.steps_block = item(label.trim(), b.line);
    break;
  }
  return out;
}

export function listedParts(sentence) {
  const s = String(sentence ?? '');
  const body = s.includes(':') ? s.slice(s.indexOf(':') + 1) : s;
  const first = body.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]\s*$/, '');
  const parts = first.split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+(?=[^,]*$)/).map((p) => p.trim()).filter((p) => p && p.split(/\s+/).length <= 8);
  return parts.length >= 3 ? parts : [];
}

const FEATURE_SECTION_RE = /feature|benefit|capabilit|what-|what_|whatwedo|how-it|how_it|solution|product|why-|why_|use-?cases?/i;
const PROOF_SECTION_RE = /testimonial|proof|customer|quote|review|love|trusted|logos?|clients?|partners?|press|case-?stud|❤|♥|say about|saying|stories|voices|wall-of|used by/i;
const CTA_HREF_RE = /sign-?up|register|trial|start|demo|get-?started|download|install|join|pricing|buy|subscribe|book|contact|waitlist|early-?access|try/i;
const CTA_TEXT_RE = /^(start|try|get|sign|book|download|install|join|request|create|begin|launch|schedule|see|watch|explore|buy|subscribe|claim|reserve|apply|open|build|deploy|talk|contact|upgrade|go)\b/i;

export function parseHeroHtml(raw, ref, { isUrl = false, snapshotRef = null } = {}) {
  const html = blankNoise(raw);
  const src = (line) => (isUrl ? ref : `${ref}:${line}`);
  const snap = (line) => (isUrl && snapshotRef ? `${snapshotRef}:${line}` : null);
  const item = (text, line, extra = {}) => ({ text, source: src(line), line, ...(snap(line) ? { snapshot: snap(line) } : {}), ...extra });
  const out = { kind: 'hero-page', ref, is_url: isUrl, title: null, og: {}, h1: null, subhead: null, cta: null, sections: [], feature_section: null, quotes: [], logos: [], nav: [], text_lines: [], data_driven: [], skipped_h1: [], essence: null };
  out.essence = pageEssence(raw, item);

  const title = elements(html, 'title')[0];
  if (title && title.text) out.title = item(title.text, title.line);
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const prop = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    const content = attr(tag, 'content');
    if (!content) continue;
    if (/^(og:title|og:description|og:site_name|description|twitter:title|twitter:description)$/.test(prop)) out.og[prop] = item(cleanText(content), lineAt(html, m.index));
  }
  const chrome = ['header', 'nav', 'footer'].flatMap((tag) => nestedBlocks(html, tag).map((b) => ({ ...b, tag })));
  const inChrome = (offset) => chrome.some((b) => b.start <= offset && b.end >= offset);
  const brandNames = [out.og['og:site_name']?.text, out.essence.app?.name?.text, out.essence.site?.name?.text, out.essence.org?.name?.text, out.title ? out.title.text.split(/\s+[|–—-]\s+|\s*[:·]\s+/)[0] : null].filter(Boolean).map((t) => t.toLowerCase().trim());
  const isBrandOnly = (text) => brandNames.includes(text.toLowerCase().trim()) || tokens(text).length <= 1;

  const allH1 = elements(html, 'h1');
  const templateOnly = allH1.filter((h) => !h.text && /\{|\{\{|\{%|<%|\$\{/.test(h.inner));
  for (const h of templateOnly) out.data_driven.push({ what: 'h1', line: h.line, source: src(h.line), excerpt: truncate(h.inner.replace(/\s+/g, ' '), 80) });
  const textH1 = allH1.filter((h) => h.text);
  let pick = textH1.find((h) => !inChrome(h.start) && !isBrandOnly(h.text)) ?? textH1.find((h) => !inChrome(h.start)) ?? textH1[0] ?? null;
  if (pick) {
    for (const h of textH1) if (h !== pick && h.start < pick.start) out.skipped_h1.push({ text: h.text, line: h.line, source: src(h.line), reason: inChrome(h.start) ? 'inside header/nav' : 'brand name only' });
    out.h1 = item(pick.text, pick.line, { brand_only: isBrandOnly(pick.text) });
    const tail = html.slice(pick.end, pick.end + 1200);
    const p = tail.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (p && cleanText(p[1])) out.subhead = item(cleanText(p[1]), lineAt(html, pick.end + p.index));
    else if (p && /\{|\$\{/.test(p[1])) out.data_driven.push({ what: 'subhead', line: lineAt(html, pick.end + p.index), source: src(lineAt(html, pick.end + p.index)), excerpt: truncate(p[1].replace(/\s+/g, ' '), 80) });
  }
  const from = pick ? pick.end : 0;
  const ctaRe = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  ctaRe.lastIndex = from;
  let c;
  while ((c = ctaRe.exec(html)) !== null) {
    const text = cleanText(c[3]);
    if (!text || text.length > 60) continue;
    const cls = attr(c[2], 'class') ?? '';
    const href = attr(c[2], 'href') ?? '';
    if (/cta|btn|button|primary/i.test(cls) || CTA_HREF_RE.test(href) || CTA_TEXT_RE.test(text)) {
      out.cta = item(text, lineAt(html, c.index), { href: href || null });
      break;
    }
  }
  const nav = elements(html, 'nav')[0];
  if (nav) for (const a of elements(nav.inner, 'a')) if (a.text && a.text.length <= 40) out.nav.push(item(a.text, nav.line + lineAt(nav.inner, a.start) - 1));

  const blocks = [];
  for (const tag of ['header', 'section', 'main', 'article', 'footer']) for (const b of nestedBlocks(html, tag)) blocks.push({ ...b, tag });
  for (const b of nestedBlocks(html, 'div')) {
    const id = `${attr(b.attrs, 'id') ?? ''} ${attr(b.attrs, 'class') ?? ''}`;
    if (FEATURE_SECTION_RE.test(id) || PROOF_SECTION_RE.test(id)) blocks.push({ ...b, tag: 'div' });
  }
  blocks.sort((a, b) => a.start - b.start || b.end - a.end);
  const firstTextOffset = (fragment) => { const m = fragment.match(/>\s*([^<\s][^<]*)/); return m ? m.index + m[0].indexOf(m[1]) : 0; };
  for (const b of blocks) {
    const id = attr(b.attrs, 'id') ?? null;
    const cls = attr(b.attrs, 'class') ?? null;
    const h3s = elements(b.inner, 'h3').filter((h) => h.text);
    const heading = elements(b.inner, 'h2').find((h) => h.text) ?? (h3s.length === 1 ? h3s[0] : null);
    const items = [];
    const seenItem = new Set();
    const push = (text, offset) => {
      const t = cleanText(text);
      if (!t || t.length < 3 || seenItem.has(t)) return;
      seenItem.add(t);
      items.push(item(truncate(t, 200), b.line + lineAt(b.inner, offset) - 1));
    };
    const subs = [...h3s, ...elements(b.inner, 'h4')].sort((x, y) => x.start - y.start).filter((h) => h.text && !(heading && h.start === heading.start));
    const dts = elements(b.inner, 'dt').filter((d) => d.text);
    if (subs.length >= 2) for (const h of subs) push(h.text, h.start);
    else if (dts.length >= 2) for (const d of dts) push(d.text, d.start);
    else {
      const cards = [...nestedBlocks(b.inner, 'article'), ...nestedBlocks(b.inner, 'li'), ...nestedBlocks(b.inner, 'div').filter((d) => /card|item|feature|tile|col|grid-item|benefit/i.test(attr(d.attrs, 'class') ?? ''))].sort((x, y) => x.start - y.start);
      const outer = [];
      let lastEnd = -1;
      for (const cd of cards) { if (cd.start >= lastEnd) { outer.push(cd); lastEnd = cd.end; } }
      for (const cd of outer) push(cd.inner, cd.start + cd.attrs.length + firstTextOffset(cd.inner));
    }
    const label = `${id ?? ''} ${cls ?? ''} ${heading ? heading.text : ''}`;
    const sec = { tag: b.tag, id, class: cls, line: b.line, source: src(b.line), heading: heading && heading.text ? item(heading.text, b.line + lineAt(b.inner, heading.start) - 1) : null, items, feature_like: FEATURE_SECTION_RE.test(label), proof_like: PROOF_SECTION_RE.test(label), _inner: b.inner, _base: b.start + b.attrs.length, _start: b.start, _end: b.end };
    out.sections.push(sec);
  }
  const h2s = elements(html, 'h2').filter((h) => h.text);
  const footerStart = nestedBlocks(html, 'footer')[0]?.start ?? html.length;
  h2s.forEach((h, i) => {
    const end = Math.min(h2s[i + 1] ? h2s[i + 1].start : html.length, footerStart > h.end ? footerStart : html.length);
    const inner = html.slice(h.end, end);
    const base = h.end;
    const items = [];
    const seenItem = new Set();
    const push = (text, offset) => { const t = cleanText(text); if (t && t.length >= 3 && t.length <= 200 && !seenItem.has(t)) { seenItem.add(t); items.push(item(t, lineAt(html, base + offset))); } };
    const dts = elements(inner, 'dt').filter((d) => d.text);
    const subs = [...elements(inner, 'h3'), ...elements(inner, 'h4')].sort((x, y) => x.start - y.start).filter((s) => s.text);
    if (dts.length >= 2) for (const d of dts) push(d.text, d.start + firstTextOffset(`>${d.inner}`) - 1);
    else if (subs.length >= 2) for (const s of subs) push(s.text, s.start);
    else { const lis = elements(inner, 'li').filter((l) => l.text && l.text.length <= 120); if (lis.length >= 2) for (const l of lis) push(l.text, l.start); }
    const label = h.text;
    out.sections.push({ tag: 'h2-section', id: null, class: null, line: h.line, source: src(h.line), heading: item(h.text, h.line), items, feature_like: FEATURE_SECTION_RE.test(label.replace(/\s+/g, '-')) || /why|what/i.test(label), proof_like: PROOF_SECTION_RE.test(label), _inner: inner, _base: base, _start: h.end, _end: end });
  });
  const headerEnd = blocks.find((b) => b.tag === 'header')?.end ?? (pick ? pick.end : 0);
  const h1End = pick ? pick.end : 0;
  out.feature_section = out.sections.find((s) => s.tag !== 'h2-section' && s.feature_like && s.items.length >= 1 && !s.proof_like)
    ?? out.sections.find((s) => s.tag !== 'h2-section' && s.tag !== 'header' && s.tag !== 'footer' && s.tag !== 'main' && s.items.length >= 2 && !s.proof_like && s._start >= headerEnd)
    ?? out.sections.find((s) => s.tag === 'h2-section' && s.items.length >= 2 && !s.proof_like && !/pric|plan|faq|question|compare|blog|news|team|about|contact|footer/i.test(s.heading.text) && lineAt(html, h1End) <= s.line)
    ?? null;

  const normQ = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
  const pushQuote = (q) => { const n = normQ(q.text); if (n.length < 8 || out.quotes.some((x) => normQ(x.text) === n)) return; out.quotes.push(q); };
  for (const q of elements(html, 'blockquote')) {
    const inner = q.inner.replace(/<(footer|cite|figcaption)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (m) => m.replace(/[^\n]/g, ' '));
    const paras = elements(inner, 'p').filter((p) => p.text);
    let text = paras[0] ? paras[0].text : cleanText(inner);
    let attribution = paras.slice(1).map((p) => p.text).join(' ');
    const who = q.inner.match(/<(?:footer|cite|figcaption)\b[^>]*>([\s\S]*?)<\/(?:footer|cite|figcaption)\s*>/i) ?? q.inner.match(/<p\b[^>]*class="[^"]*\b(?:who|author|name|attribution|byline|muted|caption)\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (who) attribution = cleanText(who[1]);
    if (!attribution) {
      const tail = cleanText(html.slice(q.end, q.end + 400).replace(/<\/?(section|div|blockquote|article|li)[^>]*>[\s\S]*$/i, ''));
      const m = tail.match(/^[—–-]\s*(.{3,120}?)(?:\s{2,}|$)/);
      if (m) attribution = m[1];
    }
    if (!text && /\{|\$\{/.test(q.inner)) { out.data_driven.push({ what: 'quote', line: q.line, source: src(q.line), excerpt: truncate(q.inner.replace(/\s+/g, ' '), 80) }); continue; }
    text = text.replace(/^["“„«]+|["”«»]+$/g, '').trim();
    const firstP = paras[0] ?? null;
    const qLine = firstP ? q.line + lineAt(q.inner, firstP.start) - 1 : q.line;
    if (text.length >= 12) pushQuote(item(text, qLine, { attribution: parseAttribution(attribution) }));
  }
  for (const q of elements(html, 'q')) if (q.text.length >= 12) pushQuote(item(q.text, q.line, { attribution: parseAttribution('') }));
  for (const s of out.sections.filter((x) => x.proof_like && x._inner)) {
    for (const card of cardQuotes(s._inner)) pushQuote(item(card.text, lineAt(html, s._base + card.offset), { attribution: card.attribution, via: 'card' }));
  }

  const LOGO_HINT_RE = /logo|customer|client|partner|brand|sponsor|trusted|used-?by/i;
  const AVATAR_RE = /avatar|photo|profile|screenshot|headshot|portrait|hero|illustration|icon-|emoji|rounded-full/i;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const alt = attr(tag, 'alt') ?? '';
    const srcAttr = attr(tag, 'src') ?? '';
    const cls = attr(tag, 'class') ?? '';
    if (/\{|\$\{|<%/.test(`${alt} ${srcAttr}`) || !srcAttr) continue;
    const hint = `${alt} ${srcAttr} ${cls}`;
    if (AVATAR_RE.test(hint) && !/logo/i.test(hint)) continue;
    const chromeHit = inChrome(m.index);
    const proofSection = out.sections.find((s) => s.proof_like && s._start <= m.index && s._end >= m.index);
    const container = nestedBlocks(html, 'div').find((d) => d.start <= m.index && d.end >= m.index && /logos?|customers?|clients?|partners?|brands?|sponsors?|trusted/i.test(`${attr(d.attrs, 'id') ?? ''} ${attr(d.attrs, 'class') ?? ''}`));
    const logoish = LOGO_HINT_RE.test(hint);
    if (!(container || (proofSection && logoish) || logoish)) continue;
    const name = alt || path.posix.basename(srcAttr.split('?')[0]).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    const brandTokens = brandNames.flatMap((b) => b.split(/\s+/)).filter((t) => t.length >= 4);
    const ownBrand = chromeHit || brandNames.some((b) => b && name.toLowerCase().includes(b)) || brandTokens.some((t) => name.toLowerCase().includes(t)) || (/\blogo\b/i.test(hint) && !proofSection && !container);
    out.logos.push(item(name, lineAt(html, m.index), { file: srcAttr, alt: alt || null, own_brand: ownBrand }));
  }
  for (const s of out.sections) { delete s._inner; delete s._base; delete s._start; delete s._end; }

  const textOnly = html.replace(/<[^>]*>/g, (t) => t.replace(/[^\n]/g, ' '));
  const quoteLines = new Set(out.quotes.map((q) => q.line));
  const quoteSpans = elements(html, 'blockquote').map((q) => [q.line, lineAt(html, q.end)]);
  const inQuoteSpan = (line) => quoteSpans.some(([a, b]) => line >= a && line <= b);
  textOnly.split('\n').forEach((l, i) => {
    const t = cleanText(l);
    if (t) out.text_lines.push({ text: t, line: i + 1, in_quote: quoteLines.has(i + 1) || inQuoteSpan(i + 1) });
  });
  return out;
}

export function cardQuotes(inner) {
  const out = [];
  const cards = [...nestedBlocks(inner, 'div'), ...nestedBlocks(inner, 'li'), ...nestedBlocks(inner, 'article'), ...nestedBlocks(inner, 'figure')].filter((c) => c.inner.length <= 4000).sort((a, b) => a.start - b.start).slice(0, MAX_CARD_BLOCKS);
  const seen = new Set();
  const textsOf = (fragment) => {
    const res = [];
    const re = />([^<]+)</g;
    let m;
    while ((m = re.exec(`>${fragment}<`)) !== null) { const t = cleanText(m[1]); if (t) res.push({ t, offset: m.index }); }
    return res;
  };
  for (const c of cards) {
    const texts = textsOf(c.inner);
    const long = texts.filter((x) => x.t.length >= 40);
    const short = texts.filter((x) => x.t.length < 40 && x.t.length >= 2 && !/^(read more|learn more|more|see more|→|›|»)$/i.test(x.t));
    if (long.length !== 1 || short.length < 1 || short.length > 4 || texts.length > 6) continue;
    const quote = long[0].t.replace(/^["“„«]+|["”»]+$/g, '').trim();
    if (seen.has(quote)) continue;
    seen.add(quote);
    const name = short[0].t.replace(/^[—–-]\s*/, '');
    const rest = short.slice(1).map((x) => x.t.replace(/^[—–-]\s*/, '')).join(', ');
    const attribution = parseAttribution(rest ? `${name}, ${rest}` : name);
    if (rest && /\bat\b/.test(rest) && !rest.includes(',')) { const at = rest.match(/^(.+?)\s+(?:at|@)\s+(.+)$/); if (at) { attribution.name = name; attribution.role = at[1].trim(); attribution.company = at[2].trim(); attribution.raw = `${name}, ${rest}`; } }
    out.push({ text: quote, offset: c.start + c.attrs.length + long[0].offset, attribution });
  }
  return out;
}

function isQuoteBody(html, line) {
  for (const q of elements(html, 'blockquote')) {
    const endLine = lineAt(html, q.end);
    if (line >= q.line && line <= endLine) return true;
  }
  return false;
}

export function parseAttribution(raw) {
  const s = cleanText(raw).replace(/^[—–-]\s*/, '').replace(/\s*\((?:fictional|synthetic)[^)]*\)\s*$/i, '').trim();
  if (!s) return { name: null, role: null, company: null, raw: null };
  const parts = s.split(/\s*(?:,|\||·|\s[—–]\s)\s*/).map((p) => p.trim()).filter(Boolean);
  const splitAt = (p) => p.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i) ?? (p.match(/^@(\S.*)$/) ? { 1: null, 2: p.slice(1) } : null);
  if (parts.length === 1) {
    const at = parts[0].match(/^(.+?),?\s+(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (at) return { name: at[1].trim(), role: at[2].trim(), company: at[3].trim(), raw: s };
    return { name: parts[0], role: null, company: null, raw: s };
  }
  const name = parts[0];
  const rest = parts.slice(1);
  const last = rest[rest.length - 1];
  const at = splitAt(last);
  if (at) {
    const role = [...rest.slice(0, -1), at[1]].filter(Boolean).join(', ');
    return { name, role: role || null, company: at[2].trim(), raw: s };
  }
  return { name, role: rest[0] ?? null, company: rest.slice(1).join(', ') || null, raw: s };
}

const INSTALL_RE = /^\s*(?:\$\s*)?(?:npm|pnpm|yarn|bun|npx|pip3?|pipx|uv|poetry|conda|brew|cargo|go|gem|apt(?:-get)?|dnf|yum|pacman|choco|scoop|winget|docker|curl|wget|git)\s+(?:i|install|add|get|clone|pull|tap|-[sSLo]+)\b/i;
const USAGE_HEADING_RE = /\b(usage|quick\s?start|getting\s+started|example|examples|tutorial|how\s+it\s+works|try\s+it|demo|run|running)\b/i;

export function stripMdComments(line) {
  let open = false;
  const text = String(line).replace(/(`+)[\s\S]*?\1|<!--(?:-?>|[\s\S]*?(?:-->|$))/g, (m) => {
    if (m.startsWith('`')) return m;
    if (!m.endsWith('-->')) open = true;
    return '';
  });
  return { text, open };
}

export function parseMarkdown(md, ref) {
  const lines = String(md).split('\n');
  const out = { ref, h1: null, headings: [], paragraphs: [], code_blocks: [], images: [], badges: [], quotes: [], text_lines: [], links: [] };
  let inCode = false;
  let fence = null;
  let block = null;
  let currentHeading = null;
  let inHtmlComment = false;
  let para = null;
  const src = (line) => `${ref}:${line}`;
  const closePara = () => { para = null; };
  const BADGE_RE = /shields\.io|badge|badgen|img\.shields|travis|circleci|codecov|coveralls|github\.com\/[^/]+\/[^/]+\/(?:actions|workflows)|npmjs\.com|pypi\.org|badge\.fury|opencollective|bestpractices/i;
  const cleanHeading = (t) => cleanText(t.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<\/?(?:a|img|br|span|b|i|em|strong|code|sup|sub)\b[^>]*>/gi, ''));
  const noteImages = (raw, n) => {
    for (const m of raw.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)) {
      const entry = { alt: cleanText(m[1]), src: m[2], line: n, source: src(n), linked: raw.slice(Math.max(0, m.index - 1), m.index) === '[', heading: currentHeading ? currentHeading.text : null };
      if (BADGE_RE.test(`${m[2]} ${m[1]}`)) out.badges.push(entry); else out.images.push(entry);
    }
    for (const m of raw.matchAll(/<img\b[^>]*>/gi)) {
      const alt = cleanText(attr(m[0], 'alt') ?? '');
      const s = attr(m[0], 'src') ?? '';
      if (!s) continue;
      const entry = { alt, src: s, line: n, source: src(n), linked: false, heading: currentHeading ? currentHeading.text : null };
      if (BADGE_RE.test(s)) out.badges.push(entry); else out.images.push(entry);
    }
  };
  for (let i = 0; i < lines.length; i += 1) {
    let raw = lines[i];
    const n = i + 1;
    if (!inCode) {
      let hadComment = false;
      if (inHtmlComment) {
        const end = raw.indexOf('-->');
        if (end < 0) continue;
        inHtmlComment = false; hadComment = true; raw = raw.slice(end + 3);
      }
      if (raw.includes('<!--')) {
        const s = stripMdComments(raw);
        if (s.text !== raw) { hadComment = true; raw = s.text; inHtmlComment = s.open; }
      }
      if (hadComment && !raw.trim()) continue;
    }
    const fenceM = raw.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)/);
    if (fenceM && !inCode) {
      closePara();
      inCode = true; fence = fenceM[1]; block = { lang: fenceM[2] || null, start: n, end: n, lines: [], line_numbers: [], heading: currentHeading ? currentHeading.text : null, source: src(n) };
      continue;
    }
    if (inCode) {
      if (fenceM && fenceM[1][0] === fence[0] && fenceM[1].length >= fence.length && !fenceM[2]) { inCode = false; block.end = n; out.code_blocks.push(block); block = null; }
      else { block.lines.push(raw); block.line_numbers.push(n); }
      continue;
    }
    if (!raw.trim()) { closePara(); continue; }
    const hm = raw.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/) ?? (raw.match(/^\s*<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/i) ? { 1: '#'.repeat(Number(raw.match(/^\s*<h([1-6])\b/i)[1])), 2: raw.match(/^\s*<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/i)[1] } : null);
    if (hm) {
      closePara();
      noteImages(hm[2], n);
      const text = cleanHeading(hm[2]);
      const h = { level: hm[1].length, text, line: n, source: src(n) };
      out.headings.push(h);
      currentHeading = h;
      if (h.level === 1 && !out.h1 && text) out.h1 = h;
      continue;
    }
    noteImages(raw, n);
    for (const m of raw.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) out.links.push({ text: cleanText(m[1]), href: m[2], line: n });
    if (/^\s*>/.test(raw)) {
      closePara();
      const text = cleanText(raw.replace(/^\s*>\s?/, ''));
      const prev = out.quotes[out.quotes.length - 1];
      if (prev && prev.end === n - 1 && /^[—–-]\s*\S/.test(text) && !prev.attribution) { prev.attribution = parseAttribution(text); prev.end = n; }
      else if (prev && prev.end === n - 1 && !prev.attribution) { prev.text = `${prev.text} ${text}`.trim(); prev.end = n; }
      else if (text) out.quotes.push({ text, line: n, end: n, source: src(n), attribution: null });
      continue;
    }
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+/.test(raw);
    const text = cleanText(raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, ' '));
    if (!text) { closePara(); continue; }
    const lastQ = out.quotes[out.quotes.length - 1];
    if (lastQ && lastQ.end >= n - 2 && /^[—–-]\s*\S/.test(text.replace(/^\*+|\*+$/g, '')) && !lastQ.attribution) { lastQ.attribution = parseAttribution(text); lastQ.end = n; continue; }
    const table = /^\s*\|/.test(raw);
    out.text_lines.push({ text, line: n, heading: currentHeading ? currentHeading.text : null, bullet, continuation: !bullet && /^\s{2,}\S/.test(raw), in_quote: false });
    if (bullet || table || /^\s*<\/?\w/.test(raw)) { closePara(); continue; }
    if (para) { para.text = `${para.text} ${text}`; para.end = n; }
    else { para = { text, line: n, end: n, heading: currentHeading ? currentHeading.text : null, source: src(n) }; out.paragraphs.push(para); }
  }
  for (const q of out.quotes) {
    const m = q.text.match(/^["“„«]?(.+?)["”»]\s*[—–-]\s*(.+)$/);
    if (m && !q.attribution) { q.text = m[1].trim(); q.attribution = parseAttribution(m[2]); }
    else q.text = q.text.replace(/^["“„«]+|["”»]+$/g, '').trim();
    if (!q.attribution) q.attribution = parseAttribution('');
  }
  return out;
}

export function readmeOneLiner(md) {
  const startLine = md.h1 ? md.h1.line : 0;
  for (const p of md.paragraphs) {
    if (p.line <= startLine) continue;
    if (md.headings.some((h) => h.line > startLine && h.line < p.line && h.level <= 2)) break;
    if (p.text.length < 12 || /^(\[|!\[|<|\|)/.test(p.text) || /^(table of contents|toc)$/i.test(p.text)) continue;
    return { text: truncate(p.text, 240), source: p.source, line: p.line };
  }
  return null;
}

const NON_CODE_LANG = /^(mermaid|diff|svg|csv|tsv|text|txt|plaintext|output|log|console-output|yaml|yml|json|json5|toml|ini|env|dotenv|xml|properties|hcl|html|css|scss|md|markdown)$/i;
const INSTALL_HEADING = /install|setup|set-up|requirements?|prerequisites?|dependencies|configuration|config\b/i;
const NOT_A_COMMAND = /^(?:import\b|from\s+\S+\s+import\b|require\(|export\b|const\b|let\b|var\b|use\b|using\b|package\b|source\s|\.\s|export\s+\w+=|set\s+-|cd\s|mkdir\b|touch\b|cp\s|mv\s|rm\s|echo\b|cat\b|ls\b|chmod\b|python3?\s+-m\s+venv|virtualenv\b|conda\s+activate|nvm\s|pyenv\s|\w+\s*[:=]\s*\S|[\[{]|<|\/\/|#|--|;)/i;

function commandLines(b) {
  const out = [];
  b.lines.forEach((l, i) => {
    const cmd = l.replace(/^\s*[$>]\s?/, '').replace(/\s+#(?!\{|!).*$/, '').trim();
    if (!cmd || /^(#|\/\/|--|;|rem\b)/i.test(cmd)) return;
    out.push({ cmd, line: b.line_numbers ? b.line_numbers[i] : b.start + i + 1, install: INSTALL_RE.test(cmd), noise: NOT_A_COMMAND.test(cmd) });
  });
  return out;
}

export function readmeExample(md) {
  const blocks = md.code_blocks;
  if (blocks.length === 0) return null;
  const usable = blocks.filter((b) => !(b.lang && NON_CODE_LANG.test(b.lang)) && commandLines(b).length > 0);
  const realCommand = (b) => commandLines(b).find((c) => !c.install && !c.noise) ?? null;
  const choose = usable.find((b) => b.heading && USAGE_HEADING_RE.test(b.heading) && !INSTALL_HEADING.test(b.heading) && realCommand(b))
    ?? usable.find((b) => !(b.heading && INSTALL_HEADING.test(b.heading)) && realCommand(b))
    ?? usable.find((b) => realCommand(b))
    ?? usable[0]
    ?? blocks[0];
  const pick = realCommand(choose) ?? commandLines(choose)[0] ?? null;
  const cmd = pick ? pick.cmd : null;
  return { command: cmd, lang: choose.lang, heading: choose.heading, source: pick ? `${md.ref}:${pick.line}` : choose.source, line: pick ? pick.line : choose.start, block_source: choose.source, end: choose.end, feature: cmd ? commandFeatureName(cmd) : null };
}

export function readmeInstall(md) {
  for (const b of md.code_blocks) {
    const hit = commandLines(b).find((c) => c.install);
    if (hit) return { command: hit.cmd, source: `${md.ref}:${hit.line}`, line: hit.line };
  }
  return null;
}

export function commandFeatureName(cmd) {
  let s = cmd.replace(/\s+#(?!\{|!).*$/, '').replace(/^\s*(?:sudo\s+)?(?:npx|pnpm\s+dlx|bunx|uvx|poetry\s+run|python3?\s+-m|node|deno\s+run|go\s+run|cargo\s+run\s+--)\s+/i, '');
  s = s.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, ' ');
  s = s.replace(/(?:^|\s)-{1,2}[\w-]+(?:=\S+)?(?:\s+(?!-)[^\s"'`]+)?/g, ' ');
  s = s.replace(/\S+\/\S+|\S+\.\w{1,5}\b/g, ' ');
  s = s.replace(/[=;{}()]+/g, ' ').replace(/[.,]/g, ' ');
  const words = s.split(/\s+/).filter((w) => w && !/^[|&<>]+$/.test(w)).slice(0, 5);
  return words.join(' ').trim() || null;
}

export function changelogLatestAdded(md) {
  const hs = md.headings;
  const blocks = [];
  for (let i = 0; i < hs.length; i += 1) {
    const h = hs[i];
    if (!/^added\b/i.test(h.text)) continue;
    const version = [...hs].reverse().find((v) => v.line < h.line && v.level < h.level) ?? null;
    const next = hs[i + 1] ? hs[i + 1].line : Number.MAX_SAFE_INTEGER;
    const inBlock = md.text_lines.filter((l) => l.line > h.line && l.line < next);
    const items = [];
    for (const l of inBlock) {
      const last = items[items.length - 1];
      if (l.bullet) items.push({ text: l.text, line: l.line, end: l.line, lines: [l.line], source: `${md.ref}:${l.line}` });
      else if (last && l.continuation && l.line === last.end + 1) { last.text = `${last.text} ${l.text}`; last.end = l.line; last.lines.push(l.line); }
    }
    if (items.length === 0) continue;
    const unreleased = !version || /unreleased|upcoming|next|wip/i.test(version.text);
    blocks.push({ version: version ? version.text : null, version_line: version ? version.line : null, heading_line: h.line, source: `${md.ref}:${h.line}`, items, unreleased });
  }
  return blocks.find((b) => !b.unreleased) ?? blocks[0] ?? null;
}

export function entryFeatureName(text) {
  let s = cleanText(text).replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
  s = s.replace(/\s*\(([^)]*)\)/g, ' ');
  const cut = s.search(/[:;—–]|\.(?=\s|$)|\s-\s|\s\|\s/);
  if (cut > 8) s = s.slice(0, cut);
  const words = s.trim().split(/\s+/);
  return (words.length > 8 ? `${words.slice(0, 8).join(' ')}` : words.join(' ')).trim();
}

export function parseTestimonialFile(text, ref, ext) {
  const quotes = [];
  if (ext === '.json') {
    let data;
    try { data = JSON.parse(text); } catch { return quotes; }
    const list = Array.isArray(data) ? data : Array.isArray(data.testimonials) ? data.testimonials : Array.isArray(data.items) ? data.items : Array.isArray(data.quotes) ? data.quotes : [];
    const lines = text.split('\n');
    const keyLines = lines.map((l, i) => (/^\s*"(?:quote|text|body|content)"\s*:/.test(l) ? i + 1 : 0)).filter(Boolean);
    let n = 0;
    for (const t of list) {
      if (!t || typeof t !== 'object') continue;
      const q = t.quote ?? t.text ?? t.body ?? t.content ?? null;
      if (typeof q !== 'string') continue;
      const line = keyLines[n] ?? 0;
      n += 1;
      if (q.length < 12) continue;
      quotes.push({ text: q.trim(), source: `${ref}:${line || 1}`, line: line || 1, located: line > 0, attribution: { name: t.name ?? t.author ?? null, role: t.role ?? t.title ?? t.position ?? null, company: t.company ?? t.org ?? t.organization ?? null, raw: [t.name ?? t.author, t.role ?? t.title, t.company ?? t.org].filter(Boolean).join(', ') || null } });
    }
    return quotes;
  }
  if (ext === '.html' || ext === '.htm') return parseHeroHtml(text, ref).quotes;
  if (ext === '.yml' || ext === '.yaml') {
    const lines = text.split('\n');
    let cur = null;
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      const m = l.match(/^\s*-?\s*(quote|text|body|name|author|role|title|company|org)\s*:\s*(.*)$/i);
      if (!m) continue;
      const key = m[1].toLowerCase();
      let val = m[2].trim();
      if (/^[>|][-+]?$/.test(val)) {
        const indent = l.indexOf(m[1]);
        const parts = [];
        let j = i + 1;
        while (j < lines.length && (!lines[j].trim() || lines[j].match(/^\s*/)[0].length > indent)) { if (lines[j].trim()) parts.push(lines[j].trim()); j += 1; }
        val = parts.join(val[0] === '>' ? ' ' : ' ');
      }
      val = val.replace(/^["']|["']$/g, '');
      if (key === 'quote' || key === 'text' || key === 'body') { cur = { text: val, line: i + 1, source: `${ref}:${i + 1}`, attribution: { name: null, role: null, company: null, raw: null } }; if (val.length >= 12) quotes.push(cur); }
      else if (cur) { if (key === 'name' || key === 'author') cur.attribution.name = val; else if (key === 'role' || key === 'title') cur.attribution.role = val; else cur.attribution.company = val; cur.attribution.raw = [cur.attribution.name, cur.attribution.role, cur.attribution.company].filter(Boolean).join(', ') || null; }
    }
    return quotes;
  }
  return parseMarkdown(text, ref).quotes.filter((q) => q.text.length >= 12);
}

const E2E_MARKERS = /@playwright\/test|from ['"]playwright|require\(['"]playwright|cy\.(visit|get|contains)|from ['"]puppeteer|selenium|webdriver|testcafe|page\.goto|browser\.newPage|\bplaywright\b|\bcypress\b|nightwatch|codecept|from playwright/i;
const TEST_TITLE_RE = /\b(?:test|it|describe|scenario|feature)(?:\.(?:only|skip|describe|step|serial|parallel|each))?\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
const PY_TEST_RE = /^\s*(?:async\s+)?def\s+(test_[a-zA-Z0-9_]+)\s*\(/;
const ACTION_RE = /\b(click|clicks|upload|uploads|create|creates|merge|merges|submit|submits|add|adds|edit|edits|delete|deletes|remove|removes|send|sends|type|types|fill|fills|select|selects|drag|drags|import|imports|export|exports|generate|generates|run|runs|start|starts|open|opens|connect|connects|search|searches|filter|filters|invite|invites|pay|pays|schedule|schedules|publish|publishes|sign|signs|toggle|toggles|save|saves|complete|completes|approve|approves|reconcile|reconciles|match|matches|sync|syncs|close|closes|record|records|share|shares|render|renders|deploy|deploys|build|builds|install|installs|configure|configures|book|books|join|joins|order|orders|buy|buys|checkout|reserve|reserves|assign|assigns|cancel|cancels|update|updates|track|tracks|convert|converts|resolve|resolves|archive|archives|download|downloads|preview|previews|compare|compares|migrate|migrates|switch|switches|enable|enables|set|sets|apply|applies|move|moves|copy|copies|rename|renames|tag|tags|label|labels|comment|comments|review|reviews|merge|verify|verifies|validate|validates)\b/i;
const OUTCOME_RE = /\b(see|sees|shows|shown|displays|displayed|appears|visible|expect|should|renders|receives|gets|returns|then|result|results|updated|created|completed|done|success)\b/i;
export const PLUMBING_TEST_RE = /\b(login|log ?in|logs in|sign-?in|signs in|sign-?up|signs up|register|logout|log out|auth|password|session|smoke|a11y|accessibility|axe|health|404|not found|error page|redirect|cookie|consent|gdpr|navigation|nav\b|footer|header|responsive|mobile menu|dark mode|theme)\b/i;
const EXPECT_CALL_RE = /\b(?:expect|assert(?:\.\w+)?|expectTypeOf|assertEquals|assertThat)\s*[.(]|\.should\s*\(|\.to(?:Be|Have|Contain|Equal|Match)\w*\s*\(|\bassert\s+\S/;
const CODE_NOISE_RE = /^\s*(?:import\b|from\b|require\(|export\b|\/\/|\/\*|\*)/;
const collapse = (s) => String(s).replace(/\s+/g, ' ').trim();

export function parseE2E(text, ref) {
  if (!E2E_MARKERS.test(text)) return null;
  const lines = text.split('\n').map((l) => l.replace(/^(\s*)\/\/.*$/, '$1').replace(/^(\s*)#(?!\{).*$/, '$1'));
  const tests = [];
  lines.forEach((l, i) => {
    TEST_TITLE_RE.lastIndex = 0;
    let m;
    while ((m = TEST_TITLE_RE.exec(l)) !== null) {
      const title = collapse(m[2]);
      if (!title) continue;
      tests.push({ title, line: i + 1, source: `${ref}:${i + 1}`, kind: /describe|feature/.test(m[0]) ? 'group' : 'test' });
    }
    const py = l.match(PY_TEST_RE);
    if (py) tests.push({ title: py[1].replace(/^test_/, '').replace(/_/g, ' '), line: i + 1, source: `${ref}:${i + 1}`, kind: 'test' });
  });
  const goto = lines.map((l, i) => ({ l, i })).find(({ l }) => /\b(?:goto|visit|navigate|get)\s*\(\s*["'`]/.test(l));
  const isExpect = (l) => EXPECT_CALL_RE.test(l) && !CODE_NOISE_RE.test(l);
  const expectLine = lines.map((l, i) => ({ l, i })).find(({ l }) => isExpect(l));
  for (let t = 0; t < tests.length; t += 1) {
    if (tests[t].kind !== 'test') continue;
    const nextLine = tests.slice(t + 1).find((x) => x.kind === 'test')?.line ?? lines.length + 1;
    const ex = lines.map((l, i) => ({ l, i: i + 1 })).find(({ l, i }) => i > tests[t].line && i < nextLine && isExpect(l));
    tests[t].asserts = Boolean(ex);
    tests[t].expectation = ex ? collapse(ex.l).slice(0, 160) : null;
    tests[t].expectation_line = ex ? ex.i : null;
    tests[t].action = ACTION_RE.test(tests[t].title);
    tests[t].outcome_in_title = OUTCOME_RE.test(tests[t].title);
    tests[t].plumbing = PLUMBING_TEST_RE.test(tests[t].title) || PLUMBING_TEST_RE.test(path.posix.basename(ref));
  }
  return {
    ref,
    tests,
    plumbing: PLUMBING_TEST_RE.test(path.posix.basename(ref)),
    entry: goto ? { text: (goto.l.match(/["'`]([^"'`]+)["'`]/) ?? [null, null])[1], line: goto.i + 1, source: `${ref}:${goto.i + 1}` } : null,
    first_expect: expectLine ? { text: collapse(expectLine.l).slice(0, 160), line: expectLine.i + 1, source: `${ref}:${expectLine.i + 1}` } : null,
  };
}

const AUDIENCE_RE = /\b(?:for|built for|made for|designed for|helps?)\s+((?:[a-z][a-z-]*\s){0,2}?(?:teams?|developers?|engineers?|founders?|startups?|agencies|enterprises?|accountants?|marketers?|designers?|analysts?|creators?|students?|researchers?|businesses|companies|saas|e-?commerce|indie hackers|freelancers|managers?|recruiters?|sales|support|ops|devops|data scientists?|scientists?|teachers?|schools?|clinics?|hospitals?|lawyers?|law firms?|nonprofits?|governments?|publishers?|podcasters?|streamers?|writers?|editors?|photographers?|musicians?|gamers?|traders?|investors?|landlords?|realtors?|restaurants?|retailers?|shops?|brands?|consultants?|contractors?|plumbers?|dentists?|therapists?|coaches|trainers?|gyms?|everyone|anyone|humans|people|users))\b/gi;
const ALTERNATIVE_RE = /\b(unlike|vs\.?|versus|instead of|without|no more|replaces?|compared to|alternative to|migrate from|switch from|say goodbye to|stop using)\b|(?:,|—|–)\s*(not)\s+\S/i;
const BEFORE_AFTER_RE = /\bfrom\s+(.{2,40}?)\s+to\s+(.{2,40}?)(?:[.,;!]|$)|(.{2,40}?),\s*not\s+(.{1,40}?)(?:[.,;!]|$)|\binstead of\s+(.{2,40}?)(?:[.,;!]|$)|\bbefore\b.{0,40}\bafter\b/i;
const ARROW_RE = /^(?:.*?\b)?((?:[\w'’%$€£-]+\s){0,4}[\w'’%$€£-]+)\s*(?:→|->|⇒)\s*((?:[\w'’%$€£-]+\s){0,4}[\w'’%$€£-]+)(?:[.,;!]|\s|$)/;

export function stateChangeInText(text) {
  const t = cleanText(text);
  const m = t.match(BEFORE_AFTER_RE);
  if (m) {
    if (m[1] !== undefined) return { before: m[1].trim(), after: m[2].trim(), excerpt: m[0].trim() };
    if (m[3] !== undefined) return { before: m[4].trim(), after: m[3].trim().split(/\b(?:in|to|at|with|for|by|into|of|from|on|the)\b/).pop().trim() || m[3].trim(), excerpt: m[0].trim() };
    if (m[5] !== undefined) return { before: m[5].trim(), after: null, excerpt: m[0].trim() };
    return { before: null, after: null, excerpt: m[0].trim() };
  }
  const arrows = (t.match(/→|->|⇒/g) ?? []).length;
  if (arrows === 1 && t.length <= 120) {
    const a = t.match(ARROW_RE);
    if (a) return { before: a[1].trim(), after: a[2].trim(), excerpt: `${a[1].trim()} → ${a[2].trim()}` };
  }
  return null;
}

const POINTS = Object.fromEntries(SCORING.map((r) => [r.rule, r.points]));
const NAME_PREF = { 'product-screen': 0, 'product-heading': 1, 'first-feature-section': 2, 'changelog-added': 3, 'readme-example': 4, 'readme-media-subject': 5, 'e2e-test': 6, 'e2e-plumbing': 7, h1: 8 };
const ORDER = Object.fromEntries(SOURCE_ORDER.map((k, i) => [k, i]));

export function scoreFeatures(mentions) {
  const candidates = [];
  for (const m of mentions) {
    const tk = tokens(m.name);
    if (tk.length === 0) continue;
    const fromProduct = m.source_kind === 'product-screens';
    const contains = (short, long) => short.length >= 2 && short.length <= 3 && short.every((t) => long.includes(t));
    let c = candidates.find((x) => sameFeature(x.tokens, tk))
      ?? candidates.find((x) => (fromProduct && contains(tk, x.tokens)) || (x.product && contains(x.tokens, tk)));
    if (!c) { c = { name: m.name, tokens: tk, mentions: [], rules: {}, sources: new Set(), state_change: [], product: fromProduct }; candidates.push(c); }
    c.mentions.push(m);
    c.sources.add(m.source_kind);
    for (const t of tk) if (!c.tokens.includes(t)) c.tokens.push(t);
    if (!c.rules[m.rule] || ORDER[m.source_kind] < ORDER[c.rules[m.rule].source_kind]) c.rules[m.rule] = { rule: m.rule, points: POINTS[m.rule] ?? 0, source: m.source, source_kind: m.source_kind, excerpt: truncate(m.excerpt ?? m.name, 120) };
    if (m.state_change) c.state_change.push({ kind: m.state_change.kind, before: m.state_change.before ?? null, after: m.state_change.after ?? null, excerpt: truncate(m.state_change.excerpt ?? '', 120), source: m.source });
  }
  const ranked = candidates.map((c) => {
    const rules = Object.values(c.rules).filter((r) => r.points > 0).sort((a, b) => b.points - a.points || ORDER[a.source_kind] - ORDER[b.source_kind]);
    const score = rules.reduce((s, r) => s + r.points, 0);
    const first = [...c.mentions].sort((a, b) => ORDER[a.source_kind] - ORDER[b.source_kind] || a.position - b.position)[0];
    const named = [...c.mentions].sort((a, b) => (NAME_PREF[a.rule] ?? 9) - (NAME_PREF[b.rule] ?? 9) || ORDER[a.source_kind] - ORDER[b.source_kind] || a.position - b.position)[0];
    const promiseOnly = rules.length > 0 && rules.every((r) => r.rule === 'h1');
    return {
      name: named.name, score, rules, promise_only: promiseOnly, state_change: c.state_change, state_change_score: c.state_change.length,
      sources: [...c.sources].sort((a, b) => ORDER[a] - ORDER[b]), first_source: first.source_kind, first_position: first.position,
      evidence: c.mentions.map((m) => ({ rule: m.rule, source: m.source, excerpt: truncate(m.excerpt ?? m.name, 120) })),
    };
  });
  ranked.sort((a, b) => b.score - a.score
    || Number(a.promise_only) - Number(b.promise_only)
    || b.state_change_score - a.state_change_score
    || b.sources.length - a.sources.length
    || ORDER[a.first_source] - ORDER[b.first_source]
    || a.first_position - b.first_position
    || a.name.localeCompare(b.name, 'en'));
  let tieBreak = null;
  if (ranked.length >= 2 && ranked[0].score === ranked[1].score) {
    const [a, b] = ranked;
    tieBreak = a.promise_only !== b.promise_only ? 'feature-over-promise'
      : a.state_change_score !== b.state_change_score ? 'state-change'
      : a.sources.length !== b.sources.length ? 'source-count'
        : a.first_source !== b.first_source ? 'source-order'
          : a.first_position !== b.first_position ? 'position' : 'name';
  }
  return { ranked, tie_break: tieBreak };
}

export function insideRepo(root, rel) {
  const abs = path.resolve(root, rel);
  const base = path.resolve(root);
  return abs === base || abs.startsWith(base + path.sep);
}

function makeReader(root) {
  const opened = new Set();
  const oversized = new Set();
  const unreadable = new Set();
  function readText(rel, limit = MAX_TEXT_BYTES) {
    if (typeof rel !== 'string' || !rel || readDenied(rel) || !insideRepo(root, rel)) return null;
    try {
      const abs = path.resolve(root, rel);
      const st = fs.lstatSync(abs);
      if (!st.isFile()) return null;
      if (st.size > limit) { oversized.add(rel); return null; }
      const txt = fs.readFileSync(abs, 'utf8');
      opened.add(rel);
      return txt;
    } catch (err) {
      if (err && err.code && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') unreadable.add(rel);
      return null;
    }
  }
  return { readText, opened, oversized, unreadable };
}

const HERO_CANDIDATES = [
  /^index\.html?$/i,
  /^(public|site|www|website|landing|web|static|docs|dist|build)\/index\.html?$/i,
  /^(src\/)?app\/(?:\([^/]+\)\/)?page\.(tsx|jsx|js|ts|mdx|md)$/i,
  /^(src\/)?pages\/index\.(tsx|jsx|js|ts|astro|vue|mdx|md)$/i,
  /^src\/routes\/(\+page\.svelte|index\.svelte|index\.tsx|index\.jsx)$/i,
  /^src\/index\.html?$/i,
  /^(app\/views\/(home|pages|landing)\/(index|home)\.html\.erb|templates\/(index|home|landing)\.html|resources\/views\/(welcome|home|index)\.blade\.php)$/i,
  /^(website|site|landing|www|docs)\/src\/(pages|app)\/(index|page)\.(tsx|jsx|js|astro|vue|mdx|md)$/i,
  /^src\/App\.(tsx|jsx|vue|svelte)$/i,
];

export function heroCandidates(files) {
  const rel = files.filter((f) => !f.denied && f.depth <= 6 && !f.rel.split('/').slice(0, -1).some((seg) => EXAMPLE_DIRS_RE.test(seg)));
  const out = [];
  for (const re of HERO_CANDIDATES) for (const f of rel) if (re.test(f.rel)) out.push(f.rel);
  const WS = /^(apps|packages|sites|services|web)\/[^/]+\//i;
  for (const re of HERO_CANDIDATES) for (const f of rel) if (WS.test(f.rel) && re.test(f.rel.replace(WS, ''))) out.push(f.rel);
  return [...new Set(out)];
}

function looksLikeHero(parsed) {
  return Boolean(parsed.h1) || (parsed.data_driven ?? []).length > 0 || parsed.text_lines.reduce((n, l) => n + l.text.length, 0) >= 300;
}

export const METRIC_TEXT_UNITS = ['date', 'email', 'url', 'text'];

export function buildExtraction(repo, opts = {}) {
  const { url = null, urlRole = null, screens = null, hero = null, heroSnapshot = null, profile = null, declaredClaims = null, metrics = null, maxFiles = 20000, maxDepth = 8, fetched = null } = opts;
  const walk = walkRepo(repo, { maxFiles, maxDepth });
  const rd = makeReader(repo);
  const notes = [];
  const gaps = [];
  const sources = [];
  const mentions = [];
  const numbers = [];
  const quotes = [];
  const logos = [];
  const badges = [];
  const audience = [];
  const alternatives = [];
  const promiseCandidates = [];
  const rel = (abs) => path.relative(repo, abs).split(path.sep).join('/');

  let heroDoc = null;
  let heroRef = null;
  let heroSourceMode = null;
  if (fetched) {
    const pageUrl = fetched.finalUrl ?? url;
    heroDoc = parseHeroHtml(fetched.html, pageUrl, { isUrl: true, snapshotRef: fetched.snapshotRef });
    heroRef = pageUrl; heroSourceMode = 'fetched';
    if (pageUrl !== url) notes.push(`--url ${url} redirected to ${pageUrl}; hero-page provenance uses the final URL`);
  } else if (hero) {
    const txt = hero.text;
    const isMd = /\.(md|mdx|markdown)$/i.test(hero.ref);
    if (isMd) {
      const md = parseMarkdown(txt, url ?? hero.ref);
      heroDoc = markdownAsHero(md, url ?? hero.ref, Boolean(url), url ? hero.ref : null);
    } else heroDoc = parseHeroHtml(txt, url ?? hero.ref, { isUrl: Boolean(url), snapshotRef: url ? hero.ref : null });
    heroRef = url ?? hero.ref; heroSourceMode = 'snapshot';
  } else {
    for (const cand of heroCandidates(walk.files)) {
      const txt = rd.readText(cand, MAX_HERO_BYTES);
      if (txt === null) continue;
      const parsed = /\.(md|mdx)$/i.test(cand) ? markdownAsHero(parseMarkdown(txt, cand), cand, false, null) : parseHeroHtml(txt, cand);
      if (looksLikeHero(parsed)) { heroDoc = parsed; heroRef = cand; heroSourceMode = 'repo'; break; }
      notes.push(`hero candidate ${cand} has no <h1> and little text (an app shell?) — skipped`);
    }
  }
  sources.push({ kind: 'hero-page', ref: heroRef, mode: heroSourceMode, opened: Boolean(heroDoc), url: url ?? null });
  if (!heroDoc) {
    if (url) gaps.push({ id: 'no-hero-page', where: 'hero page', reason: `--url ${url} was declared but no page content was read`, needed: 'pass --hero <saved html> (capture output) or --fetch outside the privacy profile' });
    else gaps.push({ id: 'no-hero-page', where: 'hero page', reason: 'no landing page found in the repository and no --url/--hero given', needed: 'a production URL (--url + --hero/--fetch) or the README as the promise source' });
  }

  if (heroDoc) {
    const H = heroDoc;
    for (const s of H.skipped_h1 ?? []) notes.push(`hero H1 "${s.text}" at ${s.source} skipped (${s.reason})`);
    for (const d of H.data_driven ?? []) gaps.push({ id: 'hero-data-driven', where: d.source, reason: `the hero page ${d.what} is a template expression (${d.excerpt}) — i18n / JSX / server data is not readable from the source`, needed: 'pass --hero <rendered html> from the capture step (prod-first), or --fetch outside the privacy profile' });
    if (H.h1 && !H.h1.brand_only) {
      promiseCandidates.push({ text: H.h1.text, source: H.h1.source, kind: 'h1', ...(H.h1.snapshot ? { snapshot: H.h1.snapshot } : {}) });
      mentions.push({ name: H.h1.text, rule: 'h1', source_kind: 'hero-page', source: H.h1.source, position: 0, excerpt: H.h1.text, state_change: withKind(stateChangeInText(H.h1.text), 'before-after copy') });
    } else if (H.h1) notes.push(`hero H1 "${H.h1.text}" is the product name, not a promise — the H1 rule did not fire; the promise falls back to the subhead / og:description`);
    if (H.subhead) promiseCandidates.push({ text: H.subhead.text, source: H.subhead.source, kind: 'subhead' });
    for (const k of ['og:title', 'og:description', 'description', 'twitter:title']) if (H.og[k]) promiseCandidates.push({ text: H.og[k].text, source: H.og[k].source, kind: k });
    if (H.title) promiseCandidates.push({ text: H.title.text, source: H.title.source, kind: 'title' });
    const declared = H.essence?.app?.features ?? [];
    if (declared.length) {
      declared.forEach((it, i) => mentions.push({ name: it.text, rule: 'first-feature-section', source_kind: 'hero-page', source: it.source, position: i + 1, excerpt: it.text, state_change: withKind(stateChangeInText(it.text), 'before-after copy') }));
      notes.push(`the page declares its feature list (JSON-LD featureList, ${declared.length} item(s)) — it stands for the first feature section`);
    } else if (H.feature_section) {
      H.feature_section.items.forEach((it, i) => mentions.push({ name: it.text, rule: 'first-feature-section', source_kind: 'hero-page', source: it.source, position: i + 1, excerpt: it.text, state_change: withKind(stateChangeInText(it.text), 'before-after copy') }));
    } else if (H.h1) gaps.push({ id: 'no-feature-section', where: heroRef, reason: 'no feature section found on the hero page (+2 rule cannot fire)', needed: 'a features section with ≥ 1 item, or README usage / CHANGELOG entries' });
    for (const q of H.quotes) quotes.push({ ...q, source_kind: 'hero-page' });
    for (const l of H.logos) logos.push({ ...l, source_kind: 'hero-page' });
    scanLines(H.text_lines, heroDoc.is_url ? { source: () => heroRef, snapshot: (line) => (heroSnapshotRef(heroDoc, fetched, hero) ? `${heroSnapshotRef(heroDoc, fetched, hero)}:${line}` : null) } : { source: (line) => `${heroRef}:${line}`, snapshot: () => null }, 'hero-page', { numbers, audience, alternatives });
    for (const c of [H.h1, H.subhead].filter(Boolean)) {
      const sc = stateChangeInText(c.text);
      for (const side of [sc?.before, sc?.after]) {
        const bare = side && /^[-−+]?\d[\d,.]*$/.test(side.trim()) ? side.trim() : null;
        if (bare && !numbers.some((n) => n.source === c.source && n.number === canonicalNumber(bare))) numbers.push({ value: bare, number: canonicalNumber(bare), unit: null, unit_kind: 'bare', pattern: 'before-after', start: 0, end: 0, context: truncate(c.text, 200), source: c.source, ...(c.snapshot ? { snapshot: c.snapshot } : {}), source_kind: 'hero-page', date: null, line: c.line });
      }
    }
  }

  const shots = productScreens(screens, { url, urlRole, landingH1: heroDoc?.h1?.text ?? null });
  sources.push({ kind: 'product-screens', ref: screens ? screens.ref : null, opened: Boolean(screens), screens: shots.kept.length, ...(shots.skipped ? { skipped_landing: shots.skipped } : {}) });
  if (shots.skipped) notes.push(`${shots.skipped} recorded screen(s) are the landing (its URL under --url-role landing, or its H1 on screen), not the product — skipped`);
  shots.kept.forEach((sc, i) => {
    sc.buttons.filter((w) => !GENERIC_UI_RE.test(w) && tokens(w).length >= 1).forEach((w, k) => mentions.push({ name: w, rule: 'product-screen', source_kind: 'product-screens', source: sc.source, position: i * 100 + k, excerpt: `action: ${w}`, state_change: null }));
    sc.headings.filter((w) => !GENERIC_UI_RE.test(w) && tokens(w).length >= 1).forEach((w, k) => mentions.push({ name: w, rule: 'product-heading', source_kind: 'product-screens', source: sc.source, position: i * 100 + 50 + k, excerpt: `heading: ${w}`, state_change: null }));
  });
  scanLines(shots.kept.map((sc) => ({ text: sc.text, line: sc.line })), { source: (line) => `${screens.ref}:${line}`, snapshot: () => null }, 'product-screens', { numbers, audience, alternatives });
  {
    const shown = new Set();
    const keep = numbers.filter((n) => n.source_kind !== 'product-screens' || (!shown.has(n.value) && Boolean(shown.add(n.value))));
    numbers.length = 0;
    numbers.push(...keep);
  }

  const readmeFile = walk.files.find((f) => !f.denied && f.depth === 1 && /^readme\.(md|mdx|markdown|rst|txt)$/i.test(f.base)) ?? walk.files.find((f) => !f.denied && f.depth === 1 && /^readme$/i.test(f.base)) ?? null;
  let readme = null;
  if (readmeFile) {
    const txt = rd.readText(readmeFile.rel);
    if (txt !== null) readme = parseMarkdown(txt, readmeFile.rel);
  }
  const docsFile = walk.files.find((f) => !f.denied && f.depth <= 3 && /^(docs?\/(readme|index|getting-started|quickstart|quick-start|usage|tutorial)\.(md|mdx|markdown)|(getting[-_]started|quickstart|quick[-_]start|usage|tutorial)\.(md|mdx|markdown))$/i.test(f.rel))
    ?? walk.files.find((f) => !f.denied && f.depth === 3 && /^(apps|packages|sites|services)\/[^/]+\/readme\.(md|mdx|markdown)$/i.test(f.rel))
    ?? null;
  let docs = null;
  const readDocs = () => {
    if (docs !== null || !docsFile) return docs;
    const txt = rd.readText(docsFile.rel);
    docs = txt === null ? false : parseMarkdown(txt, docsFile.rel);
    return docs;
  };
  if (!readme && readDocs()) { readme = docs; notes.push(`no README at the repository root; ${docs.ref} is read in its place (docs landing / quickstart)`); }
  sources.push({ kind: 'readme', ref: readme ? readme.ref : null, opened: Boolean(readme), docs: docsFile ? docsFile.rel : null });
  let readmeEx = null;
  let readmeExDoc = null;
  if (readme) {
    const one = readmeOneLiner(readme);
    if (one) promiseCandidates.push({ text: one.text, source: one.source, kind: 'readme-one-liner' });
    if (readme.h1 && !heroDoc) {
      promiseCandidates.push({ text: readme.h1.text, source: readme.h1.source, kind: 'readme-h1' });
      const nameTokens = new Set(tokens(productNameOf({ walk, rd, heroDoc: null, readme })?.value ?? ''));
      const descriptive = tokens(readme.h1.text).filter((t) => !nameTokens.has(t)).length >= 2;
      if (descriptive) mentions.push({ name: readme.h1.text, rule: 'h1', source_kind: 'readme', source: readme.h1.source, position: 0, excerpt: readme.h1.text, state_change: withKind(stateChangeInText(readme.h1.text), 'before-after copy') });
      else notes.push(`README H1 "${readme.h1.text}" is the product name, not a feature — the H1 rule did not fire (no hero page)`);
    }
    readmeEx = readmeExample(readme);
    readmeExDoc = readme;
    if (!readmeEx && readme !== docs && readDocs()) { readmeEx = readmeExample(docs); readmeExDoc = docs; if (readmeEx) notes.push(`README has no code block; the usage example comes from ${docs.ref} (docs quickstart)`); }
    if (readmeEx && readmeEx.feature) mentions.push({ name: readmeEx.feature, rule: 'readme-example', source_kind: 'readme', source: readmeEx.source, position: 0, excerpt: readmeEx.command, state_change: null });
    else if (!readmeEx) gaps.push({ id: 'no-readme-example', where: readme.ref, reason: 'README has no code block (the +2 README-example rule cannot fire)', needed: 'a Usage / Quick start example' });
    for (const im of readme.images) {
      const proofHeading = im.heading && /who uses|used by|users|trusted|customers|clients|partners|sponsors|backers|logos|powering|adopters/i.test(im.heading);
      const proofPath = /(^|\/)(users?|customers?|clients?|logos?|sponsors?|backers?|partners?|adopters?)\//i.test(im.src);
      if ((proofHeading || proofPath) && !/badge|shields/i.test(im.src)) logos.push({ text: im.alt || path.posix.basename(im.src.split('?')[0]).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), file: im.src, alt: im.alt || null, source: im.source, line: im.line, source_kind: 'readme', own_brand: false });
    }
    const media = readme.images.find((im) => /\.(gif|png|jpe?g|webp|mp4|svg)(\?|$)/i.test(im.src) && im.alt.length >= 3 && !logos.some((l) => l.source === im.source));
    if (media) mentions.push({ name: media.alt, rule: 'readme-media-subject', source_kind: 'readme', source: media.source, position: 0, excerpt: `${media.alt} (${media.src})`, state_change: null });
    for (const b of readme.badges) badges.push({ label: b.alt || path.posix.basename(b.src.split('?')[0]), src: b.src, source: b.source, source_kind: 'readme' });
    for (const q of readme.quotes) quotes.push({ ...q, source_kind: 'readme' });
    scanLines(readme.text_lines.map((l) => ({ ...l, in_quote: false })), { source: (line) => `${readme.ref}:${line}`, snapshot: () => null }, 'readme', { numbers, audience, alternatives });
  } else {
    gaps.push({ id: 'no-readme', where: 'repository root', reason: 'no README (and no docs landing page) found', needed: 'README.md (Standard README: one-liner, Background, Usage)' });
  }

  const isChangelog = (f) => !f.denied && /^(changelog|changes|history|releases|release-notes)(\.(md|mdx|markdown|rst|txt))?$/i.test(f.base) && !f.rel.split('/').slice(0, -1).some((seg) => EXAMPLE_DIRS_RE.test(seg));
  const changelogFile = walk.files.find((f) => f.depth <= 2 && isChangelog(f)) ?? walk.files.find((f) => f.depth === 3 && /^(apps|packages|sites|services)\//i.test(f.rel) && isChangelog(f)) ?? null;
  let changelog = null;
  let latestAdded = null;
  if (changelogFile) {
    const txt = rd.readText(changelogFile.rel);
    if (txt !== null) { changelog = parseMarkdown(txt, changelogFile.rel); latestAdded = changelogLatestAdded(changelog); }
  }
  sources.push({ kind: 'changelog', ref: changelogFile ? changelogFile.rel : null, opened: Boolean(changelog), latest_added: latestAdded ? { version: latestAdded.version, source: latestAdded.source, entries: latestAdded.items.length, unreleased: latestAdded.unreleased } : null });
  if (latestAdded) {
    if (latestAdded.unreleased) notes.push(`CHANGELOG: only the ${latestAdded.version ?? 'unreleased'} block has \`Added\` entries — they are unshipped; the story director decides whether a demo may promise them`);
    latestAdded.items.forEach((it, i) => mentions.push({ name: entryFeatureName(it.text), rule: 'changelog-added', source_kind: 'changelog', source: it.source, position: i + 1, excerpt: it.text, state_change: withKind(stateChangeInText(it.text), 'before-after copy') }));
    const dated = changelog.headings.filter((h) => h.level === 2 && /\d{4}-\d{2}-\d{2}/.test(h.text));
    if (dated.length >= 2) notes.push(`changelog velocity: ${dated.length} dated releases (${dated[dated.length - 1].text.match(/\d{4}-\d{2}-\d{2}/)[0]} → ${dated[0].text.match(/\d{4}-\d{2}-\d{2}/)[0]}) — source ${changelog.ref}:${dated[0].line}`);
    scanLines(changelog.text_lines.filter((l) => latestAdded.items.some((it) => it.lines.includes(l.line))).map((l) => ({ ...l, in_quote: false })), { source: (line) => `${changelog.ref}:${line}`, snapshot: () => null }, 'changelog', { numbers, audience, alternatives });
  } else if (changelog) gaps.push({ id: 'no-changelog-added', where: changelogFile.rel, reason: 'CHANGELOG has no `### Added` block (+2 rule cannot fire)', needed: 'Keep a Changelog `### Added` entries under the latest version' });
  else gaps.push({ id: 'no-changelog', where: 'repository', reason: 'no CHANGELOG found (no "latest Added", no release velocity)', needed: 'CHANGELOG.md (Keep a Changelog)' });

  const testimonialFiles = walk.files.filter((f) => !f.denied && /(^|\/)(testimonials?|customers?|case-stud(y|ies)|reviews|quotes|social-proof|proof)(\/|\.|$)/i.test(f.rel) && /\.(md|mdx|markdown|json|ya?ml|html?|txt)$/i.test(f.base) && !f.rel.split('/').slice(0, -1).some((seg) => EXAMPLE_DIRS_RE.test(seg))).slice(0, MAX_TESTIMONIAL_FILES);
  const testimonialRefs = [];
  for (const f of testimonialFiles) {
    const txt = rd.readText(f.rel);
    if (txt === null) continue;
    testimonialRefs.push(f.rel);
    const ext = path.posix.extname(f.base).toLowerCase();
    for (const q of parseTestimonialFile(txt, f.rel, ext)) quotes.push({ ...q, source_kind: 'testimonials' });
    if (ext === '.md' || ext === '.mdx' || ext === '.markdown' || ext === '.txt') {
      const md = parseMarkdown(txt, f.rel);
      const quoteLines = new Set(md.quotes.flatMap((q) => range(q.line, q.end)));
      scanLines(md.text_lines.map((l) => ({ ...l, in_quote: quoteLines.has(l.line) })), { source: (line) => `${f.rel}:${line}`, snapshot: () => null }, 'testimonials', { numbers, audience, alternatives });
    }
  }
  sources.push({ kind: 'testimonials', ref: testimonialRefs.length ? testimonialRefs : null, opened: testimonialRefs.length > 0 });
  const logoFiles = walk.files.filter((f) => /(^|\/)(logos?|customers?|clients?|partners?|brands?|trusted-by|users|sponsors?|backers?|adopters?)\/[^/]+\.(svg|png|jpe?g|webp|gif)$/i.test(f.rel) && !/(^|\/)(node_modules|examples?|fixtures?)\//i.test(f.rel)).slice(0, MAX_LOGO_FILES);
  for (const f of logoFiles) {
    const own = /^(public|static|assets|src|img|images)?\/?(logos?)\/?(logo|brand|icon|favicon)[^/]*$/i.test(f.rel);
    logos.push({ text: f.base.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), file: f.rel, alt: null, source: f.rel, line: null, source_kind: 'repo-files', own_brand: own });
  }

  const e2eFiles = walk.files.filter((f) => !f.denied && /\.(spec|test|e2e)\.[cm]?[jt]sx?$|\.cy\.[jt]sx?$|_test\.py$|^test_.*\.py$/i.test(f.base) && /(^|\/)(e2e|cypress|playwright|integration|tests?|__tests__|spec|specs|test-e2e|acceptance)\//i.test(f.rel) && !/(^|\/)node_modules\//.test(f.rel)).slice(0, MAX_E2E_FILES);
  const e2e = [];
  for (const f of e2eFiles) {
    const txt = rd.readText(f.rel, 256 * 1024);
    if (txt === null) continue;
    const parsed = parseE2E(txt, f.rel);
    if (parsed && parsed.tests.length > 0) e2e.push(parsed);
  }
  sources.push({ kind: 'e2e-tests', ref: e2e.length ? e2e.map((x) => x.ref) : null, opened: e2e.length > 0, tests: e2e.reduce((n, x) => n + x.tests.filter((t) => t.kind === 'test').length, 0) });
  for (const spec of e2e) {
    spec.tests.filter((t) => t.kind === 'test').forEach((t, i) => mentions.push({ name: t.title, rule: t.plumbing ? 'e2e-plumbing' : 'e2e-test', source_kind: 'e2e-tests', source: t.source, position: i, excerpt: t.title, state_change: t.asserts ? { kind: 'e2e test asserts an outcome', before: null, after: t.expectation, excerpt: `${t.title} → ${t.expectation ?? ''}` } : null }));
  }

  let userFlow = null;
  if (shots.kept.length >= 2) {
    const steps = shots.kept.map((sc) => ({ text: truncate([sc.headings[0] ?? sc.title ?? sc.path, sc.buttons.length ? `actions: ${sc.buttons.slice(0, 4).join(', ')}` : null].filter(Boolean).join(' — '), 160), source: sc.source }))
      .filter((st, k, all) => k === 0 || st.text !== all[k - 1].text);
    userFlow = { entry: steps[0], key_action: steps[1], result: steps[steps.length - 1], steps, source_files: [screens.ref], from: 'product-screens' };
  }
  const productTests = e2e.flatMap((s) => s.tests.filter((t) => t.kind === 'test').map((t) => ({ spec: s, t })));
  const heroTokens = [...new Set(mentions.filter((m) => m.rule !== 'e2e-test').flatMap((m) => tokens(m.name)))];
  const shares = ({ t }) => tokens(t.title).filter((x) => heroTokens.includes(x)).length;
  const pickTest = userFlow ? null : productTests.filter((x) => !x.t.plumbing && x.t.action && shares(x) >= 2)[0]
    ?? productTests.filter((x) => !x.t.plumbing && x.t.action)[0]
    ?? productTests.filter((x) => !x.t.plumbing)[0]
    ?? productTests[0] ?? null;
  const firstSpec = pickTest ? pickTest.spec : null;
  if (firstSpec) {
    const t = pickTest.t;
    userFlow = {
      entry: firstSpec.entry ? { text: firstSpec.entry.text, source: firstSpec.entry.source } : null,
      key_action: t ? { text: t.title, source: t.source } : null,
      result: t && t.expectation ? { text: t.expectation, source: `${firstSpec.ref}:${t.expectation_line}` } : (firstSpec.first_expect ? { text: firstSpec.first_expect.text, source: firstSpec.first_expect.source } : null),
      source_files: e2e.map((s) => s.ref),
      from: 'e2e-tests',
    };
  } else if (userFlow) {
  } else if (readmeEx && readmeEx.command) {
    userFlow = { entry: { text: readmeEx.command, source: readmeEx.source }, key_action: readmeEx.feature ? { text: readmeEx.feature, source: readmeEx.source } : null, result: null, source_files: [readme.ref], from: 'readme-example' };
    gaps.push({ id: 'no-e2e-flow', where: 'e2e tests', reason: 'no e2e spec found; the user flow is only the README example (no asserted result)', needed: 'a Playwright/Cypress spec, or the capture session (`events.jsonl`) decides the key action' });
  } else if (pageFlow(heroDoc)) {
    userFlow = pageFlow(heroDoc);
    notes.push(`user flow from the page's ${userFlow.from === 'product-video' ? 'product film description' : 'numbered steps'} (${userFlow.steps.length} steps) — how the owner describes the use; no asserted result`);
  } else gaps.push({ id: 'no-user-flow', where: 'e2e tests / README / hero page', reason: 'neither an e2e spec, a README example, a product film description nor a numbered steps block names the key action', needed: 'record-flow capture or a README usage example' });

  if (profile && profile.surface && /^(cli|library\/sdk|api\/backend)$/.test(profile.surface)) {
    audience.push({ persona: 'developers', evidence: `product-profile.json surface=${profile.surface}`, source: profile.__ref ?? 'product-profile.json:1', rule: 'README language / class: CLI, SDK or API ⇒ developers' });
  }
  for (const q of quotes) if (q.attribution && q.attribution.role) audience.push({ persona: q.attribution.role, evidence: `testimonial role${q.attribution.company ? ` at ${q.attribution.company}` : ''}`, source: q.source, rule: 'job titles in testimonials' });

  if (readmeEx && readmeEx.feature) {
    const norm = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const pn = productNameOf({ walk, rd, heroDoc, readme });
    const names = [pn?.value, readmeExDoc?.h1?.text?.split(/\s+[|–—-]\s+|\s*:\s+/)[0], ...packageNames({ walk, rd })].map(norm).filter((n) => n.length >= 3);
    const block = readmeExDoc?.code_blocks?.find((b) => b.source === readmeEx.block_source);
    const said = norm(block ? block.lines.join('\n') : readmeEx.command);
    if (names.length && !names.some((n) => said.includes(n))) {
      const m = mentions.find((x) => x.rule === 'readme-example');
      if (m) m.rule = 'readme-example-unrelated';
      notes.push(`README example \`${truncate(readmeEx.command, 60)}\` names neither the product nor its package — not a usage example of the product (0 points)`);
    }
  }

  const { ranked, tie_break: tieBreak } = scoreFeatures(mentions);
  const heroFeature = ranked[0] ?? null;
  if (!heroFeature) gaps.push({ id: 'no-hero-feature', where: 'hero page / README / CHANGELOG', reason: 'no feature candidate found in any source', needed: 'a hero H1, a feature section, a README usage example or a CHANGELOG `Added` entry' });
  else if (ranked.length >= 2 && ranked[0].score === ranked[1].score && ranked[0].state_change_score === ranked[1].state_change_score) {
    gaps.push({ id: 'hero-tie', where: 'scoring', reason: `"${ranked[0].name}" and "${ranked[1].name}" tie at ${ranked[0].score} with equal state-change evidence; broken by ${tieBreak}`, needed: 'the story director confirms the hero feature, or a before→after statement / e2e assertion for one of them' });
  }
  let heroState = null;
  if (heroFeature) {
    const sc = heroFeature.state_change[0] ?? null;
    const flowMatches = userFlow && userFlow.key_action && sameFeature(heroFeature.evidence.flatMap((e) => tokens(e.excerpt)), tokens(userFlow.key_action.text));
    heroState = {
      before_state: sc && sc.before ? { text: sc.before, source: sc.source } : null,
      key_action: flowMatches ? userFlow.key_action : (heroFeature.rules.find((r) => r.rule === 'readme-example') ? { text: heroFeature.rules.find((r) => r.rule === 'readme-example').excerpt, source: heroFeature.rules.find((r) => r.rule === 'readme-example').source } : null),
      after_state: sc && sc.after ? { text: sc.after, source: sc.source } : (flowMatches && userFlow.result ? userFlow.result : null),
    };
  }

  const promise = promiseCandidates.find((c) => c.kind === 'h1') ?? promiseCandidates.find((c) => c.kind === 'subhead') ?? promiseCandidates.find((c) => c.kind === 'og:description') ?? promiseCandidates.find((c) => c.kind === 'readme-one-liner') ?? promiseCandidates.find((c) => c.kind === 'readme-h1') ?? promiseCandidates.find((c) => c.kind === 'og:title') ?? promiseCandidates[0] ?? null;
  if (!promise) gaps.push({ id: 'no-promise', where: 'hero page / README', reason: 'no H1, README one-liner or og:title found', needed: 'a stated promise (H1 or README first paragraph)' });

  const productName = productNameOf({ walk, rd, heroDoc, readme });
  if (!productName) gaps.push({ id: 'no-product-name', where: 'manifests / hero page / README', reason: 'no package name, og:site_name, JSON-LD name, <title> or README H1', needed: 'a manifest `name` or a README H1' });

  const product = productEssence(heroDoc, { productName, readme, pageUrl: heroDoc?.is_url ? heroRef : null, repoCands: repoDescriptions({ walk, rd }), shots: shots.kept });
  if (heroDoc && !product.definition) gaps.push({ id: 'no-product-definition', where: heroRef, reason: 'no sentence on the page, in its JSON-LD or its meta description says what the product is', needed: 'a subhead or description of the form "<Name> is a <category> for <who>"' });

  let cta = null;
  if (heroDoc && heroDoc.cta) cta = { text: heroDoc.cta.text, href: heroDoc.cta.href, source: heroDoc.cta.source, kind: 'hero-cta' };
  else if (readme) {
    const install = readmeInstall(readme) ?? (readme !== docs && readDocs() ? readmeInstall(docs) : null);
    if (install) cta = { text: install.command, href: null, source: install.source, kind: 'readme-install' };
  }
  if (!cta) gaps.push({ id: 'no-cta', where: 'hero page / README', reason: 'no call-to-action link/button or install command found', needed: 'the site CTA text or an install command' });

  if (numbers.length === 0) gaps.push({ id: 'no-numbers', where: 'all sources', reason: 'no quantified outcome in sources (a number needs a source)', needed: 'a sourced number on the hero page, README or testimonials — or `--metrics` (investors)' });
  const namedQuotes = quotes.filter((q) => q.attribution && q.attribution.name);
  if (namedQuotes.length === 0) gaps.push({ id: 'no-named-quotes', where: 'hero page / testimonials', reason: quotes.length ? 'quotes found but none carries name + role + company' : 'no testimonial quote in sources', needed: 'a named testimonial (name, role, company) on the site or in testimonials/*' });
  if (logos.filter((l) => !l.own_brand).length === 0) gaps.push({ id: 'no-logos', where: 'hero page / public/logos', reason: 'no customer or partner logo found', needed: 'logo images in a customers/partners section or `public/logos/*`' });
  for (const b of badges) if (/stars?|stargazers|downloads?|\/dm\/|\/dt\/|\/dw\/|\/dy\/|users?|installs?|coverage|size|sponsors?|backers?|contributors?|forks?|followers?/i.test(`${b.src} ${b.label}`)) gaps.push({ id: 'badge-live-value', where: b.source, reason: `badge "${b.label}" renders a live number that is not in the repository text`, needed: 'capture the badge value with its date (stars / downloads) before it goes on screen' });

  const claims = [];
  const claimKey = new Set();
  const addClaim = (c) => {
    const key = `${c.kind}|${c.value}|${c.source}`;
    if (claimKey.has(key)) return claims.find((x) => `${x.kind}|${x.value}|${x.source}` === key);
    claimKey.add(key);
    const entry = { id: `c${String(claims.length + 1).padStart(3, '0')}`, ...c };
    claims.push(entry);
    return entry;
  };
  const truncatedNumbers = numbers.length > MAX_CLAIMS;
  numbers.sort((a, b) => Number(b.source_kind === 'product-screens') - Number(a.source_kind === 'product-screens'));
  for (const n of numbers.slice(0, MAX_CLAIMS)) addClaim({ kind: 'number', value: n.value, number: n.number, unit: n.unit, unit_kind: n.unit_kind, context: n.context, source: n.source, ...(n.snapshot ? { snapshot: n.snapshot } : {}), source_kind: n.source_kind, date: n.date, claim_type: n.source_kind === 'product-screens' ? 'demonstrated' : 'sourced', status: 'verified', declared: false, used_in: [] });
  if (truncatedNumbers) notes.push(`numbers truncated to ${MAX_CLAIMS} of ${numbers.length}`);
  for (const q of quotes) addClaim({ kind: 'quote', value: q.text, context: q.attribution && q.attribution.raw ? q.attribution.raw : null, attribution: q.attribution ?? null, source: q.source, ...(q.snapshot ? { snapshot: q.snapshot } : {}), source_kind: q.source_kind, date: null, claim_type: 'sourced', status: 'verified', named: Boolean(q.attribution && q.attribution.name), declared: false, used_in: [] });
  for (const l of logos) addClaim({ kind: 'logo', value: l.text, context: l.file ?? null, file: l.file ?? null, source: l.source, ...(l.snapshot ? { snapshot: l.snapshot } : {}), source_kind: l.source_kind, date: null, claim_type: 'sourced', status: 'verified', own_brand: Boolean(l.own_brand), declared: false, used_in: [] });

  const declaredResults = [];
  if (declaredClaims) {
    for (const d of declaredClaims.list) {
      const r = verifyDeclared(d, { claims, repo, rd, heroDoc, url });
      declaredResults.push(r);
      const existing = r.status === 'verified' ? claims.find((c) => c.kind === r.kind && c.status === 'verified' && sameClaimValue(c, r)) : null;
      if (existing) {
        const ids = [...(existing.declared_ids ?? []), ...(r.declared_id ? [r.declared_id] : [])];
        Object.assign(existing, { declared: true, declared_id: existing.declared_id ?? r.declared_id ?? null, declared_ids: ids, declared_source: existing.declared_source ?? r.declared_source ?? null, verification: r.verification, ...(r.date && !existing.date ? { date: r.date } : {}), ...(r.context && !existing.context ? { context: r.context } : {}) });
      } else {
        const added = addClaim({ kind: r.kind, value: r.value, number: r.number ?? null, unit: r.unit ?? null, context: r.context ?? null, source: r.source, source_kind: r.source_kind, date: r.date ?? null, claim_type: r.status === 'verified' ? 'sourced' : 'declared', status: r.status, declared: true, declared_id: r.declared_id ?? null, declared_ids: r.declared_id ? [r.declared_id] : [], declared_source: r.declared_source ?? null, verification: r.verification, used_in: [] });
        if (added && added.declared_id !== (r.declared_id ?? null) && r.declared_id && !(added.declared_ids ?? []).includes(r.declared_id)) { added.declared_ids = [...(added.declared_ids ?? []), r.declared_id]; added.verification = `${added.verification}; ${r.verification}`; }
      }
      if (r.status === 'unverified') gaps.push({ id: 'unverified-claim', value: r.value, kind: r.kind, where: declaredClaims.ref, reason: r.verification, needed: 'a `file:line` or URL in the sources that contains this value, or drop it from the script (QA-12)' });
    }
  }
  if (metrics) {
    for (const row of metrics.rows) {
      if (row.number === null && METRIC_TEXT_UNITS.includes(String(row.unit ?? '').toLowerCase())) {
        addClaim({ kind: 'text', value: row.value, number: null, unit: row.unit, context: row.name, source: row.source, source_kind: 'metrics', origin: row.origin ?? null, date: row.date ?? null, claim_type: 'sourced', status: 'verified', declared: true, declared_id: null, verification: `row ${row.line} of ${metrics.ref} (verbatim ${row.unit}${row.date ? '' : ' — date missing'})`, used_in: [] });
        if (!row.date) gaps.push({ id: 'metric-without-date', value: row.value, kind: 'text', where: row.source, reason: 'needs source and date for every row', needed: 'a `date` / `as_of` column' });
        continue;
      }
      addClaim({ kind: 'number', value: row.value, number: row.number, unit: row.unit ?? null, context: row.name, source: row.number === null ? null : row.source, source_kind: 'metrics', origin: row.origin ?? null, date: row.date ?? null, claim_type: row.number === null ? 'declared' : 'sourced', status: row.number === null ? 'unverified' : 'verified', declared: true, declared_id: null, verification: row.number === null ? `metrics row ${row.line} has no numeric value` : `row ${row.line} of ${metrics.ref} (verbatim, with date${row.date ? '' : ' — missing'}${row.origin ? `, origin: ${row.origin}` : ''})`, used_in: [] });
      if (row.number === null) gaps.push({ id: 'unverified-claim', value: row.value, kind: 'number', where: row.source, reason: 'metrics row has no numeric value', needed: 'a numeric value column' });
      else if (!row.date) gaps.push({ id: 'metric-without-date', value: row.value, kind: 'number', where: row.source, reason: 'needs source and date for every traction number', needed: 'a `date` / `as_of` column' });
    }
  }

  const counts = { total: claims.length, verified: claims.filter((c) => c.status === 'verified').length, unverified: claims.filter((c) => c.status === 'unverified').length, by_kind: { number: claims.filter((c) => c.kind === 'number').length, quote: claims.filter((c) => c.kind === 'quote').length, logo: claims.filter((c) => c.kind === 'logo').length, text: claims.filter((c) => c.kind === 'text').length } };

  const readPolicy = { rules: READ_DENY.map((r) => r.id), denied_files_seen: walk.skipped, content_read: [...rd.opened].sort(), content_read_total: rd.opened.size, oversized: [...rd.oversized].sort(), unreadable: [...rd.unreadable].sort(), external: heroSourceMode === 'fetched' ? (fetched.hosts ?? [new URL(url).host]).map((h) => `GET ${h}`) : [] };

  sources.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const story = {
    schema: STORY_SCHEMA,
    plugin_version: PLUGIN_VERSION,
    repo: path.basename(repo) || repo,
    url: url ?? null,
    fetched_url: heroSourceMode === 'fetched' ? heroRef : null,
    provenance: 'every `source` is `<file>:<line>` relative to the repository root, or the hero-page URL (with `snapshot: <file>:<line>` when a local copy exists); a field without a source is a gap, never a value',
    sources,
    product_name: productName,
    product,
    promise: promise ? { stated: promise.text, source: promise.source, ...(promise.snapshot ? { snapshot: promise.snapshot } : {}), from: promise.kind, claim_type: 'stated', derived: null, derived_by: 'story-director (rewrite, ≤ 60 chars)', candidates: promiseCandidates.map((c) => ({ text: c.text, from: c.kind, source: c.source })) } : { stated: null, source: null, claim_type: null, derived: null, candidates: promiseCandidates.map((c) => ({ text: c.text, from: c.kind, source: c.source })) },
    audience: dedupeBy(audience, (a) => `${a.persona.toLowerCase()}|${a.source}`),
    competitive_alternatives: dedupeBy(alternatives, (a) => `${a.marker}|${a.source}`),
    hero_feature: heroFeature ? {
      name: heroFeature.name,
      score: heroFeature.score,
      rules: heroFeature.rules,
      state_change: { score: heroFeature.state_change_score, evidence: heroFeature.state_change },
      tie_break: tieBreak,
      runner_up: ranked[1] ? { name: ranked[1].name, score: ranked[1].score, state_change_score: ranked[1].state_change_score } : null,
      evidence: heroFeature.evidence,
      ...heroState,
    } : null,
    features: ranked.map((r) => ({ name: r.name, score: r.score, rules: r.rules.map((x) => ({ rule: x.rule, points: x.points, source: x.source })), state_change_score: r.state_change_score, sources: r.sources })),
    scoring: { rules: SCORING.map((r) => ({ rule: r.rule, points: r.points, source: r.source })), tie_breaks: TIE_BREAKS.map((t) => t.id) },
    user_flow: userFlow,
    proof: {
      numbers: numbers.slice(0, MAX_CLAIMS).map((n) => ({ value: n.value, context: n.context, source: n.source, ...(n.snapshot ? { snapshot: n.snapshot } : {}), date: n.date })),
      quotes: quotes.map((q) => ({ text: q.text, name: q.attribution ? q.attribution.name : null, role: q.attribution ? q.attribution.role : null, company: q.attribution ? q.attribution.company : null, source: q.source, ...(q.snapshot ? { snapshot: q.snapshot } : {}) })),
      logos: logos.map((l) => ({ name: l.text, file: l.file ?? null, source: l.source, ...(l.own_brand ? { own_brand: true } : {}) })),
      badges: badges.map((b) => ({ label: b.label, src: b.src, source: b.source })),
      rule: 'the script writer may only use proof items that have a source; declared claims without one are `unverified` in claims-index.json (QA-12)',
    },
    cta,
    changelog: latestAdded ? { version: latestAdded.version, source: latestAdded.source, latest_added: latestAdded.items.map((it) => ({ text: truncate(it.text, 200), source: it.source })) } : null,
    gaps,
    notes,
    read_policy: readPolicy,
    scan: { files: walk.files.length, dirs: walk.dirs.length, truncated: walk.truncated, max_files: maxFiles, max_depth: maxDepth },
  };

  const claimsIndex = {
    schema: CLAIMS_SCHEMA,
    version: 1,
    plugin_version: PLUGIN_VERSION,
    generated_by: 'scripts/extract-story.mjs',
    repo: path.basename(repo) || repo,
    url: url ?? null,
    rule: 'every number, logo and quote that goes on screen or into SCRIPT.md must be listed here with a `file:line` or URL source; `status: unverified` items never reach the script and are shown in `gaps` before render (QA-12)',
    counts,
    claims,
    gaps: gaps.filter((g) => g.id === 'unverified-claim' || g.id === 'metric-without-date' || g.id === 'badge-live-value' || g.id === 'no-numbers'),
    declared: declaredClaims ? { ref: declaredClaims.ref, total: declaredResults.length, verified: declaredResults.filter((r) => r.status === 'verified').length, unverified: declaredResults.filter((r) => r.status === 'unverified').length } : null,
    metrics: metrics ? { ref: metrics.ref, rows: metrics.rows.length } : null,
  };
  return { story, claims: claimsIndex };
}

function withKind(sc, kind) { return sc ? { ...sc, kind } : null; }
const ref = (x, extra = {}) => (x && x.text ? { text: x.text, source: x.source, ...(x.snapshot ? { snapshot: x.snapshot } : {}), ...extra } : null);
const REBUILT_RE = /\brebuilt\b|reconstruct|not a (?:screen )?recording|simulated|mock-?up|illustration/i;

function packageNames({ walk, rd }) {
  if (!walk.files.some((x) => x.rel === 'package.json' && !x.denied)) return [];
  const txt = rd.readText('package.json');
  try {
    const j = txt === null ? {} : JSON.parse(txt);
    const name = typeof j.name === 'string' ? j.name : null;
    const bins = j.bin && typeof j.bin === 'object' ? Object.keys(j.bin) : [];
    return [name, name ? name.replace(/^@[^/]+\//, '') : null, ...bins].filter(Boolean);
  } catch { return []; }
}

const GENERIC_UI_RE = /^(?:sign ?(?:in|up|out)|log ?(?:in|out)|settings?|help|support|cancel|close|back|next|ok|yes|no|menu|search|profile|account|billing|home|dashboard|save|submit|continue|done|dismiss|accept(?: all)?(?: cookies)?|reject(?: all)?|cookies?|more|open|×|✕|…)$/i;

export function productScreens(screens, { url = null, urlRole = null, landingH1 = null } = {}) {
  const kept = [];
  let skipped = 0;
  if (!screens) return { kept, skipped };
  let landing = null;
  try { if (url && urlRole === 'landing') { const u = new URL(url); landing = u.origin + u.pathname.replace(/\/$/, ''); } } catch { landing = null; }
  String(screens.text).split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    let s;
    try { s = JSON.parse(raw); } catch { return; }
    if (!s || typeof s !== 'object') return;
    const at = String(s.url ?? '').replace(/\/$/, '');
    const list0 = Array.isArray(s.headings) ? s.headings.map((h) => cleanText(String(h)).toLowerCase()) : [];
    if ((landing && at === landing) || (landingH1 && list0.includes(cleanText(landingH1).toLowerCase()))) { skipped += 1; return; }
    let p = null;
    try { p = new URL(s.url).pathname; } catch { p = null; }
    const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => cleanText(x)) : []);
    kept.push({ line: i + 1, source: `${screens.ref}:${i + 1}`, step: s.step ?? null, action: s.action ?? null, path: p, title: typeof s.title === 'string' ? cleanText(s.title) : null, description: typeof s.description === 'string' && s.description.trim() ? cleanText(s.description) : null, headings: list(s.headings), nav: list(s.nav), buttons: list(s.buttons), text: typeof s.text === 'string' ? s.text : '', footage_t_sec: s.footage_t_sec ?? null });
  });
  return { kept, skipped };
}

function repoDescriptions({ walk, rd }) {
  const out = [];
  const lineOf = (txt, needle) => { const i = txt.split('\n').findIndex((l) => l.includes(needle)); return i >= 0 ? i + 1 : 1; };
  const has = (rel) => walk.files.some((x) => x.rel === rel && !x.denied);
  if (has('package.json')) {
    const txt = rd.readText('package.json');
    try { const d = txt === null ? null : JSON.parse(txt).description; if (typeof d === 'string' && cleanText(d).length >= 12) out.push({ text: cleanText(d), source: `package.json:${lineOf(txt, '"description"')}`, from: 'package.json description' }); } catch { }
  }
  for (const file of ['pyproject.toml', 'Cargo.toml']) {
    if (!has(file)) continue;
    const txt = rd.readText(file);
    const m = txt === null ? null : txt.match(/^\s*description\s*=\s*["']([^"'\n]{12,})["']/m);
    if (m) out.push({ text: cleanText(m[1]), source: `${file}:${lineOf(txt, m[0].trim())}`, from: `${file} description` });
  }
  return out;
}

export function pageFlow(heroDoc) {
  const E = heroDoc?.essence;
  if (!E) return null;
  if (E.steps.length >= 3) {
    const steps = E.steps.map((st) => ({ ...ref(st), ...(st.detail ? { detail: st.detail } : {}) }));
    return { entry: steps[0], key_action: steps[1], result: steps[steps.length - 1], steps, source_files: [heroDoc.ref], from: 'page-steps' };
  }
  for (const v of E.videos) {
    const said = v.description ?? v.label;
    const parts = listedParts(said?.text ?? v.caption);
    if (parts.length >= 3) {
      const steps = parts.map((p) => ({ text: p, source: said?.source ?? v.source, ...(said?.snapshot ?? v.snapshot ? { snapshot: said?.snapshot ?? v.snapshot } : {}) }));
      return { entry: steps[0], key_action: steps[1], result: steps[steps.length - 1], steps, source_files: [heroDoc.ref], from: 'product-video' };
    }
  }
  return null;
}

export function productEssence(heroDoc, { productName = null, readme = null, pageUrl = null, repoCands = [], shots = [] } = {}) {
  const E = heroDoc?.essence ?? { app: null, org: null, site: null, videos: [], steps: [] };
  const H = heroDoc ?? { og: {} };
  const name = productName?.value ?? null;
  const running = shots.filter((sc) => sc.description).map((sc) => ({ text: sc.description, source: sc.source, from: 'product-screen description', tier: 'product' }));
  const repo = [
    ...repoCands,
    ...(readme ? [readmeOneLiner(readme)].filter(Boolean).map((one) => ({ text: one.text, source: one.source, from: 'readme-one-liner' })) : []),
  ].map((c) => ({ ...c, tier: 'repository' }));
  const landing = [
    ref(H.subhead, { from: 'subhead' }), ref(E.app?.description, { from: 'ld:application description' }), ref(E.org?.description, { from: 'ld:Organization description' }),
    ref(H.og?.['og:description'], { from: 'og:description' }), ref(H.og?.description, { from: 'description' }),
  ].filter(Boolean).map((c) => ({ ...c, tier: 'landing' }));
  const cands = [...running, ...repo, ...landing];
  const esc = name ? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const namesIt = (t) => esc && (new RegExp(`\\b${esc}\\b[^.]{0,40}?\\b(?:is|are)\\s+(?:a|an|the|your)\\b`, 'i').test(t.split(/(?<=[.!?])\s/)[0]) || new RegExp(`^\\s*${esc}\\s+[a-z]+s\\b`).test(t));
  const definesIt = (t) => /\b(?:is|are)\s+(?:a|an|the|your)\b/i.test(t.split(/(?<=[.!?])\s/)[0]) || /^(?:an?|the)\s/i.test(t);
  const pick = (tier) => tier.find((c) => namesIt(c.text)) ?? tier.find((c) => c.from.startsWith('ld:')) ?? tier.find((c) => definesIt(c.text)) ?? null;
  const definition = pick(running) ?? pick(repo) ?? pick(landing);
  let appUrl = null;
  if (E.app?.url) {
    let differs = null;
    try { if (pageUrl) { const a = new URL(E.app.url.text); const b = new URL(pageUrl); differs = a.host !== b.host || a.pathname.replace(/\/$/, '') !== b.pathname.replace(/\/$/, ''); } } catch { differs = null; }
    appUrl = { value: E.app.url.text, source: E.app.url.source, ...(E.app.url.snapshot ? { snapshot: E.app.url.snapshot } : {}), differs_from_page: differs };
  }
  return {
    definition: definition ? { ...definition, text: truncate(definition.text, 320) } : null,
    definition_candidates: cands.map((c) => ({ text: truncate(c.text, 320), from: c.from, tier: c.tier, source: c.source })),
    category: ref(E.app?.category),
    app_url: appUrl,
    features: (E.app?.features ?? []).map((f) => ref(f)),
    videos: E.videos.map((v) => {
      const words = [v.description?.text, v.label?.text, v.caption].filter(Boolean).join(' ');
      return { name: v.name, description: v.description?.text ?? null, label: v.label?.text ?? null, caption: v.caption ?? null, duration_s: v.duration_s, url: v.url, source: v.source, ...(v.snapshot ? { snapshot: v.snapshot } : {}), rebuilt: REBUILT_RE.test(words), parts: listedParts(v.description?.text ?? v.label?.text ?? v.caption) };
    }),
    steps: E.steps.map((st) => ({ ...ref(st), ...(st.detail ? { detail: st.detail } : {}) })),
    screens: shots.slice(0, 20).map((sc) => ({ path: sc.path, title: sc.title, headings: sc.headings.slice(0, 6), actions: sc.buttons.filter((b) => !GENERIC_UI_RE.test(b)).slice(0, 8), nav: sc.nav.slice(0, 10), source: sc.source })),
    rule: "the owner's own statement of what the product is and how it is used — planning rubric Q1 (definition), Q4 (the app, not the landing), Q9 (steps); a product film is one story input, never a structure to copy and never this run's footage",
  };
}
function range(a, b) { const out = []; for (let i = a; i <= b; i += 1) out.push(i); return out; }
function dedupeBy(list, key) { const seen = new Set(); return list.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); }
function heroSnapshotRef(heroDoc, fetched, hero) { return fetched ? fetched.snapshotRef : (hero ? hero.ref : null); }

const DATE_RE = /\b(?:Q[1-4]\s?(?:19|20)\d\d|(?:19|20)\d\d-\d\d(?:-\d\d)?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(?:19|20)\d\d|(?:FY|H[12])\s?(?:19|20)?\d\d|as of [A-Za-z0-9 ,]+(?:19|20)\d\d)\b/;

function scanLines(lines, prov, sourceKind, sinks) {
  const seen = new Set(sinks.numbers.map((n) => `${n.value}|${n.source}`));
  for (let idx = 0; idx < lines.length; idx += 1) {
    const l = lines[idx];
    if (l.in_quote) continue;
    const src = prov.source(l.line);
    const snap = prov.snapshot(l.line);
    const date = (l.text.match(DATE_RE) ?? [null])[0];
    for (const n of numbersInLine(l.text)) {
      const key = `${n.value}|${src}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bare = l.text.replace(/\s+/g, ' ').trim().length <= n.value.length + 2;
      const labelLike = (t) => t && t.length >= 3 && t.length <= 80 && numbersInLine(t).length === 0 && !/^[—–-]\s/.test(t) && !/^[A-Z][a-z]+(?:\s[A-Z][a-z'’.-]+){1,3}$/.test(t) && !/\b(?:CEO|CTO|CFO|COO|founder|co-founder|engineer|manager|director|head of|lead|vp)\b/i.test(t);
      const prevText = bare && lines[idx - 1] && !lines[idx - 1].in_quote ? lines[idx - 1].text : null;
      const nextText = bare && lines[idx + 1] && !lines[idx + 1].in_quote ? lines[idx + 1].text : null;
      const prev = labelLike(prevText) ? prevText : null;
      const next = labelLike(nextText) ? nextText : null;
      sinks.numbers.push({ ...n, context: truncate(bare ? [prev, l.text, next].filter(Boolean).join(' — ') : l.text, 200), source: src, ...(snap ? { snapshot: snap } : {}), source_kind: sourceKind, date, line: l.line });
    }
    AUDIENCE_RE.lastIndex = 0;
    let m;
    while ((m = AUDIENCE_RE.exec(l.text)) !== null) sinks.audience.push({ persona: m[1].trim(), evidence: truncate(l.text, 160), source: src, rule: '"for X" statement' });
    const alt = l.text.match(ALTERNATIVE_RE);
    if (alt && l.text.length <= 400 && sinks.alternatives.length < MAX_ALTERNATIVES) sinks.alternatives.push({ marker: (alt[1] ?? alt[2]).toLowerCase(), sentence: truncate(l.text, 200), source: src, rule: 'contrast marker in copy (Dunford competitive alternatives)' });
  }
}

function productNameOf({ walk, rd, heroDoc, readme }) {
  const tryJson = (relPath, pick) => {
    const f = walk.files.find((x) => x.rel === relPath && !x.denied);
    if (!f) return null;
    const txt = rd.readText(relPath);
    if (txt === null) return null;
    try { const v = pick(JSON.parse(txt), txt); return v ? { ...v, source: `${relPath}:${v.line ?? 1}` } : null; } catch { return null; }
  };
  const lineOf = (txt, needle) => { const i = txt.split('\n').findIndex((l) => l.includes(needle)); return i >= 0 ? i + 1 : 1; };
  if (heroDoc && heroDoc.og['og:site_name']) return { value: heroDoc.og['og:site_name'].text, source: heroDoc.og['og:site_name'].source, from: 'og:site_name' };
  const ld = heroDoc?.essence;
  for (const [n, from] of [[ld?.app?.name, 'ld:application name'], [ld?.site?.name, 'ld:WebSite name'], [ld?.org?.name, 'ld:Organization name']]) {
    if (n && n.text && n.text.length <= 60) return { value: n.text, source: n.source, ...(n.snapshot ? { snapshot: n.snapshot } : {}), from };
  }
  const pkg = tryJson('package.json', (j, txt) => (typeof j.name === 'string' && j.name && j.private !== true ? { value: j.name.replace(/^@[^/]+\//, ''), line: lineOf(txt, '"name"'), from: 'package.json name' } : null));
  if (pkg) return pkg;
  for (const [file, re, from] of [['pyproject.toml', /^\s*name\s*=\s*["']([^"']+)["']/m, 'pyproject name'], ['Cargo.toml', /^\s*name\s*=\s*["']([^"']+)["']/m, 'Cargo name'], ['setup.py', /name\s*=\s*["']([^"']+)["']/, 'setup.py name']]) {
    const f = walk.files.find((x) => x.rel === file && !x.denied);
    if (!f) continue;
    const txt = rd.readText(file);
    if (txt === null) continue;
    const m = txt.match(re);
    if (m) return { value: m[1], source: `${file}:${lineOf(txt, m[0].split('\n')[0])}`, from };
  }
  if (heroDoc && heroDoc.title) {
    const t = heroDoc.title.text.split(/\s+[|–—-]\s+|\s*[:·]\s+/)[0].trim();
    if (t && t.length <= 60) return { value: t, source: heroDoc.title.source, from: 'title' };
  }
  if (readme && readme.h1) {
    const t = readme.h1.text.split(/\s+[|–—-]\s+|\s*:\s+/)[0].trim();
    if (t && t.length <= 60) return { value: t, source: readme.h1.source, from: 'readme-h1' };
  }
  const priv = tryJson('package.json', (j, txt) => (typeof j.name === 'string' && j.name ? { value: j.name.replace(/^@[^/]+\//, ''), line: lineOf(txt, '"name"'), from: 'package.json name (private)' } : null));
  return priv;
}

function markdownAsHero(md, ref, isUrl, snapshotRef) {
  const src = (line) => (isUrl ? ref : `${ref}:${line}`);
  const item = (text, line) => ({ text, source: src(line), line, ...(isUrl && snapshotRef ? { snapshot: `${snapshotRef}:${line}` } : {}) });
  const out = { kind: 'hero-page', ref, is_url: isUrl, title: null, og: {}, h1: md.h1 ? item(md.h1.text, md.h1.line) : null, subhead: null, cta: null, sections: [], feature_section: null, quotes: md.quotes.map((q) => ({ ...item(q.text, q.line), attribution: q.attribution })), logos: [], nav: [], text_lines: md.text_lines.map((l) => ({ ...l, in_quote: md.quotes.some((q) => l.line >= q.line && l.line <= q.end) })), audience_hits: [] };
  const one = readmeOneLiner(md);
  if (one) out.subhead = item(one.text, one.line);
  const feat = md.headings.find((h) => h.level >= 2 && FEATURE_SECTION_RE.test(h.text.replace(/\s+/g, '-')));
  if (feat) {
    const next = md.headings.find((h) => h.line > feat.line && h.level <= feat.level);
    const items = md.text_lines.filter((l) => l.line > feat.line && (!next || l.line < next.line) && l.bullet).map((l) => item(truncate(l.text, 200), l.line));
    if (items.length) out.feature_section = { tag: 'md', id: null, class: null, line: feat.line, source: src(feat.line), heading: item(feat.text, feat.line), items, feature_like: true, proof_like: false };
  }
  const link = md.links.find((l) => CTA_TEXT_RE.test(l.text) || CTA_HREF_RE.test(l.href));
  if (link) out.cta = { ...item(link.text, link.line), href: link.href };
  return out;
}

export function unitsCompatible(a, b) {
  const ua = a.unit ?? null; const ub = b.unit ?? null;
  if (ua === ub) return true;
  const kindA = a.unit_kind ?? (ua ? 'measure' : 'bare'); const kindB = b.unit_kind ?? (ub ? 'measure' : 'bare');
  const loose = (k) => k === 'bare' || k === 'large' || k === 'count';
  if (!ua) return loose(kindA) && loose(kindB);
  if (!ub) return loose(kindA) && loose(kindB);
  return kindA === 'count' && kindB === 'count';
}

export function sameClaimValue(a, b) {
  if (a.kind === 'number') {
    const parsed = b.number !== undefined && b.number !== null ? { number: b.number, unit: b.unit ?? null, unit_kind: b.unit_kind ?? (b.unit ? 'measure' : 'bare') } : parseDeclaredNumber(b.value);
    if (!parsed || parsed.number === null) return false;
    return a.number === parsed.number && unitsCompatible(a, parsed);
  }
  const norm = (s) => cleanText(String(s ?? '')).toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (a.kind === 'quote') return norm(a.value).includes(norm(b.value).slice(0, 40)) || norm(b.value).includes(norm(a.value).slice(0, 40));
  return norm(a.value) === norm(b.value) || (a.file && norm(path.posix.basename(a.file)).includes(norm(b.value)));
}

export function lineStatesNumber(line, want) {
  const hits = numbersInLine(cleanText(line));
  if (hits.some((h) => h.number === want.number && unitsCompatible(h, want))) return true;
  if (!want.unit) {
    const text = cleanText(line);
    const digits = String(want.value).replace(/[^\d.,   ]/g, '').trim();
    if (!digits) return false;
    const re = new RegExp(`(?<![\\d.,])${digits.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d.,])`, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      const covered = hits.find((h) => h.start <= m.index && h.end >= m.index + m[0].length);
      if (!covered || unitsCompatible(covered, want)) return true;
    }
  }
  return false;
}

function verifyDeclared(d, { claims, repo, rd, heroDoc, url }) {
  const kind = ['number', 'logo', 'quote'].includes(d.kind) ? d.kind : (parseDeclaredNumber(d.value) ? 'number' : 'quote');
  const value = String(d.value ?? '').trim();
  const base = { kind, value, context: d.context ?? null, declared_id: d.id ?? null, declared_source: d.source ?? null, date: d.date ?? null };
  const parsedNumber = kind === 'number' ? parseDeclaredNumber(value) : null;
  const normQ = (s) => cleanText(String(s ?? '')).toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const statesQuote = (line) => normQ(line).includes(normQ(value).slice(0, 40));
  const statesLogo = (line) => cleanText(line).toLowerCase().includes(value.toLowerCase());
  const states = (line) => (kind === 'number' ? (parsedNumber ? lineStatesNumber(line, parsedNumber) : false) : kind === 'quote' ? statesQuote(line) : statesLogo(line));
  const heroUrl = heroDoc && heroDoc.is_url ? heroDoc.ref : null;
  const sourceOk = (src) => {
    if (typeof src !== 'string' || !src) return null;
    if (/^https?:\/\//.test(src)) {
      if (!heroUrl || (src !== heroUrl && src !== url)) return { ok: false, why: `declared URL ${src} is not the hero page that was read — a URL is verified only against page content` };
      const hit = heroDoc.text_lines.find((l) => states(l.text));
      return hit ? { ok: true, why: `hero page ${heroUrl} states it (snapshot line ${hit.line})`, snapshotLine: hit.line } : { ok: false, why: `hero page ${heroUrl} does not state ${value}` };
    }
    const m = src.match(/^(.+?):(\d+)$/);
    if (!m) return { ok: false, why: `declared source "${src}" is not file:line or URL` };
    if (!insideRepo(repo, m[1]) || readDenied(m[1])) return { ok: false, why: `declared source ${src} is outside the repository or denied by — not opened` };
    const txt = rd.readText(m[1]);
    if (txt === null) return { ok: false, why: `declared source ${src} could not be read (missing, a symlink, or denied)` };
    const line = txt.split('\n')[Number(m[2]) - 1];
    if (line === undefined) return { ok: false, why: `declared source ${src}: line does not exist` };
    const ok = states(line);
    return { ok, why: ok ? `declared source ${src} states ${kind === 'quote' ? 'the quote' : value}` : `declared source ${src} does not state ${kind === 'quote' ? 'the quote' : value}${kind === 'number' ? ' (same number with the same unit required)' : ''}` };
  };
  const declared = sourceOk(d.source);
  if (declared && declared.ok) {
    const snapFile = heroDoc && heroDoc.h1 && heroDoc.h1.snapshot ? heroDoc.h1.snapshot.split(':')[0] : null;
    const snap = declared.snapshotLine && snapFile ? `${snapFile}:${declared.snapshotLine}` : null;
    return { ...base, ...(parsedNumber ? { number: parsedNumber.number, unit: parsedNumber.unit, unit_kind: parsedNumber.unit_kind } : {}), source: d.source, ...(snap ? { snapshot: snap } : {}), source_kind: 'declared', status: 'verified', verification: declared.why };
  }
  const rejected = declared ? ` (declared source rejected: ${declared.why})` : '';
  if (kind === 'number') {
    if (parsedNumber) {
      const hit = claims.find((c) => c.kind === 'number' && c.status === 'verified' && sameClaimValue(c, parsedNumber));
      if (hit) return { ...base, number: parsedNumber.number, unit: parsedNumber.unit, unit_kind: parsedNumber.unit_kind, source: hit.source, ...(hit.snapshot ? { snapshot: hit.snapshot } : {}), source_kind: hit.source_kind, status: 'verified', verification: `found as "${hit.value}" at ${hit.source}${rejected}` };
      const nearMiss = claims.find((c) => c.kind === 'number' && c.number === parsedNumber.number);
      return { ...base, number: parsedNumber.number, unit: parsedNumber.unit, unit_kind: parsedNumber.unit_kind, source: null, source_kind: 'declared', status: 'unverified', verification: declared ? declared.why : nearMiss ? `no source states ${value} — the closest is "${nearMiss.value}" at ${nearMiss.source} (different unit)` : `no source line contains ${value}` };
    }
    return { ...base, source: null, source_kind: 'declared', status: 'unverified', verification: `"${value}" is not a number the inventory recognises` };
  }
  if (kind === 'quote') {
    const hit = claims.find((c) => c.kind === 'quote' && sameClaimValue(c, { value }));
    if (hit) return { ...base, source: hit.source, ...(hit.snapshot ? { snapshot: hit.snapshot } : {}), source_kind: hit.source_kind, status: 'verified', verification: `found at ${hit.source}${rejected}` };
    return { ...base, source: null, source_kind: 'declared', status: 'unverified', verification: declared ? declared.why : 'quote not found in any source' };
  }
  const hit = claims.find((c) => c.kind === 'logo' && sameClaimValue(c, { value }));
  if (hit) return { ...base, source: hit.source, ...(hit.snapshot ? { snapshot: hit.snapshot } : {}), source_kind: hit.source_kind, status: 'verified', verification: `found at ${hit.source}${rejected}` };
  const asFile = value && !readDenied(value) && insideRepo(repo, value) && fs.existsSync(path.resolve(repo, value)) ? value : null;
  if (asFile) return { ...base, source: asFile, source_kind: 'repo-files', status: 'verified', verification: `logo file ${asFile} exists` };
  return { ...base, source: null, source_kind: 'declared', status: 'unverified', verification: declared ? declared.why : 'logo not found in sources' };
}

export function parseDeclaredNumber(value) {
  const s = String(value ?? '').trim();
  const hit = numbersInLine(s)[0];
  if (hit) return hit;
  const m = s.match(/^([-−+]?(?:\d{1,3}(?:[,   ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?))\s*([A-Za-z%]{0,12})?$/);
  if (!m) return null;
  const unit = m[2] ? canonicalUnit(m[2]) : null;
  return { value: s, number: canonicalNumber(m[1]), unit, unit_kind: unit ? 'count' : 'bare', pattern: 'declared', start: 0, end: s.length };
}

export function loadDeclaredClaims(file, ref = path.basename(file)) {
  const txt = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(txt);
  const list = Array.isArray(data) ? data : Array.isArray(data.claims) ? data.claims : null;
  if (!list) throw new Error(`${file}: expected an array or { "claims": [...] }`);
  return { ref, list: list.filter((c) => c && typeof c === 'object' && c.value !== undefined && c.value !== null) };
}

export function loadMetrics(file, ref = path.basename(file)) {
  const txt = fs.readFileSync(file, 'utf8');
  const lines = txt.split(/\r?\n/);
  const header = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const col = (names) => header.findIndex((h) => names.includes(h));
  const iName = col(['name', 'metric', 'label', 'kpi', 'key']);
  const iValue = col(['value', 'number', 'amount', 'metric_value', 'val']);
  const iDate = col(['date', 'as_of', 'as-of', 'asof', 'period', 'month', 'quarter']);
  const iUnit = col(['unit', 'units']);
  const iOrigin = col(['source', 'src', 'origin', 'provenance']);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    const valueCell = iValue >= 0 ? cells[iValue] ?? '' : (cells.find((c) => numbersInLine(c).length) ?? '');
    const parsed = parseDeclaredNumber(`${valueCell}${iUnit >= 0 && cells[iUnit] ? ` ${cells[iUnit]}` : ''}`) ?? parseDeclaredNumber(valueCell);
    rows.push({ line: i + 1, source: `${ref}:${i + 1}`, name: iName >= 0 ? cells[iName] ?? null : (cells[0] ?? null), value: valueCell, token: parsed ? parsed.value : null, number: parsed ? parsed.number : null, unit: parsed ? (parsed.unit ?? (iUnit >= 0 ? cells[iUnit] || null : null)) : (iUnit >= 0 ? cells[iUnit] || null : null), date: iDate >= 0 ? cells[iDate] || null : null, origin: iOrigin >= 0 ? cells[iOrigin] || null : null });
  }
  return { ref, rows };
}

const PLAIN_RE = /^[A-Za-z_][A-Za-z0-9 _./()+×%€$£₴'’“”«»–—?!-]*$/;
const RESERVED_RE = /^(true|false|null|yes|no|on|off|~|y|n)$/i;

function yamlScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  const s = String(v);
  if (s === '' || !PLAIN_RE.test(s) || RESERVED_RE.test(s) || /[:#]\s|^\s|\s$|^[-?]|: $|^\d/.test(s) || s.includes(': ') || s.endsWith(':')) return JSON.stringify(s);
  return s;
}

export function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;
    let out = '';
    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        const body = toYaml(item, indent + 2);
        out += `${pad}- ${body.slice(indent + 2)}`;
      } else out += `${pad}- ${yamlScalar(item)}\n`;
    }
    return out;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return `${pad}{}\n`;
    let out = '';
    for (const k of keys) {
      const v = value[k];
      const key = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) ? k : JSON.stringify(k);
      if (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) out += `${pad}${key}:\n${toYaml(v, indent + 2)}`;
      else if (Array.isArray(v)) out += `${pad}${key}: []\n`;
      else if (v !== null && typeof v === 'object') out += `${pad}${key}: {}\n`;
      else out += `${pad}${key}: ${yamlScalar(v)}\n`;
    }
    return out;
  }
  return `${pad}${yamlScalar(value)}\n`;
}

export const MAX_REDIRECTS = 5;

export async function fetchHero(url, outDir, { fetchImpl = globalThis.fetch, log = (m) => console.error(m) } = {}) {
  const hosts = [];
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const host = new URL(current).host;
    hosts.push(host);
    log(`extract-story: network: GET ${host}${hop ? ' (redirect)' : ''} (network manifest — the only external calls of this script)`);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(current, { signal: ctl.signal, redirect: 'manual', headers: { 'user-agent': `power-presentation/${PLUGIN_VERSION} (+extract-story)`, accept: 'text/html,application/xhtml+xml' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current).href;
        if (hop === MAX_REDIRECTS) throw new Error(`more than ${MAX_REDIRECTS} redirects`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = (res.headers.get('content-type') ?? '').toLowerCase();
      if (type && !/text\/html|application\/xhtml\+xml|text\/plain/.test(type)) throw new Error(`not an HTML page (content-type ${type})`);
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_HERO_BYTES) throw new Error(`page larger than ${MAX_HERO_BYTES} bytes (content-length ${declared})`);
      const chunks = [];
      let bytes = 0;
      if (res.body && typeof res.body[Symbol.asyncIterator] === 'function') {
        for await (const chunk of res.body) {
          bytes += chunk.length;
          if (bytes > MAX_HERO_BYTES) { ctl.abort(); throw new Error(`page larger than ${MAX_HERO_BYTES} bytes`); }
          chunks.push(Buffer.from(chunk));
        }
      } else {
        const text = await res.text();
        if (Buffer.byteLength(text) > MAX_HERO_BYTES) throw new Error(`page larger than ${MAX_HERO_BYTES} bytes`);
        chunks.push(Buffer.from(text));
      }
      const html = relineHtml(Buffer.concat(chunks).toString('utf8'));
      const snapshotAbs = path.join(outDir, 'hero-page.html');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(snapshotAbs, html);
      return { html, finalUrl: current, hosts, snapshotAbs, snapshotRef: 'hero-page.html' };
    } finally { clearTimeout(timer); }
  }
  throw new Error('unreachable');
}

export async function main(argv, env = process.env) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { console.error(String(err.message)); console.error(USAGE); return 2; }
  if (opts.help) { console.log(USAGE); return 0; }
  if (opts.listScoring) { console.log(JSON.stringify({ source_order: SOURCE_ORDER, scoring: SCORING, tie_breaks: TIE_BREAKS, number_patterns: NUMBER_PATTERNS.map((p) => ({ id: p.id, source: p.source })) }, null, 2)); return 0; }
  try { if (!fs.statSync(opts.repo).isDirectory()) throw new Error('not a directory'); fs.readdirSync(opts.repo); } catch { console.error(`extract-story: --repo is not a readable directory: ${opts.repo}`); return 1; }

  const build = {};
  try {
    const outDir = opts.out !== '-' ? path.dirname(path.resolve(opts.out)) : opts.claimsOut !== '-' ? path.dirname(path.resolve(opts.claimsOut)) : process.cwd();
    const artefactRef = (abs) => { const r = path.relative(outDir, abs).split(path.sep).join('/'); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : path.basename(abs); };
    if (opts.hero) {
      const relHero = path.relative(opts.repo, opts.hero).split(path.sep).join('/');
      const inside = relHero && !relHero.startsWith('..') && !path.isAbsolute(relHero);
      if (readDenied(inside ? relHero : path.basename(opts.hero))) { console.error(`extract-story: --hero ${inside ? relHero : path.basename(opts.hero)} is denied by the read policy`); return 2; }
      const st = fs.lstatSync(opts.hero);
      if (st.isSymbolicLink() || !st.isFile()) { console.error('extract-story: --hero must be a regular file (symlinks are never followed)'); return 2; }
      if (st.size > MAX_HERO_BYTES) { console.error(`extract-story: --hero larger than ${MAX_HERO_BYTES} bytes`); return 1; }
      const raw = fs.readFileSync(opts.hero, 'utf8');
      const text = /\.(md|mdx|markdown)$/i.test(opts.hero) ? raw : relineHtml(raw);
      const relined = text !== raw;
      if (inside && !relined) build.hero = { text, ref: relHero };
      else if (opts.out === '-' && opts.claimsOut === '-') { build.hero = { text, ref: path.basename(opts.hero) }; if (relined) console.error('extract-story: --hero page was minified; lines refer to its re-lined form (pass --out to save that copy as hero-page.html)'); }
      else {
        const snapshotAbs = path.join(outDir, 'hero-page.html');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(snapshotAbs, text);
        build.hero = { text, ref: 'hero-page.html' };
        console.error(`extract-story: --hero copied to ${artefactRef(snapshotAbs)}${relined ? ' (re-lined: one block element per line)' : ''}`);
      }
    }
    if (opts.fetch) {
      if (privacyLocal(env, opts.privacy)) { console.error(`extract-story: --fetch refused under the privacy profile; network manifest: ${new URL(opts.url).host}. Pass --hero <saved html> from the capture step instead.`); return 2; }
      build.fetched = await fetchHero(opts.url, outDir);
    }
    if (opts.profile) { const txt = fs.readFileSync(opts.profile, 'utf8'); build.profile = JSON.parse(txt); const ln = txt.split('\n').findIndex((l) => /"surface"\s*:/.test(l)) + 1; build.profile.__ref = `${artefactRef(opts.profile)}:${ln || 1}`; }
    if (opts.screens) {
      const st = fs.lstatSync(opts.screens);
      if (st.isSymbolicLink() || !st.isFile()) { console.error('extract-story: --screens must be a regular file (symlinks are never followed)'); return 2; }
      if (st.size > MAX_HERO_BYTES) { console.error(`extract-story: --screens larger than ${MAX_HERO_BYTES} bytes`); return 1; }
      build.screens = { ref: artefactRef(opts.screens), text: fs.readFileSync(opts.screens, 'utf8') };
    }
    if (opts.claims) build.declaredClaims = loadDeclaredClaims(opts.claims, artefactRef(opts.claims));
    if (opts.metrics) build.metrics = loadMetrics(opts.metrics, artefactRef(opts.metrics));
  } catch (err) {
    console.error(`extract-story: ${err.message}`);
    return 1;
  }

  const { story, claims } = buildExtraction(opts.repo, { url: opts.url, urlRole: opts.urlRole, screens: build.screens ?? null, hero: build.hero ?? null, fetched: build.fetched ?? null, profile: build.profile ?? null, declaredClaims: build.declaredClaims ?? null, metrics: build.metrics ?? null, maxFiles: opts.maxFiles, maxDepth: opts.maxDepth });
  const yaml = `# story-extraction.yaml — provenance per field and the hero feature, generated by scripts/extract-story.mjs\n${toYaml(story)}`;
  const json = `${JSON.stringify(claims, null, 2)}\n`;
  try {
    if (opts.out !== '-') { fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true }); fs.writeFileSync(path.resolve(opts.out), yaml); }
    if (opts.claimsOut !== '-') { fs.mkdirSync(path.dirname(path.resolve(opts.claimsOut)), { recursive: true }); fs.writeFileSync(path.resolve(opts.claimsOut), json); }
  } catch (err) { console.error(`extract-story: cannot write output: ${err.message}`); return 1; }
  if (opts.print) console.log(JSON.stringify({ story, claims }, null, 2));
  else if (opts.out === '-') process.stdout.write(yaml);

  const hf = story.hero_feature;
  console.error(`extract-story: product=${story.product_name ? JSON.stringify(story.product_name.value) : 'null'} promise=${story.promise.stated ? 'yes' : 'no'} hero_feature=${hf ? `${JSON.stringify(hf.name)} (score ${hf.score}${hf.tie_break ? `, tie-break ${hf.tie_break}` : ''})` : 'null'} claims=${claims.counts.total} (verified ${claims.counts.verified}, unverified ${claims.counts.unverified}) gaps=${story.gaps.length}${opts.out !== '-' ? ` → ${opts.out}, ${opts.claimsOut}` : ''}`);
  for (const g of story.gaps) console.error(`  gap ${g.id}${g.value ? ` ${JSON.stringify(g.value)}` : ''}: ${g.reason}`);
  if (opts.strict && claims.counts.unverified > 0) return 3;
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`extract-story: ${err && err.stack ? err.stack : err}`); process.exit(1); });
