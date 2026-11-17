// Upload local videos/images into the Postroom library (same path as the browser: Vercel Blob client upload).
// Usage: POSTROOM_URL=https://… POSTROOM_PASSWORD=… node scripts/push-media.mjs file1.mp4 [file2.jpg …]
// Prints one JSON line per file: { id, filename, kind, width, height, duration_s }.
import fs from 'node:fs';
import path from 'node:path';
import { upload } from '@vercel/blob/client';

const BASE = (process.env.POSTROOM_URL || 'https://vwd-postroom.vercel.app').replace(/\/$/, '');
const TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' };

async function login() {
  const r = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: process.env.POSTROOM_PASSWORD }) });
  if (!r.ok) throw new Error(`Login failed (${r.status})`);
  return r.headers.get('set-cookie').split(';')[0];
}

// ---- tiny MP4/MOV reader: duration (mvhd) and display size (tkhd of the video track) ----
function boxes(buf, start, end) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    let head = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(o + 8)); head = 16; }
    if (size === 0) size = end - o;
    if (size < head) break;
    out.push({ type, start: o + head, end: Math.min(o + size, end) });
    o += size;
  }
  return out;
}
function findMoov(file) {
  const fd = fs.openSync(file, 'r');
  const total = fs.fstatSync(fd).size;
  const h = Buffer.alloc(16);
  let o = 0;
  try {
    while (o + 8 <= total) {
      fs.readSync(fd, h, 0, 16, o);
      let size = h.readUInt32BE(0);
      const type = h.toString('latin1', 4, 8);
      if (size === 1) size = Number(h.readBigUInt64BE(8));
      if (size === 0) size = total - o;
      if (type === 'moov') {
        const b = Buffer.alloc(size);
        fs.readSync(fd, b, 0, size, o);
        return b;
      }
      if (size < 8) break;
      o += size;
    }
  } finally {
    fs.closeSync(fd);
  }
  return null;
}
function videoMeta(file) {
  const moov = findMoov(file);
  if (!moov) return {};
  const top = boxes(moov, 8, moov.length);
  const out = {};
  const mvhd = top.find((b) => b.type === 'mvhd');
  if (mvhd) {
    const v = moov[mvhd.start];
    const ts = v === 1 ? moov.readUInt32BE(mvhd.start + 20) : moov.readUInt32BE(mvhd.start + 12);
    const dur = v === 1 ? Number(moov.readBigUInt64BE(mvhd.start + 24)) : moov.readUInt32BE(mvhd.start + 16);
    if (ts && dur) out.duration_s = Math.round((dur / ts) * 100) / 100;
  }
  for (const trak of top.filter((b) => b.type === 'trak')) {
    const kids = boxes(moov, trak.start, trak.end);
    const mdia = kids.find((b) => b.type === 'mdia');
    const hdlr = mdia && boxes(moov, mdia.start, mdia.end).find((b) => b.type === 'hdlr');
    if (!hdlr || moov.toString('latin1', hdlr.start + 8, hdlr.start + 12) !== 'vide') continue;
    const tkhd = kids.find((b) => b.type === 'tkhd');
    if (!tkhd) continue;
    const v = moov[tkhd.start];
    const base = tkhd.start + (v === 1 ? 32 : 20) + 8 + 4 + 2 + 2 + 2 + 2; // to the matrix
    const a = moov.readInt32BE(base);
    const b = moov.readInt32BE(base + 4);
    const w = moov.readUInt32BE(base + 36) / 65536;
    const hgt = moov.readUInt32BE(base + 40) / 65536;
    const rotated = a === 0 && Math.abs(b) === 65536; // 90° / 270°
    out.width = Math.round(rotated ? hgt : w);
    out.height = Math.round(rotated ? w : hgt);
    break;
  }
  return out;
}

async function imageMeta(file) {
  try {
    const sharp = (await import('sharp')).default;
    const m = await sharp(file).metadata();
    const rotated = [5, 6, 7, 8].includes(m.orientation);
    return { width: rotated ? m.height : m.width, height: rotated ? m.width : m.height };
  } catch {
    return {};
  }
}

const cookie = await login();
for (const file of process.argv.slice(2)) {
  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext];
  if (!type) throw new Error(`${file}: unsupported type ${ext}`);
  const size = fs.statSync(file).size;
  const meta = type.startsWith('video/') ? videoMeta(file) : await imageMeta(file);
  const name = path.basename(file).replace(/[^\w.\-]+/g, '-');
  let last = 0;
  const r = await upload(`media/${name}`, fs.readFileSync(file), {
    access: 'public',
    handleUploadUrl: `${BASE}/api/media/upload`,
    headers: { cookie },
    contentType: type,
    multipart: size > 50 * 1024 * 1024,
    onUploadProgress: (e) => {
      if (e.percentage - last >= 20) { last = e.percentage; process.stderr.write(`${name}: ${Math.round(e.percentage)}%\n`); }
    },
  });
  const res = await fetch(`${BASE}/api/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ url: r.url, pathname: r.pathname, content_type: type, size_bytes: size, filename: path.basename(file), ...meta }),
  });
  const m = await res.json();
  if (!res.ok) throw new Error(`${file}: ${m.error || res.status}`);
  console.log(JSON.stringify({ id: m.id, filename: m.filename, kind: m.kind, width: m.width, height: m.height, duration_s: m.duration_s }));
}
