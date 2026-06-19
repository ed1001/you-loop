export type Meter = { beatsPerBar: number; noteValue: number };
export type CountOffConfig = { meter: Meter; bars: number; bpm: number };
export type BeatRole = "accent" | "click" | "staccato" | "sustain" | "rest";
export type ScheduledBeat = {
  index: number;
  timeSec: number;
  role: BeatRole;
  freqHz: number;
  durSec: number;
};
export type CountOffPlan = { beats: ScheduledBeat[]; totalSec: number };

export const ACCENT_HZ = 1500;
export const CLICK_HZ = 1200;
export const SUSTAIN_HZ = 760;

// Earlier bars are a plain metronome (accent on 1). The final bar ends with the
// entrance cue: staccato beats, the second-to-last beat sustained through its
// beat, the last beat a rest — then the downbeat is the loop start.
export function roleAt(
  bar: number,
  beat: number,
  bars: number,
  beatsPerBar: number
): BeatRole {
  const isFinalBar = bar === bars - 1;
  if (!isFinalBar) return beat === 0 ? "accent" : "click";
  if (beat === beatsPerBar - 1) return "rest";
  if (beat === beatsPerBar - 2) return "sustain";
  return "staccato";
}

function freqFor(role: BeatRole): number {
  switch (role) {
    case "accent":
      return ACCENT_HZ;
    case "sustain":
      return SUSTAIN_HZ;
    case "rest":
      return 0;
    default:
      return CLICK_HZ;
  }
}

export function buildCountOff(config: CountOffConfig): CountOffPlan {
  const { meter, bars, bpm } = config;
  const beatSec = 60 / bpm;
  const staccatoDur = Math.min(0.1, beatSec * 0.28);
  const beats: ScheduledBeat[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < meter.beatsPerBar; beat++) {
      const role = roleAt(bar, beat, bars, meter.beatsPerBar);
      const index = bar * meter.beatsPerBar + beat;
      const durSec =
        role === "rest" ? 0 : role === "sustain" ? beatSec : staccatoDur;
      beats.push({
        index,
        timeSec: index * beatSec,
        role,
        freqHz: freqFor(role),
        durSec
      });
    }
  }
  return { beats, totalSec: bars * meter.beatsPerBar * beatSec };
}
