#!/usr/bin/env bash
# Regenerates the extension icons (public/icon/{16,32,48,96,128}.png) and the
# site favicon (site/assets/favicon.png): the étude wordmark "é" in Fraunces
# italic — white with a teal acute accent — on a dark rounded tile.
#
# Extension icons follow the Chrome Web Store spec: 96×96 artwork centered on a
# 128×128 canvas with 16px of transparent padding, so the icon doesn't render
# oversized next to compliant icons in store search results. The favicon stays
# full-bleed (padding just makes a tab icon look small).
#
# Renders with headless Chrome so the real bundled font does the typesetting
# (public/fonts/fraunces-italic.woff2, inlined as a data URI), then downscales
# the 128px masters with sips.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
B64=$(base64 -i public/fonts/fraunces-italic.woff2 | tr -d '\n')
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# $1 = tile size in px (canvas is always 128). Tile metrics scale with size.
make_html() {
  local tile=$1 out=$2
  local radius font_size lift
  radius=$(( tile * 28 / 128 ))
  font_size=$(( tile * 92 / 128 ))
  lift=$(( tile * 4 / 128 ))
  cat > "$out" <<EOF
<!doctype html><meta charset="utf-8">
<style>
@font-face { font-family: F; font-style: italic; font-weight: 500;
  src: url(data:font/woff2;base64,$B64) format("woff2"); }
html, body { margin: 0; background: transparent; }
body { width: 128px; height: 128px; display: grid; place-items: center; }
.icon {
  width: ${tile}px; height: ${tile}px; border-radius: ${radius}px;
  background: radial-gradient(ellipse 90% 70% at 50% -10%, rgba(20,184,166,.25), transparent 65%), #0b0c0d;
  display: grid; place-items: center; position: relative; overflow: hidden;
}
.e { font: italic 500 ${font_size}px F, Georgia, serif; color: #fff; position: relative; line-height: 1; transform: translateY(-${lift}px); }
.acc { position: absolute; inset: 0; color: #5eead4; clip-path: inset(0 0 62% 0); pointer-events: none; }
</style>
<div class="icon"><span class="e">é<span class="acc">é</span></span></div>
EOF
}

shoot() {
  "$CHROME" --headless --disable-gpu --screenshot="$2" \
    --window-size=128,128 --default-background-color=00000000 \
    --hide-scrollbars --virtual-time-budget=3000 "file://$1"
}

# Extension icons: 96px tile padded on the 128 canvas.
make_html 96 "$TMP/icon-padded.html"
shoot "$TMP/icon-padded.html" "$TMP/128-padded.png"

# Favicon: full-bleed 128px tile.
make_html 128 "$TMP/icon-full.html"
shoot "$TMP/icon-full.html" "$TMP/128-full.png"

cat "$TMP/128-padded.png" > public/icon/128.png
for s in 96 48 32 16; do
  sips -z "$s" "$s" "$TMP/128-padded.png" --out "public/icon/$s.png" > /dev/null
done
cat "$TMP/128-full.png" > site/assets/favicon.png

echo "Icons regenerated: public/icon/{16,32,48,96,128}.png + site/assets/favicon.png"
