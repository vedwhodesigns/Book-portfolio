// Research extension.
//  • ig-research (the Mac toolkit) collects Instagram niche/competitor data in a logged-in
//    browser and pushes it here with scripts/push-to-postroom.js.
//  • YouTube channels can be looked up directly through the official YouTube Data API,
//    using any connected YouTube account.
import { db, HttpError, PlatformError, fetchT, readJson, logEvent } from './core.js';
import { putFile } from './storage.js';
import { accessToken } from './accounts.js';
import { igGet } from './platforms/instagram.js';

const n = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
const str = (v, max = 20000) => (v == null ? null : String(v).slice(0, max));

/** Drop machine-specific bits (absolute file paths) from a measure record. */
function cleanMeasure(m) {
  if (!m || typeof m !== 'object') return null;
  const { source, ...rest } = m;
  return rest;
}

async function upsertProject({ source = 'ig-research', name, niche = null, searchTerms = [], competitors = [], scrapedAt = null, meta = {} }) {
  if (!name) throw new HttpError(400, 'project.name is required.');
  const [p] = await db()`insert into postroom.research_projects (source, name, niche, search_terms, competitors, scraped_at, meta)
    values (${source}, ${String(name).slice(0, 200)}, ${str(niche, 500)}, ${(searchTerms || []).map(String).slice(0, 100)},
      ${(competitors || []).map(String).slice(0, 200)}, ${scrapedAt ? new Date(scrapedAt) : null}, ${db().json(meta || {})})
    on conflict (source, name) do update set niche = coalesce(excluded.niche, postroom.research_projects.niche),
      search_terms = case when cardinality(excluded.search_terms) > 0 then excluded.search_terms else postroom.research_projects.search_terms end,
      competitors = case when cardinality(excluded.competitors) > 0 then excluded.competitors else postroom.research_projects.competitors end,
      scraped_at = coalesce(excluded.scraped_at, postroom.research_projects.scraped_at),
      meta = postroom.research_projects.meta || excluded.meta, updated_at = now()
    returning *`;
  return p;
}

/**
 * Accepts one batch from push-to-postroom.js:
 * { project: {name, niche, searchTerms, competitors, scrapedAt}, posts: [{ postId, url, author, source, type, date,
 *   caption|fullCaption, likesNum, commentsNum, sharesNum, viewsNum, transcript, thumb_b64, teardown: {teardown, measure, model} }] }
 */
export async function ingest(body) {
  const posts = Array.isArray(body.posts) ? body.posts : [];
  if (posts.length > 50) throw new HttpError(413, 'Send at most 50 posts per request.');
  const project = await upsertProject(body.project || {});
  let saved = 0;
  const ids = {};
  for (const p of posts) {
    const id = String(p.postId || p.external_id || '').trim();
    if (!id) continue;
    let thumb = null;
    if (p.thumb_b64) {
      const buf = Buffer.from(String(p.thumb_b64), 'base64');
      if (buf.length > 0 && buf.length < 1.5e6) {
        const [existing] = await db()`select thumb_url from postroom.research_posts where project_id = ${project.id} and external_id = ${id}`;
        thumb = existing?.thumb_url || (await putFile(`research/${id.replace(/[^\w-]/g, '')}.jpg`, buf, 'image/jpeg')).url;
      }
    }
    const t = p.teardown && typeof p.teardown === 'object' ? p.teardown : null;
    const row = {
      project_id: project.id,
      platform: ['instagram', 'youtube', 'tiktok'].includes(p.platform) ? p.platform : 'instagram',
      external_id: id,
      url: str(p.url, 1000),
      author: str((p.author || '').replace(/^@/, ''), 200) || null,
      source: str(p.source, 300),
      type: str(p.type, 40),
      posted_at: p.date ? new Date(p.date) : null,
      caption: str(p.fullCaption || p.caption, 5000),
      likes: n(p.likesNum ?? p.likes),
      comments: n(p.commentsNum ?? p.comments),
      shares: n(p.sharesNum ?? p.shares),
      views: n(p.viewsNum ?? p.views),
      duration_s: t?.measure?.duration_seconds ?? p.duration_s ?? null,
      transcript: str(p.transcript, 50000),
      thumb_url: thumb || (/^https:\/\//.test(p.thumb_url || '') ? str(p.thumb_url, 1000) : null),
      teardown: t?.teardown ? db().json(t.teardown) : null,
      measure: (t?.measure || p.measure) ? db().json(cleanMeasure(t?.measure || p.measure)) : null,
      model: str(t?.model, 100),
    };
    if (row.posted_at && Number.isNaN(row.posted_at.getTime())) row.posted_at = null;
    await db()`insert into postroom.research_posts ${db()(row)}
      on conflict (project_id, external_id) do update set
        url = coalesce(excluded.url, postroom.research_posts.url),
        author = coalesce(excluded.author, postroom.research_posts.author),
        source = coalesce(excluded.source, postroom.research_posts.source),
        type = coalesce(excluded.type, postroom.research_posts.type),
        posted_at = coalesce(excluded.posted_at, postroom.research_posts.posted_at),
        caption = coalesce(excluded.caption, postroom.research_posts.caption),
        likes = coalesce(excluded.likes, postroom.research_posts.likes),
        comments = coalesce(excluded.comments, postroom.research_posts.comments),
        shares = coalesce(excluded.shares, postroom.research_posts.shares),
        views = coalesce(excluded.views, postroom.research_posts.views),
        duration_s = coalesce(excluded.duration_s, postroom.research_posts.duration_s),
        transcript = coalesce(excluded.transcript, postroom.research_posts.transcript),
        thumb_url = coalesce(excluded.thumb_url, postroom.research_posts.thumb_url),
        teardown = coalesce(excluded.teardown, postroom.research_posts.teardown),
        measure = coalesce(excluded.measure, postroom.research_posts.measure),
        model = coalesce(excluded.model, postroom.research_posts.model),
        updated_at = now()
      returning id`.then(([x]) => { ids[id] = x.id; });
    saved++;
  }
  await db()`update postroom.research_projects set updated_at = now() where id = ${project.id}`;
  return { project_id: project.id, saved, ids };
}

export async function listProjects() {
  return db()`select p.id, p.source, p.name, p.niche, p.search_terms, p.competitors, p.scraped_at, p.updated_at,
      count(r.id)::int as posts, count(distinct r.author)::int as creators,
      count(r.teardown)::int as teardowns,
      (select r2.thumb_url from postroom.research_posts r2 where r2.project_id = p.id and r2.thumb_url is not null
        order by r2.views desc nulls last limit 1) as cover
    from postroom.research_projects p left join postroom.research_posts r on r.project_id = p.id
    group by p.id order by p.updated_at desc`;
}

export async function projectOverview(id) {
  const [p] = await db()`select * from postroom.research_projects where id = ${id}`;
  if (!p) throw new HttpError(404, 'Research project not found.');
  const [stats] = await db()`select count(*)::int as posts, count(distinct author)::int as creators, count(teardown)::int as teardowns,
      percentile_cont(0.5) within group (order by views) as median_views,
      percentile_cont(0.5) within group (order by likes) as median_likes,
      count(*) filter (where type = 'reel')::int as reels
    from postroom.research_posts where project_id = ${id}`;
  const creators = await db()`select author, count(*)::int as posts,
      round(percentile_cont(0.5) within group (order by views))::bigint as median_views,
      max(views) as best_views, round(avg(likes))::bigint as avg_likes,
      mode() within group (order by teardown->'hook'->>'hook_type') as top_hook
    from postroom.research_posts where project_id = ${id} and author is not null
    group by author order by median_views desc nulls last, posts desc limit 50`;
  const hooks = await db()`select teardown->'hook'->>'hook_type' as hook_type, count(*)::int as posts,
      round(percentile_cont(0.5) within group (order by views))::bigint as median_views
    from postroom.research_posts where project_id = ${id} and teardown is not null
    group by 1 order by median_views desc nulls last`;
  const formats = await db()`select teardown->'idea'->>'format' as format, count(*)::int as posts
    from postroom.research_posts where project_id = ${id} and teardown is not null group by 1 order by 2 desc limit 20`;
  const num = (x) => (x == null ? null : Number(x));
  return {
    project: p,
    stats: { ...stats, median_views: num(stats.median_views), median_likes: num(stats.median_likes) },
    creators: creators.map((c) => ({ ...c, median_views: num(c.median_views), best_views: num(c.best_views), avg_likes: num(c.avg_likes) })),
    hooks: hooks.map((h) => ({ ...h, median_views: num(h.median_views) })),
    formats,
  };
}

const SORTS = {
  views: db => db`views desc nulls last`,
  likes: db => db`likes desc nulls last`,
  comments: db => db`comments desc nulls last`,
  recent: db => db`posted_at desc nulls last`,
  pace: db => db`(measure->>'cuts_per_10_seconds')::numeric desc nulls last`,
};

export async function searchPosts({ project_id = null, q = '', author = '', hook_type = '', format = '', type = '', teardown_only = false, sort = 'views', limit = 60 } = {}) {
  const sql = db();
  const rows = await sql`select r.id, r.project_id, r.platform, r.external_id, r.url, r.author, r.type, r.posted_at, r.likes, r.comments,
      r.shares, r.views, r.duration_s, r.thumb_url, left(r.caption, 300) as caption,
      r.teardown->'hook'->>'hook_type' as hook_type, r.teardown->'idea'->>'format' as format,
      r.teardown->'idea'->>'topic' as topic, r.teardown->'hook'->>'first_3s_spoken' as hook_line,
      (r.measure->>'cuts_per_10_seconds')::numeric as cuts_per_10s, r.teardown is not null as has_teardown, p.name as project
    from postroom.research_posts r join postroom.research_projects p on p.id = r.project_id
    where true
      ${project_id ? sql`and r.project_id = ${project_id}` : sql``}
      ${author ? sql`and lower(r.author) = lower(${String(author).replace(/^@/, '')})` : sql``}
      ${hook_type ? sql`and r.teardown->'hook'->>'hook_type' = ${hook_type}` : sql``}
      ${format ? sql`and r.teardown->'idea'->>'format' = ${format}` : sql``}
      ${type ? sql`and r.type = ${type}` : sql``}
      ${teardown_only === true || teardown_only === 'true' ? sql`and r.teardown is not null` : sql``}
      ${q ? sql`and (r.caption ilike ${`%${q}%`} or r.transcript ilike ${`%${q}%`} or r.author ilike ${`%${q}%`} or r.teardown::text ilike ${`%${q}%`})` : sql``}
    order by ${(SORTS[sort] || SORTS.views)(sql)}
    limit ${Math.min(Number(limit) || 60, 300)}`;
  return rows.map((r) => ({ ...r, likes: r.likes == null ? null : Number(r.likes), comments: r.comments == null ? null : Number(r.comments), shares: r.shares == null ? null : Number(r.shares), views: r.views == null ? null : Number(r.views), cuts_per_10s: r.cuts_per_10s == null ? null : Number(r.cuts_per_10s), duration_s: r.duration_s == null ? null : Number(r.duration_s) }));
}

export async function getResearchPost(id) {
  const [r] = await db()`select r.*, p.name as project from postroom.research_posts r join postroom.research_projects p on p.id = r.project_id where r.id = ${id}`;
  if (!r) throw new HttpError(404, 'Research post not found.');
  for (const k of ['likes', 'comments', 'shares', 'views']) r[k] = r[k] == null ? null : Number(r[k]);
  return r;
}

export async function deleteProject(id) {
  await db()`delete from postroom.research_projects where id = ${id}`;
  return { ok: true };
}

/** A short brief the composer / Claude can use to make an original post inspired by this one. */
export function inspirationBrief(r) {
  const t = r.teardown || {};
  const lines = [
    `Inspired by @${r.author}'s ${r.type || 'post'}${r.views ? ` (${Number(r.views).toLocaleString('en')} views)` : ''}. Make an ORIGINAL post for my audience — borrow the structure, not the content.`,
    t.idea?.topic && `Their topic: ${t.idea.topic}${t.idea.angle ? ` — angle: ${t.idea.angle}` : ''}`,
    t.idea?.why_it_works && `Why it worked: ${t.idea.why_it_works}`,
    t.hook?.hook_type && `Hook type: ${t.hook.hook_type}${t.hook.first_3s_spoken ? ` (they opened with: "${t.hook.first_3s_spoken}")` : ''}`,
    t.script?.cta && `Their call to action: ${t.script.cta}`,
    t.replicate?.recipe_steps?.length && `Recipe: ${t.replicate.recipe_steps.slice(0, 5).join(' → ')}`,
    !t.idea && r.caption && `Their caption: ${String(r.caption).slice(0, 400)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// ---------- YouTube: official public channel lookup ----------
const ytNum = (v) => (v == null ? null : Number(v));
function isoDur(s = '') {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s);
  return m ? (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0)) : null;
}
async function yt(path, token) {
  const res = await fetchT(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { authorization: `Bearer ${token}` } });
  const j = await readJson(res);
  if (!res.ok) throw new PlatformError(`YouTube: ${j.error?.message || `HTTP ${res.status}`}`, { tokenInvalid: res.status === 401 });
  return j;
}

/** Look up any public channel by @handle, channel URL or channel id; saves it as a research project. */
export async function lookupYoutube({ channel, limit = 50 }) {
  const [acc] = await db()`select * from postroom.accounts where platform = 'youtube' and status = 'active' order by connected_at limit 1`;
  if (!acc) throw new HttpError(400, 'Connect a YouTube account first — lookups use its access (no extra setup).');
  const token = await accessToken(acc);
  const ref = String(channel || '').trim();
  if (!ref) throw new HttpError(400, 'Give a channel @handle or URL.');
  const idMatch = /(UC[\w-]{22})/.exec(ref);
  const handle = (/@([\w.-]+)/.exec(ref) || [, ref.replace(/^https?:\/\/(www\.)?youtube\.com\//, '')])[1].replace(/\/.*$/, '');
  const q = idMatch ? `id=${idMatch[1]}` : `forHandle=${encodeURIComponent(`@${handle.replace(/^@/, '')}`)}`;
  const ch = (await yt(`channels?part=snippet,statistics,contentDetails&${q}`, token)).items?.[0];
  if (!ch) throw new HttpError(404, `No YouTube channel found for "${ref}".`);
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  const items = uploads ? (await yt(`playlistItems?part=contentDetails&maxResults=${Math.min(50, limit)}&playlistId=${uploads}`, token)).items || [] : [];
  const ids = items.map((i) => i.contentDetails.videoId);
  const videos = ids.length ? (await yt(`videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}`, token)).items || [] : [];
  const name = ch.snippet.customUrl || ch.snippet.title;
  const project = await upsertProject({
    source: 'youtube',
    name,
    niche: ch.snippet.title,
    competitors: [`https://www.youtube.com/${ch.snippet.customUrl || `channel/${ch.id}`}`],
    scrapedAt: new Date().toISOString(),
    meta: { channel_id: ch.id, subscribers: ytNum(ch.statistics?.subscriberCount), total_views: ytNum(ch.statistics?.viewCount), video_count: ytNum(ch.statistics?.videoCount), thumbnail: ch.snippet.thumbnails?.default?.url, description: str(ch.snippet.description, 1000) },
  });
  for (const v of videos) {
    const dur = isoDur(v.contentDetails?.duration);
    await db()`insert into postroom.research_posts ${db()({
      project_id: project.id, platform: 'youtube', external_id: v.id,
      url: dur != null && dur <= 180 ? `https://www.youtube.com/shorts/${v.id}` : `https://youtu.be/${v.id}`,
      author: name.replace(/^@/, ''), source: 'youtube-api', type: dur != null && dur <= 180 ? 'short' : 'video',
      posted_at: new Date(v.snippet.publishedAt), caption: str(`${v.snippet.title}\n\n${v.snippet.description || ''}`, 5000),
      likes: ytNum(v.statistics?.likeCount), comments: ytNum(v.statistics?.commentCount), views: ytNum(v.statistics?.viewCount),
      duration_s: dur, thumb_url: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || null,
    })} on conflict (project_id, external_id) do update set likes = excluded.likes, comments = excluded.comments,
      views = excluded.views, caption = excluded.caption, thumb_url = excluded.thumb_url, updated_at = now()`;
  }
  await logEvent({ message: `Research: looked up YouTube ${name} (${videos.length} videos)` });
  // Hidden YouTube tags (set in Studio, not shown to viewers) and hashtags used in titles/descriptions.
  const tagCount = new Map();
  for (const v of videos) for (const t of new Set((v.snippet?.tags || []).map((x) => String(x).toLowerCase()))) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  const hidden_tags = [...tagCount.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([tag, n]) => ({ tag, videos: n }));
  const hashtags = hashtagStats(videos.map((v) => ({ caption: `${v.snippet.title}\n${v.snippet.description || ''}`, likes: ytNum(v.statistics?.likeCount), comments: ytNum(v.statistics?.commentCount) }))).slice(0, 30);
  return {
    project_id: project.id, name, videos: videos.length, subscribers: ytNum(ch.statistics?.subscriberCount),
    videos_with_hidden_tags: videos.filter((v) => v.snippet?.tags?.length).length, hidden_tags, hashtags,
    category_ids: [...new Set(videos.map((v) => v.snippet?.categoryId).filter(Boolean))],
  };
}

/** Hashtag counts and average engagement across posts. */
export function hashtagStats(posts) {
  const by = new Map();
  for (const p of posts) {
    const tags = [...new Set((String(p.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()))];
    const eng = Number(p.likes || 0) + Number(p.comments || 0);
    for (const t of tags) {
      const r = by.get(t) || { tag: t, posts: 0, engagement: 0 };
      r.posts++;
      r.engagement += eng;
      by.set(t, r);
    }
  }
  return [...by.values()].map((r) => ({ tag: r.tag, posts: r.posts, avg_engagement: Math.round(r.engagement / r.posts) }))
    .sort((a, b) => b.posts - a.posts || b.avg_engagement - a.avg_engagement);
}

/**
 * Study any public Instagram professional account through the official Business Discovery API
 * (uses a connected Instagram account's login, no scraping). Saved as a research project.
 */
export async function lookupInstagram({ username, limit = 50 }) {
  const u = String(username || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@/, '').replace(/\/.*$/, '');
  if (!/^[\w.]{1,30}$/.test(u)) throw new HttpError(400, 'Give an Instagram @username.');
  const [acc] = await db()`select * from postroom.accounts where platform = 'instagram' and status = 'active' order by (meta->>'login' = 'unified') desc nulls last, connected_at limit 1`;
  if (!acc) throw new HttpError(400, 'Connect an Instagram account first — lookups use its login.');
  const token = await accessToken(acc);
  const n = Math.min(Number(limit) || 50, 100);
  const fields = `business_discovery.username(${u}){username,name,biography,followers_count,media_count,profile_picture_url,media.limit(${n}){id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink,thumbnail_url,media_url}}`;
  let bd;
  try {
    bd = (await igGet(acc.external_id, token, { fields }, acc)).business_discovery;
  } catch (e) {
    if (/not.*found|cannot be found|does not exist|Invalid user/i.test(e.message)) throw new HttpError(404, `@${u} isn't a public Instagram professional account (Instagram only shares Business and Creator accounts).`);
    throw e;
  }
  if (!bd) throw new HttpError(404, `No data for @${u}.`);
  const media = bd.media?.data || [];
  const project = await upsertProject({
    source: 'instagram-api',
    name: `@${bd.username}`,
    niche: bd.name || bd.username,
    competitors: [`https://www.instagram.com/${bd.username}/`],
    scrapedAt: new Date().toISOString(),
    meta: { followers: bd.followers_count ?? null, media_count: bd.media_count ?? null, biography: str(bd.biography || '', 1000), thumbnail: bd.profile_picture_url || null },
  });
  for (const m of media) {
    const type = m.media_product_type === 'REELS' ? 'reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : m.media_type === 'VIDEO' ? 'video' : 'image';
    await db()`insert into postroom.research_posts ${db()({
      project_id: project.id, platform: 'instagram', external_id: m.id, url: m.permalink || null,
      author: bd.username, source: 'instagram-api', type,
      posted_at: m.timestamp ? new Date(String(m.timestamp).replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) : null,
      caption: str(m.caption || '', 5000), likes: m.like_count ?? null, comments: m.comments_count ?? null,
      thumb_url: m.thumbnail_url || (m.media_type === 'IMAGE' ? m.media_url : null) || null,
    })} on conflict (project_id, external_id) do update set likes = excluded.likes, comments = excluded.comments,
      caption = excluded.caption, thumb_url = excluded.thumb_url, updated_at = now()`;
  }
  await logEvent({ message: `Research: looked up Instagram @${bd.username} (${media.length} posts)` });
  return {
    project_id: project.id,
    username: bd.username,
    followers: bd.followers_count ?? null,
    posts_read: media.length,
    top_hashtags: hashtagStats(media.map((m) => ({ caption: m.caption, likes: m.like_count, comments: m.comments_count }))).slice(0, 40),
  };
}
