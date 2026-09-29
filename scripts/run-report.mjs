import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pluginData } from './lib/paths.mjs';
import { HYPERFRAMES_PIN, HYPERFRAMES_RANGE, PLAYWRIGHT_PIN, PLUGIN_VERSION } from './lib/versions.mjs';
import { runProfile } from './lib/run-profile.mjs';

export const RUN_REPORT_SCHEMA = 'power-presentation/run-report@0.1';

export const STAGES = ['intake', 'inspect', 'capture', 'pitch', 'brief', 'design_spec', 'storyboard', 'audio', 'frames', 'assemble', 'transitions_captions', 'verify', 'review', 'render', 'deliver'];

export const GATE_TYPES = {
  'QA-01': 'hard', 'QA-02': 'hard', 'QA-03': 'hard', 'QA-04': 'default', 'QA-05': 'default', 'QA-06': 'hard', 'QA-07': 'default',
  'QA-08': 'hard', 'QA-09': 'default', 'QA-10': 'hard', 'QA-11': 'default', 'QA-12': 'hard', 'QA-13': 'default', 'QA-14': 'hard',
};

export const DISCLOSURE_LINE = 'Voiceover generated with AI (synthetic voice); no real person is speaking. EU AI Act Art. 50 disclosure.';
export const ON_SCREEN_DISCLOSURE = 'Narration is AI-generated.';
export const DISCLOSURE_RE = /\bAI[- ]generated\b|\bsynthetic (?:voice|narration)\b/i;

export function endCardDisclosure(storyboard) {
  const last = storyboard?.frames?.at(-1);
  const text = last?.texts?.map((t) => String(t)).find((t) => DISCLOSURE_RE.test(t));
  return text ? { frame: last.number, text } : null;
}

export const LOUDNESS_TARGETS = { social_vo: -14, vo_premium_investors: -16, music_only: -18 };

export const USAGE = `Usage: node scripts/run-report.mjs --project <dir> [options]

Write run-report.json from the artefacts of one /present project.

Options
  --project <dir>            the HyperFrames project (default: .)
  --out <file>               output (default: <project>/run-report.json; "-" = stdout)
  --capture <manifest.json>  capture manifest (default: <project>/.media/capture/capture-manifest.json, then capture/)
  --prospect <file>          the sales prospect record — only its field names are reported
  --doctor <doctor.json>     the doctor report (default: \${CLAUDE_PLUGIN_DATA}/doctor.json)
  --tokens <json>            {"estimate":{"usd":..,"printed_before_dispatch":true},"actual":{"usd":..,"input":..,"output":..}}
  --share-copy-lint <json>   the JSON printed by \`share-copy.mjs lint --json\`
  --critic <json>            QA/critic.json (three votes; default: <project>/QA/critic.json)
  --stage-times <json>       .hyperframes/pp-stages.json written by render-path.mjs (default)
  --now <ISO-8601>           generated_at (default: the clock; pass it for byte-identical reports)
  --print                    pretty-print to stdout as well
  -h, --help                 this text

Exit codes: 0 written · 1 runtime failure · 2 usage error
`;

export function parseArgs(argv) {
  const opts = { project: '.', out: null, capture: null, prospect: null, doctor: null, tokens: null, shareCopyLint: null, critic: null, stageTimes: null, now: null, print: false, help: false };
  const args = [...argv];
  const take = (flag) => { if (!args.length || (args[0].startsWith('-') && args[0] !== '-')) throw new Error(`${flag} needs a value`); return args.shift(); };
  while (args.length) {
    const a = args.shift();
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '--project': opts.project = take(a); break;
      case '--out': opts.out = take(a); break;
      case '--capture': opts.capture = take(a); break;
      case '--prospect': opts.prospect = take(a); break;
      case '--doctor': opts.doctor = take(a); break;
      case '--tokens': opts.tokens = take(a); break;
      case '--share-copy-lint': opts.shareCopyLint = take(a); break;
      case '--critic': opts.critic = take(a); break;
      case '--stage-times': opts.stageTimes = take(a); break;
      case '--now': opts.now = take(a); break;
      case '--print': opts.print = true; break;
      default: throw new Error(a.startsWith('-') ? `unknown flag ${a}` : `unexpected argument ${a}`);
    }
  }
  return opts;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return null; }
}
function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

export function parseStoryboard(md) {
  const out = { globals: {}, frames: [] };
  if (!md) return out;
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (m) out.globals[m[1]] = m[2].replace(/^"(.*)"$/, '$1').trim();
    }
  }
  const body = fm ? md.slice(fm[0].length) : md;
  const re = /^#{2,3}\s+(?:Frame|Beat|Scene)\s+(\d+)\s*[—–-]+\s*(.*)$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(body))) heads.push({ number: Number(m[1]), title: m[2].trim(), at: m.index, end: re.lastIndex });
  heads.forEach((h, i) => {
    const block = body.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : body.length);
    const frame = { number: h.number, title: h.title, keys: {}, texts: [] };
    for (const line of block.split(/\r?\n/)) {
      const b = line.match(/^\s*-\s+([A-Za-z_][\w-]*):\s*(.*)$/);
      if (!b) continue;
      const [, key, raw] = b;
      const value = raw.trim();
      if (key === 'text' || key === 'cta') frame.texts.push(value);
      else if (!(key in frame.keys)) frame.keys[key] = value.replace(/^"(.*)"$/, '$1');
    }
    out.frames.push(frame);
  });
  return out;
}

export function durationSeconds(v) {
  if (v == null) return null;
  const m = String(v).match(/^\s*([\d.]+)\s*(ms|s)?\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'ms' ? n / 1000 : n;
}

function frontmatterOf(md) {
  const fm = md?.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!fm) return out;
  for (const line of fm[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').trim();
  }
  return out;
}

function toolVersion(cmd, args = ['-version']) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
    return out.split(/\r?\n/)[0].replace(/^ffmpeg version\s+/, '').split(' ')[0] || null;
  } catch { return null; }
}

export const PRODUCT_ROLES = Object.freeze(['ui', 'demo', 'recording', 'terminal', 'code', 'api', 'design', 'file']);

export function sceneLabel(frame, mode) {
  const k = frame.keys;
  const tier = (k.evidence_tier || k.tier || '').toUpperCase();
  const productScreen = PRODUCT_ROLES.includes(String(k.role ?? '').trim().toLowerCase());
  const reconstructed = k.reconstructed === 'true' || (tier === 'C' && productScreen);
  let label = null;
  if (k.scene_type === 'design-frames' || k.role === 'design') label = 'Design preview';
  else if (reconstructed && mode === 'marketing') label = 'Screen images simulated';
  else if (reconstructed) label = 'reconstructed';
  const speed = k.speed ? `${String(k.speed).replace(/[x×]$/, '')}× speed` : null;
  return { tier: tier || null, reconstructed, label, speed_label: speed };
}

export function runClock(runs) {
  const spans = (Array.isArray(runs) ? runs : []).map((r) => {
    const end = Date.parse(r?.at);
    return Number.isFinite(end) && typeof r.seconds === 'number' ? [end - r.seconds * 1000, end] : null;
  }).filter(Boolean);
  if (!spans.length) return null;
  return Math.round((Math.max(...spans.map((x) => x[1])) - Math.min(...spans.map((x) => x[0]))) / 100) / 10;
}

const readJsonSafe = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export function buildReport(inputs, { now = new Date().toISOString() } = {}) {
  const { project, intake, storyboard, claims, wowprobe, check, critic, audioMeta, renders, shareCopy, shareCopyLint, stageTimes, egress, ledger, capture, prospect, doctor, tokens, srt, poster, missing } = inputs;
  const sb = parseStoryboard(storyboard);
  const mode = intake?.declared?.for ?? intake?.derived?.for?.value ?? wowprobe?.mode ?? sb.globals.audience ?? null;
  const privacy = intake?.privacy_profile ?? (intake?.declared?.privacy === 'local' ? 'local' : 'default');
  const lastRender = renders?.length ? renders[renders.length - 1] : null;

  const scenes = sb.frames.map((f) => {
    const { tier, reconstructed, label, speed_label } = sceneLabel(f, mode);
    return {
      id: String(f.number).padStart(2, '0'), title: f.title, role: f.keys.role ?? null, beat: f.keys.beat ?? null, scene_type: f.keys.scene_type ?? null,
      tier, reconstructed, label, speed_label, duration_s: durationSeconds(f.keys.duration), src: f.keys.src ?? null,
    };
  });
  const anyReconstructed = scenes.some((s) => s.reconstructed);

  const voices = Array.isArray(audioMeta?.voices) ? audioMeta.voices : [];
  const ttsProvider = audioMeta?.tts_provider ?? audioMeta?.provider ?? (voices.length ? 'kokoro' : null);
  const syntheticVoice = voices.length > 0;
  const disclosureRequired = syntheticVoice;
  const shareCopyHasDisclosure = shareCopy ? /synthetic voice|generated with AI|AI-generated|EU AI Act/i.test(shareCopy) : false;

  const loud = wowprobe?.measurements?.loudness ?? null;
  const qa08 = wowprobe?.gates?.['QA-08'] ?? null;
  const loudness = {
    integrated_lufs: loud?.integrated_lufs ?? null, true_peak_dbtp: loud?.true_peak_dbtp ?? null, lra_lu: loud?.lra_lu ?? null,
    target_lufs: wowprobe?.target_lufs ?? null, tolerance_lu: qa08?.threshold?.tolerance_lu ?? 1, true_peak_max_dbtp: qa08?.threshold?.true_peak_dbtp_max ?? -1,
    measured_on: loud ? 'master' : null, pass: qa08?.measured ? qa08.pass : null,
  };

  const gates = {};
  for (const id of Object.keys(GATE_TYPES)) {
    const g = wowprobe?.gates?.[id];
    gates[id] = g ? { pass: g.measured ? g.pass : null, measured: Boolean(g.measured), value: g.value ?? null, threshold: g.threshold ?? null, type: g.type ?? GATE_TYPES[id], reason: g.reason ?? null }
      : { pass: null, measured: false, value: null, threshold: null, type: GATE_TYPES[id], reason: 'no QA/wowprobe.json' };
  }

  const lintOk = check?.lint?.ok === true || check?.lint_ok === true;
  const samples = check?.layout?.samples ?? check?.samples ?? null;
  const checkCounted = Boolean(check) && lintOk && Array.isArray(samples) && samples.length > 0;

  const claimList = Array.isArray(claims?.claims) ? claims.claims : [];
  const claimsBlock = {
    verified: claimList.filter((c) => c.status === 'verified').length,
    unverified: claimList.filter((c) => c.status !== 'verified').map((c) => ({ id: c.id, value: c.value, kind: c.kind })),
    gaps: Array.isArray(claims?.gaps) ? claims.gaps.map((g) => ({ id: g.id, value: g.value ?? null, reason: g.reason ?? null })) : [],
    on_screen: claimList.filter((c) => Array.isArray(c.used_in) && c.used_in.length).length,
  };

  const cap = capture ? {
    chain_step: capture.chain_step ?? null, tier: capture.tier ?? null, environment: capture.environment ?? null,
    backend: capture.capture?.backend ?? null, source: capture.url ?? capture.source ?? null,
    skip_vision: privacy === 'local' ? true : (capture.skip_vision ?? null),
    redaction: {
      pre: [capture.redaction?.fixed_time ? 'clock.setFixedTime' : null, capture.redaction?.seeded ? 'seeded-data' : null].filter(Boolean),
      during: capture.redaction?.layer1_dom_masking?.applied ? ['dom-mask'] : [],
      post: capture.redaction?.layer2_ocr_gate?.ran ? ['ocr-regex', capture.redaction.layer2_ocr_gate.gitleaks === 'ok' ? 'gitleaks' : null].filter(Boolean) : [],
    },
    ocr_gate: { ran: Boolean(capture.redaction?.layer2_ocr_gate?.ran), matches: capture.redaction?.layer2_ocr_gate?.findings ?? null, confirmed: Boolean(capture.redaction?.layer2_ocr_gate?.confirmed), blocked: Boolean(capture.blocked) },
  } : { chain_step: null, tier: null, environment: null, backend: null, source: null, skip_vision: null, redaction: { pre: [], during: [], post: [] }, ocr_gate: { ran: false, matches: null, confirmed: false, blocked: false } };

  const stages = {};
  for (const s of STAGES) stages[s] = typeof stageTimes?.stages_s?.[s] === 'number' ? Math.round(stageTimes.stages_s[s] * 10) / 10 : null;
  const measuredStages = Object.values(stages).filter((v) => typeof v === 'number');
  const timed = typeof stageTimes?.wall_s === 'number' ? stageTimes.wall_s : (measuredStages.length ? Math.round(measuredStages.reduce((a, b) => a + b, 0) * 10) / 10 : null);
  const wall = runClock(stageTimes?.runs) ?? timed;

  const formats = lastRender?.formats ?? {};
  const deliverables = {
    mp4: { '16:9': formats['16:9'] ?? null, '9:16': formats['9:16'] ?? null, '1:1': null },
    poster: { path: poster?.path ?? null, baked_into_frame_0: Boolean(poster?.baked), at_s: poster?.at ?? null, reason: poster?.reason ?? null },
    srt: srt ?? {},
    share_copy: shareCopy != null ? 'share-copy.txt' : null,
    share_copy_lint: shareCopyLint ? { ok: shareCopyLint.ok ?? (Array.isArray(shareCopyLint.violations) ? shareCopyLint.violations.length === 0 : null), violations: shareCopyLint.violations?.length ?? null } : null,
    contact_sheet: wowprobe?.contact_sheet?.file ? path.relative(project, wowprobe.contact_sheet.file) : null,
  };

  const licences = Array.isArray(ledger) ? ledger.filter((e) => e && (e.license || e.licence)).map((e) => ({
    asset: e.path ?? e.file ?? e.dest ?? null, licence: e.license ?? e.licence ?? null, source: e.source ?? e.url ?? null, credit_line: e.credit ?? e.credit_line ?? null, sha256: e.sha256 ?? null,
  })) : [];

  const egressHosts = Array.isArray(egress) ? [...new Set(egress.map((e) => e.host).filter(Boolean))].sort() : [];

  const profile = runProfile({ intake });
  const criticBlock = critic ? {
    votes: critic.votes ?? (Array.isArray(critic.sheets) ? critic.sheets.length : null), dimensions: critic.dimensions ?? null,
    mean: critic.mean ?? null, min: critic.min ?? null, ship: critic.ship ?? null,
  } : { votes: 0, dimensions: null, mean: null, min: null, ship: null, ...(profile.critic === 'off' ? { off: true, off_by: profile.source.critic } : {}) };

  const gatesFailed = wowprobe?.gates_failed ?? [];
  const scorecard = wowprobe?.scorecard ? { total: wowprobe.scorecard.total, measured_weight: wowprobe.scorecard.measured_weight ?? null, band: wowprobe.scorecard.band ?? null, metrics: Object.fromEntries(Object.entries(wowprobe.scorecard.metrics ?? {}).map(([k, v]) => [k, { weight: v.weight, score: v.score, measured: v.measured }])) } : { total: null, measured_weight: null, band: null, metrics: {} };

  const prospectFields = prospect ? Object.keys(prospect).sort() : null;
  const askFrame = sb.frames.find((f) => /\bask\b/i.test(f.title) || f.keys.beat === 'ask' || f.keys.ask != null);
  const modeBlock = {
    sales: mode === 'sales' ? {
      prospect_fields: prospectFields, prospect_fields_ok: prospectFields ? prospectFields.every((k) => ['name', 'company', 'role', 'site', 'website', 'url'].includes(k)) : null,
      letter_gdpr: { art14: shareCopy ? /Art(?:\.|icle)?\s*14/.test(shareCopy) : null, art21_2: shareCopy ? /Art(?:\.|icle)?\s*21\s*\(2\)/.test(shareCopy) : null },
      purge_after_days: 30,
      retention: (() => { const r = readJsonSafe(path.join(project, '.hyperframes', 'prospect-retention.json')); return r ? { delete_after: r.delete_after ?? null, purged_at: r.purged_at ?? null } : null; })(),
    } : null,
    investors: mode === 'investors' ? {
      metrics_file: intake?.declared?.metrics ?? null, ask_card: Boolean(askFrame), ask_frame: askFrame ? String(askFrame.number).padStart(2, '0') : null,
      traction_verbatim: claimList.length ? claimList.filter((c) => c.source_kind === 'metrics').every((c) => c.status === 'verified') : null,
      tts_placeholder: syntheticVoice,
    } : null,
  };

  const report = {
    schema: RUN_REPORT_SCHEMA,
    generated_at: now,
    generated_by: `power-presentation ${PLUGIN_VERSION} scripts/run-report.mjs`,
    project: { dir: project, brief: fs.existsSync(path.join(project, 'BRIEF.md')) ? 'BRIEF.md' : null, storyboard_version: sb.globals.version ?? null, storyboard_approved: sb.globals.approved ?? null, mode, duration_brief_s: durationSeconds(sb.globals.duration) },
    versions: {
      plugin: PLUGIN_VERSION,
      hyperframes: { pinned: HYPERFRAMES_PIN, range: HYPERFRAMES_RANGE, installed: doctor?.hyperframes ?? lastRender?.hyperframes ?? null },
      node: process.version, ffmpeg: toolVersion('ffmpeg'), playwright: PLAYWRIGHT_PIN,
      tts: { engine: ttsProvider, version: null, voice: voices[0]?.voice ?? audioMeta?.voice ?? null },
      whisper: { model: audioMeta?.transcribe_model ?? (voices.some((v) => Array.isArray(v.words) && v.words.length) ? 'small.en' : null), language: 'en' },
      doctor_ok: doctor ? Boolean(doctor.gate?.ok) : null,
    },
    model_mix: {
      profile: tokens?.model_mix?.profile ?? profile.model_mix,
      roles: tokens?.model_mix?.roles ?? profile.roles,
    },
    tokens: {
      estimate: { usd: tokens?.estimate?.usd ?? null, printed_before_dispatch: tokens?.estimate?.printed_before_dispatch ?? null },
      actual: { usd: tokens?.actual?.usd ?? null, input: tokens?.actual?.input ?? null, output: tokens?.actual?.output ?? null },
      budget_usd: intake?.declared?.budget ?? intake?.derived?.budget?.value ?? 25,
      revision_rounds: tokens?.revision_rounds ?? 1,
    },
    cost: { tokens_usd: tokens?.actual?.usd ?? null, media_usd: tokens?.media_usd ?? 0, third_party_usd: tokens?.third_party_usd ?? 0 },
    time: { stages_s: stages, wall_s: wall, timed_s: timed, threshold_s: 45 * 60 },
    capture: cap,
    scenes,
    reconstructed: { any: anyReconstructed, confirmed_by_user: intake?.reconstructed_confirmed ?? null },
    synthetic: { voice: syntheticVoice, presenter: false, broll: false, provider: syntheticVoice ? ttsProvider : null },
    tts_placeholder: mode === 'investors' && syntheticVoice,
    disclosure: {
      required: disclosureRequired,
      line: disclosureRequired ? DISCLOSURE_LINE : null,
      placed_in: disclosureRequired ? [shareCopyHasDisclosure ? 'share-copy.txt' : null, endCardDisclosure(sb) ? 'credits' : null, 'run-report.json'].filter(Boolean) : [],
      on_screen: disclosureRequired ? endCardDisclosure(sb) : null,
      share_copy_has_line: disclosureRequired ? shareCopyHasDisclosure : null,
      ai_badge: null,
    },
    licences,
    fonts: { document_fonts_check: check ? (check.fonts?.ok === false ? 'fail' : 'pass') : null, faces: Array.isArray(check?.fonts?.faces) ? check.fonts.faces : [] },
    egress_hosts: egressHosts,
    privacy_profile: privacy,
    loudness,
    gates,
    gates_failed: gatesFailed,
    not_measured: wowprobe?.not_measured ?? null,
    waivers: wowprobe?.waivers ?? [],
    brief_overrides: wowprobe?.brief_overrides ?? [],
    check_counted: checkCounted,
    scorecard,
    critic: criticBlock,
    pairwise: null,
    claims: claimsBlock,
    mode: modeBlock,
    deliverables,
    render: lastRender ? { version: lastRender.version ?? null, at: lastRender.at ?? null, quality: lastRender.quality ?? null, fps: lastRender.fps ?? null, resolution: lastRender.resolution ?? null, sha256: lastRender.sha256 ?? null, index_sha256: lastRender.index_sha256 ?? null, wall_s: lastRender.wall_s ?? null, status: lastRender.status ?? null } : null,
    versions_history: Array.isArray(renders) ? renders.map((r) => ({ version: r.version ?? null, request: r.request ?? null, commit: r.commit ?? null, render_hash: r.sha256?.['16:9'] ?? null, at: r.at ?? null })) : [],
    ship: {
      gates_ok: Boolean(wowprobe) && gatesFailed.length === 0 && Object.keys(wowprobe?.not_measured ?? {}).length === 0,
      scorecard_ok: typeof scorecard.total === 'number' && scorecard.total >= 80,
      critic_ok: criticBlock.off ? null : criticBlock.ship === true,
      note: `ship = all 14 gates measured and passed + scorecard ≥ 80 + critic majority; a null here is an input that never ran, not a pass${criticBlock.off ? `; the critic was switched off (${criticBlock.off_by})` : ''}`,
    },
    inputs: { read: inputs.read, missing },
  };
  return report;
}

export function collectInputs(opts, env = process.env, home = os.homedir()) {
  const project = path.resolve(opts.project);
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new Error(`project directory not found: ${project}`);
  const read = [];
  const missing = [];
  const want = (label, file, reader, fills) => {
    if (!file) { missing.push({ input: label, file: null, fills }); return null; }
    const v = reader(file);
    if (v == null) missing.push({ input: label, file: path.relative(project, file) || file, fills });
    else read.push({ input: label, file: path.isAbsolute(file) && file.startsWith(project) ? path.relative(project, file) : file });
    return v;
  };
  const p = (...s) => path.join(project, ...s);
  const firstExisting = (...cands) => cands.find((c) => c && fs.existsSync(c)) ?? cands[0];
  const captureFile = opts.capture ? path.resolve(opts.capture) : firstExisting(p('.media', 'capture', 'capture-manifest.json'), p('capture', 'capture-manifest.json'));
  const doctorFile = opts.doctor ? path.resolve(opts.doctor) : path.join(pluginData(env, home), 'doctor.json');
  const declaredProspect = (() => { try { const d = JSON.parse(fs.readFileSync(p('intake.json'), 'utf8'))?.declared?.prospect; const v = typeof d === 'string' ? d : d?.value; return v ? path.resolve(project, v) : null; } catch { return null; } })();
  const prospectFile = opts.prospect ? path.resolve(opts.prospect) : declaredProspect;
  const tokensFile = opts.tokens ? path.resolve(opts.tokens) : (fs.existsSync(p('.hyperframes', 'tokens.json')) ? p('.hyperframes', 'tokens.json') : null);

  const inputs = {
    project, read, missing,
    intake: want('intake', p('intake.json'), readJson, 'project.mode, privacy_profile, tokens.budget_usd, mode.investors.metrics_file'),
    storyboard: want('storyboard', p('STORYBOARD.md'), readText, 'scenes[], project.storyboard_version'),
    claims: want('claims', p('claims-index.json'), readJson, 'claims'),
    wowprobe: want('wowprobe', p('QA', 'wowprobe.json'), readJson, 'gates, gates_failed, waivers, brief_overrides, scorecard, loudness'),
    check: want('check', p('QA', 'check.json'), readJson, 'check_counted, fonts'),
    critic: want('critic', opts.critic ? path.resolve(opts.critic) : p('QA', 'critic.json'), readJson, 'critic'),
    audioMeta: want('audio_meta', p('audio_meta.json'), readJson, 'synthetic.voice, disclosure, versions.tts'),
    renders: want('renders_manifest', p('renders', 'manifest.json'), readJsonl, 'deliverables.mp4, render, versions_history'),
    shareCopy: want('share_copy', p('share-copy.txt'), readText, 'deliverables.share_copy, disclosure.placed_in, mode.sales.letter_gdpr'),
    shareCopyLint: opts.shareCopyLint ? want('share_copy_lint', path.resolve(opts.shareCopyLint), readJson, 'deliverables.share_copy_lint') : null,
    stageTimes: want('stage_times', opts.stageTimes ? path.resolve(opts.stageTimes) : p('.hyperframes', 'pp-stages.json'), readJson, 'time.stages_s, time.wall_s'),
    egress: want('egress', p('.media', 'egress.jsonl'), readJsonl, 'egress_hosts'),
    ledger: want('media_ledger', p('.media', 'manifest.jsonl'), readJsonl, 'licences'),
    capture: want('capture_manifest', captureFile, readJson, 'capture'),
    prospect: prospectFile ? want('prospect', prospectFile, readJson, 'mode.sales.prospect_fields') : null,
    doctor: want('doctor', doctorFile, readJson, 'versions.hyperframes.installed, versions.doctor_ok'),
    tokens: tokensFile ? want('tokens', tokensFile, readJson, 'tokens, cost, model_mix') : null,
  };
  inputs.srt = {};
  inputs.poster = null;
  const last = inputs.renders?.length ? inputs.renders[inputs.renders.length - 1] : null;
  const master = last?.formats?.['16:9'];
  if (master) {
    const stem = path.join(project, master).replace(/\.mp4$/, '');
    for (const lang of ['en']) if (fs.existsSync(`${stem}.${lang}.srt`)) inputs.srt[lang] = path.relative(project, `${stem}.${lang}.srt`);
    const pj = readJson(`${stem}.poster.json`);
    if (pj) inputs.poster = { path: path.relative(project, pj.poster_png ?? `${stem}.poster.png`), baked: Boolean(pj.baked ?? pj.ok), at: pj.at ?? pj.poster_time ?? null, reason: pj.reason ?? pj.source ?? null };
    else if (fs.existsSync(`${stem}.poster.png`)) inputs.poster = { path: path.relative(project, `${stem}.poster.png`), baked: null, at: null, reason: null };
  }
  if (!Object.keys(inputs.srt).length) missing.push({ input: 'srt', file: master ? `${master.replace(/\.mp4$/, '')}.en.srt` : null, fills: 'deliverables.srt (SRT always)' });
  if (!inputs.poster) missing.push({ input: 'poster', file: master ? `${master.replace(/\.mp4$/, '')}.poster.json` : null, fills: 'deliverables.poster' });
  return inputs;
}

export function writeReport(opts, env = process.env) {
  const inputs = collectInputs(opts, env);
  const report = buildReport(inputs, { now: opts.now ?? new Date().toISOString() });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const out = opts.out === '-' ? null : path.resolve(opts.out ?? path.join(inputs.project, 'run-report.json'));
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, text); }
  return { report, out, text };
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { process.stderr.write(`run-report: ${err.message}\n\n${USAGE}`); return 2; }
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  let r;
  try { r = writeReport(opts); } catch (err) { process.stderr.write(`run-report: ${err.message}\n`); return 1; }
  if (!r.out || opts.print) process.stdout.write(r.text);
  if (r.out) {
    const rep = r.report;
    process.stderr.write(`run-report: ${r.out} — mode ${rep.project.mode ?? '?'}, gates_failed ${JSON.stringify(rep.gates_failed)}, not measured ${Object.keys(rep.not_measured ?? {}).length}, scorecard ${rep.scorecard.total ?? 'n/a'}, ${rep.inputs.read.length} inputs read, ${rep.inputs.missing.length} missing (${rep.inputs.missing.map((m) => m.input).join(', ') || 'none'})\n`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
