import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
};

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

export function serveStatic(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let urlPath;
    try { urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
    let file = path.resolve(root, `.${urlPath}`);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    if (isDir(file)) file = path.join(file, 'index.html');
    if (!isFile(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': STATIC_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/`, stop: () => new Promise((r) => server.close(() => r())) }));
  });
}
