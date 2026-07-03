# Chrome Web Store — review form answers (Étude)

## Single purpose

Étude adds practice tools to the YouTube watch page: loop a section of a video
with draggable timeline handles, slow playback down, and zoom into the timeline
to set loop points precisely. Single purpose: help people practice and study
YouTube videos by controlling playback of a chosen region.

## Permission justifications

**`storage`**
Saves the user's named loop regions so they persist between sessions, using the
browser's `storage` API. If the user has the browser's own account sync
(Chrome) enabled, the browser syncs those saved loops across that user's
signed-in devices the same way it syncs bookmarks — handled and encrypted by the
browser. Étude runs no server of its own, makes no network requests, and uses no
analytics; nothing is sent to Étude.

**Host permission `https://www.youtube.com/*`**
Required to inject the practice UI (loop handles on the timeline, the speed
control, the zoom panel) directly into the YouTube watch page and to read the
video element's playback state. Scoped to youtube.com only.

**Remote code**: None. All code ships in the package; nothing is fetched or
evaluated at runtime.

## Data usage / privacy practices

- Does the extension collect user data? **No.**
- Saved loops are stored via the `storage` API. They stay on the device unless
  the user turns on the browser's built-in account sync, in which case the
  browser — not Étude — syncs them across the user's own devices, encrypted,
  the same way it syncs bookmarks.
- No analytics, no tracking; Étude makes no network requests and runs no server
  of its own.
- Uninstalling removes the local copy.

Privacy policy URL: not required — no user data is collected or transmitted.
(If the form forces a URL, point it at the landing page's privacy section.)
