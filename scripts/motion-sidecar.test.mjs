import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHostSidecar, normalizeSidecar } from './lib/motion-sidecar.mjs';

test('normalizeSidecar(): the core shape and the loose shape both yield core assertions', () => {
  const core = { duration: 4.5, assertions: [
    { kind: 'appearsBy', selector: '#product-02-stage', bySec: 0.5 }, { kind: 'before', a: '#product-02-stage', b: '#product-02-chip-inner' },
    { kind: 'staysInFrame', selector: '#product-02-stage' }, { kind: 'keepsMoving', withinSelector: '#root', maxStaticSec: 2.0 }, { kind: 'bogus' }] };
  const n = normalizeSidecar(core);
  assert.deepEqual(n.assertions, [
    { kind: 'appearsBy', selector: '#product-02-stage', bySec: 0.5 }, { kind: 'before', a: '#product-02-stage', b: '#product-02-chip-inner' },
    { kind: 'staysInFrame', selector: '#product-02-stage' }, { kind: 'keepsMoving', withinSelector: '#root', maxStaticSec: 2 }]);
  assert.equal(n.unknown.length, 1);
  const loose = { frame: '05-reconcile', appearsBy: { selector: '#reconcile-autozoom-stage', bySec: 0.5 }, keepsMoving: { selector: '#root', maxStaticSec: 2.0 }, before: [{ selector: '#reconcile-autozoom-stage', before: '#reconcile-label-card' }] };
  assert.deepEqual(normalizeSidecar(loose).assertions, [
    { kind: 'appearsBy', selector: '#reconcile-autozoom-stage', bySec: 0.5 }, { kind: 'before', a: '#reconcile-autozoom-stage', b: '#reconcile-label-card' },
    { kind: 'keepsMoving', withinSelector: '#root', maxStaticSec: 2 }]);
  const loose2 = { appearsBy: [{ selector: '#pain-stage-outer', bySec: 0.5 }], keepsMoving: [{ maxStaticSec: 2.0 }], before: [{ a: '#pain-stage-outer', b: '#pain-label-card' }, { nonsense: true }], staysInFrame: ['#pain-stage-outer'] };
  const n2 = normalizeSidecar(loose2);
  assert.deepEqual(n2.assertions.map((a) => a.kind), ['appearsBy', 'before', 'staysInFrame', 'keepsMoving']);
  assert.equal(n2.unknown.length, 1);
  assert.deepEqual(normalizeSidecar(null), { assertions: [], unknown: [] });
});

test('buildHostSidecar(): appearsBy moves to host time (+ one 0.2 s sample step of slack), before / staysInFrame carry over, keepsMoving is dropped, missing sidecars reported', () => {
  const frames = [
    { id: '01-hook', start: 0, sidecar: { assertions: [{ kind: 'appearsBy', selector: '#_01-hook-word-name', bySec: 0.5 }, { kind: 'keepsMoving', maxStaticSec: 2 }] } },
    { id: '02-product', start: 3.573, sidecar: { appearsBy: { selector: '#product-02-stage', bySec: 0.5 }, before: [{ selector: '#product-02-stage', before: '#product-02-chip-inner' }], staysInFrame: '#product-02-stage', keepsMoving: { selector: '#root' } } },
    { id: '03-metric', start: 8.073, sidecar: null },
  ];
  const { json, report } = buildHostSidecar(frames, { duration: 59.944 });
  assert.equal(buildHostSidecar(frames, { slackS: 0 }).json.assertions[1].bySec, 4.073, 'slack is a parameter');
  assert.equal(json.duration, 59.944);
  assert.deepEqual(json.assertions, [
    { kind: 'appearsBy', selector: '#_01-hook-word-name', bySec: 0.7, frame: '01-hook' },
    { kind: 'appearsBy', selector: '#product-02-stage', bySec: 4.273, frame: '02-product' },
    { kind: 'before', a: '#product-02-stage', b: '#product-02-chip-inner', frame: '02-product' },
    { kind: 'staysInFrame', selector: '#product-02-stage', frame: '02-product' },
  ]);
  assert.deepEqual(report, [{ id: '01-hook', kept: 1, dropped: 1, missing: false }, { id: '02-product', kept: 3, dropped: 1, missing: false }, { id: '03-metric', kept: 0, dropped: 0, missing: true }]);
  assert.match(json._source, /keepsMoving measured by QA-07/);
});
