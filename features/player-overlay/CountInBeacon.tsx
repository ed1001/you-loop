// The on-timeline count-off visual: a beat numeral in a glass disc over a
// vertical line, pulsing once per beat at the point playback will resume from.
// Rendered by whichever timeline is active (the main bar, or the zoom strip
// while magnified) — the host supplies the horizontal position.

// A count-in beat to visualize. `session` distinguishes counts so a restarted
// count replays the beat-0 pulse (the beacon is keyed on session+beat).
export type CountInBeat = {
  timeSec: number;
  beatIndex: number;
  beatsPerBar: number;
  session: number;
};

export function CountInBeacon({
  beat,
  leftPercent
}: {
  beat: CountInBeat;
  leftPercent: number;
}) {
  return (
    <div
      // Keyed per count session (not per beat): the disc appears once per
      // count and stays steady while the numeral swaps — only the line pulses
      // per beat (its own key below).
      key={beat.session}
      className="you-loop-countin-beacon"
      data-testid="countin-beacon"
      data-accent={beat.beatIndex % beat.beatsPerBar === 0 ? "true" : undefined}
      style={{ left: `${leftPercent}%` }}
    >
      <span className="you-loop-countin-beacon-num">
        {(beat.beatIndex % beat.beatsPerBar) + 1}
      </span>
      <span
        // Remount per beat so the flash replays on every tick.
        key={`${beat.session}-${beat.beatIndex}`}
        className="you-loop-countin-beacon-line"
      />
    </div>
  );
}
