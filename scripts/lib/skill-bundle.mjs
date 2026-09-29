import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TEXT_EXT = new Set([
  '.md', '.txt', '.mjs', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.svg', '.csv', '.yml', '.yaml',
]);

export const MEDIA_EXT = new Set([
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.mp4', '.mov', '.webm', '.mkv', '.gif',
  '.png', '.jpg', '.jpeg', '.webp', '.avif', '.woff', '.woff2', '.ttf', '.otf',
]);

export function listFilesSorted(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      if (name === '.DS_Store') continue;
      const p = path.join(d, name);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

export function hashSkillBundle(skillDir) {
  const files = listFilesSorted(skillDir);
  const h = createHash('sha256');
  for (const f of files) {
    const rel = path.relative(skillDir, f).split(path.sep).join('/');
    h.update(rel);
    h.update('\0');
    const ext = rel.slice(rel.lastIndexOf('.'));
    const buf = fs.readFileSync(f);
    if (TEXT_EXT.has(ext)) h.update(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    else h.update(buf);
    h.update('\0');
  }
  return { hash: h.digest('hex').slice(0, 16), files: files.length };
}

export function copyTree(src, dest) {
  let count = 0;
  for (const f of listFilesSorted(src)) {
    const rel = path.relative(src, f);
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(f, target);
    fs.chmodSync(target, fs.statSync(f).mode & 0o777);
    count += 1;
  }
  return count;
}

export function diffTrees(a, b) {
  const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');
  const filesA = new Map(listFilesSorted(a).map((f) => [rel(a, f), f]));
  const filesB = new Map(listFilesSorted(b).map((f) => [rel(b, f), f]));
  const only_a = [...filesA.keys()].filter((k) => !filesB.has(k));
  const only_b = [...filesB.keys()].filter((k) => !filesA.has(k));
  const changed = [];
  for (const [k, fa] of filesA) {
    const fb = filesB.get(k);
    if (fb && !fs.readFileSync(fa).equals(fs.readFileSync(fb))) changed.push(k);
  }
  return { same: only_a.length === 0 && only_b.length === 0 && changed.length === 0, only_a, only_b, changed };
}

export function findMedia(dir) {
  return listFilesSorted(dir)
    .filter((f) => MEDIA_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => path.relative(dir, f).split(path.sep).join('/'));
}
