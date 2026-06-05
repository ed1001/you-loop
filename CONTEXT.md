# You Loop

You Loop is a browser extension for adding focused playback controls to web video players, starting with YouTube.

## Language

**Video Player Adapter**:
A site-specific bridge between extension controls and a page's video player state.
_Avoid_: Site integration, player integration, scraper

**Loop Segment**:
A user-selected portion of a video bounded by a start time and an end time.
_Avoid_: Clip, range, selection

**Playback Rate**:
The speed at which the active video plays relative to normal speed.
_Avoid_: Speed setting, tempo

**Player Overlay**:
Controls shown inside or directly above the active video player.
_Avoid_: Popup, toolbar, panel

**Loop Handles**:
Draggable markers on a timeline that define a **Loop Segment**.
_Avoid_: Sliders, knobs, trim points

**Zoom Panel**:
A focused overlay that expands a **Loop Segment** into a detailed waveform view.
_Avoid_: Advanced UI, inspector, editor

**Waveform Track**:
A visual precision aid in the **Zoom Panel** that represents the selected time range without requiring true audio analysis.
_Avoid_: Audio waveform, spectrum, samples

**Toolbar Popup**:
The extension surface opened from the browser toolbar icon.
_Avoid_: Welcome screen, plugin screen, homepage

**Play Mode**:
The behavior used when playback reaches the end of a **Loop Segment**.
_Avoid_: Loop type, playback option

## Relationships

- A **Video Player Adapter** belongs to exactly one supported video site or player family.
- Extension controls send playback intents through a **Video Player Adapter**.
- A **Loop Segment** belongs to the active video session.
- A **Playback Rate** applies to the active video session.
- A **Player Overlay** controls the active video through a **Video Player Adapter**.
- **Loop Handles** define exactly one **Loop Segment**.
- A **Play Mode** applies to the active **Loop Segment**.
- A **Zoom Panel** belongs to exactly one **Loop Segment**.
- A **Waveform Track** appears inside the **Zoom Panel**.
- The **Toolbar Popup** controls extension-wide availability for supported pages.

## Example dialogue

> **Dev:** "Should loop controls talk directly to YouTube's DOM?"
> **Domain expert:** "No, they should go through the **Video Player Adapter** so YouTube-specific behavior stays isolated."
>
> **Dev:** "Do we save the user's loop between videos?"
> **Domain expert:** "No, the first version keeps the **Loop Segment** and **Playback Rate** tied to the active video session."
>
> **Dev:** "Should loop controls live in the browser extension popup?"
> **Domain expert:** "No, they should live in the **Player Overlay** so users can adjust playback while watching."
>
> **Dev:** "Should **Loop Handles** modify YouTube's native progress bar?"
> **Domain expert:** "No, they should visually align to the YouTube timeline while the extension owns interaction and state."
>
> **Dev:** "Does the segment always loop?"
> **Domain expert:** "No, users can switch **Play Mode** between loop and one-shot."
>
> **Dev:** "Does the **Zoom Panel** need true audio waveform data from YouTube?"
> **Domain expert:** "No, the first version uses a **Waveform Track** as a visual precision aid without audio analysis."
>
> **Dev:** "Where should users turn the extension off?"
> **Domain expert:** "Use the **Toolbar Popup** opened from the browser toolbar icon."

## Flagged ambiguities

- "Video players like YouTube" was resolved as YouTube-only for the first version, with adapter boundaries kept open for future sites.
- "Functionality like the reference extension" was resolved as loop and speed controls only for the first version.
- "App controls" was resolved as a **Player Overlay**, not an extension popup, for the first version.
- Persistence was deferred: **Loop Segment** and **Playback Rate** are session-only for the first version, with per-video or global defaults expected later.
- "Timeline drag handles" was initially resolved as an extension-owned mini timeline, then replaced with **Loop Handles** visually aligned to the YouTube timeline while preserving extension-owned interaction/state.
- **Playback Rate** range for the first version is 0.25x to 3.0x in 0.25x steps, with reset to 1x.
- The first version supports YouTube watch pages only, not Shorts, embeds, or other video surfaces.
- The first version targets Chrome MV3 and Firefox MV3.
- **Play Mode** can be toggled between loop and one-shot.
- In one-shot **Play Mode**, playback pauses when it reaches the end of the **Loop Segment**.
- In one-shot **Play Mode**, pressing play or spacebar after the segment ends seeks to the start of the **Loop Segment** and plays again.
- The **Player Overlay** appears centered in the video frame and remains visible on YouTube watch pages for the first version.
- The first version includes a **Zoom Panel** above the controls with its own **Loop Handles** for precise **Loop Segment** adjustment.
- The **Waveform Track** does not require true audio analysis in the first version.
- The **Toolbar Popup** includes an enable/disable toggle for supported YouTube pages.
