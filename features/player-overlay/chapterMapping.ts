// Maps media time <-> horizontal position on YouTube's progress bar.
//
// On chaptered videos YouTube splits the bar into one segment per chapter,
// separated by fixed pixel gaps. Each segment's width is proportional to its
// chapter's duration *within the gap-free usable width*, so the mapping from
// time to x is piecewise-linear, not linear across the whole bar. Mapping time
// linearly (as if there were no gaps) drifts the loop band right of the native
// playhead, growing with the gaps to its left. With fewer than two segments
// there are no gaps and this collapses to a plain linear map.

export type Segment = {
  // Left/right edges of a chapter segment as fractions [0,1] of the bar width.
  startFrac: number;
  endFrac: number;
};

export type TimeMap = {
  // Media time (seconds) -> position as a percentage [0,100] of the bar width.
  timeToPercent: (time: number) => number;
  // Position percentage [0,100] of the bar width -> media time (seconds).
  percentToTime: (percent: number) => number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function buildTimeMap(segments: Segment[], duration: number): TimeMap {
  const safeDuration = Math.max(duration, 1);

  const linear: TimeMap = {
    timeToPercent: (time) => (clamp(time, 0, safeDuration) / safeDuration) * 100,
    percentToTime: (percent) => (clamp(percent, 0, 100) / 100) * safeDuration
  };

  if (segments.length < 2) {
    return linear;
  }

  // Painted (non-gap) width as a fraction of the bar. Chapter durations are
  // apportioned across this, not the full bar.
  const usable = segments.reduce((sum, s) => sum + (s.endFrac - s.startFrac), 0);
  if (usable <= 0) {
    return linear;
  }

  // Give each segment a contiguous time span proportional to its width.
  let acc = 0;
  const chapters = segments.map((s) => {
    const dur = ((s.endFrac - s.startFrac) / usable) * safeDuration;
    const timeStart = acc;
    acc += dur;
    return { ...s, dur, timeStart, timeEnd: timeStart + dur };
  });
  const first = chapters[0];
  const last = chapters[chapters.length - 1];

  return {
    timeToPercent: (time) => {
      const t = clamp(time, 0, safeDuration);
      for (const c of chapters) {
        if (t <= c.timeEnd) {
          const local = c.dur > 0 ? (t - c.timeStart) / c.dur : 0;
          return (c.startFrac + local * (c.endFrac - c.startFrac)) * 100;
        }
      }
      return last.endFrac * 100;
    },
    percentToTime: (percent) => {
      const x = clamp(percent, 0, 100) / 100;
      if (x <= first.startFrac) return 0;
      if (x >= last.endFrac) return safeDuration;
      for (let i = 0; i < chapters.length; i++) {
        const c = chapters[i];
        if (x > c.endFrac) continue;
        if (x >= c.startFrac) {
          const span = c.endFrac - c.startFrac;
          const local = span > 0 ? (x - c.startFrac) / span : 0;
          return c.timeStart + local * c.dur;
        }
        // x sits in the gap before this chapter — snap to the nearer edge.
        const prev = chapters[i - 1];
        if (prev != null && x - prev.endFrac < c.startFrac - x) {
          return prev.timeEnd;
        }
        return c.timeStart;
      }
      return safeDuration;
    }
  };
}
