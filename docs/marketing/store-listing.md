# Étude — store listing copy

## Title (Chrome Web Store + AMO; = manifest name)

Étude — Loop & Slow Down YouTube for Practice

## Short description (≤132 chars; = manifest description)

Practice tools for YouTube — loop a section, slow it down, zoom in for precision. Made for musicians learning by ear.

## Long description (both stores)

An étude is a piece composed for practice. Étude turns any YouTube video into one.

Built for musicians learning by ear — and anyone who needs to study a passage of video closely.

PRACTICE TOOLS, BUILT AROUND LOOP REGIONS
• Set a loop region with draggable handles right on the YouTube timeline
• Loop it — or drill it one-shot at a time: playback pauses at the end of the region, press play (or space) to run it again from the top
• Slow playback from 0.25× to 3× in 0.25× steps; click the readout to snap back to 1×

ZOOM IN FOR PRECISION
Open the zoom panel to expand your loop region into a magnified timeline. Place the start and end exactly where they belong — down to the split second.

KEYBOARD-FIRST DRILLING
• A — restart the loop region
• S — cue: hold to play from the top of the loop, release to snap straight back
• D — push-to-play: hold to listen, release to pause, hold again to carry on

SAVED LOOPS
Name and save loops per video. Come back tomorrow; your work is where you left it.

FREE. NO ACCOUNT. NO TRACKING.
Étude collects no data — declared in the extension manifest, enforced by the only permission it asks for (storage, to keep your saved loops on your machine). Loops are stored locally; uninstalling the extension removes them.

## Category

Chrome: Productivity → Tools (or Entertainment; pick Productivity).
AMO: Photos, Music & Videos.

## Screenshot shot list (1280×800, real UI only — no mocks)

1. HERO: zoom panel open, handle mid-drag, loop region visible on timeline. Caption: "Zoom in. Set your loop to the split second."
2. Player overlay pill: Loop/One-shot toggle + speed at 0.5×. Caption: "Loop it, or drill it one shot at a time."
3. Timeline with loop handles on a guitar lesson video. Caption: "Handles live right on the YouTube timeline."
4. Saved loops modal with 3–4 named loops. Caption: "Saved per video. Pick up where you left off."
5. Help modal (shortcut glyphs visible). Caption: "Keyboard-first: A restart, S cue, D push-to-play."

Promo tiles: 440×280 small tile + 1400×560 marquee — wordmark `étude` on `#0f0f10`, teal accent, one-line tagline "Turn any YouTube video into a practice piece."

## Submission checklist

- [ ] Chrome Web Store dev account ($5) / AMO account
- [ ] `pnpm release` → zips for both stores
- [ ] Privacy practices form: no data collected
- [ ] Screenshots captured per shot list (extension loaded, real YouTube page)
- [ ] Dashboard trust fields: website URL (étude site) + support URL (GitHub issues)
