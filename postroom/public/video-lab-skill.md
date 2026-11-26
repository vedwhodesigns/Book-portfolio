---
name: video-lab
description: Download and analyse any YouTube, Instagram or TikTok video, or a whole channel/account, with Postroom's Video Lab, for one of our channels (Curious in 8bit, How It Clicks, The Crime Archives, BONBEC). Frames at 12 fps, music heard by earshot, words from captions or Whisper; returns learnings for scripting, visuals, music, editing, hook and packaging to hand to that channel's chat. Use whenever the user pastes a YouTube/Instagram/TikTok link (video, Short, reel, @channel or profile) and wants it downloaded, broken down, compared or studied ("analyse this", "why did this go viral", "full channel analysis", "download this").
---

# Video Lab: paste a link → which channel? → learnings for that channel

## First: ask which channel it's for

Every analysis is written for ONE of our channels: **Curious in 8bit**, **How It Clicks**, **The Crime Archives** or **BONBEC**.
If the user didn't say, ask in one short line before running anything:
"Which channel is this for: Curious in 8bit, How It Clicks, The Crime Archives or BONBEC?"
Short answers are fine ("c8", "8bit", "hic", "tca", "crime").

## What `grab` does (on this computer)

1. downloads the video with yt-dlp (720p max), plus its title, description, stats and captions;
2. measures it with ffmpeg: shot cuts, cuts per 10 s, average shot length, first cut, first sound, loudness;
3. **cuts every second into a sheet of 12 frames (12 fps)**, so Claude sees motion, zooms, speed ramps and text animation frame by frame (videos over 3 minutes: the first minute at 12 fps, the rest at 1 frame per second), and measures motion energy per second;
4. **listens with earshot** (if installed): music genre/instruments, tempo and key, sections, energy, SFX, and whether sound hits land on the picture cuts;
5. **writes down the words**: the captions, or Whisper on this computer for reels without captions (if installed);
6. uploads it all to Postroom, where Claude reads the 12 fps sheets block by block, then writes **learnings for the chosen channel**: scripting, visuals, music & sound, editing & pacing, hook, packaging, plus a next-video plan (idea, hook line, script outline, visual plan, music plan, do/don't).

It must run on this computer. YouTube and Instagram block downloads from cloud servers.

## Commands

The command is `node "$HOME/postroom/postroom.mjs"`. In PowerShell, use `node "$env:USERPROFILE\postroom\postroom.mjs"`.

| What the user sent | Run |
|---|---|
| One video, Short or reel | `grab <link> --brand "Curious in 8bit"` |
| A video file on this computer (e.g. our own draft) | `grab "C:\\path\\video.mp4" --brand "…"` |
| Several videos | `grab <link1> <link2> … --brand "…"` |
| A channel or account (`youtube.com/@name`, `instagram.com/name/`) | `grab <link> --brand "…"`: reads every post's numbers through the official API, breaks down the top 3 videos, then analyses the whole channel. Add `--top 5` for more videos. |
| "Just download it" | `grab <link> --only-download` (no channel needed; saved in `Desktop/Video Lab/Downloads/`) |

`--brand` is required for analysis; without it the command stops and lists our channels. It takes 2–5 minutes per video (earshot loads its listening models; Claude reads the frames in parallel parts).

**If it says the site needs a login:**
1. Ask the user to log in to Instagram or YouTube in **Firefox**.
2. Re-run with `--cookies-from firefox`.

Chrome and Edge lock their cookies on Windows, so they can't be used.

**If yt-dlp or ffmpeg is missing:**
1. Windows: `winget install yt-dlp.yt-dlp Gyan.FFmpeg`. Mac: `brew install yt-dlp ffmpeg`.
2. Open a new terminal.

**If earshot or Whisper is missing,** the analysis still runs (sound is then inferred from loudness and cut rhythm, words from captions or the frames), and `grab` prints the install line:
- earshot: `pip install "earshot[listen] @ git+https://github.com/Leonxlnx/earshot"` (about 2 GB with its models; `earshot doctor --fetch` downloads them up front)
- Whisper: `pip install openai-whisper`

**If a download that used to work starts failing:** update yt-dlp first (`winget upgrade yt-dlp.yt-dlp` or `yt-dlp -U`). The sites change often.

## After grabbing: report, then hand it to that channel's chat

Each video gets its own folder on the desktop: **`Desktop/Video Lab/<channel>/<date> <creator> <id>/`** (OneDrive Desktop on Windows when that's the real desktop; set `POSTROOM_LAB` to use another folder), with `video.mp4`, `sheets-12fps/`, `hook.jpg`, `shots.jpg`, `overview.jpg`, the earshot JSON files, captions, and **`for-<channel>.md`**: the learnings, ready to paste.

1. **Look yourself too:** open a few `sheets-12fps/` images around the hook and the big moments, and the earshot files if something sounds off.
2. **Reply with the learnings from `for-<channel>.md`** (the command also prints them):
   - what happens and why it works, in 2–3 lines; the hook (said / on screen / visual)
   - **Scripting · Visuals · Music & sound · Editing & pacing · Hook · Packaging**: each lesson with its mm:ss evidence and how the channel should use it
   - pacing numbers (cuts per 10 s, first cut, first sound) next to ours: `node "$HOME/postroom/postroom.mjs" report "<channel>"`
   - **the next video for that channel**: idea, hook line, script outline, visuals, music plan, do / don't
3. **Send it to the channel's chat.** Tell the user the file path and offer both ways:
   - paste `for-<channel>.md` into that channel's Claude chat, or
   - in that chat, say **"pull the latest Video Lab learnings"**: its Postroom connector's `brand_learnings` tool returns every analysis for that channel.
   The same is in Postroom → Research → **Learnings** (Copy all for <channel> chat) and on each video (Copy for <channel> chat).

**For a channel:** also give its content pillars, what performs vs. flops (views against the channel's median), title patterns, cadence and 3–5 opportunities for our channel.

## Rules

- **Downloads are for study only.** Don't re-upload other people's videos.
  - The exception is stream.clip.repeat clips. For those, follow the `stream-clip-repeat` skill: credit, transformation and each streamer's rules.
- **Never copy someone's script, title or footage into our posts.** Borrow the structure, the hook type and the pacing.
- **Quote numbers exactly** as Postroom or yt-dlp report them.
  - If a number is missing, for example Instagram views, say it's missing.
  - When only one or two videos were studied, say the sample is small.
- **Keep files local.** The videos stay in `Desktop/Video Lab`; the user deletes them when done.
