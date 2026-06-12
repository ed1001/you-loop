# AMO reviewer notes — Étude (Firefox)

## Build environment

- **Node**: 22.13.1
- **pnpm**: 10.2.1
- **OS**: builds on macOS / Linux (no platform-specific steps)

## Build steps (reproduces the submitted `.xpi`)

```sh
pnpm install --frozen-lockfile
pnpm zip:firefox
```

Output: `.output/etude-<version>-firefox.zip` (the uploaded add-on) and
`.output/etude-<version>-sources.zip` (this source submission).

The build runs WXT (`wxt zip -b firefox --mv3`), which bundles with Vite.
No code is generated or fetched at runtime; all source is in the repo.

## Source layout

- `entrypoints/` — content script, background, popup (the extension code)
- `features/`, `shared/`, `adapters/` — feature logic and YouTube DOM adapters
- `wxt.config.ts` — manifest definition
- `public/` — static assets (icons, wordmark font)

## Permissions

- `storage` — persist user-named loop regions locally (no sync, no network).
- host `https://www.youtube.com/*` — inject the practice UI (loop handles,
  speed control, zoom panel) into the YouTube watch page.

No remote code, no analytics, no network requests. `browser_specific_settings.
gecko.data_collection_permissions.required = ["none"]` declares this in the
manifest.

## Minified files

`content.js` / `popup` chunks are Vite production bundles. Re-running the build
steps above from this source produces byte-equivalent output.
