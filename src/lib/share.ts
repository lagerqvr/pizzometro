"use client";

import type { Entry } from "./types";

export type SaveResult = "shared" | "downloaded" | "cancelled" | "failed";

export function fileNameFor(entry: Entry): string {
  const slug = entry.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const date = new Date(entry.createdAt);
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  return `pizzometro-${stamp}-${slug || "pizza"}.jpg`;
}

function download(blob: Blob, name: string): SaveResult {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}

/**
 * iOS gives no API for writing straight to the camera roll, so the share
 * sheet — where "Save Image" is the first option — is as close as the web
 * gets. Desktop and Android fall back to a plain download.
 */
export async function saveToPhotos(
  blob: Blob,
  entry: Entry,
): Promise<SaveResult> {
  const name = fileNameFor(entry);
  const file = new File([blob], name, { type: "image/jpeg" });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      // The user dismissing the sheet is not a failure.
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      return download(blob, name);
    }
  }

  try {
    return download(blob, name);
  } catch {
    return "failed";
  }
}

export function saveMessage(result: SaveResult): string {
  switch (result) {
    case "shared":
      return "Saved — pick “Save Image” to send it to your camera roll";
    case "downloaded":
      return "Picture saved to your downloads";
    case "cancelled":
      return "Not saved — tap the picture to try again";
    case "failed":
      return "Could not save the picture";
  }
}
