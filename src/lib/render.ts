"use client";

import {
  CARD_PAD,
  CARD_SIZE,
  buildStamp,
  cardSize,
  coverRect,
  stampLayout,
  stampLines,
  stampType,
} from "./compose";
import type { Corner, Entry, PhotoQuality, Settings } from "./types";

const INK = "#212121";

function fontStack(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  return value ? `${value}, ${fallback}` : fallback;
}

const mono = () => fontStack("--font-mono", "ui-monospace, monospace");

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // Honours the EXIF orientation phones write into camera JPEGs.
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode photo"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * The stamp: plain white monospace, one size, hard against the corner — the
 * way you would type it over the photo yourself. No panel, no rules, no
 * scrim, no shadow. Nothing but the letters.
 */
function drawStamp(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  settings: Settings,
  /** This picture's own corner, if it was given one. */
  corner: Corner | undefined,
  width: number,
  height: number,
  /** 1 for a 1080px picture, more for one kept at the photo's own size. */
  scale: number,
): void {
  const pad = Math.round(CARD_PAD * scale);
  const { x, align, isTop } = stampLayout(
    corner ?? settings.stampCorner,
    width,
    pad,
    height,
  );
  const type = Math.round(stampType(settings.stampSize) * scale);
  const step = Math.round(type * 1.42);

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.font = `400 ${type}px ${mono()}`;
  ctx.fillStyle = "#FFFFFF";

  // Top corners hang the first baseline below the padding line; bottom
  // corners sit the last baseline on it.
  const first = isTop
    ? pad + type
    : height - pad - step * (lines.length - 1);
  lines.forEach((line, index) => ctx.fillText(line, x, first + index * step));
  ctx.restore();
}

/**
 * Draws the shareable picture: the photo, cover-cropped to a square, with the
 * stats stamped into the configured corner.
 */
export async function renderCard(
  photo: Blob,
  entry: Entry,
  settings: Settings,
): Promise<Blob> {
  const bitmap = await loadBitmap(photo);
  // At full quality the picture keeps the photo's own size; otherwise it is
  // the social-media 1080. Everything drawn on it scales to match.
  const longest =
    settings.photoQuality === "full"
      ? Math.min(CARD_MAX_FULL, Math.max(bitmap.width, bitmap.height))
      : CARD_SIZE;
  const { width, height } = cardSize(
    { width: bitmap.width, height: bitmap.height },
    settings.squareCrop,
    longest,
  );
  const scale = Math.max(1, Math.max(width, height) / CARD_SIZE);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device");

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, width, height);

  const { sx, sy, sw, sh } = coverRect(
    { width: bitmap.width, height: bitmap.height },
    { width, height },
  );
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  const lines = stampLines(
    buildStamp(entry, settings),
    stampType(settings.stampSize) * scale,
    width,
  );
  if (lines.length > 0)
    drawStamp(ctx, lines, settings, entry.corner, width, height, scale);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode picture")),
      "image/jpeg",
      0.92,
    );
  });
}

/**
 * The long side a photo is kept at. `full` is capped at 4096 rather than
 * uncapped: it is above any phone camera's longest side, so a full-size
 * photo passes through untouched, while an absurd input still cannot ask
 * the canvas for a gigapixel.
 */
export const PHOTO_MAX: Record<PhotoQuality, number> = {
  balanced: 1600,
  full: 4096,
};

/**
 * The longest side of the saved picture at full quality. The photo itself is
 * kept whole, but the picture has to be composited and JPEG-encoded on the
 * phone every time one is saved: 3088px is six times the pixels of the old
 * 1080 and the wait shows. 2048 is a printable size for a third of the work.
 */
export const CARD_MAX_FULL = 2048;

/**
 * The small copy the log shows. A 64px card does not need a 4 MB photo, and
 * on another phone that photo has to come down the wire first — forty
 * ratings at full quality is the difference between half a megabyte and a
 * hundred and sixty.
 */
export async function makeThumb(file: Blob, max = 360): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.7);
  });
}

/**
 * Downscales a camera photo before it goes into IndexedDB, and re-encodes
 * anything that is not already a JPEG — an iPhone hands over HEIC, which
 * only Safari can read.
 */
export async function shrinkPhoto(file: Blob, max = 1600): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.type === "image/jpeg") {
    if ("close" in bitmap) bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  return new Promise<Blob>((resolve) => {
    // A full-quality photo is the only copy there will be, so it is worth
    // a little more of the bit budget than a browsing-sized one.
    const quality = max > 1600 ? 0.95 : 0.9;
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", quality);
  });
}
