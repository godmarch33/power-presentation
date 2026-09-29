import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pluginData, pluginRoot } from './lib/paths.mjs';

export const BRAG_COMMIT = 'c893c5ed52aed84e3e2ee56787de869fccdae6b0';
const track = (vol, bytes, sha256) => ({
  file: `happy-beats-business-moves-vol-${vol}-by-ende-dot-app.mp3`,
  title: `Happy Beats / Business Moves Vol. ${vol}`,
  bytes, sha256,
  cues: `assets/cue-presets/happy-beats-business-moves-vol-${vol}-by-ende-dot-app.music-cues.json`,
});

const ENDE = Object.freeze({
  licence: 'CC-BY-4.0',
  licence_url: 'https://ende.app/en/standard-license',
  author: 'Sascha Ende / ende.app',
  credit: (t) => `Music: "${t.title}" by Sascha Ende / ende.app (CC BY 4.0)`,
  terms: ['Put the credit line in the description / credits and in run-report.json (CC BY 4.0).', 'Content ID registration of a video that uses these tracks is forbidden by the ende.app licence.'],
});
const calm = (stem, title, song, bytes, sha256, mood) => ({
  file: `${stem}-by-ende-dot-app.mp3`, title, bytes, sha256, mood,
  page: `https://ende.app/en/song/${song}`,
  cues: `assets/cue-presets/${stem}-by-ende-dot-app.music-cues.json`,
});

const SFX_MANIFEST = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(pluginRoot(), 'assets', 'sfx-pack.manifest.json'), 'utf8')); } catch { return { files: [] }; }
})();

export const SFX_ALIASES = Object.freeze({
  click: 'button press', tap: 'button press', select: 'selection', toggle: 'toggle', pop: 'card reveal', land: 'card reveal',
  whoosh: 'swipe', swipe: 'swipe', tick: 'sequential item', step: 'sequential item', panel: 'panel opening', open: 'panel opening',
  reveal: 'soft reveal', success: 'success', check: 'success', payoff: 'logo payoff', impact: 'major reveal', hit: 'major reveal', transition: 'hard transition',
});

export const MEDIA_PACKS = Object.freeze([
  Object.freeze({
    id: 'music-ende-happy-beats',
    kind: 'music',
    register: 'upbeat',
    mood: 'upbeat corporate pop: bright, driving, optimistic',
    ...ENDE,
    source: `https://github.com/latent-spaces/brag @ ${BRAG_COMMIT} (skills/brag/assets/music/)`,
    base_url: `https://raw.githubusercontent.com/latent-spaces/brag/${BRAG_COMMIT}/skills/brag/assets/music/`,
    host: 'raw.githubusercontent.com',
    files: Object.freeze([
      track(1, 3936384, 'aa56ab1cdcbef6b05566c6a7c114323078580ccf6a740a9e6c6b6c4b40b4389f'),
      track(9, 2728512, 'f5793597e520aa8fa9cce91086816fc1e15e3aac0128bcf375df51ba70c0dc63'),
      track(10, 1441152, 'f9912f2c962ada1e579f5ccc5a7d854d67e5e81ee96a7dd8c885a8480ae58d09'),
      track(11, 2103552, '364a546834db4c0c2e3b3240eb6df03e98b7362230154b04c5c614442f6660d7'),
      track(12, 2817792, '5888d4bd2ba0119b87a94e502ae2cc401c08192945cc5e5c2f8e8a33aa47a0a1'),
    ]),
  }),
  Object.freeze({
    id: 'music-ende-calm',
    kind: 'music',
    register: 'restrained',
    mood: 'restrained underscore',
    ...ENDE,
    source: 'https://ende.app — each song page (a free ende.app account downloads it); pinned to the 128 kbps stream MP3',
    access: 'account',
    base_url: null,
    host: 'ende.app (by hand, with an account)',
    files: Object.freeze([
      calm('the-turning-point', 'Documentary Music - The Turning Point', '13861-documentary-music-the-turning-point', 3916416, 'e40c90136d2e666fe0d86711cec4cbd9274945dc2d7be8b6f7658cce9b259156', 'analytical: warm electric piano, a steady electronic pulse, sub-bass; the pulse enters at ≈ 10.7 s'),
      calm('minimalist-neutral-focus', '9. Minimalist (Neutral Focus)', '13593-9-minimalist-neutral-focus-cinematic-underscore-loops-the-core-collection', 1819702, 'd50c8962035d0bed7ffcf82fdfebed96576239363f8ac622bcc5d40f8219ffee', 'neutral, "thinking": felt-mallet marimba and muted strings in a steady pattern'),
      calm('between-hours', 'Between Hours', '13500-between-hours', 2411976, 'b385c84dbad61e4eff2fc7db78456573e5963a0b8a983bcfdbd74a590411e09d', 'warm, hopeful: acoustic guitar and piano over a light, steady beat'),
      calm('morning-light', 'Podcast Music Vol. 24 [Morning Light]', '13188-podcast-music-vol-24-morning-light', 2779008, '481f357130d9c94feb1c502f5f788dae730392e5ac6265d55145996ccfc070e2', 'hopeful build: acoustic guitar and gentle piano, strings swell to a climax'),
    ]),
  }),
  Object.freeze({
    id: 'sfx-kenney',
    kind: 'sfx',
    licence: 'CC0-1.0',
    licence_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    author: 'Kenney (kenney.nl)',
    credit: () => 'Sound effects: Kenney (CC0) — courtesy, not required',
    terms: ['CC0: no attribution required; the plugin credits Kenney as a courtesy in assets/ATTRIBUTION.md.'],
    source: `https://github.com/latent-spaces/brag @ ${BRAG_COMMIT} (skills/brag/assets/sfx/), the ${SFX_MANIFEST.files.length} sounds analysed in assets/sfx-analysis.json`,
    base_url: `https://raw.githubusercontent.com/latent-spaces/brag/${BRAG_COMMIT}/skills/brag/assets/sfx/`,
    host: 'raw.githubusercontent.com',
    files: Object.freeze(SFX_MANIFEST.files.map((f) => ({ file: f.path, title: path.basename(f.path), bytes: f.bytes, sha256: f.sha256, duration: f.duration }))),
  }),
]);

export function packsDir(env = process.env) {
  const data = pluginData(env);
  return data ? path.join(data, 'media-packs') : null;
}

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function cueFacts(track, repo) {
  try { const c = JSON.parse(fs.readFileSync(path.join(repo, track.cues), 'utf8')); return { tempo: c.tempo ?? null, duration: c.duration ?? null }; } catch { return { tempo: null, duration: null }; }
}

export function packStatus(root, { repo = pluginRoot() } = {}) {
  return MEDIA_PACKS.map((p) => {
    const dir = root ? path.join(root, p.id) : null;
    const files = p.files.map((f) => {
      const abs = dir ? path.join(dir, f.file) : null;
      const present = Boolean(abs && fs.existsSync(abs));
      return { file: f.file, present, ok: present && fs.statSync(abs).size === f.bytes && sha256(abs) === f.sha256 };
    });
    const out = { id: p.id, dir, complete: files.every((f) => f.ok), files };
    if (p.kind === 'music') {
      out.register = p.register ?? null;
      out.tracks = p.files.map((f, i) => ({ name: trackName(f), title: f.title, mood: f.mood ?? p.mood ?? null, ...cueFacts(f, repo), ok: files[i].ok }));
    }
    return out;
  });
}

export function licencesMd(pack) {
  return [
    `# ${pack.id} — licences`,
    '',
    `Author: ${pack.author}. Licence: **${pack.licence}** (${pack.licence_url}).`,
    `Source: ${pack.source}.`,
    '',
    ...pack.terms.map((t) => `- ${t}`),
    '',
    '| File | Title | Credit line | sha256 |',
    '|---|---|---|---|',
    ...pack.files.map((f) => `| ${f.file} | ${f.page ? `[${f.title}](${f.page})` : f.title} | ${pack.credit(f)} | \`${f.sha256}\` |`),
    '',
  ].join('\n');
}

export function fetchPack(pack, root, { fromDir = null, download = curlDownload } = {}) {
  const dir = path.join(root, pack.id);
  fs.mkdirSync(dir, { recursive: true });
  const problems = [];
  let fetched = 0;
  let verified = 0;
  for (const f of pack.files) {
    const dest = path.join(dir, f.file);
    const good = () => fs.existsSync(dest) && fs.statSync(dest).size === f.bytes && sha256(dest) === f.sha256;
    if (good()) { verified += 1; continue; }
    if (!fromDir && pack.access === 'account') { problems.push(`${f.file}: not fetched — download "${f.title}" from ${f.page} (free account), then --from-dir <dir>`); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    try {
      if (fromDir) fs.copyFileSync(path.join(fromDir, f.file), tmp);
      else download(f.url ?? pack.base_url + f.file, tmp);
    } catch (err) { problems.push(`${f.file}: ${err.message}`); fs.rmSync(tmp, { force: true }); continue; }
    const got = fs.existsSync(tmp) ? sha256(tmp) : null;
    if (got !== f.sha256) { problems.push(`${f.file}: sha256 ${got ? got.slice(0, 12) : 'none'} ≠ pinned ${f.sha256.slice(0, 12)} — refused`); fs.rmSync(tmp, { force: true }); continue; }
    fs.renameSync(tmp, dest);
    fetched += 1; verified += 1;
  }
  fs.writeFileSync(path.join(dir, 'LICENSES.md'), licencesMd(pack));
  return { ok: problems.length === 0, fetched, verified, problems, dir };
}

function curlDownload(url, dest) {
  const r = spawnSync('curl', ['-sSfL', '--max-time', '120', '-o', dest, url], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`download failed (${(r.stderr || '').trim() || `curl exit ${r.status}`})`);
}

const MUSIC_SUFFIX = /-by-ende-dot-app$/;
export const trackName = (f) => f.file.replace(/\.mp3$/, '').replace(MUSIC_SUFFIX, '');

export function pickTrack(query) {
  const packs = MEDIA_PACKS.filter((p) => p.kind === 'music');
  const q = String(query ?? 'auto').toLowerCase().replace(/\.mp3$/, '');
  if (q === 'auto') return { pack: packs[0], track: packs[0].files[1] };
  const vol = q.match(/^vol-?(\d+)$/);
  for (const pack of packs) {
    const t = pack.files.find((f) => (vol ? f.file.includes(`-vol-${vol[1]}-`) : [f.file.replace(/\.mp3$/, ''), trackName(f)].includes(q)));
    if (t) return { pack, track: t };
  }
  return null;
}

export function resolveTrack(query, { root = packsDir(), repo = pluginRoot() } = {}) {
  const pick = pickTrack(query);
  if (!pick) return { ok: false, reason: `no music-pack track matches "${query}" (${MEDIA_PACKS.filter((p) => p.kind === 'music').flatMap((p) => p.files.map(trackName)).join(', ')})` };
  const file = root ? path.join(root, pick.pack.id, pick.track.file) : null;
  if (!file || !fs.existsSync(file)) return { ok: false, reason: pick.pack.access === 'account' ? `media pack ${pick.pack.id} not imported — download "${pick.track.title}" from ${pick.track.page} (free account) and run node scripts/media-packs.mjs fetch --pack ${pick.pack.id} --from-dir <dir>` : `media pack ${pick.pack.id} not fetched — node scripts/media-packs.mjs fetch (network: ${pick.pack.host})` };
  if (sha256(file) !== pick.track.sha256) return { ok: false, reason: `${pick.track.file} does not match its pinned sha256 — re-fetch the pack` };
  const cues = path.join(repo, pick.track.cues);
  return { ok: true, file, title: pick.track.title, credit: pick.pack.credit(pick.track), licence: pick.pack.licence, licence_url: pick.pack.licence_url, cues: fs.existsSync(cues) ? cues : null, sha256: pick.track.sha256, pack: pick.pack.id, register: pick.pack.register ?? null };
}

export function resolveSfx(cue, { root = packsDir(), repo = pluginRoot() } = {}) {
  const use = SFX_ALIASES[String(cue).toLowerCase()] ?? String(cue).toLowerCase();
  let analysis;
  try { analysis = JSON.parse(fs.readFileSync(path.join(repo, 'assets', 'sfx-analysis.json'), 'utf8')); } catch { return { ok: false, reason: 'assets/sfx-analysis.json missing' }; }
  const recs = analysis.recommendationsByUse?.[use];
  if (!Array.isArray(recs) || !recs.length) return { ok: false, reason: `no SFX use "${cue}" (words: ${Object.keys(SFX_ALIASES).join(', ')}; uses: ${Object.keys(analysis.recommendationsByUse ?? {}).join(', ')})` };
  const pack = MEDIA_PACKS.find((p) => p.id === 'sfx-kenney');
  for (const r of recs) {
    const rel = typeof r === 'string' ? r : r.path;
    const f = pack.files.find((x) => x.file === rel);
    const abs = root ? path.join(root, pack.id, rel) : null;
    if (f && abs && fs.existsSync(abs)) return { ok: true, use, path: rel, file: abs, duration: f.duration, licence: pack.licence, pack: pack.id, sha256: f.sha256 };
  }
  return { ok: false, reason: `SFX pack ${pack.id} not fetched — node scripts/media-packs.mjs fetch --pack ${pack.id}` };
}

export const USAGE = `media-packs.mjs — first-run media packs: fetch, verify, resolve

Usage:
  node scripts/media-packs.mjs list    [--json]
  node scripts/media-packs.mjs fetch   [--pack <id>] [--from-dir <dir>] [--confirm-network]
  node scripts/media-packs.mjs resolve <track|vol-N|auto> [--json]
  node scripts/media-packs.mjs resolve-sfx <click|whoosh|pop|impact|success|panel|…> [--json]

Packs: ${MEDIA_PACKS.map((p) => `${p.id} (${p.files.length} files, ${p.licence}, from ${p.host})`).join('; ')}
Exit codes: 0 ok · 3 missing / refused / hash mismatch · 2 usage · 1 error`;

export function parseArgs(argv) {
  const opts = { command: null, pack: null, fromDir: null, confirmNetwork: false, query: null, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--pack') opts.pack = argv[++i] ?? null;
    else if (a === '--from-dir') opts.fromDir = argv[++i] ?? null;
    else if (a === '--confirm-network') opts.confirmNetwork = true;
    else if (a === '--json') opts.json = true;
    else if (!opts.command && ['list', 'fetch', 'resolve', 'resolve-sfx'].includes(a)) opts.command = a;
    else if ((opts.command === 'resolve' || opts.command === 'resolve-sfx') && !opts.query && !a.startsWith('-')) opts.query = a;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

export function main(argv, env = process.env) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) { console.error(`${err.message}\n\n${USAGE}`); return 2; }
  if (opts.help || !opts.command) { console.log(USAGE); return opts.help ? 0 : 2; }
  const root = packsDir(env);
  if (!root) { console.error('no plugin data directory (CLAUDE_PLUGIN_DATA / POWER_PRESENTATION_DATA) — run node scripts/toolchain.mjs install first'); return 1; }
  if (opts.command === 'list') {
    const st = packStatus(root);
    if (opts.json) console.log(JSON.stringify(st, null, 2));
    else for (const p of st) {
      console.log(`${p.id}${p.register ? ` (${p.register})` : ''}: ${p.complete ? 'ready' : `${p.files.filter((f) => f.ok).length}/${p.files.length} verified`} in ${p.dir}`);
      for (const t of p.tracks ?? []) console.log(`  pack:${t.name} — "${t.title}" — ${t.mood}${t.tempo ? `; ${t.tempo} BPM` : ''}${t.duration ? `, ${Math.round(t.duration)} s` : ''}${t.ok ? '' : ' (not fetched)'}`);
    }
    return st.every((p) => p.complete) ? 0 : 3;
  }
  if (opts.command === 'resolve-sfx') {
    const r = resolveSfx(opts.query ?? 'click', { root });
    if (opts.json) console.log(JSON.stringify(r, null, 2));
    else console.log(r.ok ? `${r.file} (${r.use}, ${r.duration} s, ${r.licence})` : r.reason);
    return r.ok ? 0 : 3;
  }
  if (opts.command === 'resolve') {
    const r = resolveTrack(opts.query ?? 'auto', { root });
    if (opts.json) console.log(JSON.stringify(r, null, 2));
    else console.log(r.ok ? `${r.file}\n${r.credit}` : r.reason);
    return r.ok ? 0 : 3;
  }
  const privacyLocal = env.POWER_PRESENTATION_PRIVACY === 'local' || env.CLAUDE_PLUGIN_OPTION_PRIVACY === 'local';
  const skipped = opts.pack || opts.fromDir ? [] : MEDIA_PACKS.filter((p) => p.access === 'account');
  for (const p of skipped) console.log(`${p.id}: skipped — the files need a free account on ${p.author}; download them by hand and run fetch --pack ${p.id} --from-dir <dir>`);
  const packs = MEDIA_PACKS.filter((p) => (opts.pack ? p.id === opts.pack : !skipped.includes(p)));
  if (!packs.length) { console.error(`no pack ${opts.pack}`); return 2; }
  if (privacyLocal && !opts.fromDir && !opts.confirmNetwork && packs.some((p) => p.access !== 'account')) {
    console.error(`privacy local: fetching contacts ${[...new Set(packs.map((p) => p.host))].join(', ')} — re-run with --confirm-network after the user confirms, or --from-dir <dir> with the files`);
    return 3;
  }
  let ok = true;
  for (const p of packs) {
    const r = fetchPack(p, root, { fromDir: opts.fromDir });
    console.log(`${p.id}: ${r.ok ? 'ready' : 'INCOMPLETE'} — ${r.fetched} fetched, ${r.verified}/${p.files.length} verified → ${r.dir} (+ LICENSES.md)`);
    for (const x of r.problems) console.log(`  FAIL ${x}`);
    ok = ok && r.ok;
  }
  return ok ? 0 : 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
