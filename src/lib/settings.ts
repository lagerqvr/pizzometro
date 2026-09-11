import { DEFAULT_SETTINGS, type Settings } from "./types";

const KEY = "pizzometro:settings";

/** Tolerates partial/old/corrupt stored settings — never throws. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const corner = parsed.stampCorner;
    const size = parsed.stampSize;
    return {
      stampSize:
        size === "s" || size === "m" || size === "l"
          ? size
          : DEFAULT_SETTINGS.stampSize,
      stampCorner:
        corner === "tl" || corner === "tr" || corner === "bl" || corner === "br"
          ? corner
          : DEFAULT_SETTINGS.stampCorner,
      cameraGuides:
        typeof parsed.cameraGuides === "boolean"
          ? parsed.cameraGuides
          : DEFAULT_SETTINGS.cameraGuides,
      systemCamera:
        typeof parsed.systemCamera === "boolean"
          ? parsed.systemCamera
          : DEFAULT_SETTINGS.systemCamera,
      mirrorCamera:
        typeof parsed.mirrorCamera === "boolean"
          ? parsed.mirrorCamera
          : DEFAULT_SETTINGS.mirrorCamera,
      squareCrop:
        typeof parsed.squareCrop === "boolean"
          ? parsed.squareCrop
          : DEFAULT_SETTINGS.squareCrop,
      photoQuality:
        parsed.photoQuality === "balanced" || parsed.photoQuality === "full"
          ? parsed.photoQuality
          : DEFAULT_SETTINGS.photoQuality,
      showMap:
        typeof parsed.showMap === "boolean"
          ? parsed.showMap
          : DEFAULT_SETTINGS.showMap,
      stamp: { ...DEFAULT_SETTINGS.stamp, ...(parsed.stamp ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function loadSettings(): Settings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  return parseSettings(localStorage.getItem(KEY));
}

export function saveSettings(settings: Settings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(settings));
}
