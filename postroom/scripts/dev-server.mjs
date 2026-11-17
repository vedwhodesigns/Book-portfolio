// Local server that mimics Vercel: static files from public/, /api/* → api/router.js.
// Usage: STORAGE=local DATABASE_URL=postgres://... APP_URL=http://localhost:3000 node scripts/dev-server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import handler from '../api/router.js';
import { LOCAL_DIR } from '../api/_lib/storage.js';

const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.map': 'application/json' };

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found'); }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    if (u.pathname !== '/api/media/local-upload' && /json/.test(req.headers['content-type'] || '')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      req.body = Buffer.concat(chunks).toString('utf8') || undefined;
    }
    req.query = { ...Object.fromEntries(u.searchParams), __p: u.pathname.replace(/^\/api\//, '') };
    return handler(req, res);
  }
  if (u.pathname.startsWith('/dev-media/')) return serveFile(req, res, path.join(LOCAL_DIR(), path.basename(u.pathname)));
  const f = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  serveFile(req, res, path.join('public', path.normalize(f).replace(/^(\.\.[/\\])+/, '')));
}).listen(PORT, () => console.log(`Postroom dev server on http://localhost:${PORT}`));
