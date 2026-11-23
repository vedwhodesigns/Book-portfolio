// Weekly content reports: the week's numbers vs last week, every post, and Claude's analysis + learnings.
import { useState, useEffect } from 'preact/hooks';
import { api, fmtNum, relTime } from '../api.js';
import { useApp, useAsync, Icon, Spinner, Empty, PfMark, KIND } from '../ui.jsx';
import { HBars } from '../charts.jsx';

const scoreClass = (s) => (s == null ? '' : s >= 70 ? 'good' : s >= 50 ? 'warn' : 'bad');
const VERDICT = { worked: ['Worked', 'good'], did_not_work: ["Didn't work", 'bad'], inconclusive: ['Inconclusive', 'warn'], not_tried: ['Not tried', ''] };
const STATUS = { new: ['New', 'info'], confirmed: ['Confirmed', 'good'], weakened: ['Weakened', 'warn'], contradicted: ['Contradicted', 'bad'] };
const PRIORITY = { high: 'bad', medium: 'warn', low: '' };

function Change({ pct, abs }) {
  if (abs != null) return <span class={`delta ${abs >= 0 ? 'up' : 'down'}`}>{abs >= 0 ? '+' : ''}{fmtNum(abs)} this week</span>;
  if (pct == null) return <span class="delta faint">— vs last week</span>;
  return <span class={`delta ${pct >= 0 ? 'up' : 'down'}`}>{pct >= 0 ? '▲' : '▼'} {Math.abs(Math.round(pct))}% <span class="faint" style={{ fontWeight: 500 }}>vs last week</span></span>;
}

function Refs({ refs, byRef }) {
  if (!refs?.length) return null;
  return (
    <span class="row wrap" style={{ gap: 4, display: 'inline-flex', marginLeft: 6 }}>
      {refs.map((r) => <span key={r} class="pill tiny" title={byRef[r]?.hook || ''}>{r}</span>)}
    </span>
  );
}

function Findings({ title, items, byRef, tone }) {
  return (
    <section class="card pad">
      <h2 class="row" style={{ gap: 6 }}><span class={`pill ${tone}`}>{tone === 'good' ? '✓' : '✕'}</span>{title}</h2>
      {!items?.length ? <p class="small muted">Nothing clear this week.</p> : (
        <div class="col" style={{ gap: 10 }}>
          {items.map((f, i) => (
            <div key={i} class="small">
              <b>{f.finding}</b><Refs refs={f.refs} byRef={byRef} />
              <div class="muted" style={{ marginTop: 2 }}>{f.evidence}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ShareButtons({ r }) {
  const { toast } = useApp();
  const [link, setLink] = useState(r.share_token ? `${location.origin}/api/share/report/${r.share_token}` : null);
  useEffect(() => setLink(r.share_token ? `${location.origin}/api/share/report/${r.share_token}` : null), [r.id, r.share_token]);
  const share = async () => {
    try {
      const { url } = await api(`reports/${r.id}/share`, { method: 'POST' });
      setLink(url);
      const title = `${r.brand} · weekly report · ${r.data?.period?.label || ''}`;
      if (navigator.share) { try { await navigator.share({ title, url }); return; } catch { /* cancelled */ } }
      await navigator.clipboard?.writeText(url);
      toast('Share link copied: anyone with the link can view this report');
    } catch (e) { toast(e.message, 'bad'); }
  };
  const stop = async () => {
    try { await api(`reports/${r.id}/share`, { method: 'DELETE' }); setLink(null); toast('Link switched off'); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <>
      <a class="btn sm" href={`/api/reports/${r.id}/export`} download><Icon name="upload" size={14} style={{ transform: 'rotate(180deg)' }} /> Download</a>
      <a class="btn sm" href={`/api/reports/${r.id}/export?print=1`} target="_blank" rel="noreferrer">Save as PDF</a>
      <button class="btn sm" onClick={share}><Icon name="link" size={14} /> {link ? 'Share again' : 'Share link'}</button>
      {link && <button class="btn ghost sm" onClick={stop} title={link}>Stop sharing</button>}
    </>
  );
}

function ReportView({ r, onRewrite, busy }) {
  const { openPost } = useApp();
  const d = r.data || {};
  const rep = r.report;
  const t = d.totals || {}, ch = d.change || {};
  const byRef = Object.fromEntries((d.posts || []).concat(d.previous_posts || []).map((p) => [p.ref, p]));
  const ranked = (d.posts || []).filter((p) => (p.views_24h ?? (p.outside ? p.views : null)) != null).sort((a, b) => (b.views_24h ?? b.views) - (a.views_24h ?? a.views));
  const k = Math.min(3, Math.floor(ranked.length / 3));
  const best = new Set(ranked.slice(0, Math.max(1, k)).map((p) => p.ref)), worst = new Set(ranked.length >= 4 ? ranked.slice(-k).map((p) => p.ref) : []);
  const kpis = [
    ['Posts', t.posts, ch.posts],
    ['Views', t.views, ch.views],
    ['Median views (24h)', t.median_views_24h, ch.median_views_24h],
    ['Hook score', t.avg_hook_score, ch.avg_hook_score],
    ['Engagement', t.engagement_rate != null ? `${t.engagement_rate}%` : null, ch.engagement_rate],
  ];
  return (
    <>
      <section class="card pad" style={{ marginBottom: 14 }}>
        <div class="row wrap" style={{ gap: 8 }}>
          <span class="tiny faint grow">{d.period?.label} · {r.kind === 'weekly' ? 'weekly report' : `last ${d.period?.days} days`} · {r.posts} post{r.posts === 1 ? '' : 's'} · written {relTime(r.created_at)}</span>
          <ShareButtons r={r} />
          <button class="btn sm" disabled={busy} onClick={onRewrite} title="Pull the latest numbers and ask Claude again">{busy ? <Spinner /> : <Icon name="refresh" size={14} />} Rewrite analysis</button>
        </div>
        {rep ? (
          <>
            <h2 style={{ margin: '10px 0 6px', fontSize: 20 }}>{rep.headline}</h2>
            <p class="small" style={{ margin: 0 }}>{rep.summary}</p>
          </>
        ) : <p class="small" style={{ margin: '10px 0 0' }}><Icon name="alert" size={14} /> {r.error || 'No analysis yet.'}</p>}
      </section>

      <div class="kpis">
        {kpis.map(([l, v, c]) => (
          <div class="card kpi" key={l}>
            <div class="k">{l}</div>
            <div class="v num">{v == null ? '—' : typeof v === 'number' ? fmtNum(v) : v}</div>
            <Change pct={c} />
          </div>
        ))}
      </div>
      {(d.followers_change != null || d.failed_posts > 0) && (
        <p class="small muted" style={{ marginTop: -6 }}>
          {d.followers_change != null && <>Followers <Change abs={d.followers_change} /> </>}
          {d.failed_posts > 0 && <span class="pill bad">{d.failed_posts} failed post{d.failed_posts === 1 ? '' : 's'}</span>}
        </p>
      )}

      {rep && (
        <div class="grid2" style={{ marginBottom: 14 }}>
          <Findings title="What worked" items={rep.what_worked} byRef={byRef} tone="good" />
          <Findings title="What didn't" items={rep.what_didnt} byRef={byRef} tone="bad" />
        </div>
      )}

      {rep && (
        <div class="grid2" style={{ marginBottom: 14 }}>
          <section class="card pad">
            <h2 class="row" style={{ gap: 6 }}><Icon name="check" size={16} /> Decisions for next week</h2>
            <ol class="small tight">
              {(rep.decisions || []).map((x, i) => (
                <li key={i} style={{ marginBottom: 6 }}><b>{x.decision}</b> {x.priority !== 'low' && <span class={`pill tiny ${PRIORITY[x.priority]}`}>{x.priority}</span>}<div class="muted">{x.why}</div></li>
              ))}
            </ol>
          </section>
          <section class="card pad">
            <h2 class="row" style={{ gap: 6 }}><Icon name="sparkle" size={16} /> Experiments to run</h2>
            {!rep.experiments?.length ? <p class="small muted">None this week.</p> : (
              <div class="col" style={{ gap: 10 }}>
                {rep.experiments.map((e, i) => (
                  <div key={i} class="small"><b>{e.test}</b><div class="muted">{e.how}</div><div class="tiny" style={{ marginTop: 2 }}>Judge by: {e.success_metric}</div></div>
                ))}
              </div>
            )}
            {rep.experiment_review?.length > 0 && (
              <>
                <div class="divider" />
                <div class="label">Last week's experiments</div>
                <div class="col" style={{ gap: 8 }}>
                  {rep.experiment_review.map((e, i) => {
                    const [lbl, cls] = VERDICT[e.verdict] || [e.verdict, ''];
                    return <div key={i} class="small"><span class={`pill tiny ${cls}`}>{lbl}</span> <b>{e.experiment}</b><div class="muted">{e.evidence}</div></div>;
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {rep?.learnings?.length > 0 && (
        <section class="card pad" style={{ marginBottom: 14 }}>
          <h2 class="row" style={{ gap: 6 }}><Icon name="layers" size={16} /> What we've learned so far</h2>
          <div class="col" style={{ gap: 8 }}>
            {rep.learnings.map((l, i) => {
              const [lbl, cls] = STATUS[l.status] || [l.status, ''];
              return (
                <div key={i} class="row small" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <span class={`pill tiny ${cls}`} style={{ flex: 'none' }}>{lbl}</span>
                  <span><b>{l.learning}</b> <span class="tiny faint">· {l.confidence} confidence</span><div class="muted">{l.evidence}</div></span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section class="card" style={{ marginBottom: 14 }}>
        <div class="pad" style={{ paddingBottom: 0 }}><h2 style={{ margin: 0 }}>Every post this week</h2></div>
        {!d.posts?.length ? <p class="small muted pad">Nothing was published in this period.</p> : (
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Post</th><th class="r">Views 24h</th><th class="r hide-sm">Now</th><th class="r">Hook</th><th class="r hide-sm">Watched</th><th class="r hide-sm">Engagement</th></tr></thead>
              <tbody>
                {d.posts.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openPost(p.id)}>
                    <td>
                      <div class="row" style={{ alignItems: 'flex-start' }}>
                        {p.thumb ? <img src={p.thumb} alt="" style={{ width: 30, height: 40, objectFit: 'cover', borderRadius: 6, flex: 'none' }} /> : <span style={{ width: 30 }} />}
                        <div style={{ minWidth: 0 }}>
                          <div class="small" style={{ fontWeight: 600 }}>
                            <span class="faint">{p.ref}</span> {p.hook || <span class="faint">(no hook text)</span>}
                            {best.has(p.ref) && <span class="pill tiny good" style={{ marginLeft: 6 }}>Best</span>}
                            {worst.has(p.ref) && <span class="pill tiny bad" style={{ marginLeft: 6 }}>Weakest</span>}
                          </div>
                          <div class="row tiny faint" style={{ gap: 5 }}><PfMark platform={p.platform} size={12} />{p.account.split(':')[1]} · {KIND[p.kind] || p.kind} · {p.posted}{p.series ? ` · ${p.series}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td class="r"><b>{fmtNum(p.views_24h)}</b>{p.age_h < 24 && <div class="tiny faint">{p.age_h}h old</div>}</td>
                    <td class="r hide-sm">{fmtNum(p.views)}</td>
                    <td class="r">{p.hook_score != null ? <span class={`pill ${scoreClass(p.hook_score)}`}>{p.hook_score}</span> : <span class="tiny faint">—</span>}</td>
                    <td class="r hide-sm">{p.avg_view_pct != null ? `${p.avg_view_pct}%` : p.avg_watch_s != null ? `${p.avg_watch_s}s` : '—'}</td>
                    <td class="r hide-sm">{p.engagement_rate != null ? `${p.engagement_rate}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div class="grid2" style={{ marginBottom: 14 }}>
        <section class="card pad">
          <h2>Average views (24h) by posting time</h2>
          <HBars rows={(d.by_hour || []).map((b) => ({ key: b.key, label: `${b.label} · ${b.posts} post${b.posts === 1 ? '' : 's'}`, value: b.avg_views_24h || 0 }))} fmt={fmtNum} />
          {(d.by_series || []).length > 0 && (<><div class="divider" /><h2>By series</h2><HBars rows={d.by_series.map((b) => ({ key: b.key, label: `${b.label} · ${b.posts}`, value: b.avg_views_24h || 0 }))} fmt={fmtNum} /></>)}
          <div class="divider" />
          <h2>By format</h2>
          <HBars rows={(d.by_kind || []).map((b) => ({ key: b.key, label: `${b.label} · ${b.posts}`, value: b.avg_views_24h || 0 }))} fmt={fmtNum} />
        </section>
        <section class="card pad">
          <h2>Accounts</h2>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Account</th><th class="r">Posts</th><th class="r">Views</th><th class="r hide-sm">Median 24h</th><th class="r">Followers</th></tr></thead>
              <tbody>
                {(d.accounts || []).map((a) => (
                  <tr key={a.account}>
                    <td><div class="row small" style={{ gap: 5 }}><PfMark platform={a.platform} size={14} />{a.username}</div>
                      {a.days_without_a_post > 0 && <div class="tiny faint">{a.days_without_a_post} day{a.days_without_a_post === 1 ? '' : 's'} without a post</div>}</td>
                    <td class="r">{a.this_week.posts}<div class="tiny faint">last wk {a.last_week.posts}</div></td>
                    <td class="r">{fmtNum(a.this_week.views)}<div class="tiny faint">last wk {fmtNum(a.last_week.views)}</div></td>
                    <td class="r hide-sm">{fmtNum(a.this_week.median_views_24h)}</td>
                    <td class="r">{fmtNum(a.followers)}{a.followers_change != null && <div class={`tiny delta ${a.followers_change >= 0 ? 'up' : 'down'}`}>{a.followers_change >= 0 ? '+' : ''}{a.followers_change}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {rep?.caveats && <p class="tiny faint"><b>Keep in mind:</b> {rep.caveats}</p>}
    </>
  );
}

export function ReportsTab({ brands, params = {} }) {
  const { toast } = useApp();
  const [brand, setBrand] = useState(params.brand || brands[0] || '');
  const [picked, setPicked] = useState(params.id || null);
  const [busy, setBusy] = useState(false);
  const list = useAsync(() => (brand ? api('reports', { query: { brand } }) : Promise.resolve([])), [brand]);
  const rows = list.data || [];
  const id = picked && (rows.some((r) => r.id === picked) || params.id === picked) ? picked : rows[0]?.id;
  const detail = useAsync(() => (id ? api(`reports/${id}`) : Promise.resolve(null)), [id]);
  const r = detail.data;
  // opened from a notification link (#/analytics?tab=reports&id=…): show that report's brand
  useEffect(() => { if (r && params.id === r.id && r.brand !== brand) setBrand(r.brand); }, [r?.id]);

  const writeNow = async () => {
    setBusy(true);
    try {
      const n = await api('reports/generate', { method: 'POST', body: { brand, days: 7 } });
      setPicked(n.id); await list.reload(); toast(n.report ? 'Report written' : n.error, n.report ? undefined : 'bad');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const rewrite = async () => {
    setBusy(true);
    try {
      const n = await api(`reports/${id}/rewrite`, { method: 'POST' });
      setPicked(n.id); await list.reload(); await detail.reload(); toast(n.report ? 'Analysis rewritten with the latest numbers' : n.error, n.report ? undefined : 'bad');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };

  return (
    <>
      <div class="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <select class="select" style={{ width: 'auto' }} value={brand} onChange={(e) => { setBrand(e.currentTarget.value); setPicked(null); }} aria-label="Brand">
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        {rows.length > 0 && (
          <select class="select" style={{ width: 'auto', maxWidth: '100%' }} value={id} onChange={(e) => setPicked(e.currentTarget.value)} aria-label="Report">
            {rows.map((x) => <option key={x.id} value={x.id}>{x.label}{x.kind === 'manual' ? ' (on demand)' : ''}</option>)}
          </select>
        )}
        <span class="grow" />
        <button class="btn primary sm" disabled={busy || !brand} onClick={writeNow}>{busy ? <Spinner /> : <Icon name="sparkle" size={14} />} Write report now</button>
      </div>
      <p class="small muted" style={{ marginTop: 0 }}>A report is written automatically every <b>Monday at 10:00 India time</b> for the week Monday–Sunday, and you get a phone alert. Each report carries the learnings forward and checks last week's experiments.</p>
      {busy && <p class="small"><Spinner /> Claude is reading the week's numbers — about a minute…</p>}
      {list.loading && !list.data ? <div class="empty"><Spinner /></div>
        : !rows.length ? <div class="card"><Empty icon="chart" title={`No reports for ${brand || 'this brand'} yet`}>The first one arrives on Monday at 10:00, or tap <b>Write report now</b> for the last 7 days.</Empty></div>
        : !r ? <div class="empty"><Spinner /></div>
        : <ReportView r={r} onRewrite={rewrite} busy={busy} />}
    </>
  );
}
