import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LEDGER, RECORDED_BY, fontLicence, freezeLedger, freezeProject, ledgerProblems, licenceSummary, main, parseArgs, projectMedia, readLedger } from './media-ledger.mjs';

function ttf({ family = 'Test Sans', url = 'https://openfontlicense.org', fsType = 0 } = {}) {
  const recs = [[1, family], [14, url]].filter(([, t]) => t);
  const strs = recs.map(([, t]) => Buffer.from(t, 'utf16le').swap16());
  const name = Buffer.alloc(6 + recs.length * 12);
  name.writeUInt16BE(recs.length, 2); name.writeUInt16BE(name.length, 4);
  let off = 0;
  recs.forEach(([id], i) => {
    const o = 6 + i * 12;
    name.writeUInt16BE(3, o); name.writeUInt16BE(1, o + 2); name.writeUInt16BE(0x409, o + 4); name.writeUInt16BE(id, o + 6);
    name.writeUInt16BE(strs[i].length, o + 8); name.writeUInt16BE(off, o + 10); off += strs[i].length;
  });
  const nameT = Buffer.concat([name, ...strs]);
  const os2 = Buffer.alloc(78); os2.writeUInt16BE(fsType, 8);
  const tables = [['OS/2', os2], ['name', nameT]];
  const dir = Buffer.alloc(12 + tables.length * 16);
  dir.writeUInt32BE(0x00010000, 0); dir.writeUInt16BE(tables.length, 4);
  let pos = dir.length;
  tables.forEach(([tag, body], i) => { const e = 12 + i * 16; dir.write(tag, e, 'latin1'); dir.writeUInt32BE(pos, e + 8); dir.writeUInt32BE(body.length, e + 12); pos += body.length; });
  return Buffer.concat([dir, ...tables.map(([, b]) => b)]);
}

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ledger-'));
  const w = (rel, data) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), data); };
  w('assets/voice/01.wav', 'RIFF-voice-1');
  w('assets/voice/02.wav', 'RIFF-voice-2');
  w('assets/footage.mp4', 'mp4-footage');
  w('.media/capture/footage.mp4', 'mp4-footage');
  w('.media/capture/capture-manifest.json', JSON.stringify({ tier: 'A', url: 'http://127.0.0.1:1/', capture: { backend: 'playwright-cdp-screencast' } }));
  w('.media/capture/events.jsonl', '{}\n');
  w('assets/fonts/Test.ttf', ttf());
  w('audio_meta.json', JSON.stringify({ tts_provider: 'kokoro', voice: 'am_michael', voices: [{ frame: 1, path: 'assets/voice/01.wav' }, { frame: 2, path: 'assets/voice/02.wav' }] }));
  return { dir, w };
}

test('freeze: every file the capture manifest lists under artifacts is own-capture — the VHS OCR frames too (GS-03)', () => {
  const { dir, w } = project();
  w('.media/capture/capture-manifest.json', JSON.stringify({ tier: 'A', capture: { backend: 'vhs' }, artifacts: ['footage.mp4', 'terminal.tape', 'capture-manifest.json', 'frames/', '../../assets/voice/01.wav'] }));
  w('.media/capture/frames/frame-00001.png', 'png-1');
  w('.media/capture/frames/frame-00002.png', 'png-2');
  freezeProject(dir, { now: '2026-09-27T00:00:00Z' });
  const byPath = Object.fromEntries(readLedger(dir).map((x) => [x.path, x]));
  for (const f of ['.media/capture/frames/frame-00001.png', '.media/capture/frames/frame-00002.png']) {
    assert.equal(byPath[f].license, 'own-capture', f);
    assert.equal(byPath[f].type, 'image');
    assert.equal(byPath[f].provenance.backend, 'vhs');
  }
  assert.equal(byPath['assets/voice/01.wav'].license, 'generated');
  assert.match(byPath['.media/capture/frames/frame-00001.png'].description, /^capture artifact/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('freeze: stills and a contact sheet cut from the footage inside .media/capture/ are own-capture too (GS-01)', () => {
  const { dir, w } = project();
  w('.media/capture/frames/f01.png', 'png-1');
  w('.media/capture/sheet.png', 'sheet');
  freezeProject(dir, { now: '2026-09-27T00:00:00Z' });
  const byPath = Object.fromEntries(readLedger(dir).map((x) => [x.path, x]));
  for (const f of ['.media/capture/frames/f01.png', '.media/capture/sheet.png']) {
    assert.equal(byPath[f].license, 'own-capture', f);
    assert.match(byPath[f].description, /^derived from the capture/);
  }
  w('.media/capture/capture-manifest.json', JSON.stringify({ tier: 'A', blocked: true }));
  w('.media/capture/sheet2.png', 'sheet2');
  freezeProject(dir, { now: '2026-09-27T00:00:00Z' });
  assert.equal(Object.fromEntries(readLedger(dir).map((x) => [x.path, x]))['.media/capture/sheet2.png'].license, 'unknown');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('projectMedia(): media files under assets/ and .media/ only, by extension', () => {
  const { dir, w } = project();
  w('renders/final/x.mp4', 'out'); w('assets/notes.txt', 'x');
  assert.deepEqual(projectMedia(dir), ['.media/capture/footage.mp4', 'assets/fonts/Test.ttf', 'assets/footage.mp4', 'assets/voice/01.wav', 'assets/voice/02.wav']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('freeze: plugin products and a font get their licence from evidence; the ledger is written and clean', () => {
  const { dir } = project();
  const r = freezeProject(dir, { now: '2026-09-26T00:00:00Z' });
  assert.deepEqual(r.problems, []);
  assert.equal(r.summary, 'generated ×2, own-capture ×2, OFL-1.1 ×1');
  const byPath = Object.fromEntries(readLedger(dir).map((x) => [x.path, x]));
  const v = byPath['assets/voice/01.wav'];
  assert.equal(v.type, 'voice'); assert.equal(v.id, 'voice_001'); assert.equal(v.license, 'generated'); assert.equal(v.synthetic, 'voice');
  assert.deepEqual(v.provenance, { provider: 'kokoro', voice: 'am_michael', stage: 'render-path audio' });
  assert.match(v.sha256, /^[0-9a-f]{64}$/); assert.equal(v.recorded_by, RECORDED_BY);
  assert.equal(byPath['assets/footage.mp4'].license, 'own-capture');
  assert.equal(byPath['assets/footage.mp4'].provenance.tier, 'A');
  const f = byPath['assets/fonts/Test.ttf'];
  assert.equal(f.license, 'OFL-1.1'); assert.match(f.license_evidence, /openfontlicense\.org/); assert.equal(f.font.family, 'Test Sans');
  assert.deepEqual(freezeLedger(dir).changes, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('gate: unknown, restricted and CC-BY-NC block; CC BY needs a credit line; set-license records the licence', () => {
  const { dir, w } = project();
  w('assets/logo.png', 'png-bytes');
  w('assets/fonts/Site.ttf', ttf({ family: 'Site', url: null, fsType: 0x0002 }));
  let r = freezeProject(dir);
  assert.deepEqual(r.problems.map((p) => `${p.problem} ${p.path}`).sort(), ['licence assets/fonts/Site.ttf', 'licence assets/logo.png']);
  assert.match(r.problems.find((p) => p.path === 'assets/logo.png').detail, /^unknown: unknown licence blocks the render/);
  assert.match(r.problems.find((p) => p.path === 'assets/fonts/Site.ttf').detail, /^restricted/);
  assert.equal(main(['check', '--project', dir]), 3);
  assert.equal(main(['set-license', 'assets/logo.png', 'CC-BY-4.0', '--project', dir]), 0);
  r = freezeProject(dir);
  assert.equal(r.problems.find((p) => p.path === 'assets/logo.png').problem, 'credit');
  assert.equal(main(['set-license', 'assets/logo.png', 'CC-BY-4.0', '--credit', 'Logo: Jane Doe (CC BY 4.0)', '--project', dir]), 0);
  assert.equal(main(['set-license', 'assets/fonts/Site.ttf', 'CC-BY-NC-4.0', '--project', dir]), 0);
  r = freezeProject(dir);
  assert.deepEqual(r.problems.map((p) => `${p.problem} ${p.path}`), ['licence assets/fonts/Site.ttf']);
  assert.match(r.problems[0].detail, /commercial/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('drift: a frozen asset that changes blocks until --refreeze; the plugin\'s own VO is re-frozen by itself; a vanished file is reported', () => {
  const { dir, w } = project();
  freezeProject(dir);
  w('assets/fonts/Test.ttf', ttf({ family: 'Test Sans v2' }));
  w('assets/voice/01.wav', 'RIFF-voice-1-regenerated');
  let r = freezeProject(dir);
  assert.deepEqual(r.changes.map((c) => `${c.change} ${c.path}`), ['drift assets/fonts/Test.ttf', 'refrozen assets/voice/01.wav']);
  assert.deepEqual(r.problems.map((p) => p.problem), ['drift']);
  assert.equal(main(['check', '--project', dir]), 3);
  assert.equal(main(['freeze', '--project', dir, '--refreeze', 'assets/fonts/Test.ttf']), 0);
  assert.equal(main(['check', '--project', dir]), 0);
  fs.rmSync(path.join(dir, 'assets/voice/02.wav'));
  r = freezeProject(dir);
  assert.deepEqual(r.problems.map((p) => `${p.problem} ${p.path}`), ['missing assets/voice/02.wav']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a media-use record keeps its id and provenance and gains sha256; without evidence its licence is unknown', () => {
  const { dir, w } = project();
  w('.media/audio/sfx/sfx_001.mp3', 'mp3-bytes');
  w(LEDGER.join('/'), `${JSON.stringify({ id: 'sfx_001', type: 'sfx', path: '.media/audio/sfx/sfx_001.mp3', source: 'catalog', provenance: { provider: 'local' } })}\n`);
  const r = freezeProject(dir);
  const rec = readLedger(dir).find((x) => x.id === 'sfx_001');
  assert.equal(rec.source, 'catalog'); assert.deepEqual(rec.provenance, { provider: 'local' });
  assert.equal(rec.frozen_by, RECORDED_BY); assert.equal(rec.recorded_by, undefined); assert.match(rec.sha256, /^[0-9a-f]{64}$/);
  assert.equal(rec.license, 'unknown');
  assert.deepEqual(r.changes.filter((c) => c.path === rec.path), [{ path: rec.path, change: 'hashed' }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pure helpers and the CLI surface', () => {
  assert.equal(fontLicence({ licence_url: 'https://scripts.sil.org/OFL', fs_type: 0 }), 'OFL-1.1');
  assert.equal(fontLicence({ licence: 'Licensed under the Apache License, Version 2.0' }), 'Apache-2.0');
  assert.equal(fontLicence({ licence_url: 'https://openfontlicense.org', fs_type: 2 }), 'restricted');
  assert.equal(fontLicence({ licence: 'Commercial EULA', fs_type: 8 }), null);
  assert.deepEqual(ledgerProblems([{ path: 'a.png', license: 'weird', sha256: 'x' }]).map((p) => p.problem), ['licence']);
  assert.equal(licenceSummary([{ path: 'a', license: 'OFL-1.1' }, { path: 'b' }, { id: 'no-path' }]), 'OFL-1.1 ×1, unknown ×1');
  assert.throws(() => parseArgs(['set-license', 'a.png', 'MIT-ish']), /unknown licence/);
  assert.throws(() => parseArgs(['bogus']), /unknown command/);
  assert.equal(main(['--help']), 0);
  assert.equal(main([]), 2);
});

test('a media-pack bed: licence and credit come from .media/pp-music.json, so the CC BY gate passes with its credit line', () => {
  const { dir, w } = project();
  w('assets/bgm/vol-9.mp3', 'mp3');
  w('.media/pp-music.json', JSON.stringify({ file: 'assets/bgm/vol-9.mp3', credit: 'Music: "Happy Beats / Business Moves Vol. 9" by Sascha Ende / ende.app (CC BY 4.0)', licence: 'CC-BY-4.0', pack: 'music-ende-happy-beats' }));
  const r = freezeProject(dir);
  assert.deepEqual(r.problems, []);
  const bgm = readLedger(dir).find((x) => x.path === 'assets/bgm/vol-9.mp3');
  assert.equal(bgm.type, 'bgm'); assert.equal(bgm.license, 'CC-BY-4.0');
  assert.match(bgm.credit, /Sascha Ende/);
  assert.equal(bgm.provenance.provider, 'media pack music-ende-happy-beats');
  w('.media/pp-music.json', JSON.stringify({ file: 'assets/bgm/other.mp3', licence: 'CC BY 4.0 (declared)' }));
  w('assets/bgm/other.mp3', 'x');
  assert.equal(freezeProject(dir).problems.find((p) => p.path === 'assets/bgm/other.mp3').problem, 'credit', 'CC BY without a credit line is caught');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pack SFX in audio_meta.json are CC0 plugin products', () => {
  const { dir, w } = project();
  w('assets/sfx/interface-click_003.ogg', 'ogg');
  w('audio_meta.json', JSON.stringify({ voices: [], sfx: [{ frame: 2, file: 'assets/sfx/interface-click_003.ogg', offset_s: 0.7, cue: 'click', use: 'button press', pack: 'sfx-kenney', licence: 'CC0-1.0' }] }));
  const r = freezeProject(dir);
  assert.equal(r.problems.filter((p) => p.path.startsWith('assets/sfx')).length, 0);
  assert.equal(readLedger(dir).find((x) => x.path === 'assets/sfx/interface-click_003.ogg').license, 'CC0-1.0');
  fs.rmSync(dir, { recursive: true, force: true });
});

import crypto from 'node:crypto';

test('held clips inherit the capture record while their sidecar hash matches; an evidence-less unknown yields', () => {
  const { dir, w } = project();
  const sha = crypto.createHash('sha256').update('mp4-footage').digest('hex');
  w('assets/clips/02-before.mp4', 'clip-02');
  w('assets/clips/02-before.mp4.json', JSON.stringify({ footage_sha256: sha, a: 2.2, b: 4.7, hold: 0.6, fps: 30 }));
  w('assets/clips/05-stale.mp4', 'clip-05');
  w('assets/clips/05-stale.mp4.json', JSON.stringify({ footage_sha256: 'f'.repeat(64), a: 1, b: 2, hold: 0, fps: 30 }));
  const manifest = fs.readFileSync(path.join(dir, '.media/capture/capture-manifest.json'));
  fs.rmSync(path.join(dir, '.media/capture/capture-manifest.json'));
  freezeProject(dir);
  assert.equal(readLedger(dir).find((x) => x.path === 'assets/clips/02-before.mp4').license, 'unknown');
  w('.media/capture/capture-manifest.json', manifest);
  const r = freezeProject(dir);
  const clip = readLedger(dir).find((x) => x.path === 'assets/clips/02-before.mp4');
  assert.deepEqual([clip.license, clip.license_evidence, clip.provenance.derived_from, clip.provenance.window], ['own-capture', 'plugin product', 'assets/footage.mp4', [2.2, 4.7]]);
  assert.deepEqual(r.problems.map((p) => p.path), ['assets/clips/05-stale.mp4'], 'a clip cut from other footage is not vouched for');
  fs.rmSync(dir, { recursive: true, force: true });
});

import { packFileBySha } from './media-ledger.mjs';
import { MEDIA_PACKS, packsDir } from './media-packs.mjs';

test('packFileBySha() / freezeProject(): a media-pack file under another name keeps its pack licence by content', (t) => {
  const vol9 = MEDIA_PACKS[0].files[1];
  assert.deepEqual(packFileBySha(vol9.sha256), { pack: 'music-ende-happy-beats', file: vol9.file, license: 'CC-BY-4.0', credit: 'Music: "Happy Beats / Business Moves Vol. 9" by Sascha Ende / ende.app (CC BY 4.0)', type: 'bgm' });
  assert.equal(packFileBySha('0'.repeat(64)), null);
  const sfxPack = MEDIA_PACKS.find((p) => p.id === 'sfx-kenney');
  const root = packsDir();
  const src = root && sfxPack.files.map((f) => path.join(root, sfxPack.id, f.file)).find((f) => fs.existsSync(f));
  if (!src) return t.skip('the Kenney SFX pack is not fetched on this machine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ledger-pack-'));
  fs.mkdirSync(path.join(dir, 'assets', 'sfx'), { recursive: true });
  fs.copyFileSync(src, path.join(dir, 'assets', 'sfx', 'click-renamed.ogg'));
  const r = freezeProject(dir);
  const rec = r.records.find((x) => x.path === 'assets/sfx/click-renamed.ogg');
  assert.equal(rec.license, 'CC0-1.0');
  assert.match(rec.license_evidence, /^media pack sfx-kenney: sha256 matches /);
  assert.deepEqual(r.problems, [], 'a renamed pack file does not block the render');
  fs.rmSync(dir, { recursive: true, force: true });
});
