# Setting up Postroom v2

You connect accounts by **logging in on each platform's own page**; Postroom never sees a password.
For that to work, Postroom needs one free "developer app" per platform. That's a one-time job of
about 15 minutes each. After that you can connect as many accounts as you like.

| Platform | Developer app | Works immediately for | Needs a platform review for |
|---|---|---|---|
| Instagram | Meta for Developers (you already have one for v1) | Your own accounts, added as testers | Accounts you don't own (clients) |
| YouTube | Google Cloud project | Uploading to your channels, but **as private** | Public uploads (YouTube API audit, free) |
| TikTok | TikTok for Developers | "Only me" posts and **Send to TikTok inbox** (you tap Post in the app) | Public direct posts (TikTok audit, free) |

Dashboards get renamed often. If a menu name below doesn't match, look for the closest one.

---

## 1. Database (Supabase project `postroom`)

v2 keeps the v1 tables and adds to them, so your existing data stays. In Supabase → SQL editor, run
these files from `db/` in order:

1. `002_multiplatform.sql`
2. `003_research.sql`

(`001_base.sql` is only for a brand-new database. Alternatively, run `DATABASE_URL=… npm run db:migrate`
to apply all three, since each is safe to re-run.)

The migration also turns on Row Level Security for every Postroom table. This closes the
"tables readable with the anon key" hole Supabase was warning about. The app connects as the table
owner, so it's unaffected.

The existing cron job (`postroom-tick`, every minute) stays as it is. Postroom v2 checks the same
`x-cron-secret` header, so set `CRON_SECRET` in Vercel to the secret already in that job (Supabase →
Integrations → Cron → `postroom-tick`).

## 2. Deploy to Vercel (project `vwd-postroom`)

v1 was deployed from your computer with the Vercel CLI, and v2 deploys the same way:

```bash
cd postroom
npm install
vercel link        # choose the existing vwd-postroom project
vercel --prod
```

Better long-term: put `postroom/` in its own **private** GitHub repo and connect it under Vercel →
Project → Git, so every push deploys.

Then in Vercel → Storage, make sure a **Blob** store is connected to the project. That sets
`BLOB_READ_WRITE_TOKEN`, which uploads need.

## 3. Environment variables (Vercel → Settings → Environment Variables)

| Name | What |
|---|---|
| `APP_URL` | `https://vwd-postroom.vercel.app` (no trailing slash) |
| `APP_PASSWORD` | The password you sign in with |
| `ENCRYPTION_KEY` | Long random string; encrypts stored logins. **Don't change it later**, or every account must reconnect |
| `SESSION_SECRET` | Long random string |
| `CRON_SECRET` | Same value as in the Supabase cron job |
| `APP_TIMEZONE` | `Asia/Kolkata` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | Keep your v1 values (Supabase transaction pooler), or set `DATABASE_URL` instead |
| `IG_APP_ID`, `IG_APP_SECRET` | Step 4 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Step 5 |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Step 6 |
| `YOUTUBE_AUDITED`, `TIKTOK_AUDITED` | `false` until each platform approves public posting, then `true` |
| `MCP_KEY` | Long random string. Your Claude connector URL becomes `APP_URL/api/mcp/MCP_KEY` |
| `RESEARCH_KEY` | Long random string, used by the ig-research toolkit to push research |
| `ANTHROPIC_API_KEY` | Optional. Enables **Write with Claude** inside the composer |
| `MCP_AUTO_APPROVE` | Optional. `true` means posts Claude creates skip your approval |

Generate random strings with `openssl rand -base64 32`.

After changing variables, redeploy (`vercel --prod`).

## 4. Instagram (Meta for Developers)

Open your existing app at developers.facebook.com → My Apps → *(the app v1 used)* →
**Instagram → API setup with Instagram login**.

1. **Business login settings → OAuth redirect URIs**: add
   `https://vwd-postroom.vercel.app/api/connect/instagram/callback`. This is a new path; v1 used `/api/ig/callback`.
2. **Deauthorize callback URL**: `https://vwd-postroom.vercel.app/api/ig/deauthorize`
   **Data deletion request URL**: `https://vwd-postroom.vercel.app/api/ig/data-deletion`
3. **Permissions**: v2 also asks for `instagram_business_manage_insights`, which feeds the Analytics tab.
4. **App roles → Roles → Instagram testers**: add each of your Instagram accounts. Then accept the
   invite in the Instagram app (Settings → Website permissions → Apps and websites → Tester invites).
5. Copy the **Instagram app ID** and **Instagram app secret** into `IG_APP_ID` / `IG_APP_SECRET`.

Accounts must be **Professional** (Creator or Business): in Instagram, Settings → Account type.

> Your existing v1 Instagram account needs **Reconnect** once after the upgrade, because v2 stores
> logins in a new encrypted format. Postroom flags it on the Accounts page.

## 5. YouTube (Google Cloud)

1. console.cloud.google.com → create a project, e.g. "Postroom".
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** (Google Auth Platform):
   - User type: **External**. App name: Postroom. Use your own email.
   - App domain links: `https://vwd-postroom.vercel.app/privacy.html` and `/terms.html`.
   - **Data access / Scopes**: add `…/auth/youtube.upload` and `…/auth/youtube.readonly`.
   - **Audience**: click **Publish app** (Production). While it stays in "Testing", Google expires the
     login after 7 days and you'd have to reconnect weekly. Unverified apps are fine for your own use:
     you'll see a "Google hasn't verified this app" screen. Click *Advanced → Go to Postroom*.
4. **Credentials → Create credentials → OAuth client ID** → *Web application*:
   - Authorized redirect URI: `https://vwd-postroom.vercel.app/api/connect/youtube/callback`
   - Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. **Public uploads.** Until your project passes YouTube's API compliance audit, YouTube forces API
   uploads to *private*. You can flip each one to public in YouTube Studio. To lift the restriction,
   apply through Google's "YouTube API Services – Audit and Quota Extension" form, then set
   `YOUTUBE_AUDITED=true`.
6. **Quota.** The default is 10,000 units/day per project. Check the cost of `videos.insert` on your
   project's Quotas page. When it runs out, Postroom waits and retries after midnight Pacific time automatically.

Brand channels: when Google asks which account or channel to use, pick the channel. Repeat Connect
for each channel.

## 6. TikTok (TikTok for Developers)

1. developers.tiktok.com → **Manage apps → Connect an app**.
2. Fill in the app details: icon, description, category. **Terms of Service URL**:
   `https://vwd-postroom.vercel.app/terms.html`. **Privacy Policy URL**: `…/privacy.html`.
   Platform: **Web**, with your app URL.
3. **Add products**: **Login Kit** and **Content Posting API**. In Content Posting API, turn on
   **Direct Post**.
4. **Scopes**: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.upload`,
   `video.publish`, `video.list`.
5. **Login Kit → Redirect URI**: `https://vwd-postroom.vercel.app/api/connect/tiktok/callback`
6. Copy **Client key** and **Client secret** into `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`.
7. Submit the app for review. While it's in sandbox or unreviewed, add your TikTok accounts as
   **target users** in the sandbox settings.
8. **Public direct posts** need TikTok's Content Posting audit. They'll check the composer follows
   their rules; Postroom's TikTok panel was built to them (creator name shown, no default privacy,
   interaction toggles, commercial-content disclosure, music-usage consent). Until then:
   - **Direct post** works, visible to *Only me*.
   - **Send to TikTok inbox** works publicly: the video arrives as a draft in your TikTok inbox, and you
     add sound and caption, then tap Post. Postroom shows the caption to paste.

   After approval, set `TIKTOK_AUDITED=true`.

## 7. Claude

- **Connector (no API key needed)**: Postroom → Settings → Claude shows your MCP URL. In Claude →
  Settings → Connectors → *Add custom connector* → paste it. Then ask, e.g., *"Look at my analytics
  and the packaging-design research, and plan next week: 4 reels for Instagram, cross-posted as
  Shorts and TikTok inbox drafts, at my best hours."* The posts arrive in **Plans** for you to approve.
- **Write with Claude** (in the composer) needs `ANTHROPIC_API_KEY`.

## 8. Research extension

See `extensions/ig-research/README.md`. In short: set `RESEARCH_KEY`, then on your Mac run
`npm run push -- <project>` after a scrape. YouTube channels can be analysed straight from the
Research tab, with nothing to install.

## 9. Run it locally (optional)

```bash
# Postgres on localhost, then:
export DATABASE_URL=postgres://postgres@localhost:5432/postroom APP_URL=http://localhost:3000 \
  APP_PASSWORD=demo ENCRYPTION_KEY=dev SESSION_SECRET=dev STORAGE=local
npm run db:migrate
node scripts/seed-demo.mjs        # optional demo data
npm run build && node scripts/dev-server.mjs
# tests (uses a throwaway database — it drops the postroom schema):
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postroom_test npm test
```
