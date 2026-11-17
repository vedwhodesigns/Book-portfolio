// Make preview images for videos that arrived without one (e.g. uploaded from the command line).
// Runs quietly in the background once per session: grabs a frame ~1s in, uploads it, saves it on the media row.
import { api, putToStorage } from './api.js';

function grabFrame(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const fail = (msg) => { cleanup(); reject(new Error(msg)); };
    const timer = setTimeout(() => fail('timed out'), 45000);
    const cleanup = () => { clearTimeout(timer); v.removeAttribute('src'); v.load(); };
    v.onerror = () => fail('could not load video');
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
    v.onseeked = () => {
      try {
        const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => {
          const meta = { width: v.videoWidth, height: v.videoHeight, duration_s: Number.isFinite(v.duration) ? Math.round(v.duration * 100) / 100 : null };
          cleanup();
          b ? resolve({ blob: b, meta }) : reject(new Error('no frame'));
        }, 'image/jpeg', 0.82);
      } catch (e) {
        fail(e.message);
      }
    };
    v.src = url;
  });
}

let running = false;
/** Returns how many posters were made. */
export async function backfillPosters(storageMode, onDone) {
  if (running || storageMode !== 'blob') return 0;
  running = true;
  let made = 0;
  try {
    const list = await api('media', { query: { limit: 200 } });
    for (const m of list.filter((x) => x.kind === 'video' && !x.poster_url).slice(0, 20)) {
      try {
        const { blob, meta } = await grabFrame(m.url);
        const name = `${(m.filename || 'video').replace(/\.\w+$/, '')}-poster.jpg`;
        const stored = await putToStorage(name, new File([blob], name, { type: 'image/jpeg' }), storageMode);
        await api(`media/${m.id}`, { method: 'PATCH', body: { poster_url: stored.url, ...meta } });
        made++;
      } catch { /* skip this one; try again next session */ }
    }
  } catch { /* offline */ } finally {
    running = false;
  }
  if (made && onDone) onDone(made);
  return made;
}
