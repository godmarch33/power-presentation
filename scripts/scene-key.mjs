import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const KEY_FIELDS = Object.freeze([
  'frameHtml',
  'assets',
  'frameMd',
  'variables',
  'cliVersion',
  'fps',
  'quality',
  'resolution',
  'capturePath',
]);

const SEP = String.fromCharCode(0);
const KV = String.fromCharCode(1);

function canonical(value) {
  if (value === undefined || value === null) return 'null';
  if (Buffer.isBuffer(value)) return `buf:${value.toString('base64')}`;
  if (typeof value === 'string') return `str:${value}`;
  if (typeof value === 'number' || typeof value === 'boolean') return `${typeof value}:${String(value)}`;
  if (Array.isArray(value)) return `arr:[${value.map(canonical).join(SEP)}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `obj:{${keys.map((k) => `${k}${KV}${canonical(value[k])}`).join(SEP)}}`;
  }
  throw new TypeError(`sceneKey: unsupported value type ${typeof value}`);
}

function canonicalAssets(assets) {
  if (!Array.isArray(assets)) return canonical(assets);
  const withPath = assets.every((a) => a && typeof a === 'object' && !Buffer.isBuffer(a) && typeof a.path === 'string');
  const list = withPath ? [...assets].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) : assets;
  return canonical(list);
}

export function sceneKey(input) {
  if (!input || typeof input !== 'object') throw new TypeError('sceneKey: input object required');
  const missing = KEY_FIELDS.filter((f) => !(f in input));
  if (missing.length) throw new TypeError(`sceneKey: missing field(s) ${missing.join(', ')}`);
  const h = createHash('sha256');
  h.update('power-presentation/scene-key/v1');
  for (const field of KEY_FIELDS) {
    const body = field === 'assets' ? canonicalAssets(input[field]) : canonical(input[field]);
    const bytes = Buffer.from(body, 'utf8');
    h.update(`${SEP}${field}=${bytes.length}:`);
    h.update(bytes);
  }
  return h.digest('hex');
}

export const USAGE = `Usage: node scripts/scene-key.mjs --project <dir> --scene <NN>
       node scripts/scene-key.mjs --help

Prints the content-hash key for one scene: sha256(frame HTML | assets | frame.md |
variables | CLI version | fps/quality/resolution | capture path). Phase: v1.
Status: the key function is real (import { sceneKey }); the CLI collector is a STUB - exits 64.`;

export function parseArgs(argv) {
  const opts = { project: process.cwd(), scene: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--project') opts.project = path.resolve(argv[++i] ?? '.');
    else if (a === '--scene') opts.scene = argv[++i] ?? null;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(String(err.message));
    console.error(USAGE);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  console.error('NOT IMPLEMENTED: scene-key CLI (collect inputs from hosts/NN.html and the project), planned for v1');
  return 64;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(main(process.argv.slice(2)));
