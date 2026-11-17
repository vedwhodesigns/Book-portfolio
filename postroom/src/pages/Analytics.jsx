import { useState, useMemo } from 'preact/hooks';
import { api, fmtNum, fmtDate, addDays, todayKey, relTime } from '../api.js';
import { useApp, useAsync, Seg, PF, PfMark, Avatar, Empty, Spinner, KIND, Icon } from '../ui.jsx';

function Delta({ cur, prev }) {
  if (!prev) return <span class="delta faint">—</span>;
  const d = (cur - prev) / prev;
  const up = d >= 0;
  return <span class={`delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(Math.round(d * 100))}% <span class="faint" style={{ fontWeight: 500 }}>vs prev.</span></span>;
}

/** Daily views: single-series bar chart with a hover tooltip per bar. */
function DailyChart({ daily, days }) {
  const [hover, setHover] = useState(null);
  const series = useMemo(() => {
    const byDay = new Map(daily.map((d) => [String(d.day).slice(0, 10), d]));
    const end = todayKey();
    return Array.from({ length: days }, (_, i) => {
      const k = addDays(end, i - days + 1);
      const r = byDay.get(k);
      return { k, views: r?.views || 0, posts: r?.posts || 0 };
    });
  }, [daily, days]);
  const W = 720, H = 220, L = 44, B = 24, T = 10;
  const max = Math.max(10, ...series.map((s) => s.views));
  const nice = niceMax(max);
  const bw = (W - L) / series.length;
  const y = (v) => T + (H - T - B) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const every = Math.ceil(series.length / 7);
  return (
    <div style={{ position: 'relative' }}>
      <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Views per day for the last ${days} days`}>
        <g class="grid">{ticks.map((t) => <line key={t} x1={L} x2={W} y1={y(t)} y2={y(t)} stroke-width="1" />)}</g>
        <g class="axis">
          {ticks.map((t) => <text key={t} x={L - 8} y={y(t) + 3.5} text-anchor="end">{fmtNum(t)}</text>)}
          {series.map((s, i) => (i % every === 0 ? <text key={s.k} x={L + i * bw + bw / 2} y={H - 6} text-anchor="middle">{fmtDate(`${s.k}T12:00:00Z`)}</text> : null))}
        </g>
        {series.map((s, i) => {
          const x = L + i * bw + 1;
          const w = Math.max(1, bw - 2);
          const h = Math.max(0, y(0) - y(s.views));
          const r = Math.min(4, w / 2, h);
          return (
            <g key={s.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
              {h > 0 && <path d={`M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z`} fill="var(--series-total)" opacity={hover == null || hover === i ? 1 : 0.45} />}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div class="chart-tip" style={{ left: `${((L + hover * bw + bw / 2) / W) * 100}%`, top: `${(y(series[hover].views) / H) * 100}%` }}>
          <b>{fmtDate(`${series[hover].k}T12:00:00Z`, { weekday: 'short', day: 'numeric', month: 'short' })}</b> · {fmtNum(series[hover].views)} views · {series[hover].posts} post{series[hover].posts === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function Spark({ points }) {
  if (points.length < 2) return <span class="tiny faint">collecting…</span>;
  const W = 60, H = 24;
  const vals = points.map((p) => p.followers);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i) => (i / (points.length - 1)) * (W - 4) + 2;
  const y = (v) => (max === min ? H / 2 : H - 3 - ((v - min) / (max - min)) * (H - 6));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.followers).toFixed(1)}`).join(' ');
  const delta = vals[vals.length - 1] - vals[0];
  return (
    <span class="row" style={{ gap: 6 }}>
      <svg class="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><path d={d} fill="none" stroke="var(--text-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" /></svg>
      <span class={`delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '+' : ''}{fmtNum(delta)}</span>
    </span>
  );
}

export default function Analytics() {
  const { accounts, openPost } = useApp();
  const [days, setDays] = useState(30);
  const [pf, setPf] = useState('');
  const { data, loading } = useAsync(() => api('analytics', { query: { days, platform: pf || null } }), [days, pf]);
  const pfs = [...new Set(accounts.map((a) => a.platform))];

  const head = (
    <div class="page-head">
      <h1>Analytics</h1>
      {loading && <Spinner />}
      <div class="grow" />
      {pfs.length > 1 && <Seg value={pf} onChange={setPf} options={[{ value: '', label: 'All' }, ...pfs.map((p) => ({ value: p, label: PF[p].label }))]} />}
      <Seg value={days} onChange={setDays} options={[{ value: 7, label: '7d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }]} />
    </div>
  );
  if (!data) return <>{head}<div class="skeleton" style={{ height: 300 }} /></>;
  const t = data.totals, pv = data.previous;
  if (!t.posts && !data.by_account.some((a) => a.followers_count)) {
    return <>{head}<div class="card"><Empty icon="chart" title="No published posts yet">Views, likes and follower growth appear here a few hours after your first post goes out. Postroom refreshes stats every 3 hours.</Empty></div></>;
  }
  const maxPf = Math.max(1, ...data.by_platform.map((r) => r.views));
  const followersBy = (id) => data.followers.filter((f) => f.account_id === id);

  return (
    <>
      {head}
      <div class="kpis">
        {[['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['posts', 'Posts published']].map(([k, l]) => (
          <div class="card kpi" key={k}>
            <div class="k">{l}</div>
            <div class="v num">{fmtNum(t[k])}</div>
            <Delta cur={t[k]} prev={pv[k]} />
          </div>
        ))}
      </div>

      <div class="an-grid">
        <section class="card pad">
          <h2>Views by publish day</h2>
          <DailyChart daily={data.daily} days={days} />
          <p class="tiny faint" style={{ margin: '6px 0 0' }}>Views so far on posts published each day.</p>
        </section>
        <section class="card pad">
          <h2>By platform</h2>
          {data.by_platform.length === 0 ? <p class="small muted">No posts in this period.</p> : (
            <>
              {data.by_platform.map((r) => (
                <div class="hbar" key={r.platform}>
                  <span class="row small"><PfMark platform={r.platform} size={16} />{PF[r.platform].label}</span>
                  <span class="track"><span class="fill" style={{ display: 'block', width: `${(r.views / maxPf) * 100}%`, background: PF[r.platform].color }} /></span>
                  <span class="small num" style={{ textAlign: 'right' }}><b>{fmtNum(r.views)}</b></span>
                </div>
              ))}
              <div class="table-wrap" style={{ marginTop: 10 }}>
                <table class="table">
                  <thead><tr><th>Platform</th><th class="r">Posts</th><th class="r">Views</th><th class="r">Likes</th><th class="r">Comments</th></tr></thead>
                  <tbody>{data.by_platform.map((r) => <tr key={r.platform}><td>{PF[r.platform].label}</td><td class="r">{r.posts}</td><td class="r">{fmtNum(r.views)}</td><td class="r">{fmtNum(r.likes)}</td><td class="r">{fmtNum(r.comments)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      <div class="an-grid">
        <section class="card pad">
          <h2>Top posts</h2>
          {data.top_posts.length === 0 ? <p class="small muted">No posts in this period.</p> : (
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Post</th><th class="r">Views</th><th class="r">Likes</th><th class="r">Comments</th></tr></thead>
                <tbody>
                  {data.top_posts.map((p) => (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openPost(p.id)}>
                      <td>
                        <div class="row">
                          {p.thumb ? <img src={p.thumb} alt="" style={{ width: 30, height: 38, objectFit: 'cover', borderRadius: 6 }} /> : <span style={{ width: 30 }} />}
                          <div style={{ minWidth: 0 }}>
                            <div class="row small" style={{ gap: 5 }}><PfMark platform={p.platform} size={14} /><b>@{p.username}</b><span class="faint tiny">{KIND[p.kind]} · {relTime(p.published_at)}</span></div>
                            <div class="small ellipsis" style={{ maxWidth: 320 }}>{p.title || p.caption}</div>
                          </div>
                        </div>
                      </td>
                      <td class="r"><b>{fmtNum(p.metrics?.views)}</b></td>
                      <td class="r">{fmtNum(p.metrics?.likes)}</td>
                      <td class="r">{fmtNum(p.metrics?.comments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section class="card pad">
          <h2>Accounts</h2>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Account</th><th class="r">Followers</th><th>Trend</th></tr></thead>
              <tbody>
                {data.by_account.map((a) => (
                  <tr key={a.id}>
                    <td><div class="row"><Avatar src={a.profile_picture_url} name={a.username} platform={a.platform} size={26} /><span class="small ellipsis" style={{ maxWidth: 120 }}>@{a.username}</span></div></td>
                    <td class="r">{fmtNum(a.followers_count)}</td>
                    <td><Spark points={followersBy(a.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.best_hours.length > 0 && (
            <>
              <div class="divider" />
              <h2 class="row"><Icon name="clock" size={16} /> Best hours to post</h2>
              <div class="row wrap">
                {data.best_hours.map((h) => <span key={h.hour} class="pill" title={`${h.posts} posts`}>{new Intl.DateTimeFormat('en', { hour: 'numeric' }).format(new Date(2020, 0, 1, h.hour))} · {fmtNum(h.avg_views)} avg views</span>)}
              </div>
              <p class="tiny faint">From your last 90 days, by average views.</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
