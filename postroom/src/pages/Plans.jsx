import { useState } from 'preact/hooks';
import { api, relTime } from '../api.js';
import { useApp, useAsync, Empty, Spinner, Icon } from '../ui.jsx';
import { PostRow } from './Queue.jsx';

export default function Plans() {
  const { openPost, toast, refresh, bump, config, go } = useApp();
  const { data, loading, reload } = useAsync(() => api('plans'), [bump]);
  const [busy, setBusy] = useState(null);
  const act = async (id, what) => {
    setBusy(id);
    try {
      const r = await api(`plans/${id}/${what}`, { method: 'POST' });
      toast(what === 'approve' ? `Approved — ${r.scheduled} post(s) scheduled` : 'Plan discarded');
      refresh();
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div class="page-head">
        <h1>Plans</h1>
        <span class="sub">Posts Claude proposed. Nothing goes out until you approve.</span>
      </div>
      {loading ? <Spinner /> : !data?.length ? (
        <div class="card">
          <Empty icon="sparkle" title="No plans waiting" action={config.mcp_url ? <button class="btn" onClick={() => go('settings')}>How to connect Claude</button> : null}>
            Connect Claude to Postroom (Settings → Claude) and ask it to plan your week, e.g. "Plan 5 reels for next week from my library and cross-post them to TikTok and YouTube Shorts."
          </Empty>
        </div>
      ) : (
        <div class="col" style={{ gap: 16 }}>
          {data.map((b) => (
            <section class="card" key={b.id}>
              <div class="row wrap" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <div class="grow">
                  <div class="row"><Icon name="sparkle" size={16} /><b>{b.title}</b><span class="tiny faint">{b.posts.length} posts · {relTime(b.created_at)} by {b.created_by}</span></div>
                  {b.note && <div class="small muted" style={{ marginTop: 4 }}>{b.note}</div>}
                </div>
                <button class="btn" disabled={busy === b.id} onClick={() => act(b.id, 'discard')}>Discard</button>
                <button class="btn primary" disabled={busy === b.id} onClick={() => act(b.id, 'approve')}>{busy === b.id ? <Spinner /> : <Icon name="check" size={16} />} Approve & schedule</button>
              </div>
              <div class="list">{b.posts.map((p) => <PostRow key={p.id} p={p} onOpen={openPost} />)}</div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
