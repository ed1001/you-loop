# Étude

Browser extension with practice tools for YouTube — loop a section, slow it down, zoom in for precision. (Working name during development: you-loop; internal CSS classes keep that prefix.)

## Development

WXT's browser runner is disabled in `wxt.config.ts`, so dev commands build and watch the extension without launching a separate browser.

Run Firefox MV3 dev build:

```bash
pnpm dev:firefox
```

Then enable it in an already-running Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `.output/firefox-mv3-dev/manifest.json`.

Run Chrome MV3 dev build:

```bash
pnpm dev
```

Then load `.output/chrome-mv3-dev` as an unpacked extension from `chrome://extensions`.
