import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  AUTOZOOM_DEFAULTS, AUTOZOOM_RESEARCH, EASES, EASE_FN, FORMATS, SCHEMA, USAGE, parseArgs, parseEvents, normalizeEvents,
  fitScale, seedKind, typingBurstStarts, clusterEvents, planSegments, wrapperGeometry, roundGeometry, clampFocus, poseTransform, buildTrack,
  springConstants, springStep, cursorWaypoints, springPath, rebaseKeyframes, rebasePath, sizeChecks, buildAutozoom,
  gsapSnippet, motionBlurPx, MOTION_BLUR_MAX_PX, previewHtml, probeFootage, captureFacts,
} from './autozoom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'autozoom.mjs');

const tmpDirs = [];
function tmp(prefix = 'pp-az-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function run(args, opts = {}) {
  return spawnSync('node', [script, ...args], { encoding: 'utf8', cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) } });
}
function binAvailable(bin, args = ['--version']) {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  return !r.error && (r.status === 0 || r.status === null);
}

const ORIGIN = 1_700_000_000_000;
const VIEWPORT = { width: 1920, height: 1080 };
const SOURCE_4K = { width: 3840, height: 2160 };
const px = (x, y, w, h) => ({ x, y, w, h });
const ev = (t, type, rect = null, tag = null, selector = null) => ({ t: ORIGIN + Math.round(t * 1000), type, tag, selector, rect });
function norm(raw, durationSec = 30) {
  return normalizeEvents(parseEvents(raw.map((e) => JSON.stringify(e)).join('\n')), { originMs: ORIGIN, viewport: VIEWPORT, durationSec }).events;
}
function plan(raw, { duration = 30, source = SOURCE_4K, ...rest } = {}) {
  return buildAutozoom({ events: parseEvents(raw.map((e) => JSON.stringify(e)).join('\n')), originMs: ORIGIN, viewport: VIEWPORT, source: { ...source, duration }, ...rest });
}
const manifest = (over = {}) => ({
  schema: 'power-presentation/capture-manifest@0.1', tier: 'A',
  capture: { backend: 'playwright-cdp-screencast', viewport: { ...VIEWPORT, dpr: 2 }, screencast_size: { ...SOURCE_4K }, cursor: 'none' },
  timeline: { footage_start_ms: ORIGIN, footage_end_ms: ORIGIN + 16_000, events_origin: 'epoch-ms; footage_t = t - footage_start_ms' },
  ...over,
});
const BUTTON = px(1600, 80, 160, 40);
const FIELD = px(700, 400, 520, 44);
const SAVE = px(1000, 520, 140, 44);
const LINK = px(100, 1000, 60, 20);
const ROW = px(200, 700, 1500, 48);
const BODY = px(0, 0, 1920, 1080);
const FLOW = [
  ev(-0.2, 'navigation'), ev(1.3, 'click', BUTTON, 'button', '#new'), ev(1.8, 'focus', FIELD, 'input', '#name'),
  ev(2.1, 'key', FIELD, 'input'), ev(2.3, 'key', FIELD, 'input'), ev(2.5, 'key', FIELD, 'input'), ev(2.7, 'key', FIELD, 'input'),
  ev(3.8, 'click', SAVE, 'button', '#save'), ev(5.8, 'scroll'), ev(8.8, 'click', ROW, 'tr'), ev(12.8, 'click', BODY, 'body'), ev(13.8, 'click', LINK, 'a'),
];

test('defaults: zoom-in 0.7 s, hold 1–2 s, zoom-out 0.8 s, ease-out ≤ 8 % overshoot, ≤ 1 zoom per 3 s, factor 1.5–2× (3× 4K), dead zone 50 % × 70 %, spring 470 / 3.0 / 70, never scroll / video', () => {
  assert.equal(AUTOZOOM_DEFAULTS.zoomInSec, 0.7);
  assert.deepEqual(AUTOZOOM_DEFAULTS.holdSec, { min: 1.0, max: 2.0 });
  assert.equal(AUTOZOOM_DEFAULTS.zoomOutSec, 0.8);
  assert.equal(AUTOZOOM_DEFAULTS.ease, 'ease-out');
  assert.equal(AUTOZOOM_DEFAULTS.overshootMax, 0.08);
  assert.equal(AUTOZOOM_DEFAULTS.minGapSec, 3.0);
  assert.deepEqual(AUTOZOOM_DEFAULTS.zoomFactor, { min: 1.5, max: 2.0, max4k: 3.0 });
  assert.deepEqual(AUTOZOOM_DEFAULTS.deadZone, { width: 0.5, height: 0.7 });
  assert.deepEqual(AUTOZOOM_DEFAULTS.cursorSpring, { tension: 470, mass: 3.0, friction: 70 });
  assert.deepEqual([...AUTOZOOM_DEFAULTS.neverZoom].sort(), ['scroll', 'video']);
  assert.ok(Object.isFrozen(AUTOZOOM_DEFAULTS) && Object.isFrozen(AUTOZOOM_DEFAULTS.cursorSpring));
});

test('tuning knobs are frozen and consistent with the defaults (hold-after inside 1–2 s, 9:16 factor below the 16:9 range)', () => {
  assert.ok(Object.isFrozen(AUTOZOOM_RESEARCH));
  assert.ok(AUTOZOOM_RESEARCH.holdAfterSec >= AUTOZOOM_DEFAULTS.holdSec.min && AUTOZOOM_RESEARCH.holdAfterSec <= AUTOZOOM_DEFAULTS.holdSec.max);
  assert.ok(AUTOZOOM_RESEARCH.zoomFactor916.max <= AUTOZOOM_DEFAULTS.zoomFactor.min);
  assert.ok(!('focusPadding' in AUTOZOOM_RESEARCH), 'padding never moves a centre — removed');
  assert.equal(FORMATS['16:9'].zoomFactor, AUTOZOOM_DEFAULTS.zoomFactor);
  assert.equal(FORMATS['9:16'].zoomFactor, AUTOZOOM_RESEARCH.zoomFactor916);
});

test('eases by role: zoom-in ease-out (power3.out with the bezier), re-aim ease-in-out, zoom-out ease-out; progress functions end at 1', () => {
  assert.equal(EASES['zoom-in'].gsap, 'power3.out');
  assert.equal(EASES['zoom-in'].css, 'cubic-bezier(0.23,1,0.32,1)');
  assert.equal(EASES.reaim.gsap, 'power2.inOut');
  assert.equal(EASES['zoom-out'].gsap, 'power2.out');
  for (const [name, fn] of Object.entries(EASE_FN)) { assert.equal(fn(0), 0, name); assert.equal(fn(1), 1, name); assert.ok(fn(0.5) > 0 && fn(0.5) < 1, name); }
  assert.ok(EASE_FN['power3.out'](0.5) > EASE_FN['power2.inOut'](0.5), 'ease-out is ahead of ease-in-out at mid-tween');
});

test('parseArgs: defaults, every flag, numeric validation, 1:1 rejected (v1), unknown flag', () => {
  const d = parseArgs([]);
  assert.deepEqual(d, { events: null, manifest: null, footage: null, out: 'autozoom.json', format: '16:9', clipStart: 0, clipDuration: null, maxScale: null, cursorFps: 30, emitHtml: null, print: false, help: false });
  const o = parseArgs(['--events', 'e.jsonl', '--manifest', 'm.json', '--footage', 'f.mp4', '--out', '-', '--format', '9:16', '--clip-start', '2.5', '--clip-duration', '6', '--max-scale', '3', '--cursor-fps', '25', '--emit-html', 'p.html', '--print']);
  assert.equal(o.format, '9:16'); assert.equal(o.clipStart, 2.5); assert.equal(o.clipDuration, 6); assert.equal(o.maxScale, 3); assert.equal(o.cursorFps, 25); assert.equal(o.emitHtml, 'p.html'); assert.equal(o.print, true); assert.equal(o.out, '-');
  assert.throws(() => parseArgs(['--format', '1:1']), /1:1 is v1/);
  assert.throws(() => parseArgs(['--clip-duration', '0']), /≥ 0\.001/);
  assert.throws(() => parseArgs(['--cursor-fps', '2.5']), /integer/);
  assert.throws(() => parseArgs(['--max-scale', 'x']), /number/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  assert.ok(parseArgs(['-h']).help);
});

test('parseEvents: sorted by t (line order on ties), blank lines skipped, tags lower-cased, invalid rects dropped, bad lines throw with the line number', () => {
  const text = [
    JSON.stringify({ t: 20, type: 'click', tag: 'BUTTON', rect: { x: 1, y: 2, w: 3, h: 4 } }),
    '',
    JSON.stringify({ t: 10, type: 'focus', rect: { x: 1, y: 2, w: -3, h: 4 } }),
    JSON.stringify({ t: 20, type: 'key', rect: { x: '1', y: 2, w: 3, h: 4 } }),
    '   ',
  ].join('\n');
  const ev1 = parseEvents(text);
  assert.deepEqual(ev1.map((e) => [e.t, e.type, e.line]), [[10, 'focus', 3], [20, 'click', 1], [20, 'key', 4]]);
  assert.equal(ev1[1].tag, 'button');
  assert.equal(ev1[0].rect, null, 'negative size → no rect');
  assert.equal(ev1[2].rect, null, 'non-numeric → no rect');
  assert.deepEqual(ev1[1].rect, { x: 1, y: 2, w: 3, h: 4 });
  assert.throws(() => parseEvents('{"t":1,"type":"click"}\n{oops'), /line 2: invalid JSON/);
  assert.throws(() => parseEvents('{"type":"click"}'), /line 1: needs a numeric "t"/);
  assert.throws(() => parseEvents('{"t":1}'), /string "type"/);
  assert.deepEqual(parseEvents(''), []);
});

test('normalizeEvents: footage_t = (t - origin) / 1000, rects become viewport fractions clipped to the frame, events outside [0, duration] are dropped and counted', () => {
  const raw = [ev(-0.5, 'navigation'), ev(0, 'click', px(960, 540, 100, 50)), ev(4, 'click', px(1900, 1070, 200, 100)), ev(10.001, 'click', px(0, 0, 10, 10))];
  const { events, dropped } = normalizeEvents(parseEvents(raw.map((e) => JSON.stringify(e)).join('\n')), { originMs: ORIGIN, viewport: VIEWPORT, durationSec: 10 });
  assert.equal(dropped, 2);
  assert.deepEqual(events.map((e) => e.t), [0, 4]);
  assert.deepEqual(events[0].rect, { x: 0.5, y: 0.5, w: 100 / 1920, h: 50 / 1080 });
  const r = events[1].rect;
  assert.ok(Math.abs(r.x + r.w - 1) < 1e-9 && Math.abs(r.y + r.h - 1) < 1e-9, 'a rect hanging off the edge is clipped to the frame');
  assert.deepEqual(events.map((e) => e.i), [0, 1]);
});

test('fitScale: the largest factor at which the box fits the 50 % × 70 % dead zone of the zoomed viewport; degenerate targets zoom to the ceiling, the whole frame never', () => {
  assert.equal(fitScale({ x: 0, y: 0, w: 0.25, h: 0.1 }), 2);
  assert.equal(fitScale({ x: 0, y: 0, w: 0.1, h: 0.35 }), 2);
  assert.equal(fitScale({ x: 0, y: 0, w: 1, h: 1 }), 0.5);
  assert.equal(fitScale({ x: 0, y: 0, w: 0, h: 0 }), 100);
  assert.ok(fitScale({ x: 0, y: 0, w: FIELD.w / 1920, h: FIELD.h / 1080 }) > AUTOZOOM_DEFAULTS.zoomFactor.min, 'a 520 px form field zooms (regression: 12 % padding pushed it under 1.5×)');
});

test('seedKind / typingBurstStarts: clicks, text-field focus and the first key of a ≥ 3-keys-in-1.5-s burst seed; button focus, lone keys and rect-less events do not', () => {
  const events = norm([ev(1, 'click', BUTTON, 'button'), ev(2, 'focus', BUTTON, 'button'), ev(3, 'focus', FIELD, 'input'), ev(4, 'key', FIELD, 'input'), ev(4.5, 'key', FIELD, 'input'), ev(5.4, 'key', FIELD, 'input'), ev(9, 'key', FIELD, 'input'), ev(12, 'click', null)]);
  const bursts = typingBurstStarts(events);
  assert.deepEqual([...bursts].sort(), [3], 'only the first key of the burst (keys at 4, 4.5, 5.4 fit in 1.5 s; the key at 9 does not)');
  assert.equal(seedKind(events[0], false), 'click');
  assert.equal(seedKind(events[1], false), null, 'focus on a button is not a text field');
  assert.equal(seedKind(events[2], false), 'focus');
  assert.equal(seedKind(events[3], true), 'typing');
  assert.equal(seedKind(events[6], false), null);
  assert.equal(seedKind(events[7], false), null, 'no rect → no seed');
  assert.deepEqual([...typingBurstStarts(norm([ev(1, 'key', FIELD), ev(1.2, 'key', FIELD)]))], [], 'two keys are not a burst');
});

test('clusterEvents: nearby targets merge while their union fits the dead zone; a distant seed opens a new cluster; idle > 1.5 s, scroll and navigation close; scroll never seeds', () => {
  const c = clusterEvents(norm(FLOW));
  assert.deepEqual(c.map((x) => [x.id, x.start, x.last, x.kinds]), [[1, 1.3, 1.3, ['click']], [2, 1.8, 3.8, ['focus', 'typing', 'click']], [3, 13.8, 13.8, ['click']]]);
  assert.deepEqual(c[1].events, [1, 2, 3, 4, 5, 6], 'field focus, the four keys and the save click share one cluster (indices after the dropped navigation)');
  assert.deepEqual(c.map((x) => [x.closed_by, x.closed_at]), [['seed', null], ['scroll', 5.8], ['end', null]]);
  assert.ok(c[1].fit_scale > 1.5 && c[1].fit_scale < 2, `form + save fits at ${c[1].fit_scale}×`);
  assert.equal(c[2].fit_scale, 16, 'the 60×20 link, capped by the dead-zone width: 0.5 / (60/1920)');
  const s = clusterEvents(norm([ev(1, 'click', BUTTON), ev(1.5, 'scroll', BUTTON), ev(2, 'click', BUTTON)]));
  assert.deepEqual(s.map((x) => [x.start, x.last]), [[1, 1], [2, 2]]);
  assert.deepEqual(clusterEvents(norm([ev(1, 'scroll', BUTTON), ev(2, 'scroll', BUTTON)])), []);
  const idle = clusterEvents(norm([ev(1, 'click', BUTTON), ev(2.4, 'click', BUTTON), ev(4, 'click', BUTTON)]));
  assert.deepEqual(idle.map((x) => [x.start, x.last]), [[1, 2.4], [4, 4]]);
  const nav = clusterEvents(norm([ev(1, 'click', BUTTON), ev(1.2, 'navigation'), ev(1.4, 'click', BUTTON)]));
  assert.deepEqual(nav.map((x) => [x.start, x.last]), [[1, 1], [1.4, 1.4]]);
});

test('clusterEvents: a target too big to zoom at 1.5× never seeds (full-width row, body); activity on a big target inside an open cluster extends the hold without re-aiming', () => {
  assert.deepEqual(clusterEvents(norm([ev(1, 'click', ROW, 'tr'), ev(2, 'click', BODY, 'body')])), []);
  const c = clusterEvents(norm([ev(1, 'click', SAVE, 'button'), ev(1.5, 'key', BODY, 'body'), ev(2.0, 'key', BODY, 'body')]));
  assert.equal(c.length, 1);
  assert.equal(c[0].last, 2.0, 'the keys on body extend the hold');
  assert.deepEqual(c[0].bbox, { x: 0.5208, y: 0.4815, w: 0.0729, h: 0.0407 }, 'but never widen the focus');
  const d = clusterEvents(norm([ev(1, 'click', SAVE, 'button'), ev(1.5, 'click', BODY, 'body'), ev(2.0, 'click', LINK, 'a')]));
  assert.deepEqual(d.map((x) => [x.start, x.last]), [[1, 1], [2, 2]]);
});

test('planSegments: pre-aim arrives on the first event (in 0.7 s), holds ≥ 1 s after arrival and 1.2 s after the last event, zooms out over 0.8 s', () => {
  const [seg] = planSegments(clusterEvents(norm([ev(5, 'click', SAVE)])), 30);
  assert.equal(seg.t_in_start, 4.3);
  assert.deepEqual(seg.poses.map((p) => [p.role, p.t_move_start, p.t_arrive]), [['zoom-in', 4.3, 5]]);
  assert.equal(seg.t_out_start, 6.2, 'last event 5 + holdAfter 1.2');
  assert.equal(seg.t_out_end, 7);
  assert.equal(seg.ends_zoomed, false);
  const [early] = planSegments(clusterEvents(norm([ev(0.3, 'click', SAVE)])), 30);
  assert.equal(early.t_in_start, 0, 'never before the footage starts');
  assert.equal(early.t_out_start, 1.7, 'arrival 0.7 + holdSec.min 1.0 wins over 0.3 + 1.2');
});

test('planSegments: two clusters 2 s apart become one segment with a re-aim (never two zooms inside 3 s); 5 s apart become two segments; the next zoom-in never starts before the previous zoom-out ends', () => {
  const close = planSegments(clusterEvents(norm([ev(2, 'click', BUTTON), ev(4, 'click', LINK)])), 30);
  assert.equal(close.length, 1);
  assert.deepEqual(close[0].poses.map((p) => [p.role, p.t_move_start, p.t_arrive]), [['zoom-in', 1.3, 2], ['reaim', 3.3, 4]]);
  assert.equal(close[0].t_out_start, 5.2);
  const apart = planSegments(clusterEvents(norm([ev(2, 'click', BUTTON), ev(7, 'click', LINK)])), 30);
  assert.equal(apart.length, 2);
  assert.equal(apart[0].t_out_end, 4);
  assert.equal(apart[1].t_in_start, 6.3);
  assert.ok(apart[1].t_in_start - apart[0].t_in_start >= AUTOZOOM_DEFAULTS.minGapSec);
  const border = planSegments(clusterEvents(norm([ev(2, 'click', BUTTON), ev(4.9, 'click', LINK)])), 30);
  assert.equal(border.length, 1); assert.equal(border[0].poses.length, 2);
  const rapid = planSegments(clusterEvents(norm([ev(2, 'click', BUTTON), ev(2.3, 'click', LINK)])), 30);
  assert.deepEqual(rapid[0].poses.map((p) => [p.role, p.t_move_start, p.t_arrive]), [['zoom-in', 1.3, 2], ['reaim', 3, 3.7]]);
});

test('planSegments: at the end of the footage the zoom-out is dropped (ends_zoomed), a cluster the camera cannot reach in time is absorbed into the hold, and one that cannot start is skipped (footage-ends)', () => {
  const [seg] = planSegments(clusterEvents(norm([ev(9.5, 'click', SAVE)], 10)), 10);
  assert.equal(seg.ends_zoomed, true); assert.equal(seg.t_out_start, null); assert.equal(seg.t_end, 10);
  assert.equal(seg.poses[0].hold_until, 10);
  const absorbed = planSegments(clusterEvents(norm([ev(9, 'click', BUTTON), ev(9.9, 'click', LINK)], 10)), 10);
  assert.equal(absorbed.length, 1); assert.equal(absorbed[0].poses.length, 1);
  assert.deepEqual(absorbed[0].poses[0].cluster.absorbed, [2], 're-aim would start at 10.0 (arrival 9 + hold 1) and cannot arrive by 10');
  assert.equal(absorbed[0].poses[0].cluster.last, 9.9);
  assert.deepEqual(absorbed.skipped, []);
  const late = planSegments(clusterEvents(norm([ev(1, 'click', BUTTON), ev(1.3, 'click', LINK), ev(4.5, 'click', SAVE)], 5)), 5);
  assert.equal(late.length, 1);
  assert.deepEqual(late.skipped, [{ cluster: 3, reason: 'footage-ends' }]);
});

test('planSegments: a scroll or navigation ends the segment at the break (never a re-aim across it); the next cluster needs the 3 s cadence or is skipped; a cluster the camera would reach only after its hold is over is skipped (camera-lag)', () => {
  const scrolled = planSegments(clusterEvents(norm([ev(2, 'click', BUTTON), ev(2.5, 'scroll'), ev(3.6, 'click', LINK), ev(6, 'click', SAVE)])), 30);
  assert.equal(scrolled.length, 2);
  assert.equal(scrolled[0].t_out_start, 3, 'zoom-out at max(arrival 2 + 1.0, min(2 + 1.2, scroll 2.5)) = 3.0');
  assert.equal(scrolled[0].poses[0].hold_until, 3);
  assert.equal(scrolled[0].poses.length, 1, 'no re-aim to the link across the scroll');
  assert.deepEqual(scrolled.skipped, [{ cluster: 2, reason: 'cadence-after-break' }], 'the link at 3.6 would zoom 1.6 s after the first zoom-in');
  assert.equal(scrolled[1].poses[0].cluster.start, 6);
  assert.equal(scrolled[1].t_in_start, 5.3);
  const nav = planSegments(clusterEvents(norm([ev(2, 'click', BUTTON), ev(4, 'navigation'), ev(5.5, 'click', LINK)])), 30);
  assert.equal(nav[0].t_out_start, 3.2, 'the break came after the natural hold end — nothing changes');
  assert.equal(nav.length, 2); assert.equal(nav[1].t_in_start, 4.8);
  const lag = planSegments(clusterEvents(norm([ev(2, 'click', BUTTON), ev(2.8, 'click', LINK), ev(3.6, 'click', BUTTON), ev(4.4, 'click', LINK), ev(5.2, 'click', BUTTON)])), 30);
  assert.equal(lag.length, 1);
  assert.deepEqual(lag[0].poses.map((p) => [p.cluster.id, p.role, p.t_move_start, p.t_arrive]), [[1, 'zoom-in', 1.3, 2], [2, 'reaim', 3, 3.7], [3, 'reaim', 4.7, 5.4], [5, 'reaim', 6.4, 7.1]]);
  assert.deepEqual(lag.skipped, [{ cluster: 4, reason: 'camera-lag' }], 'cluster 4 (4.4) could only be reached at 6.4+0.7 = 7.1 > 4.4 + 2.0');
  const cad = planSegments(clusterEvents(norm([ev(2, 'click', BUTTON), ev(2.4, 'scroll'), ev(3.6, 'click', LINK), ev(4.6, 'click', SAVE)])), 30);
  assert.deepEqual(cad.skipped, [{ cluster: 2, reason: 'cadence-after-break' }, { cluster: 3, reason: 'cadence' }]);
  assert.equal(cad.length, 1);
});

test('invariants over a dense deterministic log: every zoom-in 0.7 s, re-aim 0.7 s, zoom-out 0.8 s; zoom starts ≥ 3 s apart; holds ≥ 1 s; segments never overlap', () => {
  const targets = [BUTTON, FIELD, SAVE, LINK, px(300, 300, 200, 60), px(1500, 900, 120, 30)];
  const raw = [];
  for (let i = 0; i < 60; i += 1) raw.push(ev(0.4 + i * 0.9 + (i % 3) * 0.17, i % 7 === 0 ? 'scroll' : 'click', targets[(i * 5) % targets.length], 'button'));
  const clusters = clusterEvents(norm(raw, 60));
  const segs = planSegments(clusters, 60);
  assert.ok(segs.length >= 4, `expected several zooms, got ${segs.length}`);
  assert.ok(segs.skipped.length > 0, 'a log this dense must skip clusters rather than chase them');
  const placed = segs.reduce((n, s) => n + s.poses.length, 0) + segs.skipped.length + segs.reduce((n, s) => n + s.poses.reduce((m, p) => m + (p.cluster.absorbed ?? []).length, 0), 0);
  assert.equal(placed, clusters.length, 'every cluster is a pose, absorbed or skipped');
  let prevEnd = 0; let prevIn = -Infinity;
  for (const s of segs) {
    assert.ok(s.t_in_start >= prevEnd - 1e-9, 'a zoom-in never starts before the previous zoom-out ends');
    assert.ok(s.t_in_start - prevIn >= AUTOZOOM_DEFAULTS.minGapSec - 1e-9, `${s.t_in_start} - ${prevIn} < 3 s (cadence)`);
    let arrive = null;
    for (const p of s.poses) {
      assert.equal(Number((p.t_arrive - p.t_move_start).toFixed(3)), 0.7);
      if (arrive != null) assert.ok(p.t_move_start - arrive >= AUTOZOOM_DEFAULTS.holdSec.min - 1e-9, 'a pose holds ≥ 1 s before re-aiming');
      assert.ok(p.t_arrive <= p.cluster.last + AUTOZOOM_DEFAULTS.holdSec.max + 1e-9, 'the camera never arrives after the hold ceiling of the action');
      assert.ok(p.hold_until >= p.t_arrive + AUTOZOOM_DEFAULTS.holdSec.min - 1e-9 || s.ends_zoomed);
      arrive = p.t_arrive;
    }
    if (!s.ends_zoomed) {
      assert.equal(Number((s.t_out_end - s.t_out_start).toFixed(3)), 0.8);
      assert.ok(s.t_out_start - arrive >= AUTOZOOM_DEFAULTS.holdSec.min - 1e-9);
    }
    prevEnd = s.t_end; prevIn = s.t_in_start;
  }
});

test('wrapperGeometry: 16:9 canvas = the wrapper; 9:16 canvas gets a height-fit 3413×1920 wrapper centred at −1166.667 showing 31.64 % of the width', () => {
  assert.deepEqual(wrapperGeometry(FORMATS['16:9'].canvas, SOURCE_4K), { width: 1920, height: 1080, left: 0, top: 0, visible: { width: 1, height: 1 } });
  assert.deepEqual(roundGeometry(wrapperGeometry(FORMATS['9:16'].canvas, SOURCE_4K)), { width: 3413.333, height: 1920, left: -1166.667, top: 0, visible: { width: 0.3164, height: 1 } });
  assert.ok(Math.abs(wrapperGeometry(FORMATS['9:16'].canvas, SOURCE_4K).visible.width - 0.31640625) < 1e-12, 'exact for the clamp math');
});

test('clampFocus: at scale 1 a 16:9 focus is always the centre; at 2× the window half-width is 0.25; a 9:16 focus near an edge snaps flush to it (Cap edge_snap 0.25) and one in the middle stays', () => {
  const g169 = wrapperGeometry(FORMATS['16:9'].canvas, SOURCE_4K);
  const g916 = wrapperGeometry(FORMATS['9:16'].canvas, SOURCE_4K);
  const near = (a, b) => assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  near(clampFocus({ x: 0.1, y: 0.9 }, 1, g169), { x: 0.5, y: 0.5 });
  near(clampFocus({ x: 0.1, y: 0.9 }, 2, g169), { x: 0.25, y: 0.75 });
  near(clampFocus({ x: 0.4, y: 0.6 }, 2, g169), { x: 0.4, y: 0.6 });
  near(clampFocus({ x: 0.2, y: 0.5 }, 1, g916), { x: 0.31640625 / 2, y: 0.5 });
  near(clampFocus({ x: 0.4, y: 0.5 }, 1, g916), { x: 0.4, y: 0.5 });
  near(clampFocus({ x: 0.9, y: 0.05 }, 1.5, g916), { x: 1 - 0.31640625 / 3, y: 1 / 3 });
});

test('poseTransform: xPercent = -(fx - 0.5)·S·100 brings the focus to the canvas centre; percents truncate toward zero (never outward), no -0', () => {
  assert.deepEqual(poseTransform({ x: 0.25, y: 0.75 }, 2), { scale: 2, xPercent: 50, yPercent: -50 });
  assert.deepEqual(poseTransform({ x: 0.5, y: 0.5 }, 1), { scale: 1, xPercent: 0, yPercent: 0 });
  assert.ok(Object.is(poseTransform({ x: 0.5, y: 0.5 }, 1).xPercent, 0), 'not -0');
  assert.deepEqual(poseTransform({ x: 1 - 0.31640625 / 3, y: 0.5 }, 1.5), { scale: 1.5, xPercent: -59.179, yPercent: 0 }, '59.1797 truncates to 59.179, not rounded to 59.18');
});

test('buildTrack: scale = fit clamped to the format range (16:9 1.5–2, 9:16 1.3–1.5); --max-scale 3 only with a 2160-px source; roles and eases; 16:9 home is 0/0, 9:16 home pre-aims at the first focus and holds the last centre after a zoom-out', () => {
  const segs = planSegments(clusterEvents(norm(FLOW, 16)), 16);
  const t169 = buildTrack('16:9', segs, { ...SOURCE_4K, duration: 16 });
  const t916 = buildTrack('9:16', segs, { ...SOURCE_4K, duration: 16 });
  assert.deepEqual(t169.poses.map((p) => p.scale), [2, 1.846, 2]);
  assert.deepEqual(t916.poses.map((p) => p.scale), [1.5, 1.5, 1.5]);
  assert.deepEqual(t169.keyframes.map((k) => [k.t, k.role, k.ease ?? null]), [[0, 'home', null], [0.6, 'zoom-in', 'power3.out'], [2.3, 'reaim', 'power2.inOut'], [5, 'zoom-out', 'power2.out'], [13.1, 'zoom-in', 'power3.out'], [15, 'zoom-out', 'power2.out']]);
  assert.deepEqual(t169.keyframes[0], { t: 0, set: true, role: 'home', focus: { x: 0.5, y: 0.5 }, scale: 1, xPercent: 0, yPercent: 0 });
  assert.deepEqual(t169.keyframes[1].focus, { x: 0.75, y: 0.25 }); assert.equal(t169.keyframes[1].xPercent, -50); assert.equal(t169.keyframes[1].yPercent, 50);
  assert.deepEqual(t916.keyframes[0].focus, { x: 0.8418, y: 0.5 }, '9:16 pre-aims flush right at scale 1');
  assert.equal(t916.keyframes[0].xPercent, -34.179, 'truncated toward zero');
  assert.deepEqual(t916.keyframes[3].focus, { x: 0.5, y: 0.5 }, 'after the form the window holds the centre');
  assert.deepEqual(t916.keyframes[5].focus, { x: 0.1582, y: 0.5 }, 'after the link the window holds flush left');
  assert.equal(t169.zoom_factor.max, 2);
  assert.equal(buildTrack('16:9', segs, { ...SOURCE_4K, duration: 16 }, { maxScale: 3 }).zoom_factor.max, 3);
  assert.equal(buildTrack('16:9', segs, { ...SOURCE_4K, duration: 16 }, { maxScale: 5 }).zoom_factor.max, 3, 'capped at max4k');
  assert.equal(buildTrack('16:9', segs, { width: 1920, height: 1080, duration: 16 }, { maxScale: 3 }).zoom_factor.max, 2, 'a 1080p source never exceeds 2× (3× only with 4K)');
  assert.equal(buildTrack('9:16', segs, { ...SOURCE_4K, duration: 16 }, { maxScale: 3 }).zoom_factor.max, 1.5, '--max-scale is a 16:9 ceiling');
});

test('every keyframe of both tracks — and every linear in-between of consecutive keyframes — keeps the visible window inside the source frame', () => {
  const p = plan(FLOW, { duration: 16 });
  for (const key of Object.keys(FORMATS)) {
    const tr = p.tracks[key];
    const visW = Math.min(1, tr.canvas.width / tr.wrapper.width); const visH = Math.min(1, tr.canvas.height / tr.wrapper.height);
    const inside = (k) => {
      const limX = k.scale / 2 - visW / 2;
      const limY = k.scale / 2 - visH / 2;
      return Math.abs(k.xPercent) / 100 <= limX + 1e-7 && Math.abs(k.yPercent) / 100 <= limY + 1e-7;
    };
    for (let i = 0; i < tr.keyframes.length; i += 1) {
      const k = tr.keyframes[i];
      assert.ok(inside(k), `${key} keyframe ${i} shows blank: ${JSON.stringify(k)}`);
      if (i > 0) {
        const a = tr.keyframes[i - 1];
        for (let u = 0.1; u < 1; u += 0.1) {
          const mid = { scale: a.scale + (k.scale - a.scale) * u, xPercent: a.xPercent + (k.xPercent - a.xPercent) * u, yPercent: a.yPercent + (k.yPercent - a.yPercent) * u };
          assert.ok(inside(mid), `${key} in-between ${i}@${u.toFixed(1)} shows blank`);
        }
      }
    }
  }
});

test('springConstants: the spring is nearly critically damped (ζ ≈ 0.93) with far under 8 % overshoot; springStep settles on its target and is continuous across phases', () => {
  const k = springConstants();
  assert.ok(Math.abs(k.zeta - 0.932) < 0.002, String(k.zeta));
  assert.ok(k.overshoot < AUTOZOOM_DEFAULTS.overshootMax);
  const s = springStep(0, 0, 1, 0.5, k);
  assert.ok(Math.abs(s.x - 1) < 0.01 && Math.abs(s.v) < 0.1, `settled within 0.5 s: ${JSON.stringify(s)}`);
  const half = springStep(0, 0, 1, 0.1, k);
  const rest = springStep(half.x, half.v, 1, 0.4, k);
  assert.ok(Math.abs(rest.x - s.x) < 1e-9 && Math.abs(rest.v - s.v) < 1e-9, 'closed form composes exactly');
  assert.deepEqual(springStep(0.3, 2, 1, 0, k), { x: 0.3, v: 2 });
  const crit = springStep(0, 0, 1, 1, { omega0: 10, zeta: 1 });
  assert.ok(crit.x > 0.99 && crit.x <= 1);
  const over = springStep(0, 0, 1, 2, { omega0: 10, zeta: 1.5 });
  assert.ok(over.x > 0.99 && over.x <= 1);
});

test('cursorWaypoints: clicks (with ripples), text-field focus and a key on a new target are waypoints; repeated positions collapse; a full-viewport target gives neither a waypoint nor a ripple', () => {
  const { waypoints, clicks } = cursorWaypoints(norm(FLOW));
  assert.deepEqual(waypoints.map((w) => [w.t, w.kind]), [[1.3, 'click'], [1.8, 'focus'], [3.8, 'click'], [8.8, 'click'], [13.8, 'click']]);
  assert.equal(clicks.length, 4, 'the body click is not a ripple');
  assert.deepEqual(waypoints[0], { t: 1.3, x: 0.875, y: 0.0926, kind: 'click', event: 0 });
  const k = cursorWaypoints(norm([ev(1, 'key', FIELD, 'input'), ev(1.2, 'key', FIELD, 'input'), ev(2, 'key', SAVE, 'button')]));
  assert.deepEqual(k.waypoints.map((w) => [w.t, w.kind]), [[1, 'key'], [2, 'key']]);
  assert.deepEqual(cursorWaypoints(norm([ev(1, 'scroll'), ev(2, 'navigation')])).waypoints, []);
});

test('springPath: starts at the centre and departs 0.5 s before the click, rests 0.15 s on the target after it, sits on the target at click time; starts on the first waypoint when it comes too early; samples = ⌊duration·fps⌋ + 1, monotonic, inside the frame', () => {
  const { waypoints } = cursorWaypoints(norm([ev(2, 'click', BUTTON), ev(2.4, 'click', LINK)]));
  const sp = springPath(waypoints, 5, { fps: 30 });
  assert.deepEqual(sp.start, { x: 0.5, y: 0.5 });
  assert.deepEqual(sp.phases.map((p) => p.t), [1.5, 2.15], 'lead 0.5 before the first click; the second departs after the 0.15 s dwell (2.4 - 0.5 < 2 + 0.15)');
  const at = (t) => sp.path.find(([tt]) => Math.abs(tt - t) < 1e-9);
  assert.deepEqual(at(1.5).slice(1), [0.5, 0.5]);
  const atClick = at(2);
  assert.ok(Math.abs(atClick[1] - 0.875) < 0.01 && Math.abs(atClick[2] - 0.0926) < 0.01, `on the button at the click: ${atClick}`);
  assert.equal(sp.path.length, 151);
  for (let i = 1; i < sp.path.length; i += 1) assert.ok(sp.path[i][0] > sp.path[i - 1][0]);
  assert.ok(sp.path.every(([, x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
  assert.equal(sp.path[sp.path.length - 1][0], 5);
  const early = springPath(cursorWaypoints(norm([ev(0.2, 'click', BUTTON)])).waypoints, 2);
  assert.deepEqual(early.start, { x: 0.875, y: 0.0926 });
  assert.deepEqual(early.phases, []);
  assert.deepEqual(early.path[0].slice(1), [0.875, 0.0926]);
  assert.equal(springPath([], 1, { fps: 10 }).path.length, 11);
});

test('rebaseKeyframes: the full range is the identity; a clip inside a hold starts from the held pose; a tween straddling the start continues from its mid-ease state; a clip after everything is just the home set', () => {
  const p = plan(FLOW, { duration: 16 });
  const kf = p.tracks['16:9'].keyframes;
  assert.deepEqual(rebaseKeyframes(kf, 0, 16), kf);
  const hold = rebaseKeyframes(kf, 3.5, 2);
  assert.deepEqual(hold.map((k) => [k.t, k.role, k.scale]), [[0, 'home', 1.846], [1.5, 'zoom-out', 1]]);
  const mid = rebaseKeyframes(kf, 0.95, 3);
  assert.equal(mid[0].scale, 1.875);
  assert.equal(mid[0].xPercent, -43.75);
  assert.deepEqual([mid[1].t, mid[1].duration, mid[1].role, mid[1].clipped, mid[1].scale], [0, 0.35, 'zoom-in', true, 2]);
  const late = rebaseKeyframes(kf, 1.15, 2);
  assert.deepEqual([late[0].scale, late[0].xPercent], [2, mid[1].xPercent]);
  assert.ok(late.every((k) => k.set || k.duration >= 0.2), JSON.stringify(late));
  assert.equal(rebaseKeyframes(kf, 1.15, 2, { minTweenSec: 0 })[1].duration, 0.15);
  const after = rebaseKeyframes(kf, 15.9, 1);
  assert.deepEqual(after.map((k) => [k.t, k.role, k.scale]), [[0, 'home', 1]]);
  assert.deepEqual(rebasePath([[0, 0.1, 0.1], [1, 0.2, 0.2], [2, 0.3, 0.3], [3, 0.4, 0.4]], 1, 1), [[0, 0.2, 0.2], [1, 0.3, 0.3]]);
});

test('sizeChecks: a 3840×2160 capture carries the 1080p master 2× over and the 9:16 cut 1.125× over; a 1920×1080 capture fails the 9:16 base crop (capture_size_below_output) while the master still passes; peak upscale is reported', () => {
  const segs = planSegments(clusterEvents(norm(FLOW, 16)), 16);
  const ok = sizeChecks(buildTrack('9:16', segs, { ...SOURCE_4K, duration: 16 }), SOURCE_4K);
  assert.deepEqual(ok.capture_size_below_output, { ok: true, ratio: 1.125, source_window_px: { width: 1215, height: 2160 }, output_px: { width: 1080, height: 1920 } });
  assert.deepEqual(ok.zoom_peak_upscale, { peak_scale: 1.5, ratio: 0.75, ok: false });
  const hd = { width: 1920, height: 1080 };
  const bad = sizeChecks(buildTrack('9:16', segs, { ...hd, duration: 16 }), hd);
  assert.equal(bad.capture_size_below_output.ok, false); assert.ok(Math.abs(bad.capture_size_below_output.ratio - 0.5625) < 0.001);
  const master = sizeChecks(buildTrack('16:9', segs, { ...hd, duration: 16 }), hd);
  assert.equal(master.capture_size_below_output.ok, true); assert.equal(master.capture_size_below_output.ratio, 1);
  assert.equal(sizeChecks(buildTrack('16:9', segs, { ...SOURCE_4K, duration: 16 }), SOURCE_4K).zoom_peak_upscale.ok, true, '2× on a 4K source is lossless at 1080p');
});

test('buildAutozoom: schema, both tracks always present, primary keyframes alias the chosen track, segments carry per-format scale/focus, stats, warnings for dropped events and the 9:16 peak', () => {
  const p = plan(FLOW, { duration: 16, format: '9:16' });
  assert.equal(p.schema, SCHEMA);
  assert.deepEqual(Object.keys(p.tracks), ['16:9', '9:16']);
  assert.equal(p.format, '9:16');
  assert.deepEqual(p.keyframes, p.tracks['9:16'].keyframes);
  assert.deepEqual(p.stats, { events: 11, clusters: 3, zooms: 2, reaims: 1, skipped: 0, waypoints: 5, clicks: 4 });
  assert.deepEqual(p.skipped_clusters, []);
  assert.equal(p.segments[0].poses[1].cluster.closed_by, 'scroll');
  assert.deepEqual(p.segments[0].poses[1].scale, { '16:9': 1.846, '9:16': 1.5 });
  assert.deepEqual(p.segments[0].poses[1].focus['16:9'], { x: 0.5, y: 0.4464 });
  assert.equal(p.segments[0].poses[0].hold_until, 2.3, 'the first pose holds until the re-aim starts');
  assert.equal(p.segments[0].poses[1].hold_until, 5);
  assert.equal(p.inputs.events.dropped, 1);
  assert.ok(p.warnings.some((w) => /1 event\(s\) outside/.test(w)));
  assert.ok(p.warnings.some((w) => /zoom_peak_upscale \(9:16\)/.test(w)));
  assert.equal(p.checks.video_without_events, false);
  assert.equal(p.checks.capture_size_below_output['9:16'].ok, true);
  assert.deepEqual(p.clip, { start: 0, duration: 16 });
  assert.equal(p.params.defaults, AUTOZOOM_DEFAULTS);
});

test('buildAutozoom: no events → video_without_events, no cursor, only the home set; rect-less events → no_pointer_events; --clip rebases keyframes and the cursor while segments stay in footage time', () => {
  const empty = plan([], { duration: 5 });
  assert.equal(empty.checks.video_without_events, true);
  assert.equal(empty.cursor, null);
  assert.deepEqual(empty.segments, []);
  assert.deepEqual(empty.tracks['16:9'].keyframes.map((k) => k.role), ['home']);
  assert.deepEqual(empty.tracks['9:16'].keyframes[0].focus, { x: 0.5, y: 0.5 });
  assert.ok(empty.warnings.some((w) => /video_without_events/.test(w)));
  const norect = plan([ev(1, 'navigation'), ev(2, 'scroll')], { duration: 5 });
  assert.equal(norect.checks.no_pointer_events, true);
  assert.ok(norect.warnings.some((w) => /no_pointer_events/.test(w)));
  const clipped = plan(FLOW, { duration: 16, clipStart: 3, clipDuration: 3 });
  assert.deepEqual(clipped.clip, { start: 3, duration: 3 });
  assert.deepEqual(clipped.keyframes.map((k) => [k.t, k.role]), [[0, 'home'], [2, 'zoom-out']]);
  assert.equal(clipped.segments[0].t_out_start, 5, 'segments keep footage time');
  assert.equal(clipped.cursor.path.length, 91);
  assert.deepEqual(clipped.cursor.clicks, [{ t: 0.8, x: 0.5573, y: 0.5019 }]);
  assert.deepEqual(clipped.cursor.waypoints.map((w) => w.t), [0.8]);
  const late = plan(FLOW, { duration: 16, clipStart: 20 });
  assert.ok(late.warnings.some((w) => /after the footage ends/.test(w)));
});

test('the same inputs give the same JSON string, twice, with no clock, no machine path and no absolute path in it', () => {
  const a = JSON.stringify(plan(FLOW, { duration: 16, inputs: { events_file: 'events.jsonl' } }));
  const b = JSON.stringify(plan(FLOW, { duration: 16, inputs: { events_file: 'events.jsonl' } }));
  assert.equal(a, b);
  assert.doesNotMatch(a, /created_at|"\/home\/|"\/tmp\/|\/Users\//);
});

test('gsapSnippet: a set at 0, one to() per tween with duration + ease, cursor set + linear keyframes in wrapper px, one ripple per click', () => {
  const p = plan(FLOW, { duration: 16 });
  const s = gsapSnippet(p, '16:9');
  assert.match(s, /^tl\.set\("#autozoom", \{ scale: 1, xPercent: 0, yPercent: 0 \}, 0\);/m);
  assert.match(s, /tl\.to\("#autozoom", \{ scale: 2, xPercent: -50, yPercent: 50, duration: 0\.7, ease: "power3\.out" \}, 0\.6\);$/m);
  assert.match(s, /ease: "power2\.inOut" \}, 2\.3\);$/m);
  assert.match(s, /ease: "power2\.out" \}, 5\);$/m);
  assert.doesNotMatch(s, /\/\//, 'the generated code carries no comments');
  assert.match(s, /tl\.set\("#autozoom-cursor", \{ x: 960, y: 540 \}, 0\);/);
  assert.match(s, /tl\.to\("#autozoom-cursor", \{ keyframes: \[\{ x: 960, y: 540, duration: 0\.033 \}/);
  assert.match(s, /ease: "none" \}, 0\);/);
  assert.equal((s.match(/#autozoom-cursor-ripple/g) || []).length, 4);
  const v = gsapSnippet(p, '9:16', { wrapper: '#s3-zoom', cursor: '#s3-cur', timeline: 'scene' });
  assert.match(v, /^scene\.set\("#s3-zoom", \{ scale: 1, xPercent: -34\.179, yPercent: 0 \}, 0\);/m);
  assert.match(v, /scene\.set\("#s3-cur", \{ x: 1706\.667, y: 960 \}, 0\);/, 'cursor px use the 9:16 wrapper size');
});

test('previewHtml: one root with data-composition-id, timing on the <video> only (no timed ancestor), root-relative src, overflow marked, a paused timeline registered under the composition id', () => {
  const p = plan(FLOW, { duration: 16 });
  const html = previewHtml(p, '9:16', { footageSrc: 'capture/footage.mp4' });
  assert.match(html, /data-composition-id="autozoom-9x16" data-start="0" data-width="1080" data-height="1920" data-duration="16"/);
  assert.match(html, /<video id="footage" src="capture\/footage\.mp4" muted playsinline data-start="0" data-duration="16" data-media-start="0">/);
  assert.equal((html.match(/data-start=/g) || []).length, 2, 'root + video only');
  assert.doesNotMatch(html, /<section[^>]*data-start/);
  assert.match(html, /<div id="autozoom" data-layout-allow-overflow>/);
  assert.match(html, /left: -1166\.667px; top: 0px; width: 3413\.333px; height: 1920px; transform-origin: 50% 50%/);
  assert.match(html, /gsap\.timeline\(\{ paused: true \}\)/);
  assert.match(html, /window\.__timelines\["autozoom-9x16"\] = tl;/);
  assert.doesNotMatch(html, /Date\.now|performance\.now|Math\.random|setTimeout|requestAnimationFrame/);
});

test('probeFootage with an injected exec: missing binary → null, failure → throws, parsed dims + duration; captureFacts reads the manifest shape and tolerates a tier-B manifest', () => {
  assert.equal(probeFootage('x.mp4', { exec: () => ({ error: new Error('ENOENT') }) }), null);
  assert.throws(() => probeFootage('x.mp4', { exec: () => ({ status: 1, stderr: 'x.mp4: Invalid data found\nmore' }) }), /ffprobe failed on x\.mp4: x\.mp4: Invalid data found/);
  assert.throws(() => probeFootage('x.mp4', { exec: () => ({ status: 0, stdout: '{"streams":[],"format":{}}' }) }), /no video stream/);
  assert.deepEqual(probeFootage('x.mp4', { exec: () => ({ status: 0, stdout: '{"streams":[{"width":3840,"height":2160}],"format":{"duration":"16.0333"}}' }) }), { width: 3840, height: 2160, duration: 16.033, from: 'ffprobe' });
  assert.deepEqual(captureFacts(manifest()), { originMs: ORIGIN, durationSec: 16, viewport: VIEWPORT, size: SOURCE_4K, tier: 'A' });
  assert.deepEqual(captureFacts({ tier: 'B', capture: { backend: 'user-supplied-recording' }, timeline: null }), { originMs: null, durationSec: null, viewport: null, size: null, tier: 'B' });
  assert.deepEqual(captureFacts(null), { originMs: null, durationSec: null, viewport: null, size: null, tier: null });
});

test('CLI: --help exits 0 with usage; unknown flag, no --events and no capture facts exit 2; unreadable / invalid inputs exit 1; nothing is written on failure', () => {
  const dir = tmp();
  assert.equal(run(['--help']).status, 0);
  assert.match(run(['--help']).stdout, /Usage/);
  assert.equal(run(['--events', 'e.jsonl', '--wat']).status, 2);
  const noEvents = run([]);
  assert.equal(noEvents.status, 2); assert.match(noEvents.stderr, /--events/);
  assert.equal(run(['--events', path.join(dir, 'missing.jsonl')]).status, 1);
  fs.writeFileSync(path.join(dir, 'bad.jsonl'), '{"t":1,"type":"click"}\nnope\n');
  const bad = run(['--events', path.join(dir, 'bad.jsonl'), '--out', path.join(dir, 'out.json')]);
  assert.equal(bad.status, 1); assert.match(bad.stderr, /line 2/);
  fs.writeFileSync(path.join(dir, 'events.jsonl'), FLOW.map((e) => JSON.stringify(e)).join('\n'));
  const noFacts = run(['--events', path.join(dir, 'events.jsonl'), '--out', path.join(dir, 'out.json')]);
  assert.equal(noFacts.status, 2); assert.match(noFacts.stderr, /no footage facts/);
  assert.ok(!fs.existsSync(path.join(dir, 'out.json')));
  assert.equal(run(['--events', path.join(dir, 'events.jsonl'), '--manifest', path.join(dir, 'nope.json')]).status, 1);
  fs.writeFileSync(path.join(dir, 'capture-manifest.json'), '{oops');
  assert.equal(run(['--events', path.join(dir, 'events.jsonl')]).status, 1);
});

test('CLI: with the sibling manifest it writes autozoom.json (--print echoes it, --out - prints only), --emit-html writes the composition, warnings and the summary go to stderr, the JSON has no machine path', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'events.jsonl'), FLOW.map((e) => JSON.stringify(e)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'capture-manifest.json'), JSON.stringify(manifest()));
  const r = run(['--events', 'events.jsonl', '--out', 'autozoom.json', '--emit-html', 'index.html', '--print'], { cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const plan1 = JSON.parse(fs.readFileSync(path.join(dir, 'autozoom.json'), 'utf8'));
  assert.deepEqual(JSON.parse(r.stdout), plan1);
  assert.equal(plan1.inputs.source.from, 'manifest');
  assert.deepEqual(plan1.inputs.source, { width: 3840, height: 2160, duration_sec: 16, from: 'manifest' });
  assert.equal(plan1.inputs.events_file, 'events.jsonl'); assert.equal(plan1.inputs.manifest_file, 'capture-manifest.json'); assert.equal(plan1.inputs.footage_file, null);
  assert.equal(plan1.inputs.tier, 'A');
  assert.match(plan1.inputs.events_sha256, /^[0-9a-f]{64}$/);
  assert.equal(plan1.stats.zooms, 2);
  assert.match(r.stderr, /warning: 1 event\(s\) outside/);
  assert.match(r.stderr, /autozoom: 2 zoom\(s\), 1 re-aim\(s\) from 3 cluster\(s\) \/ 11 event\(s\); cursor 5 waypoint\(s\), 4 click\(s\); 16:9 peak 2×/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'autozoom.json'), 'utf8'), new RegExp(dir.replace(/[/\\]/g, '[/\\\\]')));
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /src="footage\.mp4"/);
  const only = run(['--events', 'events.jsonl', '--out', '-', '--format', '9:16'], { cwd: dir });
  assert.equal(only.status, 0);
  assert.equal(JSON.parse(only.stdout).format, '9:16');
  run(['--events', 'events.jsonl', '--out', 'a.json'], { cwd: dir });
  run(['--events', 'events.jsonl', '--out', 'b.json'], { cwd: dir });
  assert.deepEqual(fs.readFileSync(path.join(dir, 'a.json')), fs.readFileSync(path.join(dir, 'b.json')));
});

test('CLI: a 1920×1080 capture exits 3 for --format 9:16 (capture_size_below_output) but 0 for 16:9 with the 9:16 failure as a warning; a missing viewport / timeline degrade with warnings, never silently', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'events.jsonl'), FLOW.map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(dir, 'capture-manifest.json'), JSON.stringify(manifest({ capture: { backend: 'playwright-cdp-screencast', viewport: { ...VIEWPORT, dpr: 1 }, screencast_size: { width: 1920, height: 1080 } } })));
  const v = run(['--events', 'events.jsonl', '--format', '9:16', '--out', 'v.json'], { cwd: dir });
  assert.equal(v.status, 3); assert.match(v.stderr, /capture_size_below_output \(9:16\)/);
  assert.ok(fs.existsSync(path.join(dir, 'v.json')), 'the plan is still written so the reason is inspectable');
  const h = run(['--events', 'events.jsonl', '--out', 'h.json'], { cwd: dir });
  assert.equal(h.status, 0); assert.match(h.stderr, /warning: capture_size_below_output \(9:16\)/);
  fs.writeFileSync(path.join(dir, 'capture-manifest.json'), JSON.stringify({ tier: 'A', capture: { screencast_size: SOURCE_4K }, timeline: { footage_end_ms: ORIGIN + 16_000 } }));
  const d = run(['--events', 'events.jsonl', '--out', 'd.json'], { cwd: dir });
  assert.equal(d.status, 2, 'no origin and no end without an origin → no duration → usage error');
  fs.writeFileSync(path.join(dir, 'capture-manifest.json'), JSON.stringify({ tier: 'A', capture: { screencast_size: SOURCE_4K }, timeline: { footage_start_ms: ORIGIN, footage_end_ms: ORIGIN + 16_000 } }));
  const nv = run(['--events', 'events.jsonl', '--out', 'nv.json'], { cwd: dir });
  assert.equal(nv.status, 0); assert.match(nv.stderr, /no capture\.viewport/);
});

test('CLI: --footage wins over the manifest for size and duration (skips without ffmpeg); a preview written away from the footage warns about the root-relative path', (t) => {
  if (!binAvailable('ffmpeg', ['-version']) || !binAvailable('ffprobe', ['-version'])) return t.skip('ffmpeg/ffprobe not on PATH');
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'capture'));
  const footage = path.join(dir, 'capture', 'footage.mp4');
  const gen = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=10:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', footage], { encoding: 'utf8' });
  assert.equal(gen.status, 0, gen.stderr);
  fs.writeFileSync(path.join(dir, 'capture', 'events.jsonl'), [ev(0.5, 'click', SAVE, 'button')].map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(dir, 'capture', 'capture-manifest.json'), JSON.stringify(manifest()));
  const r = run(['--events', 'capture/events.jsonl', '--footage', 'capture/footage.mp4', '--out', 'capture/autozoom.json', '--emit-html', 'capture/index.html'], { cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'capture', 'autozoom.json'), 'utf8'));
  assert.deepEqual(p.inputs.source, { width: 1920, height: 1080, duration_sec: 2, from: 'ffprobe' });
  assert.match(p.inputs.footage_sha256, /^[0-9a-f]{64}$/);
  assert.ok(p.warnings.some((w) => /footage is 1920×1080 but the manifest says 3840×2160/.test(w)));
  assert.equal(p.segments.length, 1);
  assert.equal(p.segments[0].ends_zoomed, true, '2 s of footage: no room for the zoom-out');
  assert.match(fs.readFileSync(path.join(dir, 'capture', 'index.html'), 'utf8'), /src="footage\.mp4"/);
  const away = run(['--events', 'capture/events.jsonl', '--footage', 'capture/footage.mp4', '--out', 'away.json', '--emit-html', 'preview/index.html'], { cwd: dir });
  assert.equal(away.status, 0);
  assert.match(away.stderr, /outside the preview's directory/);
});

const PAGE = `<!doctype html><html><head><style>body{margin:0;font:16px sans-serif}#top{position:absolute;left:1500px;top:60px;width:180px;height:44px}#name{position:absolute;left:700px;top:400px;width:520px;height:40px}#save{position:absolute;left:1000px;top:520px;width:140px;height:44px}</style></head>
<body><button id="top">New</button><input id="name" placeholder="Name"><button id="save">Save</button></body></html>`;

function serve(html) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) }));
  });
}
function runAsync(argv, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', argv, { cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}
async function captureToolchainMissing() {
  const { loadPlaywright } = await import('./record-flow.mjs');
  const pw = await loadPlaywright();
  if (!pw) return 'Playwright not installed';
  try { const b = await pw.chromium.launch({ headless: true }); await b.close(); } catch (err) { return `Chromium not launchable: ${String(err.message).split('\n')[0]}`; }
  if (!binAvailable('ffmpeg', ['-version'])) return 'ffmpeg not on PATH';
  return null;
}

test('integration: record-flow capture (three clicks, gate skipped) → autozoom: events map inside the footage, ≥ 1 zoom on the button clusters, cursor synthesized from the log, footage probed at 3840×2160', async (t) => {
  const missing = await captureToolchainMissing();
  if (missing) return t.skip(missing);
  const dir = tmp();
  const flow = path.join(dir, 'flow.json');
  fs.writeFileSync(flow, JSON.stringify([{ action: 'wait', ms: 500 }, { action: 'click', selector: '#top' }, { action: 'wait', ms: 400 }, { action: 'click', selector: '#name' }, { action: 'type', selector: '#name', text: 'Ada' }, { action: 'click', selector: '#save' }, { action: 'wait', ms: 1500 }]));
  const srv = await serve(PAGE);
  try {
    const out = path.join(dir, 'capture');
    const cap = await runAsync([path.join(here, 'record-flow.mjs'), '--url', srv.url, '--flow', flow, '--out', out, '--skip-ocr-gate']);
    assert.equal(cap.status, 0, cap.stderr);
    const r = run(['--events', path.join(out, 'events.jsonl'), '--footage', path.join(out, 'footage.mp4'), '--out', path.join(out, 'autozoom.json'), '--emit-html', path.join(out, 'index.html')]);
    assert.equal(r.status, 0, r.stderr);
    const p = JSON.parse(fs.readFileSync(path.join(out, 'autozoom.json'), 'utf8'));
    assert.equal(p.inputs.source.width, 3840); assert.equal(p.inputs.source.height, 2160);
    assert.equal(p.inputs.source.from, 'ffprobe');
    assert.ok(p.inputs.events.dropped <= 1, 'only the navigation stamped before the first frame may fall outside the timeline (origin)');
    assert.ok(p.inputs.events.in_timeline >= 3);
    const events = fs.readFileSync(path.join(out, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(events.filter((e) => e.type === 'click').length, 3);
    assert.equal(p.inputs.events.total - p.inputs.events.dropped, p.inputs.events.in_timeline);
    assert.ok(p.stats.zooms >= 1, `≥ 1 auto-zoom (GS-01 exit criterion), got ${JSON.stringify(p.stats)}`);
    assert.ok(p.cursor && p.cursor.clicks.length >= 3, 'cursor from events.jsonl with the three clicks');
    const first = p.tracks['16:9'].keyframes.find((k) => k.role === 'zoom-in');
    assert.ok(first.focus.x > 0.5 && first.focus.y < 0.5, `the first zoom aims at the top-right button, got ${JSON.stringify(first.focus)}`);
    assert.ok(first.t >= 0 && first.t + first.duration <= p.inputs.source.duration_sec);
    assert.equal(p.checks.capture_size_below_output['9:16'].ok, true, 'lint capture_size_below_output = 0 (roadmap GS-01)');
  } finally {
    await srv.close();
  }
});

function hyperframesAvailable() {
  const r = spawnSync('npx', ['--no-install', 'hyperframes', '--version'], { encoding: 'utf8', env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_SKIP_SKILLS: '1' } });
  return !r.error && r.status === 0 && /^0\.8\./.test(r.stdout.trim()) ? r.stdout.trim() : null;
}

test('integration: the emitted composition passes `hyperframes check` (lint + runtime + layout, non-empty samples) and `hyperframes keyframes` sees the wrapper ladder (skips without a cached hyperframes 0.8.x + ffmpeg)', (t) => {
  const version = hyperframesAvailable();
  if (!version) return t.skip('hyperframes 0.8.x not in the npx cache (npx --no-install hyperframes --version)');
  if (!binAvailable('ffmpeg', ['-version'])) return t.skip('ffmpeg not on PATH');
  const dir = tmp();
  const gen = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=3840x2160:rate=30:duration=6', '-c:v', 'libx264', '-crf', '30', '-pix_fmt', 'yuv420p', path.join(dir, 'footage.mp4')], { encoding: 'utf8' });
  assert.equal(gen.status, 0, gen.stderr);
  fs.writeFileSync(path.join(dir, 'events.jsonl'), [ev(1.3, 'click', BUTTON, 'button'), ev(1.8, 'focus', FIELD, 'input'), ev(3.8, 'click', SAVE, 'button')].map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(path.join(dir, 'capture-manifest.json'), JSON.stringify(manifest({ timeline: { footage_start_ms: ORIGIN, footage_end_ms: ORIGIN + 6_000 } })));
  const r = run(['--events', 'events.jsonl', '--footage', 'footage.mp4', '--out', 'autozoom.json', '--emit-html', 'index.html'], { cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_SKIP_SKILLS: '1' };
  const check = spawnSync('npx', ['--no-install', 'hyperframes', 'check', '.', '--json'], { cwd: dir, encoding: 'utf8', env, timeout: 240_000 });
  assert.equal(check.status, 0, `check failed (${version}): ${check.stderr}\n${check.stdout}`);
  const cj = JSON.parse(check.stdout.slice(check.stdout.indexOf('{')));
  assert.equal(cj.ok, true, JSON.stringify(cj.lint.findings.concat(cj.runtime.findings, cj.layout.findings), null, 1));
  assert.equal(cj.lint.ok, true); assert.equal(cj.runtime.ok, true); assert.equal(cj.layout.ok, true);
  assert.equal(cj.layout.warningCount, 0, 'the punch-in overflow is declared, not a finding');
  assert.ok(Array.isArray(cj.layout.samples) && cj.layout.samples.length > 0, 'check counts only with non-empty layout.samples');
  const kf = spawnSync('npx', ['--no-install', 'hyperframes', 'keyframes', '.', '--json'], { cwd: dir, encoding: 'utf8', env, timeout: 240_000 });
  assert.equal(kf.status, 0, kf.stderr);
  const text = kf.stdout;
  assert.match(text, /#autozoom/);
  assert.match(text, /scale 1\.\.2/);
  assert.match(text, /#autozoom-cursor/);
}, { timeout: 600_000 });

test('motionBlurPx() / gsapSnippet: a fast zoom blurs up to 4 px at 1080p and back to 0 within its tween; a slow drift or a short tween gets none', () => {
  const track = { canvas: { width: 1920, height: 1080 }, wrapper: { width: 1920, height: 1080 } };
  const home = { scale: 1, xPercent: 0, yPercent: 0 };
  assert.equal(motionBlurPx(home, { scale: 2, xPercent: -50, yPercent: 50, duration: 0.7 }, track), MOTION_BLUR_MAX_PX, 'a 1→2× punch-in is fast');
  assert.equal(motionBlurPx({ scale: 1.5, xPercent: 0, yPercent: 0 }, { scale: 1.6, xPercent: 0, yPercent: 0, duration: 2.7 }, track), 0, 'a hold drift is slow');
  assert.equal(motionBlurPx(home, { scale: 2, xPercent: 0, yPercent: 0, duration: 0.3 }, track), 0, 'a clipped short tween is left alone');
  const p = plan(FLOW, { duration: 16 });
  const s = gsapSnippet(p, '16:9');
  assert.match(s, /tl\.set\("#autozoom", \{ filter: "blur\(0px\)" \}, 0\);/);
  assert.match(s, /tl\.to\("#autozoom", \{ filter: "blur\(4px\)", duration: 0\.315, ease: "power1\.in" \}, 0\.6\);$/m);
  assert.match(s, /tl\.to\("#autozoom", \{ filter: "blur\(0px\)", duration: 0\.385, ease: "power2\.out" \}, 0\.915\);/);
  assert.ok(!/filter/.test(gsapSnippet(p, '16:9', { motionBlur: false })));
});
