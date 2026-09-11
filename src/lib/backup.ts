"use client";

import {
  getPhoto,
  listAllEntries,
  listEntries,
  putEntries,
  putPhoto,
  thumbKey,
} from "./db";
import { isMine } from "./merge";
import { parseSettings } from "./settings";
import { unzip, zip, type Bytes, type ZipFile } from "./zip";
import type { Entry, Rater, Settings } from "./types";

/** The archive's own manifest. */
const MANIFEST = "pizzometro.json";
const FORMAT = 1;

type Manifest = {
  app: "pizzometro";
  version: number;
  exportedAt: number;
  settings: Settings;
  entries: Entry[];
};

/**
 * Photos are filed under the rating's own id rather than the photo key, so
 * the names are plain and the archive is readable by hand.
 */
function photoName(id: string): string {
  return `photos/${id}.jpg`;
}

function thumbName(id: string): string {
  return `thumbs/${id}.jpg`;
}

async function bytesOf(blob: Blob): Promise<Bytes> {
  return new Uint8Array(await blob.arrayBuffer());
}

export function backupFileName(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `pizzometro-${stamp}.zip`;
}

/**
 * Everything this phone holds, in one file: the settings, the ratings, and
 * the photos at the size they were kept.
 *
 * Inside a trip it takes only your own ratings. The others' are theirs, they
 * are already on their phones, and carrying them in your backup would put
 * them back after they had left.
 */
export async function buildBackup(
  rater?: Rater,
  settings?: Settings,
  now = new Date(),
): Promise<{ blob: Blob; entries: number }> {
  const all = await listEntries();
  const mine = rater ? all.filter((entry) => isMine(entry, rater)) : all;

  const files: ZipFile[] = [];
  const entries: Entry[] = [];

  for (const entry of mine) {
    // The trip's copies are dropped: those URLs stop working the moment the
    // trip does, and the bytes they point at travel in here instead.
    const { photoUrl: _url, thumbUrl: _thumb, ...rest } = entry;
    void _url;
    void _thumb;

    if (entry.photoId) {
      const photo = await getPhoto(entry.photoId);
      const thumb = await getPhoto(thumbKey(entry.photoId));
      if (photo) files.push({ name: photoName(entry.id), bytes: await bytesOf(photo) });
      if (thumb) files.push({ name: thumbName(entry.id), bytes: await bytesOf(thumb) });
      entries.push(photo ? { ...rest, photoId: `photo:${entry.id}` } : { ...rest, photoId: undefined });
    } else {
      entries.push(rest);
    }
  }

  const manifest: Manifest = {
    app: "pizzometro",
    version: FORMAT,
    exportedAt: now.getTime(),
    settings: settings ?? parseSettings(null),
    entries,
  };
  files.unshift({
    name: MANIFEST,
    bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });

  return { blob: zip(files, now), entries: entries.length };
}

export type RestoreResult = {
  /** Ratings that were not here before. */
  added: number;
  /** Ratings already held, which were left exactly as they were. */
  skipped: number;
  settings: Settings;
};

/**
 * Puts a backup back. Anything already held is left alone — an id that is
 * already here is skipped whole, so importing the same file twice changes
 * nothing the second time.
 *
 * Deleted ratings count as held: their tombstone is still here, and a delete
 * should not be undone by a backup taken before it.
 */
export async function restoreBackup(
  file: Blob,
  rater?: Rater,
  now = Date.now(),
): Promise<RestoreResult> {
  const files = unzip(await file.arrayBuffer());
  const raw = files.get(MANIFEST);
  if (!raw) throw new Error("That file is not a Pizzometro backup");

  let manifest: Manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(raw)) as Manifest;
  } catch {
    throw new Error("That backup is damaged");
  }
  if (manifest.app !== "pizzometro" || !Array.isArray(manifest.entries)) {
    throw new Error("That file is not a Pizzometro backup");
  }

  const held = new Set((await listAllEntries()).map((entry) => entry.id));
  const restored: Entry[] = [];
  let skipped = 0;

  for (const entry of manifest.entries) {
    if (!entry || typeof entry.id !== "string") continue;
    if (held.has(entry.id)) {
      skipped += 1;
      continue;
    }

    const photo = files.get(photoName(entry.id));
    const thumb = files.get(thumbName(entry.id));
    const photoId = photo ? `photo:${entry.id}` : undefined;
    if (photo) {
      await putPhoto(photoId!, new Blob([photo], { type: "image/jpeg" }));
      if (thumb) {
        await putPhoto(thumbKey(photoId!), new Blob([thumb], { type: "image/jpeg" }));
      }
    }

    restored.push({
      ...entry,
      photoId,
      photoUrl: undefined,
      thumbUrl: undefined,
      // A restored rating belongs to whoever is holding the phone now, so it
      // is theirs to push. Without a trip this stays as it was.
      rater: rater ?? entry.rater,
      // Dated now, not when it was exported: the push marker has already
      // moved past the old stamp, and a rating older than that never leaves
      // this phone. When it was eaten is createdAt, which is untouched.
      updatedAt: now,
    });
  }

  await putEntries(restored);
  return {
    added: restored.length,
    skipped,
    settings: parseSettings(JSON.stringify(manifest.settings ?? {})),
  };
}

export function exportMessage(entries: number): string {
  if (entries === 0) return "Nothing to export yet";
  return `Backed up ${entries} ${entries === 1 ? "rating" : "ratings"}`;
}

export function importMessage(result: RestoreResult): string {
  if (result.added === 0 && result.skipped === 0) {
    return "That backup was empty";
  }
  if (result.added === 0) {
    return `Already up to date — all ${result.skipped} were here`;
  }
  const tail = result.skipped > 0 ? `, ${result.skipped} already here` : "";
  return `Restored ${result.added} ${result.added === 1 ? "rating" : "ratings"}${tail}`;
}
