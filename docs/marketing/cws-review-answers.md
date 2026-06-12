# Chrome Web Store — review form answers (Étude)

## Single purpose

Étude adds practice tools to the YouTube watch page: loop a section of a video
with draggable timeline handles, slow playback down, and zoom into the timeline
to set loop points precisely. Single purpose: help people practice and study
YouTube videos by controlling playback of a chosen region.

## Permission justifications

**`storage`**
Saves the user's named loop regions on their own machine so they persist
between sessions. No remote storage, no sync, no network use.

**Host permission `https://www.youtube.com/*`**
Required to inject the practice UI (loop handles on the timeline, the speed
control, the zoom panel) directly into the YouTube watch page and to read the
video element's playback state. Scoped to youtube.com only.

**Remote code**: None. All code ships in the package; nothing is fetched or
evaluated at runtime.

## Data usage / privacy practices

- Does the extension collect user data? **No.**
- Saved loops are stored locally via `storage` and never leave the device.
- No analytics, no tracking, no network requests.
- Uninstalling removes all stored data.

Privacy policy URL: not required — no user data is collected or transmitted.
(If the form forces a URL, point it at the landing page's privacy section.)
