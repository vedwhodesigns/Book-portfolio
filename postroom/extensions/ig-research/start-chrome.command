#!/bin/bash
if curl -s --fail http://127.0.0.1:9222/json/version >/dev/null; then
  echo "Research Chrome already running"
  exit 0
fi
echo "The first time, log in to Instagram in the Research Chrome window."
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.ig-research-chrome" --no-first-run "https://www.instagram.com/"
