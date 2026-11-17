// Instagram via the official "Instagram API with Instagram Login" (graph.instagram.com).
// Works for Instagram professional accounts (Business or Creator).
import { env, fetchT, readJson, form, PlatformError } from '../core.js';
import { result, countHashtags, countMentions, ratio, isVertical, fmtDur } from './common.js';

const V = () => env('IG_API_VERSION', 'v24.0');
const GRAPH = () => `https://graph.instagram.com/${V()}`;
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
export const igGet = (path, token, params = {}) =>
  call(`${GRAPH()}/${path}?${form({ ...params, access_token: token })}`);
export const igPost = (path, token, params = {}) =>
  call(`${GRAPH()}/${path}`, { method: 'POST', body: form({ ...params, access_token: token }) });

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

export default {
  id: 'instagram',
  label: 'Instagram',
  kinds: ['image', 'carousel', 'reel', 'story'],
  envVars: ['IG_APP_ID', 'IG_APP_SECRET'],
  configured: () => !!(env('IG_APP_ID') && env('IG_APP_SECRET')),

  authorizeUrl({ state, redirectUri }) {
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

  /** Long-lived tokens last 60 days and can be refreshed once they're 24h old. */
  needsRefresh(account) {
    if (!account.token_expires_at) return false;
    const left = new Date(account.token_expires_at) - Date.now();
    const age = Date.now() - new Date(account.token_refreshed_at || account.connected_at);
    return left < 10 * 864e5 && age > 864e5;
  },
  async refresh(account, { access_token }) {
    const r = await call(`https://graph.instagram.com/refresh_access_token?${form({ grant_type: 'ig_refresh_token', access_token })}`);
    return { access_token: r.access_token, expires_at: new Date(Date.now() + (r.expires_in || 5184000) * 1000) };
  },
  refreshProfile: (token) => profile(token),

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
    const checkImage = (m) => {
      const ar = ratio(m);
      if (ar && (ar < 0.79 || ar > 1.92)) r.err(`${m.filename || 'An image'} is ${m.width}×${m.height}; feed images must be between 4:5 portrait and 1.91:1 landscape.`);
    };
    if (kind === 'image') {
      if (media.length !== 1 || media[0].kind !== 'image') r.err('A single-image post needs exactly one image.');
      else checkImage(media[0]);
    } else if (kind === 'carousel') {
      if (media.length < 2 || media.length > 10) r.err('A carousel needs 2–10 items.');
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
    return r;
  },

  async step({ post, account, token, media, cover, upload, save }) {
    const uid = account.external_id;
    const caption = post.caption || '';

    if (!upload.stage) {
      try {
        const lim = await igGet(`${uid}/content_publishing_limit`, token, { fields: 'quota_usage,config' });
        const row = lim.data?.[0];
        if (row && row.config && row.quota_usage >= row.config.quota_total) {
          throw new PlatformError(`Instagram: @${account.username} hit its daily publishing limit (${row.config.quota_total} posts / 24h).`, { transient: true, retryAfterSec: 3600 });
        }
      } catch (e) {
        if (e.retryAfterSec === 3600 || e.tokenInvalid) throw e; // otherwise best-effort
      }
      let params;
      const m = media[0];
      if (post.kind === 'image') params = { image_url: m.url, caption };
      else if (post.kind === 'reel') {
        params = { media_type: 'REELS', video_url: m.url, caption, share_to_feed: post.options?.share_to_feed !== false };
        if (cover) params.cover_url = cover.url;
        else if (post.options?.thumb_offset_ms) params.thumb_offset = post.options.thumb_offset_ms;
      } else if (post.kind === 'story') params = m.kind === 'video' ? { media_type: 'STORIES', video_url: m.url } : { media_type: 'STORIES', image_url: m.url };
      if (post.kind === 'carousel') {
        const children = upload.children || [];
        for (let i = children.length; i < media.length; i++) {
          const c = media[i];
          const p = c.kind === 'video' ? { media_type: 'VIDEO', video_url: c.url, is_carousel_item: true } : { image_url: c.url, is_carousel_item: true };
          const r = await igPost(`${uid}/media`, token, p);
          children.push(r.id);
          await save({ children });
        }
        await save({ stage: 'processing', children });
      } else {
        const r = await igPost(`${uid}/media`, token, params);
        await save({ stage: 'processing', container_id: r.id });
      }
      return { continue: true };
    }

    if (upload.stage === 'processing') {
      const status = async (id) => (await igGet(id, token, { fields: 'status_code,status' }));
      const hasVideo = media.some((m) => m.kind === 'video');
      if (post.kind === 'carousel' && !upload.container_id) {
        for (const id of upload.children) {
          const s = await status(id);
          if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new PlatformError(`Instagram couldn't process a carousel item: ${s.status || s.status_code}`);
          if (s.status_code !== 'FINISHED') return { waitSec: 20 };
        }
        const parent = await igPost(`${uid}/media`, token, { media_type: 'CAROUSEL', children: upload.children.join(','), caption });
        await save({ container_id: parent.id });
        upload.container_id = parent.id;
      }
      const s = await status(upload.container_id);
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
        throw new PlatformError(`Instagram couldn't process the media: ${s.status || s.status_code}. Check the format (H.264/AAC MP4, ≤300 MB) and try again.`);
      }
      if (s.status_code !== 'FINISHED') return { waitSec: hasVideo ? 20 : 5 };
      const pub = await igPost(`${uid}/media_publish`, token, { creation_id: upload.container_id });
      await save({ stage: 'published', media_id: pub.id });
      let permalink = null;
      try {
        permalink = (await igGet(pub.id, token, { fields: 'permalink' })).permalink || null;
      } catch { /* not fatal */ }
      return { done: true, externalId: pub.id, permalink };
    }

    if (upload.stage === 'published') return { done: true, externalId: upload.media_id, permalink: post.permalink };
    throw new PlatformError(`Unknown Instagram upload stage "${upload.stage}".`);
  },

  async fetchMetrics({ token, posts }) {
    const out = {};
    for (const p of posts) {
      try {
        const metric = p.kind === 'story' ? 'views,reach,shares' : 'views,reach,likes,comments,shares,saved';
        const r = await igGet(`${p.external_id}/insights`, token, { metric });
        const v = Object.fromEntries((r.data || []).map((d) => [d.name, d.values?.[0]?.value ?? d.total_value?.value ?? null]));
        out[p.id] = { views: v.views, reach: v.reach, likes: v.likes, comments: v.comments, shares: v.shares, saves: v.saved };
      } catch (e) {
        if (e.tokenInvalid) throw e;
        try {
          const r = await igGet(p.external_id, token, { fields: 'like_count,comments_count' });
          out[p.id] = { likes: r.like_count, comments: r.comments_count };
        } catch { /* deleted post etc. */ }
      }
    }
    return out;
  },

  async fetchFollowers({ token }) {
    return (await igGet('me', token, { fields: 'followers_count' })).followers_count ?? null;
  },

  permalinkFallback: (account) => `https://www.instagram.com/${account.username}/`,
};
