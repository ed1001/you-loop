/**
 * The étude wordmark text with the teal acute accent: a second é, clipped to
 * just the accent via .you-loop-eacute-acc, sits on top of the white one.
 * Matches the website header treatment.
 */
export function EtudeWordmark() {
  return (
    <>
      <span className="you-loop-eacute" aria-hidden="true">
        é<span className="you-loop-eacute-acc">é</span>
      </span>
      tude
    </>
  );
}
