// Posts: cross-post validation & creation, editing, scheduling, plans (batches) from Claude.
import crypto from 'node:crypto';
import { db, HttpError, parseWhen, localLabel, logEvent } from './core.js';
import { platform, KIND_LABEL } from './platforms/index.js';
import { loadMedia, mediaRow } from './media.js';
import { accountRow } from './accounts.js';
import { nextSlot } from './brand.js';
import { linkIdeaToPosts } from './planner.js';

export const MISSED_SLOT_HOURS = 6;
const EDITABLE = ['draft', 'scheduled', 'failed'];

/** Find a connected account by id, "@username", "username" or "platform:username". */
export async function findAccount(ref, pf = null) {
  if (!ref) throw new HttpError(400, 'Choose an account.');
  let s = String(ref).trim();
  const m = /^(instagram|youtube|tiktok):(.+)$/i.exec(s);
  if (m) {
    pf = m[1].toLowerCase();
    s = m[2];
  }
  s = s.replace(/^@/, '');
  const isUuid = /^[0-9a-f-]{36}$/i.test(s);
  const rows = isUuid
    ? await db()`select * from postroom.accounts where id = ${s} and status <> 'disconnected'`
    : await db()`select * from postroom.accounts where status <> 'disconnected'
        and (lower(username) = lower(${s}) or external_id = ${s})
        ${pf ? db()`and platform = ${pf}` : db()``}`;
  if (!rows.length) throw new HttpError(404, `No connected account matches "${ref}".`);
  if (rows.length > 1) throw new HttpError(400, `"${ref}" matches accounts on several platforms — write it as e.g. youtube:${s}.`);
  return rows[0];
}

/**
 * Check every target (account) against its platform's rules without saving anything.
 * input: { media_ids, cover_media_id?, caption, title?, targets: [{ account_id|account, kind?, caption?, title?, options? }] }
 */
export async function checkTargets(input) {
  const media = await loadMedia(input.media_ids || []);
  const cover = input.cover_media_id ? (await loadMedia([input.cover_media_id]))[0] : null;
  if (cover && cover.kind !== 'image') throw new HttpError(400, 'The cover must be an image.');
  if (!input.targets?.length) throw new HttpError(400, 'Choose at least one account.');
  const out = [];
  const seen = new Set();
  for (const t of input.targets) {
    const account = await findAccount(t.account_id || t.account, t.platform);
    // "next_slot": the account's next free posting slot (Accounts → Brand kit & slots).
    let slotAt = null;
    let slotError = null;
    if ((t.scheduled_at ?? input.scheduled_at) === 'next_slot') {
      try { slotAt = await nextSlot(account); } catch (e) { slotError = e.message; }
    }
    if (seen.has(account.id)) throw new HttpError(400, `@${account.username} is selected twice.`);
    seen.add(account.id);
    const p = platform(account.platform);
    const caption = t.caption ?? input.caption ?? '';
    const title = t.title ?? input.title ?? null;
    const options = { ...(input.options?.[account.platform] || {}), ...(t.options || {}) };
    // Brand kit defaults (Accounts → Brand kit): AI labels and "link the previous video", unless this post says otherwise.
    const dfl = account.brand?.defaults || {};
    if (account.platform === 'instagram' && options.ai_generated === undefined && dfl.instagram_ai_label) options.ai_generated = true;
    if (account.platform === 'youtube' && options.synthetic === undefined && dfl.youtube_synthetic) options.synthetic = true;
    if (account.platform === 'youtube' && options.link_previous === undefined && dfl.link_previous_video) options.link_previous = true;
    // A target can use its own media (e.g. YouTube gets a video made from the images Instagram posts).
    const tMedia = t.media_ids?.length ? await loadMedia(t.media_ids) : media;
    // Each account can have its own cover/thumbnail (Instagram 9:16 cover, YouTube 16:9 thumbnail).
    const tCover = t.cover_media_id === null ? null : t.cover_media_id ? (await loadMedia([t.cover_media_id]))[0] : cover;
    if (tCover && tCover.kind !== 'image') throw new HttpError(400, 'A cover or thumbnail must be an image.');
    const kind = t.kind || p.defaultKind(tMedia);
    const r = p.kinds.includes(kind)
      ? p.validate({ kind, caption, title, media: tMedia, options, cover: tCover, account })
      : { errors: [`${p.label} can't post a ${KIND_LABEL[kind] || kind}. Options: ${p.kinds.map((k) => KIND_LABEL[k]).join(', ')}.`], warnings: [] };
    if (account.status !== 'active') r.errors.unshift(`@${account.username} needs reconnecting first (Accounts).`);
    if (slotError) r.errors.unshift(slotError);
    out.push({
      account,
      platform: account.platform,
      kind,
      caption,
      title,
      options,
      media: tMedia,
      cover: tCover,
      scheduled_at: slotAt || (t.scheduled_at && t.scheduled_at !== 'next_slot' ? parseWhen(t.scheduled_at, { allowPast: true }) : null),
      errors: r.errors,
      warnings: r.warnings,
    });
  }
  return { media, cover, targets: out, ok: out.every((t) => !t.errors.length) };
}

export function summariseCheck(check) {
  return {
    ok: check.ok,
    targets: check.targets.map((t) => ({
      account_id: t.account.id,
      account: `@${t.account.username}`,
      platform: t.platform,
      kind: t.kind,
      errors: t.errors,
      warnings: t.warnings,
    })),
  };
}

/**
 * Create one post per target. mode: 'schedule' | 'now' | 'draft' | 'plan'.
 * 'plan' creates drafts inside a batch that must be approved in the app.
 */
export async function createPosts(input, { createdBy = 'app' } = {}) {
  const mode = input.mode || (input.scheduled_at && input.scheduled_at !== 'now' ? 'schedule' : 'now');
  if (!['schedule', 'now', 'draft', 'plan'].includes(mode)) throw new HttpError(400, `Unknown mode "${mode}".`);
  const when = mode === 'now' ? new Date() : input.scheduled_at === 'next_slot' ? null : parseWhen(input.scheduled_at, { allowPast: mode === 'draft' || mode === 'plan' });
  const check = await checkTargets(input);
  if (!check.ok) throw new HttpError(400, 'Some accounts have problems — fix them and try again.', summariseCheck(check));

  return db().begin(async (sql) => {
    let batchId = input.batch_id || null;
    if (mode === 'plan' && !batchId) {
      const [b] = await sql`insert into postroom.batches (title, note, created_by)
        values (${input.plan_title || 'Plan'}, ${input.plan_note || null}, ${createdBy}) returning id`;
      batchId = b.id;
    }
    const groupId = check.targets.length > 1 ? crypto.randomUUID() : null;
    const created = [];
    for (const t of check.targets) {
      const [p] = await sql`insert into postroom.posts ${sql({
        batch_id: batchId,
        group_id: groupId,
        account_id: t.account.id,
        platform: t.platform,
        kind: t.kind,
        caption: t.caption,
        title: t.title,
        media_ids: t.media.map((m) => m.id),
        cover_media_id: t.cover?.id || null,
        options: sql.json(t.options),
        scheduled_at: t.scheduled_at || when,
        status: mode === 'draft' || mode === 'plan' ? 'draft' : 'scheduled',
        created_by: createdBy,
      })} returning *`;
      created.push(p);
      await sql`insert into postroom.events (post_id, account_id, message) values (${p.id}, ${t.account.id},
        ${`${mode === 'plan' ? 'Planned' : mode === 'draft' ? 'Saved draft' : 'Scheduled'} ${KIND_LABEL[t.kind]} for ${localLabel(p.scheduled_at)} (by ${createdBy})`})`;
    }
    return { batch_id: batchId, group_id: groupId, posts: created.map((p) => ({ id: p.id, group_id: p.group_id, platform: p.platform, kind: p.kind, status: p.status, scheduled_at: p.scheduled_at })) };
  }).then(async (out) => {
    if (input.idea_id) await linkIdeaToPosts(input.idea_id, out.posts, mode);
    return out;
  });
}

function postRow(p, extra = {}) {
  return {
    id: p.id,
    group_id: p.group_id,
    batch_id: p.batch_id,
    account_id: p.account_id,
    platform: p.platform,
    kind: p.kind,
    caption: p.caption,
    title: p.title,
    media_ids: p.media_ids,
    cover_media_id: p.cover_media_id,
    options: p.options,
    scheduled_at: p.scheduled_at,
    status: p.status,
    progress: p.upload?.progress ?? null,
    inbox: !!p.upload?.inbox,
    permalink: p.permalink,
    external_id: p.external_id,
    error: p.error,
    note: p.note,
    attempts: p.attempts,
    published_at: p.published_at,
    created_by: p.created_by,
    metrics: p.metrics || {},
    metrics_at: p.metrics_at,
    insights: p.insights || {},
    insights_at: p.insights_at || null,
    ...extra,
  };
}

export async function listPosts({ from = null, to = null, status = null, platform: pf = null, account_id = null, limit = 500 } = {}) {
  const statuses = status ? String(status).split(',') : null;
  const rows = await db()`select p.*, a.username, a.name as account_name, a.profile_picture_url,
      coalesce((select c.url from postroom.media c where c.id = p.cover_media_id and c.deleted_at is null), (select coalesce(m.poster_url, case when m.kind = 'image' then m.url end) from postroom.media m where m.id = p.media_ids[1])) as thumb,
      (select m.kind from postroom.media m where m.id = p.media_ids[1]) as media_kind
    from postroom.posts p join postroom.accounts a on a.id = p.account_id
    where true
      ${from ? db()`and p.scheduled_at >= ${new Date(from)}` : db()``}
      ${to ? db()`and p.scheduled_at < ${new Date(to)}` : db()``}
      ${statuses ? db()`and p.status = any(${statuses})` : db()``}
      ${pf ? db()`and p.platform = ${pf}` : db()``}
      ${account_id ? db()`and p.account_id = ${account_id}` : db()``}
    order by p.scheduled_at ${statuses && statuses.every((s) => ['published', 'failed', 'cancelled'].includes(s)) ? db()`desc` : db()`asc`}
    limit ${Math.min(Number(limit) || 500, 1000)}`;
  return rows.map((p) => postRow(p, { username: p.username, account_name: p.account_name, avatar: p.profile_picture_url, thumb: p.thumb, media_kind: p.media_kind }));
}

export async function getPost(id) {
  const [p] = await db()`select * from postroom.posts where id = ${id}`;
  if (!p) throw new HttpError(404, 'Post not found.');
  const [a] = await db()`select * from postroom.accounts where id = ${p.account_id}`;
  const media = await db()`select * from postroom.media where id = any(${p.media_ids}::uuid[])`;
  const byId = new Map(media.map((m) => [m.id, mediaRow(m)]));
  const events = await db()`select level, message, at from postroom.events where post_id = ${id} order by at desc limit 50`;
  const history = await db()`select at, views, likes, comments, shares, saves, reach from postroom.post_metrics where post_id = ${id} order by at`;
  const siblings = p.group_id
    ? await db()`select p.id, p.platform, p.kind, p.status, a.username from postroom.posts p join postroom.accounts a on a.id = p.account_id
        where p.group_id = ${p.group_id} and p.id <> ${id}`
    : [];
  return postRow(p, {
    account: accountRow(a),
    media: p.media_ids.map((m) => byId.get(m)).filter(Boolean),
    cover: p.cover_media_id ? byId.get(p.cover_media_id) || null : null,
    events,
    metrics_history: history,
    siblings,
  });
}

async function mustGet(id) {
  const [p] = await db()`select * from postroom.posts where id = ${id}`;
  if (!p) throw new HttpError(404, 'Post not found.');
  return p;
}

export async function updatePost(id, patch, { by = 'app' } = {}) {
  const p = await mustGet(id);
  if (!EDITABLE.includes(p.status)) throw new HttpError(409, `This post is ${p.status} and can't be edited.`);
  const next = {
    kind: patch.kind ?? p.kind,
    caption: patch.caption ?? p.caption,
    title: patch.title !== undefined ? patch.title : p.title,
    options: patch.options ? { ...p.options, ...patch.options } : p.options,
    media_ids: patch.media_ids ?? p.media_ids,
    cover_media_id: patch.cover_media_id !== undefined ? patch.cover_media_id : p.cover_media_id,
    scheduled_at: patch.scheduled_at ? parseWhen(patch.scheduled_at) : p.scheduled_at,
  };
  const check = await checkTargets({
    media_ids: next.media_ids,
    cover_media_id: next.cover_media_id,
    targets: [{ account_id: p.account_id, kind: next.kind, caption: next.caption, title: next.title, options: next.options }],
  });
  if (!check.ok) throw new HttpError(400, check.targets[0].errors.join(' '), summariseCheck(check));
  const status = patch.status === 'scheduled' && p.status === 'draft' ? 'scheduled' : p.status === 'failed' && patch.scheduled_at ? 'scheduled' : p.status;
  const [row] = await db()`update postroom.posts set kind = ${next.kind}, caption = ${next.caption}, title = ${next.title},
      options = ${db().json(next.options)}, media_ids = ${next.media_ids}, cover_media_id = ${next.cover_media_id},
      scheduled_at = ${next.scheduled_at}, status = ${status},
      error = ${status === 'scheduled' ? null : p.error}, attempts = ${status === 'scheduled' && p.status === 'failed' ? 0 : p.attempts},
      upload = ${status === 'scheduled' && p.status === 'failed' ? db().json({}) : db().json(p.upload || {})},
      updated_at = now()
    where id = ${id} returning *`;
  const changed = Object.keys(patch).filter((k) => k !== 'status').join(', ');
  await logEvent({ postId: id, accountId: p.account_id, message: `Edited (${changed || 'status'}) by ${by}${status !== p.status ? `; now ${status}` : ''}` });
  return postRow(row);
}

/**
 * Turn a draft into a scheduled post (and, by default, the other drafts of the same cross-post too).
 * when: a time, "next_slot", or omitted to keep the draft's own time (if it's still in the future).
 */
export async function schedulePost(id, { scheduled_at = null, group = true, by = 'app' } = {}) {
  const p = await mustGet(id);
  const list = group && p.group_id
    ? await db()`select * from postroom.posts where group_id = ${p.group_id} and status = 'draft' order by platform`
    : [p];
  if (!list.length || list.every((x) => x.status !== 'draft')) throw new HttpError(409, `This post is ${p.status}, not a draft.`);
  const out = [];
  for (const x of list) {
    let when = scheduled_at;
    if (when === 'next_slot') {
      const [acc] = await db()`select * from postroom.accounts where id = ${x.account_id}`;
      when = (await nextSlot(acc)).toISOString();
    }
    if (!when) {
      if (new Date(x.scheduled_at) < new Date(Date.now() + 60e3)) throw new HttpError(400, 'This draft\'s time has passed — give a new time.');
      when = new Date(x.scheduled_at).toISOString();
    }
    out.push(await updatePost(x.id, { scheduled_at: when, status: 'scheduled' }, { by }));
  }
  return { scheduled: out.map((r) => ({ id: r.id, platform: r.platform, kind: r.kind, scheduled_at: r.scheduled_at, status: r.status })) };
}

export async function reschedule(id, when) {
  return updatePost(id, { scheduled_at: when });
}

export async function cancelPost(id, { by = 'app' } = {}) {
  const p = await mustGet(id);
  if (!['draft', 'scheduled', 'failed'].includes(p.status)) {
    throw new HttpError(409, p.status === 'processing' ? 'This post is uploading right now and can\'t be cancelled.' : `This post is already ${p.status}.`);
  }
  await db()`update postroom.posts set status = 'cancelled', locked_until = null, updated_at = now() where id = ${id}`;
  await logEvent({ postId: id, accountId: p.account_id, message: `Cancelled by ${by}` });
  return { ok: true };
}

export async function retryPost(id) {
  const p = await mustGet(id);
  if (p.status !== 'failed') throw new HttpError(409, 'Only failed posts can be retried.');
  await db()`update postroom.posts set status = 'scheduled', scheduled_at = now(), attempts = 0, error = null,
      upload = '{}', next_attempt_at = null, locked_until = null, processing_started_at = null, updated_at = now()
    where id = ${id}`;
  await logEvent({ postId: id, accountId: p.account_id, message: 'Retry requested' });
  return { ok: true };
}

export async function deletePost(id) {
  const p = await mustGet(id);
  if (!['draft', 'cancelled', 'failed'].includes(p.status)) throw new HttpError(409, 'Only drafts, failed and cancelled posts can be deleted.');
  await db()`delete from postroom.post_metrics where post_id = ${id}`;
  await db()`delete from postroom.posts where id = ${id}`;
  return { ok: true };
}

// ---------- plans ----------
export async function listPlans({ status = 'draft' } = {}) {
  const batches = await db()`select * from postroom.batches where status = ${status} order by created_at desc limit 50`;
  if (!batches.length) return [];
  const posts = await listPostsByBatch(batches.map((b) => b.id));
  return batches.map((b) => ({ ...b, posts: posts.filter((p) => p.batch_id === b.id) }));
}
async function listPostsByBatch(ids) {
  const rows = await db()`select p.*, a.username, a.profile_picture_url,
      coalesce((select c.url from postroom.media c where c.id = p.cover_media_id and c.deleted_at is null), (select coalesce(m.poster_url, case when m.kind = 'image' then m.url end) from postroom.media m where m.id = p.media_ids[1])) as thumb
    from postroom.posts p join postroom.accounts a on a.id = p.account_id
    where p.batch_id = any(${ids}::uuid[]) order by p.scheduled_at`;
  return rows.map((p) => postRow(p, { username: p.username, avatar: p.profile_picture_url, thumb: p.thumb }));
}

export async function approvePlan(id) {
  const [b] = await db()`select * from postroom.batches where id = ${id}`;
  if (!b || b.status !== 'draft') throw new HttpError(404, 'Plan not found or already handled.');
  const rows = await db()`update postroom.posts set status = 'scheduled',
      scheduled_at = greatest(scheduled_at, now()), updated_at = now()
    where batch_id = ${id} and status = 'draft' returning id, account_id`;
  await db()`update postroom.batches set status = 'approved', approved_at = now() where id = ${id}`;
  for (const r of rows) await logEvent({ postId: r.id, accountId: r.account_id, message: `Approved in plan "${b.title}"` });
  return { ok: true, scheduled: rows.length };
}

export async function discardPlan(id) {
  const [b] = await db()`select * from postroom.batches where id = ${id}`;
  if (!b || b.status !== 'draft') throw new HttpError(404, 'Plan not found or already handled.');
  await db()`update postroom.posts set status = 'cancelled', updated_at = now() where batch_id = ${id} and status = 'draft'`;
  await db()`update postroom.batches set status = 'discarded' where id = ${id}`;
  return { ok: true };
}

/**
 * Archive a published post (or bring it back). YouTube: the video becomes Private (or Public again).
 * Instagram does not let apps archive posts, so that is refused with how to do it in the app.
 */
export async function archivePost(id, { undo = false, by = 'app' } = {}) {
  const [p] = await db()`select * from postroom.posts where id = ${id}`;
  if (!p) throw new HttpError(404, 'Post not found.');
  if (p.status !== 'published' || !p.external_id) throw new HttpError(400, 'Only published posts can be archived.');
  if (p.platform !== 'youtube') {
    // Instagram doesn't let apps archive posts (and its API keeps listing archived ones): mark it here so analytics
    // leaves it out; the person archives it in the Instagram app.
    const [row] = await db()`update postroom.posts set archived_at = ${undo ? null : new Date()},
        upload = upload || ${db().json({ archived: !undo, archived_in: undo ? null : 'marked in Postroom' })}, updated_at = now()
      where id = ${id} returning id, platform, external_id, permalink, upload`;
    await logEvent({ postId: id, accountId: p.account_id, message: `${undo ? 'Unarchived' : 'Archived'} in Postroom by ${by} (Instagram itself is changed in the app)` });
    return { ...row, privacy: null, note: undo ? null : 'Left out of analytics. Instagram doesn\'t let apps archive posts: archive it in the Instagram app too (post → ⋯ → Archive).' };
  }
  const [account] = await db()`select * from postroom.accounts where id = ${p.account_id}`;
  const { accessToken } = await import('./accounts.js');
  const { setPrivacy } = await import('./platforms/youtube.js');
  const r = await setPrivacy({ token: await accessToken(account), videoId: p.external_id, privacy: undo ? 'public' : 'private' });
  const [row] = await db()`update postroom.posts set options = options || ${db().json({ privacy: r.to })}, archived_at = ${undo ? null : new Date()},
      upload = upload || ${db().json({ archived: !undo, archived_at: undo ? null : new Date().toISOString() })}, updated_at = now()
    where id = ${id} returning id, platform, external_id, permalink, options, upload`;
  await logEvent({ postId: id, accountId: p.account_id, message: `${undo ? 'Unarchived' : 'Archived'} on YouTube (${r.from} → ${r.to}) by ${by}` });
  return { ...row, privacy: r.to };
}

/**
 * Posts archived in the Instagram app disappear from the account's media list; mark them archived (and bring
 * them back if they are unarchived) so analytics only counts what is live.
 */
export async function syncInstagramArchive() {
  const { accessToken } = await import('./accounts.js');
  const { igGet } = await import('./platforms/instagram.js');
  const accounts = await db()`select * from postroom.accounts where platform = 'instagram' and status = 'active'`;
  const out = {};
  for (const a of accounts) {
    try {
      const r = await igGet(`${a.external_id}/media`, await accessToken(a), { fields: 'id,timestamp', limit: 100 }, a);
      const live = new Set((r.data || []).map((m) => String(m.id)));
      if (!live.size) continue;
      const oldest = new Date(Math.min(...(r.data || []).map((m) => new Date(String(m.timestamp).replace(/([+-]\d\d)(\d\d)$/, '$1:$2')).getTime())));
      const ours = await db()`select id, external_id, archived_at, upload from postroom.posts where account_id = ${a.id} and status = 'published'
        and kind <> 'story' and external_id is not null and published_at >= ${oldest}`;
      let archived = 0, restored = 0;
      for (const p of ours) {
        const isLive = live.has(String(p.external_id));
        if (!isLive && !p.archived_at) {
          await db()`update postroom.posts set archived_at = now(), upload = upload || ${db().json({ archived: true, archived_in: 'instagram app' })} where id = ${p.id}`;
          await logEvent({ postId: p.id, accountId: a.id, message: 'Archived or deleted in the Instagram app: left out of analytics' });
          archived++;
        } else if (isLive && p.archived_at && p.upload?.archived_in === 'instagram app') { // only undo what this sync detected
          await db()`update postroom.posts set archived_at = null, upload = upload || ${db().json({ archived: false })} where id = ${p.id}`;
          restored++;
        }
      }
      out[a.username] = { archived, restored };
    } catch (e) { out[a.username] = { error: e.message }; }
  }
  return out;
}
