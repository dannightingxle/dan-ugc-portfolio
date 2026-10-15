#!/bin/bash
# Creator Desk Helper installer: downloads the helper, connects this Mac with the code
# from Creator Desk, then starts it. Usage (from Creator Desk → Studio → Mac helper):
#   curl -fsSL https://www.dannightingxle.com/helper/install.sh | bash -s -- ABCD-EFGH
set -e
CODE="$1"
SERVER="${CDH_SERVER:-https://www.dannightingxle.com}"
DIR="$HOME/.creator-desk"
if ! command -v node >/dev/null 2>&1; then
  echo "The helper needs Node (nodejs.org). Install it, then run this again."; exit 1
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "Heads up: Claude Code ('claude') isn't on your PATH - edits won't run until it is."
fi
mkdir -p "$DIR" && chmod 700 "$DIR"
curl -fsSL "$SERVER/helper/creator-desk-helper.mjs" -o "$DIR/creator-desk-helper.mjs"
echo "Helper saved to $DIR/creator-desk-helper.mjs"
exec node "$DIR/creator-desk-helper.mjs" connect "$CODE" --server "$SERVER"
