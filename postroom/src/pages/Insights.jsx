import { useState } from 'preact/hooks';
import { api, fmtNum, relTime, fmtDate } from '../api.js';
import { useApp, useAsync, Icon, Spinner, Empty, PfMark, Avatar, PF } from '../ui.jsx';
import { LineChart, HBars, HourStrip } from '../charts.jsx';

const scoreClass = (s) => (s == null ? '' : s >= 70 ? 'good' : s >= 50 ? 'warn' : 'bad');
const TRAFFIC = {
  SHORTS: 'Shorts feed', YT_SEARCH: 'YouTube search', RELATED_VIDEO: 'Suggested videos', SUBSCRIBER: 'Subscriptions / home', BROWSE: 'Browse / home',
  YT_CHANNEL: 'Your channel page', EXT_URL: 'External sites', NO_LINK_OTHER: 'Direct / unknown', PLAYLIST: 'Playlists', NOTIFICATION: 'Notifications',
  YT_OTHER_PAGE: 'Other YouTube pages', END_SCREEN: 'End screens', HASHTAGS: 'Hashtags', SOUND_PAGE: 'Sound pages', ADVERTISING: 'Ads',
};
const nice = (s) => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const countryName = (cc) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc); } catch { return cc; } };

// ======================= Hooks =======================
export function HooksTab({ brands }) {
  const { toast, openPost } = useApp();
  const [brand, setBrand] = useState('');
  const { data, loading, reload } = useAsync(() => api('analytics/hooks', { query: { brand } }), [brand]);
  const [busy, setBusy] = useState(false);
  const analyze = async () => {
    setBusy(true);
    try { await api('analytics/hooks/analyze', { method: 'POST', body: { brand: brand || null } }); await reload(); toast('Claude analysed your hooks'); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const hooks = data?.hooks || [];
  const scored = hooks.filter((h) => h.score != null);
  const rep = data?.report?.report;
  return (
    <>
      <div class="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <select class="select" style={{ width: 'auto' }} value={brand} onChange={(e) => setBrand(e.currentTarget.value)} aria-label="Brand">
          <option value="">All brands</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <span class="grow" />
        <button class="btn primary sm" disabled={busy || hooks.length < 3} onClick={analyze} title={hooks.length < 3 ? 'Needs at least 3 published videos with stats' : ''}>{busy ? <Spinner /> : <Icon name="sparkle" size={14} />} What makes my hooks work?</button>
      </div>
      <p class="small muted" style={{ marginTop: 0 }}>
        <b>Hook score</b> = % of viewers who stayed past the first 3 seconds. Instagram: 100 − skip rate. YouTube: % still watching at 3 s. 70+ is strong.
        {' '}Stats come from Instagram & YouTube with a delay of a few hours (skip rate and retention can take 1–2 days).
      </p>

      {rep && (
        <section class="card pad" style={{ marginBottom: 14 }}>
          <div class="row"><h2 class="row grow" style={{ margin: 0 }}><Icon name="sparkle" size={15} /> Hook learnings{brand ? ` · ${brand}` : ''}</h2><span class="tiny faint">{data.report.posts} videos · {relTime(data.report.created_at)}</span></div>
          <p class="small" style={{ margin: '10px 0' }}>{rep.summary}</p>
          {rep.patterns?.length > 0 && (
            <div class="col" style={{ gap: 6, marginBottom: 10 }}>
              {rep.patterns.map((p, i) => (
                <div key={i} class="row small" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <span class={`pill ${p.effect === 'helps' ? 'good' : p.effect === 'hurts' ? 'bad' : ''}`} style={{ flex: 'none' }}>{p.effect === 'helps' ? 'Helps' : p.effect === 'hurts' ? 'Hurts' : 'Unclear'}</span>
                  <span><b>{p.pattern}</b> <span class="muted">— {p.evidence}</span></span>
                </div>
              ))}
            </div>
          )}
          <div class="grid2">
            <div><div class="label">Keep doing</div><ul class="small tight">{(rep.keep_doing || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div><div class="label">Stop doing</div><ul class="small tight">{(rep.stop_doing || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </div>
          {rep.try_next?.length > 0 && (<><div class="label" style={{ marginTop: 8 }}>Hooks to try next</div><ul class="small tight">{rep.try_next.map((x, i) => <li key={i}>“{x}”</li>)}</ul></>)}
        </section>
      )}

      {loading && !data ? <div class="empty"><Spinner /></div> : !hooks.length ? (
        <div class="card"><Empty icon="chart" title="No published videos yet">Once reels and Shorts go out, each one's hook appears here with how many viewers it held.</Empty></div>
      ) : (
        <section class="card">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Hook</th><th class="r">Hook score</th><th class="r hide-sm">Avg watched</th><th class="r">Views</th><th class="r hide-sm">vs usual</th></tr></thead>
              <tbody>
                {hooks.map((h) => (
                  <tr key={h.id} style={{ cursor: 'pointer' }} onClick={() => openPost(h.id)}>
                    <td>
                      <div class="row" style={{ alignItems: 'flex-start' }}>
                        {h.thumb ? <img src={h.thumb} alt="" style={{ width: 30, height: 40, objectFit: 'cover', borderRadius: 6, flex: 'none' }} /> : <span style={{ width: 30 }} />}
                        <div style={{ minWidth: 0 }}>
                          <div class="small" style={{ fontWeight: 600 }}>{h.hook || <span class="faint">(no hook text)</span>}</div>
                          <div class="row tiny faint" style={{ gap: 5 }}><PfMark platform={h.platform} size={12} />@{h.account} · {relTime(h.published_at)}{h.duration_s ? ` · ${Math.round(h.duration_s)}s` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td class="r">{h.score != null ? <span class={`pill ${scoreClass(h.score)}`}>{h.score}</span> : <span class="tiny faint">pending</span>}
                      <div class="tiny faint">{h.skip_rate != null ? `skip ${h.skip_rate}%` : h.hold_3s != null ? `held ${h.hold_3s}% at 3s` : ''}</div></td>
                    <td class="r hide-sm">{h.avg_view_pct != null ? `${h.avg_view_pct}%` : h.avg_watch_s != null ? `${h.avg_watch_s}s` : '—'}</td>
                    <td class="r"><b>{fmtNum(h.views)}</b></td>
                    <td class="r hide-sm">{h.views_vs_median != null ? `${h.views_vs_median}×` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {scored.length === 0 && <p class="tiny faint" style={{ margin: 10 }}>Hook scores fill in once Instagram/YouTube report skip rate or retention for these videos.</p>}
        </section>
      )}
    </>
  );
}

// ======================= Audience =======================
function AccountAudience({ acct, items }) {
  const aud = items.find((i) => i.kind === 'audience');
  const daily = items.find((i) => i.kind === 'daily');
  const d = aud?.data || {};
  const err = aud?.error || daily?.error;
  const yt = acct.platform === 'youtube';
  const f = d.followers || {};
  const days = (daily?.data?.days || []).filter((r) => r.day);
  const pts = (key) => days.map((r) => ({ x: new Date(`${r.day}T12:00:00Z`).getTime(), y: r[key] ?? null }));
  return (
    <section class="card pad" style={{ marginBottom: 14 }}>
      <div class="row" style={{ marginBottom: 10 }}>
        <Avatar src={acct.avatar} name={acct.username} platform={acct.platform} size={30} />
        <div class="grow"><b>@{acct.username}</b> <span class="tiny faint">{PF[acct.platform]?.label}{acct.brand ? ` · ${acct.brand}` : ''} · {fmtNum(acct.followers_count)} {yt ? 'subscribers' : 'followers'}</span></div>
        {aud && <span class="tiny faint">updated {relTime(aud.fetched_at)}</span>}
      </div>
      {err && /reconnect|scope|insufficient|not been used|disabled|accessNotConfigured/i.test(err) && (
        <div class="notice warn small" style={{ marginBottom: 10 }}><Icon name="alert" size={15} /><span>{yt ? 'Reconnect this channel once (Accounts → Reconnect) and make sure the "YouTube Analytics API" is enabled in your Google Cloud project.' : 'Instagram did not return insights for this account.'} <span class="faint">({err.slice(0, 160)})</span></span></div>
      )}
      {days.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <div class="label">{yt ? 'Daily views (last 30 days)' : 'Daily reach (last 30 days)'}</div>
          <LineChart series={[{ key: 'v', label: yt ? 'Views' : 'Reach', color: 'var(--series-total)', points: pts(yt ? 'views' : 'reach') }]} area height={160}
            xFmt={(x, long) => fmtDate(new Date(x), long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' })} ariaLabel={`Daily ${yt ? 'views' : 'reach'} for @${acct.username}`} />
          {yt && <p class="tiny faint" style={{ margin: '4px 0 0' }}>Net subscribers in 30 days: <b>{fmtNum(days.reduce((n, r) => n + (r.subs || 0), 0))}</b> · watch time {fmtNum(days.reduce((n, r) => n + (r.watch_min || 0), 0))} min</p>}
        </div>
      )}
      {yt ? (
        <div class="aud-grid">
          <div><div class="label">Age</div><HBars rows={d.age} /></div>
          <div><div class="label">Gender</div><HBars rows={(d.gender || []).map((g) => ({ ...g, label: nice(g.key) }))} /></div>
          <div><div class="label">Top countries (views)</div><HBars rows={(d.country || []).slice(0, 8).map((c) => ({ ...c, label: countryName(c.key) }))} fmt={fmtNum} /></div>
          <div><div class="label">Where views come from</div><HBars rows={(d.traffic || []).slice(0, 8).map((t) => ({ ...t, label: TRAFFIC[t.key] || nice(t.key) }))} fmt={fmtNum} /></div>
        </div>
      ) : acct.platform === 'tiktok' ? (
        <p class="small muted" style={{ margin: 0 }}>TikTok doesn't share audience demographics through its API — see them in the TikTok app (Creator tools → Analytics).</p>
      ) : !aud ? (
        <p class="small muted" style={{ margin: 0 }}>Not fetched yet — tap <b>Refresh now</b> at the top.</p>
      ) : d.locked && (acct.followers_count ?? 0) < 100 ? (
        <p class="small muted" style={{ margin: 0 }}>Age, gender, country, city and the hours your followers are online unlock on Instagram once the account has <b>100 followers</b> (currently {fmtNum(acct.followers_count)}).</p>
      ) : d.locked ? (
        <p class="small muted" style={{ margin: 0 }}>Instagram hasn't returned audience details for this account yet (they can take up to 48 hours). Postroom checks again twice a day.</p>
      ) : (
        <>
          <div class="aud-grid">
            <div><div class="label">Age</div><HBars rows={[...(f.age || [])].sort((a, b) => String(a.key).localeCompare(String(b.key)))} fmt={fmtNum} /></div>
            <div><div class="label">Gender</div><HBars rows={(f.gender || []).map((g) => ({ ...g, label: g.key === 'M' ? 'Male' : g.key === 'F' ? 'Female' : 'Unknown' }))} fmt={fmtNum} /></div>
            <div><div class="label">Top countries</div><HBars rows={(f.country || []).slice(0, 8).map((c) => ({ ...c, label: countryName(c.key) }))} fmt={fmtNum} /></div>
            <div><div class="label">Top cities</div><HBars rows={(f.city || []).slice(0, 8)} fmt={fmtNum} /></div>
          </div>
          {d.online_hours_utc && <div style={{ marginTop: 12 }}><div class="label">When your followers are online</div><HourStrip hoursUtc={d.online_hours_utc} /></div>}
        </>
      )}
    </section>
  );
}

export function AudienceTab() {
  const { accounts } = useApp();
  const { data, loading } = useAsync(() => api('analytics/accounts'), []);
  if (loading && !data) return <div class="empty"><Spinner /></div>;
  const list = accounts.filter((a) => a.status === 'active');
  if (!list.length) return <div class="card"><Empty icon="users" title="No accounts">Connect an account first.</Empty></div>;
  return (
    <>
      <p class="small muted" style={{ marginTop: 0 }}>Audience refreshes twice a day, daily charts every 3 hours. Tap <b>Refresh now</b> at the top to pull everything immediately.</p>
      {list.map((a) => <AccountAudience key={a.id} acct={{ ...a, avatar: a.profile_picture_url, brand: a.brand?.name }} items={(data || []).filter((i) => i.account_id === a.id)} />)}
    </>
  );
}

// ======================= Post growth & retention (used in the post drawer) =======================
export function PostGrowth({ id, platform }) {
  const { data } = useAsync(() => api(`analytics/posts/${id}`), [id]);
  if (!data) return null;
  const pts = (data.points || []).filter((p) => p.views != null && p.hours != null).map((p) => ({ x: Math.round(p.hours * 10) / 10, y: p.views }));
  const ret = (data.retention || []).map(([x, y]) => ({ x: Math.round(x * 100), y: Math.round(y * 1000) / 10 }));
  const ins = data.insights || {};
  const chips = [
    ins.skip_rate != null && ['Skip rate (first 3 s)', `${ins.skip_rate}%`],
    ins.hold_3s != null && ['Still watching at 3 s', `${ins.hold_3s}%`],
    ins.avg_watch_s != null && ['Avg watch time', `${ins.avg_watch_s}s`],
    ins.avg_view_pct != null && ['Avg % watched', `${ins.avg_view_pct}%`],
    ins.subs_gained != null && ['Subscribers gained', fmtNum(ins.subs_gained)],
    ins.interactions != null && ['Interactions', fmtNum(ins.interactions)],
  ].filter(Boolean);
  if (!pts.length && !ret.length && !chips.length) return null;
  return (
    <div class="col" style={{ gap: 12 }}>
      {chips.length > 0 && <div class="kv-chips">{chips.map(([k, v]) => <div key={k} class="kv-chip"><span class="tiny faint">{k}</span><b>{v}</b></div>)}</div>}
      {pts.length > 1 && (
        <div><div class="label">Views since publishing</div>
          <LineChart series={[{ key: 'v', label: 'Views', color: 'var(--series-total)', points: pts }]} area width={440} height={170} xFmt={(x) => (x < 48 ? `${Math.round(x)}h` : `${Math.round(x / 24)}d`)} ariaLabel="Views since publishing" /></div>
      )}
      {ret.length > 1 && (
        <div><div class="label">Audience retention{platform === 'youtube' ? ' (YouTube)' : ''}</div>
          <LineChart series={[{ key: 'r', label: 'Still watching', color: 'var(--series-total)', points: ret }]} area width={440} height={170} yMax={Math.max(100, ...ret.map((p) => p.y))}
            xFmt={(x) => `${x}%`} yFmt={(y) => `${Math.round(y)}%`} ariaLabel="Share of viewers still watching through the video" />
          <p class="tiny faint" style={{ margin: '4px 0 0' }}>Across the video's length (0–100%). Above 100% means people rewatched.</p></div>
      )}
    </div>
  );
}
