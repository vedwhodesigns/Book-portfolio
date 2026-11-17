import { useState, useMemo } from 'preact/hooks';
import { api, dayKey, addDays, weekdayOf, todayKey, fmtTime, fmtDate, partsInTz } from '../api.js';
import { useApp, useAsync, Icon, Seg, PfMark, PF, KIND, Empty, Spinner, Avatar } from '../ui.jsx';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const startOfWeek = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));
const monthStart = (key) => `${key.slice(0, 8)}01`;

/** Cross-posts (same group, same minute) render as one chip. */
export function groupPosts(posts) {
  const out = [];
  const byKey = new Map();
  for (const p of posts) {
    const k = p.group_id ? `${p.group_id}|${new Date(p.scheduled_at).toISOString().slice(0, 16)}` : p.id;
    if (!byKey.has(k)) {
      const g = { key: k, posts: [], at: p.scheduled_at };
      byKey.set(k, g);
      out.push(g);
    }
    byKey.get(k).posts.push(p);
  }
  return out;
}
function groupStatus(g) {
  const s = g.posts.map((p) => p.status);
  if (s.includes('failed')) return 'failed';
  if (s.includes('processing')) return 'processing';
  if (s.every((x) => x === 'published')) return 'published';
  if (s.every((x) => x === 'cancelled')) return 'cancelled';
  if (s.every((x) => x === 'draft')) return 'draft';
  return 'scheduled';
}
const STATUS_ICON = { failed: 'alert', processing: 'refresh', published: 'check' };

export function PostChip({ group, draggable, onOpen }) {
  const p = group.posts[0];
  const st = groupStatus(group);
  const pfs = [...new Set(group.posts.map((x) => x.platform))];
  const text = p.title || p.caption || '(no caption)';
  return (
    <button
      class={`chip ${st}`}
      draggable={draggable && ['scheduled', 'draft', 'failed'].includes(st)}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify(group.posts.map((x) => x.id))); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => onOpen(p.id)}
      title={`${group.posts.map((x) => `${PF[x.platform].label} @${x.username}`).join(', ')}\n${text}`}
    >
      <span class="bar" style={{ background: st === 'failed' ? 'var(--bad)' : PF[pfs[0]].color }} />
      {p.thumb ? <img class="thumb" src={p.thumb} alt="" loading="lazy" /> : <span class="thumb" />}
      <span class="grow" style={{ minWidth: 0 }}>
        <span class="row" style={{ gap: 4 }}>
          <span class="t num">{fmtTime(p.scheduled_at)}</span>
          {STATUS_ICON[st] && <Icon name={STATUS_ICON[st]} size={12} style={{ color: st === 'failed' ? 'var(--bad)' : st === 'published' ? 'var(--good)' : 'var(--warn)' }} />}
          <span class="row" style={{ gap: 2, marginLeft: 'auto' }}>{pfs.map((x) => <PfMark key={x} platform={x} size={14} />)}</span>
        </span>
        <span class="c ellipsis" style={{ display: 'block' }}>{group.posts.length > 1 ? `${group.posts.length} accounts · ` : `@${p.username} · `}{KIND[p.kind]}</span>
        <span class="c ellipsis" style={{ display: 'block', color: 'var(--text)' }}>{text}</span>
      </span>
    </button>
  );
}

export function FilterBar({ value, onChange }) {
  const { accounts } = useApp();
  const pfs = [...new Set(accounts.map((a) => a.platform))];
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  if (accounts.length < 2) return null;
  return (
    <div class="filters" role="group" aria-label="Filter">
      {pfs.map((pf) => (
        <button key={pf} class={`chip-filter ${value.includes(pf) ? 'on' : ''}`} onClick={() => toggle(pf)} aria-pressed={value.includes(pf)}>
          <PfMark platform={pf} size={14} /> {PF[pf].label}
        </button>
      ))}
      {accounts.length > pfs.length && accounts.map((a) => (
        <button key={a.id} class={`chip-filter ${value.includes(a.id) ? 'on' : ''}`} onClick={() => toggle(a.id)} aria-pressed={value.includes(a.id)}>
          <Avatar src={a.profile_picture_url} name={a.username} size={18} /> @{a.username}
        </button>
      ))}
      {value.length > 0 && <button class="btn ghost sm" onClick={() => onChange([])}>Clear</button>}
    </div>
  );
}
export const applyFilter = (posts, f) => (f.length ? posts.filter((p) => (f.some((x) => PF[x]) ? f.includes(p.platform) : true) && (f.some((x) => !PF[x]) ? f.includes(p.account_id) : true)) : posts);

export default function Calendar({ params }) {
  const { openPost, toast, bump, accounts, go } = useApp();
  const [view, setView] = useState(params.view || 'week');
  const [anchor, setAnchor] = useState(params.date || todayKey());
  const [filter, setFilter] = useState([]);
  const [dropKey, setDropKey] = useState(null);

  const days = useMemo(() => {
    if (view === 'week') {
      const s = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const s = startOfWeek(monthStart(anchor));
    const n = Math.ceil((((weekdayOf(monthStart(anchor)) + 6) % 7) + 31) / 7) * 7;
    return Array.from({ length: n }, (_, i) => addDays(s, i));
  }, [view, anchor]);

  const from = new Date(`${addDays(days[0], -1)}T00:00:00Z`).toISOString();
  const to = new Date(`${addDays(days[days.length - 1], 2)}T00:00:00Z`).toISOString();
  const { data, loading, reload } = useAsync(() => api('posts', { query: { from, to } }), [from, to, bump]);
  const agenda = useAsync(() => api('posts', { query: { from: new Date(Date.now() - 864e5).toISOString(), to: new Date(Date.now() + 21 * 864e5).toISOString() } }), [bump]);

  const posts = applyFilter((data || []).filter((p) => p.status !== 'cancelled'), filter);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const g of groupPosts(posts)) {
      const k = dayKey(g.at);
      m.set(k, [...(m.get(k) || []), g]);
    }
    return m;
  }, [posts]);

  const move = (dir) => {
    if (view === 'week') return setAnchor(addDays(anchor, 7 * dir));
    const [y, mo] = anchor.split('-').map(Number);
    setAnchor(new Date(Date.UTC(y, mo - 1 + dir, 1)).toISOString().slice(0, 10));
  };

  const onDrop = async (e, key) => {
    e.preventDefault();
    setDropKey(null);
    let ids;
    try { ids = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    const post = (data || []).find((p) => p.id === ids[0]);
    if (!post || dayKey(post.scheduled_at) === key) return;
    const t = partsInTz(post.scheduled_at);
    try {
      await Promise.all(ids.map((id) => api(`posts/${id}`, { method: 'PATCH', body: { scheduled_at: `${key}T${t.hh}:${t.mm}` } })));
      toast(`Moved to ${fmtDate(`${key}T12:00:00Z`, { weekday: 'short', day: 'numeric', month: 'short' })}`);
      reload();
    } catch (x) {
      toast(x.message, 'bad');
    }
  };

  const title = view === 'week'
    ? `${fmtDate(`${days[0]}T12:00:00Z`)} – ${fmtDate(`${days[6]}T12:00:00Z`, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : fmtDate(`${monthStart(anchor)}T12:00:00Z`, { month: 'long', year: 'numeric' });
  const today = todayKey();
  const anchorMonth = anchor.slice(0, 7);

  if (!accounts.length) {
    return (
      <>
        <div class="page-head"><h1>Calendar</h1></div>
        <div class="card"><Empty icon="users" title="Connect your first account" action={<button class="btn primary" onClick={() => go('accounts')}>Go to Accounts</button>}>Connect Instagram, YouTube or TikTok — you log in on the platform's own page, Postroom never sees your password.</Empty></div>
      </>
    );
  }

  const agendaGroups = groupPosts(applyFilter((agenda.data || []).filter((p) => !['cancelled'].includes(p.status) && new Date(p.scheduled_at) > Date.now() - 864e5), filter));
  const agendaDays = [...new Set(agendaGroups.map((g) => dayKey(g.at)))];

  return (
    <>
      <div class="page-head">
        <h1>Calendar</h1>
        <div class="grow" />
        <a class="btn primary" href={`#/compose`}><Icon name="plus" size={16} /> New post</a>
      </div>
      <div class="week-wrap">
        <div class="cal-toolbar">
          <div class="row">
            <button class="btn icon sm" onClick={() => move(-1)} aria-label="Previous"><Icon name="chevL" size={16} /></button>
            <button class="btn sm" onClick={() => setAnchor(todayKey())}>Today</button>
            <button class="btn icon sm" onClick={() => move(1)} aria-label="Next"><Icon name="chevR" size={16} /></button>
          </div>
          <div class="range">{title}</div>
          {loading && <Spinner />}
          <div class="grow" />
          <FilterBar value={filter} onChange={setFilter} />
          <Seg value={view} onChange={setView} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        </div>
        <div class={`week ${view}`}>
          {view === 'month' && WD.map((w) => <div key={w} class="day-head" style={{ background: 'var(--surface)', padding: '6px 9px' }}>{w}</div>)}
          {days.map((k, i) => {
            const groups = byDay.get(k) || [];
            const shown = view === 'month' ? groups.slice(0, 3) : groups;
            return (
              <div
                key={k}
                class={`day ${k === today ? 'today' : ''} ${k < today ? 'past' : ''} ${view === 'month' && k.slice(0, 7) !== anchorMonth ? 'out' : ''} ${dropKey === k ? 'drop' : ''}`}
                onDragOver={(e) => { if (k >= today) { e.preventDefault(); setDropKey(k); } }}
                onDragLeave={() => setDropKey(null)}
                onDrop={(e) => onDrop(e, k)}
              >
                <div class="day-head">
                  {view === 'week' && <span>{WD[i]}</span>}
                  <span class="d">{Number(k.slice(8))}</span>
                  {groups.length > 0 && view === 'week' && <span class="tiny faint" style={{ marginLeft: 'auto' }}>{groups.reduce((n, g) => n + g.posts.length, 0)}</span>}
                </div>
                <div class="day-body">
                  {shown.map((g) => <PostChip key={g.key} group={g} draggable onOpen={openPost} />)}
                  {groups.length > shown.length && <button class="more-link" onClick={() => { setView('week'); setAnchor(k); }}>+{groups.length - shown.length} more</button>}
                  {k >= today && <button class="day-add" onClick={() => go(`compose?date=${k}`)}>+ Add</button>}
                </div>
              </div>
            );
          })}
        </div>
        <p class="tiny faint" style={{ marginTop: 8 }}>Drag a post to another day to reschedule it (keeps the time).</p>
      </div>

      <div class="agenda-only">
        <div class="cal-toolbar"><FilterBar value={filter} onChange={setFilter} /></div>
        {agenda.loading ? <Spinner /> : agendaDays.length === 0 ? (
          <div class="card"><Empty title="Nothing scheduled" action={<a class="btn primary" href="#/compose">Schedule a post</a>}>The next three weeks are empty.</Empty></div>
        ) : (
          <div class="agenda">
            {agendaDays.map((k) => (
              <div class="agenda-day" key={k}>
                <h3>{k === today ? 'Today' : k === addDays(today, 1) ? 'Tomorrow' : fmtDate(`${k}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                <div class="col" style={{ gap: 6 }}>
                  {agendaGroups.filter((g) => dayKey(g.at) === k).map((g) => <PostChip key={g.key} group={g} onOpen={openPost} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
