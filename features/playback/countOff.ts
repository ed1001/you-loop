export type Meter = { beatsPerBar: number; noteValue: number };
export type CountOffConfig = { meter: Meter; bars: number; bpm: number };
export type BeatRole = "accent" | "click";
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

// A plain pulse count: each bar's downbeat is an accent, the other beats are
// clicks. Every beat is a short pulse — no long tone, no rest. The loop starts
// on the next downbeat, one beat after the final pulse.
export function roleAt(beat: number): BeatRole {
  return beat === 0 ? "accent" : "click";
}

function freqFor(role: BeatRole): number {
  return role === "accent" ? ACCENT_HZ : CLICK_HZ;
}

export function buildCountOff(config: CountOffConfig): CountOffPlan {
  const { meter, bars, bpm } = config;
  const beatSec = 60 / bpm;
  const pulseDur = Math.min(0.1, beatSec * 0.28);
  const beats: ScheduledBeat[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < meter.beatsPerBar; beat++) {
      const role = roleAt(beat);
      const index = bar * meter.beatsPerBar + beat;
      beats.push({
        index,
        timeSec: index * beatSec,
        role,
        freqHz: freqFor(role),
        durSec: pulseDur
      });
    }
  }
  return { beats, totalSec: bars * meter.beatsPerBar * beatSec };
}
