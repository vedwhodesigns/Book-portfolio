// Single entry point for every /api/* route (vercel.json rewrites here).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { APP_URL, TZ, env, HttpError, body, send, redirect, isAuthed, sessionCookie, clearCookie, safeEqual, db, loadSettings, saveSettings, settingSource } from './_lib/core.js';
import { listAccounts, platformStatus, startConnect, finishConnect, syncAccount, disconnectAccount, getAccount, accessToken } from './_lib/accounts.js';
import { listMedia, registerMedia, importFromUrl, deleteMedia, updateMediaMeta, uploadConfig, ALLOWED_TYPES, MAX_UPLOAD_BYTES } from './_lib/media.js';
import { checkTargets, summariseCheck, createPosts, listPosts, getPost, updatePost, schedulePost, cancelPost, retryPost, deletePost, listPlans, approvePlan, discardPlan } from './_lib/posts.js';
import { tick } from './_lib/publisher.js';
import { overview } from './_lib/analytics.js';
import { writeCaptions, aiEnabled, draftDMReply } from './_lib/ai.js';
import * as inbox from './_lib/inbox.js';
import * as notifyLib from './_lib/notify.js';
import { updateBrand } from './_lib/brand.js';
import { handleMcp } from './_lib/mcp.js';
import { platform } from './_lib/platforms/index.js';
import { storageMode, LOCAL_DIR } from './_lib/storage.js';
import { ingest, listProjects, projectOverview, searchPosts, getResearchPost, deleteProject, lookupYoutube, lookupInstagram, inspirationBrief } from './_lib/research.js';

// Settings the owner can paste into Postroom → Settings (stored in the database).
const EDITABLE_SETTINGS = [
  'META_APP_ID', 'META_APP_SECRET', 'META_CONFIG_ID', 'IG_APP_ID', 'IG_APP_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET',
  'YOUTUBE_AUDITED', 'TIKTOK_AUDITED', 'ANTHROPIC_API_KEY', 'MCP_AUTO_APPROVE', 'APP_PASSWORD',
];

function routePath(req) {
  if (req.query && typeof req.query.__p === 'string') return req.query.__p.replace(/^\/+|\/+$/g, '');
  const u = new URL(req.url, 'http://x');
  return u.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
}
function query(req) {
  if (req.query) return req.query;
  return Object.fromEntries(new URL(req.url, 'http://x').searchParams);
}
/** Raw request body (needed to check Meta's webhook signature). */
async function readRaw(req) {
  if (req[Symbol.asyncIterator] && req.readable !== false) {
    const chunks = [];
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    if (chunks.length) return Buffer.concat(chunks);
  }
  const b = req.body;
  if (Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') return Buffer.from(b);
  return Buffer.from(b ? JSON.stringify(b) : '');
}

function requireAuth(req) {
  if (!isAuthed(req)) throw new HttpError(401, 'Sign in to Postroom first.');
}

const loginAttempts = new Map();
function rateLimitLogin(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const rec = (loginAttempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  if (rec.length >= 10) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  rec.push(now);
  loginAttempts.set(ip, rec);
}

function parseSignedRequest(sr) {
  const [sig, payload] = String(sr || '').split('.');
  if (!sig || !payload) throw new HttpError(400, 'Bad signed_request');
  const expected = crypto.createHmac('sha256', env('IG_APP_SECRET')).update(payload).digest('base64url');
  if (!safeEqual(sig, expected)) throw new HttpError(400, 'Bad signature');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

export default async function handler(req, res) {
  const p = routePath(req);
  const seg = p.split('/');
  const m = req.method;
  try {
    await loadSettings();
    // ---------- public ----------
    if (seg[0] === 'mcp') {
      if (!seg[1] || !env('MCP_KEY') || !safeEqual(seg[1], env('MCP_KEY'))) return send(res, 404, { error: 'Not found' });
      return handleMcp(req, res);
    }
    // Meta webhooks: Instagram DMs and comments.
    if (p === 'webhooks/meta') {
      if (m === 'GET') {
        const challenge = inbox.verifyChallenge(query(req));
        if (challenge == null) return send(res, 403, { error: 'Bad verify token' });
        res.statusCode = 200;
        res.setHeader('content-type', 'text/plain');
        return res.end(challenge);
      }
      const raw = await readRaw(req);
      if (!inbox.verifySignature(raw, req.headers['x-hub-signature-256'])) return send(res, 401, { error: 'Bad signature' });
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, { error: 'Bad JSON' }); }
      const r = await inbox.processWebhook(payload);
      return send(res, 200, { ok: true, ...r });
    }
    if (p === 'cron/tick') {
      const secret = req.headers['x-cron-secret'] || String(req.headers.authorization || '').replace(/^Bearer /, '');
      if (!safeEqual(String(secret), env('CRON_SECRET'))) return send(res, 401, { error: 'Bad cron secret' });
      return send(res, 200, await tick());
    }
    if (p === 'login' && m === 'POST') {
      rateLimitLogin(req);
      const { password } = await body(req);
      if (!env('APP_PASSWORD')) throw new HttpError(500, 'APP_PASSWORD is not set in Vercel.');
      if (!safeEqual(String(password || ''), env('APP_PASSWORD'))) throw new HttpError(401, 'Wrong password.');
      return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie() });
    }
    if (p === 'logout') return send(res, 200, { ok: true }, { 'set-cookie': clearCookie() });
    if (p === 'session') return send(res, 200, { authed: isAuthed(req) });
    if (p === 'health') {
      try {
        await db()`select 1`;
        return send(res, 200, { ok: true });
      } catch (e) {
        // Shape of the connection settings only — never values.
        const h = env('DB_HOST');
        return send(res, 500, {
          error: e.message,
          db: {
            host: h ? h.replace(/^[^.]+/, '…') : null, host_parts: h ? h.split('.').length : 0,
            user_has_project_suffix: env('DB_USER').includes('.'), user_len: env('DB_USER').length,
            port: env('DB_PORT') || '(default 6543)', has_password: !!env('DB_PASSWORD'),
            has_database_url: !!env('DATABASE_URL'), db_ssl: env('DB_SSL') || '(default require)', db_name: env('DB_NAME') || '(default postgres)',
            other_db_vars: Object.keys(process.env).filter((k) => /^(PG|POSTGRES|SUPABASE)/.test(k)),
          },
        });
      }
    }

    // Meta-required callbacks (set these URLs in the Meta app dashboard).
    if (p === 'ig/deauthorize' && m === 'POST') {
      const data = parseSignedRequest((await body(req)).signed_request);
      await db()`update postroom.accounts set status = 'needs_reconnect', status_detail = 'Removed Postroom in Instagram settings'
        where platform = 'instagram' and (external_id = ${String(data.user_id)} or app_scoped_id = ${String(data.user_id)})`;
      return send(res, 200, { ok: true });
    }
    if (p === 'ig/data-deletion' && m === 'POST') {
      const data = parseSignedRequest((await body(req)).signed_request);
      const code = crypto.randomUUID();
      await db()`update postroom.accounts set status = 'disconnected', access_token_enc = '', refresh_token_enc = null,
          status_detail = 'Data deletion requested via Meta'
        where platform = 'instagram' and (external_id = ${String(data.user_id)} or app_scoped_id = ${String(data.user_id)})`;
      return send(res, 200, { url: `${APP_URL()}/privacy.html#deletion`, confirmation_code: code });
    }

    // OAuth callbacks come back to the browser (session cookie present).
    if (seg[0] === 'connect' && seg[2] === 'callback') {
      if (!isAuthed(req)) return redirect(res, `/?error=${encodeURIComponent('Sign in, then connect the account again.')}#/accounts`);
      try {
        const row = await finishConnect(seg[1], query(req));
        return redirect(res, `/?connected=${encodeURIComponent(`${row.platform}:${(row.connected || [row.username]).join(', @')}`)}#/accounts`);
      } catch (e) {
        return redirect(res, `/?error=${encodeURIComponent(e.message)}#/accounts`);
      }
    }

    // Blob client-upload token exchange (browser → Vercel Blob directly).
    if (p === 'media/upload' && m === 'POST') {
      requireAuth(req);
      const { handleUpload } = await import('@vercel/blob/client');
      const json = await handleUpload({
        body: await body(req),
        request: req,
        onBeforeGenerateToken: async () => ({ allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: true }),
      });
      return send(res, 200, json);
    }

    // Research ingest: the ig-research toolkit pushes with `Authorization: Bearer RESEARCH_KEY`.
    if (p === 'research/ingest' && m === 'POST') {
      const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
      if (!isAuthed(req) && !(env('RESEARCH_KEY') && safeEqual(bearer, env('RESEARCH_KEY')))) return send(res, 401, { error: 'Bad research key' });
      return send(res, 200, await ingest(await body(req)));
    }

    // ---------- everything below needs a session ----------
    requireAuth(req);

    if (p === 'config') {
      return send(res, 200, {
        app_url: APP_URL(),
        timezone: TZ(),
        platforms: platformStatus(),
        ai: aiEnabled(),
        storage: uploadConfig(),
        mcp_url: env('MCP_KEY') ? `${APP_URL()}/api/mcp/${env('MCP_KEY')}` : null,
        audited: { youtube: env('YOUTUBE_AUDITED') === 'true', tiktok: env('TIKTOK_AUDITED') === 'true' },
        cron: !!env('CRON_SECRET'),
        research: { ingest_url: `${APP_URL()}/api/research/ingest`, key_set: !!env('RESEARCH_KEY') },
        settings: Object.fromEntries(EDITABLE_SETTINGS.map((k) => [k, settingSource(k)])),
      });
    }
    if (p === 'settings' && m === 'POST') {
      const patch = await body(req);
      for (const k of Object.keys(patch)) if (!EDITABLE_SETTINGS.includes(k)) throw new HttpError(400, `${k} can't be changed here.`);
      await saveSettings(patch);
      return send(res, 200, { ok: true, settings: Object.fromEntries(EDITABLE_SETTINGS.map((k) => [k, settingSource(k)])) });
    }

    // phone notifications
    if (p === 'notifications' && m === 'GET') return send(res, 200, await notifyLib.listNotifications(query(req)));
    if (p === 'notifications/read' && m === 'POST') return send(res, 200, await notifyLib.markRead());
    if (p === 'notifications' && m === 'POST') {
      const b = await body(req);
      if (!b.title) throw new HttpError(400, 'title is required.');
      return send(res, 200, await notifyLib.notify({ kind: String(b.kind || 'reminder').slice(0, 30), title: String(b.title).slice(0, 140), body: b.body ? String(b.body).slice(0, 500) : null, url: b.url || '/#/queue' }));
    }
    if (p === 'push/status' && m === 'GET') return send(res, 200, await notifyLib.pushStatus());
    if (p === 'push/subscribe' && m === 'POST') return send(res, 200, await notifyLib.subscribe(await body(req)));
    if (p === 'push/unsubscribe' && m === 'POST') return send(res, 200, await notifyLib.unsubscribe(await body(req)));
    if (p === 'push/test' && m === 'POST') {
      await notifyLib.notify({ kind: 'test', title: 'Postroom notifications are on', body: 'You will get a message here when posts go live, fail, or a DM arrives.', url: '/#/alerts' });
      return send(res, 200, await notifyLib.pushStatus());
    }

    // accounts
    if (p === 'accounts' && m === 'GET') return send(res, 200, await listAccounts(query(req)));
    if (seg[0] === 'connect' && seg[1] && !seg[2]) return redirect(res, await startConnect(seg[1]));
    if (seg[0] === 'accounts' && seg[1]) {
      if (seg[2] === 'sync' && m === 'POST') return send(res, 200, await syncAccount(seg[1]));
      if (seg[2] === 'creator-info' && m === 'GET') {
        const a = await getAccount(seg[1]);
        if (a.platform !== 'tiktok') throw new HttpError(400, 'Only TikTok has creator info.');
        return send(res, 200, await platform('tiktok').creatorInfo(await accessToken(a)));
      }
      if (seg[2] === 'brand' && (m === 'PATCH' || m === 'POST')) return send(res, 200, await updateBrand(seg[1], await body(req)));
      if (seg[2] === 'playlists' && m === 'GET') {
        const a = await getAccount(seg[1]);
        if (a.platform !== 'youtube') throw new HttpError(400, 'Only YouTube has playlists.');
        const yt = platform('youtube');
        return send(res, 200, { playlists: await yt.playlists({ token: await accessToken(a) }), can_manage: String(a.scopes || '').includes('youtube.force-ssl') });
      }
      if (!seg[2] && m === 'DELETE') return send(res, 200, await disconnectAccount(seg[1]));
    }

    // media
    if (p === 'media' && m === 'GET') return send(res, 200, await listMedia(query(req)));
    if (p === 'media' && m === 'POST') return send(res, 200, await registerMedia(await body(req)));
    if (p === 'media/import' && m === 'POST') return send(res, 200, await importFromUrl(await body(req)));
    if (p === 'media/local-upload' && m === 'POST') {
      if (storageMode() !== 'local') throw new HttpError(404, 'Not found');
      const q = query(req);
      const name = `${Date.now().toString(36)}-${String(q.filename || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      fs.mkdirSync(LOCAL_DIR(), { recursive: true });
      await pipeline(req, fs.createWriteStream(path.join(LOCAL_DIR(), name)));
      return send(res, 200, { url: `${APP_URL()}/dev-media/${name}`, pathname: name });
    }
    if (seg[0] === 'media' && seg[1] && m === 'DELETE') return send(res, 200, await deleteMedia(seg[1]));
    if (seg[0] === 'media' && seg[1] && !seg[2] && m === 'PATCH') return send(res, 200, await updateMediaMeta(seg[1], await body(req)));

    // posts
    if (p === 'posts/check' && m === 'POST') return send(res, 200, summariseCheck(await checkTargets(await body(req))));
    if (p === 'posts' && m === 'POST') return send(res, 200, await createPosts(await body(req)));
    if (p === 'posts' && m === 'GET') return send(res, 200, await listPosts(query(req)));
    if (seg[0] === 'posts' && seg[1]) {
      const id = seg[1];
      if (!seg[2] && m === 'GET') return send(res, 200, await getPost(id));
      if (!seg[2] && m === 'PATCH') return send(res, 200, await updatePost(id, await body(req)));
      if (!seg[2] && m === 'DELETE') return send(res, 200, await deletePost(id));
      if (seg[2] === 'cancel' && m === 'POST') return send(res, 200, await cancelPost(id));
      if (seg[2] === 'schedule' && m === 'POST') return send(res, 200, await schedulePost(id, await body(req)));
      if (seg[2] === 'retry' && m === 'POST') return send(res, 200, await retryPost(id));
    }

    // plans
    if (p === 'plans' && m === 'GET') return send(res, 200, await listPlans(query(req)));
    if (seg[0] === 'plans' && seg[2] === 'approve' && m === 'POST') return send(res, 200, await approvePlan(seg[1]));
    if (seg[0] === 'plans' && seg[2] === 'discard' && m === 'POST') return send(res, 200, await discardPlan(seg[1]));

    // inbox (Instagram DMs, comments, automations)
    if (seg[0] === 'inbox') {
      if (p === 'inbox/status' && m === 'GET') {
        const st = await inbox.inboxStatus();
        const [{ n }] = await db()`select coalesce(sum(unread), 0)::int as n from postroom.dm_threads`;
        return send(res, 200, { ...st, webhook_url: `${APP_URL()}/api/webhooks/meta`, verify_token: env('META_WEBHOOK_VERIFY_TOKEN') || null, unread: n });
      }
      if (p === 'inbox/threads' && m === 'GET') return send(res, 200, await inbox.listThreads(query(req)));
      if (seg[1] === 'threads' && seg[2]) {
        const id = seg[2];
        if (!seg[3] && m === 'GET') return send(res, 200, await inbox.getThread(id));
        if (seg[3] === 'reply' && m === 'POST') return send(res, 200, await inbox.replyInThread(id, (await body(req)).text));
        if (seg[3] === 'draft' && m === 'POST') {
          const t = await inbox.getThread(id, { markRead: false });
          const text = await draftDMReply({ thread: t, accountName: t.account_username, guidance: (await body(req)).guidance || '' });
          await inbox.saveDraft(id, text, 'claude');
          return send(res, 200, { text });
        }
        if (seg[3] === 'draft' && m === 'DELETE') return send(res, 200, await inbox.saveDraft(id, null));
      }
      if (p === 'inbox/sync' && m === 'POST') {
        const { account_id } = await body(req);
        const ids = account_id ? [account_id] : (await db()`select id from postroom.accounts where platform = 'instagram' and status = 'active'`).map((a) => a.id);
        const out = [];
        for (const a of ids) {
          try { out.push({ account_id: a, ...(await inbox.syncConversations(a)) }); } catch (e) { out.push({ account_id: a, error: e.message }); }
        }
        return send(res, 200, out);
      }
      if (p === 'inbox/subscribe' && m === 'POST') return send(res, 200, await inbox.subscribeAll());
      if (p === 'inbox/comments' && m === 'GET') return send(res, 200, await inbox.listComments(query(req)));
      if (p === 'inbox/rules' && m === 'GET') return send(res, 200, await inbox.listRules());
      if (p === 'inbox/rules' && m === 'POST') return send(res, 200, await inbox.createRule(await body(req)));
      if (seg[1] === 'rules' && seg[2] && m === 'PATCH') return send(res, 200, await inbox.updateRule(seg[2], await body(req)));
      if (seg[1] === 'rules' && seg[2] && m === 'DELETE') return send(res, 200, await inbox.deleteRule(seg[2]));
    }

    // research extension
    if (p === 'research/projects' && m === 'GET') return send(res, 200, await listProjects());
    if (seg[0] === 'research' && seg[1] === 'projects' && seg[2]) {
      if (m === 'GET') return send(res, 200, await projectOverview(seg[2]));
      if (m === 'DELETE') return send(res, 200, await deleteProject(seg[2]));
    }
    if (p === 'research/posts' && m === 'GET') return send(res, 200, await searchPosts(query(req)));
    if (seg[0] === 'research' && seg[1] === 'posts' && seg[2] && m === 'GET') {
      const r = await getResearchPost(seg[2]);
      return send(res, 200, { ...r, brief: inspirationBrief(r) });
    }
    if (p === 'research/youtube' && m === 'POST') return send(res, 200, await lookupYoutube(await body(req)));
    if (p === 'research/instagram' && m === 'POST') return send(res, 200, await lookupInstagram(await body(req)));

    // analytics, AI, manual publish run
    if (p === 'analytics' && m === 'GET') return send(res, 200, await overview(query(req)));
    if (p === 'ai/captions' && m === 'POST') return send(res, 200, await writeCaptions(await body(req)));
    if (p === 'run' && m === 'POST') return send(res, 200, await tick({ budgetMs: 200000 }));

    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    const status = e.status || (e.transient ? 503 : e.tokenInvalid ? 409 : e.code === '23505' ? 409 : 500);
    if (status >= 500) console.error(p, e);
    return send(res, status, { error: e.message || 'Something went wrong', ...(e.extra || {}) });
  }
}
