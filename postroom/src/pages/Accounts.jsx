import { useState } from 'preact/hooks';
import { api, fmtNum, relTime } from '../api.js';
import { useApp, Icon, PfMark, PF, Avatar, Spinner } from '../ui.jsx';

const HOW = {
  instagram: 'Professional (Creator or Business) Instagram accounts. You log in on Instagram\'s own page.',
  youtube: 'Any YouTube channel. You pick the Google account and channel on Google\'s page — for brand channels, choose the channel when Google asks.',
  tiktok: 'Any TikTok account. You log in on TikTok\'s own page.',
};

export default function Accounts() {
  const { accounts, config, toast, refresh } = useApp();
  const [busy, setBusy] = useState(null);
  const act = async (id, fn, msg) => {
    setBusy(id);
    try {
      await fn();
      toast(msg);
      refresh();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div class="page-head">
        <h1>Accounts</h1>
        <span class="sub">Connect as many accounts per platform as you like. Postroom never sees your passwords.</span>
      </div>
      {config.platforms.map((pf) => {
        const list = accounts.filter((a) => a.platform === pf.id);
        return (
          <section class="pf-section" key={pf.id}>
            <div class="pf-section-head">
              <PfMark platform={pf.id} size={24} />
              <h2>{pf.label}</h2>
              <span class="small muted">{list.length} connected</span>
              <div class="grow" />
              {pf.configured
                ? <a class="btn" href={`/api/connect/${pf.id}`}><Icon name="plus" size={16} /> Connect {pf.label} account</a>
                : <span class="pill warn">Setup needed</span>}
            </div>
            {!pf.configured && (
              <div class="notice warn" style={{ marginBottom: 12 }}>
                <Icon name="alert" size={16} />
                <div>
                  <b>One-time setup:</b> create a free {pf.id === 'instagram' ? 'Meta' : pf.id === 'youtube' ? 'Google Cloud' : 'TikTok for Developers'} app and add {pf.missing.map((k, i) => <span key={k}>{i ? ' and ' : ''}<code>{k}</code></span>)} to Vercel → Settings → Environment Variables. Step-by-step in <b>SETUP.md</b>.
                  <div class="tiny" style={{ marginTop: 4 }}>Redirect URL to paste into the app: <code>{pf.redirect_uri}</code></div>
                </div>
              </div>
            )}
            <div class="acct-grid">
              {list.map((a) => (
                <div class="card acct-card" key={a.id}>
                  <div class="row">
                    <Avatar src={a.profile_picture_url} name={a.username} platform={a.platform} size={42} />
                    <div class="grow">
                      <div class="ellipsis" style={{ fontWeight: 650 }}>{a.name || a.username}</div>
                      <div class="small muted ellipsis">{a.profile_url ? <a href={a.profile_url} target="_blank" rel="noreferrer">@{a.username}</a> : `@${a.username}`}</div>
                    </div>
                    {a.status === 'active' ? <span class="pill good"><span class="dot" />Connected</span> : <span class="pill bad"><span class="dot" />Reconnect</span>}
                  </div>
                  {a.status !== 'active' && <div class="notice bad small">{a.status_detail || 'The login expired.'}</div>}
                  <div class="stats">
                    <div class="stat"><b class="num">{fmtNum(a.followers_count)}</b><span>{a.platform === 'youtube' ? 'subscribers' : 'followers'}</span></div>
                    <div class="stat"><b class="num">{a.upcoming}</b><span>upcoming</span></div>
                    <div class="stat"><b class="num">{a.published_7d}</b><span>posted 7d</span></div>
                  </div>
                  {a.failed > 0 && <a class="small" href="#/queue?tab=failed" style={{ color: 'var(--bad)' }}>{a.failed} failed post{a.failed > 1 ? 's' : ''} →</a>}
                  <div class="actions">
                    {a.status !== 'active'
                      ? <a class="btn primary sm" href={`/api/connect/${a.platform}`}>Reconnect</a>
                      : <a class="btn sm" href={`#/compose?account=${a.id}`}><Icon name="plus" size={14} /> Post</a>}
                    <button class="btn ghost sm" disabled={busy === a.id} onClick={() => act(a.id, () => api(`accounts/${a.id}/sync`, { method: 'POST' }), 'Profile refreshed')}>{busy === a.id ? <Spinner /> : <Icon name="refresh" size={14} />} Refresh</button>
                    <button class="btn ghost sm danger push" disabled={busy === a.id} onClick={() => confirm(`Disconnect @${a.username}? Its upcoming posts will be cancelled.`) && act(a.id, () => api(`accounts/${a.id}`, { method: 'DELETE' }), `Disconnected @${a.username}`)}>Disconnect</button>
                  </div>
                  {a.token_expires_at && a.platform === 'instagram' && <div class="tiny faint">Login renews automatically · expires {relTime(a.token_expires_at)} if unused</div>}
                </div>
              ))}
              {pf.configured && (
                <a class="card connect-card" href={`/api/connect/${pf.id}`} style={{ textDecoration: 'none' }}>
                  <div>
                    <div class="ic-big" style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', margin: '0 auto 10px' }}><Icon name="plus" /></div>
                    <b>Add {pf.label} account</b>
                    <div class="tiny muted" style={{ marginTop: 4, maxWidth: 230 }}>{HOW[pf.id]}</div>
                  </div>
                </a>
              )}
            </div>
          </section>
        );
      })}
      <p class="tiny faint">Tip: to connect a second account on the same platform, log out of the first one on that platform's website (or use a private window), then click Connect again.</p>
    </>
  );
}
