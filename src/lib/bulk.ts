"use client";

import { getPhoto, putPhoto } from "./db";
import { renderCard } from "./render";
import { fileNameFor } from "./share";
import type { Entry, Settings } from "./types";

/**
 * Saving the whole trip to the camera roll at once, and taking the app off
 * a phone.
 *
 * The share sheet is the only route to iOS Photos, and Safari only opens it
 * from a tap. Rendering forty cards takes far longer than a tap lasts, so
 * the work is split: build first, then hand the finished files to a second
 * tap that opens the sheet immediately.
 */

export type BulkProgress = { done: number; total: number };

/** Ratings that have a picture, oldest first — the order the trip happened. */
export function photographed(entries: Entry[]): Entry[] {
  return entries
    .filter((entry) => entry.photoId && !entry.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * The picture bytes for one rating: from this phone if they are here, and
 * otherwise from the trip — a phone that has only ever pulled the log has
 * every rating but few of the photos.
 */
export async function photoFor(entry: Entry): Promise<Blob | null> {
  if (!entry.photoId) return null;
  const local = await getPhoto(entry.photoId);
  if (local) return local;
  if (!entry.photoUrl) return null;
  try {
    const response = await fetch(entry.photoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    // Keep it, so this is the last time it costs anything.
    await putPhoto(entry.photoId, blob);
    return blob;
  } catch {
    return null;
  }
}

/**
 * Renders every rating's picture, stamped as it would be when saved one at
 * a time. A rating whose photo cannot be found is skipped rather than
 * failing the batch.
 */
export async function buildCards(
  entries: Entry[],
  settings: Settings,
  onProgress?: (progress: BulkProgress) => void,
): Promise<File[]> {
  const wanted = photographed(entries);
  const files: File[] = [];

  for (const [index, entry] of wanted.entries()) {
    onProgress?.({ done: index, total: wanted.length });
    const photo = await photoFor(entry);
    if (!photo) continue;
    try {
      const card = await renderCard(photo, entry, settings);
      files.push(
        new File([card], fileNameFor(entry), { type: "image/jpeg" }),
      );
    } catch {
      /* One unreadable photo must not cost the other thirty-nine. */
    }
  }

  onProgress?.({ done: wanted.length, total: wanted.length });
  return files;
}

export type BulkResult = "shared" | "downloaded" | "cancelled" | "failed";

/**
 * Must be called straight from a tap: everything slow has already happened
 * in `buildCards`.
 */
export async function saveAll(files: File[]): Promise<BulkResult> {
  if (files.length === 0) return "failed";

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files })
  ) {
    try {
      await navigator.share({ files });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      /* Fall through to downloading them. */
    }
  }

  try {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      // Browsers throttle a burst of downloads; a breath between them helps.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return "downloaded";
  } catch {
    return "failed";
  }
}

export function bulkMessage(result: BulkResult, count: number): string {
  switch (result) {
    case "shared":
      return `Pick “Save ${count} Images” to put them in your photos`;
    case "downloaded":
      return `${count} pictures saved to your downloads`;
    case "cancelled":
      return "Not saved — the pictures are still here";
    case "failed":
      return "Could not build the pictures";
  }
}
