// Instagram via the official "Instagram API with Instagram Login" (graph.instagram.com).
// Works for Instagram professional accounts (Business or Creator).
import { env, fetchT, readJson, form, PlatformError } from '../core.js';
import { result, countHashtags, countMentions, ratio, isVertical, fmtDur } from './common.js';

const V = () => env('IG_API_VERSION', 'v24.0');
const META_V = () => env('META_API_VERSION', 'v27.0');
// Accounts connected with Meta's "Unified login" use graph.facebook.com; older ones graph.instagram.com.
const isUnified = (account) => account?.meta?.login === 'unified';
const GRAPH = (account) => (isUnified(account) ? `https://graph.facebook.com/${META_V()}` : `https://graph.instagram.com/${V()}`);
// Unified login (Facebook Login for Business + an Instagram configuration). New Meta apps only get this.
const unifiedConfigured = () => !!(env('META_APP_ID') && env('META_APP_SECRET') && env('META_CONFIG_ID'));
const legacyConfigured = () => !!(env('IG_APP_ID') && env('IG_APP_SECRET'));
const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'];
const TRANSIENT_CODES = [1, 2, 4, 17, 32, 341, 613, 9004, 9007, 2207051];

function igError(json, status) {
  const e = json.error || {};
  const msg = e.error_user_msg || e.message || json.error_message || json.raw || `HTTP ${status}`;
  const code = e.code ?? json.code;
  return new PlatformError(`Instagram: ${msg}`, {
    code,
    raw: e,
    tokenInvalid: code === 190 || code === 102,
    transient: !!e.is_transient || status >= 500 || status === 0 || TRANSIENT_CODES.includes(code) || e.error_subcode === 2207027,
    retryAfterSec: code === 4 || code === 17 || code === 32 || code === 613 ? 900 : null,
  });
}

async function call(url, init) {
  const res = await fetchT(url, init, 45000);
  const json = await readJson(res);
  if (!res.ok || json.error || json.error_message) throw igError(json, res.status);
  return json;
}
export const igGet = (path, token, params = {}, account = null) =>
  call(`${GRAPH(account)}/${path}?${form({ ...params, access_token: token })}`);
export const igPost = (path, token, params = {}, account = null) =>
  call(`${GRAPH(account)}/${path}`, { method: 'POST', body: form({ ...params, access_token: token }) });

/** Profile of one Instagram account reached through a Unified-login token. */
async function unifiedProfile(token, igId, meta = {}) {
  const acct = { meta: { login: 'unified' } };
  const p = await igGet(igId, token, { fields: 'id,username,name,profile_picture_url,followers_count' }, acct);
  return {
    external_id: String(p.id),
    username: p.username,
    name: p.name || p.username,
    account_type: 'BUSINESS',
    profile_picture_url: p.profile_picture_url || null,
    followers_count: p.followers_count ?? null,
    profile_url: `https://www.instagram.com/${p.username}/`,
    meta: { ...meta, login: 'unified' },
  };
}

async function profile(token) {
  const p = await igGet('me', token, { fields: 'user_id,username,name,account_type,profile_picture_url,followers_count' });
  return {
    external_id: String(p.user_id || p.id),
    username: p.username,
    name: p.name || p.username,
    account_type: p.account_type,
    profile_picture_url: p.profile_picture_url || null,
    followers_count: p.followers_count ?? null,
    profile_url: `https://www.instagram.com/${p.username}/`,
    meta: { app_scoped_id: p.id },
  };
}

/** "@a, b" or ["a","@b"] → ["a","b"] */
export const cleanNames = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,]+/))
  .map((x) => String(x).trim().replace(/^@/, '')).filter(Boolean);

/** Optional extras shared by image, reel and carousel containers. Only sends what is set. */
function extras(kind, o = {}) {
  const p = {};
  const collabs = cleanNames(o.collaborators);
  if (collabs.length && kind !== 'story') p.collaborators = JSON.stringify(collabs.slice(0, 3));
  const tags = cleanNames(o.user_tags);
  if (tags.length && kind !== 'carousel') {
    p.user_tags = JSON.stringify(tags.map((username) => (kind === 'image' ? { username, x: 0.5, y: 0.5 } : { username })));
  }
  if (o.ai_generated && kind !== 'story') p.is_ai_generated = true;
  if (kind === 'reel') {
    if (o.audio_name) p.audio_name = String(o.audio_name).slice(0, 100);
    if (o.trial) p.trial_params = JSON.stringify({ graduation_strategy: o.trial === 'auto' ? 'SS_PERFORMANCE' : 'MANUAL' });
  }
  if (kind === 'image' && o.alt_text) p.alt_text = String(o.alt_text).slice(0, 1000);
  return p;
}

export default {
  id: 'instagram',
  label: 'Instagram',
  kinds: ['image', 'carousel', 'reel', 'story'],
  envVars: ['META_APP_ID', 'META_APP_SECRET', 'META_CONFIG_ID'],
  configured: () => unifiedConfigured() || legacyConfigured(),
  missing: () => (legacyConfigured() ? [] : ['META_APP_ID', 'META_APP_SECRET', 'META_CONFIG_ID'].filter((k) => !env(k))),

  authorizeUrl({ state, redirectUri }) {
    if (unifiedConfigured()) {
      // prompt=login always offers both "Log in with Instagram" and "Log in with Facebook".
      return `https://www.facebook.com/dialog/oauth?${form({
        client_id: env('META_APP_ID'),
        config_id: env('META_CONFIG_ID'),
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
        prompt: 'login',
      })}`;
    }
    return `https://www.instagram.com/oauth/authorize?${form({
      enable_fb_login: 0,
      force_reauth: 'true',
      client_id: env('IG_APP_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    })}`;
  },

  async connect({ code, redirectUri }) {
    if (unifiedConfigured()) return this.connectUnified({ code, redirectUri });
    const short = await call('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: form({
        client_id: env('IG_APP_ID'),
        client_secret: env('IG_APP_SECRET'),
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: String(code).replace(/#_$/, ''),
      }),
    });
    const long = await call(`https://graph.instagram.com/access_token?${form({
      grant_type: 'ig_exchange_token', client_secret: env('IG_APP_SECRET'), access_token: short.access_token,
    })}`);
    const prof = await profile(long.access_token);
    if (prof.account_type && !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(prof.account_type)) {
      throw new PlatformError('Instagram: switch this account to a Professional (Creator or Business) account first — Instagram only lets professional accounts post through its API.');
    }
    return {
      tokens: {
        access_token: long.access_token,
        expires_at: new Date(Date.now() + (long.expires_in || 5184000) * 1000),
        refresh_token: null,
        scopes: (short.permissions || SCOPES).toString(),
      },
      profile: prof,
    };
  },

  /** Unified login: one business-system-user token covering every Instagram account the client shared. */
  async connectUnified({ code, redirectUri }) {
    const v = META_V();
    const t = await call(`https://graph.facebook.com/${v}/oauth/access_token?${form({
      client_id: env('META_APP_ID'), client_secret: env('META_APP_SECRET'), redirect_uri: redirectUri, code,
    })}`);
    const token = t.access_token;
    const acct = { meta: { login: 'unified' } };
    let clientBusinessId = null;
    try {
      clientBusinessId = (await igGet('me', token, { fields: 'client_business_id' }, acct)).client_business_id || null;
    } catch { /* optional */ }
    const shared = await igGet('me/assigned_instagram_accounts', token, { fields: 'id,username', limit: 100 }, acct);
    const ids = (shared.data || []).map((a) => a.id);
    if (!ids.length) {
      throw new PlatformError('Instagram: no Instagram account was shared. Connect again and tick the Instagram account(s) you want Postroom to post to.');
    }
    const profiles = [];
    for (const id of ids) profiles.push(await unifiedProfile(token, id, { client_business_id: clientBusinessId, config_id: env('META_CONFIG_ID') }));
    return {
      tokens: {
        access_token: token,
        expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
        refresh_token: null,
        scopes: 'unified',
      },
      profiles,
    };
  },

  /** Long-lived tokens last 60 days and can be refreshed once they're 24h old. Unified-login tokens don't expire. */
  needsRefresh(account) {
    if (isUnified(account)) return false;
    if (!account.token_expires_at) return false;
    const left = new Date(account.token_expires_at) - Date.now();
    const age = Date.now() - new Date(account.token_refreshed_at || account.connected_at);
    return left < 10 * 864e5 && age > 864e5;
  },
  async refresh(account, { access_token }) {
    const r = await call(`https://graph.instagram.com/refresh_access_token?${form({ grant_type: 'ig_refresh_token', access_token })}`);
    return { access_token: r.access_token, expires_at: new Date(Date.now() + (r.expires_in || 5184000) * 1000) };
  },
  refreshProfile: (token, account) => (isUnified(account) ? unifiedProfile(token, account.external_id, account.meta) : profile(token)),

  defaultKind(media) {
    if (media.length > 1) return 'carousel';
    return media[0]?.kind === 'video' ? 'reel' : 'image';
  },

  validate({ kind, caption = '', media, options = {} }) {
    const r = result();
    if (caption.length > 2200) r.err(`Caption is ${caption.length} characters; Instagram allows 2,200.`);
    const tags = countHashtags(caption);
    if (tags > 30) r.err(`${tags} hashtags; Instagram allows 30.`);
    else if (tags > 8) r.warn(`${tags} hashtags — 3–5 focused tags usually perform better.`);
    if (countMentions(caption) > 20) r.err('Instagram allows at most 20 @mentions.');
    if (!media.length) r.err('Add media.');
    if (media.some((m) => m.kind === 'video' && /webm/.test(m.content_type || ''))) r.err('Instagram needs MP4 or MOV videos (this one is WebM).');
    const checkImage = (m) => {
      const ar = ratio(m);
      if (ar && (ar < 0.79 || ar > 1.92)) r.err(`${m.filename || 'An image'} is ${m.width}×${m.height}; feed images must be between 4:5 portrait and 1.91:1 landscape.`);
    };
    if (kind === 'image') {
      if (media.length !== 1 || media[0].kind !== 'image') r.err('A single-image post needs exactly one image.');
      else checkImage(media[0]);
    } else if (kind === 'carousel') {
      if (media.length < 2 || media.length > 20) r.err('A carousel needs 2–20 items.');
      for (const m of media) {
        if (m.kind === 'image') checkImage(m);
        else if (m.duration_s && (m.duration_s < 3 || m.duration_s > 60)) r.err(`Carousel videos must be 3–60s (${m.filename} is ${fmtDur(m.duration_s)}).`);
      }
    } else if (kind === 'reel') {
      const m = media[0];
      if (media.length !== 1 || m?.kind !== 'video') r.err('A reel needs exactly one video.');
      else {
        if (m.duration_s && (m.duration_s < 3 || m.duration_s > 900)) r.err(`Reels must be 3s–15m (this is ${fmtDur(m.duration_s)}).`);
        if (m.size_bytes > 300 * 1024 * 1024) r.err('Reel videos must be under 300 MB.');
        if (!isVertical(m)) r.warn('Reels look best vertical (9:16).');
        if (!m.duration_s) r.warn("Couldn't read this video's length — Instagram needs 3s–15m.");
      }
    } else if (kind === 'story') {
      const m = media[0];
      if (media.length !== 1) r.err('A story takes exactly one image or video.');
      else if (m.kind === 'video' && m.duration_s && (m.duration_s < 3 || m.duration_s > 60)) r.err(`Story videos must be 3–60s (this is ${fmtDur(m.duration_s)}).`);
      if (caption.trim()) r.warn("Instagram doesn't show captions on stories.");
    } else r.err(`Instagram can't post a "${kind}".`);
    if (options.share_to_feed === false && kind !== 'reel') r.warn('"Share to feed" only applies to reels.');
    const collabs = cleanNames(options.collaborators);
    if (collabs.length > 3) r.err('Instagram allows up to 3 collaborators.');
    if (collabs.length && kind === 'story') r.err("Stories can't have collaborators.");
    const tagged = cleanNames(options.user_tags);
    if (tagged.length > 20) r.err('Tag at most 20 people.');
    if (tagged.length && kind === 'carousel') r.warn('People tags are added to the first image of a carousel.');
    if (options.alt_text && String(options.alt_text).length > 1000) r.err('Alt text can be at most 1,000 characters.');
    if (options.alt_text && !['image', 'carousel'].includes(kind)) r.warn('Alt text only applies to image posts and carousels.');
    if (options.audio_name && kind !== 'reel') r.warn('Audio name only applies to reels.');
    if (options.trial && kind !== 'reel') r.err('Only reels can be trial reels.');
    if (options.first_comment && String(options.first_comment).length > 2200) r.err('The first comment can be at most 2,200 characters.');
    if (options.first_comment && kind === 'story') r.warn("Stories can't have comments; the first comment will be skipped.");
    return r;
  },

  async step({ post, account, token, media, cover, upload, save }) {
    const uid = account.external_id;
    const caption = post.caption || '';

    if (!upload.stage) {
      try {
        const lim = await igGet(`${uid}/content_publishing_limit`, token, { fields: 'quota_usage,config' }, account);
        const row = lim.data?.[0];
        if (row && row.config && row.quota_usage >= row.config.quota_total) {
          throw new PlatformError(`Instagram: @${account.username} hit its daily publishing limit (${row.config.quota_total} posts / 24h).`, { transient: true, retryAfterSec: 3600 });
        }
      } catch (e) {
        if (e.retryAfterSec === 3600 || e.tokenInvalid) throw e; // otherwise best-effort
      }
      let params;
      const m = media[0];
      const o = post.options || {};
      if (post.kind === 'image') params = { image_url: m.url, caption, ...extras('image', o) };
      else if (post.kind === 'reel') {
        params = { media_type: 'REELS', video_url: m.url, caption, share_to_feed: o.share_to_feed !== false, ...extras('reel', o) };
        if (cover) params.cover_url = cover.url;
        else if (o.thumb_offset_ms) params.thumb_offset = o.thumb_offset_ms;
      } else if (post.kind === 'story') params = { media_type: 'STORIES', ...(m.kind === 'video' ? { video_url: m.url } : { image_url: m.url }), ...extras('story', o) };
      if (post.kind === 'carousel') {
        const children = upload.children || [];
        const tagged = cleanNames(o.user_tags);
        for (let i = children.length; i < media.length; i++) {
          const c = media[i];
          const p = c.kind === 'video' ? { media_type: 'VIDEO', video_url: c.url, is_carousel_item: true } : { image_url: c.url, is_carousel_item: true };
          const alt = o.alt_texts?.[c.id] || (i === 0 ? o.alt_text : null);
          if (c.kind === 'image' && alt) p.alt_text = String(alt).slice(0, 1000);
          if (i === 0 && c.kind === 'image' && tagged.length) p.user_tags = JSON.stringify(tagged.map((username) => ({ username, x: 0.5, y: 0.5 })));
          const r = await igPost(`${uid}/media`, token, p, account);
          children.push(r.id);
          await save({ children });
        }
        await save({ stage: 'processing', children });
      } else {
        const r = await igPost(`${uid}/media`, token, params, account);
        await save({ stage: 'processing', container_id: r.id });
      }
      return { continue: true };
    }

    if (upload.stage === 'processing') {
      const status = async (id) => (await igGet(id, token, { fields: 'status_code,status' }, account));
      const hasVideo = media.some((m) => m.kind === 'video');
      if (post.kind === 'carousel' && !upload.container_id) {
        for (const id of upload.children) {
          const s = await status(id);
          if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new PlatformError(`Instagram couldn't process a carousel item: ${s.status || s.status_code}`);
          if (s.status_code !== 'FINISHED') return { waitSec: 20 };
        }
        const parent = await igPost(`${uid}/media`, token, { media_type: 'CAROUSEL', children: upload.children.join(','), caption, ...extras('carousel', post.options || {}) }, account);
        await save({ container_id: parent.id });
        upload.container_id = parent.id;
      }
      const s = await status(upload.container_id);
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
        throw new PlatformError(`Instagram couldn't process the media: ${s.status || s.status_code}. Check the format (H.264/AAC MP4, ≤300 MB) and try again.`);
      }
      if (s.status_code !== 'FINISHED') return { waitSec: hasVideo ? 20 : 5 };
      const pub = await igPost(`${uid}/media_publish`, token, { creation_id: upload.container_id }, account);
      await save({ stage: 'published', media_id: pub.id });
      upload.media_id = pub.id;
      upload.stage = 'published';
    }

    if (upload.stage === 'published') {
      let permalink = upload.permalink || null;
      if (!permalink) {
        try {
          permalink = (await igGet(upload.media_id, token, { fields: 'permalink' }, account)).permalink || null;
          if (permalink) await save({ permalink });
        } catch { /* not fatal */ }
      }
      let note = null;
      const comment = String(post.options?.first_comment || '').trim();
      if (comment && post.kind !== 'story' && !upload.comment_done) {
        try {
          await igPost(`${upload.media_id}/comments`, token, { message: comment }, account);
        } catch (e) {
          note = `First comment not posted: ${e.message}`;
        }
        await save({ comment_done: true, comment_error: note });
      }
      return { done: true, externalId: upload.media_id, permalink: permalink || post.permalink, note: note || upload.comment_error || null };
    }
    throw new PlatformError(`Unknown Instagram upload stage "${upload.stage}".`);
  },

  async fetchMetrics({ account, token, posts }) {
    const out = {};
    for (const p of posts) {
      try {
        const metric = p.kind === 'story' ? 'views,reach,shares' : 'views,reach,likes,comments,shares,saved';
        const r = await igGet(`${p.external_id}/insights`, token, { metric }, account);
        const v = Object.fromEntries((r.data || []).map((d) => [d.name, d.values?.[0]?.value ?? d.total_value?.value ?? null]));
        out[p.id] = { views: v.views, reach: v.reach, likes: v.likes, comments: v.comments, shares: v.shares, saves: v.saved };
      } catch (e) {
        if (e.tokenInvalid) throw e;
        try {
          const r = await igGet(p.external_id, token, { fields: 'like_count,comments_count' }, account);
          out[p.id] = { likes: r.like_count, comments: r.comments_count };
        } catch { /* deleted post etc. */ }
      }
    }
    return out;
  },

  async fetchFollowers({ account, token }) {
    return (await igGet(isUnified(account) ? account.external_id : 'me', token, { fields: 'followers_count' }, account)).followers_count ?? null;
  },

  permalinkFallback: (account) => `https://www.instagram.com/${account.username}/`,
};
