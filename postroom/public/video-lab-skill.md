---
name: video-lab
description: Download and analyse any YouTube, Instagram or TikTok video, or a whole channel/account, with Postroom's Video Lab. Use whenever the user pastes a YouTube/Instagram/TikTok link (video, Short, reel, @channel or profile) and wants it downloaded, broken down, compared or studied ("analyse this", "why did this go viral", "full channel analysis", "download this").
---

# Video Lab: paste a link → download + full breakdown

Postroom's `grab` command, run on this computer:
1. downloads the video with yt-dlp (720p max), plus its title, description, stats and captions;
2. measures it with ffmpeg: shot cuts, cuts per 10 s, average shot length, first cut, when sound starts, loudness;
3. makes three frame sheets: the first 3 seconds, one frame per shot, and the whole video;
4. uploads it all to Postroom (Research → Video Lab, or the channel's project);
5. has Claude write a breakdown there: idea, hook, structure, edit, sound, retention, packaging, a recipe and an adaptation for our brand.

It must run on this computer. YouTube and Instagram block downloads from cloud servers.

## Commands

The command is `node "$HOME/postroom/postroom.mjs"`. In PowerShell, use `node "$env:USERPROFILE\postroom\postroom.mjs"`.

| What the user sent | Run |
|---|---|
| One video, Short or reel | `grab <link>` |
| Several videos | `grab <link1> <link2> …` |
| A channel or account (`youtube.com/@name`, `instagram.com/name/`) | `grab <link>`: reads every post's numbers through the official API, downloads and breaks down the top 3 videos, then analyses the whole channel. Add `--top 5` for more videos. |
| "Just download it" | `grab <link> --only-download` (saved in `~/postroom/lab/<Site>-<id>/video.mp4`) |
| Adapt the ideas for one brand | add `--brand "How It Clicks"` (or "The Crime Archives", "Curious in 8bit") |

**If it says the site needs a login:**
1. Ask the user to log in to Instagram or YouTube in **Firefox**.
2. Re-run with `--cookies-from firefox`.

Chrome and Edge lock their cookies on Windows, so they can't be used.

**If yt-dlp or ffmpeg is missing:**
1. Windows: `winget install yt-dlp.yt-dlp Gyan.FFmpeg`. Mac: `brew install yt-dlp ffmpeg`.
2. Open a new terminal.

**If a download that used to work starts failing:** update yt-dlp first (`winget upgrade yt-dlp.yt-dlp` or `yt-dlp -U`). The sites change often.

## After grabbing: look at it yourself, then report

Each video gets a folder in `~/postroom/lab/<Site>-<id>/`.

1. **Read these:**
   - the frame sheets `hook.jpg`, `shots.jpg` and `overview.jpg` (look at them; they're images)
   - `video.info.json` for the stats, title, description and tags
   - the `.vtt` captions file, if there is one
2. **Combine them with Postroom's breakdown.** The command prints a summary and a link. The Postroom connector's `research_post` tool returns the full breakdown, and `research_overview` returns the channel analysis.
3. **Reply with:**
   - **What happens** in the video, in 2–3 lines.
   - **The hook (first 3 seconds):**
     - what's on screen
     - what's said
     - the on-screen text
     - why it stops the scroll
   - **Structure:** the beats, with mm:ss times.
   - **Pacing, with numbers:** cuts per 10 s, average shot length, when the first cut and first sound land.
   - **Why it works,** and where people probably drop off.
   - **Packaging:** title, thumbnail or cover, caption, hashtags.
   - **What to borrow for our brand:** the structure and techniques, never the words or footage. Then **one concrete video idea**.
   - **For a channel:**
     - content pillars
     - what performs vs. flops (quote views against the channel's median)
     - title patterns
     - cadence
     - 3–5 opportunities for us

**To compare with our own videos,** run `node "$HOME/postroom/postroom.mjs" report "<brand>"`. Show our numbers next to theirs, for example their 3.1 cuts/10 s vs our 1.2, or their 25 s vs our 46 s.

## Rules

- **Downloads are for study only.** Don't re-upload other people's videos.
  - The exception is stream.clip.repeat clips. For those, follow the `stream-clip-repeat` skill: credit, transformation and each streamer's rules.
- **Never copy someone's script, title or footage into our posts.** Borrow the structure, the hook type and the pacing.
- **Quote numbers exactly** as Postroom or yt-dlp report them.
  - If a number is missing, for example Instagram views, say it's missing.
  - When only one or two videos were studied, say the sample is small.
- **Keep files local.** Clear `~/postroom/lab` when the user is done with it.
