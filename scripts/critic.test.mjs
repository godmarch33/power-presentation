import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { portraitInputs, AGENTS, DIMENSIONS, OWNERS, criticInputs, main, pngSize, tallyProject, tallyVotes, voteSheet } from './critic.mjs';

const panel = (scores) => {
  const out = {};
  for (const agent of AGENTS) out[agent] = { critic: agent, vote: 'ship', scores: DIMENSIONS.filter((d) => OWNERS[d] === agent && scores[d] !== undefined).map((d) => ({ dimension: d, score: scores[d], evidence: `00:0${d.slice(1)}.0`, fix: `fix ${d}` })) };
  return out;
};
const ALL = (n) => Object.fromEntries(DIMENSIONS.map((d) => [d, n]));

test('voteSheet(): each dimension from its owner only; pass needs all seven, mean ≥ 3.0 and min ≥ 2', () => {
  const s = voteSheet(panel(ALL(3)));
  assert.deepEqual(s.scores, ALL(3)); assert.equal(s.mean, 3); assert.equal(s.min, 3); assert.equal(s.pass, true);
  assert.equal(voteSheet(panel({ ...ALL(4), C4: 1 })).pass, false, 'a dimension below 2 fails the vote although the mean is 3.57');
  assert.equal(voteSheet(panel({ ...ALL(3), C6: 2, C7: 2 })).pass, false, 'mean 2.71 < 3.0');
  const partial = voteSheet(panel({ C1: 4, C3: 4 }));
  assert.equal(partial.pass, false); assert.deepEqual(partial.missing, ['C2', 'C4', 'C5', 'C6', 'C7']);
  const stray = panel(ALL(3));
  stray['critic-brand'].scores.push({ dimension: 'C1', score: 0 }, { dimension: 'C5', score: 7 });
  const st = voteSheet(stray);
  assert.equal(st.scores.C1, 3, 'a non-owner score is ignored'); assert.equal(st.ignored.length, 2);
  assert.equal(st.fixes[0].score, 3);
});

test('tallyVotes(): ship by majority of three; fewer votes never ship; fixes lowest first', () => {
  const pass = voteSheet(panel(ALL(3)));
  const fail = voteSheet(panel({ ...ALL(3), C1: 1 }));
  assert.equal(tallyVotes([pass, pass, fail]).ship, true);
  assert.equal(tallyVotes([pass, fail, fail]).ship, false);
  const two = tallyVotes([pass, pass]);
  assert.equal(two.ship, false); assert.match(two.reasons[0], /2 of 3 votes/);
  const t = tallyVotes([pass, fail, fail]);
  assert.deepEqual(t.dimensions.C1, [3, 1, 1]);
  assert.equal(t.fixes[0].dimension, 'C1'); assert.equal(t.fixes[0].score, 1);
  assert.equal(t.min, 1);
});

function png(width, height) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); return Buffer.concat([len, Buffer.from(type, 'latin1'), data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(1))), chunk('IEND', Buffer.alloc(0))]);
}

test('criticInputs() / prepare / tally on a project', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-critic-'));
  const w = (rel, data) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), data); };
  w('QA/contact-sheet.png', png(1920, 1800));
  for (let i = 0; i < 11; i += 1) w(`QA/frames/${String(i).padStart(2, '0')}.png`, png(960, 540));
  w('QA/frames/11.png', png(1920, 1080));
  w('STORYBOARD.md', '# x'); w('QA/wowprobe.json', '{}');
  assert.deepEqual(pngSize(path.join(dir, 'QA/contact-sheet.png')), { width: 1920, height: 1800 });
  const inp = criticInputs(dir);
  assert.deepEqual(inp.problems, ['QA/frames/11.png is 1920×1080, the critic needs 960×540', 'BRIEF.md missing']);
  assert.equal(main(['prepare', '--project', dir]), 3);
  w('QA/frames/11.png', png(960, 540)); w('BRIEF.md', '# b');
  assert.equal(main(['prepare', '--project', dir]), 0);
  assert.ok(fs.existsSync(path.join(dir, 'QA/critic/dispatch.json')));
  const votes = [panel(ALL(4)), panel({ ...ALL(3), C6: 2 }), panel({ ...ALL(3), C2: 1 })];
  votes.forEach((v, i) => { for (const [agent, out] of Object.entries(v)) w(`QA/critic/vote-${i + 1}/${agent}.json`, JSON.stringify(out)); });
  w('QA/critic/vote-3/garbage.json', '{not json');
  const t = tallyProject(dir);
  assert.equal(t.ship, false, 'vote 2 mean 2.86 fails, vote 3 min 1 fails → 1 of 3');
  assert.equal(t.passing_votes, 1);
  assert.deepEqual(t.sheets[2].unreadable, ['garbage.json']);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'QA/critic.json'), 'utf8'));
  assert.equal(onDisk.votes, 3); assert.deepEqual(onDisk.dimensions.C2, [4, 3, 1]);
  w('QA/critic/vote-2/critic-design.json', JSON.stringify(panel(ALL(3))['critic-design']));
  assert.equal(main(['tally', '--project', dir]), 0, 'vote 2 now passes → 2 of 3 → ship');
  assert.equal(main(['prepare', '--project', dir, '--votes', '1']), 0);
  fs.rmSync(path.join(dir, 'QA/critic/vote-2'), { recursive: true }); fs.rmSync(path.join(dir, 'QA/critic/vote-3'), { recursive: true });
  const one = tallyProject(dir);
  assert.deepEqual([one.ship, one.votes, one.passing_votes], [true, 1, 1]);
  assert.match(one.rule, /majority of 1/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('portraitInputs(): the 9:16 sheet, key frames and probe join the dispatch when deliver probed a 9:16 cut (GS-01)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-critic-916-'));
  try {
    assert.equal(portraitInputs(dir), null, 'a 16:9-only run has no portrait inputs');
    fs.mkdirSync(path.join(dir, 'QA', 'frames-9x16'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'QA', 'contact-sheet-9x16.png'), 'png');
    fs.writeFileSync(path.join(dir, 'QA', 'frames-9x16', '00-at-0.00s.png'), 'png');
    fs.writeFileSync(path.join(dir, 'QA', 'wowprobe-9x16.json'), '{}');
    assert.deepEqual(portraitInputs(dir), { format: '9:16', contact_sheet: 'QA/contact-sheet-9x16.png', frames: ['QA/frames-9x16/00-at-0.00s.png'], wowprobe: 'QA/wowprobe-9x16.json' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
