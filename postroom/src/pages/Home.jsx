// Home: the phone-first start screen. What needs you, what's next, how each brand is doing, what just went out.
import { api, fmtNum, fmtTime, fmtDate, relTime, dayKey, todayKey, addDays } from '../api.js';
import { useApp, useAsync, Icon, Spinner, PfMark, Avatar } from '../ui.jsx';

const SHORTCUTS = [
  ['calendar', 'Calendar', 'calendar'],
  ['queue', 'Queue', 'list'],
  ['planner', 'Planner', 'board'],
  ['inbox', 'DMs', 'inbox'],
  ['accounts', 'Accounts', 'users'],
  ['library', 'Library', 'image'],
  ['research', 'Research', 'layers'],
  ['settings', 'Settings', 'settings'],
];

const dayLabel = (d) => {
  const k = dayKey(d);
  return k === todayKey() ? 'Today' : k === addDays(todayKey(), 1) ? 'Tomorrow' : fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
};
const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const Thumb = ({ src }) => (src ? <img class="h-thumb" src={src} alt="" loading="lazy" /> : <span class="h-thumb" />);

/** Group cross-posts (same group, same minute) into one row with both platform marks. */
function groupUpcoming(list) {
  const out = [];
  const byKey = new Map();
  for (const p of list) {
    const k = p.group_id || p.id;
    if (byKey.has(k)) { byKey.get(k).platforms.push(p.platform); byKey.get(k).accounts.push(p.username); continue; }
    const row = { ...p, platforms: [p.platform], accounts: [p.username] };
    byKey.set(k, row);
    out.push(row);
  }
  return out;
}

export default function Home() {
  const { openPost, accounts } = useApp();
  const { data: d, loading, reload } = useAsync(() => api('home'), []);
  if (loading && !d) return <div class="empty"><Spinner /></div>;
  if (!d) return null;
  const n = d.needs;
  const todo = [
    n.comments > 0 && { href: '#/comments', icon: 'inbox', tone: 'info', text: `${n.comments} comment repl${n.comments === 1 ? 'y' : 'ies'} to review` },
    n.failed > 0 && { href: '#/queue?tab=failed', icon: 'alert', tone: 'bad', text: `${n.failed} post${n.failed === 1 ? '' : 's'} failed` },
    n.reconnect > 0 && { href: '#/accounts', icon: 'alert', tone: 'bad', text: `${n.reconnect} account${n.reconnect === 1 ? ' needs' : 's need'} reconnecting` },
    n.approvals > 0 && { href: '#/plans', icon: 'sparkle', tone: 'info', text: `${n.approvals} plan${n.approvals === 1 ? '' : 's'} from Claude to approve` },
    n.drafts > 0 && { href: '#/queue?tab=drafts', icon: 'list', tone: '', text: `${n.drafts} draft${n.drafts === 1 ? '' : 's'} waiting` },
  ].filter(Boolean);
  const upcoming = groupUpcoming(d.upcoming);
  let lastDay = null;
  const brandAcct = (b) => accounts.find((a) => a.brand?.name === b);

  return (
    <div class="home">
      <div class="home-head">
        <div>
          <div class="tiny faint">{fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greeting()}</h1>
        </div>
        <button class="btn ghost icon" aria-label="Refresh" onClick={reload}>{loading ? <Spinner /> : <Icon name="refresh" size={18} />}</button>
      </div>

      {todo.length > 0 && (
        <div class="h-todo">
          {todo.map((t) => (
            <a key={t.text} href={t.href} class={`h-todo-item ${t.tone}`}>
              <span class="ic"><Icon name={t.icon} size={18} /></span>
              <span class="grow">{t.text}</span>
              <span class="faint" aria-hidden="true"><Icon name="chevR" size={18} /></span>
            </a>
          ))}
        </div>
      )}

      {d.empty_slots.length > 0 && (
        <section class="h-sec">
          <div class="row between"><h2>Open slots</h2><span class="tiny faint">next 24 hours</span></div>
          <div class="card h-list">
            {d.empty_slots.map((e) => {
              const a = brandAcct(e.brand);
              return (
                <a key={e.brand} class="h-item h-slotrow" href={`#/compose${a ? `?account=${a.id}` : ''}`}>
                  <Avatar src={a?.profile_picture_url} name={e.brand} size={40} />
                  <span class="grow" style={{ minWidth: 0 }}>
                    <b class="ellipsis">{e.brand}</b>
                    <span class="tiny faint">{e.time ? `${e.time} · empty slot` : 'Empty slot'}</span>
                  </span>
                  <span class="h-add" aria-label={`Post for ${e.brand}`}><Icon name="plus" size={18} /></span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <section class="h-sec">
        <div class="row between"><h2>Up next</h2><a class="tiny muted" href="#/calendar">Calendar →</a></div>
        {!upcoming.length ? (
          <a class="card h-empty" href="#/compose"><Icon name="plus" size={18} /> Nothing scheduled. Make a post</a>
        ) : (
          <div class="card h-list">
            {upcoming.map((p) => {
              const dl = dayLabel(p.scheduled_at);
              const head = dl !== lastDay ? (lastDay = dl) : null;
              return [
                head && <div key={`h${p.id}`} class="h-day">{head}</div>,
                <button key={p.id} class="h-item" onClick={() => openPost(p.id)}>
                  <Thumb src={p.thumb} />
                  <span class="grow" style={{ minWidth: 0 }}>
                    <span class="row" style={{ gap: 6 }}><b>{fmtTime(p.scheduled_at)}</b>{p.status === 'processing' && <span class="pill info">Posting…</span>}</span>
                    <span class="ellipsis small">{p.title || '(no caption)'}</span>
                    <span class="tiny faint ellipsis">{p.brand || `@${p.username}`}</span>
                  </span>
                  <span class="row" style={{ gap: 3 }}>{[...new Set(p.platforms)].map((pf) => <PfMark key={pf} platform={pf} size={16} />)}</span>
                </button>,
              ];
            })}
          </div>
        )}
      </section>

      {d.brands.length > 0 && (
        <section class="h-sec">
          <div class="row between"><h2>Last 7 days</h2><a class="tiny muted" href="#/analytics">Analytics →</a></div>
          <div class="h-brands">
            {d.brands.map((b) => (
              <a key={b.brand} class="card h-brand" href="#/analytics">
                <div class="row between" style={{ gap: 6 }}>
                  <Avatar src={brandAcct(b.brand)?.profile_picture_url} name={b.brand} size={28} />
                  <span class="row" style={{ gap: 3 }}>{(b.platforms || []).map((pf) => <PfMark key={pf} platform={pf} size={14} />)}</span>
                </div>
                <b class="ellipsis small">{b.brand}</b>
                <div class="h-big">{fmtNum(b.views_7d)}</div>
                <div class="tiny faint">views · {b.posts_7d} post{b.posts_7d === 1 ? '' : 's'}</div>
                <div class="tiny faint">{fmtNum(b.followers)} followers</div>
              </a>
            ))}
          </div>
        </section>
      )}

      {d.recent.length > 0 && (
        <section class="h-sec">
          <h2>Just posted</h2>
          <div class="card h-list">
            {d.recent.map((p) => (
              <button key={p.id} class="h-item" onClick={() => openPost(p.id)}>
                <Thumb src={p.thumb} />
                <span class="grow" style={{ minWidth: 0 }}>
                  <span class="ellipsis small"><b>{p.title || '(no caption)'}</b></span>
                  <span class="tiny faint ellipsis">{p.brand || `@${p.username}`} · {relTime(p.published_at)}</span>
                </span>
                <span class="h-views"><PfMark platform={p.platform} size={14} /><b>{fmtNum(p.views)}</b><span class="tiny faint">views</span></span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section class="h-sec">
        <h2>Everything else</h2>
        <div class="h-grid">
          {SHORTCUTS.map(([path, label, icon]) => (
            <a key={path} href={`#/${path}`} class="h-tile"><span class="ic"><Icon name={icon} size={20} /></span>{label}</a>
          ))}
        </div>
      </section>
    </div>
  );
}
