import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { useApp, Icon, PfMark, CopyField, Seg } from '../ui.jsx';

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

        <section class="card pad">
          <h2>Platforms</h2>
          <div class="col" style={{ gap: 10 }}>
            {config.platforms.map((p) => (
              <div class="row" key={p.id}>
                <PfMark platform={p.id} size={22} />
                <b style={{ width: 90 }}>{p.label}</b>
                {p.configured ? <span class="pill good"><span class="dot" />Ready</span> : <span class="pill warn">Missing {p.missing.join(', ')}</span>}
                {p.id === 'youtube' && p.configured && <span class={`pill ${config.audited.youtube ? 'good' : ''}`}>{config.audited.youtube ? 'Audited: public uploads' : 'Not audited: uploads are private'}</span>}
                {p.id === 'tiktok' && p.configured && <span class={`pill ${config.audited.tiktok ? 'good' : ''}`}>{config.audited.tiktok ? 'Audited: public posts' : 'Not audited: "Only me" or inbox'}</span>}
              </div>
            ))}
          </div>
          <p class="small muted">Each platform needs a free developer app (one-time, ~15 minutes each). Follow <b>SETUP.md</b> in the Postroom folder.</p>
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
