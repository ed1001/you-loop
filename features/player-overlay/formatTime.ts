// mm:ss, or h:mm:ss past an hour.
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// formatTime plus tenths (m:ss.d) — for the zoom strip, where whole seconds
// are too coarse to be worth reading.
export function formatTimePrecise(seconds: number): string {
  const tenths = Math.floor((Math.max(0, seconds) % 1) * 10);
  return `${formatTime(seconds)}.${tenths}`;
}
