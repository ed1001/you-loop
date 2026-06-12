#!/usr/bin/env bash
# Regenerates the extension icons (public/icon/{16,32,48,96,128}.png) and the
# site favicon (site/assets/favicon.png): the étude wordmark "é" in Fraunces
# italic — white with a teal acute accent — on a dark rounded tile.
#
# Renders with headless Chrome so the real bundled font does the typesetting
# (public/fonts/fraunces-italic.woff2, inlined as a data URI), then downscales
# the 128px master with sips.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
B64=$(base64 -i public/fonts/fraunces-italic.woff2 | tr -d '\n')
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/icon.html" <<EOF
<!doctype html><meta charset="utf-8">
<style>
@font-face { font-family: F; font-style: italic; font-weight: 500;
  src: url(data:font/woff2;base64,$B64) format("woff2"); }
html, body { margin: 0; background: transparent; }
.icon {
  width: 128px; height: 128px; border-radius: 28px;
  background: radial-gradient(ellipse 90% 70% at 50% -10%, rgba(20,184,166,.25), transparent 65%), #0b0c0d;
  display: grid; place-items: center; position: relative; overflow: hidden;
}
.e { font: italic 500 92px F, Georgia, serif; color: #fff; position: relative; line-height: 1; transform: translateY(-4px); }
.acc { position: absolute; inset: 0; color: #5eead4; clip-path: inset(0 0 62% 0); pointer-events: none; }
</style>
<div class="icon"><span class="e">é<span class="acc">é</span></span></div>
EOF

"$CHROME" --headless --disable-gpu --screenshot="$TMP/128.png" \
  --window-size=128,128 --default-background-color=00000000 \
  --hide-scrollbars --virtual-time-budget=3000 "file://$TMP/icon.html"

cat "$TMP/128.png" > public/icon/128.png
for s in 96 48 32 16; do
  sips -z "$s" "$s" "$TMP/128.png" --out "public/icon/$s.png" > /dev/null
done
cat "$TMP/128.png" > site/assets/favicon.png

echo "Icons regenerated: public/icon/{16,32,48,96,128}.png + site/assets/favicon.png"
