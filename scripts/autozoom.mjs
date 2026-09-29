import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PLUGIN_VERSION } from './lib/versions.mjs';

export const SCHEMA = 'power-presentation/autozoom@0.1';

export const AUTOZOOM_DEFAULTS = Object.freeze({
  zoomInSec: 0.7,
  holdSec: Object.freeze({ min: 1.0, max: 2.0 }),
  zoomOutSec: 0.8,
  ease: 'ease-out',
  overshootMax: 0.08,
  minGapSec: 3.0,
  zoomFactor: Object.freeze({ min: 1.5, max: 2.0, max4k: 3.0 }),
  deadZone: Object.freeze({ width: 0.5, height: 0.7 }),
  cursorSpring: Object.freeze({ tension: 470, mass: 3.0, friction: 70 }),
  neverZoom: Object.freeze(['scroll', 'video']),
});

export const AUTOZOOM_RESEARCH = Object.freeze({
  idleCloseSec: 1.5,
  holdAfterSec: 1.2,
  typingBurst: Object.freeze({ keys: 3, windowSec: 1.5 }),
  edgeSnap: 0.25,
  zoomFactor916: Object.freeze({ min: 1.3, max: 1.5 }),
  approachLeadSec: 0.5,
  dwellAfterEventSec: 0.15,
  cursorFps: 30,
  textFieldTags: Object.freeze(['input', 'textarea', 'select']),
});

export const EASES = Object.freeze({
  'zoom-in': Object.freeze({ gsap: 'power3.out', css: 'cubic-bezier(0.23,1,0.32,1)' }),
  reaim: Object.freeze({ gsap: 'power2.inOut', css: 'cubic-bezier(0.455,0.03,0.515,0.955)' }),
  'zoom-out': Object.freeze({ gsap: 'power2.out', css: 'cubic-bezier(0.25,0.46,0.45,0.94)' }),
});

export const EASE_FN = Object.freeze({
  'power3.out': (u) => 1 - (1 - u) ** 3,
  'power2.out': (u) => 1 - (1 - u) ** 2,
  'power2.inOut': (u) => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2),
});

export const FORMATS = Object.freeze({
  '16:9': Object.freeze({ canvas: Object.freeze({ width: 1920, height: 1080 }), zoomFactor: AUTOZOOM_DEFAULTS.zoomFactor }),
  '9:16': Object.freeze({ canvas: Object.freeze({ width: 1080, height: 1920 }), zoomFactor: AUTOZOOM_RESEARCH.zoomFactor916 }),
});

export const USAGE = `Usage: node scripts/autozoom.mjs --events <events.jsonl> [--manifest <capture-manifest.json>] [--footage <footage.mp4>]
                                 [--out autozoom.json] [--format 16:9|9:16] [--clip-start <s> --clip-duration <s>]
                                 [--max-scale <n>] [--cursor-fps <n>] [--emit-html <file>] [--print]
       node scripts/autozoom.mjs --help

Clusters events.jsonl into auto-zoom keyframes with the defaults for the inner wrapper of the
product clip, synthesizes the cursor with the spring, and derives the 9:16 crop window from the same
focus. Scroll and video are never zoomed. Output is deterministic.
Exit codes: 0 ok, 1 runtime, 2 usage, 3 the primary format's base crop would upscale the capture.`;

export function parseArgs(argv) {
  const opts = {
    events: null, manifest: null, footage: null, out: 'autozoom.json', format: '16:9',
    clipStart: 0, clipDuration: null, maxScale: null, cursorFps: AUTOZOOM_RESEARCH.cursorFps,
    emitHtml: null, print: false, help: false,
  };
  const num = (flag, v, { min = 0, integer = false } = {}) => {
    const n = Number(v);
    if (v === undefined || !Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) throw new Error(`${flag} needs a number ≥ ${min}${integer ? ' (integer)' : ''}, got ${v}`);
    return n;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--events') opts.events = argv[++i] ?? null;
    else if (a === '--manifest') opts.manifest = argv[++i] ?? null;
    else if (a === '--footage') opts.footage = argv[++i] ?? null;
    else if (a === '--out') opts.out = argv[++i] ?? opts.out;
    else if (a === '--format') opts.format = argv[++i] ?? opts.format;
    else if (a === '--clip-start') opts.clipStart = num(a, argv[++i]);
    else if (a === '--clip-duration') opts.clipDuration = num(a, argv[++i], { min: 0.001 });
    else if (a === '--max-scale') opts.maxScale = num(a, argv[++i], { min: 1 });
    else if (a === '--cursor-fps') opts.cursorFps = num(a, argv[++i], { min: 1, integer: true });
    else if (a === '--emit-html') opts.emitHtml = argv[++i] ?? null;
    else if (a === '--print') opts.print = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!Object.hasOwn(FORMATS, opts.format)) throw new Error(`--format must be 16:9 or 9:16 in MVP (1:1 is v1), got ${opts.format}`);
  return opts;
}

const r3 = (v) => Math.round(v * 1000) / 1000 + 0;
const r4 = (v) => Math.round(v * 10000) / 10000 + 0;
const t3 = (v) => Math.trunc(v * 1000) / 1000 + 0;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function validRect(rect) {
  if (!rect || typeof rect !== 'object') return null;
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  if (w < 0 || h < 0) return null;
  return { x, y, w, h };
}

export function parseEvents(text) {
  const out = [];
  text.split('\n').forEach((line, idx) => {
    const s = line.trim();
    if (!s) return;
    let e;
    try { e = JSON.parse(s); } catch { throw new Error(`events.jsonl line ${idx + 1}: invalid JSON`); }
    if (!e || typeof e !== 'object' || typeof e.t !== 'number' || !Number.isFinite(e.t) || typeof e.type !== 'string') {
      throw new Error(`events.jsonl line ${idx + 1}: needs a numeric "t" and a string "type"`);
    }
    out.push({ line: idx + 1, t: e.t, type: e.type, tag: typeof e.tag === 'string' ? e.tag.toLowerCase() : null, selector: typeof e.selector === 'string' ? e.selector : null, rect: validRect(e.rect) });
  });
  return out.sort((a, b) => a.t - b.t || a.line - b.line);
}

export function normalizeEvents(events, { originMs, viewport, durationSec }) {
  const kept = [];
  let dropped = 0;
  for (const e of events) {
    const t = (e.t - originMs) / 1000;
    if (t < 0 || t > durationSec) { dropped += 1; continue; }
    let rect = null;
    if (e.rect) {
      rect = {
        x: clamp(e.rect.x / viewport.width, 0, 1),
        y: clamp(e.rect.y / viewport.height, 0, 1),
        w: clamp(e.rect.w / viewport.width, 0, 1),
        h: clamp(e.rect.h / viewport.height, 0, 1),
      };
      rect.w = Math.min(rect.w, 1 - rect.x);
      rect.h = Math.min(rect.h, 1 - rect.y);
    }
    kept.push({ i: kept.length, line: e.line, t: r3(t), type: e.type, tag: e.tag, selector: e.selector, rect });
  }
  return { events: kept, dropped };
}

const unionBox = (a, b) => {
  const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export function fitScale(box, { deadZone = AUTOZOOM_DEFAULTS.deadZone } = {}) {
  const w = Math.max(box.w, 0.005);
  const h = Math.max(box.h, 0.005);
  return Math.min(deadZone.width / w, deadZone.height / h);
}

export function seedKind(e, startsBurst) {
  if (!e.rect) return null;
  if (e.type === 'click') return 'click';
  if (e.type === 'focus' && AUTOZOOM_RESEARCH.textFieldTags.includes(e.tag)) return 'focus';
  if (e.type === 'key' && startsBurst) return 'typing';
  return null;
}

export function typingBurstStarts(events, { keys, windowSec } = AUTOZOOM_RESEARCH.typingBurst) {
  const keyIdx = events.map((e, i) => (e.type === 'key' ? i : -1)).filter((i) => i >= 0);
  const starts = new Set();
  for (let a = 0; a < keyIdx.length; a += 1) {
    const t0 = events[keyIdx[a]].t;
    let n = 1;
    for (let b = a + 1; b < keyIdx.length && events[keyIdx[b]].t - t0 <= windowSec; b += 1) n += 1;
    if (n >= keys) starts.add(keyIdx[a]);
  }
  return starts;
}

export function clusterEvents(events, params = {}) {
  const d = { ...AUTOZOOM_DEFAULTS, ...params.defaults };
  const r = { ...AUTOZOOM_RESEARCH, ...params.research };
  const bursts = typingBurstStarts(events, r.typingBurst);
  const clusters = [];
  let open = null;
  const close = (by, at = null) => { if (open) { open.closed_by = by; open.closed_at = at; clusters.push(open); open = null; } };
  const fits = (box) => fitScale(box, { deadZone: d.deadZone }) >= d.zoomFactor.min;

  for (const e of events) {
    if (e.type === 'navigation' || e.type === 'scroll') { close(e.type, e.t); continue; }
    if (open && e.t - open.last > r.idleCloseSec) close('idle');
    const kind = seedKind(e, bursts.has(e.i));
    if (!e.rect) continue;
    if (open) {
      const union = unionBox(open.bbox, e.rect);
      if (fits(union)) {
        open.bbox = union; open.last = e.t; open.events.push(e.i);
        if (kind && !open.kinds.includes(kind)) open.kinds.push(kind);
        continue;
      }
      if (!kind) { open.last = e.t; open.events.push(e.i); continue; }
      close('seed');
    }
    if (kind && fits(e.rect)) open = { start: e.t, last: e.t, bbox: { ...e.rect }, kinds: [kind], events: [e.i] };
  }
  close('end');
  return clusters.map((c, n) => ({
    id: n + 1,
    start: c.start,
    last: c.last,
    kinds: c.kinds,
    events: c.events,
    bbox: { x: r4(c.bbox.x), y: r4(c.bbox.y), w: r4(c.bbox.w), h: r4(c.bbox.h) },
    fit_scale: r3(fitScale(c.bbox, { deadZone: d.deadZone })),
    closed_by: c.closed_by,
    closed_at: c.closed_at,
  }));
}

export function planSegments(clusters, durationSec, params = {}) {
  const d = { ...AUTOZOOM_DEFAULTS, ...params.defaults };
  const r = { ...AUTOZOOM_RESEARCH, ...params.research };
  const segments = [];
  const skipped = [];
  let floor = 0;
  const isBreak = (c) => c.closed_by === 'scroll' || c.closed_by === 'navigation';

  const finish = (seg) => {
    const lastPose = seg.poses[seg.poses.length - 1];
    const c = lastPose.cluster;
    const holdEnd = isBreak(c) ? Math.min(c.last + r.holdAfterSec, c.closed_at) : c.last + r.holdAfterSec;
    const outStart = Math.max(lastPose.t_arrive + d.holdSec.min, holdEnd);
    lastPose.hold_until = r3(Math.min(outStart, durationSec));
    if (outStart + d.zoomOutSec <= durationSec) {
      seg.t_out_start = r3(outStart);
      seg.t_out_end = r3(outStart + d.zoomOutSec);
      seg.ends_zoomed = false;
      floor = seg.t_out_end;
    } else {
      seg.t_out_start = null;
      seg.t_out_end = null;
      seg.ends_zoomed = true;
      floor = durationSec;
    }
    seg.t_end = seg.ends_zoomed ? r3(durationSec) : seg.t_out_end;
  };

  let openSeg = null;
  for (const c of clusters) {
    const lastSeg = segments[segments.length - 1] ?? null;
    const cadenceOk = !lastSeg || (c.start - d.zoomInSec) - lastSeg.t_in_start >= d.minGapSec;
    let afterBreak = false;
    if (openSeg) {
      const lastPose = openSeg.poses[openSeg.poses.length - 1];
      const gap = c.start - lastPose.cluster.last;
      const roomForOutIn = gap >= r.holdAfterSec + d.zoomOutSec + d.zoomInSec;
      if (isBreak(lastPose.cluster)) {
        finish(openSeg); openSeg = null; afterBreak = true;
      } else if (!(roomForOutIn && cadenceOk)) {
        const moveStart = Math.max(lastPose.t_arrive + d.holdSec.min, c.start - d.zoomInSec);
        if (moveStart + d.zoomInSec > c.last + d.holdSec.max) {
          skipped.push({ cluster: c.id, reason: 'camera-lag' });
        } else if (moveStart + d.zoomInSec <= durationSec) {
          lastPose.hold_until = r3(moveStart);
          openSeg.poses.push({ cluster: c, role: 'reaim', t_move_start: r3(moveStart), t_arrive: r3(moveStart + d.zoomInSec) });
        } else {
          lastPose.cluster = { ...lastPose.cluster, last: c.last, closed_by: c.closed_by, closed_at: c.closed_at, absorbed: [...(lastPose.cluster.absorbed ?? []), c.id] };
        }
        continue;
      } else { finish(openSeg); openSeg = null; }
    }
    if (!cadenceOk) { skipped.push({ cluster: c.id, reason: afterBreak ? 'cadence-after-break' : 'cadence' }); continue; }
    const inStart = Math.max(floor, c.start - d.zoomInSec);
    if (inStart + d.zoomInSec > durationSec) { skipped.push({ cluster: c.id, reason: 'footage-ends' }); continue; }
    if (inStart + d.zoomInSec > c.last + d.holdSec.max) { skipped.push({ cluster: c.id, reason: 'camera-lag' }); continue; }
    openSeg = {
      id: segments.length + 1,
      t_in_start: r3(inStart),
      poses: [{ cluster: c, role: 'zoom-in', t_move_start: r3(inStart), t_arrive: r3(inStart + d.zoomInSec) }],
    };
    segments.push(openSeg);
  }
  if (openSeg) finish(openSeg);
  segments.skipped = skipped;
  return segments;
}

export function wrapperGeometry(canvas, source) {
  const s = Math.max(canvas.width / source.width, canvas.height / source.height);
  const width = source.width * s;
  const height = source.height * s;
  return {
    width,
    height,
    left: (canvas.width - width) / 2,
    top: (canvas.height - height) / 2,
    visible: { width: Math.min(1, canvas.width / width), height: Math.min(1, canvas.height / height) },
  };
}
export const roundGeometry = (g) => ({ width: r3(g.width), height: r3(g.height), left: r3(g.left), top: r3(g.top), visible: { width: r4(g.visible.width), height: r4(g.visible.height) } });

export function clampFocus(focus, scale, geom, { edgeSnap = AUTOZOOM_RESEARCH.edgeSnap } = {}) {
  const hw = geom.visible.width / (2 * scale);
  const hh = geom.visible.height / (2 * scale);
  const snapAxis = (v, half) => {
    let f = v;
    if (f < edgeSnap) f = half; else if (f > 1 - edgeSnap) f = 1 - half;
    return clamp(f, half, 1 - half);
  };
  return { x: snapAxis(focus.x, hw), y: snapAxis(focus.y, hh) };
}

export function poseTransform(focus, scale) {
  return { scale: r3(scale), xPercent: t3(-(focus.x - 0.5) * scale * 100), yPercent: t3(-(focus.y - 0.5) * scale * 100) };
}
const shownFocus = (f) => ({ x: r4(f.x), y: r4(f.y) });

const boxCentre = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

export function buildTrack(formatKey, segments, source, { maxScale = null, research = AUTOZOOM_RESEARCH, defaults = AUTOZOOM_DEFAULTS } = {}) {
  const fmt = FORMATS[formatKey];
  const geom = wrapperGeometry(fmt.canvas, source);
  let ceiling = fmt.zoomFactor.max;
  if (formatKey === '16:9' && maxScale != null) {
    ceiling = source.height >= 2160 ? Math.min(maxScale, defaults.zoomFactor.max4k) : Math.min(maxScale, defaults.zoomFactor.max);
  }
  const floorScale = fmt.zoomFactor.min;

  const poses = [];
  for (const seg of segments) {
    for (const p of seg.poses) {
      const scale = r3(clamp(p.cluster.fit_scale, floorScale, ceiling));
      const focus = clampFocus(boxCentre(p.cluster.bbox), scale, geom, { edgeSnap: research.edgeSnap });
      poses.push({ segment: seg.id, cluster: p.cluster.id, role: p.role, t: p.t_move_start, duration: defaults.zoomInSec, t_arrive: p.t_arrive, scale, focus: shownFocus(focus), ...poseTransform(focus, scale), exactFocus: focus });
    }
  }

  const home = (focus) => {
    const f = clampFocus(focus ?? { x: 0.5, y: 0.5 }, 1, geom, { edgeSnap: research.edgeSnap });
    return { focus: shownFocus(f), ...poseTransform(f, 1) };
  };

  const keyframes = [];
  const first = poses[0];
  keyframes.push({ t: 0, set: true, role: 'home', ...home(first ? first.exactFocus : null) });
  let pi = 0;
  for (const seg of segments) {
    for (let k = 0; k < seg.poses.length; k += 1) {
      const pose = poses[pi];
      pi += 1;
      const role = k === 0 ? 'zoom-in' : 'reaim';
      keyframes.push({ t: pose.t, duration: pose.duration, role, segment: seg.id, pose: k + 1, ease: EASES[role].gsap, focus: pose.focus, scale: pose.scale, xPercent: pose.xPercent, yPercent: pose.yPercent });
    }
    if (!seg.ends_zoomed) {
      const last = poses[pi - 1];
      keyframes.push({ t: seg.t_out_start, duration: defaults.zoomOutSec, role: 'zoom-out', segment: seg.id, ease: EASES['zoom-out'].gsap, ...home(last.exactFocus) });
    }
  }

  const peak = poses.reduce((m, p) => Math.max(m, p.scale), 1);
  return {
    format: formatKey,
    canvas: { ...fmt.canvas },
    wrapper: roundGeometry(geom),
    zoom_factor: { min: floorScale, max: ceiling },
    peak_scale: r3(peak),
    poses: poses.map(({ exactFocus, ...p }) => p),
    keyframes,
  };
}

export function springConstants({ tension, mass, friction } = AUTOZOOM_DEFAULTS.cursorSpring) {
  const omega0 = Math.sqrt(tension / mass);
  const zeta = friction / (2 * Math.sqrt(tension * mass));
  const overshoot = zeta < 1 ? Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)) : 0;
  return { omega0, zeta, overshoot };
}

export function springStep(x0, v0, target, tau, { omega0, zeta }) {
  const A = x0 - target;
  if (tau <= 0) return { x: x0, v: v0 };
  if (zeta < 1) {
    const wd = omega0 * Math.sqrt(1 - zeta * zeta);
    const B = (v0 + zeta * omega0 * A) / wd;
    const decay = Math.exp(-zeta * omega0 * tau);
    const c = Math.cos(wd * tau); const s = Math.sin(wd * tau);
    return {
      x: target + decay * (A * c + B * s),
      v: decay * ((-zeta * omega0 * A + wd * B) * c + (-zeta * omega0 * B - wd * A) * s),
    };
  }
  if (zeta === 1) {
    const B = v0 + omega0 * A;
    const decay = Math.exp(-omega0 * tau);
    return { x: target + decay * (A + B * tau), v: decay * (B - omega0 * (A + B * tau)) };
  }
  const sq = omega0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega0 + sq; const r2 = -zeta * omega0 - sq;
  const c2 = (v0 - r1 * A) / (r2 - r1); const c1 = A - c2;
  return { x: target + c1 * Math.exp(r1 * tau) + c2 * Math.exp(r2 * tau), v: c1 * r1 * Math.exp(r1 * tau) + c2 * r2 * Math.exp(r2 * tau) };
}

export function cursorWaypoints(events, { textFieldTags = AUTOZOOM_RESEARCH.textFieldTags, deadZone = AUTOZOOM_DEFAULTS.deadZone } = {}) {
  const waypoints = [];
  const clicks = [];
  let lastCentre = null;
  const near = (a, b) => a && b && Math.abs(a.x - b.x) < 0.005 && Math.abs(a.y - b.y) < 0.005;
  for (const e of events) {
    if (!e.rect) continue;
    if (e.rect.w > deadZone.width && e.rect.h > deadZone.height) continue;
    const centre = { x: r4(e.rect.x + e.rect.w / 2), y: r4(e.rect.y + e.rect.h / 2) };
    let kind = null;
    if (e.type === 'click') { kind = 'click'; clicks.push({ t: e.t, x: centre.x, y: centre.y }); }
    else if (e.type === 'focus' && textFieldTags.includes(e.tag)) kind = 'focus';
    else if (e.type === 'key' && !near(centre, lastCentre)) kind = 'key';
    if (!kind) continue;
    if (kind !== 'click' && near(centre, lastCentre)) continue;
    waypoints.push({ t: e.t, x: centre.x, y: centre.y, kind, event: e.i });
    lastCentre = centre;
  }
  return { waypoints, clicks };
}

export function springPath(waypoints, durationSec, { fps = AUTOZOOM_RESEARCH.cursorFps, lead = AUTOZOOM_RESEARCH.approachLeadSec, dwell = AUTOZOOM_RESEARCH.dwellAfterEventSec, spring = AUTOZOOM_DEFAULTS.cursorSpring } = {}) {
  const k = springConstants(spring);
  const startsOnFirst = waypoints.length > 0 && waypoints[0].t < lead;
  const start = startsOnFirst ? { x: waypoints[0].x, y: waypoints[0].y } : { x: 0.5, y: 0.5 };
  const phases = [];
  let prevEvent = 0;
  waypoints.forEach((w, n) => {
    if (n === 0 && startsOnFirst) { prevEvent = w.t; return; }
    phases.push({ t: r3(Math.max(n === 0 ? 0 : prevEvent + dwell, w.t - lead)), target: { x: w.x, y: w.y } });
    prevEvent = w.t;
  });
  let state = { x: start.x, y: start.y, vx: 0, vy: 0, t: 0, target: { ...start } };
  const states = [];
  for (const ph of phases) {
    const sx = springStep(state.x, state.vx, state.target.x, ph.t - state.t, k);
    const sy = springStep(state.y, state.vy, state.target.y, ph.t - state.t, k);
    state = { x: sx.x, y: sy.x, vx: sx.v, vy: sy.v, t: ph.t, target: ph.target };
    states.push(state);
  }
  const at = (t) => {
    let s = { x: start.x, y: start.y, vx: 0, vy: 0, t: 0, target: { ...start } };
    for (const st of states) { if (st.t <= t) s = st; else break; }
    const sx = springStep(s.x, s.vx, s.target.x, t - s.t, k);
    const sy = springStep(s.y, s.vy, s.target.y, t - s.t, k);
    return { x: clamp(sx.x, 0, 1), y: clamp(sy.x, 0, 1) };
  };
  const path = [];
  const n = Math.max(1, Math.floor(durationSec * fps));
  for (let i = 0; i <= n; i += 1) {
    const t = r3(Math.min(i / fps, durationSec));
    const p = at(t);
    path.push([t, r4(p.x), r4(p.y)]);
    if (t >= durationSec) break;
  }
  return { start: { x: r4(start.x), y: r4(start.y) }, phases, path, constants: { omega0: r3(k.omega0), zeta: r3(k.zeta), overshoot: r4(k.overshoot) } };
}

export const MIN_CLIPPED_TWEEN_SEC = 0.2;

export function rebaseKeyframes(keyframes, start, duration, { minTweenSec = MIN_CLIPPED_TWEEN_SEC } = {}) {
  const end = start + duration;
  const pose = (k) => ({ focus: k.focus, scale: k.scale, xPercent: k.xPercent, yPercent: k.yPercent });
  let state = pose(keyframes[0]);
  const out = [];
  for (const kf of keyframes) {
    if (kf.set) { if (kf.t <= start) state = pose(kf); continue; }
    const t1 = kf.t + kf.duration;
    if (t1 <= start) { state = pose(kf); continue; }
    if (kf.t >= end) break;
    if (kf.t < start) {
      if (t1 - start < minTweenSec) { state = pose(kf); continue; }
      const u = (EASE_FN[kf.ease] ?? ((v) => v))((start - kf.t) / kf.duration);
      const mix = (a, b) => r3(a + (b - a) * u);
      state = {
        focus: { x: r4(state.focus.x + (kf.focus.x - state.focus.x) * u), y: r4(state.focus.y + (kf.focus.y - state.focus.y) * u) },
        scale: mix(state.scale, kf.scale), xPercent: mix(state.xPercent, kf.xPercent), yPercent: mix(state.yPercent, kf.yPercent),
      };
      out.push({ ...kf, t: 0, duration: r3(t1 - start), clipped: true });
    } else out.push({ ...kf, t: r3(kf.t - start) });
  }
  return [{ t: 0, set: true, role: 'home', ...state }, ...out];
}

export function rebasePath(path, start, duration) {
  const end = start + duration;
  return path.filter(([t]) => t >= start - 1e-9 && t <= end + 1e-9).map(([t, x, y]) => [r3(Math.max(0, t - start)), x, y]);
}

export function sizeChecks(track, source) {
  const g = track.wrapper;
  const srcPx = { width: source.width * g.visible.width, height: source.height * g.visible.height };
  const base = Math.min(srcPx.width / track.canvas.width, srcPx.height / track.canvas.height);
  return {
    capture_size_below_output: { ok: base >= 1 - 1e-9, ratio: r3(base), source_window_px: { width: Math.round(srcPx.width), height: Math.round(srcPx.height) }, output_px: { ...track.canvas } },
    zoom_peak_upscale: { peak_scale: track.peak_scale, ratio: r3(base / track.peak_scale), ok: base / track.peak_scale >= 1 - 1e-9 },
  };
}

export function buildAutozoom({ events, originMs, viewport, source, format = '16:9', clipStart = 0, clipDuration = null, maxScale = null, cursorFps = AUTOZOOM_RESEARCH.cursorFps, inputs = {} }) {
  const warnings = [];
  const durationSec = r3(source.duration);
  const norm = normalizeEvents(events, { originMs, viewport, durationSec });
  if (norm.dropped) warnings.push(`${norm.dropped} event(s) outside the footage timeline dropped`);
  const clusters = clusterEvents(norm.events);
  const segments = planSegments(clusters, durationSec);
  const tracks = {};
  const checks = { video_without_events: norm.events.length === 0, no_pointer_events: false, capture_size_below_output: {}, zoom_peak_upscale: {} };
  for (const key of Object.keys(FORMATS)) {
    const track = buildTrack(key, segments, source, { maxScale });
    const sc = sizeChecks(track, source);
    checks.capture_size_below_output[key] = sc.capture_size_below_output;
    checks.zoom_peak_upscale[key] = sc.zoom_peak_upscale;
    if (!sc.capture_size_below_output.ok) warnings.push(`capture_size_below_output (${key}): the base crop has ${sc.capture_size_below_output.source_window_px.width}×${sc.capture_size_below_output.source_window_px.height} source px for a ${track.canvas.width}×${track.canvas.height} output`);
    if (!sc.zoom_peak_upscale.ok) warnings.push(`zoom_peak_upscale (${key}): the ${track.peak_scale}× peak upscales the capture ${r3(1 / sc.zoom_peak_upscale.ratio)}× (3× only with 4K)`);
    tracks[key] = track;
  }
  if (checks.video_without_events) warnings.push('video_without_events: no events inside the footage timeline — no auto-zoom, no cursor (needs events.jsonl; tier B recordings and VHS terminal captures have none — a declared capture_drift still needs this home-pose sidecar, C3)');

  const { waypoints, clicks } = cursorWaypoints(norm.events);
  let cursor = null;
  if (waypoints.length) {
    const sp = springPath(waypoints, durationSec, { fps: cursorFps });
    cursor = { spring: { ...AUTOZOOM_DEFAULTS.cursorSpring, ...sp.constants, source: 'Cap "Mellow"' }, fps: cursorFps, approach_lead_sec: AUTOZOOM_RESEARCH.approachLeadSec, start: sp.start, waypoints, clicks, path: sp.path, units: 'fractions of the source frame; place the cursor inside the zoom wrapper' };
  } else {
    checks.no_pointer_events = true;
    if (norm.events.length) warnings.push('no_pointer_events: events carry no target rects — cursor not synthesized');
  }

  const clip = { start: r3(clipStart), duration: r3(clipDuration ?? Math.max(0, durationSec - clipStart)) };
  if (clip.start >= durationSec) warnings.push(`clip starts at ${clip.start} s, after the footage ends (${durationSec} s)`);
  const clippedTracks = {};
  for (const [key, track] of Object.entries(tracks)) {
    clippedTracks[key] = { ...track, keyframes: rebaseKeyframes(track.keyframes, clip.start, clip.duration) };
  }
  const clippedCursor = cursor ? {
    ...cursor,
    waypoints: cursor.waypoints.filter((w) => w.t >= clip.start && w.t <= clip.start + clip.duration).map((w) => ({ ...w, t: r3(w.t - clip.start) })),
    clicks: cursor.clicks.filter((c) => c.t >= clip.start && c.t <= clip.start + clip.duration).map((c) => ({ ...c, t: r3(c.t - clip.start) })),
    path: rebasePath(cursor.path, clip.start, clip.duration),
  } : null;

  const segmentsOut = segments.map((s) => ({
    id: s.id,
    t_in_start: s.t_in_start,
    t_out_start: s.t_out_start,
    t_out_end: s.t_out_end,
    t_end: s.t_end,
    ends_zoomed: s.ends_zoomed,
    poses: s.poses.map((p, k) => ({
      pose: k + 1,
      role: p.role,
      t_move_start: p.t_move_start,
      t_arrive: p.t_arrive,
      hold_until: p.hold_until,
      cluster: { id: p.cluster.id, start: p.cluster.start, last: p.cluster.last, kinds: p.cluster.kinds, events: p.cluster.events, bbox: p.cluster.bbox, fit_scale: p.cluster.fit_scale, closed_by: p.cluster.closed_by, ...(p.cluster.absorbed ? { absorbed: p.cluster.absorbed } : {}) },
      scale: Object.fromEntries(Object.keys(FORMATS).map((key) => [key, tracks[key].poses.find((q) => q.segment === s.id && q.cluster === p.cluster.id).scale])),
      focus: Object.fromEntries(Object.keys(FORMATS).map((key) => [key, tracks[key].poses.find((q) => q.segment === s.id && q.cluster === p.cluster.id).focus])),
    })),
  }));

  return {
    schema: SCHEMA,
    plugin_version: PLUGIN_VERSION,
    format,
    inputs: { ...inputs, origin_ms: originMs, viewport: { width: viewport.width, height: viewport.height }, source: { width: source.width, height: source.height, duration_sec: durationSec, from: source.from ?? null }, events: { total: events.length, in_timeline: norm.events.length, dropped: norm.dropped } },
    params: { defaults: AUTOZOOM_DEFAULTS, research: AUTOZOOM_RESEARCH, eases: EASES },
    clip,
    clusters,
    segments: segmentsOut,
    skipped_clusters: segments.skipped,
    tracks: clippedTracks,
    keyframes: clippedTracks[format].keyframes,
    cursor: clippedCursor,
    checks,
    warnings,
    stats: { events: norm.events.length, clusters: clusters.length, zooms: segments.length, reaims: segments.reduce((n, s) => n + s.poses.length - 1, 0), skipped: segments.skipped.length, waypoints: waypoints.length, clicks: clicks.length },
  };
}

export const MOTION_BLUR_MAX_PX = 4;
export const MOTION_BLUR_PX_PER_SPEED = 600;
const MOTION_BLUR_MIN_S = 0.45;

export function motionBlurPx(prev, kf, track) {
  if (!prev || !(kf.duration >= MOTION_BLUR_MIN_S)) return 0;
  const { width: W, height: H } = track.canvas;
  const zoom = Math.abs(kf.scale - prev.scale) * Math.max(W, H) / 2;
  const pan = Math.hypot(Math.abs(kf.xPercent - prev.xPercent) / 100 * track.wrapper.width, Math.abs(kf.yPercent - prev.yPercent) / 100 * track.wrapper.height);
  const px = Math.min(MOTION_BLUR_MAX_PX * Math.min(W, H) / 1080, (zoom + pan) / kf.duration / MOTION_BLUR_PX_PER_SPEED);
  return px >= 0.5 ? r3(px) : 0;
}

export function gsapSnippet(plan, formatKey = plan.format, { wrapper = '#autozoom', cursor = '#autozoom-cursor', timeline = 'tl', offset = 0, size = null, motionBlur = true } = {}) {
  const track = plan.tracks[formatKey];
  const at = (t) => r3(t + offset);
  const lines = [];
  const w = JSON.stringify(wrapper);
  let prev = null;
  let blurred = false;
  for (const kf of track.keyframes) {
    const props = `scale: ${kf.scale}, xPercent: ${kf.xPercent}, yPercent: ${kf.yPercent}`;
    if (kf.set) lines.push(`${timeline}.set(${w}, { ${props} }, ${at(kf.t)});`);
    else {
      lines.push(`${timeline}.to(${w}, { ${props}, duration: ${kf.duration}, ease: ${JSON.stringify(kf.ease)} }, ${at(kf.t)});`);
      const blur = motionBlur ? motionBlurPx(prev, kf, track) : 0;
      if (blur) {
        if (!blurred) { lines.push(`${timeline}.set(${w}, { filter: "blur(0px)" }, ${at(track.keyframes[0].t)});`); blurred = true; }
        const rise = r3(kf.duration * 0.45);
        lines.push(`${timeline}.to(${w}, { filter: "blur(${blur}px)", duration: ${rise}, ease: "power1.in" }, ${at(kf.t)});`);
        lines.push(`${timeline}.to(${w}, { filter: "blur(0px)", duration: ${r3(kf.duration - rise)}, ease: "power2.out" }, ${at(kf.t + rise)});`);
      }
    }
    prev = { scale: kf.scale, xPercent: kf.xPercent, yPercent: kf.yPercent };
  }
  if (plan.cursor && plan.cursor.path.length) {
    const W = size?.width ?? track.wrapper.width; const H = size?.height ?? track.wrapper.height;
    const [t0, x0, y0] = plan.cursor.path[0];
    lines.push(`${timeline}.set(${JSON.stringify(cursor)}, { x: ${r3(x0 * W)}, y: ${r3(y0 * H)} }, ${at(t0)});`);
    const steps = [];
    for (let i = 1; i < plan.cursor.path.length; i += 1) {
      const [t, x, y] = plan.cursor.path[i];
      const [tp] = plan.cursor.path[i - 1];
      steps.push(`{ x: ${r3(x * W)}, y: ${r3(y * H)}, duration: ${r3(t - tp)} }`);
    }
    if (steps.length) lines.push(`${timeline}.to(${JSON.stringify(cursor)}, { keyframes: [${steps.join(', ')}], ease: "none" }, ${at(t0)});`);
    for (const c of plan.cursor.clicks) lines.push(`${timeline}.fromTo(${JSON.stringify(`${cursor}-ripple`)}, { x: ${r3(c.x * W)}, y: ${r3(c.y * H)}, scale: 0.2, autoAlpha: 0.6 }, { scale: 3, autoAlpha: 0, duration: 0.6, ease: "power2.out", immediateRender: false }, ${at(c.t)});`);
  }
  return lines.join('\n');
}

export function previewHtml(plan, formatKey = plan.format, { footageSrc = 'footage.mp4' } = {}) {
  const track = plan.tracks[formatKey];
  const { canvas, wrapper } = track;
  const compositionId = `autozoom-${formatKey.replace(':', 'x')}`;
  const cursorPx = Math.round(wrapper.height * 0.024);
  const snippet = gsapSnippet(plan, formatKey);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${canvas.width}, height=${canvas.height}" />
    <title>power-presentation auto-zoom preview (${formatKey})</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      body { margin: 0; background: #000; }
      #root { position: relative; width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; }
      .clip { position: absolute; inset: 0; }
      #autozoom-stage { position: absolute; inset: 0; overflow: hidden; }
      #autozoom { position: absolute; left: ${wrapper.left}px; top: ${wrapper.top}px; width: ${wrapper.width}px; height: ${wrapper.height}px; transform-origin: 50% 50%; will-change: transform; }
      #autozoom video { display: block; width: 100%; height: 100%; object-fit: fill; }
      #autozoom-cursor { position: absolute; left: 0; top: 0; width: ${cursorPx}px; height: ${Math.round(cursorPx * 1.5)}px; pointer-events: none; }
      #autozoom-cursor-ripple { position: absolute; left: 0; top: 0; width: ${cursorPx}px; height: ${cursorPx}px; margin: ${-cursorPx / 2}px 0 0 ${-cursorPx / 2}px; border-radius: 50%; border: ${Math.max(2, Math.round(cursorPx / 8))}px solid #fff; opacity: 0; pointer-events: none; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${compositionId}" data-start="0" data-width="${canvas.width}" data-height="${canvas.height}" data-duration="${plan.clip.duration}">
      <!-- the timing sits on the <video> (lint: media_missing_data_start); its ancestors stay untimed
           (lint: video_nested_in_timed_element) — keyframes target #autozoom, the non-timed inner wrapper -->
      <section id="product-ui" class="scene">
        <div id="autozoom-stage">
          <div id="autozoom" data-layout-allow-overflow>
            <video id="footage" src="${footageSrc}" muted playsinline data-start="0" data-duration="${plan.clip.duration}" data-media-start="${plan.clip.start}"></video>
            <div id="autozoom-cursor-ripple"></div>
            <svg id="autozoom-cursor" viewBox="0 0 16 24" aria-hidden="true"><path d="M1 1 L1 19 L5.5 14.5 L8.5 22 L11.5 20.5 L8.5 13 L15 13 Z" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/></svg>
          </div>
        </div>
      </section>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${snippet.split('\n').map((l) => `      ${l}`).join('\n')}
      window.__timelines = window.__timelines || {};
      window.__timelines[${JSON.stringify(compositionId)}] = tl;
    </script>
  </body>
</html>
`;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function probeFootage(file, { exec = spawnSync } = {}) {
  const r = exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.error) return null;
  if (r.status !== 0) throw new Error(`ffprobe failed on ${path.basename(file)}: ${String(r.stderr || '').trim().split('\n')[0]}`);
  let j;
  try { j = JSON.parse(r.stdout); } catch { throw new Error(`ffprobe returned invalid JSON for ${path.basename(file)}`); }
  const s = j.streams && j.streams[0];
  const duration = Number(j.format && j.format.duration);
  if (!s || !Number.isFinite(s.width) || !Number.isFinite(s.height) || !Number.isFinite(duration) || duration <= 0) throw new Error(`ffprobe found no video stream in ${path.basename(file)}`);
  return { width: s.width, height: s.height, duration: r3(duration), from: 'ffprobe' };
}

export function captureFacts(manifest) {
  const timeline = manifest && manifest.timeline;
  const originMs = timeline && Number.isFinite(timeline.footage_start_ms) ? timeline.footage_start_ms : null;
  const durationSec = timeline && Number.isFinite(timeline.footage_end_ms) && originMs != null ? r3((timeline.footage_end_ms - originMs) / 1000) : null;
  const cap = (manifest && manifest.capture) || {};
  const viewport = cap.viewport && Number.isFinite(cap.viewport.width) && Number.isFinite(cap.viewport.height) ? { width: cap.viewport.width, height: cap.viewport.height } : null;
  const size = cap.screencast_size && Number.isFinite(cap.screencast_size.width) && Number.isFinite(cap.screencast_size.height) ? { width: cap.screencast_size.width, height: cap.screencast_size.height } : null;
  return { originMs, durationSec, viewport, size, tier: manifest && manifest.tier ? manifest.tier : null };
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(String(err.message));
    console.error(USAGE);
    return 2;
  }
  if (opts.help) { console.log(USAGE); return 0; }
  if (!opts.events) { console.error('--events <events.jsonl> is required (needs the capture event log)'); console.error(USAGE); return 2; }

  let eventsText;
  try { eventsText = fs.readFileSync(opts.events, 'utf8'); } catch (err) { console.error(`cannot read --events ${opts.events}: ${err.message}`); return 1; }
  let events;
  try { events = parseEvents(eventsText); } catch (err) { console.error(String(err.message)); return 1; }

  const manifestPath = opts.manifest ?? path.join(path.dirname(opts.events), 'capture-manifest.json');
  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (err) { console.error(`cannot parse manifest ${manifestPath}: ${err.message}`); return 1; }
  } else if (opts.manifest) { console.error(`cannot read --manifest ${opts.manifest}`); return 1; }
  const facts = captureFacts(manifest);

  const warnings = [];
  let source = null;
  if (opts.footage) {
    try { source = probeFootage(opts.footage); } catch (err) { console.error(String(err.message)); return 1; }
    if (!source) warnings.push('ffprobe not on PATH — footage size and duration taken from the manifest');
    else if (facts.size && (facts.size.width !== source.width || facts.size.height !== source.height)) warnings.push(`footage is ${source.width}×${source.height} but the manifest says ${facts.size.width}×${facts.size.height} — using the footage`);
  }
  if (!source) {
    if (!facts.size || facts.durationSec == null) {
      console.error('no footage facts: pass --footage (ffprobe) or a manifest with capture.screencast_size and timeline');
      return 2;
    }
    source = { ...facts.size, duration: facts.durationSec, from: 'manifest' };
  }
  const viewport = facts.viewport ?? { width: 1920, height: 1080 };
  if (!facts.viewport) warnings.push('manifest has no capture.viewport — rects assumed in a 1920×1080 viewport (default)');
  let originMs = facts.originMs;
  if (originMs == null) {
    if (events.length) { originMs = events[0].t; warnings.push('manifest has no timeline.footage_start_ms — the first event is taken as the footage origin'); }
    else originMs = 0;
  }

  const plan = buildAutozoom({
    events, originMs, viewport, source, format: opts.format, clipStart: opts.clipStart, clipDuration: opts.clipDuration, maxScale: opts.maxScale, cursorFps: opts.cursorFps,
    inputs: { events_file: path.basename(opts.events), events_sha256: crypto.createHash('sha256').update(eventsText).digest('hex'), manifest_file: manifest ? path.basename(manifestPath) : null, footage_file: opts.footage ? path.basename(opts.footage) : null, footage_sha256: opts.footage && fs.existsSync(opts.footage) ? sha256File(opts.footage) : null, tier: facts.tier },
  });
  let footageSrc = 'footage.mp4';
  if (opts.emitHtml && opts.footage) {
    footageSrc = path.relative(path.dirname(path.resolve(opts.emitHtml)), path.resolve(opts.footage)).split(path.sep).join('/');
    if (footageSrc.startsWith('../') || path.isAbsolute(footageSrc)) warnings.push(`preview: ${path.basename(opts.footage)} lies outside the preview's directory — HyperFrames needs root-relative asset paths, write --emit-html next to the footage`);
  }
  plan.warnings = [...warnings, ...plan.warnings];

  const json = `${JSON.stringify(plan, null, 2)}\n`;
  if (opts.out !== '-') {
    try { fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true }); fs.writeFileSync(opts.out, json); } catch (err) { console.error(`cannot write ${opts.out}: ${err.message}`); return 1; }
  }
  if (opts.emitHtml) {
    try { fs.mkdirSync(path.dirname(path.resolve(opts.emitHtml)), { recursive: true }); fs.writeFileSync(opts.emitHtml, previewHtml(plan, opts.format, { footageSrc })); } catch (err) { console.error(`cannot write ${opts.emitHtml}: ${err.message}`); return 1; }
  }
  if (opts.print || opts.out === '-') process.stdout.write(json);

  for (const w of plan.warnings) console.error(`warning: ${w}`);
  const s = plan.stats;
  console.error(`autozoom: ${s.zooms} zoom(s), ${s.reaims} re-aim(s)${s.skipped ? `, ${s.skipped} skipped` : ''} from ${s.clusters} cluster(s) / ${s.events} event(s); cursor ${plan.cursor ? `${s.waypoints} waypoint(s), ${s.clicks} click(s)` : 'none'}; ${opts.format} peak ${plan.tracks[opts.format].peak_scale}×${opts.out !== '-' ? ` → ${opts.out}` : ''}`);
  if (!plan.checks.capture_size_below_output[opts.format].ok) {
    console.error(`capture_size_below_output (${opts.format}): the capture is too small for this output — re-record at DPR 2 or drop the format`);
    return 3;
  }
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code));
