"use client";

import {
  CARD_PAD,
  CARD_SIZE,
  STAMP_TYPE,
  buildStamp,
  coverRect,
  stampLayout,
  stampLines,
} from "./compose";
import type { Entry, Settings } from "./types";

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
  size: number,
): void {
  const { x, align, isTop } = stampLayout(settings.stampCorner);
  const step = Math.round(STAMP_TYPE * 1.42);

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.font = `400 ${STAMP_TYPE}px ${mono()}`;
  ctx.fillStyle = "#FFFFFF";

  // Top corners hang the first baseline below the padding line; bottom
  // corners sit the last baseline on it.
  const first = isTop
    ? CARD_PAD + STAMP_TYPE
    : size - CARD_PAD - step * (lines.length - 1);
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
  const size = CARD_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device");

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, size, size);

  const bitmap = await loadBitmap(photo);
  const { sx, sy, sw, sh } = coverRect(
    { width: bitmap.width, height: bitmap.height },
    { width: size, height: size },
  );
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size, size);
  if ("close" in bitmap) bitmap.close();

  const lines = stampLines(buildStamp(entry, settings));
  if (lines.length > 0) drawStamp(ctx, lines, settings, size);

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
 * Downscales a camera photo before it goes into IndexedDB. Phone cameras
 * produce 4–12 MB files; 1600px is plenty for a 1080px card.
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
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.9);
  });
}
