import { useState, useEffect } from 'preact/hooks';
import { api, fmtDateTime, relTime, fmtNum } from '../api.js';
import { useApp, useAsync, Seg, Avatar, StatusPill, KIND, Empty, Spinner, Icon } from '../ui.jsx';
import { FilterBar, applyFilter } from './Calendar.jsx';

const TABS = {
  upcoming: { label: 'Upcoming', status: 'scheduled,processing' },
  drafts: { label: 'Drafts', status: 'draft' },
  failed: { label: 'Failed', status: 'failed' },
  published: { label: 'Published', status: 'published' },
};

export function PostRow({ p, onOpen }) {
  return (
    <div class="post-row" onClick={() => onOpen(p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)}>
      {p.thumb ? <img class="thumb" src={p.thumb} alt="" loading="lazy" /> : <span class="thumb" />}
      <div class="when num">{fmtDateTime(p.status === 'published' ? p.published_at : p.scheduled_at)}<div class="tiny faint">{relTime(p.status === 'published' ? p.published_at : p.scheduled_at)}</div></div>
      <Avatar src={p.avatar} name={p.username} platform={p.platform} size={30} />
      <div class="grow">
        <div class="row" style={{ gap: 6 }}><b class="small">@{p.username}</b><span class="tiny faint">{KIND[p.kind]}</span>{p.created_by === 'claude' && <Icon name="sparkle" size={12} class="faint" />}</div>
        <div class="small ellipsis">{p.title || p.caption || <span class="faint">No caption</span>}</div>
        {p.error && <div class="tiny ellipsis" style={{ color: p.status === 'failed' ? 'var(--bad)' : 'var(--warn)' }}>{p.error}</div>}
        {p.status === 'processing' && p.progress != null && p.progress < 1 && <div class="progress" style={{ marginTop: 4, maxWidth: 200 }}><div style={{ width: `${Math.round(p.progress * 100)}%` }} /></div>}
      </div>
      {p.status === 'published' && p.metrics?.views != null && <div class="small num hide-sm" style={{ textAlign: 'right' }}><b>{fmtNum(p.metrics.views)}</b><div class="tiny faint">views</div></div>}
      <StatusPill status={p.status} post={p} />
    </div>
  );
}

export default function Queue({ params }) {
  const { openPost, bump } = useApp();
  const [tab, setTab] = useState(params.tab || 'upcoming');
  const [filter, setFilter] = useState([]);
  const { data, loading, reload } = useAsync(() => api('posts', { query: { status: TABS[tab].status, limit: 300 } }), [tab, bump]);
  const counts = useAsync(() => Promise.all(Object.values(TABS).map((t) => api('posts', { query: { status: t.status, limit: 1000 } }).then((r) => r.length))), [bump]);

  // While something is publishing, refresh every 10s.
  useEffect(() => {
    if (!data?.some((p) => p.status === 'processing' || (p.status === 'scheduled' && new Date(p.scheduled_at) < Date.now() + 60e3))) return;
    const t = setInterval(reload, 10000);
    return () => clearInterval(t);
  }, [data]);

  const posts = applyFilter(data || [], filter);
  return (
    <>
      <div class="page-head"><h1>Queue</h1><div class="grow" /><a class="btn primary hide-sm" href="#/compose"><Icon name="plus" size={16} /> New post</a></div>
      <div class="cal-toolbar">
        <Seg value={tab} onChange={setTab} options={Object.entries(TABS).map(([k, t], i) => ({ value: k, label: `${t.label}${counts.data ? ` ${counts.data[i]}` : ''}` }))} />
        {loading && <Spinner />}
        <div class="grow" />
        <FilterBar value={filter} onChange={setFilter} />
      </div>
      <div class="card">
        {!loading && !posts.length ? (
          <Empty icon={tab === 'failed' ? 'check' : 'list'} title={tab === 'failed' ? 'Nothing failed' : `No ${TABS[tab].label.toLowerCase()} posts`}>
            {tab === 'upcoming' ? 'Scheduled posts show up here.' : tab === 'failed' ? 'Posts that could not be published appear here with the reason and a retry button.' : ''}
          </Empty>
        ) : (
          <div class="list">{posts.map((p) => <PostRow key={p.id} p={p} onOpen={openPost} />)}</div>
        )}
      </div>
    </>
  );
}
