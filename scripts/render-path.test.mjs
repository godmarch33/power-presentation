import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVEAL_PAUSE_S, bandAdvice, briefBand, durationSeconds, parseStoryboard, syncDurations } from './render-path.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const gs02 = path.resolve(here, '..', 'evals', 'baseline', 'runs', 'plugin', 'gs-02', 'STORYBOARD.md');

const SB = `---
duration: 10s
---
## Frame 1 — Hook
- duration: 3.5s
- text: "Hi" @ 0.2-3.5
## Frame 2 — Product
- duration: 4s
- voiceover: "x"
## Frame 3 — End
- duration: 2.5s
`;

test('syncDurations: a director window holds when voice + the pause fits; it grows only on an overrun', () => {
  const meta = { voices: [{ frame: 1, duration_s: 2.7 }, { frame: 2, duration_s: 3.9 }, { frame: 3, duration_s: 1.0 }] };
  const r = syncDurations(SB, meta);
  assert.equal(REVEAL_PAUSE_S, 0.8, 'floor: 0.8–1.2 s pause on a scene change');
  assert.deepEqual(r.changes, [{ number: 2, from: 4, to: 4.7, voice_s: 3.9 }]);
  assert.match(r.text, /## Frame 2 — Product\n- duration: 4\.7s\n/);
  assert.match(r.text, /## Frame 1 — Hook\n- duration: 3\.5s\n- text: "Hi" @ 0\.2-3\.5\n/, 'frame 1 untouched, timeline kept');
  assert.equal(r.total_s, 10.7);
  assert.deepEqual(r.frames.map((f) => [f.number, f.duration_s, f.voice_s]), [[1, 3.5, 2.7], [2, 4.7, 3.9], [3, 2.5, 1]]);
  const none = syncDurations(SB, { voices: [] });
  assert.equal(none.changes.length, 0); assert.equal(none.text, SB); assert.equal(none.total_s, 10);
});

test('syncDurations: never shrinks (the vendor pass would write the raw voice length), ignores frames without a voice line, rounds to ms', () => {
  const r = syncDurations(SB, { voices: [{ frame: 1, duration_s: 0.4 }, { frame: 9, duration_s: 5 }, { frame: 3, duration_s: 1.70049 }] });
  assert.deepEqual(r.changes, [{ number: 3, from: 2.5, to: 2.5, voice_s: 1.70049 }].filter(() => false), 'frame 3: 1.70049 + 0.8 = 2.50049 → 2.5 (ms rounding) = the window → no change');
  assert.equal(r.text, SB);
  const grow = syncDurations(SB, { voices: [{ frame: 3, duration_s: 1.7006 }] });
  assert.deepEqual(grow.changes, [{ number: 3, from: 2.5, to: 2.501, voice_s: 1.7006 }]);
  const custom = syncDurations(SB, { voices: [{ frame: 1, duration_s: 3 }] }, { pauseS: 1.2 });
  assert.deepEqual(custom.changes, [{ number: 1, from: 3.5, to: 4.2, voice_s: 3 }], 'pause is a parameter (upper bound 1.2 s)');
});

test('briefBand: QA-01 ±3 % of the brief', () => {
  assert.deepEqual(briefBand(60, 61.8), { brief_s: 60, total_s: 61.8, delta_s: 1.8, pct: 3, within: true });
  assert.equal(briefBand(60, 62.45).within, false);
  assert.equal(briefBand(60, 58.2).within, true);
  assert.equal(briefBand(60, 58.1).within, false);
  assert.equal(briefBand(null, 42).within, null, 'no brief duration → nothing to judge');
  assert.equal(bandAdvice(briefBand(60, 61)), null);
  assert.equal(bandAdvice(briefBand(null, 42)), null);
  assert.match(bandAdvice(briefBand(90, 85.584)), /^short by 4\.416s — lengthen windows .*no new synthesis; do not rewrite lines/);
  assert.match(bandAdvice(briefBand(60, 62.45)), /^long by 2\.45s — trim windows longer than their voice line/);
  assert.equal(durationSeconds('60s'), 60); assert.equal(durationSeconds('750ms'), 0.75); assert.equal(durationSeconds('x'), null);
});

test('GS-02 storyboard (tracked): 12 frames already synced to the measured Kokoro lines; the total sits in the QA-01 band', (t) => {
  if (!fs.existsSync(gs02)) return t.skip('evals/baseline/runs/plugin/gs-02/STORYBOARD.md not present');
  const md = fs.readFileSync(gs02, 'utf8');
  const sb = parseStoryboard(md);
  assert.equal(sb.frames.length, 12);
  assert.equal(durationSeconds(sb.globals.duration), 60);
  const measured = [2.261, 2.048, 2.944, 4.949, 5.632, 2.837, 6.336, 5.163, 3.307, 4.288, 3.605, 2.496];
  const r = syncDurations(md, { voices: measured.map((d, i) => ({ frame: i + 1, duration_s: d })) });
  assert.deepEqual(r.changes, [], 'v2: the director set every window ≥ its measured take + the pause — nothing to grow');
  assert.equal(r.text, md);
  assert.equal(r.total_s, 59.6);
  assert.equal(briefBand(60, r.total_s).within, true);
  const longer = syncDurations(md, { voices: [{ frame: 2, duration_s: 4.0 }] });
  assert.deepEqual(longer.changes, [{ number: 2, from: 3.1, to: 4.8, voice_s: 4 }], 'a longer take still grows its window');
});

import { CAMERA_STYLE, applyCamera, hoistedVideos } from './render-path.mjs';

const ANCHOR = 'window.__timelines["main"] = gsap.timeline({ paused: true });';
const INDEX = `<!doctype html>
<html><head>
    <style>
      .scene { position: absolute; inset: 0; }
    </style>
  </head><body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="9" data-width="1920" data-height="1080">
      <div id="el-01-hook" class="scene" data-composition-id="01-hook" data-composition-src="compositions/frames/01-hook.html" data-start="0" data-duration="3.5" data-track-index="1"></div>
      <div id="el-02-product" class="scene" data-composition-id="02-product" data-composition-src="compositions/frames/02-product.html" data-start="3.5" data-duration="4.5" data-track-index="1"></div>
      <div id="el-03-end" class="scene" data-composition-id="03-end" data-composition-src="compositions/frames/03-end.html" data-start="8" data-duration="1" data-track-index="1"></div>
      <video id="product-02-footage" src="assets/footage.mp4" muted playsinline data-media-start="1.4"
        class="clip"
        style="position:absolute;left:320px;top:24px;width:1280px;height:720px;object-fit:cover"
        data-start="3.5"
        data-duration="4.5"
        data-track-index="2005"
      ></video>
      <video id="el-03-end-video-2" src="assets/footage.mp4" muted playsinline
        class="clip"
        style="position:absolute;left:0px;top:0px;width:1920px;height:1080px;object-fit:cover"
        data-start="8"
        data-duration="1"
        data-track-index="3005"
      ></video>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      ${ANCHOR}
    </script>
  </body></html>`;
const PLAN = {
  format: '16:9',
  tracks: { '16:9': { canvas: { width: 1920, height: 1080 }, wrapper: { width: 1920, height: 1080, left: 0, top: 0 }, keyframes: [
    { t: 0, set: true, scale: 1, xPercent: 0, yPercent: 0 },
    { t: 2, duration: 0.7, ease: 'power3.out', scale: 2, xPercent: 41.09, yPercent: -50, role: 'zoom-in', segment: 1 },
  ] } },
  cursor: { path: [[0, 0.5, 0.5], [1, 0.6, 0.4]], clicks: [{ t: 1, x: 0.6, y: 0.4 }] },
};

test('hoistedVideos(): finds the assembler\'s hoisted videos (track ≥ 1000) with their host box and frame index', () => {
  const v = hoistedVideos(INDEX);
  assert.deepEqual(v.map((x) => [x.id, x.frameIndex, x.start, x.duration, x.box, x.fit]), [
    ['product-02-footage', 1, 3.5, 4.5, { left: 320, top: 24, width: 1280, height: 720 }, 'cover'],
    ['el-03-end-video-2', 2, 8, 1, { left: 0, top: 0, width: 1920, height: 1080 }, 'cover'],
  ]);
});

test('applyCamera(): wraps the hoisted video, stamps offset keyframes / cursor / ripples on the main timeline, injects the z-order CSS, skips frames without a plan', () => {
  const frames = [{ id: '01-hook', start: 0, plan: null }, { id: '02-product', start: 3.5, plan: PLAN }, { id: '03-end', start: 8, plan: null }];
  const r = applyCamera(INDEX, frames);
  assert.deepEqual(r.applied, [{ id: '02-product', box: { left: 320, top: 24, width: 1280, height: 720 }, wrapper: { left: 0, top: 0, width: 1280, height: 720 }, keyframes: 2, drift: false, clicks: 1, cursor: true }]);
  assert.deepEqual(r.skipped, []);
  assert.match(r.html, /<div id="pp-cam-02-product-stage" class="pp-cam-stage pp-cam-framed pp-cam-shadow" data-pp-frame="02-product" style="left:320px;top:24px;width:1280px;height:720px">/, 'a window smaller than the canvas is framed');
  const flat = applyCamera(r.html, frames, { shadow: false });
  assert.match(flat.html, /class="pp-cam-stage pp-cam-framed" data-pp-frame="02-product"/);
  assert.equal(applyCamera(flat.html, frames, { shadow: false }).html, flat.html);
  assert.match(r.html, /<div id="pp-cam-02-product" class="pp-cam" data-layout-allow-overflow style="width:1280px;height:720px">/);
  assert.match(r.html, /<video id="product-02-footage" src="assets\/footage.mp4" muted playsinline data-media-start="1.4" data-start="3.5" data-duration="4.5" data-track-index="2005" class="clip" style="position:absolute;left:0;top:0;width:1280px;height:720px;object-fit:cover"><\/video>/, 'the video is sized to the box inline — the runtime .clip rule would size it to the canvas');
  assert.match(r.html, /<svg id="pp-cam-02-product-cursor" class="pp-cam-cursor"/);
  assert.match(r.html, /id="pp-cam-02-product-cursor-ripple" class="pp-cam-ripple" style="width:17px;height:17px;margin:-8.5px 0 0 -8.5px"/, 'cursor size 2.4 % of the box height');
  assert.ok(r.html.includes('tl.set("#pp-cam-02-product", { scale: 1, xPercent: 0, yPercent: 0 }, 3.5);'), 'set at T');
  assert.ok(r.html.includes('tl.to("#pp-cam-02-product", { scale: 2, xPercent: 41.09, yPercent: -50, duration: 0.7, ease: "power3.out" }, 5.5);'), 'zoom at T+2');
  assert.ok(r.html.includes('tl.set("#pp-cam-02-product-cursor", { x: 640, y: 360 }, 3.5);'), 'cursor start in box pixels');
  assert.ok(r.html.includes('tl.to("#pp-cam-02-product-cursor", { keyframes: [{ x: 768, y: 288, duration: 1 }], ease: "none" }, 3.5);'));
  assert.ok(r.html.includes('tl.fromTo("#pp-cam-02-product-cursor-ripple", { x: 768, y: 288, scale: 0.2, autoAlpha: 0.6 }, { scale: 3, autoAlpha: 0, duration: 0.6, ease: "power2.out", immediateRender: false }, 4.5);'));
  assert.ok(r.html.includes('tl.set("#pp-cam-02-product-cursor", { autoAlpha: 1 }, 3.5);') && r.html.includes('tl.set("#pp-cam-02-product-cursor", { autoAlpha: 0 }, 8);'), 'cursor shown only inside the frame window');
  assert.ok(r.html.includes(CAMERA_STYLE), 'z-order CSS injected');
  assert.ok(r.html.includes(ANCHOR), 'vendor anchor kept for transitions.mjs');
  assert.match(r.html, /<video id="el-03-end-video-2"[\s\S]*data-track-index="3005"/, 'a frame without a plan keeps the plain hoisted video');
  assert.equal((r.html.match(/<script data-pp-camera>/g) ?? []).length, 1);
  const again = applyCamera(r.html, frames);
  assert.equal(again.html, r.html);
  assert.equal(again.applied.length, 1);
  const s = applyCamera(INDEX, [{ id: '01-hook', start: 0, plan: PLAN }, { id: '02-product', start: 3.5, plan: null }, { id: '03-end', start: 8, plan: null }]);
  assert.equal(s.applied.length, 0);
  assert.match(s.skipped[0].reason, /no hoisted video/);
  assert.equal(s.html, INDEX, 'nothing applied → untouched');
});

import { HOIST_MARKER, approvedDeclarations, restoreHoisted } from './render-path.mjs';

test('approvedDeclarations() / restoreHoisted(): the hoisted declaration goes back in place of the assembler marker; comments and scripts are ignored', () => {
  const decl = '<video id="reconcile-footage" data-frame-video="approved" src="assets/footage.mp4" muted playsinline data-start="0" data-duration="7" data-media-start="1.4" data-track-index="5" data-frame-video-x="320" data-frame-video-y="24" data-frame-video-width="1280" data-frame-video-height="720" data-frame-video-fit="cover"></video>';
  const before = `<template><style>/* the <video data-frame-video="approved"> lives below */</style>\n<div id="root" data-composition-id="x">\n  <div id="stage">\n    ${decl}\n  </div>\n</div>\n<script>// hoisted <video> note</script></template>`;
  assert.deepEqual(approvedDeclarations(before), [decl], 'only the real tag, not the comment text');
  const after = before.replace(decl, HOIST_MARKER);
  assert.ok(after.includes(HOIST_MARKER));
  const r = restoreHoisted(before, after);
  assert.equal(r.restored, 1);
  assert.equal(r.markers, 1);
  assert.equal(r.html, before, 'byte-identical to the pre-assembly frame');
  const repaired = after.replace('data-composition-id="x"', 'data-composition-id="x" data-width="1920" data-height="1080"');
  assert.equal(restoreHoisted(before, repaired).html, before.replace('data-composition-id="x"', 'data-composition-id="x" data-width="1920" data-height="1080"'));
  assert.deepEqual(restoreHoisted(before, before), { html: before, restored: 0, markers: 0 });
  const two = `${after}\n${HOIST_MARKER}`;
  const r2 = restoreHoisted(before, two);
  assert.equal(r2.restored, 1); assert.equal(r2.markers, 2); assert.ok(r2.html.endsWith(HOIST_MARKER));
});

import os from 'node:os';
import { FRAME_VIDEOS_FILE, framesDeclaringFootage, prepareFramesForHoist, putBack } from './render-path.mjs';

import { isOpaqueColor, opaqueRootGround } from './render-path.mjs';

test('opaqueRootGround(): a footage frame root that paints an opaque ground is found; transparent, alpha and gradients are not', () => {
  for (const v of ['#fff', '#ffffff', '#ffff', '#ffffffff', 'rgb(255, 255, 255)', 'rgba(0,0,0,1)', 'hsl(0 0% 100% / 100%)', 'white', '#fff !important']) assert.equal(isOpaqueColor(v), true, v);
  for (const v of ['transparent', 'none', '#fff8', '#ffffff80', 'rgba(255, 255, 255, 0.65)', 'rgb(0 0 0 / 0.5)', 'radial-gradient(circle, #fff, #000)', 'url(x.png)', '']) assert.equal(isOpaqueColor(v), false, v);
  const frame = (bg) => `<template data-composition-id="07-outcome"><style>\n    #root {\n      position: relative;\n      background: ${bg};\n    }\n    #card { background: #fff; }\n  </style>\n  <div id="root" data-composition-id="07-outcome" data-width="1920">…</div></template>`;
  assert.deepEqual(opaqueRootGround(frame('#ffffff')), { selector: '#root', background: '#ffffff' });
  assert.equal(opaqueRootGround(frame('transparent')), null, 'an opaque card inside the frame is fine; only the root ground hides the footage');
  assert.equal(opaqueRootGround('<template data-composition-id="x"><div data-composition-id="x"></div></template>'), null, 'no root id → nothing to check');
});

test('putBack(): markers take the declarations in order; none recorded → untouched', () => {
  const html = `a ${HOIST_MARKER} b ${HOIST_MARKER} c`;
  assert.deepEqual(putBack(['<video id="1"></video>', '<video id="2"></video>'], html), { html: 'a <video id="1"></video> b <video id="2"></video> c', restored: 2, markers: 2 });
  assert.deepEqual(putBack(undefined, html), { html, restored: 0, markers: 2 });
});

test('prepareFramesForHoist(): frames keep the vendor marker after assemble and get their footage back before the next one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-hoist-'));
  const frames = path.join(dir, 'compositions', 'frames');
  const sidecar = path.join(dir, ...FRAME_VIDEOS_FILE);
  fs.mkdirSync(frames, { recursive: true });
  const decl = '<video id="pain-footage" data-frame-video="approved" src="assets/footage.mp4" muted playsinline data-start="0" data-duration="6.4" data-track-index="0" data-frame-video-x="280" data-frame-video-y="70" data-frame-video-width="1360" data-frame-video-height="765"></video>';
  const worker = `<template><div id="root" data-composition-id="04-pain">\n  ${decl}\n  <div id="pain-stage"></div>\n</div></template>`;
  fs.writeFileSync(path.join(frames, '04-pain.html'), worker);
  fs.writeFileSync(path.join(frames, '01-hook.html'), '<template><div id="root" data-composition-id="01-hook"></div></template>');
  let r = prepareFramesForHoist(frames, sidecar);
  assert.deepEqual(r, { rehydrated: [], orphans: [], recorded: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(sidecar, 'utf8')).frames, { '04-pain.html': [decl] });
  const hoisted = worker.replace(decl, HOIST_MARKER);
  fs.writeFileSync(path.join(frames, '04-pain.html'), hoisted);
  assert.deepEqual(framesDeclaringFootage(frames), [], 'after assemble no frame declares footage');
  r = prepareFramesForHoist(frames, sidecar);
  assert.deepEqual(r.rehydrated, [{ file: '04-pain.html', restored: 1 }]);
  assert.equal(fs.readFileSync(path.join(frames, '04-pain.html'), 'utf8'), worker, 'byte-identical to the worker file');
  assert.deepEqual(framesDeclaringFootage(frames), [{ file: '04-pain.html', count: 1 }], 'a frame that declares footage is what the render guard refuses');
  fs.writeFileSync(sidecar, JSON.stringify({ frames: {} }));
  fs.writeFileSync(path.join(frames, '04-pain.html'), hoisted);
  r = prepareFramesForHoist(frames, sidecar);
  assert.deepEqual(r, { rehydrated: [], orphans: [{ file: '04-pain.html', markers: 1 }], recorded: 0 });
  fs.rmSync(dir, { recursive: true, force: true });
});

import { LOUDNORM_LRA, LOUDNORM_TP, QA08_TP_MAX, loudnormApplyArgs, loudnormMeasureArgs, normalizeLoudness, parseLoudnorm } from './render-path.mjs';

const LOUDNORM_STDERR = `[Parsed_loudnorm_0 @ 0x55] \n{\n\t"input_i" : "-21.60",\n\t"input_tp" : "-1.50",\n\t"input_lra" : "4.90",\n\t"input_thresh" : "-32.00",\n\t"output_i" : "-14.10",\n\t"output_tp" : "-1.00",\n\t"output_lra" : "4.80",\n\t"output_thresh" : "-24.40",\n\t"normalization_type" : "dynamic",\n\t"target_offset" : "0.10"\n}\n`;

test('loudnorm: measuring pass args, JSON parse, applying pass args (video copied, linear gain, TP −1)', () => {
  assert.deepEqual(loudnormMeasureArgs('/p/renders/final/x.mp4', -14), ['-nostats', '-hide_banner', '-i', '/p/renders/final/x.mp4', '-af', `loudnorm=I=-14:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}:print_format=json`, '-f', 'null', '-']);
  const m = parseLoudnorm(LOUDNORM_STDERR);
  assert.equal(m.input_i, '-21.60'); assert.equal(m.target_offset, '0.10');
  assert.equal(parseLoudnorm('no json here'), null);
  const a = loudnormApplyArgs('/p/x.mp4', '/p/x.loudnorm.tmp.mp4', -14, m);
  assert.ok(a.includes('-c:v') && a[a.indexOf('-c:v') + 1] === 'copy', 'video stream copied');
  const af = a[a.indexOf('-af') + 1];
  assert.equal(af, `loudnorm=I=-14:TP=${LOUDNORM_TP}:LRA=11:measured_I=-21.60:measured_TP=-1.50:measured_LRA=4.90:measured_thresh=-32.00:offset=0.10:linear=true:print_format=summary`);
  assert.equal(LOUDNORM_TP, -1.5, 'headroom under the QA-08 −1 dBTP ceiling for the AAC overshoot');
  assert.equal(a[a.length - 1], '/p/x.loudnorm.tmp.mp4');
  assert.ok(a.includes('-shortest'), 'the container must not outgrow the video');
  assert.equal(a[a.indexOf('-aac_coder') + 1], 'fast', 'the default twoloop coder overshot a limited transient by 4.4 dB (GS-03)');
  assert.match(loudnormApplyArgs('/p/x.mp4', '/p/o.mp4', -18, m, { tp: -2.3 })[a.indexOf('-af') + 1], /:TP=-2.3:/);
});

test('normalizeLoudness(): re-measures the encoded master; an encoder overshoot past −1 dBTP gets one corrective pass', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-loud-'));
  const master = path.join(dir, 'x.mp4');
  fs.writeFileSync(master, 'mp4');
  const stderrWith = (i, tp) => LOUDNORM_STDERR.replace('"-21.60"', `"${i}"`).replace('"input_tp" : "-1.50"', `"input_tp" : "${tp}"`);
  const measures = [stderrWith('-24.33', '-1.58'), stderrWith('-18.02', '3.05'), stderrWith('-18.10', '-1.62')];
  const calls = [];
  const run = (cmd, args) => {
    calls.push(args);
    if (args.includes('-f')) return { status: 0, stdout: '', stderr: measures.shift(), seconds: 0, error: null };
    fs.writeFileSync(args[args.length - 1], 'normalised');
    return { status: 0, stdout: '', stderr: '', seconds: 0, error: null };
  };
  const r = normalizeLoudness(run, master, -18, { env: {} });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.passes, 2);
  assert.deepEqual(r.after, { integrated_lufs: -18.1, true_peak_dbtp: -1.62, lra_lu: 4.9 });
  assert.ok(r.after.true_peak_dbtp <= QA08_TP_MAX);
  const applies = calls.filter((a) => !a.includes('-f'));
  assert.equal(applies.length, 2);
  assert.match(applies[1][applies[1].indexOf('-af') + 1], /TP=-6\.2:.*measured_I=-18\.02:measured_TP=3\.05/);
  assert.match(r.note, /→ -18\.1 LUFS \/ TP -1\.62 dBTP .*corrective pass/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('normalizeLoudness(): skips a master already inside QA-08, applies otherwise, reports a failed measure', () => {
  const calls = [];
  const runner = (stderr, status = 0) => (cmd, args) => { calls.push([cmd, args]); return { status, stdout: '', stderr, seconds: 0, error: null }; };
  const within = normalizeLoudness(runner(LOUDNORM_STDERR.replace('"-21.60"', '"-14.40"').replace('"input_tp" : "-1.50"', '"input_tp" : "-1.60"')), '/nonexistent/x.mp4', -14, { env: {} });
  assert.equal(within.ok, true); assert.match(within.note, /already within QA-08/); assert.equal(calls.length, 1);
  calls.length = 0;
  const failed = normalizeLoudness(runner('boom', 1), '/nonexistent/x.mp4', -14, { env: {} });
  assert.equal(failed.ok, false); assert.match(failed.error, /loudnorm measure failed/);
  calls.length = 0;
  const r = normalizeLoudness(runner(LOUDNORM_STDERR), '/nonexistent/x.mp4', -14, { env: { HYPERFRAMES_FFMPEG_PATH: '/opt/ffmpeg' } });
  assert.equal(r.ok, false); assert.match(r.error, /loudnorm apply failed/);
  assert.equal(calls[0][0], '/opt/ffmpeg'); assert.equal(calls.length, 2);
  assert.deepEqual(r.before, { integrated_lufs: -21.6, true_peak_dbtp: -1.5, lra_lu: 4.9 });
});

import { SRT_RULES, mergeSrtCues, srtCues, wrapSrtText } from './render-path.mjs';

test('mergeSrtCues(): word-timed groups merge until each cue holds ≥ 0.8 s at ≤ 20 cps; the last short cue is extended; lines wrap at 42 chars', () => {
  const raw = [
    { start: 0.11, end: 0.46, text: 'Dana,' }, { start: 0.46, end: 2.37, text: 'Northbridge closes in 12' }, { start: 2.37, end: 2.89, text: 'days.' },
    { start: 15.228, end: 15.598, text: 'month' }, { start: 15.828, end: 15.998, text: 'end.' }, { start: 15.998, end: 16.768, text: 'Bank lines,' }, { start: 16.768, end: 17.518, text: 'invoices,' }, { start: 17.518, end: 18.9, text: 'spreadsheets.' },
  ];
  const cues = mergeSrtCues(raw, { duration: 59.944 });
  assert.deepEqual(cues.map((c) => [c.start, c.end, c.text]), [
    [0.11, 2.37, 'Dana, Northbridge closes in 12'],
    [2.37, 3.18, 'days.'],
    [15.228, 16.768, 'month end. Bank lines,'],
    [16.768, 18.9, 'invoices, spreadsheets.'],
  ]);
  for (const c of cues) {
    assert.ok(c.end - c.start >= SRT_RULES.minHoldS - 1e-9, `${c.text}: hold ${c.end - c.start}`);
    assert.ok(c.text.length / (c.end - c.start) <= SRT_RULES.maxCps + 1e-9, `${c.text}: cps`);
  }
  const tail = mergeSrtCues([{ start: 59.5, end: 59.7, text: 'days.' }], { duration: 59.944 });
  assert.equal(tail[0].end, 59.944);
  const crowd = mergeSrtCues([{ start: 1, end: 1.2, text: 'a '.repeat(41).trim() }, { start: 1.2, end: 1.4, text: 'b '.repeat(41).trim() }, { start: 1.4, end: 5, text: 'c' }]);
  assert.equal(crowd[0].end, 1.2, 'cannot merge past 84 chars → extended only up to the next cue');
  assert.equal(wrapSrtText('Manual reconciliation eats your month-end. Bank lines, invoices, spreadsheets.'), 'Manual reconciliation eats your month-end.\nBank lines, invoices, spreadsheets.');
  assert.equal(wrapSrtText('short'), 'short');
  assert.deepEqual(mergeSrtCues([]), []);
  const noVo = srtCues({ audioMeta: null, storyboard: { frames: [{ number: 1, keys: { duration: '4s' }, texts: ['"GET /jobs/{jobId}" @ 0.5-3.5', '"Queued / then done" @ 1-3'] }] } });
  assert.deepEqual(noVo.cues.map((c) => c.text), ['GET /jobs/{jobId}', 'Queued\nthen done']);
  const padded = mergeSrtCues([{ start: 10, end: 11.02, text: 'We match every bank' }, { start: 10.9, end: 11.2, text: 'yet.' }, { start: 12.4, end: 14, text: 'Next line here' }]);
  assert.ok(padded.every((c, i) => !i || c.start >= padded[i - 1].end - 1e-9), JSON.stringify(padded));
  assert.ok(padded.every((c) => c.end - c.start >= 0.8 - 1e-9), JSON.stringify(padded));
});

import { renderPreconditions } from './render-path.mjs';

test('renderPreconditions(): an asset with no licence evidence refuses the render; recording its licence clears that reason', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-precond-'));
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'logo.png'), 'png');
  const ctx = { project: dir, p: (...a) => path.join(dir, ...a), paths: { doctor_file: path.join(dir, 'no-doctor.json') } };
  const ledgerReasons = () => renderPreconditions(ctx).filter((r) => r.startsWith('media ledger'));
  assert.equal(ledgerReasons().length, 1);
  assert.match(ledgerReasons()[0], /licence assets\/logo\.png — unknown: unknown licence blocks the render/);
  fs.mkdirSync(path.join(dir, '.media'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.media', 'manifest.jsonl'), `${JSON.stringify({ id: 'image_001', type: 'image', path: 'assets/logo.png', license: 'CC0-1.0' })}\n`);
  assert.deepEqual(ledgerReasons(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

import { cliEgress } from './render-path.mjs';
import { readEgress } from './lib/egress.mjs';

test('cliEgress(): logs the composition hosts (and telemetry without an opt-out); privacy local refuses an external reference', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-cliegress-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>');
  const ctx = (privacy, env) => ({ project: dir, privacy, env });
  const dry = cliEgress(ctx('default', {}), { dryRun: true }, 'verify');
  assert.equal(dry.ok, true); assert.deepEqual(readEgress(dir), [], 'a dry run writes nothing');
  const r = cliEgress(ctx('default', { HYPERFRAMES_NO_TELEMETRY: '1' }), {}, 'render');
  assert.equal(r.note, 'egress: cdn.jsdelivr.net → .media/egress.jsonl');
  assert.deepEqual(readEgress(dir).map((l) => [l.host, l.by]), [['cdn.jsdelivr.net', 'render-path render']]);
  const local = cliEgress(ctx('local', { HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1' }), {}, 'verify');
  assert.equal(local.ok, false); assert.equal(local.exit, 3);
  assert.match(local.reason, /privacy local: the composition loads cdn\.jsdelivr\.net/);
  fs.writeFileSync(path.join(dir, 'index.html'), '<script src="assets/gsap.min.js"></script>');
  assert.deepEqual(cliEgress(ctx('local', { DO_NOT_TRACK: '1' }), {}, 'verify'), { ok: true, note: 'egress: none → .media/egress.jsonl' });
  fs.rmSync(dir, { recursive: true, force: true });
});

import { DISCLOSURE_RE, ON_SCREEN_DISCLOSURE, endCardDisclosure } from './run-report.mjs';

test('endCardDisclosure() / renderPreconditions(): a synthetic voice needs the disclosure on the end card', () => {
  const sb = (last) => parseStoryboard(`## Frame 1 — Hook\n- duration: 3s\n- text: "Narration is AI-generated." @ 0.2-2\n## Frame 2 — End card\n- duration: 3.5s\n- role: cta\n${last}`);
  assert.ok(DISCLOSURE_RE.test(ON_SCREEN_DISCLOSURE));
  assert.equal(endCardDisclosure(sb('- cta: "Reply yes" @ 0.4-3.5')), null, 'only the last frame counts');
  assert.deepEqual(endCardDisclosure(sb(`- cta: "Reply yes" @ 0.4-3.5\n- text: "${ON_SCREEN_DISCLOSURE}" @ 1.2-3.5`)), { frame: 2, text: `"${ON_SCREEN_DISCLOSURE}" @ 1.2-3.5` });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-disclosure-'));
  const ctx = (storyboard) => ({ project: dir, storyboard, p: (...a) => path.join(dir, ...a), paths: { doctor_file: path.join(dir, 'no-doctor.json') } });
  const disclosure = (c) => renderPreconditions(c).filter((r) => r.includes('disclosure'));
  assert.deepEqual(disclosure(ctx(sb('- cta: "Reply yes" @ 0.4-3.5'))), [], 'no voice → no disclosure needed');
  fs.writeFileSync(path.join(dir, 'audio_meta.json'), JSON.stringify({ tts_provider: 'kokoro', voices: [{ frame: 1, path: 'assets/voice/01.wav' }] }));
  assert.match(disclosure(ctx(sb('- cta: "Reply yes" @ 0.4-3.5')))[0], /synthetic \(kokoro\) but the end card carries no disclosure/);
  assert.deepEqual(disclosure(ctx(sb(`- text: "${ON_SCREEN_DISCLOSURE}" @ 1.2-3.5`))), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

import { frameAllowsShadow } from './render-path.mjs';

test('frameAllowsShadow(): a design system that bans shadows keeps the framed window flat (vs frame.md, C5)', () => {
  assert.equal(frameAllowsShadow(''), true, 'no frame.md → the default');
  assert.equal(frameAllowsShadow('Depth: soft drop shadow, 24px blur'), true);
  for (const t of ['soft cobalt-tinted cards with NO shadows, pill chrome', '    shadow: "none"', 'Depth is soft and tinted — never shadowed.', 'flat surfaces, no drop-shadow', 'cards without shadows']) assert.equal(frameAllowsShadow(t), false, t);
});

import { DEFAULT_FPS, ALLOWED_FPS, stageRender, stageVerify, storyboardFps } from './render-path.mjs';

test('storyboardFps() / verify / render: fps from the front matter, 30 by default, anything else refused', () => {
  assert.deepEqual(ALLOWED_FPS, [15, 24, 30]);
  assert.deepEqual(storyboardFps({}), { fps: DEFAULT_FPS, declared: false, ok: true });
  assert.deepEqual(storyboardFps({ fps: '24' }), { fps: 24, declared: true, ok: true });
  assert.equal(storyboardFps({ fps: 15 }).fps, 15);
  const bad = storyboardFps({ fps: '60' });
  assert.equal(bad.ok, false); assert.match(bad.reason, /STORYBOARD\.md `fps: 60` — the frame rate is 15, 24, 30/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-w09-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div data-composition-id="root"></div>');
  const ctx = (fm) => { const storyboardText = `---\n${fm}\n---\n## Frame 1 — Hook\n- duration: 3s\n`; return { project: dir, name: 'w09', storyboardText, storyboard: parseStoryboard(storyboardText), p: (...a) => path.join(dir, ...a), paths: { doctor_file: path.join(dir, 'no-doctor.json') }, cli: { cmd: 'hyperframes', args: [] }, env: { DO_NOT_TRACK: '1' }, formats: ['16:9'], privacy: 'default' }; };
  const fpsReasons = (c) => renderPreconditions(c).filter((r) => r.includes('the frame rate is'));
  assert.deepEqual(fpsReasons(ctx('title: x')), []);
  assert.equal(fpsReasons(ctx('fps: 60')).length, 1);
  const v = stageVerify(ctx('fps: 60'), { dryRun: true }, () => { throw new Error('no CLI call before the fps check'); });
  assert.equal(v.exit, 3); assert.match(v.reason, /^STORYBOARD\.md `fps: 60`/);
  const calls = [];
  const run = (cmd, args) => { calls.push(args); return { status: 0, stdout: '{}', stderr: '' }; };
  const r = stageRender(ctx('fps: 24'), { dryRun: true }, run);
  assert.equal(r.ok, true);
  assert.deepEqual(calls[0].slice(calls[0].indexOf('--fps'), calls[0].indexOf('--fps') + 2), ['--fps', '24']);
  assert.equal(r.line.fps, 24);
  calls.length = 0;
  stageRender(ctx('title: x'), { dryRun: true }, run);
  assert.equal(calls[0][calls[0].indexOf('--fps') + 1], '30', 'the default is passed explicitly, not left to the host data-fps');
  fs.rmSync(dir, { recursive: true, force: true });
});

import { effectsAcross, restraintWarning, styleTokens, stylisticEffects } from './render-path.mjs';

test('stylisticEffects() / restraintWarning(): more than one look treatment per video warns; prose and comments never count', () => {
  const grain = '<div class="film-grain"></div><svg><filter id="n"><feTurbulence baseFrequency="0.8"/></filter></svg>';
  const glitch = '<style>/* no .vignette here */ .headline { color: #fff } @keyframes rgbSplit { to { opacity: 1 } }</style><h1 class="headline">Close in 3 days</h1>';
  const prose = '<!-- approved footage: real tier-A VHS recording --><p>The grain of the data, a glitch-free close</p><script>// logo blooms from 0.9 scale\n</script>';
  assert.deepEqual(stylisticEffects(grain), ['grain']);
  assert.deepEqual(stylisticEffects(glitch), ['glitch'], 'a camelCase @keyframes name counts; a CSS comment does not');
  assert.deepEqual(stylisticEffects(prose), [], 'comments, text and scripts are not styling');
  assert.deepEqual(stylisticEffects('<div data-composition-src="compositions/components/lens-flare.html"></div>'), ['light-leak']);
  assert.deepEqual(stylisticEffects("<style>.bg { background: url('../assets/Vignette_soft.png') }</style>"), ['vignette']);
  assert.deepEqual(stylisticEffects('<div class="pp-cam-framed noisey pixel"></div>'), [], 'whole words only; the plugin camera classes are not effects');
  assert.ok(styleTokens('<i id="a" class="b c"></i>').includes('c'));
  const one = effectsAcross([{ file: 'frames/01.html', html: grain }, { file: 'frames/02.html', html: grain }]);
  assert.deepEqual(one, { families: { grain: ['frames/01.html', 'frames/02.html'] }, count: 1 });
  assert.equal(restraintWarning(one), null, 'one effect used everywhere is the restraint asks for');
  const two = effectsAcross([{ file: 'frames/01.html', html: grain }, { file: 'frames/03.html', html: glitch }]);
  assert.match(restraintWarning(two), /^warning: restraint: 2 stylistic effects — grain \(frames\/01\.html\); glitch \(frames\/03\.html\)/);
});

import { PREFLIGHT_GATES, stagePreflight } from './render-path.mjs';

test('stagePreflight(): a draft render at the storyboard fps, wowprobe on it, only QA-03 / QA-07 / QA-09 decide (loudness is measured after loudnorm)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-preflight-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div data-composition-id="root"></div>');
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '---\nfps: 24\n---\n## Frame 1 — Hook\n- duration: 3s\n');
  const storyboardText = fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8');
  const ctx = { project: dir, name: 'shop-marketing', storyboardText, storyboard: parseStoryboard(storyboardText), p: (...a) => path.join(dir, ...a), pluginRootDir: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), cli: { cmd: 'hyperframes', args: [] }, env: { DO_NOT_TRACK: '1' }, formats: ['16:9'], privacy: 'default', mode: 'marketing' };
  const run = (gates) => { const calls = []; return { calls, fn: (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === 'hyperframes') { fs.mkdirSync(path.join(dir, 'renders', 'draft'), { recursive: true }); fs.writeFileSync(args[args.indexOf('--output') + 1], 'mp4'); }
    else { fs.mkdirSync(path.join(dir, 'QA'), { recursive: true }); fs.writeFileSync(path.join(dir, 'QA', 'wowprobe-preflight.json'), JSON.stringify(gates)); }
    return { status: 0, stdout: '{}', stderr: '' };
  } }; };
  assert.deepEqual(PREFLIGHT_GATES, ['QA-03', 'QA-07', 'QA-09']);
  const bad = run({ gates_failed: ['QA-07', 'QA-08'], gates: { 'QA-03': { pass: true }, 'QA-07': { pass: false, value: 49.1 }, 'QA-08': { pass: false }, 'QA-09': { pass: true, value: 3.2 } } });
  const r = stagePreflight(ctx, {}, bad.fn);
  assert.equal(r.exit, 3); assert.deepEqual(r.failed, ['QA-07'], 'QA-08 on an un-normalised draft is not a preflight failure');
  assert.match(r.reason, /^preflight: QA-07 FAIL \(49\.1 % frozen\) on the draft render/);
  const render = bad.calls[0][1];
  assert.deepEqual([render[render.indexOf('--quality') + 1], render[render.indexOf('--fps') + 1]], ['draft', '24'], 'draft quality, the storyboard fps');
  assert.equal(render[render.indexOf('--output') + 1], path.join(dir, 'renders', 'draft', 'shop-marketing_draft.mp4'));
  assert.ok(bad.calls[1][1].includes('--video') && bad.calls[1][1].includes(path.join(dir, 'QA', 'wowprobe-preflight.json')));
  const good = stagePreflight(ctx, {}, run({ gates_failed: ['QA-08'], gates: { 'QA-03': { pass: true }, 'QA-07': { pass: true, value: 12.3 }, 'QA-09': { pass: true } } }).fn);
  assert.equal(good.ok, true); assert.match(good.notes.at(-1), /QA-07 ok \(12\.3 % frozen\)/);
  const near = stagePreflight(ctx, {}, run({ gates_failed: [], gates: { 'QA-07': { pass: true, value: 22.4 } } }).fn);
  assert.equal(near.ok, true); assert.match(near.notes.at(-1), /^warning: preflight QA-07 22\.4 % frozen is within 3 points of the 25 % ceiling/);
  fs.rmSync(dir, { recursive: true, force: true });
});

import { approveVersion, commitVersion, ensureProjectRepo, repoState, requestText } from './render-path.mjs';
import { spawnSync as spawnSyncT } from 'node:child_process';

test('a standalone project becomes a repository; each gate commits v<N>: <request>; a nested project is left alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-versions-'));
  const env = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  Object.assign(process.env, env);
  assert.equal(repoState(dir).kind, 'none');
  assert.match(ensureProjectRepo(dir), /git init/);
  assert.equal(repoState(dir).kind, 'own');
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /\*\.mp4/);
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '---\nversion: v2\n---\n## Frame 1 — Hook\n');
  fs.mkdirSync(path.join(dir, 'renders')); fs.writeFileSync(path.join(dir, 'renders', 'final.mp4'), 'binary');
  const ctx = { project: dir, p: (...a) => path.join(dir, ...a), storyboard: parseStoryboard(fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8')), intake: { arguments_raw: '--for sales   --url https://x.example' } };
  assert.equal(requestText(ctx, {}), '--for sales --url https://x.example');
  assert.equal(requestText(ctx, { request: 'shorter hook' }), 'shorter hook');
  assert.match(commitVersion(ctx, {}, 'verify'), /"v2: --for sales --url https:\/\/x\.example" \(verify\)/);
  const log = spawnSyncT('git', ['log', '--format=%s%n%b', '-1'], { cwd: dir, encoding: 'utf8' }).stdout;
  assert.match(log, /^v2: --for sales/); assert.match(log, /gate passed: verify/);
  const files = spawnSyncT('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.deepEqual(files.sort(), ['.gitignore', 'STORYBOARD.md'], 'the mp4 stays out of history');
  assert.match(commitVersion(ctx, {}, 'render'), /nothing new to commit/);
  const inner = path.join(dir, 'nested'); fs.mkdirSync(inner);
  assert.equal(repoState(inner).kind, 'nested');
  assert.match(ensureProjectRepo(inner), /sits inside/);
  assert.match(commitVersion({ ...ctx, project: inner }, {}, 'verify'), /not committed — project inside/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('approve writes approved: v<N> into the storyboard and binds it to the hashes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-fr36-'));
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '---\nversion: v3\nformat: 1920x1080\n---\n## Frame 1 — Hook\n');
  fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
  fs.mkdirSync(path.join(dir, 'renders'));
  fs.writeFileSync(path.join(dir, 'renders', 'manifest.json'), `${JSON.stringify({ version: 'v3', status: 'ok', sha256: { '16:9': 'ab'.repeat(32) } })}\n`);
  const ctx = { project: dir, p: (...a) => path.join(dir, ...a), storyboard: parseStoryboard(fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8')), intake: null };
  const r = approveVersion(ctx, { approver: 'Dana' }, '2026-09-26T00:00:00Z');
  assert.equal(r.ok, true);
  const sb = fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8');
  assert.match(sb, /^---\nversion: v3\nformat: 1920x1080\napproved: v3\n---/);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'renders', 'approvals.jsonl'), 'utf8'));
  assert.equal(rec.version, 'v3'); assert.equal(rec.by, 'Dana'); assert.equal(rec.master_sha256, 'ab'.repeat(32));
  assert.match(rec.index_sha256, /^[0-9a-f]{64}$/);
  approveVersion(ctx, {}, '2026-09-26T00:00:01Z');
  assert.equal((fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8').match(/approved:/g) ?? []).length, 1, 'a second approval replaces the line');
  fs.rmSync(dir, { recursive: true, force: true });
});

import { cameraWrapper } from './render-path.mjs';

test('cameraWrapper() / applyCamera(9:16): the portrait wrapper is the 3413×1920 footage offset to the focus; 16:9 stays the box', () => {
  const t169 = PLAN.tracks['16:9'];
  assert.deepEqual(cameraWrapper(t169, { left: 320, top: 24, width: 1280, height: 720 }), { left: 0, top: 0, width: 1280, height: 720 });
  const t916 = { canvas: { width: 1080, height: 1920 }, wrapper: { width: 3413.333, height: 1920, left: -1166.667, top: 0 }, keyframes: [
    { t: 0, set: true, scale: 1, xPercent: 20.545, yPercent: 0 },
    { t: 2, duration: 0.7, ease: 'power3.out', scale: 1.5, xPercent: 30.817, yPercent: -25, role: 'zoom-in', segment: 1 },
  ] };
  assert.deepEqual(cameraWrapper(t916, { left: 0, top: 0, width: 1080, height: 1920 }), { left: -1166.667, top: 0, width: 3413.333, height: 1920 });
  assert.deepEqual(cameraWrapper(t916, { left: 0, top: 0, width: 540, height: 960 }), { left: -583.333, top: 0, width: 1706.667, height: 960 }, 'scaled to a half-size stage');
  const portrait = INDEX.replace('data-width="1920" data-height="1080"', 'data-width="1080" data-height="1920"')
    .replace('style="position:absolute;left:320px;top:24px;width:1280px;height:720px;object-fit:cover"', 'style="position:absolute;left:0px;top:0px;width:1080px;height:1920px;object-fit:cover"');
  const plan = { ...PLAN, tracks: { '9:16': t916 } };
  const r = applyCamera(portrait, [{ id: '01-hook', start: 0, plan: null }, { id: '02-product', start: 3.5, plan }, { id: '03-end', start: 8, plan: null }], { formatKey: '9:16' });
  assert.equal(r.applied.length, 1);
  assert.match(r.html, /class="pp-cam-stage" data-pp-frame="02-product" style="left:0px;top:0px;width:1080px;height:1920px"/);
  assert.match(r.html, /class="pp-cam" data-layout-allow-overflow style="left:-1166\.667px;top:0px;width:3413\.333px;height:1920px"/);
  assert.match(r.html, /tl\.set\("#pp-cam-02-product", \{ scale: 1, xPercent: 20\.545, yPercent: 0 \}, 3\.5\);/);
  assert.match(r.html, /x: 1706\.667, y: 960 \}, 3\.5\);/, 'the cursor lives in wrapper coordinates');
  const again = applyCamera(r.html, [{ id: '01-hook', start: 0, plan: null }, { id: '02-product', start: 3.5, plan }, { id: '03-end', start: 8, plan: null }], { formatKey: '9:16' });
  assert.equal(again.html, r.html, 'idempotent');
  assert.equal(applyCamera(portrait, [{ id: '01-hook', start: 0, plan: null }, { id: '02-product', start: 3.5, plan: PLAN }], { formatKey: '9:16' }).skipped[0].reason, 'no 9:16 track in the plan');
});

import { digitLeadingSelectors } from './render-path.mjs';

test('digitLeadingSelectors(): digit-leading class / id selectors in CSS preludes and script strings; colours, decimals, keyframes and at-rules are fine', () => {
  const html = `<template><style>
    /* .9-comment { } */
    #root .clip, .08-proof-quote > span { opacity: 0; transform: scale(.5); color: #2a6f97; }
    @media (min-width: 1.5px) { .ok { left: 0.5cqw } }
    @keyframes pop { 0% { opacity: 0 } 50.5% { opacity: .5 } 100% { opacity: 1 } }
    .f08-proof-bg, #_01-hook-accent { background: #fff }
    #3col { width: 1px }
  </style>
  <div id="root"></div>
  <script>
    tl.to(".08-proof-quote", { opacity: 1, duration: .5, color: "#2a6f97" }, 0.5);
    tl.set("#root .f08-proof-bg", { x: ".5" });
  </script></template>`;
  assert.deepEqual(digitLeadingSelectors(html), [
    { token: '.08-proof-quote', where: 'css' },
    { token: '#3col', where: 'css' },
    { token: '.08-proof-quote', where: 'js' },
  ]);
  assert.deepEqual(digitLeadingSelectors('<style>.a{top:.5px}</style><script>gsap.to(".a",{x:1})</script>'), []);
});

import { PORTRAIT, buildPortraitProject, portraitContext, portraitFrameHtml, portraitStoryboard } from './render-path.mjs';

test('portraitStoryboard() / portraitFrameHtml(): format 1080x1920; markers back; root 1080×1920; footage boxed for portrait', () => {
  assert.match(portraitStoryboard('---\nformat: 1920x1080\nduration: 60s\n---\n## Frame 1'), /^---\nformat: 1080x1920\nduration: 60s\n---/);
  assert.match(portraitStoryboard('---\nduration: 60s\n---\nx'), /^---\nformat: 1080x1920\nduration: 60s\n---/);
  const decl = '<video id="f" data-frame-video="approved" src="assets/footage.mp4" data-start="0" data-duration="5" data-track-index="0" data-frame-video-x="320" data-frame-video-y="24" data-frame-video-width="1280" data-frame-video-height="720" data-frame-video-fit="contain"></video>';
  const frame = `<template data-composition-id="05-x" data-width="1920" data-height="1080"><div id="root" data-composition-id="05-x" data-width="1920" data-height="1080">${HOIST_MARKER}</div></template>`;
  const out = portraitFrameHtml(frame, [decl]);
  assert.equal((out.match(/data-width="1080" data-height="1920"/g) ?? []).length, 2, 'template and root both resized');
  assert.match(out, /data-frame-video-x="0" data-frame-video-y="0" data-frame-video-width="1080" data-frame-video-height="1920" data-frame-video-fit="cover"/);
  const withBox = portraitFrameHtml(frame, [decl.replace('<video id="f"', '<video id="f" data-frame-video-portrait="0, 240, 1080, 1080"')]);
  assert.match(withBox, /data-frame-video-x="0" data-frame-video-y="240" data-frame-video-width="1080" data-frame-video-height="1080"/);
  assert.equal(portraitFrameHtml('<div id="root" data-composition-id="a" data-width="1920" data-height="1080"></div>', undefined), '<div id="root" data-composition-id="a" data-width="1080" data-height="1920"></div>');
});

test('buildPortraitProject(): a working copy with reflowed frames and linked media; the 16:9 project is untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-9x16-'));
  const w = (rel, data) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), data); };
  const decl = '<video id="f" data-frame-video="approved" src="assets/footage.mp4" data-frame-video-x="1" data-frame-video-y="2" data-frame-video-width="3" data-frame-video-height="4"></video>';
  w('STORYBOARD.md', '---\nformat: 1920x1080\nversion: v2\n---\n## Frame 1 — Hook\n- duration: 3s\n- src: compositions/frames/01-hook.html\n');
  w('frame.md', '# frame'); w('audio_meta.json', '{}'); w('.hyperframes/caption-skin.html', '<skin>');
  w('compositions/frames/01-hook.html', `<div id="root" data-composition-id="01-hook" data-width="1920" data-height="1080">${HOIST_MARKER}</div>`);
  w('compositions/frames/01-hook.autozoom.json', '{}');
  w('compositions/captions.html', '<landscape captions>');
  w('.hyperframes/frame-videos.json', JSON.stringify({ frames: { '01-hook.html': [decl] } }));
  w('assets/footage.mp4', 'mp4'); w('assets/voice/01.wav', 'wav');
  const before = fs.readFileSync(path.join(dir, 'compositions/frames/01-hook.html'), 'utf8');
  const ctx = { project: dir, p: (...a) => path.join(dir, ...a), storyboard: parseStoryboard(fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8')), formats: ['16:9', '9:16'] };
  const r = buildPortraitProject(ctx);
  const pd = path.join(dir, ...PORTRAIT.dir);
  assert.equal(r.dir, pd);
  assert.match(r.notes[0], /1 frame\(s\) reflowed/);
  assert.match(fs.readFileSync(path.join(pd, 'compositions/frames/01-hook.html'), 'utf8'), /data-width="1080" data-height="1920"><video id="f" data-frame-video="approved"[^>]*data-frame-video-width="1080"/);
  assert.equal(fs.existsSync(path.join(pd, 'compositions/captions.html')), false, 'the assembler rebuilds the portrait captions');
  assert.ok(fs.existsSync(path.join(pd, 'compositions/frames/01-hook.autozoom.json')));
  assert.equal(fs.statSync(path.join(pd, 'assets/voice/01.wav')).ino, fs.statSync(path.join(dir, 'assets/voice/01.wav')).ino, 'media hard-linked, not copied');
  assert.equal(fs.readFileSync(path.join(pd, '.hyperframes/caption-skin.html'), 'utf8'), '<skin>');
  assert.equal(fs.readFileSync(path.join(dir, 'compositions/frames/01-hook.html'), 'utf8'), before, 'the 16:9 frame keeps its marker');
  const c9 = portraitContext(ctx);
  assert.equal(c9.variant, '9:16'); assert.deepEqual(c9.formats, ['9:16']); assert.equal(c9.storyboard.globals.format, '1080x1920'); assert.equal(c9.storyboard.globals.version, 'v2');
  assert.equal(c9.p('index.html'), path.join(pd, 'index.html'));
  buildPortraitProject(ctx);
  assert.ok(fs.existsSync(path.join(pd, 'STORYBOARD.md')), 'a rebuild starts from scratch');
  fs.rmSync(dir, { recursive: true, force: true });
});

import { LOCAL_GSAP_DIR, localizeCdn, localizeGsap } from './render-path.mjs';
import { GSAP_PIN } from './lib/versions.mjs';

test('localizeGsap() / localizeCdn(): the pinned CDN GSAP becomes a project file; other versions and missing files stay (reported)', () => {
  const cdn = (v, f = 'gsap.min.js') => `https://cdn.jsdelivr.net/npm/gsap@${v}/dist/${f}`;
  const html = `<script src="${cdn(GSAP_PIN)}"></script><script src="${cdn(GSAP_PIN, 'ScrollTrigger.min.js')}"></script><script src="${cdn('3.12.5')}"></script>`;
  const r = localizeGsap(html, (f) => f === 'gsap.min.js');
  assert.equal(r.html, `<script src="${LOCAL_GSAP_DIR.join('/')}/gsap.min.js"></script><script src="${cdn(GSAP_PIN, 'ScrollTrigger.min.js')}"></script><script src="${LOCAL_GSAP_DIR.join('/')}/gsap.min.js"></script>`);
  assert.deepEqual(r.used, ['gsap.min.js']);
  assert.deepEqual(r.skipped, [cdn(GSAP_PIN, 'ScrollTrigger.min.js')]);
  assert.deepEqual(r.pinned, [`${cdn('3.12.5')} → ${GSAP_PIN}`]);
  assert.equal(localizeGsap('<script src="https://unpkg.com/gsap@3/dist/gsap.min.js"></script>').used[0], 'gsap.min.js');
  assert.equal(localizeGsap(`<script src="${cdn('2.1.3', 'TweenMax.min.js')}"></script>`).skipped.length, 1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-gsap-'));
  const nm = path.join(dir, 'toolchain', 'node_modules');
  fs.mkdirSync(path.join(nm, 'gsap', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(nm, 'gsap', 'dist', 'gsap.min.js'), '/* gsap */');
  const proj = path.join(dir, 'p');
  fs.mkdirSync(path.join(proj, 'compositions', 'frames'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'index.html'), `<script src="${cdn(GSAP_PIN)}"></script>`);
  fs.writeFileSync(path.join(proj, 'compositions', 'frames', '01.html'), `<template><script src="${cdn(GSAP_PIN)}"></script></template>`);
  const ctx = { project: proj, p: (...a) => path.join(proj, ...a), paths: { node_modules: nm } };
  const out = localizeCdn(ctx);
  assert.equal(out.rewritten, 2); assert.deepEqual(out.copied, ['gsap.min.js']);
  assert.equal(fs.readFileSync(path.join(proj, ...LOCAL_GSAP_DIR, 'gsap.min.js'), 'utf8'), '/* gsap */');
  assert.ok(!fs.readFileSync(path.join(proj, 'compositions', 'frames', '01.html'), 'utf8').includes('cdn.jsdelivr'));
  assert.equal(localizeCdn(ctx).note, 'gsap: no CDN reference', 'idempotent');
  fs.writeFileSync(path.join(proj, 'index.html'), `<script src="${cdn(GSAP_PIN)}"></script>`);
  assert.match(localizeCdn({ ...ctx, paths: { node_modules: path.join(dir, 'none') } }).note, /not in the toolchain/);
  const cdnjs = (v) => `https://cdnjs.cloudflare.com/ajax/libs/gsap/${v}/gsap.min.js`;
  assert.equal(localizeGsap(`<script src="${cdnjs(GSAP_PIN)}"></script>`).html, `<script src="${LOCAL_GSAP_DIR.join('/')}/gsap.min.js"></script>`);
  assert.equal(localizeGsap(`<script src="https://unpkg.com/gsap@${GSAP_PIN}/dist/gsap.min.js"></script>`).used[0], 'gsap.min.js');
  fs.writeFileSync(path.join(proj, 'index.html'), `<script src="${cdn(GSAP_PIN)}"></script>`);
  fs.writeFileSync(path.join(proj, 'compositions', 'frames', '09.html'), `<template><script src="${cdnjs('3.12.5')}"></script></template>`);
  const mixed = localizeCdn(ctx);
  assert.equal(mixed.rewritten, 2);
  assert.match(mixed.note, /^gsap served from the project: .*; another GSAP 3 pinned to .*cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/3\.12\.5\/gsap\.min\.js → /);
  assert.ok(!fs.readFileSync(path.join(proj, 'compositions', 'frames', '09.html'), 'utf8').includes('cdnjs'));
  fs.rmSync(dir, { recursive: true, force: true });
});

import { makeRunner, parseConnects } from './render-path.mjs';

test('parseConnects(): external AF_INET/AF_INET6 connects only; loopback, unspecified and unix sockets are local', () => {
  const log = [
    '123 connect(21, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("104.16.1.1")}, 16) = -1 EINPROGRESS',
    '123 connect(21, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("104.16.1.1")}, 16) = 0',
    '124 connect(3, {sa_family=AF_INET, sin_port=htons(41234), sin_addr=inet_addr("127.0.0.1")}, 16) = 0',
    '125 connect(4, {sa_family=AF_INET6, sin6_port=htons(443), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "2606:4700::1", &sin6_addr), sin6_scope_id=0}, 28) = 0',
    '126 connect(5, {sa_family=AF_INET6, sin6_port=htons(80), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "::1", &sin6_addr), sin6_scope_id=0}, 28) = 0',
    '127 connect(6, {sa_family=AF_UNIX, sun_path="/run/dbus/system_bus_socket"}, 110) = 0',
    '128 connect(7, {sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("127.0.0.53")}, 16) = 0',
  ].join('\n');
  assert.deepEqual(parseConnects(log), [{ family: 'inet', addr: '104.16.1.1', port: 443 }, { family: 'inet6', addr: '2606:4700::1', port: 443 }]);
});

test('parseConnects() with -yy: a UDP connect is a route probe, not egress, until a send names an external peer', () => {
  const probe = '1530478 connect(22<UDPv6:[5871234]>, {sa_family=AF_INET6, sin6_port=htons(443), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "2001:4860:4860::8888", &sin6_addr), sin6_scope_id=0}, 28) = 0';
  const tcp = '1530478 connect(24<TCP:[6407554]>, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("104.16.1.1")}, 16) = -1 EINPROGRESS (Operation now in progress)';
  const localSend = '1531382 sendmsg(20<UDP:[0.0.0.0:25943]>, {msg_name={sa_family=AF_INET, sin_port=htons(9), sin_addr=inet_addr("127.0.0.1")}, msg_namelen=16}, 0) = 1';
  const r = parseConnects([probe, tcp, localSend].join('\n'));
  assert.deepEqual(r, [{ family: 'inet', addr: '104.16.1.1', port: 443, via: 'tcp-connect' }]);
  assert.deepEqual(r.probes, [{ family: 'inet6', addr: '2001:4860:4860::8888', port: 443, via: 'udp-connect' }]);
  const dns = '99 sendmmsg(7<UDP:[10.0.0.2:40000->8.8.8.8:53]>, [{msg_hdr={msg_name=NULL, msg_namelen=0}}], 2, MSG_NOSIGNAL) = 2';
  const sent = parseConnects([probe, dns, '99 sendto(9<UDPv6:[[fe80::1]:5000->[2001:4860:4860::8888]:443]>, "x", 1, 0, NULL, 0) = 1'].join('\n'));
  assert.deepEqual(sent.map((e) => `${e.addr}:${e.port} ${e.via}`), ['8.8.8.8:53 udp-send', '2001:4860:4860::8888:443 udpv6-send']);
  assert.deepEqual(sent.probes, [], 'a probe whose peer was then sent to is egress, listed once');
});

const HAS_STRACE = spawnSyncT('strace', ['-V']).status === 0;
test('makeRunner({ audit }): a child that only talks to loopback is clean; an external connect attempt is observed even without a network', { skip: !HAS_STRACE && 'strace not installed' }, () => {
  const run = makeRunner({ log: () => {}, throttle: { nice: null, cpuset: null, warnings: [] }, audit: true });
  const js = (host, port) => `const s=require('net').connect(${port},'${host}');s.on('error',()=>{});setTimeout(()=>process.exit(0),200)`;
  assert.equal(run(process.execPath, ['-e', js('127.0.0.1', 9)]).status, 0);
  assert.deepEqual(run.observed, []);
  run(process.execPath, ['-e', js('192.0.2.1', 443)]);
  assert.deepEqual(run.observed.map((c) => `${c.addr}:${c.port}`), ['192.0.2.1:443']);
  assert.equal(run.observed[0].cmd, path.basename(process.execPath));
});

import { runNetworkManifest } from './render-path.mjs';
import { DOCTOR_SCHEMA } from './toolchain.mjs';

test('runNetworkManifest(): capture host for a URL source, composition refs, telemetry without an opt-out; empty for a local, opted-out project', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-manifest-'));
  fs.mkdirSync(path.join(dir, 'node_modules', 'hyperframes'), { recursive: true });
  const doctor = path.join(dir, 'doctor.json');
  const ctx = (intake, env, doctorOk = true) => {
    fs.writeFileSync(doctor, JSON.stringify({ schema: DOCTOR_SCHEMA, gate: { ok: doctorOk } }));
    return { project: dir, p: (...a) => path.join(dir, ...a), intake, env, paths: { doctor_file: doctor } };
  };
  const local = { declared: { source: { kind: 'local', value: 'site' } } };
  const opted = { HYPERFRAMES_NO_TELEMETRY: '1' };
  assert.deepEqual(runNetworkManifest(ctx(local, opted)), [], 'local source, no refs, telemetry off → empty');
  const url = { declared: { source: { kind: 'url', value: 'https://plausible.io/sites' } } };
  fs.writeFileSync(path.join(dir, 'index.html'), '<script src="https://cdn.example/x.js"></script>');
  const rows = runNetworkManifest(ctx(url, {}));
  assert.deepEqual(rows.map((r) => r.host), ['plausible.io', 'cdn.example', 'us.i.posthog.com']);
  fs.rmSync(dir, { recursive: true, force: true });
});

import { clipArgs, driftTween, footageTiming, retargetDeclaration, stageClips } from './render-path.mjs';

test('footageTiming(): window, hold and drift from the frame keys; the camera prose is the drift fallback', () => {
  const f = (keys) => ({ keys });
  assert.deepEqual(footageTiming(f({ capture_window: '5.30-8.30', capture_hold: '3.6', capture_drift: '0.80,0.45 1.08 @ 3.0-6.6' })), { a: 5.3, b: 8.3, hold: 3.6, drift: { x: 0.8, y: 0.45, scale: 1.08, t0: 3, t1: 6.6 } });
  assert.deepEqual(footageTiming(f({ capture_window: '8.30-11.50', capture_hold: '3.7', capture_drift: '0.82,0.39 2.2 @ 3.20-6.90' })).drift, { x: 0.82, y: 0.39, scale: 2, t0: 3.2, t1: 6.9, clamped_from: 2.2 }, '≤ 2×');
  assert.deepEqual(footageTiming(f({ capture_window: '8.30–11.50', capture_hold: '3.7', camera: 'zoom-in 0.03–0.73 …; hold drift 3.2–6.9 toward the audit panel (0.83, 0.33), 1.00 → 1.25' })).drift, { x: 0.83, y: 0.33, scale: 1.25, t0: 3.2, t1: 6.9 });
  assert.equal(footageTiming(f({ capture_window: '2.2-5.3' })).hold, 0);
  assert.equal(footageTiming(f({})), null);
  assert.equal(footageTiming(f({ capture_window: '5-3' })), null);
});

test('clipArgs() / retargetDeclaration() / driftTween(): pure pieces', () => {
  assert.deepEqual(clipArgs('f.mp4', { a: 5.3, b: 8.3, hold: 3.6 }, 'o.mp4'), ['-v', 'error', '-y', '-ss', '5.3', '-to', '8.3', '-i', 'f.mp4', '-vf', 'fps=30,tpad=stop_mode=clone:stop_duration=3.6', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-t', '6.6', 'o.mp4']);
  const tag = '<video id="v" data-frame-video="approved" src="assets/footage.mp4" data-media-start="5.3" data-duration="3" data-start="0">';
  assert.equal(retargetDeclaration(tag, 'assets/clips/04-auto.mp4', 6.6), '<video id="v" data-frame-video="approved" src="assets/clips/04-auto.mp4" data-media-start="0" data-duration="6.6" data-start="0">');
  assert.equal(retargetDeclaration('<video data-frame-video="approved" src="a.mp4">', 'c.mp4', 2), '<video data-duration="2" data-media-start="0" data-frame-video="approved" src="c.mp4">');
  const t169 = { wrapper: { width: 1920, height: 1080, left: 0, top: 0, visible: { width: 1, height: 1 } } };
  assert.equal(driftTween(t169, { x: 0.83, y: 0.33, scale: 1.25, t0: 3.2, t1: 6.9 }, { wrapper: '#pp-cam-05', offset: 16.8 }), 'tl.to("#pp-cam-05", { scale: 1.25, xPercent: -12.499, yPercent: 12.499, duration: 3.7, ease: "sine.inOut" }, 20); // hold drift', 'focus clamped so the 1.25× window never leaves the footage (autozoom clampFocus)');
  assert.equal(driftTween(t169, null, { wrapper: '#x', offset: 0 }), null);
  const t916 = { zoom_factor: { min: 1.3, max: 1.5 }, wrapper: { width: 3413.333, height: 1920, left: -1166.667, top: 0, visible: { width: 0.3164, height: 1 } } };
  assert.match(driftTween(t916, { x: 0.82, y: 0.39, scale: 2.2, t0: 3.2, t1: 6.9 }, { wrapper: '#w', offset: 0 }), /scale: 1\.6,/, '9:16: the drift zoom in its own range (2.2× → 1.6×)');
});

const HAS_FFMPEG = spawnSyncT('ffmpeg', ['-version']).status === 0;
test('stageClips(): cuts footage[a..b] + a held last frame to the frame length, retargets the declaration, caches by parameters', { skip: !HAS_FFMPEG && 'ffmpeg not installed' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-clips-'));
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'compositions', 'frames'), { recursive: true });
  assert.equal(spawnSyncT('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=4', '-pix_fmt', 'yuv420p', path.join(dir, 'assets', 'footage.mp4')]).status, 0);
  fs.writeFileSync(path.join(dir, 'compositions', 'frames', '02-auto.html'), '<div id="root" data-composition-id="02-auto"><video id="v" data-frame-video="approved" src="assets/footage.mp4" data-media-start="1" data-duration="1.5" data-start="0"></video></div>');
  const storyboard = parseStoryboard('## Frame 1 — Hook\n- duration: 1s\n- src: compositions/frames/01-hook.html\n## Frame 2 — Auto\n- duration: 2.5s\n- src: compositions/frames/02-auto.html\n- capture_window: 1.0-2.0\n- capture_hold: 1.5\n');
  const ctx = { project: dir, p: (...a) => path.join(dir, ...a), storyboard, env: process.env };
  const run = makeRunner({ log: () => {}, throttle: { nice: null, cpuset: null, warnings: [] } });
  const r = stageClips(ctx, {}, run);
  assert.equal(r.ok, true, r.reason);
  assert.match(r.notes[0], /1 frame\(s\) on held clips .*\(1 cut, 0 cached\)/);
  const dur = Number(spawnSyncT('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, 'assets', 'clips', '02-auto.mp4')], { encoding: 'utf8' }).stdout);
  assert.ok(Math.abs(dur - 2.5) < 0.05, `clip = window 1.0 s + hold 1.5 s, got ${dur}`);
  assert.match(fs.readFileSync(path.join(dir, 'compositions', 'frames', '02-auto.html'), 'utf8'), /src="assets\/clips\/02-auto\.mp4" data-media-start="0" data-duration="2\.5"/);
  assert.match(stageClips(ctx, {}, run).notes[0], /\(0 cut, 1 cached\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});

import { lockWordsToScript } from './render-path.mjs';

test('lockWordsToScript(): names whisper splits are merged to the script spelling; heard differences stay; nothing invented', () => {
  const w = (text, start, end) => ({ id: `w${start}`, text, start, end });
  const heard = [w('Harbor', 0.09, 0.56), w('Line', 0.56, 0.93), w('Logistics', 0.93, 1.51), w('went', 1.84, 1.98), w('from', 2.07, 2.2), w('a', 2.2, 2.21), w('12', 2.26, 2.64), w('day', 2.65, 2.84), w('close', 2.9, 3.27), w('to', 3.39, 3.53), w('under', 3.53, 3.96), w('4.', 3.96, 4.24)];
  const r = lockWordsToScript(heard, '"Harborline Logistics went from a twelve-day close to under four."');
  assert.deepEqual(r.words.map((x) => x.text), ['Harborline', 'Logistics', 'went', 'from', 'a', '12', 'day', 'close', 'to', 'under', '4.']);
  assert.deepEqual([r.words[0].start, r.words[0].end], [0.09, 0.93], 'merged timing');
  assert.equal(r.changed, 1);
  const cased = lockWordsToScript([w('ledgerly', 0, 0.4), w('closes', 0.4, 0.8)], 'Ledgerly closes.');
  assert.deepEqual(cased.words.map((x) => x.text), ['Ledgerly', 'closes.']);
  assert.deepEqual(lockWordsToScript([], 'x').words, []);
  assert.deepEqual(lockWordsToScript([w('hello', 0, 1)], '').words.map((x) => x.text), ['hello']);
});

import { resolvePaths as resolveToolchainPaths } from './toolchain.mjs';

const TC = resolveToolchainPaths({}, process.env, os.homedir());
const HF_BIN = path.join(TC.node_modules ?? '', '.bin', 'hyperframes');
const GSAP_FILE = path.join(TC.node_modules ?? '', 'gsap', 'dist', 'gsap.min.js');
test('the same composition renders to the same SHA-256 twice', { skip: !(fs.existsSync(HF_BIN) && fs.existsSync(GSAP_FILE)) && 'pinned toolchain (hyperframes + gsap) not installed', timeout: 600000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-nfr04-'));
  fs.copyFileSync(GSAP_FILE, path.join(dir, 'gsap.min.js'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="UTF-8"><script src="gsap.min.js"></script>
<style>html,body{margin:0;width:640px;height:360px;overflow:hidden;background:#fff}#root{position:relative;width:640px;height:360px;background:#f7f9fb}#box{position:absolute;left:40px;top:120px;width:120px;height:120px;background:#2a6f97;border-radius:16px}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="640" data-height="360"><div id="box"></div></div>
<script>window.__timelines=window.__timelines||{};var tl=window.__timelines["main"]=gsap.timeline({paused:true});tl.to("#box",{x:400,rotation:90,duration:0.8,ease:"power3.out"},0.1);</script></body></html>`);
  const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1' };
  const hashes = [1, 2].map((n) => {
    const out = path.join(dir, `r${n}.mp4`);
    const r = spawnSyncT(HF_BIN, ['render', dir, '--quality', 'delivery', '--output', out, '--workers', '1'], { cwd: dir, env, encoding: 'utf8', timeout: 280000 });
    assert.equal(r.status, 0, (r.stderr || r.stdout || '').slice(-400));
    return crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
  });
  assert.equal(hashes[0], hashes[1]);
  fs.rmSync(dir, { recursive: true, force: true });
});

import { sfxCues, sfxDensity } from './render-path.mjs';

test('sfxCues() / sfxDensity(): "word @ t" cues are the plugin\'s, free text goes to the vendor; the densest 30 s window', () => {
  const sb = parseStoryboard('## Frame 1 — A\n- duration: 3s\n- sfx: none\n## Frame 2 — B\n- duration: 6s\n- sfx: click @ 0.71, success @ 3.1\n## Frame 3 — C\n- duration: 4s\n- sfx: a soft whoosh as the card lands\n## Frame 4 — D\n- duration: 4s\n- sfx: whoosh @ 0.2s\n');
  const r = sfxCues(sb);
  assert.deepEqual(r.cues, [{ frame: 2, cue: 'click', offset: 0.71 }, { frame: 2, cue: 'success', offset: 3.1 }, { frame: 4, cue: 'whoosh', offset: 0.2 }]);
  assert.deepEqual(r.freeText, [3]);
  assert.equal(sfxDensity([1, 2, 3, 40, 41]), 3);
  assert.equal(sfxDensity([0, 10, 20, 29.9, 30.5]), 4);
  assert.equal(sfxDensity([]), 0);
});

import { COST_ANCHORS, COST_CALIBRATION, actualFromClaudeResult, estimateCost } from './render-path.mjs';

test('estimateCost(): the anchors at 8 frames / 4 critics / 1 revision; scaled otherwise; calibrated; the $25 ceiling flagged', () => {
  for (const [profile, usd] of Object.entries(COST_ANCHORS)) assert.equal(estimateCost({ frames: 8, profile }).rule_usd, usd);
  const twelve = estimateCost({ frames: 12 });
  assert.equal(twelve.rule_usd, 28.6);
  assert.equal(COST_CALIBRATION['opus-orchestrator'].factor, 0.67, 'the median of the four measured runs');
  assert.deepEqual(COST_CALIBRATION['opus-orchestrator'].spread, [0.57, 1.08]);
  assert.equal(twelve.usd, 19.16);
  assert.equal(twelve.over_ceiling, false, 'the ceiling is judged on the calibrated estimate');
  assert.equal(twelve.calibration.factor, COST_CALIBRATION['opus-orchestrator'].factor);
  assert.equal(estimateCost({ frames: 8, revisions: 2 }).rule_usd, 29.7, 'a second revision round (by flag only) adds 35 %');
  const sonnet = estimateCost({ frames: 4, profile: 'all-sonnet' });
  assert.equal(sonnet.calibration, null); assert.equal(sonnet.usd, sonnet.rule_usd, 'an unmeasured profile prints the rule');
  assert.equal(estimateCost({ frames: 12, profile: 'all-opus' }).over_ceiling, true);
  for (const [frames, actual] of [[12, 18.13], [13, 17.13], [11, 19.15]]) {
    const e = estimateCost({ frames });
    assert.ok(Math.abs(e.usd - actual) / actual <= 0.2, `${frames} frames: ~$${e.usd} vs $${actual}`);
  }
  assert.deepEqual(actualFromClaudeResult({ total_cost_usd: 18.42, num_turns: 57, duration_ms: 3601234, usage: { input_tokens: 1200, output_tokens: 95000, cache_read_input_tokens: 4000000, cache_creation_input_tokens: 250000 } }),
    { usd: 18.42, input: 1200, output: 95000, cache_read: 4000000, cache_write: 250000, turns: 57, duration_s: 3601.2, source: 'claude -p --output-format json' });
});

import { DIRECTION_MARKER, storyboardDirection, withDirection } from './render-path.mjs';

test('storyboardDirection() / withDirection(): the global sections reach every packet above its block, idempotently', () => {
  const sb = '---\nformat: 1920x1080\n---\n# Title\n\nintro\n\n## Video direction\n\n- 9:16 stage box `0, 360, 1080, 1200`\n\n### Sizes\n\n- 38 px floor\n\n## Frame 1 — Hook\n\n- duration: 2s\n';
  const dir = storyboardDirection(sb);
  assert.equal(dir, '### Video direction\n\n- 9:16 stage box `0, 360, 1080, 1200`\n\n#### Sizes\n\n- 38 px floor');
  assert.equal(storyboardDirection('# T\n\n## Frame 1 — Hook\n'), '');
  const packet = '# Frame packet: 01-hook\n\n## Project inputs\n\n- Project: x\n\n## Assigned storyboard block\n\n## Frame 1 — Hook\n';
  const once = withDirection(packet, dir);
  assert.ok(once.indexOf(DIRECTION_MARKER) < once.indexOf('## Assigned storyboard block'));
  assert.match(once, /## Storyboard direction \(every frame[^\n]*\n\n### Video direction\n[\s\S]*0, 360, 1080, 1200/);
  assert.equal(withDirection(once, dir), once, 'a rerun replaces, never stacks');
  assert.equal(withDirection(once, ''), packet, 'no direction left → the vendor packet as it was');
  assert.match(withDirection('# P\n', dir), /^# P\n\n<!-- storyboard direction/);
});

import { assembleSummary } from './render-path.mjs';

test('assembleSummary(): the vendor anomalies, else the total duration — never the hoist repair\'s "- null"', () => {
  const base = '✓ assembled index.html\n  frames (track 1):  12\n  total duration:    59.6s (expected ~60s, -0.4s)\n';
  assert.equal(assembleSummary(`${base}\nrepaired (frame files updated in place):\n  - null\n  - null\n`), 'total duration:    59.6s (expected ~60s, -0.4s)');
  assert.equal(assembleSummary(`${base}\nanomalies (non-fatal):\n  - asset "none" named by a frame but not found\n  - sfx a.ogg not on disk — skipped\n`), '2 anomalies (non-fatal): asset "none" named by a frame but not found; sfx a.ogg not on disk — skipped');
});

import { stopListHits } from './render-path.mjs';

test('stopListHits(): on-screen text, CTA, storyboard voiceover and SCRIPT.md lines against the list', () => {
  const sb = parseStoryboard('## Frame 1 — Hook\n- duration: 3s\n- text: "A seamless close" @ 0.2-2.8\n- voiceover: "Our powerful engine."\n\n## Frame 2 — End\n- duration: 3s\n- cta: "Start my free trial" @ 0.3-2.8\n');
  const script = '## Line 1 — Hook (Frame 1)\n\n**Time:** 0.0–2.6 s\n\n    We are excited to announce Ledgerly.\n';
  const hits = stopListHits(sb, script);
  assert.deepEqual(hits.map((h) => [h.where, h.word]), [
    ['frame 1 text', 'seamless'], ['frame 1 voiceover', 'powerful'], ['SCRIPT.md line for frame 1', '"we\'re excited to announce" / "excited to share"'],
  ]);
  assert.deepEqual(stopListHits(parseStoryboard('## Frame 1 — Hook\n- duration: 3s\n- text: "Close the books in 3 days" @ 0.2-2.8\n')), []);
});

import { EDIT_SCOPE_EXEMPT, editScopeProblems } from './render-path.mjs';

test('approve commits; render refuses without approved: v<N> or with changes outside renders/edit-scope.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-versions-scope-'));
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' });
  try {
    ensureProjectRepo(dir);
    fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '---\nversion: v1\n---\n## Frame 1 — Hook\n');
    fs.mkdirSync(path.join(dir, 'compositions', 'frames'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'compositions', 'frames', '01-hook.html'), '<div>v1</div>');
    const ctx = { project: dir, p: (...a) => path.join(dir, ...a), paths: { doctor_file: path.join(dir, 'no-doctor.json') }, storyboard: parseStoryboard(fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8')), intake: { arguments_raw: '--for marketing' } };
    const approval = () => renderPreconditions({ ...ctx, storyboardText: fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8') }).filter((r) => r.includes('approved: v<N>'));
    assert.ok(approval().some((r) => /no `approved: v<N>`/.test(r)));
    const a = approveVersion(ctx, {}, '2026-09-27T00:00:00Z');
    assert.match(a.notes.at(-1), /"v1: --for marketing" \(approve\)/, 'the approval is a committed gate');
    assert.deepEqual(approval(), [], 'approved and clean: nothing refuses');
    fs.mkdirSync(path.join(dir, '.hyperframes'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.hyperframes', 'pp-stages.json'), '{}');
    fs.writeFileSync(path.join(dir, '.hyperframes', 'progress.json'), '{}');
    assert.ok(EDIT_SCOPE_EXEMPT.includes('.hyperframes/pp-stages.json'));
    assert.ok(EDIT_SCOPE_EXEMPT.includes('.hyperframes/progress.json'), 'the progress hook rewrites it on every tool call');
    assert.deepEqual(editScopeProblems(dir), []);
    fs.writeFileSync(path.join(dir, 'compositions', 'frames', '01-hook.html'), '<div>v2</div>');
    assert.match(editScopeProblems(dir)[0], /no renders\/edit-scope\.json .*compositions\/frames\/01-hook\.html/);
    fs.mkdirSync(path.join(dir, 'renders'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'renders', 'edit-scope.json'), JSON.stringify({ version: 'v2', files: ['compositions/frames/01-hook.html'] }));
    assert.deepEqual(editScopeProblems(dir), []);
    fs.writeFileSync(path.join(dir, 'frame.md'), 'palette changed');
    assert.match(editScopeProblems(dir)[0], /outside the declared set: frame\.md/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

import { commentFrame, frameComments, parseArgs as parseRenderArgs } from './render-path.mjs';

test('commentFrame(): a comment on one frame is bound to the version and the storyboard / index / master hashes; an unknown frame is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-fr36-comment-'));
  try {
    fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '---\nversion: v2\n---\n## Frame 1 — Hook\n- duration: 3s\n\n## Frame 2 — Dashboard\n- src: compositions/frames/02-dashboard.html\n- duration: 4s\n');
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    fs.mkdirSync(path.join(dir, 'renders'));
    fs.writeFileSync(path.join(dir, 'renders', 'manifest.json'), `${JSON.stringify({ version: 'v2', status: 'ok', sha256: { '16:9': 'cd'.repeat(32) } })}\n`);
    const ctx = { project: dir, p: (...a) => path.join(dir, ...a), storyboard: parseStoryboard(fs.readFileSync(path.join(dir, 'STORYBOARD.md'), 'utf8')) };
    const r = commentFrame(ctx, { frame: '02', text: 'The chart reads too small', approver: 'Dana' }, '2026-09-27T12:00:00Z');
    assert.equal(r.ok, true);
    assert.deepEqual([r.comment.frame, r.comment.frame_id, r.comment.version, r.comment.by, r.comment.status, r.comment.master_sha256], [2, '02-dashboard', 'v2', 'Dana', 'open', 'cd'.repeat(32)]);
    assert.match(r.comment.storyboard_sha256, /^[0-9a-f]{64}$/); assert.match(r.comment.index_sha256, /^[0-9a-f]{64}$/);
    assert.equal(frameComments(ctx).length, 1);
    const bad = commentFrame(ctx, { frame: '9', text: 'x' });
    assert.equal(bad.exit, 3); assert.match(bad.reason, /no frame 9 \(frames: 1, 2\)/);
    assert.throws(() => parseRenderArgs(['comment', '--frame', '2']), /--frame <N> and --text/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

import { framedBox, stageCamera, windowEdges } from './render-path.mjs';
import { BED_FADE_IN_S, CARVE_STRENGTH, VOICE_GROUP, bedVolumeLane, parseDropout, stageBedAutomation, stageCarve, withBedAutomation, withVoiceGroup } from './render-path.mjs';

test('parseDropout() / bedVolumeLane(): 0.3–0.5 s of silence ending on the reveal, the bed back on it; fades at both ends', () => {
  assert.deepEqual(parseDropout('0.4'), { len: 0.4, at: 0 });
  assert.deepEqual(parseDropout('0.45 @ 1.2'), { len: 0.45, at: 1.2 });
  assert.deepEqual(parseDropout('2'), { len: 0.5, at: 0 }, 'held to');
  assert.equal(parseDropout('before the reveal'), null);
  const lane = bedVolumeLane({ base: 0.9, duration: 45, dips: [{ t: 14.7, len: 0.4 }] });
  assert.equal(lane.target, 'volume');
  assert.deepEqual(lane.points.slice(0, 2), [{ t: 0, v: 0 }, { t: BED_FADE_IN_S, v: 0.9 }]);
  assert.deepEqual(lane.points.slice(2, 6), [{ t: 14.24, v: 0.9 }, { t: 14.3, v: 0 }, { t: 14.7, v: 0 }, { t: 14.73, v: 0.9 }]);
  assert.deepEqual(lane.points.slice(-2), [{ t: 43.5, v: 0.9 }, { t: 45, v: 0 }]);
  assert.equal(bedVolumeLane({ base: 0.5, duration: 10, dips: [{ t: 0.3, len: 0.4 }] }).points.length, 4);
});

test('withBedAutomation() / stageBedAutomation(): the lane lands on the vendor bed as &quot;-escaped JSON, replacing an earlier one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-bed-'));
  try {
    const html = '<div id="root"><audio\n        id="el-bgm"\n        src="assets/bgm/x.mp3"\n        data-start="0"\n        data-duration="12"\n        data-track-index="11"\n        data-volume="0.12"\n      ></audio><audio id="el-sfx-0" data-volume="0.3"></audio></div>';
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    const sb = parseStoryboard('## Frame 1 — Hook\n- duration: 4s\n\n## Frame 2 — Reveal\n- duration: 4s\n- dropout: 0.4\n\n## Frame 3 — End\n- duration: 4s\n');
    const ctx = { p: (...a) => path.join(dir, ...a), storyboard: sb };
    const r = stageBedAutomation(ctx, {});
    assert.match(r.note, /silence before the reveal in frame\(s\) 2 \(0\.4s\)/);
    const out = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const attr = /id="el-bgm"[^>]*data-automation="([^"]*)"/.exec(out)[1];
    const parsed = JSON.parse(attr.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    assert.deepEqual(parsed.lanes[0].points.find((p) => p.t === 4), { t: 4, v: 0 }, 'silent up to the frame-2 cut');
    assert.equal(parsed.lanes[0].points[1].v, 0.12, 'the lane holds the bed at its own volume');
    assert.ok(!/el-sfx-0[^>]*data-automation/.test(out), 'only the bed');
    stageBedAutomation(ctx, {});
    assert.equal((fs.readFileSync(path.join(dir, 'index.html'), 'utf8').match(/data-automation=/g) ?? []).length, 1, 'idempotent');
    assert.equal(withBedAutomation('<p>no bed</p>', { target: 'volume', points: [] }), '<p>no bed</p>');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('voice clips join one group; the volume lane merges with a carve\'s fx lanes; no carve skill → a named warning', () => {
  const html = '<audio id="el-01-hook-voice" src="a.wav"><audio id="el-02-x-voice" data-audio-group="vo"><audio id="el-bgm" data-volume="0.12">';
  const g = withVoiceGroup(html);
  assert.match(g, /id="el-01-hook-voice" src="a\.wav" data-audio-group="voiceover"/);
  assert.match(g, /id="el-02-x-voice" data-audio-group="vo">/, 'an existing group is left alone');
  assert.equal(VOICE_GROUP, 'voiceover'); assert.ok(CARVE_STRENGTH > 0.3 && CARVE_STRENGTH < 0.5, 'duck −6…−12 dB');
  const carved = '<audio id="el-bgm" data-volume="0.12" data-automation="' + JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: [] }, { target: 'fx.n1.gain', points: [{ t: 0, v: -3 }] }] }).replace(/"/g, '&quot;') + '">';
  const merged = withBedAutomation(carved, { target: 'volume', points: [{ t: 0, v: 0 }] });
  const lanes = JSON.parse(/data-automation="([^"]*)"/.exec(merged)[1].replace(/&quot;/g, '"')).lanes;
  assert.deepEqual(lanes.map((l) => l.target), ['fx.n1.gain', 'volume'], 'the carve lane stays, one volume lane');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-carve-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    const ctx = { project: dir, p: (...a) => path.join(dir, ...a), workflowDir: path.join(dir, 'skills', 'product-launch-video'), paths: {}, env: {} };
    assert.match(stageCarve(ctx, {}, () => { throw new Error('no run expected'); }).note, /carve skipped — .*hyperframes-audio/);
    fs.writeFileSync(path.join(dir, 'index.html'), '<audio id="el-bgm">');
    assert.equal(stageCarve(ctx, {}, () => {}).note, null, 'no voice, no carve');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

import { BEAT_REVEAL_TOL_S, beatSnap, voiceFloors } from './render-path.mjs';

test('beatSnap(): every cut onto the nearest beat within half a beat, voice floors kept, the last frame absorbs the drift; QA-01 guard', () => {
  const beats = { beats: Array.from({ length: 40 }, (_, i) => ({ time: round(0.1 + i * 0.5) })), strongCues: [] };
  function round(x) { return Math.round(x * 1000) / 1000; }
  const md = '---\nduration: 12s\n---\n## Frame 1 — Hook\n- duration: 2.8s\n\n## Frame 2 — Product\n- duration: 3.3s\n\n## Frame 3 — Proof\n- duration: 2.9s\n\n## Frame 4 — End\n- duration: 3s\n';
  const r = beatSnap(md, beats);
  assert.equal(r.cuts, 3);
  assert.equal(r.locked, 3, r.note);
  assert.equal(r.total_s, 12, 'total kept');
  assert.match(r.text, /Frame 1 — Hook\n- duration: 2\.6s/);
  const floors = voiceFloors({ voices: [{ frame: 1, duration_s: 2.0 }] });
  assert.equal(floors.get(1), 2.8);
  const v = beatSnap(md.replace('- duration: 2.8s', '- duration: 2.9s'), beats, { floors });
  assert.deepEqual(v.moved.find((m) => m.frame === 1), { frame: 1, from: 2.9, to: 3.1 }, 'the beat before (2.6 s) is under the floor, so the one after');
  assert.equal(beatSnap(md, { beats: [] }).moved.length, 0);
  const tight = beatSnap(md, beats, { floors: new Map([[1, 3.0], [2, 3.4], [3, 3.1], [4, 3.2]]), briefS: 12 });
  assert.match(tight.note, /not applied|total kept|within/);
  assert.equal(BEAT_REVEAL_TOL_S, 0.15);
});

test('stageCamera(): a footage frame whose plan never moves the camera (no zoom, no drift) is a warning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-w03-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), INDEX);
    fs.mkdirSync(path.join(dir, 'compositions', 'frames'), { recursive: true });
    const stillPlan = { ...PLAN, tracks: { '16:9': { ...PLAN.tracks['16:9'], keyframes: [PLAN.tracks['16:9'].keyframes[0]] } } };
    fs.writeFileSync(path.join(dir, 'compositions', 'frames', '02-product.autozoom.json'), JSON.stringify(stillPlan));
    const sb = parseStoryboard('## Frame 1 — Hook\n- src: compositions/frames/01-hook.html\n- duration: 3.5s\n\n## Frame 2 — Product\n- src: compositions/frames/02-product.html\n- duration: 4.5s\n\n## Frame 3 — End\n- src: compositions/frames/03-end.html\n- duration: 3s\n');
    const cam = stageCamera({ p: (...a) => path.join(dir, ...a), storyboard: sb }, {});
    assert.deepEqual(cam.still, ['02-product']);
    assert.match(cam.notes.at(-1), /^warning: camera: 02-product — footage with no camera move/);
    fs.writeFileSync(path.join(dir, 'index.html'), INDEX);
    fs.writeFileSync(path.join(dir, 'compositions', 'frames', '02-product.autozoom.json'), JSON.stringify(PLAN));
    assert.deepEqual(stageCamera({ p: (...a) => path.join(dir, ...a), storyboard: sb }, {}).still, [], 'a zoom is a move');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('framedBox() / windowEdges(): a window smaller than the canvas is framed and keeps padding; a full-bleed box is neither', () => {
  const canvas = { width: 1920, height: 1080 };
  assert.equal(framedBox({ left: 0, top: 0, width: 1920, height: 1080 }, canvas), false);
  assert.equal(framedBox({ left: 347, top: 0, width: 1573, height: 885 }, canvas), true);
  assert.deepEqual(windowEdges({ left: 347, top: 0, width: 1573, height: 885 }, canvas), ['top', 'right'], 'GS-01: the window sat flush with the top and right edges');
  assert.deepEqual(windowEdges({ left: 320, top: 24, width: 1280, height: 720 }, canvas), []);
  assert.deepEqual(windowEdges({ left: 0, top: 0, width: 1920, height: 1080 }, canvas), [], 'full bleed has no edges to pad');
});
