import { useState } from 'preact/hooks';
import { api, fmtDateTime, wallTime, relTime, fmtNum, fmtDur } from '../api.js';
import { useApp, useAsync, Drawer, Icon, Avatar, StatusPill, PF, KIND, Spinner, PfMark } from '../ui.jsx';
import { PostGrowth } from './Insights.jsx';

export default function PostDrawer({ id, onClose }) {
  const { toast, refresh, openPost, go } = useApp();
  const { data: p, loading, error, reload } = useAsync(() => api(`posts/${id}`), [id]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      if (msg) toast(msg);
      refresh();
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const save = () => act(async () => {
    await api(`posts/${id}`, { method: 'PATCH', body: { caption: edit.caption, title: edit.title || null, scheduled_at: edit.at } });
    setEdit(null);
  }, 'Saved');

  if (loading && !p) return <Drawer onClose={onClose} title="Post"><Spinner /></Drawer>;
  if (error) return <Drawer onClose={onClose} title="Post"><div class="notice bad">{error.message}</div></Drawer>;

  const editable = ['draft', 'scheduled', 'failed'].includes(p.status);
  const m = p.metrics || {};
  const hasMetrics = Object.keys(m).length > 0;

  return (
    <Drawer
      onClose={onClose}
      title={
        <div class="row">
          <Avatar src={p.account.profile_picture_url} name={p.account.username} platform={p.platform} size={34} />
          <div class="col" style={{ gap: 0 }}>
            <b>@{p.account.username}</b>
            <span class="tiny muted">{PF[p.platform].label} {KIND[p.kind]}</span>
          </div>
        </div>
      }
      foot={
        <>
          {p.status === 'failed' && <button class="btn primary" disabled={busy} onClick={() => act(() => api(`posts/${id}/retry`, { method: 'POST' }).then(() => api('run', { method: 'POST' }).catch(() => {})), 'Retrying…')}><Icon name="refresh" size={16} /> Retry now</button>}
          {p.status === 'draft' && <button class="btn primary" disabled={busy} onClick={() => act(() => api(`posts/${id}/schedule`, { method: 'POST', body: {} }), p.group_id ? 'Scheduled on every platform' : 'Scheduled')}><Icon name="clock" size={16} /> Schedule{p.group_id ? ' all' : ''}</button>}
          {editable && !edit && <button class="btn" onClick={() => setEdit({ caption: p.caption, title: p.title || '', at: wallTime(p.scheduled_at) })}>Edit</button>}
          {p.permalink && <a class="btn" href={p.permalink} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> Open</a>}
          <button class="btn" onClick={() => { onClose(); go(`compose?from=${id}`); }}><Icon name="copy" size={16} /> Duplicate</button>
          <span class="grow" />
          {editable && <button class="btn danger" disabled={busy} onClick={() => confirm('Cancel this post?') && act(() => api(`posts/${id}/cancel`, { method: 'POST' }), 'Cancelled')}>Cancel post</button>}
          {p.status === 'published' && p.platform === 'youtube' && (p.upload?.archived
            ? <button class="btn" disabled={busy} onClick={() => act(() => api(`posts/${id}/archive`, { method: 'POST', body: { undo: true } }), 'Public again on YouTube')}>Unarchive</button>
            : <button class="btn" disabled={busy} onClick={() => confirm('Archive this video? It becomes Private on YouTube (only you can see it). You can unarchive it any time.') && act(() => api(`posts/${id}/archive`, { method: 'POST' }), 'Archived: now Private on YouTube')}>Archive</button>)}
          {['cancelled', 'draft', 'failed'].includes(p.status) && <button class="btn ghost danger icon" aria-label="Delete" disabled={busy} onClick={() => confirm('Delete this post for good?') && act(async () => { await api(`posts/${id}`, { method: 'DELETE' }); onClose(); }, 'Deleted')}><Icon name="trash" size={16} /></button>}
        </>
      }
    >
      <div class="col" style={{ gap: 14 }}>
        <div class="row wrap">
          <StatusPill status={p.status} post={p} />
          <span class="small muted">{p.status === 'published' ? `Published ${fmtDateTime(p.published_at)}` : `${fmtDateTime(p.scheduled_at)} · ${relTime(p.scheduled_at)}`}</span>
          {p.created_by === 'claude' && <span class="pill"><Icon name="sparkle" size={12} /> by Claude</span>}
        </div>
        {p.status === 'processing' && p.progress != null && p.progress < 1 && (
          <div><div class="progress"><div style={{ width: `${Math.round(p.progress * 100)}%` }} /></div><span class="tiny faint">Uploading {Math.round(p.progress * 100)}%</span></div>
        )}
        {p.error && <div class={`notice ${p.status === 'failed' ? 'bad' : 'warn'}`}><Icon name="alert" size={16} /><span>{p.error}{p.status !== 'failed' && ' (retrying automatically)'}</span></div>}
        {p.note && <div class="notice info"><Icon name="inbox" size={16} /><span>{p.note}</span></div>}
        {p.inbox && p.caption && (
          <div class="field"><label>Caption to paste in TikTok</label>
            <div class="copy-field"><textarea class="textarea" readOnly style={{ minHeight: 70 }} value={p.caption} /><button class="btn icon" aria-label="Copy" onClick={() => navigator.clipboard.writeText(p.caption).then(() => toast('Copied'))}><Icon name="copy" size={16} /></button></div>
          </div>
        )}

        {p.status === 'published' && (
          <div class="row tiny faint" style={{ gap: 8 }}>
            <span>{p.metrics_at ? `Stats updated ${relTime(p.metrics_at)}` : 'No stats yet'}</span>
            <button class="btn ghost sm" disabled={busy} onClick={() => act(() => api('analytics/refresh', { method: 'POST', body: { post_id: id } }).then(reload), 'Stats updated')}><Icon name="refresh" size={13} /> Refresh</button>
          </div>
        )}
        {hasMetrics && (
          <div class="acct-card" style={{ padding: 0 }}>
            <div class="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {[['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments'], [m.saves != null ? 'saves' : 'shares', m.saves != null ? 'Saves' : 'Shares']].map(([k, l]) => (
                <div class="stat" key={k}><b class="num">{fmtNum(m[k])}</b><span>{l}</span></div>
              ))}
            </div>
          </div>
        )}

        {p.status === 'published' && <PostGrowth id={id} platform={p.platform} key={p.metrics_at || 'x'} />}

        <div class="media-strip">
          {p.cover && (
            <a href={p.cover.url} target="_blank" rel="noreferrer" class="media-tile" style={{ width: 110 }} title={p.platform === 'youtube' ? 'YouTube thumbnail' : 'Reel cover'}>
              <img src={p.cover.url} alt="" />
              <span class="meta">{p.platform === 'youtube' ? 'Thumbnail' : 'Cover'}</span>
            </a>
          )}
          {p.media.map((x) => (
            <a key={x.id} href={x.url} target="_blank" rel="noreferrer" class="media-tile" style={{ width: 110 }}>
              {x.poster_url ? <img src={x.poster_url} alt="" /> : <span />}
              <span class="meta">{x.kind === 'video' ? fmtDur(x.duration_s) : 'Image'}</span>
            </a>
          ))}
        </div>

        {edit ? (
          <div class="col" style={{ gap: 12 }}>
            {p.platform === 'youtube' && (
              <div class="field"><label>Title</label><input class="input" value={edit.title} onInput={(e) => setEdit({ ...edit, title: e.currentTarget.value })} /></div>
            )}
            <div class="field"><label>Caption</label><textarea class="textarea" value={edit.caption} onInput={(e) => setEdit({ ...edit, caption: e.currentTarget.value })} /></div>
            <div class="field"><label>Time</label><input type="datetime-local" class="input" value={edit.at} onInput={(e) => setEdit({ ...edit, at: e.currentTarget.value })} /></div>
            <div class="row"><button class="btn primary" disabled={busy} onClick={save}>Save</button><button class="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
          </div>
        ) : (
          <div>
            {p.title && <div style={{ fontWeight: 650, marginBottom: 4 }}>{p.title}</div>}
            <div style={{ whiteSpace: 'pre-wrap' }} class={p.caption ? '' : 'muted'}>{p.caption || 'No caption'}</div>
          </div>
        )}

        {p.platform === 'youtube' && <div class="small muted">Visibility: {p.options.privacy || 'public'} · Made for kids: {p.options.made_for_kids ? 'yes' : 'no'}{p.options.tags?.length ? ` · Tags: ${p.options.tags.join(', ')}` : ''}</div>}
        {p.platform === 'tiktok' && <div class="small muted">{p.options.mode === 'inbox' ? 'Sent to inbox' : `Direct post · ${({ PUBLIC_TO_EVERYONE: 'Everyone', MUTUAL_FOLLOW_FRIENDS: 'Friends', FOLLOWER_OF_CREATOR: 'Followers', SELF_ONLY: 'Only me' })[p.options.privacy_level] || ''}`}</div>}

        {p.siblings.length > 0 && (
          <div>
            <div class="label" style={{ marginBottom: 6 }}>Also posting to</div>
            <div class="col" style={{ gap: 4 }}>
              {p.siblings.map((s) => (
                <button key={s.id} class="chip" onClick={() => openPost(s.id)}>
                  <PfMark platform={s.platform} size={16} /><span class="grow">@{s.username} · {KIND[s.kind]}</span><StatusPill status={s.status} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div class="label" style={{ marginBottom: 6 }}>Activity</div>
          <div class="col" style={{ gap: 6 }}>
            {p.events.map((e, i) => (
              <div key={i} class="row small" style={{ alignItems: 'flex-start' }}>
                <span class="dot" style={{ marginTop: 6, color: e.level === 'error' ? 'var(--bad)' : e.level === 'warn' ? 'var(--warn)' : 'var(--text-3)' }} />
                <span class="grow" style={{ wordBreak: 'break-word' }}>{e.message}</span>
                <span class="faint tiny" style={{ whiteSpace: 'nowrap' }}>{relTime(e.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
