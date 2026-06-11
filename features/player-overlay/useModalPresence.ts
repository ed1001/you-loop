import { useEffect, useState } from "react";

// Keep a modal mounted briefly after `open` flips false so it can play an exit
// animation before unmounting. Returns whether to render and whether the exit
// animation should be applied (`data-closing`).
export function useModalPresence(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setClosing(false);
      setMounted(true);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted, closing };
}
