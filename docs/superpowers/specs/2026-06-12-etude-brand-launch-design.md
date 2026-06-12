# Étude — Brand & Launch Kit Design

Date: 2026-06-12
Status: Approved

## Summary

Rebrand the you-loop extension as **Étude** and produce a full launch kit: in-app rename, Chrome/Firefox store listings, logo/icon refresh, landing page, and launch copy. Visual identity reuses the existing in-app design language — no product redesign.

## Decisions (with rationale)

| Decision | Choice | Why |
|---|---|---|
| Audience | Musicians first | Feature set (one-shot drills, push-to-hear, punch-in, zoom) is practice-tool shaped; sharpest message wins store search and word of mouth. Copy never excludes language learners but doesn't chase them. |
| Name | **Étude** (slug `etude`) | A piece composed for practice — concept-true. Store lane empty (no extension named Etude). etude.io available. Shared-namespace risk accepted (iOS sheet-music app, cosmetics brand — different platforms/industries, weak descriptive marks). |
| Visual direction | Existing app skin | Dark glass + teal already reads precision-tool and looks native on YouTube. Brand adopts app palette, not vice versa; store screenshots, landing, and product all match. |
| Pricing | Free, forever | Max install velocity + reviews. "Free, no account, no tracking" is the trust wedge vs freemium incumbents (Transpose, 1M+ users). |
| Landing | Own domain, static | etude.io (user registers), static site in repo, GitHub Pages or Cloudflare Pages. |

### Names considered and rejected

- **You Loop** (current) — generic, weak store SEO, mild YouTube trademark adjacency.
- **LoopLab** — direct collision: "LoopLab — Music Loop Trainer" (iOS) is the same product pitch verbatim; plus Stagecraft Loop Lab plugin, LOOPLABS studio.
- **Loopsmith** — loopsmith.app is a live product with the identical feature set (YouTube practice looper, saved named loops, for musicians).
- **Woodshed** — user verdict: reads as carpentry, misleading.
- **Loupe** — user verdict: too obscure, nobody makes the magnifier connection.
- **Looptude** — strong runner-up (ownable, domains free); lost to Étude's real-word elegance.

## Brand

- **Wordmark:** lowercase `étude`, teal `#5eead4`, weight 700, existing wordmark slot (`.you-loop-wordmark` styling unchanged).
- **Tagline / headline:** "Turn any YouTube video into a practice piece."
- **Voice:** calm, craft, musician-to-musician. No hype vocabulary.
- **Palette & shapes (from `entrypoints/content/pageUi.styles.ts`):** panel `rgba(38,38,42,.9)`, accents `#14b8a6` / `#5eead4`, dark text-on-teal `#0a0a0a`, pill radius `999px`, cards `16px`, font stack `"YouTube Sans", "Roboto", system-ui, sans-serif`.
- **Icon colors (from `public/icon/icon.svg`):** background `#0a201d`, strokes `#2dd4bf`.

## Positioning

Frame: **a set of practice tools built around loop regions** on YouTube.

Message order:

1. **Practice toolkit** — loop a region, drill it one-shot, slow it 0.25–3×.
2. **Precision zoom** (differentiator; prominent but not the lead) — expand the loop region into a magnified timeline, set start/end to the exact moment. Gets the hero screenshot and its own feature block.
3. **Saved loops** — per-video library, picks up where you left off.
4. **Trust** — free, no account, no tracking (manifest already declares no data collection).

**Accuracy constraint:** never use the word "waveform" in any copy or claim audio analysis. The Zoom Panel's track is a visual precision aid, not audio data. Approved phrasing: "magnified timeline", "split-second handle placement", "zoom in on your loop". All marketing visuals use real UI screenshots, not stylized mocks.

## Deliverables

### 1. In-app rename (smallest possible diff)

- `wxt.config.ts`: manifest `name: "Étude"`, description "Practice tools for YouTube — loop, slow down, zoom in." (store-safe, ≤132 chars).
- `features/player-overlay/LoopPanel.tsx`: wordmark text → `étude`.
- Help modal eyebrow/header wordmark text → `étude`.
- `package.json` name → `etude`, README title + intro.
- Internal `you-loop-*` CSS class names and file structure stay (zero user-facing impact; avoid churn).

### 2. Store listings

- **Chrome title:** "Étude — Loop & Slow Down YouTube for Practice" (covers search terms: loop, slow down, practice).
- **Firefox (AMO):** same name/copy; data-collection declaration already present in manifest.
- **Long description structure:** practice-toolkit lead → zoom precision block → shortcuts list (a/s/d: restart, punch-in snap-back, push-to-hear) → saved loops → privacy line.
- **Assets:** 5 screenshots at 1280×800 (shot 1: zoom panel open mid-drag; then loop+one-shot toggle, speed control, saved-loops modal, help modal), promo tiles 440×280 and 1400×560, refreshed icon set.

### 3. Logo / icon refresh

- Keep current concept — magnifier + repeat glyph already encodes zoom + loop.
- Refine stroke weight/geometry in `public/icon/icon.svg`, keep `#0a201d` / `#2dd4bf`, regenerate 16/32/48/96/128 PNGs.
- Derive monochrome variant for landing-page favicon and AMO.

### 4. Landing page (etude.io)

- Single static page in repo at `/site` (plain HTML/CSS, no framework), deployed via GitHub Pages or Cloudflare Pages; custom domain etude.io registered by user.
- Sections: hero (headline, install CTAs for Chrome + Firefox, zoom-panel screenshot), 3-feature row (practice toolkit / precision zoom / saved loops), keyboard-shortcuts table, privacy line, footer (GitHub link).
- App skin: dark page `#0f0f10`, teal CTAs, pill shapes, same font stack with web-safe fallbacks (YouTube Sans not redistributable — use Roboto/system-ui on web).
- Demo GIF embedded once recorded (real UI, browser automation).

### 5. Launch copy

- Chrome Web Store + AMO submission text.
- Product Hunt blurb.
- Reddit drafts for r/Guitar and r/WeAreTheMusicMakers (honest "I built this" tone, no astroturf).
- X/Twitter thread (3–5 posts: problem → zoom demo GIF → free/no-tracking → link).

## Out of scope

- Product feature changes, CSS class renames, repo rename.
- Paid tier, accounts, analytics.
- Demo video production (GIF only for now; Screen.studio later if wanted).

## Verification

- `pnpm dev` and `pnpm dev:firefox` build clean after rename; manifest name renders correctly in `chrome://extensions` and `about:debugging`.
- Overlay wordmark and help modal show `étude` on a YouTube watch page.
- Store copy lengths validated against Chrome (132-char short description) and AMO limits.
- Landing page: passes basic Lighthouse run, both install CTAs link correctly, renders at mobile width.
- Grep marketing deliverables for the word "waveform" — must be absent.

## Open items (user actions)

- Register etude.io (and optionally getetude.com, etude.tools) — names in this space burn fast, as the loopsmith.app near-miss showed.
- Chrome Web Store developer account ($5 one-time) and AMO account, if not already held.
