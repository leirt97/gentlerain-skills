#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title 进展时间戳
# @raycast.mode silent
# @raycast.packageName Craft 事项

# Raycast snippets only render English weekdays, so the timestamp comes from tracker.mjs and is pasted.
stamp=$(/opt/homebrew/bin/node "$HOME/.agents/skills/craft-item-tracker/scripts/tracker.mjs" now) || exit 1
printf %s "$stamp" | pbcopy
osascript -e 'tell application "System Events" to keystroke "v" using command down'
