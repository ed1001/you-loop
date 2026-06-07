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
