const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

export function normalizeSidecar(raw) {
  const assertions = [];
  const unknown = [];
  if (!raw || typeof raw !== 'object') return { assertions, unknown };
  if (Array.isArray(raw.assertions)) {
    for (const a of raw.assertions) {
      if (!a || typeof a !== 'object') continue;
      if (a.kind === 'appearsBy' && a.selector) assertions.push({ kind: 'appearsBy', selector: a.selector, bySec: Number(a.bySec ?? 0.5) });
      else if (a.kind === 'before' && a.a && a.b) assertions.push({ kind: 'before', a: a.a, b: a.b });
      else if (a.kind === 'staysInFrame' && a.selector) assertions.push({ kind: 'staysInFrame', selector: a.selector });
      else if (a.kind === 'keepsMoving') assertions.push({ kind: 'keepsMoving', ...(a.withinSelector ? { withinSelector: a.withinSelector } : {}), ...(a.maxStaticSec !== undefined ? { maxStaticSec: Number(a.maxStaticSec) } : {}) });
      else unknown.push(a);
    }
  }
  for (const a of asList(raw.appearsBy)) if (a?.selector) assertions.push({ kind: 'appearsBy', selector: a.selector, bySec: Number(a.bySec ?? 0.5) });
  for (const b of asList(raw.before)) {
    if (b?.a && b?.b) assertions.push({ kind: 'before', a: b.a, b: b.b });
    else if (b?.selector && b?.before) assertions.push({ kind: 'before', a: b.selector, b: b.before });
    else if (b) unknown.push(b);
  }
  for (const s of asList(raw.staysInFrame)) { const sel = typeof s === 'string' ? s : s?.selector; if (sel) assertions.push({ kind: 'staysInFrame', selector: sel }); }
  for (const k of asList(raw.keepsMoving)) if (k && typeof k === 'object') assertions.push({ kind: 'keepsMoving', ...(k.withinSelector ?? k.selector ? { withinSelector: k.withinSelector ?? k.selector } : {}), ...(k.maxStaticSec !== undefined ? { maxStaticSec: Number(k.maxStaticSec) } : {}) });
  return { assertions, unknown };
}

const r3 = (n) => Math.round(n * 1000) / 1000;

export const SAMPLE_SLACK_S = 0.2;

export function buildHostSidecar(frames, { duration = null, slackS = SAMPLE_SLACK_S } = {}) {
  const assertions = [];
  const report = [];
  for (const f of frames) {
    if (!f.sidecar) { report.push({ id: f.id, kept: 0, dropped: 0, missing: true }); continue; }
    const { assertions: own, unknown } = normalizeSidecar(f.sidecar);
    let kept = 0;
    let dropped = unknown.length;
    for (const a of own) {
      if (a.kind === 'keepsMoving') { dropped += 1; continue; }
      if (a.kind === 'appearsBy') assertions.push({ kind: 'appearsBy', selector: a.selector, bySec: r3(f.start + a.bySec + slackS), frame: f.id });
      else assertions.push({ ...a, frame: f.id });
      kept += 1;
    }
    report.push({ id: f.id, kept, dropped, missing: false });
  }
  const json = { ...(duration !== null ? { duration } : {}), assertions, _source: 'power-presentation render-path verify — merged from compositions/frames/*.motion.json (appearsBy in host time; keepsMoving measured by QA-07 on the master)' };
  return { json, report };
}
