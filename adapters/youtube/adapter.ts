export type TimelineGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function getVideoIdFromUrl(url = window.location.href): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "www.youtube.com" || parsed.pathname !== "/watch") {
      return null;
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

export function findYouTubeVideo(
  root: ParentNode = document
): HTMLVideoElement | null {
  return root.querySelector("video");
}

export function measureTimeline(
  root: ParentNode = document
): TimelineGeometry | null {
  const progress = root.querySelector(".ytp-progress-bar") as HTMLElement | null;
  if (!progress) return null;

  const rect = progress.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}
