# You Loop Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a WXT React/TypeScript browser extension that adds centered YouTube loop, one-shot, zoom, and playback-rate controls.

**Architecture:** WXT provides Chrome MV3 and Firefox MV3 builds. Content script mounts the Player Overlay and controls the page video through a YouTube Video Player Adapter. Background service worker owns tab-scoped state, enable/disable setting, and typed command routing; toolbar popup controls the enabled state.

**Tech Stack:** WXT, React, TypeScript, Vitest, Testing Library, browser extension APIs.

---

## File Map

- `package.json`: scripts and dependencies.
- `wxt.config.ts`: WXT config, manifest metadata, host permissions.
- `tsconfig.json`: strict TypeScript config.
- `vitest.config.ts`: unit test config.
- `entrypoints/content.tsx`: YouTube content script entrypoint.
- `entrypoints/background.ts`: background service worker entrypoint.
- `entrypoints/popup/App.tsx`: toolbar popup UI.
- `entrypoints/popup/index.html`: popup HTML shell.
- `features/playback/types.ts`: playback domain types.
- `features/playback/reducer.ts`: pure playback state machine.
- `features/playback/reducer.test.ts`: playback tests.
- `features/playback/controller.ts`: applies state to a video adapter on time updates.
- `features/playback/controller.test.ts`: loop and one-shot controller tests.
- `shared/messaging/protocol.ts`: typed command/event protocol.
- `shared/messaging/protocol.test.ts`: protocol shape tests.
- `adapters/youtube/adapter.ts`: YouTube video adapter implementation.
- `adapters/youtube/adapter.test.ts`: adapter tests with mocked `HTMLVideoElement`.
- `adapters/youtube/watch-page.ts`: watch page and SPA navigation helpers.
- `features/player-overlay/PlayerOverlay.tsx`: centered control surface.
- `features/player-overlay/PlayerOverlay.test.tsx`: overlay interaction tests.
- `features/player-overlay/TimelineHandles.tsx`: handles aligned to YouTube timeline.
- `features/player-overlay/ZoomPanel.tsx`: zoom panel and waveform track.
- `features/player-overlay/overlay.css`: overlay styles.
- `features/player-overlay/mount.tsx`: mount/unmount helper.

## Task 1: Scaffold WXT React TypeScript Project

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `entrypoints/content.tsx`
- Create: `entrypoints/background.ts`
- Create: `entrypoints/popup/index.html`
- Create: `entrypoints/popup/App.tsx`

- [ ] **Step 1: Initialize WXT app**

Run:

```bash
pnpm dlx wxt@latest init . --template react
```

Expected: WXT creates extension scaffold in current empty repo.

- [ ] **Step 2: Install test dependencies**

Run:

```bash
pnpm add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Expected: dependencies added to `package.json`.

- [ ] **Step 3: Replace `package.json` scripts**

Use these scripts:

```json
{
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

Expected: existing WXT package fields remain; scripts match above.

- [ ] **Step 4: Configure WXT manifest**

Create/replace `wxt.config.ts`:

```ts
import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "You Loop",
    description: "Precise loop and playback-rate controls for YouTube.",
    permissions: ["storage", "tabs"],
    host_permissions: ["https://www.youtube.com/*"],
    action: {
      default_title: "You Loop",
      default_popup: "popup.html"
    }
  }
});
```

- [ ] **Step 5: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"]
  }
});
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Verify scaffold**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm build:firefox
```

Expected: tests pass or report no tests, typecheck passes, Chrome and Firefox builds complete.

- [ ] **Step 7: Commit**

Run only if this is now a git repo:

```bash
git add package.json pnpm-lock.yaml wxt.config.ts tsconfig.json vitest.config.ts vitest.setup.ts entrypoints public
git commit -m "chore: scaffold wxt extension"
```

## Task 2: Playback Domain Reducer

**Files:**
- Create: `features/playback/types.ts`
- Create: `features/playback/reducer.ts`
- Create: `features/playback/reducer.test.ts`

- [x] **Step 1: Write failing reducer tests**

Create `features/playback/reducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clampPlaybackRate,
  createInitialPlaybackState,
  playbackReducer
} from "./reducer";

describe("playback reducer", () => {
  it("sets a valid loop segment", () => {
    const state = playbackReducer(createInitialPlaybackState(), {
      type: "setLoopSegment",
      segment: { start: 5, end: 8 }
    });

    expect(state.loopSegment).toEqual({ start: 5, end: 8 });
  });

  it("clamps crossing handles to minimum duration", () => {
    const state = playbackReducer(
      { ...createInitialPlaybackState(), loopSegment: { start: 5, end: 8 } },
      { type: "setLoopSegment", segment: { start: 7, end: 7.02 } }
    );

    expect(state.loopSegment).toEqual({ start: 7, end: 7.1 });
  });

  it("clears loop segment", () => {
    const state = playbackReducer(
      { ...createInitialPlaybackState(), loopSegment: { start: 1, end: 2 } },
      { type: "clearLoop" }
    );

    expect(state.loopSegment).toBeNull();
  });

  it("clamps playback rate", () => {
    expect(clampPlaybackRate(0)).toBe(0.25);
    expect(clampPlaybackRate(1.37)).toBe(1.25);
    expect(clampPlaybackRate(9)).toBe(3);
  });

  it("sets play mode", () => {
    const state = playbackReducer(createInitialPlaybackState(), {
      type: "setPlayMode",
      mode: "one-shot"
    });

    expect(state.playMode).toBe("one-shot");
  });

  it("toggles enabled state", () => {
    const state = playbackReducer(createInitialPlaybackState(), {
      type: "setEnabled",
      enabled: false
    });

    expect(state.enabled).toBe(false);
  });
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test features/playback/reducer.test.ts
```

Expected: FAIL because `features/playback/reducer.ts` does not exist.

- [x] **Step 3: Implement playback types**

Create `features/playback/types.ts`:

```ts
export type PlayMode = "loop" | "one-shot";

export type LoopSegment = {
  start: number;
  end: number;
};

export type PlaybackState = {
  enabled: boolean;
  loopSegment: LoopSegment | null;
  playMode: PlayMode;
  playbackRate: number;
  oneShotCompleted: boolean;
};

export type PlaybackCommand =
  | { type: "setLoopSegment"; segment: LoopSegment }
  | { type: "clearLoop" }
  | { type: "setPlaybackRate"; rate: number }
  | { type: "resetPlaybackRate" }
  | { type: "setPlayMode"; mode: PlayMode }
  | { type: "setEnabled"; enabled: boolean }
  | { type: "markOneShotCompleted"; completed: boolean };
```

- [x] **Step 4: Implement reducer**

Create `features/playback/reducer.ts`:

```ts
import type { LoopSegment, PlaybackCommand, PlaybackState } from "./types";

export const MIN_SEGMENT_DURATION_SECONDS = 0.1;
export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 3;
export const PLAYBACK_RATE_STEP = 0.25;

export function createInitialPlaybackState(): PlaybackState {
  return {
    enabled: true,
    loopSegment: null,
    playMode: "loop",
    playbackRate: 1,
    oneShotCompleted: false
  };
}

export function clampPlaybackRate(rate: number): number {
  const stepped = Math.round(rate / PLAYBACK_RATE_STEP) * PLAYBACK_RATE_STEP;
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, stepped));
}

export function normalizeLoopSegment(segment: LoopSegment): LoopSegment {
  const start = Math.max(0, segment.start);
  const minEnd = start + MIN_SEGMENT_DURATION_SECONDS;
  const end = Math.max(minEnd, segment.end);

  return {
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3))
  };
}

export function playbackReducer(
  state: PlaybackState,
  command: PlaybackCommand
): PlaybackState {
  switch (command.type) {
    case "setLoopSegment":
      return {
        ...state,
        loopSegment: normalizeLoopSegment(command.segment),
        oneShotCompleted: false
      };
    case "clearLoop":
      return { ...state, loopSegment: null, oneShotCompleted: false };
    case "setPlaybackRate":
      return { ...state, playbackRate: clampPlaybackRate(command.rate) };
    case "resetPlaybackRate":
      return { ...state, playbackRate: 1 };
    case "setPlayMode":
      return { ...state, playMode: command.mode, oneShotCompleted: false };
    case "setEnabled":
      return { ...state, enabled: command.enabled };
    case "markOneShotCompleted":
      return { ...state, oneShotCompleted: command.completed };
  }
}
```

- [x] **Step 5: Verify reducer tests pass**

Run:

```bash
pnpm test features/playback/reducer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add features/playback
git commit -m "feat: add playback reducer"
```

## Task 3: Playback Controller

**Files:**
- Create: `features/playback/controller.ts`
- Create: `features/playback/controller.test.ts`

- [ ] **Step 1: Write failing controller tests**

Create `features/playback/controller.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { applyPlaybackState, enforceSegmentEnd, handleOneShotReplay } from "./controller";
import { createInitialPlaybackState } from "./reducer";

function video(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    currentTime: 0,
    playbackRate: 1,
    paused: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...overrides
  } as unknown as HTMLVideoElement;
}

describe("playback controller", () => {
  it("applies playback rate", () => {
    const element = video();
    applyPlaybackState(element, { ...createInitialPlaybackState(), playbackRate: 1.5 });
    expect(element.playbackRate).toBe(1.5);
  });

  it("loops from end to start", () => {
    const element = video({ currentTime: 8.01 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopSegment: { start: 5, end: 8 },
      playMode: "loop"
    });

    expect(element.currentTime).toBe(5);
    expect(result.oneShotCompleted).toBe(false);
  });

  it("pauses one-shot at segment end", () => {
    const element = video({ currentTime: 8.01 });
    const result = enforceSegmentEnd(element, {
      ...createInitialPlaybackState(),
      loopSegment: { start: 5, end: 8 },
      playMode: "one-shot"
    });

    expect(element.pause).toHaveBeenCalled();
    expect(element.currentTime).toBe(8);
    expect(result.oneShotCompleted).toBe(true);
  });

  it("replays one-shot from segment start on play request", async () => {
    const element = video({ currentTime: 8 });
    await handleOneShotReplay(element, {
      ...createInitialPlaybackState(),
      loopSegment: { start: 5, end: 8 },
      playMode: "one-shot",
      oneShotCompleted: true
    });

    expect(element.currentTime).toBe(5);
    expect(element.play).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test features/playback/controller.test.ts
```

Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement controller**

Create `features/playback/controller.ts`:

```ts
import type { PlaybackState } from "./types";

export function applyPlaybackState(video: HTMLVideoElement, state: PlaybackState): void {
  if (!state.enabled) return;
  if (video.playbackRate !== state.playbackRate) {
    video.playbackRate = state.playbackRate;
  }
}

export function enforceSegmentEnd(
  video: HTMLVideoElement,
  state: PlaybackState
): Pick<PlaybackState, "oneShotCompleted"> {
  if (!state.enabled || !state.loopSegment) {
    return { oneShotCompleted: state.oneShotCompleted };
  }

  const { start, end } = state.loopSegment;
  if (video.currentTime < end) {
    return { oneShotCompleted: state.oneShotCompleted };
  }

  if (state.playMode === "loop") {
    video.currentTime = start;
    return { oneShotCompleted: false };
  }

  video.currentTime = end;
  video.pause();
  return { oneShotCompleted: true };
}

export async function handleOneShotReplay(
  video: HTMLVideoElement,
  state: PlaybackState
): Promise<boolean> {
  if (
    !state.enabled ||
    state.playMode !== "one-shot" ||
    !state.oneShotCompleted ||
    !state.loopSegment
  ) {
    return false;
  }

  video.currentTime = state.loopSegment.start;
  await video.play();
  return true;
}
```

- [ ] **Step 4: Verify controller tests pass**

Run:

```bash
pnpm test features/playback/controller.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add features/playback/controller.ts features/playback/controller.test.ts
git commit -m "feat: add playback controller"
```

## Task 4: Typed Messaging and Background State

**Files:**
- Create: `shared/messaging/protocol.ts`
- Create: `shared/messaging/protocol.test.ts`
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Write protocol tests**

Create `shared/messaging/protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createInitialBackgroundState, reduceBackgroundState } from "./protocol";

describe("messaging protocol tab state", () => {
  it("stores per-tab playback state", () => {
    const state = reduceBackgroundState(createInitialBackgroundState(), {
      type: "stateChanged",
      state: { enabled: true, loopSegment: { start: 1, end: 2 }, playMode: "loop", playbackRate: 1, oneShotCompleted: false }
    }, 7);

    expect(state.tabs.get(7)?.loopSegment).toEqual({ start: 1, end: 2 });
  });

  it("sets global enabled", () => {
    const state = reduceBackgroundState(createInitialBackgroundState(), {
      type: "setEnabled",
      enabled: false
    });

    expect(state.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test shared/messaging/protocol.test.ts
```

Expected: FAIL because protocol does not exist.

- [ ] **Step 3: Implement protocol**

Create `shared/messaging/protocol.ts`:

```ts
import type { PlaybackCommand, PlaybackState } from "../../features/playback/types";

export type VideoIdentity = {
  url: string;
  videoId: string | null;
};

export type AdapterStatus = "ready" | "unsupported" | "missing-video" | "geometry-unavailable";

export type RuntimeMessage =
  | { type: "stateChanged"; state: PlaybackState }
  | { type: "videoChanged"; video: VideoIdentity }
  | { type: "adapterStatusChanged"; status: AdapterStatus }
  | { type: "setEnabled"; enabled: boolean }
  | { type: "getEnabled" };

export type ContentCommand = PlaybackCommand;

export type BackgroundState = {
  enabled: boolean;
  tabs: Map<number, PlaybackState>;
};

export function createInitialBackgroundState(): BackgroundState {
  return {
    enabled: true,
    tabs: new Map()
  };
}

export function reduceBackgroundState(
  state: BackgroundState,
  event: RuntimeMessage,
  senderTabId: number | null = null
): BackgroundState {
  if (event.type === "setEnabled") {
    return { ...state, enabled: event.enabled };
  }

  if (event.type === "stateChanged" && senderTabId !== null) {
    const tabs = new Map(state.tabs);
    tabs.set(senderTabId, event.state);
    return { ...state, tabs };
  }

  return state;
}
```

- [ ] **Step 4: Implement background skeleton**

Replace `entrypoints/background.ts`:

```ts
import { createInitialBackgroundState, reduceBackgroundState, type RuntimeMessage } from "../shared/messaging/protocol";

export default defineBackground(() => {
  let state = createInitialBackgroundState();

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    const senderTabId = sender.tab?.id ?? null;
    state = reduceBackgroundState(state, message, senderTabId);
    return Promise.resolve({ ok: true, enabled: state.enabled });
  });
});
```

- [ ] **Step 5: Verify tests and typecheck**

Run:

```bash
pnpm test shared/messaging/protocol.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add shared/messaging entrypoints/background.ts
git commit -m "feat: add background state protocol"
```

## Task 5: YouTube Video Player Adapter

**Files:**
- Create: `adapters/youtube/watch-page.ts`
- Create: `adapters/youtube/adapter.ts`
- Create: `adapters/youtube/adapter.test.ts`

- [ ] **Step 1: Write adapter tests**

Create `adapters/youtube/adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findYouTubeVideo, getVideoIdFromUrl, measureTimeline } from "./adapter";

describe("youtube adapter", () => {
  it("extracts watch video id", () => {
    expect(getVideoIdFromUrl("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
    expect(getVideoIdFromUrl("https://www.youtube.com/shorts/abc123")).toBeNull();
  });

  it("finds html video element", () => {
    document.body.innerHTML = `<video></video>`;
    expect(findYouTubeVideo()).toBeInstanceOf(HTMLVideoElement);
  });

  it("returns null when timeline is missing", () => {
    document.body.innerHTML = `<div></div>`;
    expect(measureTimeline()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test adapters/youtube/adapter.test.ts
```

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Implement watch-page helper**

Create `adapters/youtube/watch-page.ts`:

```ts
export function isYouTubeWatchPage(url = window.location.href): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.youtube.com" && parsed.pathname === "/watch" && parsed.searchParams.has("v");
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Implement adapter**

Create `adapters/youtube/adapter.ts`:

```ts
export type TimelineGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function getVideoIdFromUrl(url = window.location.href): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "www.youtube.com" || parsed.pathname !== "/watch") return null;
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

export function findYouTubeVideo(root: ParentNode = document): HTMLVideoElement | null {
  return root.querySelector("video");
}

export function measureTimeline(root: ParentNode = document): TimelineGeometry | null {
  const progress = root.querySelector(".ytp-progress-bar") as HTMLElement | null;
  if (!progress) return null;

  const rect = progress.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}
```

- [ ] **Step 5: Verify adapter tests**

Run:

```bash
pnpm test adapters/youtube/adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add adapters/youtube
git commit -m "feat: add youtube video adapter"
```

## Task 6: Player Overlay UI

**Files:**
- Create: `features/player-overlay/PlayerOverlay.tsx`
- Create: `features/player-overlay/TimelineHandles.tsx`
- Create: `features/player-overlay/ZoomPanel.tsx`
- Create: `features/player-overlay/overlay.css`
- Create: `features/player-overlay/PlayerOverlay.test.tsx`

- [ ] **Step 1: Write overlay interaction tests**

Create `features/player-overlay/PlayerOverlay.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayerOverlay } from "./PlayerOverlay";
import { createInitialPlaybackState } from "../playback/reducer";

describe("PlayerOverlay", () => {
  it("renders playback rate and play mode controls", () => {
    render(<PlayerOverlay duration={100} state={createInitialPlaybackState()} dispatch={vi.fn()} />);

    expect(screen.getByRole("button", { name: /loop mode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decrease speed/i })).toBeInTheDocument();
    expect(screen.getByText("1x")).toBeInTheDocument();
  });

  it("dispatches playback rate commands", async () => {
    const dispatch = vi.fn();
    render(<PlayerOverlay duration={100} state={createInitialPlaybackState()} dispatch={dispatch} />);

    await userEvent.click(screen.getByRole("button", { name: /increase speed/i }));

    expect(dispatch).toHaveBeenCalledWith({ type: "setPlaybackRate", rate: 1.25 });
  });

  it("opens zoom panel", async () => {
    render(<PlayerOverlay duration={100} state={createInitialPlaybackState()} dispatch={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /zoom/i }));

    expect(screen.getByTestId("zoom-panel")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test features/player-overlay/PlayerOverlay.test.tsx
```

Expected: FAIL because overlay does not exist.

- [ ] **Step 3: Implement overlay component**

Create `features/player-overlay/PlayerOverlay.tsx`:

```tsx
import { useState } from "react";
import type { PlaybackCommand, PlaybackState } from "../playback/types";
import { PLAYBACK_RATE_STEP } from "../playback/reducer";
import { TimelineHandles } from "./TimelineHandles";
import { ZoomPanel } from "./ZoomPanel";
import "./overlay.css";

type Props = {
  duration: number;
  state: PlaybackState;
  dispatch: (command: PlaybackCommand) => void;
};

export function PlayerOverlay({ duration, state, dispatch }: Props) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const nextRate = Number((state.playbackRate + PLAYBACK_RATE_STEP).toFixed(2));
  const previousRate = Number((state.playbackRate - PLAYBACK_RATE_STEP).toFixed(2));

  return (
    <div className="you-loop-overlay" aria-label="You Loop controls">
      {zoomOpen && (
        <ZoomPanel
          duration={duration}
          segment={state.loopSegment}
          onSegmentChange={(segment) => dispatch({ type: "setLoopSegment", segment })}
        />
      )}
      <TimelineHandles
        duration={duration}
        segment={state.loopSegment}
        onSegmentChange={(segment) => dispatch({ type: "setLoopSegment", segment })}
      />
      <div className="you-loop-controls">
        <button
          aria-label={`${state.playMode === "loop" ? "Loop" : "One-shot"} mode`}
          onClick={() =>
            dispatch({ type: "setPlayMode", mode: state.playMode === "loop" ? "one-shot" : "loop" })
          }
        >
          {state.playMode === "loop" ? "Loop" : "One-shot"}
        </button>
        <button aria-label="Zoom" onClick={() => setZoomOpen((open) => !open)}>
          Zoom
        </button>
        <button aria-label="Decrease speed" onClick={() => dispatch({ type: "setPlaybackRate", rate: previousRate })}>
          -
        </button>
        <button aria-label="Reset speed" onClick={() => dispatch({ type: "resetPlaybackRate" })}>
          {state.playbackRate}x
        </button>
        <button aria-label="Increase speed" onClick={() => dispatch({ type: "setPlaybackRate", rate: nextRate })}>
          +
        </button>
        <button aria-label="Clear loop" onClick={() => dispatch({ type: "clearLoop" })}>
          Clear
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement timeline and zoom components**

Create `features/player-overlay/TimelineHandles.tsx`:

```tsx
import type { LoopSegment } from "../playback/types";

type Props = {
  duration: number;
  segment: LoopSegment | null;
  onSegmentChange: (segment: LoopSegment) => void;
};

export function TimelineHandles({ duration, segment, onSegmentChange }: Props) {
  const safeDuration = Math.max(duration, 1);
  const current = segment ?? { start: safeDuration * 0.25, end: safeDuration * 0.5 };
  const startPercent = (current.start / safeDuration) * 100;
  const endPercent = (current.end / safeDuration) * 100;

  return (
    <div className="you-loop-timeline" data-testid="timeline-handles">
      <input
        aria-label="Loop start"
        type="range"
        min={0}
        max={safeDuration}
        step={0.1}
        value={current.start}
        onChange={(event) => onSegmentChange({ start: Number(event.currentTarget.value), end: current.end })}
      />
      <input
        aria-label="Loop end"
        type="range"
        min={0}
        max={safeDuration}
        step={0.1}
        value={current.end}
        onChange={(event) => onSegmentChange({ start: current.start, end: Number(event.currentTarget.value) })}
      />
      <div className="you-loop-selected-range" style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }} />
    </div>
  );
}
```

Create `features/player-overlay/ZoomPanel.tsx`:

```tsx
import type { LoopSegment } from "../playback/types";
import { TimelineHandles } from "./TimelineHandles";

type Props = {
  duration: number;
  segment: LoopSegment | null;
  onSegmentChange: (segment: LoopSegment) => void;
};

export function ZoomPanel({ duration, segment, onSegmentChange }: Props) {
  return (
    <div className="you-loop-zoom-panel" data-testid="zoom-panel">
      <div className="you-loop-waveform" aria-hidden="true">
        {Array.from({ length: 48 }, (_, index) => (
          <span key={index} style={{ height: `${20 + ((index * 17) % 55)}%` }} />
        ))}
      </div>
      <TimelineHandles duration={duration} segment={segment} onSegmentChange={onSegmentChange} />
    </div>
  );
}
```

- [ ] **Step 5: Implement overlay CSS**

Create `features/player-overlay/overlay.css`:

```css
.you-loop-overlay {
  position: absolute;
  left: 50%;
  top: 54%;
  z-index: 2147483647;
  width: min(720px, calc(100% - 48px));
  transform: translate(-50%, -50%);
  color: #1d1730;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  pointer-events: auto;
}

.you-loop-controls,
.you-loop-zoom-panel {
  border: 1px solid rgba(45, 37, 74, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.26);
}

.you-loop-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 10px;
}

.you-loop-controls button {
  min-width: 36px;
  height: 32px;
  border: 0;
  border-radius: 6px;
  background: #f1eef8;
  color: #2f2351;
  font: inherit;
}

.you-loop-timeline {
  position: relative;
  height: 24px;
  margin: 0 8px 8px;
}

.you-loop-timeline input {
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  background: transparent;
  pointer-events: auto;
}

.you-loop-selected-range {
  position: absolute;
  top: 9px;
  height: 6px;
  border-radius: 999px;
  background: #6f43c0;
  pointer-events: none;
}

.you-loop-zoom-panel {
  margin-bottom: 12px;
  padding: 12px;
}

.you-loop-waveform {
  display: flex;
  align-items: center;
  height: 76px;
  gap: 3px;
}

.you-loop-waveform span {
  flex: 1;
  border-radius: 999px;
  background: #6f43c0;
}
```

- [ ] **Step 6: Verify overlay tests**

Run:

```bash
pnpm test features/player-overlay/PlayerOverlay.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add features/player-overlay
git commit -m "feat: add player overlay ui"
```

## Task 7: Content Script Mount and Playback Wiring

**Files:**
- Create: `features/player-overlay/mount.tsx`
- Modify: `entrypoints/content.tsx`

- [ ] **Step 1: Implement mount helper**

Create `features/player-overlay/mount.tsx`:

```tsx
import { createRoot, type Root } from "react-dom/client";
import type { PlaybackCommand, PlaybackState } from "../playback/types";
import { PlayerOverlay } from "./PlayerOverlay";

export type OverlayMount = {
  render: (state: PlaybackState, duration: number, dispatch: (command: PlaybackCommand) => void) => void;
  unmount: () => void;
};

export function mountOverlay(host: HTMLElement): OverlayMount {
  const container = document.createElement("div");
  container.className = "you-loop-root";
  host.append(container);
  const root: Root = createRoot(container);

  return {
    render(state, duration, dispatch) {
      root.render(<PlayerOverlay state={state} duration={duration} dispatch={dispatch} />);
    },
    unmount() {
      root.unmount();
      container.remove();
    }
  };
}
```

- [ ] **Step 2: Wire content script**

Replace `entrypoints/content.tsx`:

```tsx
import { findYouTubeVideo, getVideoIdFromUrl } from "../adapters/youtube/adapter";
import { isYouTubeWatchPage } from "../adapters/youtube/watch-page";
import { applyPlaybackState, enforceSegmentEnd, handleOneShotReplay } from "../features/playback/controller";
import { createInitialPlaybackState, playbackReducer } from "../features/playback/reducer";
import type { PlaybackCommand, PlaybackState } from "../features/playback/types";
import { mountOverlay, type OverlayMount } from "../features/player-overlay/mount";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  main() {
    let state: PlaybackState = createInitialPlaybackState();
    let mount: OverlayMount | null = null;
    let activeVideoId: string | null = null;

    function dispatch(command: PlaybackCommand) {
      state = playbackReducer(state, command);
      render();
      browser.runtime.sendMessage({ type: "stateChanged", state }).catch(() => undefined);
    }

    function render() {
      const video = findYouTubeVideo();
      if (!video || !isYouTubeWatchPage() || !state.enabled) {
        mount?.unmount();
        mount = null;
        return;
      }

      const player = video.closest(".html5-video-player") as HTMLElement | null;
      if (!player) return;

      if (!mount) mount = mountOverlay(player);
      mount.render(state, video.duration || 1, dispatch);
      applyPlaybackState(video, state);
    }

    function tick() {
      const video = findYouTubeVideo();
      const videoId = getVideoIdFromUrl();
      if (videoId !== activeVideoId) {
        activeVideoId = videoId;
        state = createInitialPlaybackState();
      }

      if (video) {
        const result = enforceSegmentEnd(video, state);
        if (result.oneShotCompleted !== state.oneShotCompleted) {
          state = playbackReducer(state, {
            type: "markOneShotCompleted",
            completed: result.oneShotCompleted
          });
        }
      }

      render();
      window.setTimeout(tick, 250);
    }

    window.addEventListener(
      "keydown",
      (event) => {
        if (event.code !== "Space") return;
        const video = findYouTubeVideo();
        if (!video) return;
        handleOneShotReplay(video, state).catch(() => undefined);
      },
      true
    );

    window.addEventListener(
      "click",
      () => {
        const video = findYouTubeVideo();
        if (!video) return;
        handleOneShotReplay(video, state).catch(() => undefined);
      },
      true
    );

    browser.runtime.onMessage.addListener((message) => {
      if (message?.type === "setEnabled" && typeof message.enabled === "boolean") {
        dispatch({ type: "setEnabled", enabled: message.enabled });
      }
      return Promise.resolve({ ok: true });
    });

    browser.storage.local.get("enabled").then((result) => {
      if (typeof result.enabled === "boolean") {
        dispatch({ type: "setEnabled", enabled: result.enabled });
      }
    });

    tick();
  }
});
```

- [ ] **Step 3: Run checks**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add entrypoints/content.tsx features/player-overlay/mount.tsx
git commit -m "feat: mount overlay on youtube"
```

## Task 8: Toolbar Popup Enable Toggle

**Files:**
- Modify: `entrypoints/popup/App.tsx`
- Modify: `entrypoints/popup/index.html`
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Implement popup UI**

Replace `entrypoints/popup/App.tsx`:

```tsx
import { useEffect, useState } from "react";

export default function App() {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    browser.storage.local.get("enabled").then((result) => {
      if (typeof result.enabled === "boolean") setEnabledState(result.enabled);
    });
  }, []);

  async function setEnabled(nextEnabled: boolean) {
    setEnabledState(nextEnabled);
    await browser.storage.local.set({ enabled: nextEnabled });
    await browser.runtime.sendMessage({ type: "setEnabled", enabled: nextEnabled });

    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await browser.tabs.sendMessage(activeTab.id, { type: "setEnabled", enabled: nextEnabled }).catch(() => undefined);
    }
  }

  return (
    <main style={{ width: 260, padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 18 }}>You Loop</h1>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span>Enabled on YouTube</span>
        <input
          aria-label="Enabled on YouTube"
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
      </label>
    </main>
  );
}
```

- [ ] **Step 2: Ensure popup HTML mounts app**

Set `entrypoints/popup/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>You Loop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

If scaffold created `entrypoints/popup/main.tsx`, keep it as WXT generated. If missing, create:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Load enabled state in background**

Update `entrypoints/background.ts`:

```ts
import { createInitialBackgroundState, reduceBackgroundState, type RuntimeMessage } from "../shared/messaging/protocol";

export default defineBackground(() => {
  let state = createInitialBackgroundState();

  browser.storage.local.get("enabled").then((result) => {
    if (typeof result.enabled === "boolean") {
      state = reduceBackgroundState(state, { type: "setEnabled", enabled: result.enabled });
    }
  });

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    const senderTabId = sender.tab?.id ?? null;
    state = reduceBackgroundState(state, message, senderTabId);
    return Promise.resolve({ ok: true, enabled: state.enabled });
  });
});
```

- [ ] **Step 4: Run checks**

Run:

```bash
pnpm typecheck
pnpm build
pnpm build:firefox
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add entrypoints/popup entrypoints/background.ts
git commit -m "feat: add toolbar enable toggle"
```

## Task 9: Manual Browser Verification

**Files:**
- Modify only if verification finds defects.

- [ ] **Step 1: Build Chrome and Firefox targets**

Run:

```bash
pnpm build
pnpm build:firefox
```

Expected: `.output/chrome-mv3` and `.output/firefox-mv3` exist.

- [ ] **Step 2: Run Chrome dev target**

Run:

```bash
pnpm dev
```

Expected: WXT opens or prepares Chrome extension dev session.

- [ ] **Step 3: Verify YouTube watch page behavior in Chrome**

Manual checklist:

- open `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- overlay appears centered over video
- loop handles appear aligned to YouTube timeline
- dragging handles updates segment
- zoom opens panel above controls
- zoom handles edit same segment as timeline handles
- loop mode seeks from B to A
- one-shot pauses at B
- pressing spacebar or play after one-shot pause seeks to A and plays
- speed controls clamp from 0.25x to 3.0x
- toolbar popup disables overlay
- toolbar popup re-enables overlay
- navigating to another watch video resets state

- [ ] **Step 4: Verify Firefox target**

Run:

```bash
pnpm dev:firefox
```

Repeat same manual checklist in Firefox.

- [ ] **Step 5: Commit verification fixes**

If fixes were required, run:

```bash
git add .
git commit -m "fix: resolve manual verification issues"
```

## Self-Review Checklist

- Spec coverage:
  - WXT React TypeScript scaffold: Task 1.
  - Chrome MV3 and Firefox MV3 builds: Tasks 1 and 9.
  - YouTube watch pages only: Tasks 5 and 7.
  - Centered Player Overlay: Task 6.
  - YouTube-aligned Loop Handles with extension-owned state: Tasks 5, 6, and 7.
  - Zoom Panel with Waveform Track and fine handles: Task 6.
  - Loop and one-shot behavior, including replay from start on play/space: Tasks 3 and 7.
  - Playback Rate clamp and reset: Tasks 2, 3, and 6.
  - Toolbar Popup enable/disable: Tasks 4, 8, and 9.
  - Session-only state and SPA reset: Tasks 7 and 9.
  - Automated and manual tests: Tasks 2, 3, 4, 5, 6, and 9.
- Placeholder scan: clean; no deferred implementation markers remain.
- Type consistency: `PlaybackState`, `PlaybackCommand`, `LoopSegment`, and `PlayMode` names match across tasks.
