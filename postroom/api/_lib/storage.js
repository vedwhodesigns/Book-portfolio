// Media storage: Vercel Blob in production, local disk for `npm run dev`.
import fs from 'node:fs/promises';
import path from 'node:path';
import { env, APP_URL, fetchT, PlatformError, HttpError } from './core.js';

export const storageMode = () => (env('BLOB_READ_WRITE_TOKEN') ? 'blob' : env('STORAGE') === 'local' ? 'local' : 'none');
export const LOCAL_DIR = () => env('LOCAL_MEDIA_DIR', path.resolve('.data/media'));

export async function putFile(pathname, data, contentType) {
  const mode = storageMode();
  if (mode === 'blob') {
    const { put } = await import('@vercel/blob');
    const r = await put(pathname, data, { access: 'public', contentType, addRandomSuffix: true, multipart: true });
    return { url: r.url, pathname: r.pathname };
  }
  if (mode === 'local') {
    const safe = pathname.replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\.+/g, '.');
    const name = `${Date.now().toString(36)}-${safe.split('/').pop()}`;
    await fs.mkdir(LOCAL_DIR(), { recursive: true });
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(await new Response(data).arrayBuffer());
    await fs.writeFile(path.join(LOCAL_DIR(), name), buf);
    return { url: `${APP_URL()}/dev-media/${name}`, pathname: name };
  }
  throw new HttpError(500, 'Media storage is not configured. Connect a Vercel Blob store to this project.');
}

export async function deleteFile(url) {
  const mode = storageMode();
  try {
    if (mode === 'blob') {
      const { del } = await import('@vercel/blob');
      await del(url);
    } else if (mode === 'local') {
      await fs.rm(path.join(LOCAL_DIR(), path.basename(new URL(url).pathname)), { force: true });
    }
  } catch (e) {
    console.error('deleteFile failed', e.message);
  }
}

/** Read bytes [start, end] (inclusive) of a stored file. */
export async function fetchRange(url, start, end) {
  const res = await fetchT(url, { headers: { range: `bytes=${start}-${end}` } }, 120000);
  if (res.status === 206) return Buffer.from(await res.arrayBuffer());
  if (res.status === 200) {
    // Server ignored the Range header; slice locally (only sensible for small files).
    const all = Buffer.from(await res.arrayBuffer());
    return all.subarray(start, end + 1);
  }
  throw new PlatformError(`Couldn't read the media file (HTTP ${res.status}).`, { transient: res.status >= 500 });
}

export async function fetchWhole(url) {
  const res = await fetchT(url, {}, 120000);
  if (!res.ok) throw new PlatformError(`Couldn't read the media file (HTTP ${res.status}).`, { transient: res.status >= 500 });
  return Buffer.from(await res.arrayBuffer());
}
