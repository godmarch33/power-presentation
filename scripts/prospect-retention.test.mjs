import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REMOVED, RETENTION_FILE, main, purge, purgeTerms, redact, retentionState, stamp } from './prospect-retention.mjs';

const PROSPECT = { name: 'Dana Okafor', company: 'Northbridge Retail Group', role: 'Head of Finance', site: 'https://northbridge-retail.example' };

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-retention-'));
  const w = (rel, data) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), data); };
  w('intake.json', JSON.stringify({ declared: { for: 'sales', prospect: 'prospect.json' } }));
  w('prospect.json', JSON.stringify(PROSPECT));
  w('BRIEF.md', '# Brief\nFor Dana Okafor, Head of Finance at Northbridge Retail Group (northbridge-retail.example).\n');
  w('compositions/frames/01-hook.html', '<div data-var-text="prospect">Dana Okafor</div>');
  w('renders/final/x_16x9.mp4', 'mp4');
  w('assets/voice/01.wav', 'wav');
  return { dir, w };
}

test('purgeTerms() / redact(): the fields and the bare host, longest first; every hit replaced', () => {
  const terms = purgeTerms(PROSPECT);
  assert.ok(terms.includes('Dana Okafor') && terms.includes('northbridge-retail.example') && terms.includes('https://northbridge-retail.example'));
  assert.equal(terms[0], 'https://northbridge-retail.example');
  const r = redact('Hi Dana Okafor — see https://northbridge-retail.example', terms);
  assert.equal(r.hits, 2);
  assert.equal(r.text, `Hi ${REMOVED} — see ${REMOVED}`);
  assert.deepEqual(purgeTerms({ name: 'Al' }), [], 'too short to be unambiguous');
});

test('stamp → status → purge: 30 days from the delivery; before that purge refuses; after it the record goes and the text is redacted, renders are listed', () => {
  const { dir } = project();
  try {
    const s = stamp(dir, { now: '2026-09-27T12:00:00.000Z' });
    assert.equal(s.created, true);
    assert.equal(s.record.delete_after, '2026-10-27T12:00:00.000Z');
    assert.deepEqual(s.record.fields, ['company', 'name', 'role', 'site']);
    assert.ok(!JSON.stringify(s.record).includes('Dana'), 'the retention record holds no personal data');
    assert.equal(stamp(dir, { now: '2026-10-01T00:00:00.000Z' }).created, false, 'a later deliver keeps the first deadline');
    assert.deepEqual(retentionState(s.record, '2026-10-20T12:00:00.000Z'), { expired: false, days_left: 7, purged: false });
    const early = purge(dir, { now: '2026-10-20T12:00:00.000Z' });
    assert.equal(early.ok, false); assert.match(early.reason, /not expired: 7 day/);
    const r = purge(dir, { now: '2026-10-28T00:00:00.000Z' });
    assert.equal(r.ok, true, r.reason);
    assert.deepEqual(r.deleted, ['prospect.json']);
    assert.ok(!fs.existsSync(path.join(dir, 'prospect.json')));
    for (const f of ['BRIEF.md', 'compositions/frames/01-hook.html', 'intake.json']) assert.ok(!/Dana|Northbridge|northbridge/.test(fs.readFileSync(path.join(dir, f), 'utf8')) || f === 'intake.json', f);
    assert.deepEqual(r.binaries.sort(), ['assets/voice/01.wav', 'renders/final/x_16x9.mp4']);
    assert.ok(fs.existsSync(path.join(dir, 'renders/final/x_16x9.mp4')), 'a render is never deleted');
    const rec = JSON.parse(fs.readFileSync(path.join(dir, ...RETENTION_FILE), 'utf8'));
    assert.ok(rec.purged_at);
    assert.match(purge(dir, { now: '2026-11-01T00:00:00.000Z' }).reason, /already purged/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a prospect record outside the project is not deleted (its path is named); no sales run → nothing stamped; CLI exits', () => {
  const { dir, w } = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'p.json'), JSON.stringify(PROSPECT));
    w('intake.json', JSON.stringify({ declared: { prospect: path.join(outside, 'p.json') } }));
    stamp(dir, { now: '2026-09-01T00:00:00.000Z' });
    const r = purge(dir, { now: '2026-10-05T00:00:00.000Z' });
    assert.deepEqual(r.deleted, []);
    assert.match(r.note, /outside the project/);
    assert.ok(fs.existsSync(path.join(outside, 'p.json')));
    assert.equal(main(['status', '--project', dir, '--now', '2026-10-05T00:00:00.000Z']), 0, 'purged → 0');
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-bare-'));
    assert.equal(stamp(bare).record, null);
    assert.equal(main(['purge', '--project', bare]), 3);
    assert.equal(main(['bogus']), 2);
    fs.rmSync(bare, { recursive: true, force: true });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});
