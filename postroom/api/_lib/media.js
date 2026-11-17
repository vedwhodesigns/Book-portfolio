// Media library: uploads (browser → Blob directly), registration, URL import, deletion.
import { db, HttpError, fetchT, logEvent } from './core.js';
import { putFile, deleteFile, storageMode, fetchWhole } from './storage.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;

export function mediaRow(m) {
  return {
    id: m.id,
    url: m.url,
    poster_url: m.poster_url || (m.kind === 'image' ? m.url : null),
    kind: m.kind,
    content_type: m.content_type,
    size_bytes: m.size_bytes == null ? null : Number(m.size_bytes),
    width: m.width,
    height: m.height,
    duration_s: m.duration_s == null ? null : Number(m.duration_s),
    filename: m.filename,
    source: m.source,
    created_at: m.created_at,
    used_by: m.used_by ?? undefined,
  };
}

export async function listMedia({ limit = 60, before = null } = {}) {
  const rows = await db()`select m.*,
      (select count(*)::int from postroom.posts p where m.id = any(p.media_ids) and p.status not in ('cancelled')) as used_by
    from postroom.media m where m.deleted_at is null
    ${before ? db()`and m.created_at < ${before}` : db()``}
    order by m.created_at desc limit ${Math.min(Number(limit) || 60, 200)}`;
  return rows.map(mediaRow);
}

export async function loadMedia(ids) {
  if (!ids?.length) return [];
  const rows = await db()`select * from postroom.media where id = any(${ids}::uuid[]) and deleted_at is null`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => {
    const m = byId.get(id);
    if (!m) throw new HttpError(400, `Media ${id} isn't in the library (it may have been deleted).`);
    return mediaRow(m);
  });
}

/** Instagram's API only takes JPEG images, so everything else is converted on the way in. */
async function normaliseImage(buf, contentType, filename) {
  const sharp = (await import('sharp')).default;
  const img = sharp(buf, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  if (contentType === 'image/jpeg' && (!meta.orientation || meta.orientation === 1)) {
    return { buf: null, width: meta.width, height: meta.height, contentType };
  }
  const out = await img.jpeg({ quality: 92, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buf: out.data, width: out.info.width, height: out.info.height, contentType: 'image/jpeg', filename: filename.replace(/\.\w+$/, '') + '.jpg' };
}

export async function registerMedia(input) {
  const { url, pathname, content_type, size_bytes, width, height, duration_s, filename = 'upload', poster_url = null, source = 'upload' } = input;
  if (!url || !content_type) throw new HttpError(400, 'url and content_type are required.');
  if (!ALLOWED_TYPES.includes(content_type)) throw new HttpError(400, `Unsupported file type ${content_type}.`);
  const kind = content_type.startsWith('video/') ? 'video' : 'image';
  let row = { url, pathname: pathname || url, kind, content_type, size_bytes, width, height, duration_s, filename, poster_url, source };
  if (kind === 'image') {
    const buf = await fetchWhole(url);
    const n = await normaliseImage(buf, content_type, filename);
    row = { ...row, width: n.width, height: n.height, size_bytes: buf.length };
    if (n.buf) {
      const stored = await putFile(`media/${n.filename}`, n.buf, 'image/jpeg');
      await deleteFile(url);
      row = { ...row, url: stored.url, pathname: stored.pathname, content_type: 'image/jpeg', size_bytes: n.buf.length, filename: n.filename };
    }
  }
  const [m] = await db()`insert into postroom.media ${db()(row)} returning *`;
  return mediaRow(m);
}

/** Download a public URL into the library (used by the MCP tools and "import from link"). */
export async function importFromUrl({ url, filename = null }) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new HttpError(400, 'That is not a valid URL.');
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, 'Only http(s) links can be imported.');
  const res = await fetchT(u.href, { redirect: 'follow' }, 240000);
  if (!res.ok) throw new HttpError(400, `Couldn't download that link (HTTP ${res.status}).`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(type)) throw new HttpError(400, `That link is ${type || 'an unknown type'}, not an image or video file. Use a direct file link.`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > 500 * 1024 * 1024) throw new HttpError(400, 'Files over 500 MB must be uploaded in the app instead.');
  const buf = Buffer.from(await res.arrayBuffer());
  const name = filename || decodeURIComponent(u.pathname.split('/').pop() || 'import') || 'import';
  const stored = await putFile(`media/${name}`, buf, type);
  return registerMedia({ url: stored.url, pathname: stored.pathname, content_type: type, size_bytes: buf.length, filename: name, source: 'url' });
}

export async function deleteMedia(id) {
  const [m] = await db()`select * from postroom.media where id = ${id} and deleted_at is null`;
  if (!m) throw new HttpError(404, 'Media not found.');
  const [{ n }] = await db()`select count(*)::int as n from postroom.posts
    where ${id}::uuid = any(media_ids) and status in ('draft','scheduled','processing')`;
  if (n) throw new HttpError(409, `This file is used by ${n} upcoming post(s). Cancel them first.`);
  await db()`update postroom.media set deleted_at = now() where id = ${id}`;
  await deleteFile(m.url);
  if (m.poster_url) await deleteFile(m.poster_url);
  await logEvent({ message: `Deleted media ${m.filename || m.id}` });
  return { ok: true };
}

/** Save a preview image (and any missing size/length) for a library file — the browser makes these. */
export async function updateMediaMeta(id, { poster_url, width, height, duration_s } = {}) {
  const [m] = await db()`select * from postroom.media where id = ${id} and deleted_at is null`;
  if (!m) throw new HttpError(404, 'Media not found.');
  if (poster_url && !/^https:\/\/[\w.-]+\.blob\.vercel-storage\.com\//.test(poster_url) && !String(poster_url).startsWith('/')) throw new HttpError(400, 'Bad poster URL.');
  const [row] = await db()`update postroom.media set
      poster_url = coalesce(${poster_url || null}, poster_url),
      width = coalesce(width, ${width ? Number(width) : null}),
      height = coalesce(height, ${height ? Number(height) : null}),
      duration_s = coalesce(duration_s, ${duration_s ? Number(duration_s) : null})
    where id = ${id} returning *`;
  return mediaRow(row);
}

export const uploadConfig = () => ({ mode: storageMode(), allowed: ALLOWED_TYPES, max_bytes: MAX_UPLOAD_BYTES });
