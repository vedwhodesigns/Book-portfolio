// Notifications: stored in the database (the in-app list) and pushed to installed devices (Web Push).
// Pushes carry no payload, so no message encryption is needed: the service worker fetches the newest
// notification from /api/notifications when the push arrives.
import crypto from 'node:crypto';
import { db, kvGet, kvSet, APP_URL, encrypt, decrypt, fetchT } from './core.js';

const b64u = (b) => Buffer.from(b).toString('base64url');

/** VAPID key pair, created on first use and kept (private part encrypted) in the database. */
export async function vapidKeys() {
  const stored = await kvGet('vapid');
  if (stored?.public && stored?.jwk_enc) return { public: stored.public, jwk: JSON.parse(decrypt(stored.jwk_enc)) };
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  const jwk = privateKey.export({ format: 'jwk' });
  const v = { public: b64u(raw), jwk_enc: encrypt(JSON.stringify(jwk)) };
  await kvSet('vapid', v);
  return { public: v.public, jwk };
}

function vapidJwt(audience, jwk) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: APP_URL() || 'https://vwd-postroom.vercel.app' }));
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${claims}.${b64u(sig)}`;
}

/** Wake every subscribed device. Dead subscriptions (404/410) are removed. */
export async function pushAll() {
  const subs = await db()`select * from postroom.push_subscriptions`;
  if (!subs.length) return { sent: 0 };
  const keys = await vapidKeys();
  let sent = 0;
  for (const s of subs) {
    try {
      const res = await fetchT(s.endpoint, {
        method: 'POST',
        headers: {
          TTL: '86400',
          Urgency: 'high',
          'Content-Length': '0',
          Authorization: `vapid t=${vapidJwt(new URL(s.endpoint).origin, keys.jwk)}, k=${keys.public}`,
        },
      }, 15000);
      if (res.status === 404 || res.status === 410) {
        await db()`delete from postroom.push_subscriptions where id = ${s.id}`;
      } else if (res.ok) {
        sent++;
        await db()`update postroom.push_subscriptions set last_ok_at = now(), failures = 0 where id = ${s.id}`;
      } else {
        await db()`update postroom.push_subscriptions set failures = failures + 1 where id = ${s.id}`;
      }
    } catch {
      await db()`update postroom.push_subscriptions set failures = failures + 1 where id = ${s.id}`;
    }
  }
  return { sent };
}

/** Record a notification and push it to devices. Never throws (publishing must not fail because of it). */
export async function notify({ kind, title, body = null, url = null, postId = null, accountId = null }) {
  try {
    const [n] = await db()`insert into postroom.notifications (kind, title, body, url, post_id, account_id)
      values (${kind}, ${title}, ${body}, ${url}, ${postId}, ${accountId}) returning id`;
    await pushAll();
    return n;
  } catch (e) {
    console.error('notify failed', e.message);
    return null;
  }
}

export async function subscribe({ endpoint, keys, device }) {
  if (!endpoint || !/^https:\/\//.test(endpoint)) throw Object.assign(new Error('Bad push subscription.'), { status: 400 });
  await db()`insert into postroom.push_subscriptions (endpoint, keys, device) values (${endpoint}, ${db().json(keys || {})}, ${device || null})
    on conflict (endpoint) do update set keys = excluded.keys, device = excluded.device, failures = 0`;
  return { ok: true };
}
export async function unsubscribe({ endpoint }) {
  await db()`delete from postroom.push_subscriptions where endpoint = ${endpoint || ''}`;
  return { ok: true };
}

export async function listNotifications({ limit = 50, unread = false } = {}) {
  const rows = await db()`select n.*, a.username as account_username, a.platform from postroom.notifications n
    left join postroom.accounts a on a.id = n.account_id
    where true ${unread === true || unread === '1' || unread === 'true' ? db()`and n.read_at is null` : db()``}
    order by n.created_at desc limit ${Math.min(Number(limit) || 50, 200)}`;
  const [{ n }] = await db()`select count(*)::int as n from postroom.notifications where read_at is null`;
  return { unread: n, items: rows };
}
export async function markRead() {
  await db()`update postroom.notifications set read_at = now() where read_at is null`;
  return { ok: true };
}
export async function pushStatus() {
  const subs = await db()`select device, created_at, last_ok_at, failures from postroom.push_subscriptions order by created_at desc`;
  return { devices: subs, public_key: (await vapidKeys()).public };
}
