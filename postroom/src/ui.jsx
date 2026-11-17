// Shared UI pieces.
import { createContext } from 'preact';
import { useContext, useEffect, useState, useCallback } from 'preact/hooks';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const PF = {
  instagram: { label: 'Instagram', short: 'IG', color: 'var(--ig)' },
  youtube: { label: 'YouTube', short: 'YT', color: 'var(--yt)' },
  tiktok: { label: 'TikTok', short: 'TT', color: 'var(--tt)' },
};
export const KIND = { image: 'Post', carousel: 'Carousel', reel: 'Reel', story: 'Story', short: 'Short', video: 'Video' };
export const STATUS = {
  draft: { label: 'Draft', cls: '' },
  scheduled: { label: 'Scheduled', cls: 'info' },
  processing: { label: 'Publishing', cls: 'warn' },
  published: { label: 'Published', cls: 'good' },
  failed: { label: 'Failed', cls: 'bad' },
  cancelled: { label: 'Cancelled', cls: '' },
};

const P = {
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  plus: 'M12 5v14M5 12h14',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  chevL: 'm15 18-6-6 6-6',
  chevR: 'm9 18 6-6-6-6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  layers: 'm12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
  play: 'm6 3 14 9-14 9z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  send: 'm22 2-7 20-4-9-9-4zM22 2 11 13',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
};
export function Icon({ name, size = 18, stroke = 1.8, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

/** Simple platform glyphs on a coloured tile (identity is also given by text labels). */
export function PfMark({ platform, size = 18 }) {
  const s = size * 0.62;
  const glyph = {
    instagram: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="#fff" /></svg>
    ),
    youtube: (
      <svg width={s} height={s} viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="#fff" /></svg>
    ),
    tiktok: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.8 2.4 4.6 5 5" /></svg>
    ),
  }[platform];
  return <span class={`pf-mark ${platform}`} style={{ width: size, height: size }} title={PF[platform]?.label}>{glyph}</span>;
}

export function Avatar({ src, name = '?', platform, size = 32 }) {
  const [broken, setBroken] = useState(false);
  return (
    <span class="avatar" style={{ width: size, height: size }}>
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : <span class="ph">{String(name).replace(/^@/, '').slice(0, 1).toUpperCase()}</span>}
      {platform && <span class="pf"><PfMark platform={platform} size={Math.max(14, size * 0.46)} /></span>}
    </span>
  );
}

export function StatusPill({ status, post }) {
  const s = STATUS[status] || { label: status, cls: '' };
  if (post?.inbox) return <span class="pill info"><Icon name="inbox" size={12} /> In TikTok inbox</span>;
  return <span class={`pill ${s.cls}`}><span class="dot" />{s.label}</span>;
}

export function Spinner() {
  return <span class="spinner" role="status" aria-label="Loading" />;
}

export function Empty({ icon = 'calendar', title, children, action }) {
  return (
    <div class="empty">
      <div class="ic-big"><Icon name={icon} size={22} /></div>
      <h3>{title}</h3>
      <div class="small">{children}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Drawer({ onClose, title, children, foot }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div class="overlay" onClick={onClose} />
      <aside class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <div class="grow">{title}</div>
          <button class="btn ghost icon" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div class="drawer-body">{children}</div>
        {foot && <div class="drawer-foot">{foot}</div>}
      </aside>
    </>
  );
}

export function Modal({ onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div class="overlay" onClick={onClose} />
      <div class="modal" role="dialog" aria-modal="true">{children}</div>
    </>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div class="seg" role="tablist">
      {options.map((o) => (
        <button type="button" key={o.value} class={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} role="tab" aria-selected={value === o.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="col" style={{ gap: 0 }}>
        <span>{label}</span>
        {hint && <span class="tiny faint">{hint}</span>}
      </span>
    </label>
  );
}

export function useAsync(fn, deps = []) {
  const [state, set] = useState({ loading: true, data: null, error: null });
  const run = useCallback(async () => {
    set((s) => ({ ...s, loading: true, error: null }));
    try {
      set({ loading: false, data: await fn(), error: null });
    } catch (e) {
      set({ loading: false, data: null, error: e });
    }
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function CopyField({ value }) {
  const { toast } = useApp();
  return (
    <div class="copy-field">
      <input class="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      <button class="btn icon" aria-label="Copy" onClick={() => navigator.clipboard.writeText(value).then(() => toast('Copied'))}><Icon name="copy" size={16} /></button>
    </div>
  );
}
