import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MEDIA_PACKS, fetchPack, licencesMd, main, packStatus, pickTrack, resolveTrack } from './media-packs.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function fakePack(contents) {
  return {
    id: 'music-test', kind: 'music', licence: 'CC-BY-4.0', licence_url: 'https://example.invalid/licence', author: 'Test Author',
    credit: (t) => `Music: "${t.title}" by Test Author (CC BY 4.0)`, terms: ['Credit the author.'], source: 'test', base_url: 'https://example.invalid/', host: 'example.invalid',
    files: Object.entries(contents).map(([file, body]) => ({ file, title: file.replace('.mp3', ''), bytes: Buffer.byteLength(body), sha256: sha(body), cues: 'x' })),
  };
}

test('the pinned music pack: five CC BY 4.0 ende.app tracks with sizes, sha256 and a cue preset each', () => {
  const p = MEDIA_PACKS.find((x) => x.kind === 'music');
  assert.equal(p.licence, 'CC-BY-4.0');
  assert.equal(p.files.length, 5);
  for (const f of p.files) {
    assert.match(f.sha256, /^[0-9a-f]{64}$/);
    assert.ok(f.bytes > 1_000_000);
    assert.ok(fs.existsSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', f.cues)), `${f.cues} ships in the package`);
  }
  assert.match(p.base_url, /^https:\/\/raw\.githubusercontent\.com\/latent-spaces\/brag\/[0-9a-f]{40}\//, 'pinned to a commit');
  assert.equal(p.credit(p.files[1]), 'Music: "Happy Beats / Business Moves Vol. 9" by Sascha Ende / ende.app (CC BY 4.0)');
  assert.equal(pickTrack('auto').track.file, 'happy-beats-business-moves-vol-9-by-ende-dot-app.mp3');
  assert.equal(pickTrack('vol-12').track.title, 'Happy Beats / Business Moves Vol. 12');
  assert.equal(pickTrack('happy-beats-business-moves-vol-1-by-ende-dot-app').track.bytes, 3936384);
  assert.equal(pickTrack('vol-99'), null);
});

test('fetchPack(): downloads verified by sha256, a mismatch refused, --from-dir imports offline, LICENSES.md written, idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-packs-'));
  const pack = fakePack({ 'a.mp3': 'AAAA', 'b.mp3': 'BBBBBB' });
  const served = { 'a.mp3': 'AAAA', 'b.mp3': 'tampered' };
  let r = fetchPack(pack, root, { download: (url, dest) => fs.writeFileSync(dest, served[path.basename(url)]) });
  assert.equal(r.ok, false); assert.equal(r.verified, 1);
  assert.match(r.problems[0], /^b\.mp3: sha256 .* refused/);
  assert.equal(fs.existsSync(path.join(root, 'music-test', 'b.mp3')), false, 'a bad file is never kept');
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-src-'));
  fs.writeFileSync(path.join(src, 'b.mp3'), 'BBBBBB'); fs.writeFileSync(path.join(src, 'a.mp3'), 'AAAA');
  r = fetchPack(pack, root, { fromDir: src });
  assert.deepEqual([r.ok, r.fetched, r.verified], [true, 1, 2]);
  const lic = fs.readFileSync(path.join(root, 'music-test', 'LICENSES.md'), 'utf8');
  assert.match(lic, /\*\*CC-BY-4\.0\*\*/); assert.match(lic, /Music: "b" by Test Author/);
  assert.equal(lic, licencesMd(pack));
  r = fetchPack(pack, root, { download: () => { throw new Error('no network needed'); } });
  assert.deepEqual([r.ok, r.fetched], [true, 0]);
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true });
});

test('packStatus() / resolveTrack() / main(): a missing pack says how to fetch it; privacy local refuses the network fetch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-packs-'));
  assert.equal(packStatus(root)[0].complete, false);
  assert.match(resolveTrack('auto', { root }).reason, /not fetched — node scripts\/media-packs\.mjs fetch/);
  const p = MEDIA_PACKS[0];
  fs.mkdirSync(path.join(root, p.id), { recursive: true });
  fs.writeFileSync(path.join(root, p.id, p.files[1].file), 'not the track');
  assert.match(resolveTrack('vol-9', { root }).reason, /does not match its pinned sha256/);
  const env = { POWER_PRESENTATION_DATA: path.dirname(root), POWER_PRESENTATION_PRIVACY: 'local' };
  fs.mkdirSync(path.join(path.dirname(root), 'toolchain'), { recursive: true });
  assert.equal(main(['fetch'], { ...env, POWER_PRESENTATION_DATA: root }), 3, 'privacy local without --confirm-network or --from-dir');
  fs.rmSync(root, { recursive: true, force: true });
});

test('the calm pack: four restrained ende.app underscores, import only (the site needs an account), picked by short name, listed with mood and tempo', () => {
  const p = MEDIA_PACKS.find((x) => x.id === 'music-ende-calm');
  assert.equal(p.kind, 'music'); assert.equal(p.register, 'restrained'); assert.equal(p.licence, 'CC-BY-4.0'); assert.equal(p.access, 'account');
  assert.equal(p.files.length, 4);
  for (const f of p.files) {
    assert.equal(f.url, undefined, 'no download URL: the plugin never fetches an account-only file');
    assert.match(f.page, /^https:\/\/ende\.app\/en\/song\/\d+-/);
    assert.match(f.sha256, /^[0-9a-f]{64}$/); assert.ok(f.bytes > 1_000_000); assert.ok(f.mood);
    assert.ok(fs.existsSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', f.cues)), `${f.cues} ships in the package`);
  }
  assert.equal(p.credit(p.files[2]), 'Music: "Between Hours" by Sascha Ende / ende.app (CC BY 4.0)');
  assert.equal(pickTrack('the-turning-point').pack.id, 'music-ende-calm');
  assert.equal(pickTrack('between-hours-by-ende-dot-app.mp3').track.title, 'Between Hours');
  assert.equal(pickTrack('auto').track.file, 'happy-beats-business-moves-vol-9-by-ende-dot-app.mp3', 'auto stays the brag default');
  assert.equal(pickTrack('happy-beats-business-moves-vol-11').track.title, 'Happy Beats / Business Moves Vol. 11', 'the short name works for every pack');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-packs-'));
  assert.match(resolveTrack('nope', { root }).reason, /the-turning-point, minimalist-neutral-focus, between-hours, morning-light/);
  assert.match(resolveTrack('morning-light', { root }).reason, /music-ende-calm not imported — download "Podcast Music Vol\. 24 \[Morning Light\]" from https:\/\/ende\.app\/en\/song\/13188-.* --from-dir/);
  const net = fetchPack(p, root, { download: () => { throw new Error('the plugin must not download an account-only pack'); } });
  assert.equal(net.ok, false); assert.equal(net.fetched, 0); assert.equal(net.problems.length, 4);
  assert.match(net.problems[0], /^the-turning-point-by-ende-dot-app\.mp3: not fetched — download "Documentary Music - The Turning Point" from https:\/\/ende\.app\/en\/song\/13861-/);
  const st = packStatus(root).find((x) => x.id === 'music-ende-calm');
  assert.equal(st.register, 'restrained');
  assert.deepEqual(st.tracks.map((t) => t.name), ['the-turning-point', 'minimalist-neutral-focus', 'between-hours', 'morning-light']);
  assert.equal(st.tracks[2].tempo, 95.7); assert.equal(Math.round(st.tracks[2].duration), 150); assert.equal(st.tracks[2].ok, false);
  assert.equal(packStatus(root).find((x) => x.id === 'sfx-kenney').tracks, undefined, 'only music packs list tracks');
  const acct = { ...fakePack({ 'a.mp3': 'AAAA' }), id: 'music-acct', access: 'account' };
  acct.files[0].page = 'https://example.invalid/song/1';
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-src-')); fs.writeFileSync(path.join(src, 'a.mp3'), 'AAAA');
  assert.deepEqual([fetchPack(acct, root, { fromDir: src }).ok, fetchPack(acct, root).ok], [true, true], 'imported once, verified after');
  fs.rmSync(src, { recursive: true, force: true });
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-data-'));
  const logs = []; const log = console.log; console.log = (m) => logs.push(String(m));
  try { main(['fetch', '--pack', 'music-ende-calm'], { POWER_PRESENTATION_DATA: data }); } finally { console.log = log; }
  assert.ok(logs.some((l) => /music-ende-calm: INCOMPLETE — 0 fetched/.test(l)));
  assert.ok(logs.some((l) => /FAIL minimalist-neutral-focus-by-ende-dot-app\.mp3: not fetched — download/.test(l)));
  fs.rmSync(data, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
});

import { SFX_ALIASES, resolveSfx } from './media-packs.mjs';

test('the SFX pack: the 228 analysed Kenney sounds (CC0) pinned by the manifest; words resolve to the lowest-risk file', () => {
  const p = MEDIA_PACKS.find((x) => x.id === 'sfx-kenney');
  assert.equal(p.licence, 'CC0-1.0');
  assert.equal(p.files.length, 228);
  assert.ok(p.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.bytes > 0));
  assert.equal(SFX_ALIASES.click, 'button press');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-sfx-'));
  assert.match(resolveSfx('click', { root }).reason, /not fetched/);
  const click = p.files.find((f) => f.file === 'interface/click_003.ogg');
  fs.mkdirSync(path.join(root, p.id, 'interface'), { recursive: true });
  fs.writeFileSync(path.join(root, p.id, click.file), 'ogg');
  const r = resolveSfx('click', { root });
  assert.deepEqual([r.ok, r.use, r.path, r.licence], [true, 'button press', 'interface/click_003.ogg', 'CC0-1.0']);
  assert.match(resolveSfx('kazoo', { root }).reason, /no SFX use "kazoo"/);
  fs.rmSync(root, { recursive: true, force: true });
});
