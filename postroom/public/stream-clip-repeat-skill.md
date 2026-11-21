---
name: stream-clip-repeat
description: Write the YouTube title, description, hidden tags and hashtags, plus the Instagram caption, for a stream.clip.repeat streamer clip (xQc, IShowSpeed, Kai Cenat and others). Covers Shorts, Reels and long-form compilations. Starts by asking the uploader what happens in the video, then packages everything as a Postroom post card. Use whenever a stream.clip.repeat clip or compilation is ready, or the user asks for its title, caption, tags or hashtags.
---

# stream.clip.repeat: titles, descriptions, tags and post card

stream.clip.repeat clips the biggest moments from famous streamers (xQc, IShowSpeed, Kai Cenat and others). It posts them as:
- **Instagram Reels**
- **YouTube Shorts**
- **YouTube long-form compilations.** These earn watch hours, which count toward monetization. Shorts views don't.

Each finished video gets **one post card** (JSON) that Postroom uses to post it.

---

## 1. Ask for the brief first. Never skip this.

You can't watch the video, so the uploader has to tell you what happens in it. **Don't write anything until you have the brief.** Ask for it in one message, like this:

> Quick brief for this clip:
> 1. **Who's in it?** The streamer, plus anyone else on screen (guests, other streamers, celebrities).
> 2. **What happens?** 1–3 sentences in your own words: the setup, then the moment.
> 3. **The best line.** The exact words, if someone says something quotable.
> 4. **Where and when?** Stream date, the game or IRL location, and any event (subathon, collab, tournament).
> 5. **Source link.** The original stream, VOD or clip link (Twitch, Kick or YouTube).
> 6. **Format.** Short/Reel (how many seconds?) or long-form (how long, and is it a compilation?).
> 7. **What did you add?** Subtitles, zooms, context text, your commentary or voice-over, sound effects, a ranking or countdown.
> 8. **Copyrighted music** playing in the background? (yes / no / muted)
> 9. **Long-form only:** the timestamps of each moment, e.g. `00:00 intro · 01:12 Speed meets Ronaldo · …`

### Brief rules
- **Never invent what happens.** Use the uploader's words. If something is unclear, ask; don't guess.
- **Don't guess timestamps or quotes.** If item 3 or item 9 is missing, leave that part out.
- **If item 7 is "nothing"** (a raw re-upload with no edits), warn the uploader before writing anything (see §8).
  - A raw re-upload risks YouTube's *reused content* rule, which can block monetization for the whole channel.
  - On Instagram, a repost with no edits gets less reach.
  - Suggest one quick fix: subtitles plus a context text card on the first frame.

---

## 2. YouTube titles

### Shorts title

**≤ 60 characters**, so it isn't cut off on phones (hard limit 100). Postroom adds `#Shorts` itself.

**Name the streamer in the first 3 words.** People search the name, and the name is what makes them stop scrolling.

Pick one shape:

| Shape | Example (format only) |
|---|---|
| `<Streamer> <strong verb> <the moment>` | `xQc Loses It Over A $1 Mistake 😭` |
| `<Streamer> Reacts To <thing>` | `IShowSpeed Reacts To His Own Wax Figure 😳` |
| `<Streamer> Can't Believe <thing>` | `Kai Cenat Can't Believe What Chat Did` |
| `<Streamer> vs <person/thing>` | `Speed vs A Pro Goalkeeper ⚽` |
| `When <Streamer> <does thing>` | `When xQc Tries To Cook 💀` |
| `"<short quote>" – <Streamer>` | `"I'm Never Doing That Again" – Speed` |
| `<Streamer> Didn't Expect This…` | `Speed Didn't Expect This In Brazil…` |

**Style:**
- Title Case.
- At most **one** ALL-CAPS word, for emphasis.
  - Don't copy the streamers' own all-caps titles ("iSHOWSPEED vs …"). Those are their brand.
- At most **one emoji**, at the end. 😭 💀 😳 🤣 😱 🔥 ⚽ 🎮 fit this niche.
- **Spell names the way fans search them.** Each table entry below is "how to write the name" → "other spellings fans search":

| Streamer | Write it as | Also searched as |
|---|---|---|
| xQc | xQc | xqcow, Felix Lengyel |
| IShowSpeed | IShowSpeed, or Speed after the first mention | ishowspeed, i show speed, Darren Watkins Jr |
| Kai Cenat | Kai Cenat | kai, kaicenat |
| Adin Ross | Adin Ross | adinross |
| Jynxzi | Jynxzi | jynxzi |
| Asmongold | Asmongold | asmongold, zackrawrr |
| HasanAbi | HasanAbi | hasan, hasanabi |
| Pokimane | Pokimane | poki |
| Sketch | Sketch | sketch |
| Duke Dennis | Duke Dennis | duke dennis |

  These are the common spellings. Check any new streamer's own channel for how they write their name.

### Long-form title

**≤ 70 characters.** Again, the streamer's name comes first.

Pick one shape:

| Shape | Example (format only) |
|---|---|
| `<Streamer>'s Funniest Moments Of <Month Year>` | `xQc's Funniest Moments Of November 2026` |
| `<Streamer> Best Of <Game/Event/Place>` | `IShowSpeed Best Of Brazil Tour` |
| `Top <N> <Streamer> Moments That Broke Chat` | `Top 25 Kai Cenat Moments That Broke Chat` |
| `<Streamer> <Event> – Every Big Moment` | `Speed vs Ronaldo – Every Big Moment` |
| `<Streamer> Reacts To <X> (Full Reaction)` | `xQc Reacts To GTA 6 Trailer (Full Reaction)` |
| `<Streamer A> x <Streamer B> Best Moments` | `Kai Cenat x Speed Best Moments` |

Long-form titles need a **thumbnail** in the card (`youtube_thumbnail`, 1280×720). A good one has:
- the streamer's face reacting
- 2–4 words of big text
- no fake objects (no arrows pointing at things that aren't in the video)

### Never (any title)
- **Nothing the video doesn't show.** No "ARRESTED", "BANNED", "DIES", "CRYING" unless it happens. Misleading titles break YouTube's spam rules and get the video removed.
- **Never pretend to be the streamer** or claim to be official. No "OFFICIAL", no "(My Stream)".
- **No more than one emoji** and no hashtags in the title. Postroom adds `#Shorts`.

---

## 3. YouTube description

### Shorts description

```
<1–2 sentences of context: who, where, what led up to the moment.>
<The quote or payoff line, if there is one.>

🎮 <Streamer> – <their live link>
📺 Original stream: <source link> (<stream date>)

#<streamer> #streamerclips #StreamClipRepeat

Clipped and edited by stream.clip.repeat. Stream content belongs to <Streamer>; this channel isn't affiliated with them. Want a clip taken down? Contact us and we'll remove it.
```

### Long-form description

```
<Line 1: what this compilation is, with the streamer's name and the event/month. This shows before "…more", so it matters most.>
<Line 2: one more sentence of context or the biggest moment.>

Chapters
00:00 <intro>
01:12 <moment 1>
03:40 <moment 2>
…

🎮 Streamers in this video:
<Streamer> – <live link>
<Other streamer> – <live link>
📺 Original streams: <links>

#<streamer> #streamerclips #StreamClipRepeat

Clipped and edited by stream.clip.repeat … (same disclaimer as above)
```

### Description rules
- **Chapters:**
  - The first chapter must be `00:00`.
  - You need at least 3 chapters, each at least 10 seconds long.
  - Only add chapters from the uploader's timestamps.
- **Hashtags:** use exactly **3**. YouTube shows the first three above the title.
  - Order: the streamer's tag first, then `#streamerclips`, then `#StreamClipRepeat`.
- **Live links:**
  - Use the streamer's current platform. Streamers move between Twitch, Kick and YouTube, so check before you paste.
  - If you're not sure, write the name only and ask the uploader.
- **Don't write "No copyright infringement intended."** It means nothing legally. The credit plus the takedown offer is what actually helps.

---

## 4. YouTube hidden tags (`youtube_tags`)

YouTube allows 500 characters of tags. Postroom keeps them under that limit and adds the brand tags itself.

Give **8–15 tags**, in this order:
1. **The streamer:** their name, their channel handle and their real name, if it's well known. Example: `xqc`, `xqcow`, `felix lengyel`.
2. **Streamer + clip words:**
   - `<streamer> clips`
   - `<streamer> highlights`
   - `<streamer> funny moments`
   - `<streamer> reacts`
   - `<streamer> best moments`
3. **Common spellings** fans search: `ishow speed`, `i show speed`.
4. **What's in this video:** the game, the guest, the event, the place. Examples: `gta 6`, `ronaldo`, `subathon`, `speed brazil`.
5. **Niche tags:** `streamer clips`, `twitch clips`, `kick clips`, `funny stream moments`.

Most of these come from the big channels themselves. xQc's own uploads all carry `xqc, xqcow, xqc youtube, xqc highlights, xqc vod, felix lengyel, xqc funny, xqc reacts`, and nearly every IShowSpeed upload is tagged `ishowspeed`.

**Never tag a streamer who isn't in the video.** Tagging popular names you don't feature counts as misleading metadata under YouTube's spam rules.

### Category (`options.youtube.category_id`)

| Clip type | Category |
|---|---|
| Gameplay | `"20"` (Gaming) |
| IRL, reactions, Just Chatting, challenges | `"24"` (Entertainment) |

Both xQc's and IShowSpeed's channels use Gaming (`20`), and Gaming is the safe default.

---

## 5. Instagram caption

```
<Hook line: usually the YouTube title; can be a little looser> <emoji>

<1–2 sentences of context, written like you're telling a friend.>

🎥 <Streamer> on <Twitch/Kick/YouTube>
Follow for daily stream clips 🔁

#<streamer> #streamerclips #StreamClipRepeat [#<topic>] [#<second streamer>]
```

### Caption rules
- **3–5 hashtags, never more:**
  - always: `#StreamClipRepeat`, `#streamerclips`, plus the main streamer's tag (`#xqc`, `#ishowspeed`, `#kaicenat` …)
  - optional: one topic tag (`#gta6`, `#football`, `#subathon`) or a second streamer who's in the clip
  - Big-streamer tags people actually use, from the clip channels we looked at: `#xqc #xqcclips #ishowspeed #speed #kaicenat #twitchclips #viralclips`
- **Instagram @mentions:**
  - Only @-mention a streamer if you're sure of their real Instagram handle. A wrong handle tags a stranger.
  - When unsure, write the name without the @.
- **Links aren't clickable in Instagram captions.** Don't paste the VOD link here. It goes in the YouTube description.
- **Long-form:** Instagram gets a 30–90-second teaser cut, not the full video. The caption ends with `Full compilation on our YouTube 🔗`.

---

## 6. Series

Pick one per video. It guides the title shape and the topic tag.

| Series | What it is | Title shape |
|---|---|---|
| **Moment** | One big clip (most Shorts) | `<Streamer> <verb> <moment>` |
| **Reacts** | The streamer reacting to something | `<Streamer> Reacts To …` |
| **Versus** | A challenge, a 1v1 or a collab | `<A> vs <B>` |
| **Quote** | The line is the whole clip | `"<quote>" – <Streamer>` |
| **Monthly Best** (long-form) | The best clips of the month | `<Streamer>'s Funniest Moments Of <Month Year>` |
| **Event Cut** (long-form) | Every big moment from one stream or event | `<Streamer> <Event> – Every Big Moment` |

---

## 7. Output: the post card

Save the card next to the video as `<video-name>.card.json` and show it in the chat.

**Shorts / Reel card:**
```json
{
  "media": ["xqc-dollar-mistake.mp4"],
  "accounts": ["instagram:stream.clip.repeat", "youtube:stream.clip.repeat"],
  "title": "xQc Loses It Over A $1 Mistake 😭",
  "captions": {
    "instagram": "xQc Loses It Over A $1 Mistake 😭\n\nChat bet him he couldn't finish the run without spending a dollar… and then this happened.\n\n🎥 xQc on Kick\nFollow for daily stream clips 🔁\n\n#xqc #streamerclips #StreamClipRepeat",
    "youtube": "Chat bet xQc he couldn't finish the run without spending a dollar… and then this happened.\n\n🎮 xQc – kick.com/xqc\n📺 Original stream: <link> (<date>)\n\n#xqc #streamerclips #StreamClipRepeat\n\nClipped and edited by stream.clip.repeat. Stream content belongs to xQc; this channel isn't affiliated with them. Want a clip taken down? Contact us and we'll remove it."
  },
  "youtube_tags": ["xqc", "xqcow", "felix lengyel", "xqc clips", "xqc highlights", "xqc funny moments", "xqc reacts", "streamer clips", "kick clips"],
  "options": { "youtube": { "category_id": "20" } },
  "when": "next_slot"
}
```
The clip in this example is made up to show the format. Always use the uploader's brief.

**Long-form card:** the same card, with these changes:
- Add `"kind": { "youtube": "video" }`.
- Add a `"youtube_thumbnail": "<file>.jpg"`.
- Use only the YouTube account. Instagram gets a separate teaser card (see §5).
- The YouTube description includes the chapters.

### Fields
- **`"accounts"`:** change these to the real handles once the accounts are connected in Postroom. Run `node "$HOME/postroom/postroom.mjs" accounts` to see them.
- **`"when"`:**
  - `"next_slot"`: the default. Every video goes live at **8:30 pm India time**, one per day; Postroom picks the next free 8:30 pm.
  - `"draft"`: only if the uploader says to hold it
  - an exact India time, like `"2026-11-25T20:30"`
- **Optional:**
  - `"instagram_cover": "<file>.jpg"` (9:16, 1080×1920): the streamer's reaction frame with 2–3 words of text
  - `"options": { "instagram": { "first_comment": "Full stream link on our YouTube 🔗" } }`

---

## 8. Monetization and staying safe

Read this before posting anything.

### YouTube Partner Program
- **To qualify:** 1,000 subscribers, plus either:
  - 4,000 public watch hours in the last 12 months, or
  - 10 million Shorts views in the last 90 days
- **Shorts views don't count as watch hours.** That's why the long-form compilations matter.

### Reused content
YouTube can refuse or remove monetization for the *whole channel* if most videos are other people's content with no real changes. Each video should show something you added:
- subtitles
- a context text card or a short intro
- your commentary, voice-over or ranking
- zooms, reaction cuts or sound design
- stitching several moments into a story

Our descriptions add context and credit every time. Keep doing that.

### Instagram
Instagram shows reposts with no real edits to fewer people. Reposting accounts can also be dropped from recommendations completely. The same edits that help on YouTube help here.

### Streamers' clipping rules
- Many big streamers welcome clip channels, and some pay clippers through official clipping programs.
- Others don't allow clips, or they claim them.
- Before you start clipping a new streamer, check what they've said about clipping. If they run an official clipping program, joining it gives you permission and can pay you.

### Copyright
- **Mute or replace copyrighted music** playing in the stream. It triggers Content ID claims, and the music owner takes the money.
- If a streamer or rights holder asks for a video to come down, take it down. Strikes can end the channel.

### Credit and honesty
- Always name and link the streamer.
- Never imply you are them.
- Never title a moment that didn't happen.

---

## 9. Check before handing off

- [ ] The brief was collected, and every detail comes from it (no invented moments, quotes or timestamps)
- [ ] The title puts the streamer's name in the first 3 words:
  - Shorts: ≤ 60 characters
  - long-form: ≤ 70 characters
  - one emoji at most
  - nothing the video doesn't show
- [ ] The YouTube description has the context, the credit and live link, the source link, exactly 3 hashtags and the disclaimer. Long-form also has chapters.
- [ ] There are 8–15 hidden tags, and only streamers who are actually in the video
- [ ] The Instagram caption has 3–5 hashtags, no link, and @mentions only if the handle is certain
- [ ] The uploader added something of their own (§8). If they didn't, they've been warned.
- [ ] The card is saved as `<video>.card.json`

## 10. Hand off

- **If Postroom's command is set up on this computer** (`$HOME/postroom/postroom.mjs` and `~/.postroom.json` exist):
  1. Run `node "$HOME/postroom/postroom.mjs" check <card>`.
  2. Fix anything marked ✗.
  3. Run `node "$HOME/postroom/postroom.mjs" post <card>`.
  4. Report the ✓ lines.
- **Otherwise,** give the uploader the card and the video file to pass to the Postroom chat.
