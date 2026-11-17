import { useState, useEffect, useRef } from 'preact/hooks';
import { api, relTime, fmtDateTime } from '../api.js';
import { useApp, useAsync, Icon, Seg, Empty, Spinner, Avatar, CopyField, Toggle } from '../ui.jsx';

const KIND = {
  welcome: { label: 'Welcome message', hint: 'Sent once, the first time someone DMs you.' },
  dm_keyword: { label: 'DM keyword', hint: 'Someone DMs a keyword → instant reply.' },
  comment_keyword: { label: 'Comment → DM', hint: 'Someone comments a keyword on a post/reel → they get a DM.' },
};

function SetupCard({ status, onDone }) {
  const { toast, config } = useApp();
  const [busy, setBusy] = useState(false);
  const allSubscribed = status.accounts.length > 0 && status.accounts.every((a) => a.subscribed);
  if (status.verify_token_set && allSubscribed) return null;
  const subscribe = async () => {
    setBusy(true);
    try {
      const r = await api('inbox/subscribe', { method: 'POST' });
      const bad = r.filter((x) => !x.ok);
      toast(bad.length ? `${bad.length} account(s) couldn't be enabled: ${bad[0].reason}` : 'DMs enabled for all accounts', bad.length ? 'bad' : '');
      onDone();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="card pad" style={{ marginBottom: 16 }}>
      <h2 class="row"><Icon name="alert" size={16} /> Finish DM setup (one time)</h2>
      <ol class="setup-steps">
        <li>
          In Meta: <b>Use cases → Instagram → Customize → API setup with Unified login → 3. Configure webhooks</b>. Paste:
          <div class="grid2" style={{ margin: '8px 0' }}>
            <div class="field"><label>Callback URL</label><CopyField value={status.webhook_url} /></div>
            <div class="field"><label>Verify token</label>{status.verify_token ? <CopyField value={status.verify_token} /> : <span class="small muted">Not set yet</span>}</div>
          </div>
          Click <b>Verify and save</b>, then subscribe to the fields <code>messages</code> and <code>comments</code>.
        </li>
        <li>In Meta: switch the app to <b>Live</b> (top of the App Dashboard). Meta only sends DM notifications to Live apps.</li>
        <li>On each Instagram account (phone app): <b>Settings → Messages and story replies → Message controls → Connected tools → Allow access to messages</b>.</li>
        <li>
          Then: <button class="btn primary sm" disabled={busy} onClick={subscribe}>{busy ? <Spinner /> : 'Enable DMs for my accounts'}</button>
          <span class="tiny faint" style={{ marginLeft: 8 }}>
            {status.accounts.map((a) => `@${a.username} ${a.subscribed ? '✓' : '·'}`).join('  ')}
          </span>
        </li>
      </ol>
      <p class="tiny faint" style={{ margin: 0 }}>Until Meta grants Advanced Access (Business Verification + App Review), only DMs and comments from people with a role on the app (you and your test accounts) come through.{config.ai ? '' : ' Add a Claude API key in Settings to draft replies here.'}</p>
    </section>
  );
}

function Thread({ id, onChanged }) {
  const { toast, config } = useApp();
  const { data: t, loading, reload } = useAsync(() => api(`inbox/threads/${id}`), [id]);
  const [text, setText] = useState('');
  const [guidance, setGuidance] = useState('');
  const [busy, setBusy] = useState(null);
  const endRef = useRef();
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [t?.messages?.length]);
  useEffect(() => { setText(''); }, [id]);
  if (loading && !t) return <div class="empty"><Spinner /></div>;
  if (!t) return null;
  const send = async (body) => {
    setBusy('send');
    try {
      await api(`inbox/threads/${id}/reply`, { method: 'POST', body: { text: body } });
      setText('');
      await reload();
      onChanged();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(null);
    }
  };
  const draft = async () => {
    setBusy('draft');
    try {
      const r = await api(`inbox/threads/${id}/draft`, { method: 'POST', body: { guidance } });
      setText(r.text);
      await reload();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(null);
    }
  };
  const left = t.window_ends_at ? new Date(t.window_ends_at) - Date.now() : -1;
  return (
    <div class="thread">
      <div class="thread-head">
        <Avatar src={t.profile_pic} name={t.username || '?'} size={36} />
        <div class="grow">
          <b>{t.username ? `@${t.username}` : t.name || 'Instagram user'}</b>
          <div class="tiny muted">to @{t.account_username}</div>
        </div>
        {left > 0
          ? <span class="pill good" title="Instagram allows replies for 24h after their last message">Reply window: {Math.max(1, Math.round(left / 3600e3))}h left</span>
          : <span class="pill" title="Instagram allows replies only within 24h of their last message">Reply window closed</span>}
        {t.username && <a class="btn ghost sm icon" href={`https://www.instagram.com/${t.username}/`} target="_blank" rel="noreferrer" aria-label="Open profile"><Icon name="external" size={15} /></a>}
      </div>
      <div class="messages">
        {t.messages.map((m) => (
          <div key={m.id} class={`bubble ${m.direction}`}>
            {m.text || <i class="faint">[{(m.attachments?.[0]?.type) || 'attachment'}]</i>}
            <span class="meta">{fmtDateTime(m.created_at)}{m.source === 'auto' ? ' · auto-reply' : m.source === 'comment' ? ' · comment → DM' : ''}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {t.draft_text && text !== t.draft_text && (
        <div class="notice info" style={{ margin: '0 12px 8px' }}>
          <Icon name="sparkle" size={16} />
          <div class="grow"><b>Claude suggested:</b> {t.draft_text}</div>
          <button class="btn sm" onClick={() => setText(t.draft_text)}>Use</button>
          <button class="btn ghost sm" onClick={() => api(`inbox/threads/${id}/draft`, { method: 'DELETE' }).then(reload)}>Discard</button>
        </div>
      )}
      <div class="composer">
        {config.ai && (
          <div class="row" style={{ marginBottom: 6 }}>
            <input class="input" style={{ minHeight: 32, padding: '4px 10px' }} placeholder="Optional guidance for Claude, e.g. offer 10% off" value={guidance} onInput={(e) => setGuidance(e.currentTarget.value)} />
            <button class="btn sm" disabled={busy} onClick={draft}>{busy === 'draft' ? <Spinner /> : <Icon name="sparkle" size={14} />} Draft</button>
          </div>
        )}
        <div class="row" style={{ alignItems: 'flex-end' }}>
          <textarea class="textarea" style={{ minHeight: 44 }} placeholder={left > 0 ? 'Write a reply…' : 'Reply window closed — Instagram allows replies within 24h of their last message'} disabled={left <= 0} value={text} onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) send(text); }} />
          <button class="btn primary" disabled={!text.trim() || busy || left <= 0} onClick={() => send(text)}>{busy === 'send' ? <Spinner /> : <Icon name="send" size={16} />} Send</button>
        </div>
        <span class="tiny faint">{text.length}/1000 · ⌘↵ to send</span>
      </div>
    </div>
  );
}

function Messages({ status }) {
  const { accounts, toast } = useApp();
  const ig = accounts.filter((a) => a.platform === 'instagram' && a.status === 'active');
  const [acct, setAcct] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const threads = useAsync(() => api('inbox/threads', { query: { account_id: acct || null, q } }), [acct, q]);
  useEffect(() => {
    const t = setInterval(threads.reload, 20000);
    return () => clearInterval(t);
  }, [acct, q]);
  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api('inbox/sync', { method: 'POST', body: { account_id: acct || null } });
      const err = r.find((x) => x.error);
      toast(err ? `Sync: ${err.error}` : `Synced ${r.reduce((n, x) => n + (x.messages || 0), 0)} messages`, err ? 'bad' : '');
      threads.reload();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setSyncing(false);
    }
  };
  const list = threads.data || [];
  return (
    <div class={`inbox ${open ? 'has-open' : ''}`}>
      <div class="thread-list card">
        <div class="col" style={{ gap: 8, padding: 10, borderBottom: '1px solid var(--line)' }}>
          <div class="row">
            <input class="input" placeholder="Search…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
            <button class="btn icon" title="Pull recent conversations from Instagram" onClick={sync} disabled={syncing}>{syncing ? <Spinner /> : <Icon name="refresh" size={16} />}</button>
          </div>
          {ig.length > 1 && (
            <div class="filters">
              <button class={`chip-filter ${!acct ? 'on' : ''}`} onClick={() => setAcct('')}>All</button>
              {ig.map((a) => <button key={a.id} class={`chip-filter ${acct === a.id ? 'on' : ''}`} onClick={() => setAcct(a.id)}><Avatar src={a.profile_picture_url} name={a.username} size={16} /> @{a.username}</button>)}
            </div>
          )}
        </div>
        {threads.loading && !threads.data ? <div class="empty"><Spinner /></div> : !list.length ? (
          <Empty icon="inbox" title="No conversations yet">{status.verify_token_set ? 'New DMs appear here. Tap ↻ to pull recent conversations.' : 'Finish the DM setup above, then new DMs appear here.'}</Empty>
        ) : list.map((t) => (
          <button key={t.id} class={`thread-row ${open === t.id ? 'on' : ''}`} onClick={() => setOpen(t.id)}>
            <Avatar src={t.profile_pic} name={t.username || '?'} size={36} />
            <div class="grow" style={{ minWidth: 0, textAlign: 'left' }}>
              <div class="row between"><b class="ellipsis small">{t.username ? `@${t.username}` : t.name || 'Instagram user'}</b><span class="tiny faint">{t.last_message_at ? relTime(t.last_message_at) : ''}</span></div>
              <div class="tiny ellipsis" style={{ color: t.unread ? 'var(--text)' : 'var(--text-2)', fontWeight: t.unread ? 600 : 400 }}>{t.last_direction === 'out' ? 'You: ' : ''}{t.last_text || ''}</div>
              <div class="tiny faint">to @{t.account_username}{t.draft_text ? ' · ✨ draft' : ''}</div>
            </div>
            {t.unread > 0 && <span class="badge">{t.unread}</span>}
          </button>
        ))}
      </div>
      <div class="thread-pane card">
        {open ? (
          <>
            <button class="btn ghost sm back-btn" onClick={() => setOpen(null)}><Icon name="chevL" size={14} /> All conversations</button>
            <Thread id={open} onChanged={threads.reload} />
          </>
        ) : <Empty icon="inbox" title="Pick a conversation">Replies go out from the Instagram account that received the DM.</Empty>}
      </div>
    </div>
  );
}

function Comments() {
  const { data, loading } = useAsync(() => api('inbox/comments'), []);
  if (loading) return <Spinner />;
  if (!data?.length) return <div class="card"><Empty icon="list" title="No comments yet">Comments on your posts appear here, with what your Comment → DM automations did.</Empty></div>;
  return (
    <div class="card table-wrap">
      <table class="table">
        <thead><tr><th>When</th><th>Account</th><th>From</th><th>Comment</th><th>Automation</th><th>DM</th><th>Public reply</th></tr></thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.id}>
              <td class="small muted">{relTime(c.created_at)}</td>
              <td class="small">@{c.account_username}</td>
              <td class="small">{c.username ? <a href={`https://www.instagram.com/${c.username}/`} target="_blank" rel="noreferrer">@{c.username}</a> : '—'}</td>
              <td class="small" style={{ maxWidth: 320 }}>{c.text}</td>
              <td class="small">{c.rule_name || (c.rule_id ? 'Rule' : <span class="faint">—</span>)}</td>
              <td>{c.dm_sent ? <span class="pill good">Sent</span> : c.rule_id ? <span class="pill bad" title={c.error || ''}>Failed</span> : <span class="faint">—</span>}</td>
              <td>{c.public_replied ? <span class="pill good">Replied</span> : <span class="faint">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EMPTY_RULE = { kind: 'comment_keyword', name: '', account_id: '', keywords: '', match: 'contains', reply_text: '', public_reply_text: '', media_external_id: '', enabled: true };

function RuleForm({ initial, onSaved, onCancel }) {
  const { accounts, toast } = useApp();
  const ig = accounts.filter((a) => a.platform === 'instagram');
  const [r, setR] = useState({ ...EMPTY_RULE, ...initial, keywords: (initial?.keywords || []).join?.(', ') ?? initial?.keywords ?? '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setR((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...r, account_id: r.account_id || null, media_external_id: r.media_external_id || null, public_reply_text: r.public_reply_text || null };
      if (initial?.id) await api(`inbox/rules/${initial.id}`, { method: 'PATCH', body });
      else await api('inbox/rules', { method: 'POST', body });
      toast('Automation saved');
      onSaved();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="card pad col" style={{ gap: 12 }}>
      <Seg value={r.kind} onChange={(v) => set('kind', v)} options={Object.entries(KIND).map(([k, v]) => ({ value: k, label: v.label }))} />
      <span class="small muted">{KIND[r.kind].hint}</span>
      <div class="grid2">
        <div class="field"><label>Name</label><input class="input" placeholder="e.g. Free guide" value={r.name || ''} onInput={(e) => set('name', e.currentTarget.value)} /></div>
        <div class="field"><label>Account</label>
          <select class="select" value={r.account_id || ''} onChange={(e) => set('account_id', e.currentTarget.value)}>
            <option value="">All Instagram accounts</option>
            {ig.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
          </select>
        </div>
      </div>
      {r.kind !== 'welcome' && (
        <div class="grid2">
          <div class="field"><label>Keywords (comma-separated)</label><input class="input" placeholder="LINK, guide, price" value={r.keywords} onInput={(e) => set('keywords', e.currentTarget.value)} /></div>
          <div class="field"><label>Match</label>
            <select class="select" value={r.match} onChange={(e) => set('match', e.currentTarget.value)}>
              <option value="contains">Message contains a keyword</option>
              <option value="exact">Message is exactly a keyword</option>
              <option value="any">Any {r.kind === 'comment_keyword' ? 'comment' : 'message'}</option>
            </select>
          </div>
        </div>
      )}
      <div class="field">
        <div class="row between"><label>DM to send</label><span class="counter">{(r.reply_text || '').length}/1000</span></div>
        <textarea class="textarea" style={{ minHeight: 90 }} placeholder="Hey {username}! Here's the link you asked for: …" value={r.reply_text} onInput={(e) => set('reply_text', e.currentTarget.value)} />
        <span class="tiny faint">Use {'{username}'} to insert their handle.</span>
      </div>
      {r.kind === 'comment_keyword' && (
        <>
          <div class="field"><label>Public reply under the comment (optional)</label><input class="input" placeholder="Sent you a DM 📩" value={r.public_reply_text || ''} onInput={(e) => set('public_reply_text', e.currentTarget.value)} /></div>
          <div class="field"><label>Only on this post/reel ID (optional)</label><input class="input" placeholder="Leave empty for all posts" value={r.media_external_id || ''} onInput={(e) => set('media_external_id', e.currentTarget.value)} /></div>
          <span class="tiny faint">Instagram allows one private DM per comment, within 7 days of the comment.</span>
        </>
      )}
      <Toggle checked={r.enabled} onChange={(v) => set('enabled', v)} label="On" />
      <div class="row"><button class="btn primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : 'Save automation'}</button><button class="btn ghost" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function Automations() {
  const { toast } = useApp();
  const { data, loading, reload } = useAsync(() => api('inbox/rules'), []);
  const [editing, setEditing] = useState(null);
  const toggle = async (rule) => {
    try {
      await api(`inbox/rules/${rule.id}`, { method: 'PATCH', body: { enabled: !rule.enabled } });
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  const del = async (rule) => {
    if (!confirm(`Delete "${rule.name || KIND[rule.kind].label}"?`)) return;
    await api(`inbox/rules/${rule.id}`, { method: 'DELETE' });
    reload();
  };
  if (editing) return <RuleForm initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />;
  return (
    <div class="col" style={{ gap: 12 }}>
      <div class="row"><button class="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> New automation</button><span class="small muted">Welcome messages, keyword auto-replies and Comment → DM.</span></div>
      {loading ? <Spinner /> : !data?.length ? (
        <div class="card"><Empty icon="sparkle" title="No automations yet">Try a Comment → DM: anyone who comments “LINK” on a reel gets your link in their DMs.</Empty></div>
      ) : data.map((r) => (
        <div class="card pad row wrap" key={r.id} style={{ alignItems: 'flex-start' }}>
          <div class="grow" style={{ minWidth: 220 }}>
            <div class="row"><b>{r.name || KIND[r.kind].label}</b><span class="pill">{KIND[r.kind].label}</span>{r.created_by === 'claude' && <span class="pill"><Icon name="sparkle" size={12} /> Claude</span>}</div>
            <div class="small muted" style={{ marginTop: 4 }}>
              {r.account_username ? `@${r.account_username}` : 'All accounts'}
              {r.kind !== 'welcome' && (r.match === 'any' ? ' · any message' : ` · ${r.match === 'exact' ? 'exactly' : 'contains'}: ${r.keywords.join(', ')}`)}
            </div>
            <div class="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>“{r.reply_text}”</div>
            {r.public_reply_text && <div class="tiny muted" style={{ marginTop: 4 }}>Public reply: “{r.public_reply_text}”</div>}
            <div class="tiny faint" style={{ marginTop: 4 }}>{r.hits} sent{r.last_hit_at ? ` · last ${relTime(r.last_hit_at)}` : ''}</div>
          </div>
          <div class="row">
            <Toggle checked={r.enabled} onChange={() => toggle(r)} label={r.enabled ? 'On' : 'Off'} />
            <button class="btn ghost sm" onClick={() => setEditing(r)}>Edit</button>
            <button class="btn ghost sm danger icon" aria-label="Delete" onClick={() => del(r)}><Icon name="trash" size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Inbox({ params }) {
  const [tab, setTab] = useState(params.tab || 'messages');
  const status = useAsync(() => api('inbox/status'), []);
  return (
    <>
      <div class="page-head">
        <h1>Inbox</h1>
        <span class="sub">Instagram DMs and comments from all your accounts.</span>
        <div class="grow" />
        <Seg value={tab} onChange={setTab} options={[{ value: 'messages', label: 'Messages' }, { value: 'comments', label: 'Comments' }, { value: 'automations', label: 'Automations' }]} />
      </div>
      {status.data && <SetupCard status={status.data} onDone={status.reload} />}
      {tab === 'messages' && status.data && <Messages status={status.data} />}
      {tab === 'comments' && <Comments />}
      {tab === 'automations' && <Automations />}
    </>
  );
}
