import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function skillDocs(dir = path.join(repo, 'skills')) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...skillDocs(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

const docs = skillDocs().map((file) => ({ file, rel: path.relative(repo, file), text: fs.readFileSync(file, 'utf8') }));

test('skill docs exist', () => {
  assert.ok(docs.some((d) => d.rel === path.join('skills', 'present', 'SKILL.md')));
  assert.ok(docs.length > 10);
});

const KNOWN_LEAKS = new Set([]);

test('no golden-set answer key is named in a shipped skill doc (GS03-C1)', () => {
  const leak = /examples\/gs-\d|storyboard-skeleton|expected-brief|examples\/README\.md/;
  const hits = docs.filter((d) => !KNOWN_LEAKS.has(d.rel))
    .flatMap((d) => d.text.split('\n').map((l, i) => (leak.test(l) ? `${d.rel}:${i + 1}: ${l.trim().slice(0, 120)}` : null)).filter(Boolean));
  assert.deepEqual(hits, []);
});

test('every scripts/<file> a skill doc names exists in the plugin', () => {
  const missing = [];
  for (const d of docs) {
    for (const m of d.text.matchAll(/(\$\{CLAUDE_PLUGIN_ROOT\}\/|[`(\s]|^)scripts\/((?:lib\/)?[\w.-]+\.(?:mjs|py|sh))/gm)) {
      if (/media-use\s*$/.test(d.text.slice(Math.max(0, m.index - 12), m.index + m[1].length))) continue;
      if (/\.test\.mjs$|^test_/.test(m[2]) || !fs.existsSync(path.join(repo, 'scripts', m[2]))) missing.push(`${d.rel}: scripts/${m[2]}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('every relative markdown link in a skill doc resolves', () => {
  const broken = [];
  for (const d of docs) {
    for (const m of d.text.matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
      const target = m[1];
      if (/^[a-z]+:/i.test(target)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(d.file), target))) broken.push(`${d.rel} → ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});
