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

// Titles are labels, not content: cap what we persist so storage stays lean
// and rows never carry a runaway string (the UI ellipsizes the rest).
const MAX_TITLE_LENGTH = 100;

// The current watch page's video title, best-effort. Prefers the watch
// metadata heading (the exact title of the playing video), then the og:title
// meta, then the document title with YouTube's " - YouTube" suffix stripped.
// Returns null when nothing usable is found (e.g. before metadata renders).
export function getVideoTitle(root: ParentNode = document): string | null {
  const raw = readRawTitle(root);
  if (raw == null) return null;
  return raw.length > MAX_TITLE_LENGTH
    ? raw.slice(0, MAX_TITLE_LENGTH).trimEnd()
    : raw;
}

function readRawTitle(root: ParentNode): string | null {
  const heading = root.querySelector(
    "ytd-watch-metadata h1, h1.ytd-watch-metadata"
  );
  const headingText = heading?.textContent?.trim();
  if (headingText) return headingText;

  const meta = root.querySelector(
    'meta[property="og:title"]'
  ) as HTMLMetaElement | null;
  if (meta?.content?.trim()) return meta.content.trim();

  const docTitle =
    typeof document !== "undefined" ? document.title : undefined;
  const stripped = docTitle?.replace(/\s*-\s*YouTube\s*$/, "").trim();
  return stripped ? stripped : null;
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
