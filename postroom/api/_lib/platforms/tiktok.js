// TikTok via the official Content Posting API (open.tiktokapis.com).
// Two modes:
//   direct — publishes straight to the profile (public only once TikTok audits your app;
//            until then posts are forced to "only me")
//   inbox  — sends the video to the creator's TikTok inbox as a draft; they tap Post in the app.
import { env, fetchT, readJson, form, PlatformError } from '../core.js';
import { fetchRange } from '../storage.js';
import { result, fmtDur, utf16Len } from './common.js';

const API = 'https://open.tiktokapis.com/v2';
const SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.publish', 'video.upload', 'video.list'];
export const PRIVACY = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];
const MB = 1024 * 1024;

const FRIENDLY = {
  unaudited_client_can_only_post_to_private_accounts: 'TikTok only allows private ("Only me") posts until your TikTok app passes its audit. Choose "Only me", or use "Send to TikTok inbox" mode.',
  spam_risk_too_many_posts: 'TikTok says this account has posted too much today. It\'ll retry later.',
  spam_risk_user_banned_from_posting: 'TikTok has blocked this account from posting through apps.',
  reached_active_user_cap: 'Your TikTok app hit its daily limit of posting users (unaudited apps allow 5 per day).',
  privacy_level_option_mismatch: 'That privacy option isn\'t available for this account right now.',
  scope_not_authorized: 'Reconnect this TikTok account and allow all permissions.',
};

function ttError(json, status) {
  const e = json.error || {};
  const code = e.code || json.error || `http_${status}`;
  const msg = FRIENDLY[code] || e.message || json.error_description || `HTTP ${status}`;
  return new PlatformError(`TikTok: ${msg}`, {
    code,
    raw: e,
    tokenInvalid: ['access_token_invalid', 'invalid_grant', 'scope_not_authorized'].includes(code) || status === 401,
    transient: ['rate_limit_exceeded', 'internal_error', 'spam_risk_too_many_posts'].includes(code) || status >= 500 || status === 429 || status === 0,
    retryAfterSec: code === 'spam_risk_too_many_posts' ? 6 * 3600 : code === 'rate_limit_exceeded' ? 90 : null,
  });
}
async function call(path, token, { method = 'POST', json, query } = {}) {
  const url = `${API}${path}${query ? `?${form(query)}` : ''}`;
  const res = await fetchT(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(json ? { 'content-type': 'application/json; charset=UTF-8' } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  const out = await readJson(res);
  if (!res.ok || (out.error && out.error.code && out.error.code !== 'ok')) throw ttError(out, res.status);
  return out.data || {};
}
async function oauth(params) {
  const res = await fetchT(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'), ...params }),
  });
  const out = await readJson(res);
  if (!res.ok || out.error) throw ttError({ error: { code: out.error, message: out.error_description } }, res.status);
  return out;
}
async function userProfile(token) {
  const d = await call('/user/info/', token, {
    method: 'GET',
    query: { fields: 'open_id,union_id,avatar_url,display_name,username,follower_count,profile_deep_link' },
  });
  const u = d.user || {};
  return {
    external_id: u.open_id,
    username: u.username || u.display_name,
    name: u.display_name,
    profile_picture_url: u.avatar_url || null,
    followers_count: u.follower_count ?? null,
    profile_url: u.username ? `https://www.tiktok.com/@${u.username}` : u.profile_deep_link || null,
    account_type: 'CREATOR',
    meta: { union_id: u.union_id },
  };
}

/** TikTok chunk rules: 5–64 MB per chunk, last chunk may be bigger (≤128 MB), ≤1000 chunks. */
export function chunkPlan(size) {
  if (size <= 64 * MB) return { chunk_size: size, total_chunk_count: 1 };
  let chunk = 10 * MB;
  if (Math.floor(size / chunk) > 1000) chunk = Math.ceil(size / 1000);
  chunk = Math.min(chunk, 64 * MB);
  return { chunk_size: chunk, total_chunk_count: Math.floor(size / chunk) };
}

export default {
  id: 'tiktok',
  label: 'TikTok',
  kinds: ['video'],
  envVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  configured: () => !!(env('TIKTOK_CLIENT_KEY') && env('TIKTOK_CLIENT_SECRET')),

  authorizeUrl({ state, redirectUri }) {
    return `https://www.tiktok.com/v2/auth/authorize/?${form({
      client_key: env('TIKTOK_CLIENT_KEY'),
      scope: SCOPES.join(','),
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      disable_auto_auth: 1,
    })}`;
  },

  async connect({ code, redirectUri }) {
    const t = await oauth({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
    return {
      tokens: {
        access_token: t.access_token,
        expires_at: new Date(Date.now() + (t.expires_in || 86400) * 1000),
        refresh_token: t.refresh_token,
        refresh_expires_at: t.refresh_expires_in ? new Date(Date.now() + t.refresh_expires_in * 1000) : null,
        scopes: t.scope,
      },
      profile: await userProfile(t.access_token),
    };
  },

  /** Access tokens last 24h; refresh tokens 365 days and rotate. */
  needsRefresh: (account) => !account.token_expires_at || new Date(account.token_expires_at) - Date.now() < 30 * 60e3,
  async refresh(account, { refresh_token }) {
    if (!refresh_token) throw new PlatformError('TikTok: no refresh token stored — reconnect.', { tokenInvalid: true });
    const t = await oauth({ grant_type: 'refresh_token', refresh_token });
    return {
      access_token: t.access_token,
      expires_at: new Date(Date.now() + (t.expires_in || 86400) * 1000),
      refresh_token: t.refresh_token,
      refresh_expires_at: t.refresh_expires_in ? new Date(Date.now() + t.refresh_expires_in * 1000) : undefined,
    };
  },
  refreshProfile: (token) => userProfile(token),
  /** What the composer must show before a direct post (TikTok's UX rules). */
  creatorInfo: (token) => call('/post/publish/creator_info/query/', token, { json: {} }),

  defaultKind: () => 'video',

  validate({ caption = '', media, options = {} }) {
    const r = result();
    const mode = options.mode || 'direct';
    if (!['direct', 'inbox'].includes(mode)) r.err('TikTok mode must be "direct" or "inbox".');
    if (utf16Len(caption) > 2200) r.err(`Caption is ${utf16Len(caption)} characters; TikTok allows 2,200.`);
    if (media.length !== 1 || media[0].kind !== 'video') r.err('TikTok needs exactly one video (photo posts aren\'t supported yet).');
    else {
      const m = media[0];
      if (m.size_bytes > 4 * 1024 * MB) r.err('TikTok videos must be under 4 GB.');
      if (m.duration_s && m.duration_s < 3) r.err('TikTok videos must be at least 3 seconds.');
      if (m.duration_s && m.duration_s > 600) r.warn(`This is ${fmtDur(m.duration_s)}; many accounts can only post up to 10 minutes through apps.`);
      if (m.content_type && !/mp4|quicktime|webm/.test(m.content_type)) r.err('TikTok accepts MP4, MOV or WebM.');
    }
    if (mode === 'direct') {
      if (!PRIVACY.includes(options.privacy_level)) r.err('Choose who can see this TikTok.');
      if (options.brand_content && options.privacy_level === 'SELF_ONLY') r.err('Branded content can\'t be private on TikTok.');
      if (options.privacy_level && options.privacy_level !== 'SELF_ONLY' && env('TIKTOK_AUDITED') !== 'true') {
        r.warn('Until TikTok audits your app, direct posts are only visible to you. Use "Send to TikTok inbox" to post publicly now.');
      }
    } else if (caption.trim()) {
      r.warn("Inbox drafts don't carry the caption — Postroom will show it so you can paste it in the TikTok app.");
    }
    return r;
  },

  async step({ post, account, token, media, upload, save, deadline }) {
    const m = media[0];
    const size = Number(m.size_bytes);
    const o = post.options || {};
    const mode = o.mode || 'direct';

    // Upload URLs live for one hour; start over if an old one is half-used.
    if (upload.upload_url && !upload.uploaded && Date.now() - upload.init_at > 55 * 60e3) {
      await save({ upload_url: null, publish_id: null, next_chunk: 0 });
      upload = { ...upload, upload_url: null, publish_id: null, next_chunk: 0 };
    }

    if (!upload.publish_id) {
      if (!size) throw new PlatformError('TikTok: the video file size is unknown — re-upload it.');
      const plan = chunkPlan(size);
      const source_info = { source: 'FILE_UPLOAD', video_size: size, ...plan };
      let d;
      if (mode === 'direct') {
        const info = await this.creatorInfo(token);
        if (info.privacy_level_options && !info.privacy_level_options.includes(o.privacy_level)) {
          throw new PlatformError(`TikTok: @${account.username} can't post as ${o.privacy_level} right now (allowed: ${info.privacy_level_options.join(', ')}).`);
        }
        if (info.max_video_post_duration_sec && m.duration_s > info.max_video_post_duration_sec) {
          throw new PlatformError(`TikTok: @${account.username} can post videos up to ${fmtDur(info.max_video_post_duration_sec)} through apps.`);
        }
        d = await call('/post/publish/video/init/', token, {
          json: {
            post_info: {
              title: post.caption || '',
              privacy_level: o.privacy_level,
              disable_comment: !!(o.disable_comment || info.comment_disabled),
              disable_duet: !!(o.disable_duet || info.duet_disabled),
              disable_stitch: !!(o.disable_stitch || info.stitch_disabled),
              video_cover_timestamp_ms: o.cover_ms ?? 1000,
              brand_content_toggle: !!o.brand_content,
              brand_organic_toggle: !!o.brand_organic,
              is_aigc: !!o.is_aigc,
            },
            source_info,
          },
        });
      } else {
        d = await call('/post/publish/inbox/video/init/', token, { json: { source_info } });
      }
      upload = { publish_id: d.publish_id, upload_url: d.upload_url, ...plan, next_chunk: 0, init_at: Date.now(), mode };
      await save(upload);
    }

    if (!upload.uploaded) {
      const { chunk_size, total_chunk_count } = upload;
      let i = upload.next_chunk || 0;
      while (i < total_chunk_count) {
        if (Date.now() > deadline - 30000) return { continue: true, progress: i / total_chunk_count };
        const start = i * chunk_size;
        const end = i === total_chunk_count - 1 ? size - 1 : start + chunk_size - 1;
        const bytes = await fetchRange(m.url, start, end);
        const res = await fetchT(upload.upload_url, {
          method: 'PUT',
          headers: { 'content-type': m.content_type || 'video/mp4', 'content-length': String(bytes.length), 'content-range': `bytes ${start}-${end}/${size}` },
          body: bytes,
        }, 180000);
        if (![200, 201, 206].includes(res.status)) {
          throw new PlatformError(`TikTok: chunk ${i + 1}/${total_chunk_count} upload failed (HTTP ${res.status}).`, { transient: res.status >= 500 || res.status === 429 });
        }
        i += 1;
        await save({ next_chunk: i });
      }
      await save({ uploaded: true });
      upload.uploaded = true;
    }

    const s = await call('/post/publish/status/fetch/', token, { json: { publish_id: upload.publish_id } });
    if (s.status === 'FAILED') throw new PlatformError(`TikTok couldn't publish: ${s.fail_reason || 'unknown reason'}.`);
    if (s.status === 'SEND_TO_USER_INBOX' || (mode === 'inbox' && s.status === 'PUBLISH_COMPLETE')) {
      await save({ inbox: true });
      return { done: true, externalId: upload.publish_id, permalink: account.profile_url, note: 'Sent to the TikTok inbox — open TikTok and tap Post.' };
    }
    if (s.status === 'PUBLISH_COMPLETE') {
      const vid = s.publicaly_available_post_id?.[0] || s.publicly_available_post_id?.[0];
      return {
        done: true,
        externalId: vid ? String(vid) : upload.publish_id,
        permalink: vid && account.username ? `https://www.tiktok.com/@${account.username}/video/${vid}` : account.profile_url,
        note: vid ? null : o.privacy_level === 'SELF_ONLY' ? 'Posted as "Only me".' : null,
      };
    }
    return { waitSec: 15 }; // PROCESSING_UPLOAD / PROCESSING_DOWNLOAD
  },

  async fetchMetrics({ token, posts }) {
    const out = {};
    const ids = posts.filter((p) => /^\d+$/.test(p.external_id || ''));
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const d = await call('/video/query/', token, {
        query: { fields: 'id,view_count,like_count,comment_count,share_count' },
        json: { filters: { video_ids: batch.map((p) => p.external_id) } },
      });
      const byId = new Map((d.videos || []).map((v) => [String(v.id), v]));
      for (const p of batch) {
        const v = byId.get(p.external_id);
        if (v) out[p.id] = { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count };
      }
    }
    return out;
  },

  async fetchFollowers({ token }) {
    const d = await call('/user/info/', token, { method: 'GET', query: { fields: 'follower_count' } });
    return d.user?.follower_count ?? null;
  },

  permalinkFallback: (account) => account.profile_url,
};
