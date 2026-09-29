import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, 'poster-bake.sh');

function available(cmd, args = ['--version']) {
  const p = spawnSync(cmd, args, { encoding: 'utf8' });
  return !p.error && p.status === 0;
}
const ready = available('bash') && available('python3') && available('ffmpeg', ['-version']) && available('ffprobe', ['-version']);

function bake(args, cwd) {
  return spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', cwd });
}

function ffmpeg(args, cwd) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', cwd });
  assert.equal(r.status, 0, `ffmpeg failed: ${r.stderr}`);
}

function buildMaster(dir, name = 'master.mp4') {
  const out = path.join(dir, name);
  ffmpeg([
    '-t', '0.5', '-f', 'lavfi', '-i', 'color=c=black:size=640x360:rate=30',
    '-t', '5.5', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
    '-t', '6', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out,
  ], dir);
  return out;
}

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  const d = JSON.parse(r.stdout);
  return { frames: Number(d.streams[0].nb_read_frames), width: d.streams[0].width, height: d.streams[0].height, duration: Number(d.format.duration) };
}

function frameLuma(file, index) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `select='eq(n,${index})',signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`, '-frames:v', '1', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = r.stdout.match(/YAVG=([\d.]+)/);
  return m ? Number(m[1]) : NaN;
}

function audioHash(file) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:a:0', '-c:a', 'copy', '-f', 'md5', '-'], { encoding: 'utf8' });
  return r.stdout.trim();
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-bake-'));
}

test('--at: frame 0 becomes the poster, frame 1 stays black, frames / duration / audio preserved; poster png + jpg written; --json', (t) => {
  if (!ready) return t.skip('bash, python3, ffmpeg or ffprobe not available');
  const dir = tmp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const master = buildMaster(dir);
  const before = probe(master);
  const audioBefore = audioHash(master);
  assert.ok(frameLuma(master, 0) < 20, 'fixture frame 0 is black');
  const r = bake(['--video', master, '--at', '3.0', '--json'], dir);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.at, 3);
  assert.equal(out.why, 'explicit --at');
  assert.equal(out.frames_before, before.frames);
  assert.equal(out.frames_after, before.frames);
  assert.ok(fs.existsSync(path.join(dir, 'master.poster.png')));
  assert.ok(fs.existsSync(path.join(dir, 'master.poster.jpg')));
  const after = probe(master);
  assert.equal(after.frames, before.frames);
  assert.ok(Math.abs(after.duration - before.duration) <= 0.05);
  assert.deepEqual([after.width, after.height], [640, 360]);
  assert.ok(frameLuma(master, 0) > 60, `frame 0 now carries the poster (YAVG ${frameLuma(master, 0)})`);
  assert.ok(frameLuma(master, 1) < 20, 'frame 1 is still the black open');
  assert.equal(audioHash(master), audioBefore, 'audio copied through (-c:a copy)');
  assert.ok(!fs.existsSync(path.join(dir, 'master.pre-poster.mp4')), 'no backup without --keep-original');
  const mode = fs.statSync(master).mode & 0o777;
  assert.ok(mode & 0o044, `output stays world-readable (mode ${mode.toString(8)})`);
});

test('--storyboard: the poster moment comes from wowprobe --poster-pick (`poster:` key first, else the hook settled point)', (t) => {
  if (!ready) return t.skip('bash, python3, ffmpeg or ffprobe not available');
  const dir = tmp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const master = buildMaster(dir);
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '## Frame 1 — Hook\n- duration: 3s\n- role: hook\n- text: "Hello" @ 0.2-3.0\n\n## Frame 2 — Product\n- duration: 3s\n- role: ui\n- poster: 1.5s\n');
  let r = bake(['--video', master, '--storyboard', 'STORYBOARD.md', '--out', 'baked.mp4', '--json'], dir);
  assert.equal(r.status, 0, r.stderr);
  let out = JSON.parse(r.stdout);
  assert.equal(out.at, 4.5, 'frame 2 starts at 3 s + poster 1.5 s');
  assert.match(out.why, /poster:/);
  assert.ok(fs.existsSync(path.join(dir, 'baked.mp4')));
  assert.ok(frameLuma(path.join(dir, 'baked.mp4'), 0) > 60);
  assert.ok(frameLuma(master, 0) < 20, 'the input is untouched when --out differs');
  fs.writeFileSync(path.join(dir, 'STORYBOARD.md'), '## Frame 1 — Hook\n- duration: 3s\n- role: hook\n- text: "Hello" @ 0.2-3.0\n- text: "World" @ 0.8-2.6\n');
  r = bake(['--video', master, '--storyboard', 'STORYBOARD.md', '--out', 'baked2.mp4', '--json'], dir);
  assert.equal(r.status, 0, r.stderr);
  out = JSON.parse(r.stdout);
  assert.equal(out.at, 1.2, 'latest text start 0.8 + 0.4 s settle');
  assert.match(out.why, /hook frame, settled point/);
});

test('--poster: an explicit image of another size is scaled to the master; --keep-original leaves a backup', (t) => {
  if (!ready) return t.skip('bash, python3, ffmpeg or ffprobe not available');
  const dir = tmp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const master = buildMaster(dir);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=white:size=1280x720', '-frames:v', '1', 'white.png'], dir);
  const r = bake(['--video', master, '--poster', 'white.png', '--keep-original', '--json'], dir);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.at, null);
  assert.equal(out.why, 'explicit --poster');
  assert.ok(frameLuma(master, 0) > 200, 'frame 0 is the white poster');
  assert.ok(frameLuma(master, 1) < 20);
  assert.ok(fs.existsSync(path.join(dir, 'master.pre-poster.mp4')));
  assert.ok(frameLuma(path.join(dir, 'master.pre-poster.mp4'), 0) < 20, 'the backup is the original');
  const png = probe(path.join(dir, 'master.poster.png'));
  assert.deepEqual([png.width, png.height], [640, 360], 'poster normalised to the video size');
});

test('no source: the edge-energy scan skips the black open and picks a frame with content', (t) => {
  if (!ready) return t.skip('bash, python3, ffmpeg or ffprobe not available');
  const dir = tmp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const master = buildMaster(dir);
  const r = bake(['--video', master, '--json'], dir);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.match(out.why, /edge-energy scan/);
  assert.ok(out.at >= 0.5, `picked ${out.at}s, after the black open`);
  assert.ok(frameLuma(master, 0) > 60);
});

test('usage and runtime errors', (t) => {
  if (!ready) return t.skip('bash, python3, ffmpeg or ffprobe not available');
  const dir = tmp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(bake([], dir).status, 2);
  assert.equal(bake(['--video', 'missing.mp4'], dir).status, 1);
  assert.equal(bake(['--video', 'x.mp4', '--at', 'soon'], dir).status, 2);
  assert.equal(bake(['--definitely-not-a-flag'], dir).status, 2);
  const h = bake(['--help'], dir);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /Usage/);
  const master = buildMaster(dir);
  const r = bake(['--video', master, '--poster', 'nope.png'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /poster image not found/);
});
