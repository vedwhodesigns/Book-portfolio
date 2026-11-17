// Connected accounts across platforms: OAuth connect, tokens, listing, disconnect.
import { db, APP_URL, encrypt, decrypt, randomId, kvGet, kvSet, kvDel, logEvent, HttpError, PlatformError } from './core.js';
import { PLATFORMS, platform } from './platforms/index.js';

export const redirectUri = (id) => `${APP_URL()}/api/connect/${id}/callback`;

export function accountRow(a, extra = {}) {
  return {
    id: a.id,
    platform: a.platform,
    username: a.username,
    name: a.name,
    account_type: a.account_type,
    profile_picture_url: a.profile_picture_url,
    profile_url: a.profile_url,
    followers_count: a.followers_count == null ? null : Number(a.followers_count),
    status: a.status,
    status_detail: a.status === 'active' ? null : a.status_detail,
    token_expires_at: a.token_expires_at,
    refresh_expires_at: a.refresh_expires_at,
    connected_at: a.connected_at,
    ...extra,
  };
}

export async function listAccounts({ platform: pf = null } = {}) {
  const rows = await db()`select * from postroom.accounts where status <> 'disconnected'
    ${pf ? db()`and platform = ${pf}` : db()``} order by platform, connected_at`;
  const counts = await db()`select account_id,
      count(*) filter (where status in ('scheduled','processing'))::int as upcoming,
      count(*) filter (where status = 'draft')::int as drafts,
      count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status = 'published' and published_at > now() - interval '7 days')::int as published_7d
    from postroom.posts group by account_id`;
  const byAcc = new Map(counts.map((c) => [c.account_id, c]));
  return rows.map((a) => {
    const c = byAcc.get(a.id) || {};
    return accountRow(a, { upcoming: c.upcoming || 0, drafts: c.drafts || 0, failed: c.failed || 0, published_7d: c.published_7d || 0 });
  });
}

export function platformStatus() {
  return Object.values(PLATFORMS).map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.configured(),
    missing: p.missing ? p.missing() : p.envVars.filter((k) => !process.env[k]),
    redirect_uri: redirectUri(p.id),
    kinds: p.kinds,
  }));
}

// ---------- OAuth ----------
export async function startConnect(id) {
  const p = platform(id);
  if (!p.configured()) throw new HttpError(400, `${p.label} isn't set up yet. Add ${p.envVars.join(' and ')} in Vercel (see SETUP.md).`);
  const state = randomId();
  await kvSet(`oauth:${state}`, { platform: id }, 900);
  return p.authorizeUrl({ state, redirectUri: redirectUri(id) });
}

export async function finishConnect(id, query) {
  const p = platform(id);
  if (query.error) {
    throw new HttpError(400, `${p.label} connection cancelled: ${query.error_description || query.error_reason || query.error}`);
  }
  const st = query.state && (await kvGet(`oauth:${query.state}`));
  if (!st || st.platform !== id) throw new HttpError(400, 'This connect link expired. Start again from Accounts.');
  await kvDel(`oauth:${query.state}`);
  const result = await p.connect({ code: query.code, redirectUri: redirectUri(id) });
  const { tokens } = result;
  const profiles = result.profiles || [result.profile];
  const rows = [];
  for (const profile of profiles) rows.push(await saveConnected(p, id, tokens, profile));
  return { ...rows[0], connected: rows.map((r) => r.username) };
}

async function saveConnected(p, id, tokens, profile) {
  const [row] = await db()`insert into postroom.accounts ${db()({
    platform: id,
    external_id: profile.external_id,
    ig_user_id: id === 'instagram' ? profile.external_id : null,
    app_scoped_id: profile.meta?.app_scoped_id || null,
    username: profile.username,
    name: profile.name,
    account_type: profile.account_type,
    profile_picture_url: profile.profile_picture_url,
    profile_url: profile.profile_url,
    followers_count: profile.followers_count,
    access_token_enc: encrypt(tokens.access_token),
    refresh_token_enc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    token_expires_at: tokens.expires_at,
    refresh_expires_at: tokens.refresh_expires_at || null,
    token_refreshed_at: new Date(),
    scopes: tokens.scopes || null,
    meta: db().json(profile.meta || {}),
    status: 'active',
    status_detail: null,
  })}
  on conflict (platform, external_id) do update set
    username = excluded.username, name = excluded.name, account_type = excluded.account_type,
    profile_picture_url = excluded.profile_picture_url, profile_url = excluded.profile_url,
    followers_count = excluded.followers_count, access_token_enc = excluded.access_token_enc,
    refresh_token_enc = coalesce(excluded.refresh_token_enc, postroom.accounts.refresh_token_enc),
    token_expires_at = excluded.token_expires_at, refresh_expires_at = excluded.refresh_expires_at,
    token_refreshed_at = now(), scopes = excluded.scopes, meta = excluded.meta,
    status = 'active', status_detail = null, updated_at = now()
  returning *`;
  await logEvent({ accountId: row.id, message: `Connected ${p.label} @${row.username}` });
  return row;
}

// ---------- tokens ----------
export async function markNeedsReconnect(account, detail) {
  await db()`update postroom.accounts set status = 'needs_reconnect', status_detail = ${detail}, updated_at = now()
    where id = ${account.id}`;
  await logEvent({ accountId: account.id, level: 'error', message: `@${account.username} needs reconnecting: ${detail}` });
}

/** Returns a valid access token, refreshing (and persisting) it when needed. */
export async function accessToken(account, { force = false } = {}) {
  const p = platform(account.platform);
  const access = decrypt(account.access_token_enc);
  if (!access) {
    await markNeedsReconnect(account, 'Stored login is from the old Postroom version — reconnect once.');
    throw new PlatformError(`Reconnect @${account.username} (${p.label}) in Accounts.`, { tokenInvalid: true });
  }
  if (!force && !p.needsRefresh(account)) return access;
  try {
    const t = await p.refresh(account, { access_token: access, refresh_token: decrypt(account.refresh_token_enc) });
    await db()`update postroom.accounts set
        access_token_enc = ${encrypt(t.access_token)},
        refresh_token_enc = ${t.refresh_token ? encrypt(t.refresh_token) : account.refresh_token_enc},
        token_expires_at = ${t.expires_at},
        refresh_expires_at = ${t.refresh_expires_at ?? account.refresh_expires_at ?? null},
        token_refreshed_at = now(), status = 'active', status_detail = null, updated_at = now()
      where id = ${account.id}`;
    Object.assign(account, { token_expires_at: t.expires_at, token_refreshed_at: new Date() });
    return t.access_token;
  } catch (e) {
    if (e.tokenInvalid || /invalid_grant|expired|revoked/i.test(e.message)) {
      await markNeedsReconnect(account, e.message);
      throw new PlatformError(`Reconnect @${account.username} (${p.label}): ${e.message}`, { tokenInvalid: true });
    }
    // Refresh failed for a passing reason; the current token may still work.
    if (account.token_expires_at && new Date(account.token_expires_at) > Date.now()) return access;
    throw e;
  }
}

export async function getAccount(id) {
  const [a] = await db()`select * from postroom.accounts where id = ${id}`;
  if (!a) throw new HttpError(404, 'Account not found.');
  return a;
}

export async function syncAccount(id) {
  const a = await getAccount(id);
  const p = platform(a.platform);
  const token = await accessToken(a);
  const prof = await p.refreshProfile(token, a);
  const [row] = await db()`update postroom.accounts set username = ${prof.username}, name = ${prof.name},
      profile_picture_url = ${prof.profile_picture_url}, followers_count = ${prof.followers_count},
      profile_url = ${prof.profile_url}, updated_at = now()
    where id = ${id} returning *`;
  return accountRow(row);
}

export async function disconnectAccount(id) {
  const a = await getAccount(id);
  const cancelled = await db()`update postroom.posts set status = 'cancelled', error = 'Account disconnected', locked_until = null, updated_at = now()
    where account_id = ${id} and status in ('draft','scheduled','processing') returning id`;
  await db()`update postroom.accounts set status = 'disconnected', access_token_enc = '', refresh_token_enc = null,
      status_detail = 'Disconnected in Postroom', updated_at = now() where id = ${id}`;
  await logEvent({ accountId: id, message: `Disconnected @${a.username}; cancelled ${cancelled.length} pending post(s)` });
  return { ok: true, cancelled: cancelled.length };
}
