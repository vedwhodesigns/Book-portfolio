import { useState, useEffect, useRef } from 'preact/hooks';
import { api, relTime } from '../api.js';
import { useApp, Icon, Spinner, PfMark } from '../ui.jsx';

const OPEN = ['queued', 'reading', 'writing'];
const pfOf = (url) => (/youtu/.test(url) ? 'youtube' : /tiktok/.test(url) ? 'tiktok' : 'instagram');
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

function JobCard({ j, onChange }) {
  const { toast, go } = useApp();
  const open = OPEN.includes(j.status);
  const report = async (share) => {
    try {
      const full = await api(`lab/jobs/${j.id}`);
      if (share && navigator.share) await navigator.share({ title: `Video Lab → ${j.brand}`, text: full.handoff });
      else { await navigator.clipboard.writeText(full.handoff); toast(`Report copied. Paste it into any chat`); }
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
  };
  const retry = async () => { try { await api(`lab/jobs/${j.id}/retry`, { method: 'POST' }); onChange(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <div class={`lab-job ${j.status}`}>
      <div class="lab-job-top">
        {j.thumb_url ? <img src={j.thumb_url} alt="" /> : <span class="lab-job-ph"><PfMark platform={pfOf(j.url)} size={22} /></span>}
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="lab-job-title">{j.topic || (j.author ? `@${j.author}` : j.url.replace(/^https:\/\/(www\.)?/, ''))}</div>
          <div class="tiny faint">{j.brand} · {relTime(j.created_at)}</div>
          <div class={`small ${j.status === 'failed' ? 'bad-text' : 'muted'}`} style={{ marginTop: 4 }}>
            {open && <Spinner />} {j.status === 'failed' ? j.error || 'Failed' : j.status === 'done' ? 'Report ready' : j.step || 'Waiting to start'}
          </div>
        </div>
      </div>
      {j.status === 'done' && (
        <div class="lab-job-actions">
          <button class="btn primary sm" onClick={() => go(`research?post=${j.research_post_id}`)}><Icon name="sparkle" size={14} /> Read</button>
          <button class="btn sm" onClick={() => report(false)}><Icon name="copy" size={14} /> Copy report</button>
          {typeof navigator !== 'undefined' && navigator.share && <button class="btn sm icon" aria-label="Share report" onClick={() => report(true)}><Icon name="send" size={14} /></button>}
          {j.video_url && <a class="btn sm icon" aria-label="Download video" href={j.video_url} download target="_blank" rel="noreferrer"><Icon name="download" size={14} /></a>}
        </div>
      )}
      {j.status === 'failed' && <div class="lab-job-actions"><button class="btn sm" onClick={retry}><Icon name="refresh" size={14} /> Try again</button></div>}
    </div>
  );
}

export default function Lab({ params = {} }) {
  const { accounts, toast } = useApp();
  const brands = [...new Set(accounts.map((a) => a.brand?.name).filter(Boolean))];
  const [link, setLink] = useState(params.url || '');
  const [brand, setBrand] = useState(store.get('lab-brand') || '');
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState(null);
  const nudged = useRef(0);
  const load = async () => {
    try {
      const list = await api('lab/jobs', { query: { limit: 30 } });
      setJobs(list);
      // the server starts jobs itself; if one looks stuck while this page is open, give it a push
      const stale = list.some((j) => OPEN.includes(j.status) && Date.now() - new Date(j.updated_at) > 60000);
      if (stale && Date.now() - nudged.current > 60000) { nudged.current = Date.now(); api('lab/run', { method: 'POST' }).catch(() => {}); }
    } catch (e) { toast(e.message, 'bad'); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.url) setLink(params.url); }, [params.url]);
  const anyOpen = jobs?.some((j) => OPEN.includes(j.status));
  useEffect(() => {
    if (!anyOpen) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 4000);
    return () => clearInterval(t);
  }, [anyOpen]);
  const paste = async () => { try { setLink(await navigator.clipboard.readText()); } catch { toast('Long-press the box and paste', 'bad'); } };
  const start = async () => {
    if (!brand) { toast('Choose the channel first', 'bad'); return; }
    setBusy(true);
    try {
      await api('lab/jobs', { method: 'POST', body: { url: link, brand } });
      store.set('lab-brand', brand);
      setLink('');
      toast(`Started. The report for ${brand} is ready in a few minutes`);
      load();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <>
      <div class="page-head"><h1>Video Lab</h1><span class="sub">Paste a reel or video link. Postroom downloads it, Claude studies it, and you get a report for your channel.</span></div>
      <div class="lab-page">
        <section class="card pad lab-new">
          <div class="row" style={{ gap: 8 }}>
            <input class="input grow" type="url" inputMode="url" placeholder="Paste an Instagram or YouTube link" value={link} onInput={(e) => setLink(e.currentTarget.value)} />
            <button class="btn icon" aria-label="Paste" onClick={paste}><Icon name="copy" size={16} /></button>
          </div>
          <div class="label" style={{ marginTop: 4 }}>For which channel?</div>
          <div class="lab-chips">{brands.map((b) => <button key={b} class={`chip-filter ${brand === b ? 'on' : ''}`} onClick={() => setBrand(b)}>{b}</button>)}</div>
          <button class="btn primary lab-go" disabled={busy || !link.trim() || !brand} onClick={start}>{busy ? <Spinner /> : <Icon name="sparkle" size={16} />} Download &amp; analyse</button>
          <div class="tiny faint">Takes 2–5 minutes; you can close the app. You get an alert when it's ready. In any Claude chat with the Postroom connector, say "get the latest Video Lab report" to bring it there.</div>
        </section>
        <h2 class="lab-h">Recent</h2>
        {!jobs ? <Spinner /> : !jobs.length ? <p class="small muted">Nothing yet. Paste a link above.</p> : <div class="lab-jobs">{jobs.map((j) => <JobCard key={j.id} j={j} onChange={load} />)}</div>}
      </div>
    </>
  );
}
