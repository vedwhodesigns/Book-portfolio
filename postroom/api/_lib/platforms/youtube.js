// YouTube via the official YouTube Data API v3 with Google OAuth.
// Uploads use the resumable protocol so big files survive across cron ticks.
import { env, fetchT, readJson, form, PlatformError, db } from '../core.js';
import { fetchRange } from '../storage.js';
import { result, isVertical, fmtDur, byteLen, firstLine } from './common.js';

// youtube.force-ssl lets Postroom add videos to playlists and post the first comment.
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/yt-analytics.readonly'];
export const hasManageScope = (account) => String(account?.scopes || '').includes('youtube.force-ssl');
export const hasAnalyticsScope = (account) => String(account?.scopes || '').includes('yt-analytics');
const YTA = 'https://youtubeanalytics.googleapis.com/v2/reports';
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
/** YouTube Analytics API report → array of row objects. */
async function report(token, params) {
  const qs = new URLSearchParams({ ids: 'channel==MINE', ...params });
  const r = await call(`${YTA}?${qs}`, { headers: authed(token) });
  const cols = (r.columnHeaders || []).map((c) => c.name);
  return (r.rows || []).map((row) => Object.fromEntries(row.map((v, i) => [cols[i], v])));
}
const needAnalytics = (account) => {
  if (!hasAnalyticsScope(account)) throw new PlatformError('YouTube: reconnect this channel (Accounts → Reconnect) to allow YouTube Analytics.');
};
export const CATEGORIES = { 1: 'Film & Animation', 2: 'Autos & Vehicles', 10: 'Music', 15: 'Pets & Animals', 17: 'Sports', 19: 'Travel & Events', 20: 'Gaming', 22: 'People & Blogs', 23: 'Comedy', 24: 'Entertainment', 25: 'News & Politics', 26: 'Howto & Style', 27: 'Education', 28: 'Science & Technology', 29: 'Nonprofits & Activism' };
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';
const CHUNK = 16 * 1024 * 1024; // must be a multiple of 256 KiB
const PRIVACY = ['public', 'unlisted', 'private'];

function ytError(json, status) {
  const e = json.error || {};
  const reason = e.errors?.[0]?.reason || e.status || json.error;
  const msg = e.message || json.error_description || (typeof json.error === 'string' ? json.error : null) || json.raw || `HTTP ${status}`;
  const quota = ['quotaExceeded', 'dailyLimitExceeded', 'uploadLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded'].includes(reason);
  return new PlatformError(
    quota ? `YouTube: ${reason === 'uploadLimitExceeded' ? 'this channel hit its daily upload limit' : 'API quota used up for today'} — it'll retry automatically.` : `YouTube: ${msg}`,
    {
      code: reason,
      raw: e,
      tokenInvalid: status === 401 || reason === 'invalid_grant' || reason === 'authError',
      transient: quota || status >= 500 || status === 429 || status === 0 || reason === 'backendError',
      retryAfterSec: quota ? secondsToPacificMidnight() + 300 : null,
    },
  );
}
function secondsToPacificMidnight() {
  const now = new Date();
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const next = new Date(pt);
  next.setHours(24, 0, 0, 0);
  return Math.max(60, Math.round((next - pt) / 1000));
}
async function call(url, init = {}) {
  const res = await fetchT(url, init, 60000);
  const json = await readJson(res);
  if (!res.ok) throw ytError(json, res.status);
  return json;
}
const authed = (token, extra = {}) => ({ authorization: `Bearer ${token}`, ...extra });

const isoSecs = (d = '') => { const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d); return m ? (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0)) : null; };
/** The channel's latest uploads (made anywhere: Postroom, Studio, phone), newest first. */
export async function listUploads({ token, channelId, max = 50 }) {
  const ch = await call(`${API}/channels?part=contentDetails&id=${encodeURIComponent(channelId)}`, { headers: authed(token) });
  const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return [];
  const pl = await call(`${API}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=${Math.min(max, 50)}`, { headers: authed(token) });
  const ids = (pl.items || []).map((x) => x.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = await call(`${API}/videos?part=snippet,contentDetails&id=${ids.join(',')}`, { headers: authed(token) });
  return (v.items || []).map((x) => {
    const dur = isoSecs(x.contentDetails?.duration);
    return {
      external_id: x.id, title: x.snippet?.title || '', caption: x.snippet?.description || '', published_at: x.snippet?.publishedAt,
      duration_s: dur, kind: dur != null && dur <= 180 ? 'short' : 'video',
      permalink: dur != null && dur <= 180 ? `https://www.youtube.com/shorts/${x.id}` : `https://youtu.be/${x.id}`,
      thumb: x.snippet?.thumbnails?.medium?.url || x.snippet?.thumbnails?.default?.url || null,
    };
  });
}

async function tokenRequest(params) {
  return call('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: form({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...params }),
  });
}
async function channelProfile(token) {
  const r = await call(`${API}/channels?part=snippet,statistics&mine=true`, { headers: authed(token) });
  const c = r.items?.[0];
  if (!c) throw new PlatformError("YouTube: this Google account doesn't have a YouTube channel yet. Create one at youtube.com, then connect again.");
  const handle = c.snippet.customUrl || c.snippet.title;
  return {
    external_id: c.id,
    username: handle.replace(/^@/, ''),
    name: c.snippet.title,
    profile_picture_url: c.snippet.thumbnails?.default?.url || null,
    followers_count: c.statistics?.hiddenSubscriberCount ? null : Number(c.statistics?.subscriberCount ?? 0),
    profile_url: c.snippet.customUrl ? `https://www.youtube.com/${c.snippet.customUrl}` : `https://www.youtube.com/channel/${c.id}`,
    account_type: 'CHANNEL',
    meta: {},
  };
}

export function videoTitle(post) {
  return (post.title && post.title.trim()) || firstLine(post.caption, 100) || 'Untitled';
}
export function videoDescription(post) {
  let d = post.caption || '';
  if (post.kind === 'short' && !/#shorts\b/i.test(`${d} ${post.title || ''}`)) d = `${d}\n\n#Shorts`.trim();
  return d;
}

/** The channel's most recent published video before this one (for "link the previous video"). */
export async function previousVideo(post) {
  const [r] = await db()`select title, caption, permalink from postroom.posts
    where account_id = ${post.account_id} and platform = 'youtube' and status = 'published' and permalink is not null and id <> ${post.id}
    order by published_at desc limit 1`;
  return r ? { url: r.permalink, title: r.title || firstLine(r.caption) } : null;
}
const previousLine = (prev) => `▶ Previous video: ${prev.title ? `${prev.title.replace(/#\w+/g, '').trim()} ` : ''}${prev.url}`;

export default {
  id: 'youtube',
  label: 'YouTube',
  kinds: ['short', 'video'],
  envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  configured: () => !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET')),

  authorizeUrl({ state, redirectUri }) {
    return `https://accounts.google.com/o/oauth2/v2/auth?${form({
      client_id: env('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
      state,
    })}`;
  },

  async connect({ code, redirectUri }) {
    const t = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
    if (!t.refresh_token) throw new PlatformError('YouTube: Google did not return a refresh token. Remove Postroom from myaccount.google.com/permissions and connect again.');
    if (!String(t.scope || '').includes('youtube.upload')) throw new PlatformError('YouTube: please tick "Manage your YouTube videos" on the Google consent screen.');
    return {
      tokens: {
        access_token: t.access_token,
        expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000),
        refresh_token: t.refresh_token,
        scopes: t.scope,
      },
      profile: await channelProfile(t.access_token),
    };
  },

  /** Access tokens last 1 hour; refresh a few minutes before. */
  needsRefresh: (account) => !account.token_expires_at || new Date(account.token_expires_at) - Date.now() < 5 * 60e3,
  async refresh(account, { refresh_token }) {
    if (!refresh_token) throw new PlatformError('YouTube: no refresh token stored — reconnect the channel.', { tokenInvalid: true });
    const t = await tokenRequest({ refresh_token, grant_type: 'refresh_token' });
    return { access_token: t.access_token, expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000), refresh_token: t.refresh_token || undefined };
  },
  refreshProfile: (token) => channelProfile(token),

  defaultKind(media) {
    const m = media[0];
    // Vertical/square up to 3 min is a Short; an unknown length counts as short when the shape is vertical.
    return m && (!m.duration_s || m.duration_s <= 180) && (isVertical(m) || m.width === m.height) ? 'short' : 'video';
  },

  validate({ kind, caption = '', title, media, options = {}, cover, account }) {
    const r = result();
    const t = (title && title.trim()) || firstLine(caption, 100);
    if (!t) r.err('YouTube needs a title.');
    else if (t.length > 100) r.err(`Title is ${t.length} characters; YouTube allows 100.`);
    if (/[<>]/.test(`${t}${caption}`)) r.err('YouTube titles and descriptions can\'t contain < or >.');
    if (byteLen(caption) > 5000) r.err('Description is over YouTube\'s 5,000-byte limit.');
    const tags = options.tags || [];
    if (tags.join(',').length > 500) r.err('YouTube tags must total 500 characters or fewer.');
    if (media.length && media.every((m) => m.kind === 'image')) r.err('YouTube only accepts videos — leave this channel out of photo posts.');
    else if (media.length !== 1 || media[0].kind !== 'video') r.err('YouTube needs exactly one video.');
    else {
      const m = media[0];
      if (kind === 'short') {
        if (m.duration_s && m.duration_s > 180) r.err(`Shorts can be up to 3 minutes (this is ${fmtDur(m.duration_s)}). Post it as a regular video instead.`);
        if (m.width && m.height && !(isVertical(m) || m.width === m.height)) r.warn('Shorts should be vertical or square, or YouTube may treat it as a regular video.');
      }
      if (!m.duration_s) r.warn("Couldn't read this video's length.");
    }
    if (!PRIVACY.includes(options.privacy || 'public')) r.err('Choose public, unlisted or private.');
    if (options.made_for_kids === undefined || options.made_for_kids === null) r.err('Say whether this video is made for kids (YouTube requires it).');
    if ((options.privacy || 'public') !== 'private' && env('YOUTUBE_AUDITED') !== 'true') {
      r.warn('Until your Google project passes YouTube\'s API audit, YouTube locks API uploads to private. You can make it public in YouTube Studio afterwards.');
    }
    if (cover) {
      const ar = cover.width && cover.height ? cover.width / cover.height : null;
      if (ar && Math.abs(ar - 16 / 9) > 0.05) r.warn(`The thumbnail is ${cover.width}×${cover.height}; YouTube thumbnails are 16:9 (1280×720). It will be cropped to fit.`);
      if (cover.width && cover.width < 640) r.err('YouTube thumbnails must be at least 640 pixels wide.');
      if (kind === 'short') r.warn("YouTube may not show a custom thumbnail on Shorts in the Shorts feed; it's used in search and on your channel.");
    }
    if (options.category_id && !CATEGORIES[options.category_id]) r.err('Pick a YouTube category from the list.');
    if (options.first_comment && String(options.first_comment).length > 10000) r.err('The first comment is too long.');
    if ((options.playlist_id || options.first_comment) && account && !hasManageScope(account)) {
      r.warn(`Reconnect @${account.username} (Accounts → Reconnect) to allow playlists and the first comment; the video will still upload.`);
    }
    return r;
  },

  async step({ post, account, token, media, cover, upload, save, deadline }) {
    const m = media[0];
    const total = Number(m.size_bytes);
    if (!total) throw new PlatformError('YouTube: the video file size is unknown — re-upload it.');

    if (!upload.session_uri) {
      const o = post.options || {};
      let description = videoDescription(post);
      if (o.link_previous) {
        const prev = await previousVideo(post).catch(() => null);
        if (prev && !description.includes(prev.url)) description = `${description}\n\n${previousLine(prev)}`.slice(0, 5000);
      }
      const meta = {
        snippet: {
          title: videoTitle(post),
          description,
          tags: o.tags?.length ? o.tags : undefined,
          categoryId: String(o.category_id || '22'),
          defaultLanguage: o.language || undefined,
          defaultAudioLanguage: o.language || undefined,
        },
        status: {
          privacyStatus: o.privacy || 'public',
          license: o.license === 'creativeCommon' ? 'creativeCommon' : undefined,
          selfDeclaredMadeForKids: !!o.made_for_kids,
          containsSyntheticMedia: o.synthetic ? true : undefined,
          embeddable: true,
        },
      };
      const qs = form({ uploadType: 'resumable', part: 'snippet,status', notifySubscribers: o.notify_subscribers !== false });
      const res = await fetchT(`${UPLOAD}/videos?${qs}`, {
        method: 'POST',
        headers: authed(token, {
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-length': String(total),
          'x-upload-content-type': m.content_type || 'video/mp4',
        }),
        body: JSON.stringify(meta),
      });
      if (!res.ok) throw ytError(await readJson(res), res.status);
      const loc = res.headers.get('location');
      if (!loc) throw new PlatformError('YouTube: no upload session returned.', { transient: true });
      await save({ session_uri: loc, offset: 0, started_at: Date.now() });
      upload.session_uri = loc;
      upload.offset = 0;
    }

    if (upload.video_id) return this.afterUpload({ post, account, token, cover, upload, save });

    // Upload chunks until done or out of time.
    let offset = Number(upload.offset || 0);
    while (Date.now() < deadline - 30000) {
      const end = Math.min(offset + CHUNK, total) - 1;
      const chunk = await fetchRange(m.url, offset, end);
      const res = await fetchT(upload.session_uri, {
        method: 'PUT',
        headers: authed(token, { 'content-length': String(chunk.length), 'content-range': `bytes ${offset}-${end}/${total}` }),
        body: chunk,
      }, 120000);
      if (res.status === 308) {
        const range = res.headers.get('range');
        offset = range ? Number(range.split('-')[1]) + 1 : 0;
        await save({ offset });
        continue;
      }
      if (res.status === 200 || res.status === 201) {
        const v = await readJson(res);
        await save({ video_id: v.id, offset: total });
        upload.video_id = v.id;
        return this.afterUpload({ post, account, token, cover, upload, save });
      }
      if (res.status === 404 || res.status === 410) {
        await save({ session_uri: null, offset: 0 }); // session expired — start again
        throw new PlatformError('YouTube: upload session expired, restarting.', { transient: true, retryAfterSec: 30 });
      }
      const json = await readJson(res);
      if (res.status >= 500) {
        // ask YouTube how much it has, then carry on next tick
        const q = await fetchT(upload.session_uri, { method: 'PUT', headers: authed(token, { 'content-length': '0', 'content-range': `bytes */${total}` }) });
        const range = q.headers.get('range');
        await save({ offset: q.status === 308 && range ? Number(range.split('-')[1]) + 1 : 0 });
      }
      throw ytError(json, res.status);
    }
    return { continue: true, progress: offset / total };
  },

  async afterUpload({ post, account, token, cover, upload, save }) {
    if (cover && !upload.thumbnail_done) {
      try {
        const got = await fetchT(cover.url, {}, 60000);
        if (!got.ok) throw new Error(`couldn't read the image (HTTP ${got.status})`);
        const img = Buffer.from(await got.arrayBuffer());
        const sharp = (await import('sharp')).default;
        // YouTube: 16:9, ≤2 MB. Crop to 1280×720 and compress.
        let out = await sharp(img).rotate().resize(1280, 720, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
        if (out.length > 2e6) out = await sharp(out).jpeg({ quality: 70 }).toBuffer();
        await call(`${UPLOAD}/thumbnails/set?videoId=${upload.video_id}`, {
          method: 'POST', headers: authed(token, { 'content-type': 'image/jpeg' }), body: out,
        });
      } catch (e) {
        upload.thumbnail_error = /verif|forbidden|permission/i.test(e.message) ? 'custom thumbnails need a phone-verified channel (youtube.com/verify)' : e.message;
      }
      await save({ thumbnail_done: true, thumbnail_error: upload.thumbnail_error || null });
    }
    const o = post.options || {};
    const notes = [];
    if (o.playlist_id && !upload.playlist_done) {
      try {
        await call(`${API}/playlistItems?part=snippet`, {
          method: 'POST', headers: authed(token, { 'content-type': 'application/json' }),
          body: JSON.stringify({ snippet: { playlistId: o.playlist_id, resourceId: { kind: 'youtube#video', videoId: upload.video_id } } }),
        });
      } catch (e) {
        upload.playlist_error = hasManageScope(account) ? e.message : 'reconnect the channel to allow playlists';
      }
      await save({ playlist_done: true, playlist_error: upload.playlist_error || null });
    }
    const prev = o.link_previous && !upload.comment_done ? await previousVideo(post).catch(() => null) : null;
    const comment = [String(o.first_comment || '').trim(), prev && `▶ Watch the previous one: ${prev.url}`].filter(Boolean).join('\n\n');
    if (comment && !upload.comment_done) {
      try {
        await call(`${API}/commentThreads?part=snippet`, {
          method: 'POST', headers: authed(token, { 'content-type': 'application/json' }),
          body: JSON.stringify({ snippet: { videoId: upload.video_id, topLevelComment: { snippet: { textOriginal: comment } } } }),
        });
      } catch (e) {
        upload.comment_error = hasManageScope(account) ? e.message : 'reconnect the channel to allow comments';
      }
      await save({ comment_done: true, comment_error: upload.comment_error || null });
    }
    if (upload.playlist_error) notes.push(`Not added to playlist: ${upload.playlist_error}`);
    if (upload.comment_error) notes.push(`First comment not posted: ${upload.comment_error}`);
    const id = upload.video_id;
    return {
      done: true,
      externalId: id,
      permalink: post.kind === 'short' ? `https://www.youtube.com/shorts/${id}` : `https://youtu.be/${id}`,
      note: [upload.thumbnail_error ? `Thumbnail not set: ${upload.thumbnail_error}` : null, ...notes].filter(Boolean).join(' · ') || null,
    };
  },

  async fetchMetrics({ token, posts }) {
    const out = {};
    for (let i = 0; i < posts.length; i += 50) {
      const batch = posts.slice(i, i + 50);
      const r = await call(`${API}/videos?part=statistics&id=${batch.map((p) => p.external_id).join(',')}`, { headers: authed(token) });
      const byVid = new Map((r.items || []).map((v) => [v.id, v.statistics || {}]));
      for (const p of batch) {
        const s = byVid.get(p.external_id);
        if (s) out[p.id] = { views: num(s.viewCount), likes: num(s.likeCount), comments: num(s.commentCount) };
      }
    }
    return out;
  },

  /** Watch time, average view %, subs gained per video, plus the retention curve (hook: % still watching at 3 s). */
  async fetchInsights({ account, token, posts, withRetention = true }) {
    needAnalytics(account);
    const out = {};
    const start = ymd(Math.min(...posts.map((p) => new Date(p.published_at || Date.now()))) - 864e5);
    for (let i = 0; i < posts.length; i += 20) {
      const batch = posts.slice(i, i + 20);
      const rows = await report(token, {
        startDate: start, endDate: ymd(Date.now()), dimensions: 'video',
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,shares',
        filters: `video==${batch.map((p) => p.external_id).join(',')}`, maxResults: '50',
      });
      for (const r of rows) {
        const p = batch.find((x) => x.external_id === r.video);
        if (p) out[p.id] = { insights: { avg_watch_s: num(r.averageViewDuration), avg_view_pct: r.averageViewPercentage == null ? null : Math.round(r.averageViewPercentage * 10) / 10, watch_min: num(r.estimatedMinutesWatched), subs_gained: num(r.subscribersGained) } };
      }
    }
    if (withRetention) {
      for (const p of posts) {
        try {
          const rows = await report(token, {
            startDate: ymd(new Date(p.published_at || Date.now()) - 864e5), endDate: ymd(Date.now()),
            dimensions: 'elapsedVideoTimeRatio', metrics: 'audienceWatchRatio,relativeRetentionPerformance', filters: `video==${p.external_id}`,
          });
          if (!rows.length) continue;
          const curve = rows.map((r) => [Number(r.elapsedVideoTimeRatio), Math.round(Number(r.audienceWatchRatio) * 1000) / 1000]);
          const dur = Number(p.duration_s) || null;
          let hold3 = null;
          if (dur) {
            const at = Math.min(1, 3 / dur);
            const pt = curve.find(([x]) => x >= at) || curve[curve.length - 1];
            hold3 = Math.round(Math.min(pt[1], 1.5) * 1000) / 10; // % of starting viewers still watching at 3 s (Shorts can loop past 100%)
          }
          out[p.id] = { ...(out[p.id] || { insights: {} }), retention: curve };
          if (hold3 != null) out[p.id].insights.hold_3s = hold3;
        } catch (e) { if (e.tokenInvalid) throw e; }
      }
    }
    return out;
  },

  /** Audience: age & gender, top countries, where views come from, devices (last 90 days). */
  async fetchAudience({ account, token }) {
    needAnalytics(account);
    const range = { startDate: ymd(Date.now() - 90 * 864e5), endDate: ymd(Date.now()) };
    const safe = async (fn) => { try { return await fn(); } catch (e) { if (e.tokenInvalid) throw e; return { error: e.message }; } };
    const ageGender = await safe(() => report(token, { ...range, dimensions: 'ageGroup,gender', metrics: 'viewerPercentage' }));
    const country = await safe(() => report(token, { ...range, dimensions: 'country', metrics: 'views,estimatedMinutesWatched', sort: '-views', maxResults: '15' }));
    const traffic = await safe(() => report(token, { ...range, dimensions: 'insightTrafficSourceType', metrics: 'views', sort: '-views' }));
    const device = await safe(() => report(token, { ...range, dimensions: 'deviceType', metrics: 'views', sort: '-views' }));
    const out = { notes: [] };
    if (Array.isArray(ageGender)) {
      const age = {};
      const gender = {};
      for (const r of ageGender) {
        const a = String(r.ageGroup).replace('age', '').replace('-', '–');
        age[a] = (age[a] || 0) + Number(r.viewerPercentage);
        gender[r.gender] = (gender[r.gender] || 0) + Number(r.viewerPercentage);
      }
      out.age = Object.entries(age).map(([key, value]) => ({ key, value: Math.round(value * 10) / 10 })).sort((x, y) => x.key.localeCompare(y.key));
      out.gender = Object.entries(gender).map(([key, value]) => ({ key: key.toLowerCase(), value: Math.round(value * 10) / 10 }));
    } else out.notes.push(`age/gender: ${ageGender.error}`);
    if (Array.isArray(country)) out.country = country.map((r) => ({ key: r.country, value: num(r.views) }));
    else out.notes.push(`country: ${country.error}`);
    if (Array.isArray(traffic)) out.traffic = traffic.map((r) => ({ key: r.insightTrafficSourceType, value: num(r.views) }));
    if (Array.isArray(device)) out.device = device.map((r) => ({ key: r.deviceType, value: num(r.views) }));
    out.locked = !out.age?.length && !out.country?.length;
    return out;
  },

  /** Daily views, watch time and subscribers for the last 30 days. */
  async fetchDaily({ account, token }) {
    needAnalytics(account);
    const rows = await report(token, { startDate: ymd(Date.now() - 30 * 864e5), endDate: ymd(Date.now()), dimensions: 'day', metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost', sort: 'day' });
    return { days: rows.map((r) => ({ day: r.day, views: num(r.views), watch_min: num(r.estimatedMinutesWatched), subs: num(r.subscribersGained) - num(r.subscribersLost) })) };
  },

  async fetchFollowers({ account, token }) {
    const r = await call(`${API}/channels?part=statistics&id=${account.external_id}`, { headers: authed(token) });
    const s = r.items?.[0]?.statistics;
    return s && !s.hiddenSubscriberCount ? Number(s.subscriberCount) : null;
  },

  /** The channel's playlists, for the composer. */
  async playlists({ token }) {
    const out = [];
    let pageToken = '';
    for (let i = 0; i < 4; i++) {
      const r = await call(`${API}/playlists?part=snippet,status&mine=true&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: authed(token) });
      for (const p of r.items || []) out.push({ id: p.id, title: p.snippet?.title, privacy: p.status?.privacyStatus });
      if (!r.nextPageToken) break;
      pageToken = r.nextPageToken;
    }
    return out;
  },

  permalinkFallback: (account) => account.profile_url,
};
const num = (v) => (v == null ? null : Number(v));
