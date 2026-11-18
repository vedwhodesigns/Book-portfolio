// Brand kits (voice, hashtags, sign-off, defaults) and posting slots per account.
import { db, HttpError, TZ, zonedToUtc } from './core.js';

const DAYS = [1, 2, 3, 4, 5, 6, 7]; // 1 = Monday … 7 = Sunday
const TEXT = ['name', 'tone', 'audience', 'signoff', 'dos', 'donts', 'notes', 'cta', 'language'];

function cleanBrand(b = {}) {
  const out = {};
  for (const k of TEXT) if (b[k] != null && String(b[k]).trim()) out[k] = String(b[k]).trim().slice(0, 2000);
  out.hashtag_sets = (Array.isArray(b.hashtag_sets) ? b.hashtag_sets : [])
    .map((s) => ({
      name: String(s.name || '').trim().slice(0, 60) || 'Default',
      tags: (Array.isArray(s.tags) ? s.tags : String(s.tags || '').split(/[\s,]+/))
        .map((t) => String(t).trim().replace(/^#?/, '#')).filter((t) => t.length > 1).slice(0, 30),
    }))
    .filter((s) => s.tags.length)
    .slice(0, 12);
  if (b.defaults && typeof b.defaults === 'object') out.defaults = b.defaults;
  return out;
}

function cleanSlots(slots = []) {
  if (!Array.isArray(slots)) throw new HttpError(400, 'Slots must be a list.');
  return slots.map((s) => {
    const time = String(s.time || '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, `"${time}" isn't a time like 19:00.`);
    const days = (Array.isArray(s.days) && s.days.length ? s.days : DAYS).map(Number).filter((d) => DAYS.includes(d));
    return { days: [...new Set(days)].sort(), time };
  }).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 40);
}

export async function updateBrand(accountId, { brand, slots }) {
  const [a] = await db()`select id from postroom.accounts where id = ${accountId}`;
  if (!a) throw new HttpError(404, 'Account not found.');
  if (brand !== undefined) await db()`update postroom.accounts set brand = ${db().json(cleanBrand(brand))} where id = ${accountId}`;
  if (slots !== undefined) await db()`update postroom.accounts set slots = ${db().json(cleanSlots(slots))} where id = ${accountId}`;
  const [row] = await db()`select id, username, platform, brand, slots from postroom.accounts where id = ${accountId}`;
  return row;
}

/** Wall-clock date parts in the app time zone. */
function localParts(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value;
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[g('weekday')];
  return { date: `${g('year')}-${g('month')}-${g('day')}`, wd };
}

/**
 * The next free posting slot for an account, at least 10 minutes from now.
 * `taken` lets a caller reserve slots it is about to fill (e.g. several posts in one plan).
 */
export async function nextSlot(account, { after = new Date(), taken = [] } = {}) {
  const slots = account.slots || [];
  if (!slots.length) throw new HttpError(400, `@${account.username} has no posting slots yet — add them under Accounts → Brand kit & slots, or give a time.`);
  const busy = await db()`select scheduled_at from postroom.posts where account_id = ${account.id}
    and status in ('draft','scheduled','processing','published') and scheduled_at > now() - interval '1 day'`;
  const used = [...busy.map((r) => new Date(r.scheduled_at).getTime()), ...taken.map((t) => new Date(t).getTime())];
  const earliest = Math.max(after.getTime(), Date.now() + 10 * 60e3);
  for (let i = 0; i < 60; i++) {
    const day = new Date(earliest + i * 864e5);
    const { date, wd } = localParts(day);
    for (const s of slots) {
      if (!s.days.includes(wd)) continue;
      const at = zonedToUtc(`${date}T${s.time}`);
      if (!at || at.getTime() < earliest) continue;
      if (used.some((u) => Math.abs(u - at.getTime()) < 30 * 60e3)) continue; // something already within 30 min
      return at;
    }
  }
  throw new HttpError(400, `No free slot for @${account.username} in the next 60 days.`);
}

/** Short text block about an account's brand, for Claude prompts and MCP output. */
export function brandSummary(a) {
  const b = a.brand || {};
  const lines = [];
  if (b.tone) lines.push(`Tone: ${b.tone}`);
  if (b.audience) lines.push(`Audience: ${b.audience}`);
  if (b.language) lines.push(`Language: ${b.language}`);
  if (b.cta) lines.push(`Call to action: ${b.cta}`);
  if (b.signoff) lines.push(`Sign-off: ${b.signoff}`);
  for (const s of b.hashtag_sets || []) lines.push(`Hashtags (${s.name}): ${s.tags.join(' ')}`);
  if (b.dos) lines.push(`Do: ${b.dos}`);
  if (b.donts) lines.push(`Don't: ${b.donts}`);
  if (b.notes) lines.push(`Notes: ${b.notes}`);
  return lines.join('\n');
}
