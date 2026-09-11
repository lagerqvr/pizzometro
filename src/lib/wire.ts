import { versionOf } from "./merge";
import type { Entry, EntryKind, Place, Rater } from "./types";

/**
 * What crosses the wire between two phones and the blob store.
 *
 * Entries are written under an immutable path that carries their version:
 * nothing is ever overwritten, so a reader can trust a cached copy forever
 * and never sees a half-updated entry. Old versions are tiny and rare (an
 * entry is written once and deleted at most once), so they are left alone.
 */
/*
 * Ids go straight into a storage path, so the dot is not allowed anywhere:
 * without it there is no `..` to climb out with. The colon is, because photo
 * keys are shaped `photo:<uuid>`.
 */
const SAFE_ID = /^[A-Za-z0-9_:-]{1,64}$/;
const KINDS: EntryKind[] = ["pizzeria", "homemade", "other"];

/** One push carries a whole trip at most; anything larger is a bug. */
export const MAX_PUSH = 500;

export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

export function entryPath(code: string, entry: Entry): string {
  return `trips/${code}/entries/${entry.id}/${versionOf(entry)}.json`;
}

export function photoPath(code: string, photoId: string): string {
  return `trips/${code}/photos/${photoId}`;
}

/**
 * Who is on the trip, one small record each. Without this the only people a
 * trip knows about are the ones who have already rated something — so
 * whoever just joined is invisible until they do.
 */
export function memberPath(code: string, raterId: string): string {
  return `trips/${code}/members/${raterId}.json`;
}

/** The inverse of `entryPath`, for reading the store back. */
export function parseEntryPath(
  pathname: string,
): { id: string; version: number } | null {
  const match = /entries\/([^/]+)\/(\d+)\.json$/.exec(pathname);
  if (!match) return null;
  return { id: match[1], version: Number(match[2]) };
}

/**
 * Of every version of every entry in the store, the newest of each — the
 * only ones a client needs to see.
 */
export function newestVersions<T extends { pathname: string }>(blobs: T[]): T[] {
  const best = new Map<string, { version: number; blob: T }>();
  for (const blob of blobs) {
    const parsed = parseEntryPath(blob.pathname);
    if (!parsed) continue;
    const current = best.get(parsed.id);
    if (!current || parsed.version > current.version) {
      best.set(parsed.id, { version: parsed.version, blob });
    }
  }
  return [...best.values()].map((found) => found.blob);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

function time(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

function place(value: unknown): Place | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const name = text(raw.name, 120);
  const id = text(raw.id, 120);
  if (!name || !id) return undefined;
  return {
    id,
    name,
    address: text(raw.address, 200),
    lat: typeof raw.lat === "number" ? raw.lat : undefined,
    lon: typeof raw.lon === "number" ? raw.lon : undefined,
  };
}

export function sanitiseRater(value: unknown): Rater | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64);
  const name = text(raw.name, 24);
  return id && name ? { id, name } : undefined;
}

/**
 * A photo URL arrives from another device and is fetched by this one, so it
 * is only ever allowed to point back at the blob store.
 */
function photoUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    const ok =
      url.protocol === "https:" &&
      url.hostname.endsWith(".blob.vercel-storage.com");
    return ok ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Rebuilds an entry field by field from untrusted JSON. Anything unexpected
 * is dropped rather than rejected: one malformed field must not cost the
 * trip a rating.
 */
export function sanitiseEntry(input: unknown): Entry | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (!isSafeId(raw.id)) return null;

  const createdAt = time(raw.createdAt);
  const rating = typeof raw.rating === "number" ? raw.rating : NaN;
  if (!createdAt || !Number.isFinite(rating)) return null;

  const kind = KINDS.includes(raw.kind as EntryKind)
    ? (raw.kind as EntryKind)
    : "pizzeria";

  return {
    id: raw.id,
    kind,
    name: text(raw.name, 120) ?? "Pizza",
    style: text(raw.style, 60),
    rating: Math.min(10, Math.max(0, Math.round(rating * 10) / 10)),
    place: place(raw.place),
    note: text(raw.note, 400),
    createdAt,
    photoId: isSafeId(raw.photoId) ? raw.photoId : undefined,
    photoUrl: photoUrl(raw.photoUrl),
    thumbUrl: photoUrl(raw.thumbUrl),
    rater: sanitiseRater(raw.rater),
    updatedAt: time(raw.updatedAt),
    deleted: raw.deleted === true ? true : undefined,
  };
}
