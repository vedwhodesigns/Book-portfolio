---
name: postroom
description: Upload and schedule videos and images on Postroom (the owner's Instagram + YouTube posting app at vwd-postroom.vercel.app), and use its Planner (ideas pipeline, series, mood boards, reference library). Use whenever the user says to post, upload, schedule, queue or publish something on Instagram, YouTube, Postroom, The Crime Archives, How It Clicks or Bonbec, asks what is scheduled, or wants to save a reference, build a mood board, file an idea or plan a series/episode.
---

# Postroom: upload and schedule posts

Postroom posts to these accounts:

| Brand | Instagram | YouTube |
|---|---|---|
| The Crime Archives | `instagram:crimearchives.media` | `youtube:thecrimearchivesmedia` |
| How It Clicks | `instagram:howitclicks.media` | `youtube:howitclicksai` |
| Bonbec | `instagram:bonbec.in` | none |

Everything goes through one command on this computer: `node "$HOME/postroom/postroom.mjs"` (works in PowerShell, Git Bash, macOS and Linux).

If it's missing, ask the owner to run this once. It asks for the Postroom password itself.

- **Windows (PowerShell):**

  ```powershell
  irm https://vwd-postroom.vercel.app/install.ps1 | iex
  ```

- **Mac/Linux (Terminal):**

  ```bash
  curl -fsSL https://vwd-postroom.vercel.app/install.sh | bash
  ```

Never ask for the password in chat, never print it, and never put it in a file other than `~/.postroom.json`.

## Steps

1. **Know the account's brand kit:** run `node "$HOME/postroom/postroom.mjs" accounts`. It shows each account's posting slots and must-use hashtags. Follow that brand's voice, and never invent facts.
2. **Write a post card** next to the files, as `<name>.card.json`:

```json
{
  "media": ["video.mp4"],
  "accounts": ["instagram:crimearchives.media", "youtube:thecrimearchivesmedia"],
  "title": "YouTube title (≤100 characters)",
  "caption": "The caption. Shared by every account unless \"captions\" is given.",
  "captions": { "instagram": "…", "youtube": "…" },
  "youtube_tags": ["specific search tag", "another"],
  "when": "next_slot",
  "instagram_cover": "cover-9x16.jpg",
  "youtube_thumbnail": "thumb-16x9.jpg"
}
```

   - **`media`:** local files in order (carousel order for several images). Use MP4/MOV video and JPEG/PNG images.
   - **`when`:**
     - `"next_slot"`: the account's next free posting slot
     - `"now"`
     - `"draft"`: saved, not posted
     - or an India time like `"2026-11-25T20:30"`
   - **Postroom adds automatically:**
     - the brand's must-use hashtags if they're missing (add `"hashtags": "none"` to stop this)
     - the brand's hidden YouTube tags
     - the Instagram AI label where the brand needs it
     - "not made for kids", public, and the YouTube category
   - **Format** is picked automatically:
     - vertical video → Instagram Reel + YouTube Short
     - one image → photo post
     - several images → carousel (up to 20)
     - To force a format: `"kind": { "instagram": "story" }`. Instagram takes `image`, `carousel`, `reel` or `story`; YouTube takes `short` or `video`.
     - YouTube only accepts videos, so leave YouTube out of photo posts.
   - **Optional extras** go in `"options"`:
     - `"instagram"`: `collaborators`, `user_tags`, `first_comment`, `trial` (`"manual"` or `"auto"`), `alt_text`
     - `"youtube"`: `playlist_id`, `first_comment`, `privacy`
3. **Check:** run `node "$HOME/postroom/postroom.mjs" check <card>`. Read the caption preview and fix any ✗.
4. **Post:** run `node "$HOME/postroom/postroom.mjs" post <card>`. It uploads the files and schedules the post.
5. **Report** the ✓ lines (platform, format, time) to the owner. The owner's phone gets a notification when each post goes live or fails.

## Other commands

- `node "$HOME/postroom/postroom.mjs" queue`: what's scheduled
- `node "$HOME/postroom/postroom.mjs" drafts`: drafts with their post ids
- `node "$HOME/postroom/postroom.mjs" schedule <post-id> [2026-11-20T20:30 | next_slot]`: schedule a draft. Its other platforms in the same cross-post are scheduled too. Leave out the time to keep the draft's time. Never re-post a card to schedule a draft; that uploads duplicates.
- `node "$HOME/postroom/postroom.mjs" upload <files…>`: put files in the library only
- `node "$HOME/postroom/postroom.mjs" grab <YouTube/Instagram link or channel> --brand "<channel>"`: download a video (or a channel's top videos), read it at 12 fps, listen with earshot, and have Claude write learnings for that channel. Ask which channel first if the user didn't say. See the `video-lab` skill.
- In a channel's own chat, "pull the latest Video Lab learnings" → the connector's `brand_learnings` tool (brand = that channel) returns every analysis for it: scripting, visuals, music & sound, editing & pacing, hook, packaging and next-video plans. Use them when planning or scripting that channel's next videos.
- `node "$HOME/postroom/postroom.mjs" report "The Crime Archives"`: the latest weekly report for a brand: every post with its numbers, what worked, what didn't, the running learnings, last week's experiments and next week's decisions. Add `--new` to write a fresh one for the last 7 days, `--json` for the raw data.

Changing captions or times, or cancelling a post, happens in the Postroom app: Queue → open the post. The Postroom connector's `update_post`, `schedule_post` and `cancel_post` tools do the same.

## Weekly report: read it before planning

- Postroom writes a report for each brand every **Monday at 10:00 India time**, covering Monday to Sunday. It also appears in the app under Analytics → Weekly report.
- **Before suggesting next week's ideas, hooks or posting times,** run `report "<brand>"` (or the connector's `weekly_report` tool).
- Follow its decisions and experiments. Don't repeat what it lists under "What didn't" unless you're testing it on purpose.
- Name the learning you're building on, e.g. "Evening posts beat morning ones (confirmed twice)".

## Brand reminders

- **The Crime Archives:**
  - Cinematic, suspenseful narrator voice.
  - Shorts end with "What would you do?"
  - Long-form has no call to action.
  - Hashtags #TheCrimeArchives #truecrime #fyp #murdermystery #whatwouldyoudo (added automatically).
  - Shorts go to BOTH Instagram and YouTube.
- **How It Clicks:**
  - Write captions with the `how-it-clicks-captions` skill if installed.
  - Headline in Title Case plus one emoji, then a 2–4 sentence fact story, then 3–4 hashtags.
  - Never mention 3D, Blender or AI.

## Planner (ideas, series, mood boards, references)

Postroom also holds the content plan.

**From any chat with the Postroom connector,** use these tools:
- `plan_overview`: the plan at a glance
- `save_reference`: save a link, a researched post, a colour or a note as a reference
- `create_board` / `add_to_board`: build mood boards
- `create_idea` / `update_idea`: file ideas and move them through *idea → scripting → producing → ready → scheduled → posted*
- `save_series`: create or update a series

**From this computer:** to save local images or links as references, run:
```
node "$HOME/postroom/postroom.mjs" ref <image-or-link…> --brand "The Crime Archives" --tags hook,lighting --note "…" [--board <board-id>] [--idea <idea-id>]
```

**Rules:**
- When the owner says "save this as a reference", save it as kept.
- When **you** are proposing references (e.g. after studying a competitor), pass `suggest: true`. They go to "Suggested by Claude" for the owner to keep or discard.
- Tag references by what they're useful for: hook, pacing, edit, transition, lighting, colour, thumbnail, cover, caption, font, sound, format, story.
- When a finished video comes from a planned idea, add `"idea": "<idea id>"` to its post card. The idea then moves to Scheduled, and to Posted when it goes live.
- For What Would You Do episodes, record the two choices on the idea (`choice_a`, `choice_b`). Once the comments decide, set `choice_result`, then update the series' `next_note` so the next episode follows the audience.
