import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { useApp, Icon, PfMark, CopyField, Seg, Spinner } from '../ui.jsx';

const KEYS = {
  instagram: { fields: [['META_APP_ID', 'Meta app ID'], ['META_APP_SECRET', 'Meta app secret'], ['META_CONFIG_ID', 'Configuration ID (config_id)']], where: 'Meta for Developers → your app → App settings → Basic (ID & secret); Use cases → Instagram → Customize → API setup with Unified login (configuration)' },
  youtube: { fields: [['GOOGLE_CLIENT_ID', 'Google OAuth client ID'], ['GOOGLE_CLIENT_SECRET', 'Google OAuth client secret']], where: 'Google Cloud console → APIs & Services → Credentials → your OAuth client' },
  tiktok: { fields: [['TIKTOK_CLIENT_KEY', 'TikTok client key'], ['TIKTOK_CLIENT_SECRET', 'TikTok client secret']], where: 'TikTok for Developers → Manage apps → your app' },
};

function PlatformKeys({ p }) {
  const { config, toast, refresh } = useApp();
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const k = KEYS[p.id];
  const save = async () => {
    setBusy(true);
    try {
      await api('settings', { method: 'POST', body: vals });
      setVals({});
      toast(`${p.label} keys saved`);
      refresh();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const dirty = Object.values(vals).some((v) => v);
  return (
    <div class="col" style={{ gap: 10, padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <div class="row wrap">
        <PfMark platform={p.id} size={22} />
        <b style={{ width: 90 }}>{p.label}</b>
        {p.configured ? <span class="pill good"><span class="dot" />Ready</span> : <span class="pill warn">Keys needed</span>}
        {p.id === 'youtube' && p.configured && <span class={`pill ${config.audited.youtube ? 'good' : ''}`}>{config.audited.youtube ? 'Audited: public uploads' : 'Not audited: uploads are private'}</span>}
        {p.id === 'tiktok' && p.configured && <span class={`pill ${config.audited.tiktok ? 'good' : ''}`}>{config.audited.tiktok ? 'Audited: public posts' : 'Not audited: "Only me" or inbox'}</span>}
      </div>
      <div class="grid2">
        {k.fields.map(([key, label]) => (
          <div class="field" key={key}>
            <label for={key}>{label}</label>
            <input id={key} class="input" type={key.includes('SECRET') ? 'password' : 'text'} autoComplete="off"
              placeholder={config.settings?.[key] === 'vercel' ? 'Set in Vercel' : config.settings?.[key] ? 'Saved — paste to replace' : 'Paste here'}
              disabled={config.settings?.[key] === 'vercel'} value={vals[key] || ''} onInput={(e) => setVals({ ...vals, [key]: e.currentTarget.value })} />
          </div>
        ))}
      </div>
      <div class="field"><label>Redirect URL to paste into the {p.label} developer app</label><CopyField value={p.redirect_uri} /></div>
      <div class="row between wrap">
        <span class="tiny faint">Find the keys in: {k.where}. Full walkthrough in SETUP.md.</span>
        <button class="btn primary sm" disabled={!dirty || busy} onClick={save}>{busy ? <Spinner /> : 'Save keys'}</button>
      </div>
    </div>
  );
}

function theme() {
  try { return localStorage.getItem('pr-theme') || 'system'; } catch { return 'system'; }
}
export function applyTheme(t) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('pr-theme', t); } catch { /* private mode */ }
}

export default function Settings() {
  const { config, accounts } = useApp();
  const [t, setT] = useState(theme());
  const needs = accounts.filter((a) => a.status !== 'active').length;
  return (
    <>
      <div class="page-head"><h1>Settings</h1></div>
      <div class="col" style={{ gap: 16, maxWidth: 820 }}>
        <section class="card pad mobile-links">
          <div class="row wrap">
            <a class="btn" href="#/accounts"><Icon name="users" size={16} /> Accounts{needs ? ` (${needs} need attention)` : ''}</a>
            <a class="btn" href="#/plans"><Icon name="sparkle" size={16} /> Plans</a>
            <a class="btn" href="#/library"><Icon name="image" size={16} /> Library</a>
            <a class="btn" href="#/research"><Icon name="layers" size={16} /> Research</a>
          </div>
        </section>

        <section class="card pad" id="platform-keys">
          <h2>Platform keys</h2>
          <p class="small muted" style={{ marginTop: 0 }}>Each platform needs a free developer app (one-time). Paste its two keys here — no Vercel needed. Your accounts then connect by logging in on the platform's own page.</p>
          {config.platforms.map((p) => <PlatformKeys key={p.id} p={p} />)}
        </section>

        <section class="card pad">
          <h2 class="row"><Icon name="sparkle" size={16} /> Claude</h2>
          <div class="kv">
            <span class="label">MCP connector URL</span>
            {config.mcp_url ? <CopyField value={config.mcp_url} /> : <span class="small muted">Set <code>MCP_KEY</code> in Vercel to enable.</span>}
            <span class="label">Write with Claude</span>
            <span class="small">{config.ai ? <span class="pill good"><span class="dot" />On</span> : <span class="muted">Add <code>ANTHROPIC_API_KEY</code> to write captions inside the composer.</span>}</span>
          </div>
          {config.mcp_url && (
            <ol class="setup-steps">
              <li>In Claude (claude.ai or the desktop app) open <b>Settings → Connectors → Add custom connector</b>.</li>
              <li>Paste the URL above and save. Keep it private — it works like a password.</li>
              <li>Ask things like <i>"Plan next week's posts from my library — reels on Instagram, Shorts on YouTube, and TikTok inbox drafts, at my best hours."</i></li>
              <li>Claude's posts arrive under <a href="#/plans">Plans</a>; nothing publishes until you approve.</li>
            </ol>
          )}
        </section>

        <section class="card pad">
          <h2>App</h2>
          <div class="kv">
            <span class="label">Theme</span>
            <Seg value={t} onChange={(v) => { setT(v); applyTheme(v); }} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            <span class="label">Time zone</span>
            <span class="small">{config.timezone} <span class="faint">(change with APP_TIMEZONE)</span></span>
            <span class="label">Publisher</span>
            <span class="small">{config.cron ? 'Runs every minute via Supabase cron' : <span style={{ color: 'var(--bad)' }}>CRON_SECRET is not set — scheduled posts won't go out.</span>}</span>
            <span class="label">Media storage</span>
            <span class="small">{config.storage.mode === 'blob' ? 'Vercel Blob' : config.storage.mode === 'local' ? 'Local disk (dev)' : <span style={{ color: 'var(--bad)' }}>Not set up — connect a Vercel Blob store</span>}</span>
          </div>
          <div class="divider" />
          <button class="btn" onClick={() => api('logout', { method: 'POST' }).then(() => location.reload())}><Icon name="logout" size={16} /> Sign out</button>
        </section>
      </div>
    </>
  );
}
