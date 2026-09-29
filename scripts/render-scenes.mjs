import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const USAGE = `Usage: node scripts/render-scenes.mjs [--project <dir>] [--scenes NN,NN] [--fast|--final] [--fps <n>] [--quality <q>] [--resolution <WxH>]
       node scripts/render-scenes.mjs --help

Per-scene hosts (hosts/NN.html) + ffmpeg concat + content-hash cache. Phase: v1.
Status: STUB - exits 64 NOT IMPLEMENTED.`;

export function parseArgs(argv) {
  const opts = { project: process.cwd(), scenes: null, mode: 'fast', fps: null, quality: null, resolution: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--project') opts.project = path.resolve(argv[++i] ?? '.');
    else if (a === '--scenes') opts.scenes = String(argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--fast') opts.mode = 'fast';
    else if (a === '--final') opts.mode = 'final';
    else if (a === '--fps') opts.fps = Number(argv[++i]);
    else if (a === '--quality') opts.quality = argv[++i] ?? null;
    else if (a === '--resolution') opts.resolution = argv[++i] ?? null;
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
  console.error('NOT IMPLEMENTED: per-scene render + concat + cache (render-scenes), planned for v1; MVP uses a full `hyperframes render`');
  return 64;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(main(process.argv.slice(2)));
