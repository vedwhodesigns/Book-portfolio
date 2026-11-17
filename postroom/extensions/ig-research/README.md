# ig-research → Postroom Research

The research toolkit runs **on your Mac** (it needs a logged-in Chrome, Whisper, ffmpeg and yt-dlp).
Postroom's **Research** tab is where the results live, side by side with your posting calendar.
Claude can search them too, through Postroom's MCP connector.

```
Mac (this folder)                          Postroom (Vercel)
───────────────────                        ──────────────────────────────
start-chrome.command  → log in once
npm run scrape <project>     ─┐
npm run transcribe <project>  │  push-to-postroom.js   →  /api/research/ingest
npm run teardown <project>    ├────────────────────────→  Research tab · MCP research_* tools
                              ┘                           "Make a post like this" → Composer
```

## One-time setup

1. In Vercel → Postroom → Settings → Environment Variables, add `RESEARCH_KEY` (any long random string) and redeploy.
2. On your Mac, inside this folder: `npm install`.
3. Add to your shell profile (`~/.zshrc`):

   ```bash
   export POSTROOM_URL=https://vwd-postroom.vercel.app
   export POSTROOM_RESEARCH_KEY=<the same RESEARCH_KEY>
   ```

## Every research run

```bash
./start-chrome.command                 # log in to Instagram in that window the first time
npm run scrape -- my-niche             # needs projects/my-niche/config.json
npm run transcribe -- my-niche         # optional (Whisper)
npm run teardown -- my-niche --limit 10   # optional (Gemini; GEMINI_API_KEY)
npm run push -- my-niche               # → Postroom Research tab
```

Re-running `push` is safe; posts are updated, not duplicated.

`projects/<name>/config.json` example:

```json
{
  "name": "packaging-design",
  "niche": "Packaging & branding design",
  "searchTerms": ["packagingdesign", "brandidentity"],
  "competitors": ["https://www.instagram.com/someone/"],
  "maxPostsPerSearch": 40,
  "maxCompetitorPosts": 12
}
```

## YouTube needs none of this

In Postroom → Research → **Look up a YouTube channel**, paste any `@handle`: it uses the official
YouTube API through your connected channel, so there's no scraping and nothing to run locally.

## Notes

- `scrape.js` drives a real logged-in Instagram session. Instagram doesn't allow automated
  collection, so keep runs small and infrequent; the script already stops on login walls
  and rate-limit signals. Use a secondary Instagram account for the research browser rather than
  your main one.
- `library.js`, `report-html.js` and `dealbot.js` still work as before. The Research tab replaces
  the password-protected reel library site.
- Treat what you collect as reference: Postroom's "Make a post like this" borrows a post's
  structure and hook type, never its words or footage.
