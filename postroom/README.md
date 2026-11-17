# Postroom v2

Schedule and cross-post to **Instagram, YouTube and TikTok** from one place, with multiple accounts
per platform. Upload a video once, pick the accounts, tweak per-platform settings and schedule.
Postroom uploads, retries, and pulls the stats back in.

**Setup:** see [SETUP.md](SETUP.md).

## What's in it

- **Calendar**: week/month view of everything across all accounts. Cross-posts are grouped,
  you can drag to reschedule, and there's an agenda view on mobile.
- **Composer**: upload once (up to 4 GB, straight to Blob storage), choose accounts across platforms,
  write a shared caption with optional per-platform versions, and set formats (Reel/Story/Carousel,
  Short/Video, TikTok direct or inbox). Live rule checks per account, a preview, and post now,
  schedule or draft. "Write with Claude" drafts captions per platform.
- **Queue**: upcoming, drafts, failed (with the reason and a retry button) and published.
- **Plans**: posts Claude proposes over MCP wait here until you approve them.
- **Analytics**: views, likes, comments and shares versus the previous period, views by day,
  per-platform and per-account breakdowns, follower trends, top posts and best posting hours.
- **Accounts**: connect or reconnect through each platform's official login. Tokens are refreshed automatically.
- **Library**: every uploaded file, reusable.
- **Research (extension)**: niche and competitor research pushed from the ig-research toolkit on your Mac,
  plus official YouTube lookups of any channel. "Make a post like this" turns a teardown into a brief.
- **MCP server** at `/api/mcp/<MCP_KEY>`, so Claude can read analytics and research, check posts
  against platform rules and propose plans.

## How publishing works

Supabase `pg_cron` calls `/api/cron/tick` every minute. Each due post moves forward one step
at a time, as far as the 5-minute function limit allows:

- **Instagram**: create container → poll until processed → publish.
- **YouTube**: resumable upload in 16 MB chunks, read from Blob with HTTP ranges, so files of any size
  survive across ticks.
- **TikTok**: init with creator-info checks → chunked upload → poll status.

Network errors, rate limits and quota exhaustion retry with backoff. A revoked login fails the
post and flags the account for reconnecting.

## Layout

```
api/router.js            all /api routes (one Vercel function)
api/_lib/platforms/      instagram.js · youtube.js · tiktok.js (OAuth, validation, publish steps, metrics)
api/_lib/                core, accounts, media, posts, publisher, analytics, research, mcp, ai
db/                      SQL migrations (run in order)
src/                     Preact UI → built to public/app.js by build.mjs
extensions/ig-research/  the Mac research toolkit + push-to-postroom.js
scripts/                 dev server, migrations, demo seed
test/                    unit + end-to-end tests (fake platform APIs, real Postgres)
```
