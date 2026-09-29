import fs from 'node:fs';
import path from 'node:path';

export const EGRESS_FILE = ['.media', 'egress.jsonl'];
export const HF_TELEMETRY = Object.freeze({ host: 'us.i.posthog.com', optOut: ['HYPERFRAMES_NO_TELEMETRY', 'DO_NOT_TRACK'], values: ['1', 'true', 'yes', 'on'] });

const URL_RES = [
  /\b(?:src|href|poster|data-src|data-composition-src)\s*=\s*["'](https?:\/\/[^"'\s>]+)["']/gi,
  /url\(\s*["']?(https?:\/\/[^"')\s]+)["']?\s*\)/gi,
  /@import\s+["'](https?:\/\/[^"'\s]+)["']/gi,
];

export function externalUrls(text) {
  const scan = String(text ?? '').replace(/<!--[\s\S]*?-->/g, ' ');
  const out = [];
  for (const re of URL_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(scan))) if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export function hostOf(url) { try { return new URL(url).host; } catch { return null; } }

export function compositionRefs(project) {
  const files = [];
  if (fs.existsSync(path.join(project, 'index.html'))) files.push('index.html');
  const walk = (rel) => {
    let entries;
    try { entries = fs.readdirSync(path.join(project, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = path.posix.join(rel, e.name);
      if (e.isDirectory()) walk(r);
      else if (/\.(html?|css)$/i.test(e.name)) files.push(r);
    }
  };
  walk('compositions');
  const refs = [];
  for (const file of files.sort()) {
    for (const url of externalUrls(fs.readFileSync(path.join(project, file), 'utf8'))) {
      if (!refs.some((r) => r.url === url)) refs.push({ url, host: hostOf(url), file });
    }
  }
  return refs.filter((r) => r.host);
}

export function telemetryOff(env = {}) {
  return HF_TELEMETRY.optOut.some((k) => HF_TELEMETRY.values.includes(String(env[k] ?? '').trim().toLowerCase()));
}

export function cliStageEgress({ stage, env, refs, at }) {
  const lines = [];
  if (!telemetryOff(env)) lines.push({ at, host: HF_TELEMETRY.host, purpose: 'HyperFrames CLI telemetry (no env opt-out — a user config may still disable it)', by: `render-path ${stage}`, url: `https://${HF_TELEMETRY.host}` });
  for (const r of refs) lines.push({ at, host: r.host, purpose: `composition asset (${r.file}) fetched by hyperframes ${stage === 'render' ? 'render' : 'check'}`, by: `render-path ${stage}`, url: r.url });
  return lines;
}

export function appendEgress(project, lines) {
  if (!lines.length) return;
  const file = path.join(project, ...EGRESS_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

export function readEgress(project) {
  const file = path.join(project, ...EGRESS_FILE);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
