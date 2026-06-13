#!/usr/bin/env bash
# Regenerates the graphical store screenshots (docs/marketing/screenshots/*.png).
# The real work lives in generate-screenshots.mjs: it renders the actual
# extension UI (production PAGE_UI_STYLES + the real .you-loop-* markup) enlarged
# on the étude brand canvas with instructional captions, via headless Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/generate-screenshots.mjs
