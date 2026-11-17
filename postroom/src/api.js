// Thin client for /api plus helpers for uploads, time zones and formatting.
import { upload as blobUpload } from '@vercel/blob/client';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''))}` : '';
  const res = await fetch(`/api/${path}${qs}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'login') window.dispatchEvent(new Event('postroom:signedout'));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

// ---------- uploads ----------
function readMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { resolve({}); URL.revokeObjectURL(url); };
      img.src = url;
      return;
    }
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    let done = false;
    const finish = (extra = {}) => {
      if (done) return;
      done = true;
      resolve({ width: v.videoWidth || null, height: v.videoHeight || null, duration_s: Number.isFinite(v.duration) ? Math.round(v.duration * 100) / 100 : null, ...extra });
      URL.revokeObjectURL(url);
    };
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 2) / 3);
    };
    v.onseeked = () => {
      try {
        const w = Math.min(720, v.videoWidth);
        const h = Math.round((v.videoHeight / v.videoWidth) * w);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        c.toBlob((b) => finish({ poster: b }), 'image/jpeg', 0.82);
      } catch {
        finish();
      }
    };
    v.onerror = () => finish();
    setTimeout(() => finish(), 15000);
    v.src = url;
  });
}

export async function putToStorage(name, file, mode, onProgress) {
  if (mode === 'blob') {
    const r = await blobUpload(`media/${name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/media/upload',
      multipart: file.size > 50 * 1024 * 1024,
      contentType: file.type,
      onUploadProgress: (e) => onProgress?.(e.percentage / 100),
    });
    return { url: r.url, pathname: r.pathname };
  }
  if (mode === 'local') {
    const res = await fetch(`/api/media/local-upload?filename=${encodeURIComponent(name)}`, { method: 'POST', body: file });
    if (!res.ok) throw new ApiError('Upload failed', res.status);
    onProgress?.(1);
    return res.json();
  }
  throw new ApiError('Media storage is not set up yet — connect a Vercel Blob store (see SETUP.md).', 500);
}

export async function uploadFile(file, mode, onProgress) {
  const type = file.type || (file.name.endsWith('.mov') ? 'video/quicktime' : '');
  const meta = await readMeta(file);
  let poster_url = null;
  if (meta.poster) {
    const p = await putToStorage(`${file.name.replace(/\.\w+$/, '')}-poster.jpg`, new File([meta.poster], 'poster.jpg', { type: 'image/jpeg' }), mode);
    poster_url = p.url;
  }
  const stored = await putToStorage(file.name, file, mode, onProgress);
  return api('media', {
    method: 'POST',
    body: { ...stored, content_type: type, size_bytes: file.size, width: meta.width, height: meta.height, duration_s: meta.duration_s, filename: file.name, poster_url },
  });
}

// ---------- time (everything is shown in the app's time zone) ----------
let TZ = 'Asia/Kolkata';
export const setTz = (tz) => { TZ = tz || TZ; };
export const getTz = () => TZ;

export function partsInTz(date) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(date));
  const g = (t) => p.find((x) => x.type === t)?.value;
  return { y: +g('year'), m: +g('month'), d: +g('day'), hh: g('hour'), mm: g('minute'), wd: g('weekday') };
}
export const dayKey = (date) => { const p = partsInTz(date); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
export const wallTime = (date) => { const p = partsInTz(date); return `${dayKey(date)}T${p.hh}:${p.mm}`; };
export const fmtTime = (d) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(d));
export const fmtDate = (d, o = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...o }).format(new Date(d));
export const fmtDateTime = (d) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(d));
export function relTime(d) {
  const s = (new Date(d) - Date.now()) / 1000;
  const a = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (a < 60) return rtf.format(Math.round(s), 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
/** Calendar arithmetic on "YYYY-MM-DD" keys (timezone-free). */
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export const weekdayOf = (key) => new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = Sunday
export const todayKey = () => dayKey(new Date());

// ---------- numbers ----------
export const fmtNum = (n) => (n == null ? '—' : new Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n));
export const fmtBytes = (b) => (b == null ? '' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
export const fmtDur = (s) => (s == null ? '' : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `0:${String(Math.round(s)).padStart(2, '0')}`);
