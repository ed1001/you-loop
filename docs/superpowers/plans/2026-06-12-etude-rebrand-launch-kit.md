# Étude Rebrand + Launch Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the you-loop extension as Étude and produce the launch kit: in-app rename, refreshed icon, store-listing copy, landing page, and launch copy, per `docs/superpowers/specs/2026-06-12-etude-brand-launch-design.md`.

**Architecture:** Smallest-possible rename diff (user-visible strings only; internal `you-loop-*` CSS classes and file names stay). Marketing deliverables live as committed docs (`docs/marketing/`) and a static single-file landing page (`site/`). No product behavior changes.

**Tech Stack:** WXT (MV3, Chrome + Firefox), React, vitest, plain HTML/CSS for the landing page, sharp-cli for SVG→PNG rasterization.

**Copy constraint (from spec):** the word "waveform" must NOT appear in any user-facing or marketing copy. The Zoom Panel is described as a "magnified timeline".

**Note on TDD:** the rename swaps display strings and produces static marketing files. Existing tests assert CSS class names (unchanged) — they are the regression gate. No new tests asserting brand strings (they'd churn with copy edits and test nothing behavioral). Every task ends by running the existing suite.

---

### Task 1: Identity rename — manifest, package, README

**Files:**
- Modify: `wxt.config.ts`
- Modify: `package.json:2-3`
- Modify: `README.md:1-3`

- [ ] **Step 1: Update `wxt.config.ts` manifest block**

Replace the `manifest` object's `name` and `description` (keep everything else, including `browser_specific_settings`):

```ts
  manifest: {
    name: "Étude — Loop, Slow Down & Practice YouTube",
    short_name: "Étude",
    description: "Practice tools for YouTube — loop a section, slow it down, zoom in for precision.",
    permissions: ["storage"],
    host_permissions: ["https://www.youtube.com/*"],
    // Firefox-only (ignored by Chrome): declare that the extension collects no
    // user data, satisfying AMO's data-consent requirement for new add-ons.
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: { required: ["none"] }
      }
    }
  }
```

Why the long `name`: Chrome Web Store shows the manifest `name` as the listing title — this is where search keywords (loop, slow down, practice) live. `short_name` is used where space is tight. Description is 86 chars (limit 132).

- [ ] **Step 2: Update `package.json`**

```json
  "name": "etude",
  "description": "Practice tools for YouTube — loop a section, slow it down, zoom in for precision.",
```

- [ ] **Step 3: Update `README.md` title and intro**

Replace lines 1–3 with:

```markdown
# Étude

Browser extension with practice tools for YouTube — loop a section, slow it down, zoom in for precision. (Working name during development: you-loop; internal CSS classes keep that prefix.)
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: both pass (no source change affects types or tests).

Run: `pnpm build 2>&1 | tail -5`
Expected: build succeeds; `.output/chrome-mv3/manifest.json` contains `"name": "Étude — Loop, Slow Down & Practice YouTube"`.

- [ ] **Step 5: Commit**

```bash
git add wxt.config.ts package.json README.md
git commit -m "feat: rename extension to Étude (manifest, package, README)"
```

---

### Task 2: UI strings — wordmark and help modal

**Files:**
- Modify: `features/player-overlay/LoopPanel.tsx:393-395`
- Modify: `features/player-overlay/HelpModal.tsx:107,117,185,213`

- [ ] **Step 1: Wordmark text in `LoopPanel.tsx`**

```tsx
    <span className="you-loop-wordmark" data-on={enabled} aria-hidden="true">
      étude
    </span>
```

(Only the text node changes; className stays `you-loop-wordmark`.)

- [ ] **Step 2: HelpModal strings**

Line 107 (toggle description):

```ts
    desc: "Turn Étude on or off. Your loop range is kept while off.",
```

Line 117 (speed description):

```ts
    desc: "Step playback speed up or down. Click the readout to snap back to 1×; turning Étude off also resets it.",
```

Line 185 (dialog aria-label):

```tsx
        aria-label="Étude help"
```

Line 213 (header eyebrow):

```tsx
          <span className="you-loop-help-eyebrow">étude</span>
```

Convention: wordmark renders lowercase `étude` (brand style); prose references use `Étude`.

- [ ] **Step 3: Verify no user-visible "you-loop" text remains**

Run: `grep -rn '>you-loop<\|"you-loop \|you-loop on or off\|you-loop off' features/ entrypoints/ --include='*.tsx' --include='*.ts' | grep -v className | grep -v 'you-loop-'`
Expected: no output.

Run: `pnpm typecheck && pnpm test`
Expected: pass (HelpModal.test.tsx asserts class names only).

- [ ] **Step 4: Visual smoke check (in-session only, skip in subagent)**

Load dev build on a YouTube watch page; confirm the overlay wordmark shows `étude` (steady, no shimmer — the accent char must not change wordmark width behavior) and help modal header shows `étude`. Per memory note: hard-reload the extension, not just the tab, if changes don't show.

- [ ] **Step 5: Commit**

```bash
git add features/player-overlay/LoopPanel.tsx features/player-overlay/HelpModal.tsx
git commit -m "feat: étude wordmark and help copy"
```

---

### Task 3: Icon refresh

**Files:**
- Modify: `public/icon/icon.svg`
- Regenerate: `public/icon/{16,32,48,96,128}.png`
- Create: `site/assets/favicon.svg` (copy of icon)

- [ ] **Step 1: Slight stroke tweak in `public/icon/icon.svg`**

Keep concept and geometry (magnifier + repeat = zoom + loop, already brand-true). Single tweak for small-size legibility: repeat-glyph stroke `3 → 3.5`. Replace the second `<g>` opening tag:

```svg
  <g fill="none" stroke="#2dd4bf" stroke-width="3.5" stroke-linecap="butt" stroke-linejoin="miter">
```

Everything else in the file stays byte-identical.

- [ ] **Step 2: Regenerate PNGs**

```bash
cd /Users/edwardphillips/code/ed1001/you-loop
for s in 16 32 48 96 128; do
  npx --yes sharp-cli@5 -i public/icon/icon.svg -o "public/icon/$s.png" resize $s $s
done
```

Expected: five PNGs rewritten. Verify: `file public/icon/16.png` reports `16 x 16`.
Fallback if sharp-cli output names mismatch (it may write into a directory): `npx --yes sharp-cli@5 -i public/icon/icon.svg -o public/icon/ resize 16 16 && mv public/icon/icon.png public/icon/16.png` per size.

- [ ] **Step 3: Favicon for landing page**

```bash
mkdir -p site/assets && cp public/icon/icon.svg site/assets/favicon.svg
```

- [ ] **Step 4: Verify + visual check**

Run: `pnpm build 2>&1 | tail -3`
Expected: success (icons are copied as-is by WXT).
Open `public/icon/16.png` and `public/icon/128.png` (Read tool renders images) — repeat glyph must be legible at 16px, no clipping at 128px.

- [ ] **Step 5: Commit**

```bash
git add public/icon site/assets/favicon.svg
git commit -m "feat: refresh icon strokes, regenerate raster set, add site favicon"
```

---

### Task 4: Store listing copy (Chrome + AMO) and screenshot shot list

**Files:**
- Create: `docs/marketing/store-listing.md`

- [ ] **Step 1: Write `docs/marketing/store-listing.md`**

```markdown
# Étude — store listing copy

## Title (Chrome Web Store + AMO; = manifest name)

Étude — Loop, Slow Down & Practice YouTube

## Short description (≤132 chars; = manifest description)

Practice tools for YouTube — loop a section, slow it down, zoom in for precision.

## Long description (both stores)

An étude is a piece composed for practice. Étude turns any YouTube video into one.

Built for musicians learning by ear — and anyone who needs to study a passage of video closely.

PRACTICE TOOLS, BUILT AROUND LOOP REGIONS
• Set a loop region with draggable handles right on the YouTube timeline
• Loop it — or drill it one-shot at a time: playback pauses at the end of the region, press play (or space) to run it again from the top
• Slow playback from 0.25× to 3× in 0.25× steps; click the readout to snap back to 1×

ZOOM IN FOR PRECISION
Open the zoom panel to expand your loop region into a magnified timeline. Place the start and end exactly where they belong — down to the split second. No other looper has this.

KEYBOARD-FIRST DRILLING
• A — restart the loop region
• S — punch-in: jump in just before the tricky spot, snap back when you miss
• D — push-to-hear: hold to listen, release to take over

SAVED LOOPS
Name and save loops per video. Come back tomorrow; your work is where you left it.

FREE. NO ACCOUNT. NO TRACKING.
Étude collects no data — declared in the extension manifest, enforced by the only permission it asks for (storage, to keep your saved loops on your machine).

## Category

Chrome: Productivity → Tools (or Entertainment; pick Productivity).
AMO: Photos, Music & Videos.

## Screenshot shot list (1280×800, real UI only — no mocks)

1. HERO: zoom panel open, handle mid-drag, loop region visible on timeline. Caption: "Zoom in. Set your loop to the split second."
2. Player overlay pill: Loop/One-shot toggle + speed at 0.5×. Caption: "Loop it, or drill it one shot at a time."
3. Timeline with loop handles on a guitar lesson video. Caption: "Handles live right on the YouTube timeline."
4. Saved loops modal with 3–4 named loops. Caption: "Saved per video. Pick up where you left off."
5. Help modal (shortcut glyphs visible). Caption: "Keyboard-first: A restart, S punch-in, D push-to-hear."

Promo tiles: 440×280 small tile + 1400×560 marquee — wordmark `étude` on `#0f0f10`, teal accent, one-line tagline "Turn any YouTube video into a practice piece."

## Submission checklist

- [ ] Chrome Web Store dev account ($5) / AMO account
- [ ] `pnpm release` → zips for both stores
- [ ] Privacy practices form: no data collected
- [ ] Screenshots captured per shot list (extension loaded, real YouTube page)
```

- [ ] **Step 2: Verify copy constraints**

Run: `grep -ri "waveform" docs/marketing/ site/ 2>/dev/null`
Expected: no output.
Check title ≤75 chars and short description ≤132 chars:
`awk 'NR==5' docs/marketing/store-listing.md | wc -c` → ≤76 (title line). Adjust if over.

- [ ] **Step 3: Commit**

```bash
git add docs/marketing/store-listing.md
git commit -m "docs: store listing copy + screenshot shot list"
```

---

### Task 5: Landing page

**Files:**
- Create: `site/index.html` (single file, CSS embedded — one-pager, no build step)

- [ ] **Step 1: Write `site/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Étude — practice tools for YouTube</title>
<meta name="description" content="Turn any YouTube video into a practice piece. Loop a section, slow it down, zoom in for precision. Free, no account, no tracking.">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<style>
  :root {
    --bg: #0f0f10; --panel: rgba(38,38,42,.9); --teal: #14b8a6; --teal-light: #5eead4;
    --text: #fff; --muted: rgba(255,255,255,.55); --line: rgba(255,255,255,.08);
  }
  * { margin: 0; box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--text);
    font-family: "Roboto", system-ui, -apple-system, sans-serif;
    line-height: 1.5;
  }
  .wrap { max-width: 960px; margin: 0 auto; padding: 0 24px; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--line); }
  .wordmark { font-weight: 700; font-size: 18px; letter-spacing: -0.01em; color: var(--teal-light); }
  nav a { color: var(--muted); text-decoration: none; font-size: 14px; margin-left: 20px; }
  nav a:hover { color: var(--text); }
  .hero { padding: 72px 0 48px; text-align: center; }
  .hero h1 { font-size: clamp(28px, 5vw, 44px); font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
  .hero h1 em { font-style: normal; color: var(--teal-light); }
  .hero p { color: var(--muted); margin: 16px auto 0; max-width: 560px; font-size: 17px; }
  .ctas { margin-top: 28px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .btn { display: inline-block; padding: 12px 24px; border-radius: 999px; font-weight: 600; font-size: 15px; text-decoration: none; }
  .btn-primary { background: var(--teal); color: #0a0a0a; }
  .btn-secondary { border: 1px solid var(--line); color: var(--text); }
  .btn:hover { filter: brightness(1.1); }
  .trust { margin-top: 14px; color: var(--muted); font-size: 13px; }
  .shot { margin: 48px auto 0; max-width: 860px; border-radius: 16px; overflow: hidden;
          box-shadow: 0 0 0 1px rgba(20,184,166,.16), 0 24px 70px rgba(0,0,0,.6); }
  .shot img { display: block; width: 100%; }
  .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; padding: 64px 0; }
  .feature { background: var(--panel); border-radius: 16px; padding: 24px; }
  .feature h3 { font-size: 16px; margin-bottom: 8px; color: var(--teal-light); }
  .feature p { color: var(--muted); font-size: 14px; }
  .shortcuts { padding: 0 0 64px; }
  .shortcuts h2 { font-size: 22px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 10px 12px; border-top: 1px solid var(--line); font-size: 14px; color: var(--muted); }
  td:first-child { width: 72px; }
  kbd { background: rgba(0,0,0,.34); border: 1px solid var(--line); border-radius: 6px;
        padding: 2px 9px; font-family: ui-monospace, monospace; font-size: 13px; color: var(--text); }
  footer { border-top: 1px solid var(--line); padding: 24px 0; color: var(--muted); font-size: 13px;
           display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  footer a { color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="wordmark">étude</span>
    <nav>
      <a href="#features">Features</a>
      <a href="#shortcuts">Shortcuts</a>
      <a href="https://github.com/ed1001/you-loop">GitHub</a>
    </nav>
  </header>

  <section class="hero">
    <h1>Turn any YouTube video<br>into a <em>practice piece</em>.</h1>
    <p>Loop a section, slow it down, drill it until it sticks. Built for musicians learning by ear.</p>
    <div class="ctas">
      <a class="btn btn-primary" href="#" data-store="chrome">Add to Chrome — free</a>
      <a class="btn btn-secondary" href="#" data-store="firefox">Get for Firefox</a>
    </div>
    <p class="trust">Free, forever. No account. No tracking.</p>
    <div class="shot">
      <img src="assets/zoom-panel.png" alt="Étude's zoom panel expanding a loop region into a magnified timeline over a YouTube video" width="1280" height="800">
    </div>
  </section>

  <section class="features" id="features">
    <div class="feature">
      <h3>Practice tools, built around loop regions</h3>
      <p>Drag handles right on the YouTube timeline. Loop the region — or drill it one shot at a time, with playback pausing at the end until you run it again.</p>
    </div>
    <div class="feature">
      <h3>Zoom in for precision</h3>
      <p>Expand your loop region into a magnified timeline and place the start and end exactly where they belong — down to the split second.</p>
    </div>
    <div class="feature">
      <h3>Slow it down. Save it for later.</h3>
      <p>0.25× to 3× playback in fine steps. Name and save loops per video — tomorrow's practice starts where today's ended.</p>
    </div>
  </section>

  <section class="shortcuts" id="shortcuts">
    <h2>Keyboard-first drilling</h2>
    <table>
      <tr><td><kbd>A</kbd></td><td>Restart the loop region from the top.</td></tr>
      <tr><td><kbd>S</kbd></td><td>Punch-in: drop in just before the hard part, snap back when you miss.</td></tr>
      <tr><td><kbd>D</kbd></td><td>Push-to-hear: hold to listen, release to take over.</td></tr>
      <tr><td><kbd>Space</kbd></td><td>In one-shot mode, run the region again from the start.</td></tr>
    </table>
  </section>

  <footer>
    <span>étude — practice tools for YouTube.</span>
    <span>No data collected. <a href="https://github.com/ed1001/you-loop">Source on GitHub</a></span>
  </footer>
</div>
</body>
</html>
```

Store CTA `href`s stay `#` until listings are live (data-store attributes mark them for the post-publish URL swap).

- [ ] **Step 2: Placeholder hero image until real capture**

```bash
cp public/icon/128.png site/assets/zoom-panel.png
```

(Temporary so the page renders; Task 7 replaces it with the real zoom-panel screenshot.)

- [ ] **Step 3: Verify**

Run: `open site/index.html` (or read it in a browser tab) — renders dark page, wordmark, hero, three feature cards, shortcuts table; no horizontal scroll at 375px width.
Run: `grep -i waveform site/index.html`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add site/
git commit -m "feat: static landing page for etude.io"
```

---

### Task 6: Launch copy

**Files:**
- Create: `docs/marketing/launch-copy.md`

- [ ] **Step 1: Write `docs/marketing/launch-copy.md`**

```markdown
# Étude — launch copy

## Product Hunt

**Tagline:** Turn any YouTube video into a practice piece.

**Blurb:**
Étude adds practice tools to YouTube, built around loop regions: drag handles on the timeline, loop a passage or drill it one-shot at a time, slow it to 0.25×, and zoom the region into a magnified timeline to set your points to the split second. Loops save per video. Free, no account, no tracking.

**First comment (maker):**
I built Étude because learning songs by ear meant endlessly scrubbing YouTube's timeline and overshooting the lick every time. The zoom panel is the part I'm proudest of — expand the loop region and place your start/end exactly. An étude is a piece composed for practice; now any video can be one. It's free, collects nothing, and I'd love feedback — especially from players who practice with YouTube daily.

## Reddit — r/Guitar, r/WeAreTheMusicMakers (adapt per sub rules; many require a "self-promo Saturday" thread)

**Title:** I built a free browser extension that turns YouTube videos into practice loops — with a zoom view for setting points precisely

**Body:**
Hey all — I got tired of scrubbing back and forth trying to land on the exact start of a phrase, so I built Étude, a Chrome/Firefox extension for practicing with YouTube.

What it does:
- Drag loop handles right on the YouTube timeline
- Loop the region, or "one-shot" it: playback stops at the end, hit space to run it again
- Slow down to 0.25× (up to 3×)
- Zoom panel: expands the loop region into a magnified timeline so you can set start/end to the split second — this is the bit I haven't seen in other loopers
- Keyboard drilling: A restarts the region, S punch-in, D push-to-hear
- Loops save per video

Free, no account, no tracking (it literally can't collect data — the only permission is local storage). Would love honest feedback.

## X / Twitter thread

1/ Learning songs by ear from YouTube means fighting the timeline. One pixel of scrubbing = three seconds of video. So I built Étude.

2/ Set a loop region with handles on the timeline. Then zoom: the region expands into a magnified timeline where one pixel = a fraction of a second. Set your start exactly on the downbeat. [GIF: zoom open → handle drag → loop plays]

3/ Drill modes: loop forever, or one-shot — playback stops at the end of the region; space runs it again. A/S/D shortcuts for restart, punch-in, push-to-hear.

4/ 0.25×–3× speed. Loops save per video. Free, no account, no tracking. An étude is a piece composed for practice — now any YouTube video can be one. [link]
```

- [ ] **Step 2: Verify**

Run: `grep -i waveform docs/marketing/launch-copy.md`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add docs/marketing/launch-copy.md
git commit -m "docs: launch copy (Product Hunt, Reddit, X)"
```

---

### Task 7: Screenshot capture + final verification (in-session; needs loaded extension — do NOT dispatch to a subagent)

**Files:**
- Replace: `site/assets/zoom-panel.png`
- Create: `docs/marketing/screenshots/` (5 captures per shot list in `docs/marketing/store-listing.md`)

- [ ] **Step 1: Build and load**

Run: `pnpm dev` → load `.output/chrome-mv3-dev` at `chrome://extensions` (or reuse existing loaded dev build; hard-reload the extension per memory note).

- [ ] **Step 2: Capture the 5 shots**

Use Claude-in-Chrome on a YouTube watch page (instrumental guitar lesson recommended for visuals), window sized so captures land at 1280×800. Follow the shot list in `docs/marketing/store-listing.md`. Save to `docs/marketing/screenshots/01-zoom-hero.png` … `05-help-modal.png`.

- [ ] **Step 3: Wire hero shot into site**

```bash
cp docs/marketing/screenshots/01-zoom-hero.png site/assets/zoom-panel.png
```

- [ ] **Step 3b: Promo tiles**

Write a throwaway `docs/marketing/screenshots/tile.html` — `#0f0f10` background, centered `étude` wordmark (`#5eead4`, 700 weight), tagline "Turn any YouTube video into a practice piece." in `rgba(255,255,255,.55)` — open it in the browser sized 440×280, screenshot to `docs/marketing/screenshots/tile-440x280.png`; resize window to 1400×560 and capture `tile-1400x560.png`. Delete `tile.html` after.

- [ ] **Step 4: Full verification suite**

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm build:firefox
grep -ri waveform site/ docs/marketing/ ; echo "grep-exit:$?"
```

Expected: all green; grep exit 1 (no matches). Manifest check: `grep '"name"' .output/chrome-mv3/manifest.json` shows the Étude title; overlay on YouTube shows `étude` wordmark.

- [ ] **Step 5: Commit**

```bash
git add site/assets/zoom-panel.png docs/marketing/screenshots
git commit -m "feat: real UI screenshots for store + landing hero"
```

---

## Out of scope (per spec)

Product feature changes, CSS class renames, repo rename, demo GIF (post-launch), paid tier, analytics. User actions: register etude.io, store accounts, upload zips.
