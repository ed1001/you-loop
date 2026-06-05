# You Loop Browser Extension Design

## Purpose

You Loop adds precise loop and playback-rate controls to YouTube watch pages. The first version targets focused practice and review workflows: choose a video segment, loop it or play it once, adjust speed, and refine the segment with a zoomed control surface.

## Scope

### In

- Chrome MV3 and Firefox MV3 builds.
- WXT with React and TypeScript.
- YouTube watch pages: `https://www.youtube.com/watch?...`.
- Centered Player Overlay on the video frame.
- Loop Handles visually aligned to the YouTube timeline.
- Zoom Panel with a Waveform Track for precise Loop Segment adjustment. Zoom panel reflects the same Loop Segment as the timeline handles and has it's own loop handles for fine adjustment.
- Play Mode toggle:
  - loop: seek back to start when playback reaches the end.
  - one-shot: pause at the end. Pressing spacebar or play again resumes from the start of the segment.
- Playback Rate controls from 0.25x to 3.0x in 0.25x steps, with reset to 1x.
- Toolbar Popup with enable/disable toggle for supported YouTube pages.
- Session-only Loop Segment, Play Mode, and Playback Rate state.

### Out

- Shorts, embeds, playlists outside watch pages, mini-player, and non-YouTube sites.
- True audio waveform analysis from YouTube media.
- Persisted per-video or global defaults.
- Keyboard shortcuts.
- Full browser E2E automation against YouTube.

## Product Behavior

The extension activates only on YouTube watch pages when enabled. It places a compact Player Overlay centered in the video frame. The overlay remains visible for the MVP so controls are discoverable.

Loop Handles sit visually on top of the YouTube timeline, but the extension owns the handle DOM, interaction, and state. The extension must not mutate YouTube's native progress bar internals beyond reading geometry needed for alignment.

The Zoom Panel opens above the controls. It shows the selected segment as a Waveform Track. The Waveform Track is an interaction aid, not a true audio waveform; it may use generated or progress-like visual data. Dragging in the Zoom Panel edits the same Loop Segment as the timeline handles.

When a new YouTube watch video loads through SPA navigation, MVP state resets. Future persistence can restore per-video Loop Segments or global Playback Rate defaults.

## Architecture

Use WXT generated entrypoints:

- `entrypoints/content.tsx`: detects supported YouTube watch pages, mounts React UI, owns page geometry, and controls the active video through the YouTube Video Player Adapter.
- `entrypoints/background.ts`: owns tab-scoped session state, enable/disable setting, and command routing.
- `entrypoints/popup`: renders the Toolbar Popup with the enable/disable toggle and page status.

Use feature-first source layout:

- `features/player-overlay`: React overlay, controls, timeline handle UI, Zoom Panel.
- `features/playback`: playback reducer, commands, state machine, rate and segment validation.
- `adapters/youtube`: YouTube Video Player Adapter and watch-page detection.
- `shared/messaging`: typed commands/events between extension contexts.
- `shared/types`: shared domain types.

The content script still performs direct playback control because the background service worker cannot access page DOM or the page's `HTMLVideoElement`. Background state exists now to support the toolbar toggle and future popup controls, shortcuts, and persistence without reshaping the content script.

## Command Model

Use typed commands/events instead of shared mutable state across contexts.

Core commands:

- `setLoopSegment({ start, end })`
- `clearLoop()`
- `setPlaybackRate(rate)`
- `resetPlaybackRate()`
- `setPlayMode(mode)`
- `setEnabled(enabled)`

Core events:

- `stateChanged(state)`
- `videoChanged(videoIdentity)`
- `adapterStatusChanged(status)`

Background is the source of truth for tab-scoped extension state. Content script applies commands to the active video and reports page/video status.

## Playback Rules

- A Loop Segment is valid only when start is before end.
- Loop Handles cannot cross.
- Enforce a minimum segment duration of `0.1s`.
- Invalid or missing Loop Segment means no loop enforcement.
- In loop mode, when current time reaches segment end, seek to segment start and continue playing.
- In one-shot mode, when current time reaches segment end, pause at segment end. one shot is triggered again by pressing play or spacebar, which seeks to segment start and plays.
- Clamp Playback Rate to 0.25x through 3.0x.
- Adjust Playback Rate in 0.25x steps.

## Error Handling

- If no video element is found, keep the content script alive and show no overlay.
- If YouTube layout changes and timeline geometry cannot be measured, keep overlay controls available but disable or hide timeline-aligned handles.
- If background messaging fails, content script stops applying new playback commands until messaging recovers and logs an adapter/status error in dev builds.
- If the extension is disabled from the Toolbar Popup, unmount or hide overlay and stop enforcing loop behavior.

## Testing

Automated tests:

- Playback reducer/state machine:
  - valid and invalid Loop Segment.
  - handle clamping and minimum duration.
  - loop mode end behavior.
  - one-shot end behavior.
  - Playback Rate clamp, step, and reset.
  - enabled/disabled state.
- YouTube Video Player Adapter contract with mocked `HTMLVideoElement`.
- Messaging type tests where practical.

Manual browser verification:

- Chrome MV3 build loads and overlay mounts on YouTube watch pages.
- Firefox MV3 build loads and overlay mounts on YouTube watch pages.
- Handles align after resize, fullscreen, and theater mode changes.
- SPA navigation to a new watch video resets session state.
- Toolbar Popup disables and re-enables overlay.
- Loop mode loops from B to A.
- One-shot pauses at B.
- Playback Rate controls apply to the active video.

Full Playwright E2E against YouTube is deferred until the UI stabilizes because YouTube DOM and account/session behavior are brittle.

## Open Future Work

- Per-video Loop Segment persistence.
- Global Playback Rate defaults.
- Keyboard shortcuts.
- Support for YouTube Shorts and embeds.
- Support for generic HTML5 video sites through additional Video Player Adapters.
- Real audio waveform generation if browser/permission constraints prove acceptable.
