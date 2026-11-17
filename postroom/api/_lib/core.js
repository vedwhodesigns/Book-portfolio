// Shared helpers: config, database, crypto, sessions, HTTP, time.
import postgres from 'postgres';
import crypto from 'node:crypto';

export const env = (k, d = '') => (process.env[k] ?? d);
// Preview deployments use their own address so OAuth redirects come back to the preview.
export const APP_URL = () =>
  (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : env('APP_URL')).replace(/\/$/, '');
export const TZ = () => env('APP_TIMEZONE', 'Asia/Kolkata');

// ---------- errors ----------
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** A platform/API failure. `transient` → retry later, `tokenInvalid` → account must reconnect. */
export class PlatformError extends Error {
  constructor(message, { transient = false, tokenInvalid = false, retryAfterSec = null, code = null, raw = null } = {}) {
    super(message);
    this.transient = transient;
    this.tokenInvalid = tokenInvalid;
    this.retryAfterSec = retryAfterSec;
    this.code = code;
    this.raw = raw;
  }
}

// ---------- database ----------
let _sql;
export function db() {
  if (!_sql) {
    const common = {
      prepare: false, // required for Supabase's transaction pooler
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
      transform: { undefined: null },
      onnotice: () => {},
    };
    // Same connection settings as Postroom v1 (DB_* variables); DATABASE_URL only as a fallback.
    if (env('DB_HOST')) {
      _sql = postgres({
        host: env('DB_HOST'),
        port: Number(env('DB_PORT', '6543')),
        database: env('DB_NAME', 'postgres'),
        username: env('DB_USER'),
        password: env('DB_PASSWORD'),
        ssl: env('DB_SSL', 'require') === 'disable' ? false : 'require',
        ...common,
      });
    } else {
      const url = env('DATABASE_URL');
      const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
      _sql = postgres(url, { ...common, ...(local ? {} : { ssl: 'require' }) });
    }
  }
  return _sql;
}

export async function logEvent({ postId = null, accountId = null, level = 'info', message }) {
  try {
    await db()`insert into postroom.events (post_id, account_id, level, message)
      values (${postId}, ${accountId}, ${level}, ${String(message).slice(0, 2000)})`;
  } catch (e) {
    console.error('logEvent failed', e.message);
  }
}

export async function kvGet(key) {
  const [row] = await db()`select value from postroom.kv where key = ${key} and (expires_at is null or expires_at > now())`;
  return row ? row.value : null;
}
export async function kvSet(key, value, ttlSeconds = null) {
  const exp = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
  await db()`insert into postroom.kv (key, value, expires_at, updated_at)
    values (${key}, ${db().json(value)}, ${exp}, now())
    on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at, updated_at = now()`;
}
export async function kvDel(key) {
  await db()`delete from postroom.kv where key = ${key}`;
}
// ---------- settings stored in the database ----------
// Anything not set as a Vercel environment variable can live in postroom.kv('settings'),
// so keys can be pasted into Postroom → Settings instead of the Vercel dashboard.
// Real environment variables always win.
export const DB_SETTING_KEYS = [
  'APP_PASSWORD', 'ENCRYPTION_KEY', 'SESSION_SECRET', 'CRON_SECRET', 'RESEARCH_KEY', 'MCP_KEY', 'APP_TIMEZONE',
  'META_APP_ID', 'META_APP_SECRET', 'META_CONFIG_ID', 'IG_APP_ID', 'IG_APP_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET',
  'YOUTUBE_AUDITED', 'TIKTOK_AUDITED', 'ANTHROPIC_API_KEY', 'MCP_AUTO_APPROVE', 'META_WEBHOOK_VERIFY_TOKEN',
];
const fromEnv = new Set();
let envScanned = false;
let settingsLoadedAt = 0;
export async function loadSettings({ force = false } = {}) {
  if (!envScanned) {
    for (const k of DB_SETTING_KEYS) if (process.env[k]) fromEnv.add(k);
    envScanned = true;
  }
  if (!force && Date.now() - settingsLoadedAt < 30000) return;
  let s = {};
  try {
    s = (await kvGet('settings')) || {};
  } catch (e) {
    console.error('loadSettings failed', e.message);
    return;
  }
  for (const k of DB_SETTING_KEYS) {
    if (fromEnv.has(k)) continue;
    if (s[k] == null || s[k] === '') delete process.env[k];
    else process.env[k] = String(s[k]);
  }
  settingsLoadedAt = Date.now();
}
export async function saveSettings(patch) {
  const cur = (await kvGet('settings')) || {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (!DB_SETTING_KEYS.includes(k)) throw new HttpError(400, `Unknown setting ${k}.`);
    if (fromEnv.has(k)) throw new HttpError(400, `${k} is set in Vercel; change it there.`);
    if (v === null || v === '') delete cur[k];
    else cur[k] = String(v).trim();
  }
  await kvSet('settings', cur);
  await loadSettings({ force: true });
}
export const settingSource = (k) => (fromEnv.has(k) ? 'vercel' : process.env[k] ? 'postroom' : null);

/** Run `fn` at most once per `everySec` (best effort, shared through kv). */
export async function throttle(key, everySec, fn) {
  const last = await kvGet(`throttle:${key}`);
  if (last && Date.now() - last < everySec * 1000) return { skipped: true };
  await kvSet(`throttle:${key}`, Date.now());
  return fn();
}

// ---------- crypto ----------
function key32() {
  const k = env('ENCRYPTION_KEY');
  if (!k) throw new HttpError(500, 'ENCRYPTION_KEY is not set.');
  return crypto.createHash('sha256').update(k).digest();
}
export function encrypt(text) {
  if (text == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key32(), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v2', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
/** Returns null when the value can't be decrypted (e.g. a token written by Postroom v1). */
export function decrypt(blob) {
  if (!blob || !String(blob).startsWith('v2.')) return null;
  try {
    const [, iv, tag, ct] = String(blob).split('.');
    const d = crypto.createDecipheriv('aes-256-gcm', key32(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
export const randomId = (n = 24) => crypto.randomBytes(n).toString('base64url');
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

// ---------- sessions ----------
const COOKIE = 'pr_session';
const SESSION_DAYS = 30;
function sign(v) {
  const s = env('SESSION_SECRET') || env('ENCRYPTION_KEY');
  return crypto.createHmac('sha256', s).update(v).digest('base64url');
}
export function sessionCookie() {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const v = `${exp}.${sign(String(exp))}`;
  return `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export function readCookie(req, name) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
export function isAuthed(req) {
  const v = readCookie(req, COOKIE);
  if (!v) return false;
  const [exp, sig] = v.split('.');
  return Number(exp) > Date.now() && safeEqual(sig, sign(exp));
}

// ---------- http ----------
export async function body(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}
export function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}
export function redirect(res, location, headers = {}) {
  res.statusCode = 302;
  res.setHeader('location', location);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end();
}

/** fetch with a timeout; network failures become transient PlatformErrors. */
export async function fetchT(url, init = {}, timeoutMs = 60000) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new PlatformError(`Network error reaching ${new URL(url).host} (${e.message})`, { transient: true });
  }
}
export async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text.slice(0, 500) };
  }
}
export const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- time ----------
function tzOffsetMs(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
/** "2026-11-20T18:30" (wall time in `tz`) → Date. */
export function zonedToUtc(local, tz = TZ()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz); // second pass settles DST edges
  return new Date(t);
}
/** Accepts 'now', ISO strings with an offset, or wall-clock time in the app timezone. */
export function parseWhen(v, { allowPast = false } = {}) {
  if (v == null || v === '' || v === 'now') return new Date();
  let d;
  if (v instanceof Date) d = v;
  else if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(String(v))) d = new Date(v);
  else d = zonedToUtc(String(v));
  if (!d || Number.isNaN(d.getTime())) throw new HttpError(400, `Couldn't read the time "${v}". Use e.g. 2026-11-20T18:30.`);
  if (!allowPast && d.getTime() < Date.now() - 5 * 60e3) throw new HttpError(400, 'That time is in the past.');
  return d;
}
export function localLabel(d, tz = TZ()) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
}
