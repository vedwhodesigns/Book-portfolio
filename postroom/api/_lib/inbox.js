// Instagram DMs + comment automations (Meta Instagram API, Unified login accounts).
//  • Meta calls /api/webhooks/meta for new DMs (field `messages`) and comments (field `comments`).
//  • Postroom stores threads/messages, runs auto-reply rules, and sends private replies to commenters.
//  • Claude can only *draft* replies; a person sends them.
import crypto from 'node:crypto';
import { db, env, HttpError, PlatformError, logEvent, safeEqual } from './core.js';
import { igGet, igPost } from './platforms/instagram.js';
import { accessToken } from './accounts.js';
import { notify } from './notify.js';

export const WEBHOOK_FIELDS = ['messages', 'comments'];
const WINDOW_MS = 24 * 3600e3; // Meta allows free-form replies within 24h of the person's last message

// ---------- helpers ----------
/** Meta timestamps look like 2026-11-17T10:00:00+0000; make them Date-parseable. */
export const metaDate = (v) => new Date(typeof v === 'string' ? v.replace(/([+-]\d\d)(\d\d)$/, '$1:$2') : v);
async function igAccountByExternal(externalId) {
  const [a] = await db()`select * from postroom.accounts where platform = 'instagram' and external_id = ${String(externalId)} and status <> 'disconnected'`;
  return a || null;
}
async function igAccount(id) {
  const [a] = await db()`select * from postroom.accounts where id = ${id} and platform = 'instagram'`;
  if (!a) throw new HttpError(404, 'Instagram account not found.');
  return a;
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

export function ruleMatches(rule, text) {
  const t = norm(text);
  if (rule.match === 'any') return true;
  const kws = (rule.keywords || []).map(norm).filter(Boolean);
  if (!kws.length) return false;
  if (rule.match === 'exact') return kws.includes(t.replace(/[^\p{L}\p{N} ]/gu, '').trim());
  return kws.some((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(t));
}

/** Fill {username} / {name} placeholders in a reply. */
const fill = (tpl, ctx) => String(tpl).replace(/\{(username|name)\}/g, (_, k) => ctx[k] || (k === 'username' ? 'there' : 'there'));

async function upsertThread(account, igsid, patch = {}) {
  const [t] = await db()`insert into postroom.dm_threads (account_id, igsid, username, name, profile_pic)
    values (${account.id}, ${String(igsid)}, ${patch.username || null}, ${patch.name || null}, ${patch.profile_pic || null})
    on conflict (account_id, igsid) do update set
      username = coalesce(excluded.username, postroom.dm_threads.username),
      name = coalesce(excluded.name, postroom.dm_threads.name),
      profile_pic = coalesce(excluded.profile_pic, postroom.dm_threads.profile_pic),
      updated_at = now()
    returning *`;
  return t;
}

/** Store one message; returns { inserted, thread }. Dedupes on Meta's message id. */
async function storeMessage(account, igsid, { mid, direction, text, attachments, at, source = 'webhook', ruleId = null }) {
  const thread = await upsertThread(account, igsid);
  const created = at ? new Date(at) : new Date();
  const ins = await db()`insert into postroom.dm_messages (thread_id, mid, direction, text, attachments, source, rule_id, created_at)
    values (${thread.id}, ${mid || null}, ${direction}, ${text || null}, ${attachments ? db().json(attachments) : null}, ${source}, ${ruleId}, ${created})
    on conflict (mid) do nothing returning id`;
  if (!ins.length) return { inserted: false, thread };
  const [t] = await db()`update postroom.dm_threads set
      last_message_at = greatest(coalesce(last_message_at, ${created}), ${created}),
      last_text = case when coalesce(last_message_at, ${created}) <= ${created} then ${text || (attachments ? '[attachment]' : '')} else last_text end,
      last_direction = case when coalesce(last_message_at, ${created}) <= ${created} then ${direction} else last_direction end,
      last_inbound_at = case when ${direction} = 'in' then greatest(coalesce(last_inbound_at, ${created}), ${created}) else last_inbound_at end,
      unread = case when ${direction === 'in' && (source === 'webhook' || source === 'poll')} then unread + 1 else unread end,
      updated_at = now()
    where id = ${thread.id} returning *`;
  return { inserted: true, thread: t };
}

async function fetchProfile(account, token, igsid) {
  try {
    const p = await igGet(String(igsid), token, { fields: 'name,username,profile_pic' }, account);
    return { username: p.username || null, name: p.name || null, profile_pic: p.profile_pic || null };
  } catch {
    return {};
  }
}

// ---------- sending ----------
export async function sendDM(account, { igsid, commentId, text, source = 'manual', ruleId = null }) {
  if (!text || !String(text).trim()) throw new HttpError(400, 'Write a message first.');
  if (String(text).length > 1000) throw new HttpError(400, 'Instagram DMs can be at most 1,000 characters.');
  const token = await accessToken(account);
  const recipient = commentId ? { comment_id: String(commentId) } : { id: String(igsid) };
  const r = await igPost(`${account.external_id}/messages`, token, { recipient: JSON.stringify(recipient), message: JSON.stringify({ text: String(text) }) }, account);
  const to = r.recipient_id || igsid;
  if (to) await storeMessage(account, to, { mid: r.message_id, direction: 'out', text, source, ruleId });
  return { ok: true, message_id: r.message_id, recipient_id: to };
}

export async function replyInThread(threadId, text, { by = 'app' } = {}) {
  const [t] = await db()`select * from postroom.dm_threads where id = ${threadId}`;
  if (!t) throw new HttpError(404, 'Conversation not found.');
  if (!t.last_inbound_at || Date.now() - new Date(t.last_inbound_at) > WINDOW_MS) {
    throw new HttpError(409, 'Instagram only allows replies within 24 hours of their last message. Wait for them to message again.');
  }
  const account = await igAccount(t.account_id);
  const r = await sendDM(account, { igsid: t.igsid, text, source: 'manual' });
  await db()`update postroom.dm_threads set draft_text = null, draft_by = null, unread = 0 where id = ${threadId}`;
  await logEvent({ accountId: account.id, message: `Replied to @${t.username || t.igsid} (by ${by})` });
  return r;
}

// ---------- automations ----------
async function rulesFor(accountId, kind) {
  return db()`select * from postroom.auto_rules where enabled and kind = ${kind}
    and (account_id is null or account_id = ${accountId}) order by account_id nulls last, created_at`;
}
async function hit(rule) {
  await db()`update postroom.auto_rules set hits = hits + 1, last_hit_at = now() where id = ${rule.id}`;
}

async function onInboundDM(account, thread, text, isFirst) {
  const ctx = { username: thread.username ? `@${thread.username}` : null, name: thread.name };
  if (isFirst) {
    const [welcome] = await rulesFor(account.id, 'welcome');
    if (welcome) {
      await sendDM(account, { igsid: thread.igsid, text: fill(welcome.reply_text, ctx), source: 'auto', ruleId: welcome.id });
      await hit(welcome);
    }
  }
  if (!text) return;
  for (const rule of await rulesFor(account.id, 'dm_keyword')) {
    if (ruleMatches(rule, text)) {
      await sendDM(account, { igsid: thread.igsid, text: fill(rule.reply_text, ctx), source: 'auto', ruleId: rule.id });
      await hit(rule);
      return; // first matching rule wins
    }
  }
}

async function onComment(account, value, { automate = true } = {}) {
  const commentId = String(value.id);
  const from = value.from || {};
  if (from.id && String(from.id) === String(account.external_id)) return; // our own replies
  const mediaId = value.media?.id ? String(value.media.id) : null;
  const at = value.timestamp ? metaDate(value.timestamp) : new Date();
  const ins = await db()`insert into postroom.ig_comments (account_id, comment_id, media_external_id, from_id, username, text, created_at)
    values (${account.id}, ${commentId}, ${mediaId}, ${from.id || null}, ${from.username || null}, ${value.text || null}, ${at})
    on conflict (comment_id) do nothing returning id`;
  if (!ins.length || value.parent_id || !automate) return false; // duplicate, a reply inside a thread, or history
  for (const rule of await rulesFor(account.id, 'comment_keyword')) {
    if (rule.media_external_id && rule.media_external_id !== mediaId) continue;
    if (!ruleMatches(rule, value.text)) continue;
    const ctx = { username: from.username ? `@${from.username}` : null };
    let dmSent = false;
    let publicReplied = false;
    let error = null;
    try {
      await sendDM(account, { commentId, text: fill(rule.reply_text, ctx), source: 'comment', ruleId: rule.id });
      dmSent = true;
    } catch (e) {
      error = e.message;
    }
    if (rule.public_reply_text) {
      try {
        const token = await accessToken(account);
        await igPost(`${commentId}/replies`, token, { message: fill(rule.public_reply_text, ctx) }, account);
        publicReplied = true;
      } catch (e) {
        error = [error, e.message].filter(Boolean).join(' · ');
      }
    }
    await db()`update postroom.ig_comments set rule_id = ${rule.id}, dm_sent = ${dmSent}, public_replied = ${publicReplied}, error = ${error}
      where comment_id = ${commentId}`;
    await hit(rule);
    if (error) await logEvent({ accountId: account.id, level: 'warn', message: `Comment-to-DM for @${from.username || from.id}: ${error}` });
    return;
  }
}

// ---------- webhook ----------
export function verifySignature(raw, header) {
  const secret = env('META_APP_SECRET');
  if (!secret) return false;
  const sig = String(header || '').replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return safeEqual(sig, expected);
}

export function verifyChallenge(q) {
  const token = env('META_WEBHOOK_VERIFY_TOKEN');
  if (q['hub.mode'] === 'subscribe' && token && safeEqual(String(q['hub.verify_token'] || ''), token)) return String(q['hub.challenge'] || '');
  return null;
}

/** Process one verified webhook payload. Errors per event are logged, never thrown (Meta would retry). */
export async function processWebhook(payload) {
  if (payload?.object !== 'instagram') return { ignored: true };
  let handled = 0;
  for (const entry of payload.entry || []) {
    const account = await igAccountByExternal(entry.id);
    if (!account) continue;
    for (const ev of entry.messaging || []) {
      try {
        const m = ev.message;
        if (!m || m.is_deleted) continue;
        const echo = !!m.is_echo;
        const other = echo ? ev.recipient?.id : ev.sender?.id;
        if (!other) continue;
        const { inserted, thread } = await storeMessage(account, other, {
          mid: m.mid, direction: echo ? 'out' : 'in', text: m.text || null,
          attachments: m.attachments || null, at: ev.timestamp ? Number(ev.timestamp) : null, source: echo ? 'sync' : 'webhook',
        });
        if (!inserted) continue;
        handled++;
        if (!echo) {
          let t = thread;
          if (!t.username) {
            const token = await accessToken(account);
            const prof = await fetchProfile(account, token, other);
            if (prof.username || prof.name) t = await upsertThread(account, other, prof);
          }
          const [{ n }] = await db()`select count(*)::int as n from postroom.dm_messages where thread_id = ${t.id} and direction = 'in'`;
          await onInboundDM(account, t, m.text, n === 1);
        }
      } catch (e) {
        await logEvent({ accountId: account.id, level: 'warn', message: `DM webhook: ${e.message}` });
      }
    }
    for (const ch of entry.changes || []) {
      if (ch.field !== 'comments' || !ch.value) continue;
      try {
        await onComment(account, ch.value);
        handled++;
      } catch (e) {
        await logEvent({ accountId: account.id, level: 'warn', message: `Comment webhook: ${e.message}` });
      }
    }
  }
  return { handled };
}

// ---------- setup ----------
/** Subscribe a Unified-login Instagram account to this app's webhooks (messages + comments). */
export async function subscribeAccount(account) {
  if (account.meta?.login !== 'unified') return { ok: false, reason: 'Reconnect this account so it uses Meta’s new login first.' };
  const token = await accessToken(account);
  await igPost(`${account.external_id}/subscribed_apps`, token, { subscribed_fields: WEBHOOK_FIELDS.join(',') }, account);
  await db()`update postroom.accounts set meta = meta || ${db().json({ dm_subscribed_at: new Date().toISOString() })} where id = ${account.id}`;
  return { ok: true };
}

export async function subscribeAll() {
  const accounts = await db()`select * from postroom.accounts where platform = 'instagram' and status = 'active'`;
  const out = [];
  for (const a of accounts) {
    try {
      out.push({ account: a.username, ...(await subscribeAccount(a)) });
    } catch (e) {
      out.push({ account: a.username, ok: false, reason: e.message });
    }
  }
  return out;
}

/** Pull recent conversations from the Conversations API (backfills history the webhook never saw). */
export async function syncConversations(accountId, { limit = 25 } = {}) {
  const account = await igAccount(accountId);
  const token = await accessToken(account);
  const convs = await igGet(`${account.external_id}/conversations`, token, {
    platform: 'instagram', limit,
    fields: 'participants,updated_time,messages.limit(20){id,message,from,to,created_time,attachments}',
  }, account);
  let messages = 0;
  for (const c of convs.data || []) {
    const other = (c.participants?.data || []).find((p) => String(p.id) !== String(account.external_id));
    if (!other) continue;
    await upsertThread(account, other.id, { username: other.username || null });
    for (const m of (c.messages?.data || []).slice().reverse()) {
      const out = String(m.from?.id) === String(account.external_id);
      const r = await storeMessage(account, other.id, {
        mid: m.id, direction: out ? 'out' : 'in', text: m.message || null,
        attachments: m.attachments?.data || null, at: m.created_time, source: 'sync',
      });
      if (r.inserted) messages++;
    }
  }
  return { conversations: (convs.data || []).length, messages };
}

// ---------- polling ----------
// Webhooks only reach a *published* Meta app. Until then (and as a safety net afterwards) the cron
// tick polls each account: DMs every minute, comments every few minutes. Automations only fire on
// messages/comments newer than the account's poll baseline, never on history.
const POLL_MAX_LOOKBACK_MS = 2 * 3600e3;

async function pollBaseline(account) {
  let base = account.meta?.inbox_poll_since ? new Date(account.meta.inbox_poll_since) : null;
  if (!base) {
    base = new Date();
    await db()`update postroom.accounts set meta = meta || ${db().json({ inbox_poll_since: base.toISOString() })} where id = ${account.id}`;
    return { since: base, first: true };
  }
  return { since: new Date(Math.max(base.getTime(), Date.now() - POLL_MAX_LOOKBACK_MS)), first: false };
}

async function pollDMs(account, token, since, automate) {
  const convs = await igGet(`${account.external_id}/conversations`, token, {
    platform: 'instagram', limit: 10,
    fields: 'participants,updated_time,messages.limit(10){id,message,from,to,created_time,attachments}',
  }, account);
  let fresh = 0;
  let autos = 0;
  const newFrom = [];
  for (const c of convs.data || []) {
    if (automate && c.updated_time && metaDate(c.updated_time) < since) continue; // nothing new here (first pass stores history)
    const other = (c.participants?.data || []).find((p) => String(p.id) !== String(account.external_id));
    if (!other) continue;
    let thread = await upsertThread(account, other.id, { username: other.username || null });
    let lastNew = null;
    for (const m of (c.messages?.data || []).slice().reverse()) {
      const out = String(m.from?.id) === String(account.external_id);
      const at = metaDate(m.created_time);
      const r = await storeMessage(account, other.id, {
        mid: m.id, direction: out ? 'out' : 'in', text: m.message || null,
        attachments: m.attachments?.data || null, at, source: out ? 'sync' : at >= since ? 'poll' : 'sync',
      });
      thread = r.thread || thread;
      if (r.inserted && !out && at >= since) { fresh++; lastNew = { text: m.message || null, at }; }
    }
    if (lastNew && automate) newFrom.push({ who: thread.username ? `@${thread.username}` : 'someone', text: lastNew.text });
    if (!lastNew || !automate) continue;
    try {
      if (!thread.username) {
        const prof = await fetchProfile(account, token, other.id);
        if (prof.username || prof.name) thread = await upsertThread(account, other.id, prof);
      }
      const [{ n }] = await db()`select count(*)::int as n from postroom.dm_messages
        where thread_id = ${thread.id} and direction = 'in' and created_at < ${since}`;
      await onInboundDM(account, thread, lastNew.text, n === 0);
      autos++;
    } catch (e) {
      await logEvent({ accountId: account.id, level: 'warn', message: `Auto-reply to @${thread.username || other.id}: ${e.message}` });
    }
  }
  if (newFrom.length) {
    await notify({
      kind: 'dm', accountId: account.id, url: '/#/inbox',
      title: newFrom.length === 1 ? `DM from ${newFrom[0].who} · @${account.username}` : `${newFrom.length} new DMs · @${account.username}`,
      body: newFrom.length === 1 ? (newFrom[0].text || '[attachment]').slice(0, 140) : newFrom.map((x) => x.who).join(', '),
    });
  }
  return { fresh, autos };
}

async function pollComments(account, token, since, automate) {
  const media = await igGet(`${account.external_id}/media`, token, {
    limit: 8, fields: 'id,timestamp,comments.limit(30){id,text,timestamp,username,from,parent_id}',
  }, account);
  let fresh = 0;
  for (const md of media.data || []) {
    for (const c of md.comments?.data || []) {
      const at = metaDate(c.timestamp);
      try {
        await onComment(account, {
          id: c.id, text: c.text, timestamp: c.timestamp, parent_id: c.parent_id,
          from: { id: c.from?.id, username: c.from?.username || c.username }, media: { id: md.id },
        }, { automate: automate && at >= since });
        if (at >= since) fresh++;
      } catch (e) {
        await logEvent({ accountId: account.id, level: 'warn', message: `Comment check: ${e.message}` });
      }
    }
  }
  return { fresh };
}

/** One polling pass over every active Instagram account. Called by the cron tick. */
export async function pollInbox({ dms = true, comments = true, deadline = Date.now() + 40000 } = {}) {
  const accounts = await db()`select * from postroom.accounts where platform = 'instagram' and status = 'active'`;
  const out = [];
  for (const account of accounts) {
    if (Date.now() > deadline) break;
    const row = { account: account.username };
    try {
      const { since, first } = await pollBaseline(account);
      const token = await accessToken(account);
      if (dms) row.dms = await pollDMs(account, token, since, !first);
      if (comments) row.comments = await pollComments(account, token, since, !first);
      await db()`update postroom.accounts set meta = (meta - 'inbox_poll_error') || ${db().json({ inbox_poll_at: new Date().toISOString() })} where id = ${account.id}`;
    } catch (e) {
      row.error = e.message;
      await db()`update postroom.accounts set meta = meta || ${db().json({ inbox_poll_at: new Date().toISOString(), inbox_poll_error: e.message.slice(0, 300) })} where id = ${account.id}`;
    }
    out.push(row);
  }
  return out;
}

// ---------- reads ----------
export async function listThreads({ account_id = null, q = '', limit = 100 } = {}) {
  return db()`select t.*, a.username as account_username, a.profile_picture_url as account_avatar,
      (t.last_inbound_at is not null and t.last_inbound_at > now() - interval '24 hours') as can_reply
    from postroom.dm_threads t join postroom.accounts a on a.id = t.account_id
    where a.status <> 'disconnected'
      ${account_id ? db()`and t.account_id = ${account_id}` : db()``}
      ${q ? db()`and (t.username ilike ${`%${q}%`} or t.name ilike ${`%${q}%`} or t.last_text ilike ${`%${q}%`})` : db()``}
    order by t.last_message_at desc nulls last limit ${Math.min(Number(limit) || 100, 300)}`;
}

export async function getThread(id, { markRead = true } = {}) {
  const [t] = await db()`select t.*, a.username as account_username, a.profile_picture_url as account_avatar,
      (t.last_inbound_at is not null and t.last_inbound_at > now() - interval '24 hours') as can_reply
    from postroom.dm_threads t join postroom.accounts a on a.id = t.account_id where t.id = ${id}`;
  if (!t) throw new HttpError(404, 'Conversation not found.');
  const messages = await db()`select id, direction, text, attachments, source, created_at from postroom.dm_messages
    where thread_id = ${id} order by created_at asc limit 300`;
  if (markRead && t.unread) await db()`update postroom.dm_threads set unread = 0 where id = ${id}`;
  return { ...t, messages, window_ends_at: t.last_inbound_at ? new Date(new Date(t.last_inbound_at).getTime() + WINDOW_MS) : null };
}

export async function saveDraft(threadId, text, by = 'claude') {
  const [t] = await db()`update postroom.dm_threads set draft_text = ${text || null}, draft_by = ${text ? by : null}, updated_at = now()
    where id = ${threadId} returning id`;
  if (!t) throw new HttpError(404, 'Conversation not found.');
  return { ok: true };
}

export async function listComments({ account_id = null, limit = 100 } = {}) {
  return db()`select c.*, a.username as account_username, r.name as rule_name
    from postroom.ig_comments c join postroom.accounts a on a.id = c.account_id
    left join postroom.auto_rules r on r.id = c.rule_id
    where true ${account_id ? db()`and c.account_id = ${account_id}` : db()``}
    order by c.created_at desc limit ${Math.min(Number(limit) || 100, 300)}`;
}

// ---------- rules ----------
const RULE_FIELDS = ['account_id', 'kind', 'name', 'keywords', 'match', 'reply_text', 'public_reply_text', 'media_external_id', 'enabled'];
function cleanRule(input, existing = {}) {
  const r = { ...existing };
  for (const k of RULE_FIELDS) if (input[k] !== undefined) r[k] = input[k];
  if (!['welcome', 'dm_keyword', 'comment_keyword'].includes(r.kind)) throw new HttpError(400, 'Choose a rule type.');
  r.keywords = (Array.isArray(r.keywords) ? r.keywords : String(r.keywords || '').split(','))
    .map((k) => String(k).trim()).filter(Boolean).slice(0, 30);
  if (r.kind === 'welcome') r.match = 'any';
  else if (!['contains', 'exact', 'any'].includes(r.match || 'contains')) r.match = 'contains';
  else r.match = r.match || 'contains';
  if (r.kind !== 'welcome' && r.match !== 'any' && !r.keywords.length) throw new HttpError(400, 'Add at least one keyword.');
  if (!r.reply_text || !String(r.reply_text).trim()) throw new HttpError(400, 'Write the DM to send.');
  if (String(r.reply_text).length > 1000) throw new HttpError(400, 'DMs can be at most 1,000 characters.');
  if (r.kind !== 'comment_keyword') { r.public_reply_text = null; r.media_external_id = null; }
  r.account_id = r.account_id || null;
  r.enabled = r.enabled !== false;
  return r;
}
export async function listRules() {
  return db()`select r.*, a.username as account_username from postroom.auto_rules r
    left join postroom.accounts a on a.id = r.account_id order by r.kind, r.created_at`;
}
export async function createRule(input) {
  const r = cleanRule(input);
  const [row] = await db()`insert into postroom.auto_rules ${db()({ ...r, keywords: r.keywords })} returning *`;
  return row;
}
export async function updateRule(id, input) {
  const [cur] = await db()`select * from postroom.auto_rules where id = ${id}`;
  if (!cur) throw new HttpError(404, 'Rule not found.');
  const r = cleanRule(input, cur);
  const [row] = await db()`update postroom.auto_rules set ${db()(r, RULE_FIELDS)}, updated_at = now() where id = ${id} returning *`;
  return row;
}
export async function deleteRule(id) {
  await db()`delete from postroom.auto_rules where id = ${id}`;
  return { ok: true };
}

/** Status for the inbox header: is everything wired up? */
export async function inboxStatus() {
  const accounts = await db()`select id, username, meta from postroom.accounts where platform = 'instagram' and status = 'active'`;
  return {
    webhook_url: null, // filled by the router
    verify_token_set: !!env('META_WEBHOOK_VERIFY_TOKEN'),
    app_secret_set: !!env('META_APP_SECRET'),
    accounts: accounts.map((a) => ({
      id: a.id, username: a.username, unified: a.meta?.login === 'unified', subscribed: !!a.meta?.dm_subscribed_at,
      checked_at: a.meta?.inbox_poll_at || null, check_error: a.meta?.inbox_poll_error || null,
    })),
  };
}

export { PlatformError };
