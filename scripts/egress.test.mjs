import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HF_TELEMETRY, appendEgress, cliStageEgress, compositionRefs, externalUrls, readEgress, telemetryOff } from './lib/egress.mjs';

test('externalUrls(): src / href / CSS url() / @import over http(s), unique, comments and relative paths skipped', () => {
  const html = `<!-- <script src="https://commented.example/x.js"></script> -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<link href='https://fonts.googleapis.com/css2?family=Inter' rel="stylesheet">
<style>@import "https://fonts.example/a.css"; .x { background: url(https://img.example/bg.png) } .y { background: url("assets/local.png") }</style>
<video src="assets/footage.mp4"></video>`;
  assert.deepEqual(externalUrls(html), ['https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js', 'https://fonts.googleapis.com/css2?family=Inter', 'https://img.example/bg.png', 'https://fonts.example/a.css']);
  assert.deepEqual(externalUrls(null), []);
});

test('compositionRefs(): index.html and compositions/** with the first file that names each URL', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-egress-'));
  fs.mkdirSync(path.join(dir, 'compositions', 'frames'), { recursive: true });
  const gsap = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js';
  fs.writeFileSync(path.join(dir, 'index.html'), `<script src="${gsap}"></script>`);
  fs.writeFileSync(path.join(dir, 'compositions', 'frames', '01.html'), `<script src="${gsap}"></script><img src="https://img.example/a.png">`);
  fs.writeFileSync(path.join(dir, 'compositions', 'notes.txt'), 'https://ignored.example/');
  assert.deepEqual(compositionRefs(dir), [
    { url: gsap, host: 'cdn.jsdelivr.net', file: 'compositions/frames/01.html' },
    { url: 'https://img.example/a.png', host: 'img.example', file: 'compositions/frames/01.html' },
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('telemetryOff() / cliStageEgress(): the telemetry line only without an opt-out; one line per composition URL', () => {
  assert.equal(telemetryOff({}), false);
  assert.equal(telemetryOff({ HYPERFRAMES_NO_TELEMETRY: '1' }), true);
  assert.equal(telemetryOff({ DO_NOT_TRACK: 'true' }), true);
  assert.equal(telemetryOff({ DO_NOT_TRACK: '0' }), false);
  const refs = [{ url: 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js', host: 'cdn.jsdelivr.net', file: 'index.html' }];
  const on = cliStageEgress({ stage: 'render', env: {}, refs, at: 't' });
  assert.deepEqual(on.map((l) => l.host), [HF_TELEMETRY.host, 'cdn.jsdelivr.net']);
  assert.equal(on[1].by, 'render-path render');
  assert.match(on[1].purpose, /fetched by hyperframes render/);
  assert.deepEqual(cliStageEgress({ stage: 'verify', env: { DO_NOT_TRACK: '1' }, refs: [], at: 't' }), []);
});

test('appendEgress() / readEgress(): JSONL appended across stages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-egress-'));
  appendEgress(dir, []);
  assert.deepEqual(readEgress(dir), []);
  appendEgress(dir, [{ host: 'a.example', purpose: 'x' }]);
  appendEgress(dir, [{ host: 'b.example', purpose: 'y' }]);
  assert.deepEqual(readEgress(dir).map((l) => l.host), ['a.example', 'b.example']);
  fs.rmSync(dir, { recursive: true, force: true });
});
