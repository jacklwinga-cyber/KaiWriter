#!/usr/bin/env bash
# Import your own realistic template thumbnail (Word-style PNG/WebP).
# Usage: npm run preview:import -- proposal ~/Downloads/my-proposal-preview.png
#
# Then add the template id to src/data/templatePreviews.ts if it is new.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREVIEW_DIR="$ROOT/public/templates/previews"

if [ $# -lt 2 ]; then
  echo "Usage: npm run preview:import -- <template-id> <path-to-image.png>"
  echo "Example: npm run preview:import -- proposal ~/Desktop/proposal-thumb.png"
  exit 1
fi

ID="$1"
SRC="$2"
DEST="$PREVIEW_DIR/${ID}.png"

mkdir -p "$PREVIEW_DIR"
sips -s format png "$SRC" --out "$DEST" >/dev/null
echo "Saved preview → public/templates/previews/${ID}.png"
echo "Register in src/data/templatePreviews.ts:"
echo "  ${ID}: '/templates/previews/${ID}.png',"
