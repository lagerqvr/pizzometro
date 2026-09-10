import { DEFAULT_SETTINGS, type Settings } from "./types";

const KEY = "pizzometro:settings";

/** Tolerates partial/old/corrupt stored settings — never throws. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const corner = parsed.stampCorner;
    return {
      stampCorner:
        corner === "tl" || corner === "tr" || corner === "bl" || corner === "br"
          ? corner
          : DEFAULT_SETTINGS.stampCorner,
      cameraGuides:
        typeof parsed.cameraGuides === "boolean"
          ? parsed.cameraGuides
          : DEFAULT_SETTINGS.cameraGuides,
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
