#!/bin/bash
# Sets up Postroom on this computer for Claude Code:
#   ~/postroom/postroom.mjs            the command that uploads and schedules posts
#   ~/.claude/skills/postroom/SKILL.md every Claude Code chat learns how to use it
#   ~/.claude/skills/how-it-clicks-captions/SKILL.md  How It Clicks caption rules
#   ~/.postroom.json                   your Postroom sign-in (asked once, hidden while typing)
set -e
BASE="https://vwd-postroom.vercel.app"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed. Install it from https://nodejs.org (LTS), then run this again."
  exit 1
fi

mkdir -p "$HOME/postroom" "$HOME/.claude/skills/postroom" "$HOME/.claude/skills/how-it-clicks-captions"
curl -fsSL "$BASE/postroom.mjs" -o "$HOME/postroom/postroom.mjs"
curl -fsSL "$BASE/postroom-skill.md" -o "$HOME/.claude/skills/postroom/SKILL.md"
curl -fsSL "$BASE/how-it-clicks-captions-skill.md" -o "$HOME/.claude/skills/how-it-clicks-captions/SKILL.md"
echo "✓ Postroom command: ~/postroom/postroom.mjs"
echo "✓ Claude Code skills: postroom, how-it-clicks-captions (in ~/.claude/skills)"

if [ ! -f "$HOME/.postroom.json" ]; then
  printf "Postroom password (hidden): "
  read -rs PW < /dev/tty
  echo
  node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ password: process.argv[2] }), { mode: 0o600 })' "$HOME/.postroom.json" "$PW"
  unset PW
fi
chmod 600 "$HOME/.postroom.json"

if node "$HOME/postroom/postroom.mjs" accounts >/dev/null 2>&1; then
  echo "✓ Signed in to Postroom. Done — ask any Claude Code chat to 'post this on Postroom'."
else
  echo "✗ Couldn't sign in. Delete ~/.postroom.json and run this again with the right password."
  exit 1
fi
