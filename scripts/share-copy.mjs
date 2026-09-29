import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { numbersInLine } from './extract-story.mjs';

export const SCHEMA = 'power-presentation/share-copy@0.1';
export const MODES = Object.freeze(['marketing', 'sales', 'investors']);

export const STOP_LIST = Object.freeze([
  { re: /\bseamless(?:ly)?\b/i, word: 'seamless' },
  { re: /\ball[- ]in[- ]one\b/i, word: 'all-in-one' },
  { re: /\bsupercharges?\b/i, word: 'supercharge' },
  { re: /\bunlocks?\b/i, word: 'unlock' },
  { re: /\bempowers?\b/i, word: 'empower' },
  { re: /\bgame[- ]changing\b/i, word: 'game-changing' },
  { re: /\bcutting[- ]edge\b/i, word: 'cutting-edge' },
  { re: /\binnovative\b/i, word: 'innovative' },
  { re: /\brevolutionary\b/i, word: 'revolutionary' },
  { re: /\beffortless(?:ly)?\b/i, word: 'effortless' },
  { re: /\bpowerful\b/i, word: 'powerful' },
  { re: /\bstreamlines?\b/i, word: 'streamline' },
  { re: /^\s*(?:an?\s+)?AI[- ]powered\b(?:\s+\S+){0,2}\s*[.!?]?\s*$/im, word: '"AI-powered" as the whole thesis' },
  { re: /\b10\s?[x×](?![^.!?\n]*\b(?:than|vs\.?|versus|from|compared|baseline|over)\b)/i, word: '"10x" without a base' },
  { re: /\b(?:we(?:'|’)?re|we are|i(?:'|’)?m|i am|so)\s+(?:thrilled|excited)\s+to\s+(?:announce|share)\b/i, word: '"we\'re excited to announce" / "excited to share"' },
]);

export const LIMITS = Object.freeze({ caption: 280, x: 280, productHuntTagline: 60, promise: 60, emailWords: 120 });

export const SECTIONS = Object.freeze({
  caption: { required: MODES, note: 'the canonical single caption — 1–3 sentences, ≤ 280 chars' },
  x: { required: MODES, note: '≤ 280 chars, CTA URL last' },
  linkedin: { required: MODES, note: 'first line = promise; one CTA' },
  'product-hunt': { required: ['marketing'], note: 'tagline ≤ 60 chars on the first line + maker comment' },
  email: { required: ['sales'], note: 'subject + body ≤ 120 words + GDPR Art. 14 notice + Art. 21(2) objection' },
  'investor-note': { required: ['investors'], note: 'one-liner, traction with dates, the ask, contact' },
  credits: { required: [], note: 'music credit (CC BY), disclosure, "Screen images simulated"' },
});

export const DISCLOSURE_LINE = 'This video contains AI-generated narration (EU AI Act Art. 50).';
export const TIER_C_LINE = 'Screen images simulated.';
export const GDPR_14 = 'We found your business contact details in public sources ({site}); we use them only to send this one message and delete them after 30 days (GDPR Art. 14).';
export const GDPR_21 = 'You can object to this at any time — reply "stop" and you will not hear from us again (GDPR Art. 21(2)).';

export const USAGE = `Usage: node scripts/share-copy.mjs init --mode <marketing|sales|investors> --product <name> [--video <mp4>]
                                     [--synthetic-voice] [--music-credit "<line>"] [--tier-c] [--prospect <json>] [--out share-copy.txt]
       node scripts/share-copy.mjs lint [share-copy.txt] --mode <mode> [--claims claims-index.json] [--run-report run-report.json]
                                     [--synthetic-voice] [--music-credit "<line>"] [--tier-c] [--json]
       node scripts/share-copy.mjs --list-rules

init  writes the share-copy.txt skeleton (mandatory lines filled, TODO placeholders for the copy).
lint  checks the file: stop-list, numbers against claims-index.json (QA-12), platform lengths,
      required sections per mode, mandatory lines (music credit, GDPR Art. 14 / 21(2)).
Exit codes: 0 clean / written, 3 violations, 2 usage, 1 unreadable input.`;

export function parseShareCopy(text) {
  const sections = {};
  const order = [];
  const header = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*\[([a-z][\w-]*)\]\s*$/i);
    if (m) {
      current = m[1].toLowerCase();
      if (!(current in sections)) { sections[current] = []; order.push(current); }
      continue;
    }
    if (current === null) { header.push(raw); continue; }
    if (/^\s*#/.test(raw)) continue;
    sections[current].push(raw);
  }
  const out = {};
  for (const [k, lines] of Object.entries(sections)) out[k] = lines.join('\n').trim();
  return { header, sections: out, order };
}

function firstSentence(s) {
  const m = s.replace(/\s+/g, ' ').trim().match(/^(.*?[.!?])(\s|$)/);
  return (m ? m[1] : s.replace(/\s+/g, ' ').trim());
}

function loadClaims(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const claims = Array.isArray(data) ? data : (data.claims ?? []);
  return claims.map((c) => {
    const sourced = Boolean(c.source) && String(c.status ?? 'verified').toLowerCase() !== 'unverified' && !c.decoy;
    if (c.kind === 'quote') return { id: c.id, number: null, sourced, quote: normQuote(String(c.value ?? '')) };
    const nums = numbersInLine(String(c.value ?? ''));
    const number = typeof c.number === 'number' ? c.number : (nums[0]?.number ?? null);
    return { id: c.id, number, sourced };
  });
}

function normQuote(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function quoteCovers(line, claims) {
  const t = normQuote(line);
  if (t.length < 12) return false;
  return claims.some((c) => c.quote && c.sourced && (c.quote.includes(t) || t.includes(c.quote)));
}

export function visibleNumbers(line) {
  const found = numbersInLine(line);
  const taken = found.map((n) => [n.start, n.end]);
  const re = /(?<![\w.:/#-])[-−+]?(\d{1,3}(?:[,\u00a0\u202f ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\w])/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const start = m.index; const end = start + m[0].length;
    if (taken.some(([a, b]) => start < b && end > a)) continue;
    const before = line.slice(Math.max(0, start - 14), start);
    const after = line.slice(end, end + 12);
    const digits = m[1];
    if (/\bv(?:ersion)?\s?$/i.test(before) || /^\.\d/.test(after)) continue;
    if (/^\s*:\s*\d/.test(after) || /\d:\s*$/.test(before)) continue;
    if (/^(19|20)\d\d$/.test(digits)) continue;
    if (/#\s*$/.test(before) || /\b(?:issue|pr|rfc|iso|soc|fr|nfr|qa|gs|cve|ticket|no|nr|№|step|art)[-\s.]?$/i.test(before)) continue;
    const number = Number.parseFloat(digits.replace(/[,\u00a0\u202f ]/g, '')) * (m[0].startsWith('-') || m[0].startsWith('−') ? -1 : 1);
    found.push({ value: m[0].trim(), number, unit: null, unit_kind: 'bare', pattern: 'bare', start, end });
  }
  return found.sort((a, b) => a.start - b.start);
}

function numberSourced(n, claims) {
  return claims.some((c) => c.sourced && c.number !== null && Math.abs(c.number - n) < 1e-9);
}

export function lintShareCopy(parsed, facts) {
  const v = [];
  const w = [];
  const { mode } = facts;
  const s = parsed.sections;
  const text = (name) => s[name] ?? '';

  for (const [name, spec] of Object.entries(SECTIONS)) {
    if (spec.required.includes(mode) && !text(name)) v.push({ rule: 'section-missing', section: name, detail: `[${name}] is required for ${mode}: ${spec.note}` });
  }
  for (const [name, body] of Object.entries(s)) {
    if (/\bTODO\b|<[^>\n]{2,60}>/.test(body)) v.push({ rule: 'placeholder', section: name, detail: 'TODO / <placeholder> left in the copy' });
  }
  for (const [name, body] of Object.entries(s)) {
    if (name === 'credits') continue;
    for (const { re, word } of STOP_LIST) {
      const m = body.match(re);
      if (m) v.push({ rule: 'stop-list', section: name, detail: `word ${word}: "${m[0].trim()}"` });
    }
  }
  if (facts.claims) {
    for (const [name, body] of Object.entries(s)) {
      if (name === 'credits') continue;
      for (const line of body.split('\n')) {
        if (/\bGDPR\b/.test(line)) continue;
        if (quoteCovers(line, facts.claims)) continue;
        const clean = line.replace(/\b(?:Art\.?|Article)\s*\d+(?:\(\d+\))?/g, ' ').replace(/https?:\/\/\S+/g, ' ');
        for (const n of visibleNumbers(clean)) {
          if (!numberSourced(n.number, facts.claims)) v.push({ rule: 'unsourced-number', section: name, detail: `"${n.value}" has no sourced claim in claims-index.json (QA-12)` });
        }
      }
    }
  } else {
    w.push({ rule: 'numbers-unchecked', section: null, detail: 'no --claims: numbers not checked against claims-index.json (QA-12)' });
  }
  if (text('caption').length > LIMITS.caption) v.push({ rule: 'length', section: 'caption', detail: `${text('caption').length} chars > ${LIMITS.caption}` });
  if (text('x').length > LIMITS.x) v.push({ rule: 'length', section: 'x', detail: `${text('x').length} chars > ${LIMITS.x}` });
  if (text('product-hunt')) {
    const tagline = text('product-hunt').split('\n')[0];
    if (tagline.length > LIMITS.productHuntTagline) v.push({ rule: 'length', section: 'product-hunt', detail: `tagline ${tagline.length} chars > ${LIMITS.productHuntTagline}` });
  }
  if (text('email')) {
    const body = text('email').split('\n').filter((l) => !/^subject:/i.test(l) && !/Art\.\s*(14|21)/.test(l)).join(' ');
    const words = body.split(/\s+/).filter(Boolean).length;
    if (words > LIMITS.emailWords) w.push({ rule: 'length', section: 'email', detail: `${words} words > ${LIMITS.emailWords} (letter should stay short)` });
  }
  if (facts.syntheticVoice && !/AI[- ]generated/i.test(text('credits')) && !/Art\.?\s*50/.test(text('credits'))) {
    v.push({ rule: 'ai-disclosure', section: 'credits', detail: `synthetic voice/presenter needs the disclosure line: ${DISCLOSURE_LINE}` });
  } else if (facts.syntheticVoice && !(/AI[- ]generated/i.test(text('credits')) && /Art\.?\s*50/.test(text('credits')))) {
    v.push({ rule: 'ai-disclosure', section: 'credits', detail: `disclosure line must name AI-generated content and Art. 50: ${DISCLOSURE_LINE}` });
  }
  if (facts.musicCredit && !text('credits').includes(facts.musicCredit)) {
    v.push({ rule: 'music-credit', section: 'credits', detail: `missing the CC BY credit line: ${facts.musicCredit}` });
  }
  if (mode === 'sales' && text('email')) {
    if (!/Art\.?\s*14\b/.test(text('email'))) v.push({ rule: 'gdpr-14', section: 'email', detail: 'the outreach letter must carry the GDPR Art. 14 information notice' });
    if (!/Art\.?\s*21\s*\(?2?\)?/.test(text('email'))) v.push({ rule: 'gdpr-21', section: 'email', detail: 'the outreach letter must carry the GDPR Art. 21(2) right to object' });
  }
  if (facts.tierC && !text('credits').includes(TIER_C_LINE.replace(/\.$/, ''))) {
    v.push({ rule: 'tier-c', section: 'credits', detail: `tier-C material in a marketing cut needs "${TIER_C_LINE}"` });
  }
  if (text('caption')) {
    const p = firstSentence(text('caption'));
    if (p.length > LIMITS.promise) w.push({ rule: 'promise', section: 'caption', detail: `first sentence ${p.length} chars > ${LIMITS.promise}` });
  }
  return { violations: v, warnings: w };
}

export function buildSkeleton(facts) {
  const { mode, product, video, syntheticVoice, musicCredit, tierC, prospect } = facts;
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `# share-copy.txt — ${SCHEMA}`,
    `# product: ${product} · mode: ${mode} · video: ${video ?? '<renders/final/…mp4>'} · generated: ${today}`,
    '# Rules: skills/present/references/share-copy.md — lint with `node scripts/share-copy.mjs lint share-copy.txt --mode ' + mode + ' --claims claims-index.json`',
    '',
    '[caption]',
    '# 1–3 sentences, ≤ 280 chars; first sentence = the promise (≤ 60 chars); every number from claims-index.json',
    mode === 'sales'
      ? `TODO ${prospect?.name ?? '<name>'}, ${prospect?.company ?? '<company>'} <pain in their words>. ${product} customers <sourced outcome>. Reply "yes" — Tuesday or Thursday?`
      : mode === 'investors'
        ? `TODO <one-liner for ${product}>. <traction: number · rate · window, as of <date>>. Raising <amount> to <milestone> by <deadline>.`
        : `TODO <promise ≤ 60 chars: noun + number/deadline/alternative>. <one concrete outcome with its sourced number>. <CTA in first person> → <URL>`,
    '',
    '[x]',
    'TODO <≤ 280 chars, CTA URL last>',
    '',
    '[linkedin]',
    '# first line = the promise; one CTA; keep the hook above the fold (about 1,300 chars)',
    'TODO <linkedin post>',
    '',
  ];
  if (mode === 'marketing') lines.push('[product-hunt]', 'TODO <tagline ≤ 60 chars>', 'TODO <maker comment, 2–3 sentences>', '');
  if (mode === 'sales') {
    lines.push('[email]',
      `Subject: TODO ${prospect?.company ?? '<company>'} — <outcome> in <number>`,
      `TODO ${prospect?.name ?? '<name>'}, <≤ 120 words; the video link; the same one-step CTA>`,
      '',
      GDPR_14.replace('{site}', prospect?.site ?? '<public site>'),
      GDPR_21,
      '');
  }
  if (mode === 'investors') lines.push('[investor-note]', `TODO <one-liner for ${product}> — <why now>. Traction as of <date>: <n1>, <n2>. Raising <amount> to <milestone> by <deadline>. <contact>`, '');
  const credits = [];
  if (musicCredit) credits.push(musicCredit);
  if (syntheticVoice) credits.push(`Voice: synthetic (Kokoro). ${DISCLOSURE_LINE}`);
  if (tierC) credits.push(TIER_C_LINE);
  lines.push('[credits]', ...(credits.length ? credits : ['# nothing to credit: no CC BY music, no synthetic voice, no tier-C material']), '');
  return lines.join('\n');
}

export function parseArgs(argv) {
  const opts = { command: null, file: null, mode: null, product: null, video: null, out: 'share-copy.txt', claims: null, runReport: null, syntheticVoice: false, musicCredit: null, tierC: false, prospect: null, json: false, help: false, listRules: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--list-rules') opts.listRules = true;
    else if (a === 'init' || a === 'lint') opts.command = a;
    else if (a === '--mode') opts.mode = argv[++i] ?? null;
    else if (a === '--product') opts.product = argv[++i] ?? null;
    else if (a === '--video') opts.video = argv[++i] ?? null;
    else if (a === '--out') opts.out = argv[++i] ?? null;
    else if (a === '--claims') opts.claims = argv[++i] ?? null;
    else if (a === '--run-report') opts.runReport = argv[++i] ?? null;
    else if (a === '--synthetic-voice') opts.syntheticVoice = true;
    else if (a === '--music-credit') opts.musicCredit = argv[++i] ?? null;
    else if (a === '--tier-c') opts.tierC = true;
    else if (a === '--prospect') opts.prospect = argv[++i] ?? null;
    else if (a === '--json') opts.json = true;
    else if (!a.startsWith('-') && opts.command === 'lint' && !opts.file) opts.file = a;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (opts.mode && !MODES.includes(opts.mode)) throw new Error(`--mode must be one of ${MODES.join('|')} (got ${opts.mode})`);
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(String(err.message));
    console.error(USAGE);
    return 2;
  }
  if (opts.help) { console.log(USAGE); return 0; }
  if (opts.listRules) {
    console.log(JSON.stringify({ schema: SCHEMA, sections: SECTIONS, stop_list: STOP_LIST.map((s) => s.word), limits: LIMITS, disclosure_line: DISCLOSURE_LINE, tier_c_line: TIER_C_LINE, gdpr: { art14: GDPR_14, art21: GDPR_21 } }, null, 2));
    return 0;
  }
  if (!opts.command) { console.error('init or lint is required'); console.error(USAGE); return 2; }
  if (!opts.mode) { console.error('--mode is required'); console.error(USAGE); return 2; }

  let prospect = null;
  if (opts.prospect) {
    try { prospect = JSON.parse(fs.readFileSync(opts.prospect, 'utf8')); } catch (err) { console.error(`cannot read --prospect: ${err.message}`); return 1; }
  }
  let syntheticVoice = opts.syntheticVoice;
  if (opts.runReport) {
    try {
      const rr = JSON.parse(fs.readFileSync(opts.runReport, 'utf8'));
      if (rr?.synthetic?.voice || rr?.synthetic?.presenter) syntheticVoice = true;
    } catch (err) { console.error(`cannot read --run-report: ${err.message}`); return 1; }
  }

  if (opts.command === 'init') {
    if (!opts.product) { console.error('--product is required for init'); console.error(USAGE); return 2; }
    const text = buildSkeleton({ mode: opts.mode, product: opts.product, video: opts.video, syntheticVoice, musicCredit: opts.musicCredit, tierC: opts.tierC, prospect });
    if (opts.out === '-') { process.stdout.write(text); return 0; }
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, text);
    console.log(`share-copy: skeleton written to ${opts.out} (${opts.mode}); fill every TODO, then lint`);
    return 0;
  }

  const file = opts.file ?? 'share-copy.txt';
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (err) { console.error(`cannot read ${file}: ${err.message}`); return 1; }
  let claims = null;
  if (opts.claims) {
    try { claims = loadClaims(opts.claims); } catch (err) { console.error(`cannot read --claims: ${err.message}`); return 1; }
  }
  const parsed = parseShareCopy(text);
  const result = lintShareCopy(parsed, { mode: opts.mode, claims, syntheticVoice, musicCredit: opts.musicCredit, tierC: opts.tierC });
  const report = { schema: SCHEMA, file, mode: opts.mode, ok: result.violations.length === 0, sections: parsed.order, ...result };
  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`share-copy lint: ${report.ok ? 'clean' : `${result.violations.length} violation(s)`}; sections: ${parsed.order.join(', ') || 'none'}`);
    for (const x of result.violations) console.log(`  FAIL ${x.rule} [${x.section ?? '-'}]: ${x.detail}`);
    for (const x of result.warnings) console.log(`  warn ${x.rule} [${x.section ?? '-'}]: ${x.detail}`);
  }
  return report.ok ? 0 : 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
