import { formatRating } from "./score";
import type { Corner, Entry, Settings } from "./types";

/** The generated picture is a 1080² square — the safest social format. */
export const CARD_SIZE = 1080;
export const CARD_PAD = 56;
/** One type size for the whole stamp: no hierarchy, nothing to tune. */
export const STAMP_TYPE = 38;
/** Characters that fit on a stamp line at STAMP_TYPE inside the padding. */
const STAMP_CHARS = 32;

/**
 * Source rectangle that fills `dst` with `src` without distortion
 * (object-fit: cover, centred).
 */
export function coverRect(
  src: { width: number; height: number },
  dst: { width: number; height: number },
): { sx: number; sy: number; sw: number; sh: number } {
  const srcRatio = src.width / src.height;
  const dstRatio = dst.width / dst.height;
  if (srcRatio > dstRatio) {
    // Source is wider: crop the sides.
    const sw = src.height * dstRatio;
    return { sx: (src.width - sw) / 2, sy: 0, sw, sh: src.height };
  }
  const sh = src.width / dstRatio;
  return { sx: 0, sy: (src.height - sh) / 2, sw: src.width, sh };
}

export type Stamp = {
  rating?: string;
  name?: string;
  place?: string;
  date?: string;
};

export function formatStampDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/**
 * Only fields that are both enabled in settings and actually filled in end up
 * on the picture — an empty field leaves no gap.
 */
export function buildStamp(entry: Entry, settings: Settings): Stamp {
  const stamp: Stamp = {};
  if (settings.stamp.rating) stamp.rating = formatRating(entry.rating);
  if (settings.stamp.name && entry.name.trim()) {
    stamp.name = entry.name.trim();
  }
  if (settings.stamp.place && entry.place?.name) {
    stamp.place = entry.place.name;
  }
  if (settings.stamp.date) stamp.date = formatStampDate(entry.createdAt);
  return stamp;
}

export function isStampEmpty(stamp: Stamp): boolean {
  return !stamp.rating && !stamp.name && !stamp.place && !stamp.date;
}

/**
 * The stamp as plain lines, in reading order: score, where, what, when.
 * Every line is the same size on the picture, so this is the whole layout.
 */
export function stampLines(stamp: Stamp): string[] {
  const lines: string[] = [];
  if (stamp.rating) lines.push(`${stamp.rating}/10`);
  if (stamp.place) lines.push(truncate(stamp.place, STAMP_CHARS));
  if (stamp.name) lines.push(truncate(stamp.name, STAMP_CHARS));
  if (stamp.date) lines.push(stamp.date);
  return lines;
}

export type StampLayout = {
  x: number;
  y: number;
  align: "left" | "right";
  /** Top corners stack downwards; bottom corners stack upwards. */
  direction: "down" | "up";
  isTop: boolean;
};

export function stampLayout(
  corner: Corner,
  size = CARD_SIZE,
  pad = CARD_PAD,
): StampLayout {
  const isTop = corner === "tl" || corner === "tr";
  const isLeft = corner === "tl" || corner === "bl";
  return {
    x: isLeft ? pad : size - pad,
    y: isTop ? pad : size - pad,
    align: isLeft ? "left" : "right",
    direction: isTop ? "down" : "up",
    isTop,
  };
}

/** Truncate to a character budget with a single-character ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
