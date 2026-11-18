// Planner: references, mood boards, idea pipeline and series — the planning side of Postroom.
import { db, HttpError, fetchT, logEvent } from './core.js';
import { putFile } from './storage.js';

export const STAGES = ['idea', 'scripting', 'producing', 'ready', 'scheduled', 'posted', 'dropped'];
const str = (v, max = 5000) => (v == null || v === '' ? null : String(v).slice(0, max));
const tagList = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(','))
  .map((t) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 20);

// ---------- brands ----------
/** Brand names: from each account's brand kit name, plus anything already used in the planner. */
export async function listBrands() {
  const accts = await db()`select username, platform, brand from postroom.accounts where status <> 'disconnected' order by connected_at`;
  const names = new Map();
  for (const a of accts) {
    const n = a.brand?.name;
    if (!n) continue;
    if (!names.has(n)) names.set(n, []);
    names.get(n).push(`${a.platform}:${a.username}`);
  }
  const used = await db()`select brand from postroom.plan_series where brand is not null
    union select brand from postroom.plan_ideas where brand is not null
    union select brand from postroom.plan_boards where brand is not null`;
  for (const u of used) if (!names.has(u.brand)) names.set(u.brand, []);
  return [...names.entries()].map(([name, accounts]) => ({ name, accounts }));
}

// ---------- link previews ----------
function platformOf(url) {
  const h = new URL(url).hostname.replace(/^www\./, '');
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'youtube';
  if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
  return 'web';
}
const meta = (html, prop) => {
  const m = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html)
    || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i').exec(html);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'") : null;
};
async function getJson(url) {
  const r = await fetchT(url, { headers: { accept: 'application/json' } }, 10000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
/** Copy a remote thumbnail into our storage (Instagram/TikTok image links expire). */
async function keepThumb(src, name) {
  if (!src) return null;
  try {
    const r = await fetchT(src, {}, 15000);
    if (!r.ok) return src;
    const type = r.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 5e6) return src;
    const stored = await putFile(`refs/${name}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'}`, buf, type);
    return stored.url;
  } catch {
    return src;
  }
}

/** Title, author and thumbnail for a link. Best effort: never throws. */
export async function linkPreview(url) {
  let platform = 'web';
  try { platform = platformOf(url); } catch { throw new HttpError(400, 'That doesn’t look like a link.'); }
  const out = { url, platform, title: null, author: null, thumb_url: null };
  try {
    if (platform === 'youtube') {
      const j = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      Object.assign(out, { title: j.title, author: j.author_name, thumb_url: j.thumbnail_url });
    } else if (platform === 'tiktok') {
      const j = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
      Object.assign(out, { title: j.title, author: j.author_name, thumb_url: j.thumbnail_url });
    } else {
      const r = await fetchT(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; facebookexternalhit/1.1)', accept: 'text/html' } }, 10000);
      if (r.ok) {
        const html = (await r.text()).slice(0, 400000);
        out.title = meta(html, 'og:title') || (/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || null;
        out.thumb_url = meta(html, 'og:image');
        const desc = meta(html, 'og:description');
        if (platform === 'instagram') {
          const who = /@([\w.]+)/.exec(out.title || '') || /-\s*([\w.]+)\s+on/i.exec(desc || '') || /^([\w.]+)\s+on Instagram/i.exec(out.title || '');
          out.author = who ? who[1] : null;
          if (desc) out.title = desc.replace(/^[\d,.KkMm]+ likes?, [\d,.KkMm]+ comments? - [\w.]+ on [^:]+: /, '').slice(0, 300);
        }
      }
    }
  } catch { /* keep what we have */ }
  if (out.title) out.title = String(out.title).replace(/\s+/g, ' ').trim().slice(0, 300);
  if (out.thumb_url) out.thumb_url = await keepThumb(out.thumb_url, `${platform}-${Date.now().toString(36)}`);
  return out;
}

// ---------- references ----------
export async function listRefs({ brand = null, tag = null, q = '', status = 'kept', idea_id = null, limit = 200 } = {}) {
  return db()`select * from postroom.plan_refs where true
    ${status && status !== 'all' ? db()`and status = ${status}` : db()`and status <> 'discarded'`}
    ${brand ? db()`and (brand = ${brand} or brand is null)` : db()``}
    ${tag ? db()`and ${String(tag).toLowerCase()} = any(tags)` : db()``}
    ${idea_id ? db()`and idea_id = ${idea_id}` : db()``}
    ${q ? db()`and (title ilike ${`%${q}%`} or note ilike ${`%${q}%`} or author ilike ${`%${q}%`} or array_to_string(tags, ' ') ilike ${`%${q}%`})` : db()``}
    order by created_at desc limit ${Math.min(Number(limit) || 200, 500)}`;
}

export async function createRef(input, { source = 'app' } = {}) {
  let row = {
    brand: str(input.brand, 120),
    kind: ['link', 'image', 'note', 'color'].includes(input.kind) ? input.kind : input.url ? 'link' : input.color ? 'color' : 'note',
    url: str(input.url, 2000),
    platform: input.platform || null,
    title: str(input.title, 300),
    author: str(input.author, 120),
    thumb_url: str(input.thumb_url, 2000),
    note: str(input.note),
    color: str(input.color, 20),
    tags: tagList(input.tags),
    research_post_id: input.research_post_id || null,
    idea_id: input.idea_id || null,
    status: input.status === 'suggested' ? 'suggested' : 'kept',
    source,
  };
  if (row.research_post_id) {
    const [rp] = await db()`select * from postroom.research_posts where id = ${row.research_post_id}`;
    if (!rp) throw new HttpError(404, 'Research post not found.');
    row = { ...row, kind: 'link', url: row.url || rp.url, platform: rp.platform, author: row.author || rp.author,
      title: row.title || str((rp.caption || '').split('\n')[0], 300), thumb_url: row.thumb_url || rp.thumb_url };
  } else if (row.kind === 'link') {
    if (!row.url || !/^https?:\/\//.test(row.url)) throw new HttpError(400, 'Give a link starting with https://');
    if (!row.title || !row.thumb_url) {
      const p = await linkPreview(row.url);
      row = { ...row, platform: row.platform || p.platform, title: row.title || p.title, author: row.author || p.author, thumb_url: row.thumb_url || p.thumb_url };
    }
  } else if (row.kind === 'image') {
    if (!row.url) throw new HttpError(400, 'Upload an image first.');
    row.platform = row.platform || 'upload';
    row.thumb_url = row.thumb_url || row.url;
  } else if (row.kind === 'color') {
    if (!/^#?[0-9a-f]{3,8}$/i.test(row.color || '')) throw new HttpError(400, 'Give a colour like #1a2b3c.');
    row.color = row.color.startsWith('#') ? row.color : `#${row.color}`;
  } else if (!row.note && !row.title) throw new HttpError(400, 'Write a note.');
  const [r] = await db()`insert into postroom.plan_refs ${db()(row)} returning *`;
  if (input.board_id) await addBoardItem(input.board_id, { kind: 'ref', ref_id: r.id });
  return r;
}

export async function updateRef(id, patch) {
  const [cur] = await db()`select * from postroom.plan_refs where id = ${id}`;
  if (!cur) throw new HttpError(404, 'Reference not found.');
  const next = {
    brand: patch.brand !== undefined ? str(patch.brand, 120) : cur.brand,
    title: patch.title !== undefined ? str(patch.title, 300) : cur.title,
    note: patch.note !== undefined ? str(patch.note) : cur.note,
    tags: patch.tags !== undefined ? tagList(patch.tags) : cur.tags,
    status: ['kept', 'suggested', 'discarded'].includes(patch.status) ? patch.status : cur.status,
    idea_id: patch.idea_id !== undefined ? patch.idea_id || null : cur.idea_id,
  };
  const [r] = await db()`update postroom.plan_refs set ${db()(next)} where id = ${id} returning *`;
  return r;
}
export async function deleteRef(id) {
  await db()`delete from postroom.plan_refs where id = ${id}`;
  return { ok: true };
}
export async function refTags() {
  return db()`select t as tag, count(*)::int as n from postroom.plan_refs, unnest(tags) t where status = 'kept' group by t order by n desc, t limit 100`;
}

// ---------- boards ----------
export async function listBoards({ brand = null } = {}) {
  return db()`select b.*, s.name as series_name,
      (select count(*)::int from postroom.plan_board_items i where i.board_id = b.id) as items,
      (select array_agg(t) from (select coalesce(r.thumb_url, i.content->>'thumb_url', i.content->>'url') as t
         from postroom.plan_board_items i left join postroom.plan_refs r on r.id = i.ref_id
         where i.board_id = b.id and coalesce(r.thumb_url, i.content->>'thumb_url', case when i.kind = 'image' then i.content->>'url' end) is not null
         order by i.z desc limit 4) x) as previews
    from postroom.plan_boards b left join postroom.plan_series s on s.id = b.series_id
    where true ${brand ? db()`and b.brand = ${brand}` : db()``}
    order by b.updated_at desc`;
}
export async function createBoard(input, { by = 'app' } = {}) {
  if (!input.name || !String(input.name).trim()) throw new HttpError(400, 'Name the board.');
  const [b] = await db()`insert into postroom.plan_boards (brand, name, description, series_id, created_by)
    values (${str(input.brand, 120)}, ${String(input.name).trim().slice(0, 120)}, ${str(input.description)}, ${input.series_id || null}, ${by}) returning *`;
  if (input.idea_id) await db()`update postroom.plan_ideas set board_id = ${b.id}, updated_at = now() where id = ${input.idea_id}`;
  return b;
}
export async function getBoard(id) {
  const [b] = await db()`select * from postroom.plan_boards where id = ${id}`;
  if (!b) throw new HttpError(404, 'Board not found.');
  const items = await db()`select i.*, row_to_json(r.*) as ref from postroom.plan_board_items i
    left join postroom.plan_refs r on r.id = i.ref_id where i.board_id = ${id} order by i.z, i.created_at`;
  return { ...b, items };
}
export async function updateBoard(id, patch) {
  const [b] = await db()`update postroom.plan_boards set
      name = coalesce(${patch.name ? String(patch.name).slice(0, 120) : null}, name),
      description = ${patch.description !== undefined ? str(patch.description) : db()`description`},
      brand = ${patch.brand !== undefined ? str(patch.brand, 120) : db()`brand`},
      series_id = ${patch.series_id !== undefined ? patch.series_id || null : db()`series_id`},
      updated_at = now()
    where id = ${id} returning *`;
  if (!b) throw new HttpError(404, 'Board not found.');
  return b;
}
export async function deleteBoard(id) {
  await db()`delete from postroom.plan_boards where id = ${id}`;
  return { ok: true };
}

export async function addBoardItem(boardId, input) {
  const [b] = await db()`select id from postroom.plan_boards where id = ${boardId}`;
  if (!b) throw new HttpError(404, 'Board not found.');
  const kind = ['ref', 'image', 'note', 'color', 'link'].includes(input.kind) ? input.kind : 'note';
  if (kind === 'ref' && !input.ref_id) throw new HttpError(400, 'Which reference?');
  const [{ z }] = await db()`select coalesce(max(z), 0) + 1 as z from postroom.plan_board_items where board_id = ${boardId}`;
  const [{ n }] = await db()`select count(*)::int as n from postroom.plan_board_items where board_id = ${boardId}`;
  // place new items in a loose grid so nothing lands on top of something else
  const col = n % 5;
  const row = Math.floor(n / 5);
  const size = kind === 'color' ? { w: 140, h: 140 } : kind === 'note' ? { w: 240, h: 160 } : { w: 220, h: 280 };
  const content = {};
  for (const k of ['text', 'color', 'url', 'thumb_url', 'title']) if (input[k] != null) content[k] = String(input[k]).slice(0, k === 'text' ? 5000 : 2000);
  if (input.content && typeof input.content === 'object') Object.assign(content, input.content);
  const [it] = await db()`insert into postroom.plan_board_items (board_id, kind, ref_id, content, x, y, w, h, z)
    values (${boardId}, ${kind}, ${input.ref_id || null}, ${db().json(content)},
      ${Number.isFinite(+input.x) ? Math.round(+input.x) : 40 + col * 250}, ${Number.isFinite(+input.y) ? Math.round(+input.y) : 40 + row * 310},
      ${Math.round(+input.w || size.w)}, ${Math.round(+input.h || size.h)}, ${z}) returning *`;
  await db()`update postroom.plan_boards set updated_at = now() where id = ${boardId}`;
  return it;
}
export async function updateBoardItem(id, patch) {
  const num = (v) => (Number.isFinite(+v) ? Math.round(+v) : null);
  const [it] = await db()`update postroom.plan_board_items set
      x = coalesce(${num(patch.x)}, x), y = coalesce(${num(patch.y)}, y),
      w = coalesce(${num(patch.w) && Math.max(60, num(patch.w))}, w), h = coalesce(${num(patch.h) && Math.max(40, num(patch.h))}, h),
      z = coalesce(${num(patch.z)}, z),
      content = case when ${patch.content ? true : false} then content || ${db().json(patch.content || {})} else content end
    where id = ${id} returning *`;
  if (!it) throw new HttpError(404, 'Item not found.');
  await db()`update postroom.plan_boards set updated_at = now() where id = ${it.board_id}`;
  return it;
}
export async function deleteBoardItem(id) {
  await db()`delete from postroom.plan_board_items where id = ${id}`;
  return { ok: true };
}

// ---------- series ----------
export async function listSeries({ brand = null } = {}) {
  return db()`select s.*,
      (select count(*)::int from postroom.plan_ideas i where i.series_id = s.id and i.stage <> 'dropped') as episodes,
      (select count(*)::int from postroom.plan_ideas i where i.series_id = s.id and i.stage = 'posted') as posted,
      (select max(episode) from postroom.plan_ideas i where i.series_id = s.id) as last_episode
    from postroom.plan_series s where true ${brand ? db()`and s.brand = ${brand}` : db()``}
    order by s.brand, s.sort, s.created_at`;
}
const SERIES_FIELDS = ['brand', 'name', 'description', 'format', 'cadence', 'next_note', 'status', 'sort'];
export async function createSeries(input) {
  if (!input.brand || !input.name) throw new HttpError(400, 'A series needs a brand and a name.');
  const row = Object.fromEntries(SERIES_FIELDS.filter((k) => input[k] !== undefined).map((k) => [k, k === 'sort' ? Number(input[k]) || 0 : str(input[k], 2000)]));
  const [s] = await db()`insert into postroom.plan_series ${db()(row)}
    on conflict (brand, name) do update set description = coalesce(excluded.description, postroom.plan_series.description),
      format = coalesce(excluded.format, postroom.plan_series.format), cadence = coalesce(excluded.cadence, postroom.plan_series.cadence), updated_at = now()
    returning *`;
  return s;
}
export async function updateSeries(id, patch) {
  const row = Object.fromEntries(SERIES_FIELDS.filter((k) => patch[k] !== undefined).map((k) => [k, k === 'sort' ? Number(patch[k]) || 0 : str(patch[k], 2000)]));
  if (row.status && !['active', 'paused', 'ended'].includes(row.status)) throw new HttpError(400, 'Status is active, paused or ended.');
  if (!Object.keys(row).length) throw new HttpError(400, 'Nothing to change.');
  const [s] = await db()`update postroom.plan_series set ${db()(row)}, updated_at = now() where id = ${id} returning *`;
  if (!s) throw new HttpError(404, 'Series not found.');
  return s;
}
export async function deleteSeries(id) {
  await db()`delete from postroom.plan_series where id = ${id}`;
  return { ok: true };
}

// ---------- ideas ----------
export async function listIdeas({ brand = null, stage = null, series_id = null, q = '' } = {}) {
  const stages = stage ? String(stage).split(',') : null;
  return db()`select i.*, s.name as series_name,
      (select count(*)::int from postroom.plan_refs r where r.idea_id = i.id and r.status = 'kept') as refs,
      coalesce(
        (select coalesce(m.poster_url, case when m.kind = 'image' then m.url end) from postroom.posts p join postroom.media m on m.id = p.media_ids[1] where p.id = i.post_id),
        (select r.thumb_url from postroom.plan_refs r where r.idea_id = i.id and r.thumb_url is not null order by r.created_at limit 1),
        (select coalesce(r.thumb_url, it.content->>'thumb_url', it.content->>'url') from postroom.plan_board_items it left join postroom.plan_refs r on r.id = it.ref_id
           where it.board_id = i.board_id and (it.kind in ('image', 'ref')) order by it.z desc limit 1)
      ) as thumb,
      (select p.scheduled_at from postroom.posts p where p.id = i.post_id) as post_at,
      (select p.status from postroom.posts p where p.id = i.post_id) as post_status
    from postroom.plan_ideas i left join postroom.plan_series s on s.id = i.series_id
    where true
      ${brand ? db()`and i.brand = ${brand}` : db()``}
      ${stages ? db()`and i.stage = any(${stages})` : db()``}
      ${series_id ? db()`and i.series_id = ${series_id}` : db()``}
      ${q ? db()`and (i.title ilike ${`%${q}%`} or i.hook ilike ${`%${q}%`} or i.notes ilike ${`%${q}%`})` : db()``}
    order by i.sort, i.created_at`;
}
export async function getIdea(id) {
  const [i] = await listIdeasById(id);
  if (!i) throw new HttpError(404, 'Idea not found.');
  const refs = await db()`select * from postroom.plan_refs where idea_id = ${id} and status <> 'discarded' order by created_at`;
  const posts = await db()`select p.id, p.platform, p.kind, p.status, p.scheduled_at, p.permalink, a.username from postroom.posts p
    join postroom.accounts a on a.id = p.account_id where p.idea_id = ${id} and p.status <> 'cancelled' order by p.platform`;
  return { ...i, refs, posts };
}
async function listIdeasById(id) {
  return db()`select i.*, s.name as series_name from postroom.plan_ideas i left join postroom.plan_series s on s.id = i.series_id where i.id = ${id}`;
}
const IDEA_TEXT = ['brand', 'title', 'hook', 'notes', 'choice_a', 'choice_b', 'choice_result'];
function ideaRow(input, partial = false) {
  const row = {};
  for (const k of IDEA_TEXT) if (input[k] !== undefined) row[k] = str(input[k], k === 'notes' ? 20000 : 2000);
  if (input.stage !== undefined) {
    if (!STAGES.includes(input.stage)) throw new HttpError(400, `Stage is one of: ${STAGES.join(', ')}.`);
    row.stage = input.stage;
  }
  if (input.series_id !== undefined) row.series_id = input.series_id || null;
  if (input.board_id !== undefined) row.board_id = input.board_id || null;
  if (input.episode !== undefined) row.episode = input.episode === null || input.episode === '' ? null : Number(input.episode);
  if (input.due_date !== undefined) row.due_date = input.due_date || null;
  if (input.formats !== undefined) row.formats = tagList(input.formats);
  if (input.sort !== undefined) row.sort = Number(input.sort) || 0;
  if (!partial && !row.title) throw new HttpError(400, 'Give the idea a title.');
  return row;
}
export async function createIdea(input, { by = 'app' } = {}) {
  const row = { ...ideaRow(input), created_by: by };
  if (row.series_id && row.episode == null) {
    const [{ n }] = await db()`select coalesce(max(episode), 0) + 1 as n from postroom.plan_ideas where series_id = ${row.series_id}`;
    row.episode = n;
  }
  if (row.series_id && !row.brand) {
    const [s] = await db()`select brand from postroom.plan_series where id = ${row.series_id}`;
    row.brand = s?.brand || null;
  }
  const [{ s }] = await db()`select coalesce(max(sort), 0) + 1 as s from postroom.plan_ideas where stage = ${row.stage || 'idea'}`;
  row.sort = row.sort ?? s;
  const [i] = await db()`insert into postroom.plan_ideas ${db()(row)} returning *`;
  if (Array.isArray(input.ref_ids) && input.ref_ids.length) await db()`update postroom.plan_refs set idea_id = ${i.id} where id = any(${input.ref_ids}::uuid[])`;
  return i;
}
export async function updateIdea(id, patch) {
  const row = ideaRow(patch, true);
  if (!Object.keys(row).length && !patch.ref_ids) throw new HttpError(400, 'Nothing to change.');
  let i;
  if (Object.keys(row).length) [i] = await db()`update postroom.plan_ideas set ${db()(row)}, updated_at = now() where id = ${id} returning *`;
  else [i] = await db()`select * from postroom.plan_ideas where id = ${id}`;
  if (!i) throw new HttpError(404, 'Idea not found.');
  if (Array.isArray(patch.ref_ids)) await db()`update postroom.plan_refs set idea_id = ${id} where id = any(${patch.ref_ids}::uuid[])`;
  return i;
}
export async function deleteIdea(id) {
  await db()`delete from postroom.plan_ideas where id = ${id}`;
  return { ok: true };
}

/** Called when posts are created for an idea, and when one is published. */
export async function linkIdeaToPosts(ideaId, posts, mode) {
  if (!ideaId || !posts.length) return;
  const stage = mode === 'draft' || mode === 'plan' ? 'ready' : 'scheduled';
  await db()`update postroom.posts set idea_id = ${ideaId} where id = any(${posts.map((p) => p.id)}::uuid[])`;
  await db()`update postroom.plan_ideas set post_id = ${posts[0].id}, post_group_id = ${posts[0].group_id || null},
      stage = case when stage in ('posted') then stage else ${stage} end, updated_at = now() where id = ${ideaId}`;
}
export async function ideaPublished(post) {
  if (!post.idea_id) return;
  const [i] = await db()`update postroom.plan_ideas set stage = 'posted', updated_at = now() where id = ${post.idea_id} and stage <> 'posted' returning title`;
  if (i) await logEvent({ postId: post.id, message: `Idea "${i.title}" is now posted` });
}

/** One-call snapshot for Claude: brands, series, ideas by stage, boards, reference counts. */
export async function overview({ brand = null } = {}) {
  // one after another: parallel queries can stall on the pooled serverless connection
  const brands = await listBrands();
  const series = await listSeries({ brand });
  const ideas = await listIdeas({ brand });
  const boards = await listBoards({ brand });
  const [refs] = brand
    ? await db()`select count(*) filter (where status = 'kept')::int as kept, count(*) filter (where status = 'suggested')::int as suggested from postroom.plan_refs where brand = ${brand} or brand is null`
    : await db()`select count(*) filter (where status = 'kept')::int as kept, count(*) filter (where status = 'suggested')::int as suggested from postroom.plan_refs`;
  const byStage = Object.fromEntries(STAGES.map((s) => [s, ideas.filter((i) => i.stage === s).map((i) => ({ id: i.id, title: i.title, brand: i.brand, series: i.series_name, episode: i.episode, choice_result: i.choice_result, due_date: i.due_date }))]));
  return {
    brands,
    series: series.map((s) => ({ id: s.id, brand: s.brand, name: s.name, format: s.format, cadence: s.cadence, status: s.status, episodes: s.episodes, posted: s.posted, last_episode: s.last_episode, next_note: s.next_note })),
    ideas: byStage,
    boards: boards.map((b) => ({ id: b.id, name: b.name, brand: b.brand, series: b.series_name, items: b.items })),
    references: refs,
  };
}
