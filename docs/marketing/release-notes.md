# Étude — release notes

## 0.5.0

### Store "what's new" (Chrome Web Store + AMO version notes)

New in 0.5 — keep your practice library tidy, and save without breaking flow:

• Folders — group your saved videos into folders from the toolbar popup. Create, rename and collapse them; move a video with one click.
• Quick save — press ⌘S (Ctrl+S on Windows/Linux) to save your changes straight back to the loop you're on.
• Always know where you are — the Saved loops button now names the loop you're on and shows a dot once you've changed it.
• Simpler Saved loops window — one list, with "Save changes" and "Save as new" right underneath.

Free, no account, no tracking.

### Full notes (GitHub release)

**Added**
- **Folders in the popup.** Group saved videos into folders: create, rename and delete them, and move a video from its row. Folders collapse (remembered per device), with Unfiled last. Deleting a folder only unfiles its videos — nothing is removed.
- **Quick save.** ⌘S / Ctrl+S overwrites the loop you're on with the current region, zoom, marks and count-in, with a short "Saved" confirmation. With no loop active it opens Saved loops on the name field.
- **Active-loop chip.** The Saved loops button names the loop you applied or saved, and shows a dot once the live state has drifted from it.

**Changed**
- **Saved loops window, simplified.** One list plus a footer that reads "You're on …" with a Saved/Edited status, **Save changes** and **Save as new**. The loop you're on stays highlighted in the list after you edit it. The list scrolls while the title and footer stay put, so it fits small players.
- **Popup rows** show the video name at full width; move and delete appear on hover.
- **Help** covers the chip, the dot and the save shortcut.

**Notes**
- Still free, no account, and no data collected. Saved loops and folders live in your browser and ride its own account sync across your devices when that's turned on — never through an Étude server.

_Tag: `v0.5.0`._

## 0.4.0

### Store "what's new" (Chrome Web Store + AMO version notes)

New in 0.4 — mark the trouble spots inside your loop:

• Practice marks — Shift-click the zoomed timeline to drop marks inside your loop. Click a mark and the loop plays from that point to the end; click it off to run the whole passage again.
• Saved loops now capture your practice marks too, so a marked-up passage comes back next visit.
• Cleaner zoom strip — the loop fill now runs flush to the cursors, and the background hatch is gone.

Free, no account, no tracking.

### Full notes (GitHub release)

**Added**
- **Practice marks.** Shift-click the zoom strip to drop a mark inside the loop. Click a mark to activate it — playback then loops from the mark to the loop end, and the restart keys (A/S/D) and count-in anchor on it. Click it again for the whole passage; Shift-click a mark to remove it. Marks outside the current loop dim and come back when the loop covers them again. Holding Shift over the strip shows an add-mark cursor.
- **Marks persist.** Saving a loop snapshots its marks alongside the region, zoom, and count-in; applying a saved loop brings them back. Which mark is active stays per-session.

**Changed**
- **Zoom strip polish.** The loop fill now tucks flush under the cursor brackets (no bare slivers at the ends), and the faint tick hatch is gone so marks read clearly.
- **Help** documents the practice-mark gestures, in a slightly wider card.

**Fixed**
- **Firefox dev builds no longer share the store install's storage.** Development builds now carry their own add-on id (`etude-dev@ed1001.dev`), so loading a temporary dev build can't wipe your saved loops. (Only relevant if you load dev builds via about:debugging.)

**Notes**
- Still free, no account, and no data collected. Saved loops live in your browser and ride its own account sync across your devices when that's turned on — never through an Étude server.

_Tag: `v0.4.0`._

## 0.3.0

### Store "what's new" (Chrome Web Store + AMO version notes)

New in 0.3 — shape how a passage sounds, not just where it loops:

• Change the key without changing the tempo — transpose up or down by up to 12 semitones, and hold Shift to fine-tune in cents.
• Count-in — a metronome counts you in before the loop starts, so you come in on time. Set the tempo, time signature, and how many bars.
• Saved loops now capture your zoom and count-in too, and you can rename a saved loop or replace it with your current one.

Free, no account, no tracking.

### Full notes (GitHub release)

**Added**
- **Pitch shift.** Transpose the song without changing its speed — hold the pitch readout and drag to shift in semitones (±12). Hold Shift to zoom the dial into cents for fine-tuning; fling right to snap back to 0.
- **Count-in.** A metronome counts you in before the loop begins. Tap or drag the tempo, pick the time signature (2/4, 3/4, 4/4, 6/8) and how many bars, with an on-timeline beacon marking the count.

**Changed**
- **Saved loops** now snapshot the zoom and count-in alongside the loop region, so one tap restores a whole practice setup. Rename a saved loop, or replace it with your current one, from a pencil control; your last-used loop is re-applied on the next visit.

**Notes**
- Still free, no account, and no data collected. Saved loops live in your browser and ride its own account sync across your devices when that's turned on — never through an Étude server.

_Tag: `v0.3.0`._
