// Comments: the fast reply queue. Every new comment on Instagram/YouTube with a short suggested reply;
// tap Send (or edit first), Skip, or Rewrite. Nothing posts until you tap.
import { useState, useEffect, useRef } from 'preact/hooks';
import { api, relTime } from '../api.js';
import { useApp, useAsync, Icon, Spinner, Empty, PfMark } from '../ui.jsx';

const VIEWS = [['review', 'To reply'], ['sent', 'Replied'], ['all', 'All']];

function Card({ c, onDone, focus }) {
  const { toast } = useApp();
  const [text, setText] = useState(c.reply_draft || '');
  const [busy, setBusy] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const ta = useRef();
  useEffect(() => setText(c.reply_draft || ''), [c.id, c.reply_draft]);
  useEffect(() => { // grow the box to its text
    const el = ta.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight + 2, 160)}px`;
  }, [text]);
  const open = c.reply_status === 'draft' || c.reply_status === 'needs_you' || c.reply_status == null;
  const run = async (kind, fn, msg) => {
    setBusy(kind);
    try {
      const r = await fn();
      if (kind === 'redraft') { setText(r.reply_draft || ''); toast('New suggestion'); }
      else { setLeaving(true); toast(msg); setTimeout(() => onDone(c.id), 220); }
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(null); }
  };
  const profile = c.platform === 'youtube' ? (c.from_id ? `https://www.youtube.com/channel/${c.from_id}` : null) : c.username ? `https://www.instagram.com/${c.username}/` : null;
  const name = c.platform === 'youtube' ? (c.username || 'someone') : `@${c.username || 'someone'}`;
  return (
    <article class={`cm-card card ${leaving ? 'leaving' : ''}`}>
      <div class="cm-post">
        {c.post_thumb ? <img src={c.post_thumb} alt="" loading="lazy" /> : <span class="ph" />}
        <span class="grow ellipsis tiny muted">{c.post_title || 'your post'}</span>
        <PfMark platform={c.platform || 'instagram'} size={14} />
        <span class="tiny faint">{c.brand || `@${c.account_username}`}</span>
      </div>
      <div class="cm-who">
        {profile ? <a href={profile} target="_blank" rel="noreferrer"><b>{name}</b></a> : <b>{name}</b>}
        <span class="tiny faint">{relTime(c.created_at)}</span>
      </div>
      <p class="cm-text">{c.text || <span class="faint">(empty comment)</span>}</p>
      {c.reply_status === 'needs_you' && c.reply_note && <div class="cm-note"><Icon name="alert" size={14} /> {c.reply_note}</div>}
      {c.reply_status === 'sent' && <div class="cm-sent">↳ {c.reply_sent_text} <span class="faint">· {relTime(c.replied_at)}</span></div>}
      {c.reply_status === 'skipped' && <div class="tiny faint">Skipped{c.reply_note ? `: ${c.reply_note}` : ''}</div>}
      {open && (
        <>
          <textarea ref={ta} class="cm-input" rows={2} value={text} placeholder="Write a short reply…" aria-label={`Reply to ${name}`}
            autoFocus={focus} onInput={(e) => setText(e.currentTarget.value)} />
          <div class="cm-actions">
            <button class="btn" disabled={!!busy} onClick={() => run('skip', () => api(`inbox/comments/${c.id}/skip`, { method: 'POST' }), 'Skipped')}>Skip</button>
            <button class="btn" disabled={!!busy} aria-label="New suggestion" title="New suggestion" onClick={() => run('redraft', () => api(`inbox/comments/${c.id}/redraft`, { method: 'POST', body: {} }))}>
              {busy === 'redraft' ? <Spinner /> : <Icon name="sparkle" size={16} />}
            </button>
            <button class="btn primary grow" disabled={!!busy || !text.trim()} onClick={() => run('send', () => api(`inbox/comments/${c.id}/reply`, { method: 'POST', body: { text } }), `Replied to ${name}`)}>
              {busy === 'send' ? <Spinner /> : <Icon name="send" size={16} />} Send
            </button>
          </div>
        </>
      )}
    </article>
  );
}

export function CommentsList({ compact = false }) {
  const { toast, refresh } = useApp();
  const [view, setView] = useState('review');
  const [brand, setBrand] = useState('');
  const query = { limit: 150, ...(view === 'review' ? { review: true } : view === 'sent' ? { status: 'sent' } : {}), ...(brand ? { brand } : {}) };
  const { data, loading, reload } = useAsync(() => api('inbox/comments', { query }), [view, brand]);
  const [gone, setGone] = useState(new Set());
  const [checking, setChecking] = useState(false);
  const [bulk, setBulk] = useState(false);
  useEffect(() => setGone(new Set()), [view, brand, data]);
  const list = (data || []).filter((c) => !gone.has(c.id));
  const brands = [...new Set((data || []).map((c) => c.brand).filter(Boolean))];
  const drafts = list.filter((c) => c.reply_status === 'draft' && c.reply_draft);
  const done = (id) => { setGone((g) => new Set(g).add(id)); refresh?.(); };

  const check = async () => {
    setChecking(true);
    try { const r = await api('inbox/comments/check', { method: 'POST' }); toast(r.drafted ? `${r.drafted} new comment${r.drafted === 1 ? '' : 's'}` : 'No new comments'); await reload(); } catch (e) { toast(e.message, 'bad'); } finally { setChecking(false); }
  };
  const sendAll = async () => {
    if (!confirm(`Send all ${drafts.length} suggested replies as they are?`)) return;
    setBulk(true);
    let ok = 0;
    for (const c of drafts) {
      try { await api(`inbox/comments/${c.id}/reply`, { method: 'POST', body: { text: c.reply_draft } }); ok++; setGone((g) => new Set(g).add(c.id)); } catch (e) { toast(`${c.username}: ${e.message}`, 'bad'); }
    }
    setBulk(false); toast(`Sent ${ok} repl${ok === 1 ? 'y' : 'ies'}`); refresh?.();
  };

  return (
    <div class="cm">
      <div class="cm-bar">
        <div class="seg" role="tablist">
          {VIEWS.map(([v, l]) => <button key={v} role="tab" aria-selected={view === v} class={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}{v === 'review' && view === 'review' && list.length ? ` · ${list.length}` : ''}</button>)}
        </div>
        <span class="grow" />
        <button class="btn icon" aria-label="Check for new comments" onClick={check} disabled={checking}>{checking ? <Spinner /> : <Icon name="refresh" size={17} />}</button>
      </div>
      {brands.length > 1 && (
        <div class="scroll-chips">
          <button class={`chip-filter ${!brand ? 'on' : ''}`} onClick={() => setBrand('')}>All</button>
          {brands.map((b) => <button key={b} class={`chip-filter ${brand === b ? 'on' : ''}`} onClick={() => setBrand(b)}>{b}</button>)}
        </div>
      )}
      {view === 'review' && drafts.length > 1 && (
        <button class="btn block cm-all" disabled={bulk} onClick={sendAll}>{bulk ? <Spinner /> : <Icon name="send" size={15} />} Send all {drafts.length} suggested replies</button>
      )}
      {loading && !data ? <div class="empty"><Spinner /></div> : !list.length ? (
        <div class="card"><Empty icon="inbox" title={view === 'review' ? "You're all caught up" : 'Nothing here yet'}>{view === 'review' ? 'New comments land here within a few minutes, with a short suggested reply.' : 'Comments on your posts show up here.'}</Empty></div>
      ) : (
        <div class="cm-list">{list.map((c, i) => <Card key={c.id} c={c} onDone={done} focus={!compact && i === 0 && false} />)}</div>
      )}
      {!compact && <p class="tiny faint" style={{ textAlign: 'center', margin: '14px 0 0' }}>Replies are suggested in each brand's voice. Nothing posts until you tap Send.</p>}
    </div>
  );
}

export default function Comments() {
  return (
    <>
      <div class="page-head"><h1>Comments</h1></div>
      <CommentsList />
    </>
  );
}
