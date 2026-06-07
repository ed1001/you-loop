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
