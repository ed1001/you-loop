#!/usr/bin/env bash
# Regenerates the captioned store screenshots (docs/marketing/screenshots/*.png)
# from the raw captures in docs/marketing/screenshots/raw/: each shot gets a
# brand-styled caption header on the étude dark background, rendered with
# headless Chrome so the same fonts as the promo tiles do the typesetting.
#
# Raw captures are 1280×800 full-bleed UI; output is 1280×800 with a caption
# strip up top and the capture scaled beneath it.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RAW=docs/marketing/screenshots/raw
OUT=docs/marketing/screenshots
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# name|caption — captions per the shot list in docs/marketing/store-listing.md
SHOTS=(
  "01-zoom-hero|Zoom in. Set your loop to the split second."
  "02-loop-oneshot|Loop it, or drill it one shot at a time."
  "03-timeline-handles|Handles live right on the YouTube timeline."
  "04-saved-loops|Saved per video. Pick up where you left off."
  "05-help-modal|Keyboard-first: A restart, S cue, D push-to-play."
)

for shot in "${SHOTS[@]}"; do
  name=${shot%%|*}
  caption=${shot#*|}
  b64=$(base64 -i "$RAW/$name.png" | tr -d '\n')

  cat > "$TMP/$name.html" <<EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Instrument+Sans:wght@400;500;600&display=swap"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1280px; height: 800px;
        background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(20, 184, 166, 0.18), transparent 65%), #0b0c0d;
        overflow: hidden;
        display: flex; flex-direction: column; align-items: center;
        font-family: "Instrument Sans", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .caption {
        height: 104px;
        display: flex; align-items: center; gap: 18px;
      }
      .tick {
        width: 8px; height: 30px; border-radius: 4px;
        background: #14b8a6;
        box-shadow: 0 0 18px rgba(20, 184, 166, 0.55);
      }
      .caption span {
        font-size: 34px; font-weight: 600; letter-spacing: -0.01em;
        color: #f2f1ed;
      }
      .shot {
        width: 1132px; height: 668px;
        border-radius: 14px;
        border: 1px solid rgba(94, 234, 212, 0.22);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
        background: #000;
        overflow: hidden;
      }
      .shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
    </style>
  </head>
  <body>
    <div class="caption"><div class="tick"></div><span>$caption</span></div>
    <div class="shot"><img src="data:image/png;base64,$b64" alt="" /></div>
  </body>
</html>
EOF

  "$CHROME" --headless --disable-gpu --screenshot="$OUT/$name.png" \
    --window-size=1280,800 --hide-scrollbars --virtual-time-budget=6000 \
    "file://$TMP/$name.html"
done

echo "Captioned screenshots regenerated: $OUT/{01..05}-*.png"
