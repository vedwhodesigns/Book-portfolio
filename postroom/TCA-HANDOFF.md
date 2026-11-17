# The Crime Archives → Postroom handoff

Paste this into the **TCA Tool Kit** session (or its CLAUDE.md) so it can schedule finished posts itself.

---

## Standing instruction for TCA Tool Kit

When a Crime Archives post is finished (video/images exported, caption written), hand it to Postroom. Don't ask; schedule it.

**One-time setup (skip if `~/postroom/postroom.mjs` exists):**

```bash
mkdir -p ~/postroom && curl -fsSL https://vwd-postroom.vercel.app/postroom.mjs -o ~/postroom/postroom.mjs
```

The Postroom password lives in `~/.postroom.json` (`{"password": "…"}`). If that file is missing, ask the owner to create it. Never print the password or put it in a card.

**For each post:**

1. Write a card next to the exported files, e.g. `post-card.json`.
2. Run `node ~/postroom/postroom.mjs check post-card.json` and fix any ✗.
3. Run `node ~/postroom/postroom.mjs post post-card.json`.
4. Report the result lines (✓ … → time) back to the owner.

### Cards by format

**Daily short, "What Would You Do"** (Instagram reel + YouTube Short, next free test slot):

```json
{
  "media": ["wwyd-ep12.mp4"],
  "accounts": ["instagram:crimearchives.media", "youtube:thecrimearchivesmedia"],
  "title": "You wake up in the trunk of a moving car",
  "caption": "You wake up in the dark. The engine hums. Your hands are tied.\n\nA) Kick out the tail light and signal\nB) Stay still and wait for the car to stop\n\nWhat would you do? Your answer decides the next episode.",
  "when": "next_slot",
  "instagram_cover": "wwyd-ep12-cover.jpg"
}
```

**Weekly long-form real case** (YouTube only, Saturday 06:30 India time). No call to action:

```json
{
  "media": ["case-the-zodiac.mp4"],
  "accounts": ["youtube:thecrimearchivesmedia"],
  "title": "The Zodiac Killer: the letters, the ciphers, the suspects",
  "caption": "San Francisco Bay Area, 1968–1969. …\n\n00:00 The first attack\n02:40 The letters\n…",
  "when": "2026-11-21T06:30",
  "youtube_thumbnail": "case-the-zodiac-thumb.jpg",
  "hashtags": "brand"
}
```

**Weekly carousel** (Instagram, Tuesday 20:00 India time), images in order:

```json
{
  "media": ["slide1.jpg", "slide2.jpg", "slide3.jpg"],
  "accounts": ["instagram:crimearchives.media"],
  "caption": "…",
  "when": "2026-11-24T20:00"
}
```

**Weekly static clue puzzle** (Instagram, Friday 13:00 India time). Never reveal the answer:

```json
{
  "media": ["clue-puzzle-07.jpg"],
  "accounts": ["instagram:crimearchives.media"],
  "caption": "One detail in this room gives the killer away. Can you spot it?",
  "when": "2026-11-20T13:00"
}
```

### Rules

- **Hashtags:** the brand set (#TheCrimeArchives #truecrime #fyp #murdermystery #whatwouldyoudo) is added automatically. You may add 1–2 extras in the caption (#unsolved, #findthekiller, #coldcase…). Use `"hashtags": "none"` to turn the auto-add off.
- **Voice:** cinematic and suspenseful, short lines, hook first. Shorts end with the choice question; long-form has no call to action.
- **Real cases:** never invent facts. Name the case, place and year.
- **YouTube title:** at most 100 characters (aim for under 70). The caption becomes the description; #Shorts is added for Shorts.
- **Covers:** Instagram reel cover 9:16 (1080×1920); YouTube thumbnail 16:9 (1280×720).
- **Files:** MP4/MOV (H.264/AAC), reels up to 300 MB / 15 min; images JPEG/PNG.
- **Time:** `"when"` takes `"next_slot"`, `"now"`, `"draft"`, or a time like `"2026-11-20T19:00"` (India time).

Other commands: `node ~/postroom/postroom.mjs queue` (what's scheduled) and `node ~/postroom/postroom.mjs accounts` (slots and hashtags).
