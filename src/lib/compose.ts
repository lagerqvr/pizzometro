import { formatRating } from "./score";
import type { Corner, Entry, Settings, StampSize } from "./types";

/** The generated picture is a 1080² square — the safest social format. */
export const CARD_SIZE = 1080;
export const CARD_PAD = 56;
/** One type size for the whole stamp: no hierarchy, only how big. */
export const STAMP_TYPE = 38;

export const STAMP_SIZES: Record<StampSize, number> = {
  s: 30,
  m: 38,
  l: 48,
};

export function stampType(size: StampSize | undefined): number {
  return STAMP_SIZES[size ?? "m"] ?? STAMP_TYPE;
}

/**
 * How many characters fit on one line at a given size. A monospace glyph is
 * about 0.6 em wide, so bigger text simply means fewer of them — the stamp
 * never runs off the edge of the picture.
 */
export function stampChars(
  type: number,
  width = CARD_SIZE,
  pad = CARD_PAD,
): number {
  return Math.max(8, Math.floor((width - pad * 2) / (type * 0.6)));
}

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

/**
 * The shape of the saved picture: a square by choice, or the photo's own
 * proportions with the long side at CARD_SIZE.
 */
export function cardSize(
  src: { width: number; height: number },
  square: boolean,
): { width: number; height: number } {
  if (square || !src.width || !src.height) {
    return { width: CARD_SIZE, height: CARD_SIZE };
  }
  const ratio = src.width / src.height;
  return ratio >= 1
    ? { width: CARD_SIZE, height: Math.round(CARD_SIZE / ratio) }
    : { width: Math.round(CARD_SIZE * ratio), height: CARD_SIZE };
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
export function stampLines(
  stamp: Stamp,
  type = STAMP_TYPE,
  width = CARD_SIZE,
): string[] {
  const budget = stampChars(type, width);
  const lines: string[] = [];
  if (stamp.rating) lines.push(`${stamp.rating}/10`);
  if (stamp.place) lines.push(truncate(stamp.place, budget));
  if (stamp.name) lines.push(truncate(stamp.name, budget));
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
  width = CARD_SIZE,
  pad = CARD_PAD,
  height = width,
): StampLayout {
  const isTop = corner === "tl" || corner === "tr";
  const isLeft = corner === "tl" || corner === "bl";
  return {
    x: isLeft ? pad : width - pad,
    y: isTop ? pad : height - pad,
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
