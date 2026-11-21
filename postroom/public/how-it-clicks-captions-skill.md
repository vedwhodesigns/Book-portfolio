---
name: how-it-clicks-captions
description: Write the Instagram caption, YouTube title, YouTube description and tags for a How It Clicks video, and package them as a Postroom post card ready to schedule. Use whenever a How It Clicks video (Short/Reel) is finished or the user asks for its caption, title, hashtags or post card.
---

# How It Clicks — captions & post card

How It Clicks makes short animated videos about how things work. Brand line: **"How it works. How it's made. How it went horribly wrong."**

For each finished video, produce **one post card** (JSON) that Postroom uses to post the same video to:
- Instagram **@howitclicks.ai** (reel)
- YouTube **@howitclicksai** (Short)

## 1. Get the facts first

Before writing, collect from the user or the script:
- the video file name
- the topic and series (see §5)
- the key facts the video states: names, dates, places, numbers

**Never invent facts.** Every name, date and number in the caption must come from the video or script, or be clearly marked as an estimate ("about", "roughly"). If you're unsure of a fact, ask; don't guess.

## 2. Headline (Instagram first line = YouTube title)

- **Title Case**, **at most 70 characters**, then **one emoji** that sets the feeling:
  - 🤔 curious ("How…", "Why…")
  - 😮 surprising
  - 😨 scary or a disaster
  - 🤯 mind-blowing
- **Promise the payoff** with one of these shapes:
  - "How X Works"
  - "How X Is Made"
  - "Why X…"
  - "Can A…"
  - "What Happens If…"
  - a shocking true story ("The Sub That Sank Because Of A Toilet")
- **Use real brand or product names** when the video is about them (Lego, Hot Wheels, Titan, Boeing 747), because that's what people search.
- **No clickbait the video doesn't pay off.**

## 3. The story (2–4 sentences)

- Open with the surprising claim, or the myth the video corrects.
- Then 1–3 sentences with the **real names, dates and numbers**. Keep it concrete and plain, like telling a friend.
- No lectures, no "In this video…", no "Follow for more".
- An optional question back to the viewer, only if it fits ("Would you have stayed in the car?").

## 4. Hashtags: 3–4, never more

- **Always:** `#HowItClicks #howitworks`
- **Plus 1–2 broad tags** that match the topic: `#engineering #science #history #physics #humanbody #space #animals #whatif #howitsmade`
- **YouTube description only:** add `#learnwithshorts` at the end.

## 5. Series (pick one; it guides the broad hashtag and the topic tags)

| Series | Typical broad tag |
|---|---|
| Old vs New | #engineering / #history |
| How Things Are Made | #howitsmade |
| Your Body Explained | #humanbody / #science |
| Animals Explained | #animals / #science |
| Space Explained | #space / #physics |
| Inside Machines (incl. engineering fiascos) | #engineering / #whatif |

## 6. Never

- **Never mention how the videos are made:** no "3D", "Blender", "AI", "rendered", "animated by". (Postroom adds the Instagram AI label automatically.)
- **Never write a hashtag wall,** emojis in the story, or ALL CAPS.
- **Never use a call to action** like "Like and subscribe".

## 7. Instagram caption vs YouTube description

**Instagram caption:**
```
<Headline> <emoji>

<Story, 2–4 sentences>

#HowItClicks #howitworks #<broad1> [#<broad2>]
```

**YouTube description:**
```
<Story, 2–4 sentences>

#HowItClicks #howitworks #<broad1> #learnwithshorts

The animation is illustrative: parts are simplified to show the idea, and every number is real or labelled as an estimate.
```

**YouTube title:** the headline with its emoji, at most 100 characters. Postroom adds `#Shorts` itself.

**YouTube hidden tags (`youtube_tags`):** 3–6 specific search phrases for this video's topic, e.g. `["titan submarine", "oceangate", "deep sea pressure", "submarine implosion"]`. Postroom adds the brand tags (how it clicks, howitclicks, how it works…) itself.

## 8. Output: the post card

Save it next to the video as `<video-name>.card.json` and also show it in the chat:

```json
{
  "media": ["titan-toilet.mp4"],
  "accounts": ["instagram:howitclicks.ai", "youtube:howitclicksai"],
  "title": "The Sub That Sank Because Of A Toilet 😨",
  "captions": {
    "instagram": "The Sub That Sank Because Of A Toilet 😨\n\nIn April 1945, the German submarine U-1206 was cruising off Scotland when its captain tried the new high-pressure toilet. Something went wrong, seawater flooded in, and it reached the batteries below, releasing chlorine gas. The crew had to surface, were spotted, and scuttled the boat.\n\n#HowItClicks #howitworks #history #engineering",
    "youtube": "In April 1945, the German submarine U-1206 was cruising off Scotland when its captain tried the new high-pressure toilet. Something went wrong, seawater flooded in, and it reached the batteries below, releasing chlorine gas. The crew had to surface, were spotted, and scuttled the boat.\n\n#HowItClicks #howitworks #history #learnwithshorts\n\nThe animation is illustrative: parts are simplified to show the idea, and every number is real or labelled as an estimate."
  },
  "youtube_tags": ["u-1206", "submarine toilet", "ww2 submarine", "submarine history"],
  "when": "next_slot"
}
```

The facts in this example are only there to show the format. Always use the facts from the actual video.

**Fields:**
- `"when"`:
  - `"next_slot"`: the default. Every video goes live at **8:30 pm India time**, one per day; Postroom picks the next free 8:30 pm.
  - `"draft"`: only if the owner says to hold it.
  - Or an exact India time like `"2026-11-25T20:30"`.
- **Optional:**
  - `"instagram_cover": "<file>.jpg"` (9:16, 1080×1920)
  - `"youtube_thumbnail": "<file>.jpg"` (16:9, 1280×720)

## 9. Check before handing off

- [ ] Every fact traced to the video or script
- [ ] Headline is Title Case, ≤70 characters, one emoji, pays off in the video
- [ ] Story is 2–4 sentences, plain words, real names, dates and numbers
- [ ] 3–4 hashtags; `#learnwithshorts` and the illustrative line only on YouTube
- [ ] No mention of 3D, Blender, AI or how it's made
- [ ] Card saved as `<video>.card.json`

## 10. Hand off

- **If Postroom's command is set up on this computer** (`$HOME/postroom/postroom.mjs` and `~/.postroom.json` exist):
  1. Run `node "$HOME/postroom/postroom.mjs" check <card>`, fix anything marked ✗, then run `node "$HOME/postroom/postroom.mjs" post <card>`.
  2. Report the ✓ lines.
- **Otherwise,** give the owner the card and the video file to pass to the Postroom chat.
