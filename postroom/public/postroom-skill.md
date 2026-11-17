---
name: postroom
description: Upload and schedule videos and images on Postroom (the owner's Instagram + YouTube posting app at vwd-postroom.vercel.app). Use whenever the user says to post, upload, schedule, queue or publish something on Instagram, YouTube, Postroom, The Crime Archives, How It Clicks or Bonbec, or asks what is scheduled.
---

# Postroom: upload and schedule posts

Postroom posts to these accounts:

| Brand | Instagram | YouTube |
|---|---|---|
| The Crime Archives | `instagram:crimearchives.media` | `youtube:thecrimearchivesmedia` |
| How It Clicks | `instagram:howitclicks.ai` | `youtube:howitclicksai` |
| Bonbec | `instagram:bonbec.in` | none |

Everything goes through one command on this computer: `node ~/postroom/postroom.mjs`.

If it's missing, ask the owner to run this once in Terminal (it asks for the Postroom password itself):

```bash
curl -fsSL https://vwd-postroom.vercel.app/install.sh | bash
```

Never ask for the password in chat, never print it, and never put it in a file other than `~/.postroom.json`.

## Steps

1. **Know the account's brand kit:** run `node ~/postroom/postroom.mjs accounts`. It shows each account's posting slots and must-use hashtags. Follow that brand's voice, and never invent facts.
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
     - or an India time like `"2026-11-25T22:00"`
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
3. **Check:** run `node ~/postroom/postroom.mjs check <card>`. Read the caption preview and fix any ✗.
4. **Post:** run `node ~/postroom/postroom.mjs post <card>`. It uploads the files and schedules the post.
5. **Report** the ✓ lines (platform, format, time) to the owner. The owner's phone gets a notification when each post goes live or fails.

## Other commands

- `node ~/postroom/postroom.mjs queue`: what's scheduled
- `node ~/postroom/postroom.mjs upload <files…>`: put files in the library only

Changing or cancelling posts happens in the Postroom app: Queue → open the post.

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
