import { useState, useEffect } from 'preact/hooks';
import { api, fmtNum, fmtDur, relTime } from '../api.js';
import { useApp, useAsync, Icon, Seg, Empty, Spinner, Drawer, PfMark, CopyField } from '../ui.jsx';

const SOURCE = { 'ig-research': { label: 'Instagram research', pf: 'instagram' }, youtube: { label: 'YouTube channel', pf: 'youtube' }, 'instagram-api': { label: 'Instagram account', pf: 'instagram' }, 'video-lab': { label: 'Videos you sent for analysis', pf: 'youtube' } };

function Section({ title, children }) {
  if (!children) return null;
  return (
    <div>
      <div class="label" style={{ marginBottom: 6 }}>{title}</div>
      <div class="small" style={{ lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}
const KV = ({ k, v }) => (v ? <div><b>{k}:</b> {v}</div> : null);

function ResearchDrawer({ id, onClose }) {
  const { go, toast, accounts } = useApp();
  const [busy, setBusy] = useState(false);
  const brands = [...new Set(accounts.map((a) => a.brand?.name).filter(Boolean))];
  const [brand, setBrand] = useState('');
  const saveRef = async (r) => {
    const tags = prompt('Save as a reference. Tags (comma separated), e.g. hook, pacing, thumbnail:', 'hook');
    if (tags === null) return;
    try {
      await api('planner/refs', { method: 'POST', body: { research_post_id: r.id, tags, note: typeof r.teardown?.hook === 'string' ? r.teardown.hook : null } });
      toast('Saved to Planner → References');
    } catch (e) { toast(e.message, 'bad'); }
  };
  const { data: r, loading, reload } = useAsync(() => api(`research/posts/${id}`), [id]);
  const analyze = async () => {
    setBusy(true);
    try { await api(`research/posts/${id}/analyze`, { method: 'POST', body: { brand: brand || null } }); await reload(); toast('Claude broke it down'); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const [showTx, setShowTx] = useState(false);
  if (loading || !r) return <Drawer onClose={onClose} title="Research"><Spinner /></Drawer>;
  const t = r.teardown || {};
  const m = r.measure || {};
  return (
    <Drawer
      onClose={onClose}
      title={<div class="row"><PfMark platform={r.platform} size={22} /><div class="col" style={{ gap: 0 }}><b>@{r.author}</b><span class="tiny muted">{r.type} · {r.project}</span></div></div>}
      foot={
        <>
          <button class="btn primary" onClick={() => { onClose(); go(`compose?idea=${r.id}`); }}><Icon name="sparkle" size={16} /> Make a post like this</button>
          <button class="btn" onClick={() => saveRef(r)}><Icon name="board" size={16} /> Save as reference</button>
          {r.url && <a class="btn" href={r.url} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> Open original</a>}
        </>
      }
    >
      <div class="col" style={{ gap: 16 }}>
        <div class="row" style={{ alignItems: 'flex-start', gap: 14 }}>
          {r.thumb_url && <img src={r.thumb_url} alt="" style={{ width: 120, borderRadius: 12, objectFit: 'cover', aspectRatio: '4/5' }} />}
          <div class="acct-card grow" style={{ padding: 0 }}>
            <div class="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div class="stat"><b class="num">{fmtNum(r.views)}</b><span>views</span></div>
              <div class="stat"><b class="num">{fmtNum(r.likes)}</b><span>likes</span></div>
              <div class="stat"><b class="num">{fmtNum(r.comments)}</b><span>comments</span></div>
              <div class="stat"><b class="num">{m.cuts_per_10_seconds != null ? m.cuts_per_10_seconds.toFixed?.(1) ?? m.cuts_per_10_seconds : '—'}</b><span>cuts / 10s</span></div>
            </div>
            <div class="tiny faint" style={{ marginTop: 6 }}>{r.posted_at ? `Posted ${relTime(r.posted_at)}` : ''}{r.duration_s ? ` · ${fmtDur(Number(r.duration_s))}` : ''}{r.model ? ` · teardown by ${r.model}` : ''}</div>
          </div>
        </div>

        {m.frames ? (
          <div class="row wrap" style={{ gap: 8 }}>
            <select class="select" style={{ width: 'auto' }} value={brand} onChange={(e) => setBrand(e.currentTarget.value)} aria-label="Adapt for brand"><option value="">Adapt for: best fit</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select>
            <button class="btn primary sm" disabled={busy} onClick={analyze}>{busy ? <Spinner /> : <Icon name="sparkle" size={14} />} {r.teardown ? 'Break it down again' : 'Break it down with Claude'}</button>
            {busy && <span class="tiny faint">About a minute…</span>}
          </div>
        ) : !r.teardown && <div class="notice info"><Icon name="sparkle" size={16} /><span>No breakdown yet. On your computer run <code>node postroom.mjs grab {r.url || '<link>'}</code> — it downloads the video, measures it and has Claude break it down.</span></div>}

        {t.idea && <Section title="Idea"><KV k="Topic" v={t.idea.topic} /><KV k="Angle" v={t.idea.angle} /><KV k="Format" v={t.idea.format} /><KV k="Why it works" v={t.idea.why_it_works} /></Section>}
        {t.hook && (
          <Section title={`Hook${t.hook.hook_type ? ` · ${t.hook.hook_type}` : ''}`}>
            <KV k="Said" v={t.hook.first_3s_spoken && `"${t.hook.first_3s_spoken}"`} /><KV k="On screen" v={t.hook.first_3s_onscreen_text} /><KV k="Visual" v={t.hook.first_3s_visual} /><KV k="Why it stops the scroll" v={t.hook.why_it_stops_scroll} />
          </Section>
        )}
        {t.script?.structure?.length > 0 && (
          <Section title={`Structure${t.script.words_per_minute ? ` · ${t.script.words_per_minute} wpm` : ''}`}>
            <ol style={{ margin: 0, paddingLeft: 18 }}>{t.script.structure.map((b, i) => <li key={i}><b>{b.beat}</b> <span class="faint">{b.start}–{b.end}</span> — {b.summary}</li>)}</ol>
            {t.script.cta && <div style={{ marginTop: 6 }}><b>CTA:</b> {t.script.cta}</div>}
          </Section>
        )}
        {t.edit && <Section title="Edit"><KV k="Pacing" v={t.edit.pacing_notes} /><KV k="Captions" v={t.edit.caption_style} /><KV k="Graphics" v={t.edit.graphics_and_motion?.join(', ')} /></Section>}
        {t.sound && <Section title="Sound"><KV k="Music" v={t.sound.music && [t.sound.music.mood, t.sound.music.genre, t.sound.music.energy_curve].filter(Boolean).join(' · ')} /><KV k="Voice" v={t.sound.voice && [t.sound.voice.tone, t.sound.voice.pace].filter(Boolean).join(' · ')} /><KV k="Mix" v={t.sound.mix_notes} /></Section>}
        {t.replicate?.recipe_steps?.length > 0 && (
          <Section title={`Recipe${t.replicate.difficulty ? ` · ${t.replicate.difficulty}` : ''}`}>
            <ol style={{ margin: 0, paddingLeft: 18 }}>{t.replicate.recipe_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            {t.replicate.how_it_clicks_adaptation && <div style={{ marginTop: 6 }}><b>Your adaptation:</b> {t.replicate.how_it_clicks_adaptation}</div>}
          </Section>
        )}
        {t.retention && <Section title="Retention"><KV k="Why people keep watching" v={t.retention.why_people_keep_watching} /><KV k="Where they probably drop" v={t.retention.where_people_probably_drop} /><KV k="Ending / loop" v={t.retention.loop_or_ending} /></Section>}
        {t.packaging && <Section title="Packaging"><KV k="Title" v={t.packaging.title} /><KV k="Thumbnail / cover" v={t.packaging.thumbnail_or_cover} /><KV k="Caption" v={t.packaging.caption} /></Section>}
        {m.frames && (
          <Section title="Frames">
            <div class="col" style={{ gap: 8 }}>
              {[['hook', 'First 3 seconds'], ['shots', 'One frame per shot'], ['overview', 'Whole video']].map(([k, l]) => m.frames[k] && (
                <a key={k} href={m.frames[k]} target="_blank" rel="noreferrer"><div class="tiny faint">{l}</div><img src={m.frames[k]} alt={l} loading="lazy" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)' }} /></a>
              ))}
            </div>
          </Section>
        )}
        {m.shot_count != null && m.frames && <Section title="Measured"><span class="faint">{[`${m.shot_count} shots`, m.cuts_per_10_seconds != null && `${m.cuts_per_10_seconds} cuts / 10s`, m.avg_shot_seconds != null && `avg shot ${m.avg_shot_seconds}s`, m.first_cut_seconds != null && `first cut at ${m.first_cut_seconds}s`, m.cuts_in_first_3_seconds != null && `${m.cuts_in_first_3_seconds} cuts in first 3s`, m.first_sound_seconds != null && `sound from ${m.first_sound_seconds}s`, m.integrated_lufs != null && `${m.integrated_lufs} LUFS`, m.width && `${m.width}×${m.height}`].filter(Boolean).join(' · ')}</span></Section>}
        {!m.frames && (m.integrated_lufs != null || m.bpm) && <Section title="Measured"><span class="faint">{[m.shot_count && `${m.shot_count} shots`, m.cuts_in_first_3_seconds != null && `${m.cuts_in_first_3_seconds} cuts in first 3s`, m.integrated_lufs != null && `${m.integrated_lufs} LUFS`, m.bpm && `${Math.round(m.bpm)} BPM`].filter(Boolean).join(' · ')}</span></Section>}
        {r.caption && <Section title="Caption"><div style={{ whiteSpace: 'pre-wrap' }}>{r.caption}</div></Section>}
        {r.transcript && (
          <div>
            <button class="btn ghost sm" onClick={() => setShowTx(!showTx)}>{showTx ? 'Hide' : 'Show'} transcript</button>
            {showTx && <div class="small" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{r.transcript}</div>}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function ChannelAnalysis({ a }) {
  return (
    <div class="col" style={{ gap: 12, marginTop: 10 }}>
      <p class="small" style={{ margin: 0 }}>{a.summary}</p>
      {a.positioning && <Section title="Positioning">{a.positioning}</Section>}
      {a.content_pillars?.length > 0 && (
        <Section title="Content pillars">
          <ul class="tight" style={{ margin: 0 }}>{a.content_pillars.map((x, i) => <li key={i}><b>{x.pillar}</b> <span class="faint">· {x.share_of_posts} · median {x.median_views}</span>{x.examples?.length ? <div class="faint">{x.examples.slice(0, 3).join(' · ')}</div> : null}</li>)}</ul>
        </Section>
      )}
      <div class="grid2">
        <Section title="What performs">{a.what_performs?.length ? <ul class="tight" style={{ margin: 0 }}>{a.what_performs.map((x, i) => <li key={i}><b>{x.pattern}</b> <span class="muted">— {x.evidence}</span></li>)}</ul> : null}</Section>
        <Section title="What flops">{a.what_flops?.length ? <ul class="tight" style={{ margin: 0 }}>{a.what_flops.map((x, i) => <li key={i}><b>{x.pattern}</b> <span class="muted">— {x.evidence}</span></li>)}</ul> : null}</Section>
      </div>
      <div class="grid2">
        {a.titles_and_packaging && <Section title="Titles & packaging">{a.titles_and_packaging}</Section>}
        {a.hooks && <Section title="Hooks">{a.hooks}</Section>}
        {a.formats_and_length && <Section title="Formats & length">{a.formats_and_length}</Section>}
        {a.cadence && <Section title="Cadence">{a.cadence}</Section>}
      </div>
      {a.opportunities_for_us?.length > 0 && (
        <Section title="Opportunities for us">
          <ol style={{ margin: 0, paddingLeft: 18 }}>{a.opportunities_for_us.map((x, i) => <li key={i}><b>{x.idea}</b> <span class="pill tiny">{x.for_brand}</span><div class="muted">{x.why}</div></li>)}</ol>
        </Section>
      )}
      {a.caveats && <p class="tiny faint" style={{ margin: 0 }}><b>Keep in mind:</b> {a.caveats}</p>}
    </div>
  );
}

function YoutubeLookup({ onDone }) {
  const { toast, accounts } = useApp();
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const hasYt = accounts.some((a) => a.platform === 'youtube' && a.status === 'active');
  const go = async () => {
    setBusy(true);
    try {
      const r = await api('research/youtube', { method: 'POST', body: { channel: v } });
      toast(`Analysed ${r.name}: ${r.videos} videos`);
      setV('');
      onDone(r.project_id);
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="row" style={{ maxWidth: 420 }}>
      <input class="input" placeholder={hasYt ? 'YouTube @handle or channel URL' : 'Connect a YouTube account to look up channels'} disabled={!hasYt} value={v} onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && v && go()} />
      <button class="btn" disabled={!v || busy || !hasYt} onClick={go}>{busy ? <Spinner /> : <PfMark platform="youtube" size={16} />} Analyse</button>
    </div>
  );
}

export default function Research({ params = {} }) {
  const { config, toast, accounts } = useApp();
  const projects = useAsync(() => api('research/projects'), []);
  const [pid, setPid] = useState(params.project || null);
  const [tab, setTab] = useState('library');
  const [f, setF] = useState({ q: '', author: '', hook_type: '', sort: 'views' });
  const [open, setOpen] = useState(params.post || null);
  const [chBusy, setChBusy] = useState(false);
  const brands = [...new Set(accounts.map((a) => a.brand?.name).filter(Boolean))];
  const [chBrand, setChBrand] = useState('');
  useEffect(() => { if (!pid && projects.data?.length) setPid(projects.data[0].id); }, [projects.data]);
  const ov = useAsync(() => (pid ? api(`research/projects/${pid}`) : Promise.resolve(null)), [pid]);
  const posts = useAsync(() => (pid ? api('research/posts', { query: { project_id: pid, ...f, limit: 120 } }) : Promise.resolve([])), [pid, JSON.stringify(f)]);
  const analyzeChannel = async () => {
    setChBusy(true);
    try { await api(`research/projects/${pid}/analyze`, { method: 'POST', body: { brand: chBrand || null } }); await ov.reload(); toast('Claude analysed the channel'); } catch (e) { toast(e.message, 'bad'); } finally { setChBusy(false); }
  };

  const head = (
    <div class="page-head">
      <h1>Research</h1>
      <span class="pill info">Extension</span>
      <span class="sub">Understand any niche or account, then turn what works into your own posts.</span>
      <div class="grow" />
      <YoutubeLookup onDone={(id) => { projects.reload(); setPid(id); }} />
    </div>
  );

  if (projects.loading) return <>{head}<Spinner /></>;
  if (!projects.data?.length) {
    return (
      <>
        {head}
        <div class="card pad">
          <Empty icon="layers" title="No research yet">
            Paste a YouTube @handle above to analyse any channel right now, or push Instagram research from the ig-research toolkit on your Mac.
          </Empty>
          <div class="divider" />
          <h2>Connect the ig-research toolkit</h2>
          <ol class="setup-steps">
            <li>{config.research?.key_set ? <>Your <code>RESEARCH_KEY</code> is set in Vercel. ✓</> : <>Add <code>RESEARCH_KEY</code> (any long random string) in Vercel → Environment Variables and redeploy.</>}</li>
            <li>On your Mac, in <code>postroom/extensions/ig-research</code>: <code>npm install</code>.</li>
            <li>Set <code>POSTROOM_URL</code> and <code>POSTROOM_RESEARCH_KEY</code> in your shell, run a scrape, then <code>npm run push -- &lt;project&gt;</code>.</li>
          </ol>
          {config.research && <div style={{ marginTop: 10, maxWidth: 560 }}><div class="label" style={{ marginBottom: 4 }}>Ingest URL</div><CopyField value={config.research.ingest_url} /></div>}
        </div>
      </>
    );
  }

  const o = ov.data;
  const p = o?.project;
  return (
    <>
      {head}
      <div class="row wrap" style={{ marginBottom: 14 }}>
        {projects.data.map((x) => (
          <button key={x.id} class={`chip-filter ${pid === x.id ? 'on' : ''}`} onClick={() => setPid(x.id)} style={{ height: 34 }}>
            <PfMark platform={SOURCE[x.source]?.pf || 'instagram'} size={16} /> {x.name} <span class="faint">{x.posts}</span>
          </button>
        ))}
      </div>
      {!o ? <Spinner /> : (
        <>
          <div class="kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            <div class="card kpi"><div class="k">Posts studied</div><div class="v num">{fmtNum(o.stats.posts)}</div><span class="tiny faint">{p.niche || SOURCE[p.source]?.label}</span></div>
            <div class="card kpi"><div class="k">{p.source === 'youtube' ? 'Subscribers' : 'Creators'}</div><div class="v num">{fmtNum(p.source === 'youtube' ? p.meta.subscribers : o.stats.creators)}</div><span class="tiny faint">{p.scraped_at ? `Updated ${relTime(p.scraped_at)}` : ''}</span></div>
            <div class="card kpi"><div class="k">Median views</div><div class="v num">{fmtNum(o.stats.median_views)}</div><span class="tiny faint">median likes {fmtNum(o.stats.median_likes)}</span></div>
            <div class="card kpi"><div class="k">Teardowns</div><div class="v num">{o.stats.teardowns}</div><span class="tiny faint">{o.hooks[0]?.hook_type ? `Best hook: ${o.hooks[0].hook_type}` : 'Hook, script, edit & sound breakdowns'}</span></div>
          </div>

          {p.source !== 'video-lab' && (
            <section class="card pad" style={{ marginBottom: 14 }}>
              <div class="row wrap" style={{ gap: 8 }}>
                <h2 class="row grow" style={{ margin: 0, gap: 6 }}><Icon name="sparkle" size={16} /> Channel analysis</h2>
                {p.meta?.analyzed_at && <span class="tiny faint">{relTime(p.meta.analyzed_at)}{p.meta.analysis_brand ? ` · for ${p.meta.analysis_brand}` : ''}</span>}
                <select class="select" style={{ width: 'auto' }} value={chBrand} onChange={(e) => setChBrand(e.currentTarget.value)} aria-label="For brand"><option value="">For: all our brands</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select>
                <button class="btn primary sm" disabled={chBusy || o.stats.posts < 3} onClick={analyzeChannel}>{chBusy ? <Spinner /> : <Icon name="sparkle" size={14} />} {p.meta?.analysis ? 'Analyse again' : 'Analyse this channel'}</button>
              </div>
              {chBusy && <p class="tiny faint">Claude is reading every post — about a minute…</p>}
              {p.meta?.analysis ? <ChannelAnalysis a={p.meta.analysis} /> : <p class="small muted" style={{ marginBottom: 0 }}>Claude reads every post's numbers (and any video breakdowns) and tells you what this channel does, what works, what flops and what we can borrow. For the deepest read, run <code>node postroom.mjs grab {p.source === 'youtube' ? `https://www.youtube.com/${p.name}` : `https://www.instagram.com/${p.name.replace(/^@/, '')}/`}</code> on your computer: it also downloads and breaks down the top videos.</p>}
            </section>
          )}

          <div class="cal-toolbar">
            <Seg value={tab} onChange={setTab} options={[{ value: 'library', label: 'Library' }, { value: 'creators', label: 'Creators' }, { value: 'hooks', label: 'Hooks & formats' }]} />
            <div class="grow" />
            {tab === 'library' && (
              <>
                <input class="input" style={{ width: 220 }} placeholder="Search captions, transcripts…" value={f.q} onInput={(e) => setF({ ...f, q: e.currentTarget.value })} />
                {o.creators.length > 1 && <select class="select" style={{ width: 170 }} value={f.author} onChange={(e) => setF({ ...f, author: e.currentTarget.value })}><option value="">All creators</option>{o.creators.map((c) => <option key={c.author} value={c.author}>@{c.author}</option>)}</select>}
                {o.hooks.length > 0 && <select class="select" style={{ width: 170 }} value={f.hook_type} onChange={(e) => setF({ ...f, hook_type: e.currentTarget.value })}><option value="">All hooks</option>{o.hooks.filter((h) => h.hook_type).map((h) => <option key={h.hook_type} value={h.hook_type}>{h.hook_type}</option>)}</select>}
                <Seg value={f.sort} onChange={(v) => setF({ ...f, sort: v })} options={[{ value: 'views', label: 'Views' }, { value: 'likes', label: 'Likes' }, { value: 'recent', label: 'Recent' }, { value: 'pace', label: 'Pace' }]} />
              </>
            )}
          </div>

          {tab === 'library' && (posts.loading && !posts.data ? <Spinner /> : !posts.data?.length ? <div class="card"><Empty icon="layers" title="Nothing matches">Try clearing the filters.</Empty></div> : (
            <div class="lib-grid">
              {posts.data.map((r) => (
                <button key={r.id} class="lib-item" style={{ border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setOpen(r.id)}>
                  {r.thumb_url ? <img src={r.thumb_url} alt="" loading="lazy" /> : <span />}
                  {r.hook_type && <span class="pill" style={{ position: 'absolute', top: 8, left: 8, background: 'rgb(0 0 0 / .6)', color: '#fff' }}>{r.hook_type}</span>}
                  <div class="info">
                    <div style={{ minWidth: 0 }}>
                      <div class="ellipsis" style={{ fontWeight: 650 }}>@{r.author}</div>
                      <div class="ellipsis">{r.topic || r.hook_line || (r.caption || '').split('\n')[0]}</div>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <div style={{ fontWeight: 700 }}>{fmtNum(r.views ?? r.likes)}</div>
                      <div style={{ opacity: 0.8 }}>{r.views != null ? 'views' : 'likes'}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))}

          {tab === 'creators' && (
            <div class="card table-wrap">
              <table class="table">
                <thead><tr><th>Creator</th><th class="r">Posts</th><th class="r">Median views</th><th class="r">Best</th><th class="r">Avg likes</th><th>Top hook</th></tr></thead>
                <tbody>
                  {o.creators.map((c) => (
                    <tr key={c.author} style={{ cursor: 'pointer' }} onClick={() => { setF({ ...f, author: c.author }); setTab('library'); }}>
                      <td><b>@{c.author}</b></td><td class="r">{c.posts}</td><td class="r">{fmtNum(c.median_views)}</td><td class="r">{fmtNum(c.best_views)}</td><td class="r">{fmtNum(c.avg_likes)}</td><td>{c.top_hook ? <span class="pill">{c.top_hook}</span> : <span class="faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'hooks' && (
            <div class="an-grid">
              <section class="card pad">
                <h2>Hook types by median views</h2>
                {!o.hooks.length ? <p class="small muted">Hooks come from teardowns. Run <code>npm run teardown</code> in ig-research and push again.</p> : o.hooks.map((h) => (
                  <div class="hbar" key={h.hook_type || 'none'} style={{ gridTemplateColumns: '150px 1fr 90px' }}>
                    <span class="small ellipsis">{h.hook_type || 'Unlabelled'}</span>
                    <span class="track"><span class="fill" style={{ display: 'block', width: `${(h.median_views / Math.max(1, o.hooks[0].median_views || 1)) * 100}%`, background: 'var(--series-total)' }} /></span>
                    <span class="small num" style={{ textAlign: 'right' }}><b>{fmtNum(h.median_views)}</b> <span class="faint">· {h.posts}</span></span>
                  </div>
                ))}
              </section>
              <section class="card pad">
                <h2>Formats</h2>
                {!o.formats.length ? <p class="small muted">No teardowns yet.</p> : (
                  <table class="table"><tbody>{o.formats.map((x) => <tr key={x.format}><td>{x.format || 'Unlabelled'}</td><td class="r">{x.posts}</td></tr>)}</tbody></table>
                )}
              </section>
            </div>
          )}
        </>
      )}
      {open && <ResearchDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
