import type {
  PlaybackCommand,
  PlaybackState
} from "../../features/playback/types";

export type VideoIdentity = {
  url: string;
  videoId: string | null;
};

export type AdapterStatus =
  | "ready"
  | "unsupported"
  | "missing-video"
  | "geometry-unavailable";

export type RuntimeMessage =
  | { type: "stateChanged"; state: PlaybackState }
  | { type: "videoChanged"; video: VideoIdentity }
  | { type: "adapterStatusChanged"; status: AdapterStatus };

export type ContentCommand = PlaybackCommand;

export type BackgroundState = {
  tabs: Map<number, PlaybackState>;
};

export function createInitialBackgroundState(): BackgroundState {
  return {
    tabs: new Map()
  };
}

export function reduceBackgroundState(
  state: BackgroundState,
  event: RuntimeMessage,
  senderTabId: number | null = null
): BackgroundState {
  if (event.type === "stateChanged" && senderTabId !== null) {
    const tabs = new Map(state.tabs);
    tabs.set(senderTabId, event.state);
    return { ...state, tabs };
  }

  return state;
}
