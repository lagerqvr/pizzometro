import type { Entry, Rater } from "./types";

/**
 * Merge rules for the shared log. Deliberately dull: every entry belongs to
 * one person, so two devices almost never touch the same entry, and when
 * they do the later edit wins. Kept pure so it can be tested without a
 * network or a database.
 */

/** Older entries predate `updatedAt`; their creation time is their version. */
export function versionOf(entry: Entry): number {
  return entry.updatedAt ?? entry.createdAt;
}

/**
 * Last write wins, except that a delete beats a same-millisecond edit — the
 * alternative is an entry that quietly comes back on the next pull.
 */
function later(a: Entry, b: Entry): Entry {
  const va = versionOf(a);
  const vb = versionOf(b);
  if (va !== vb) return va > vb ? a : b;
  if (a.deleted !== b.deleted) return a.deleted ? a : b;
  // Same version means the same write. Keeping the copy already held means a
  // pull that re-delivers it — the server allows a few seconds of clock slack
  // — writes nothing and wakes no screen.
  return a;
}

/**
 * Where a photo lives is not an edit.
 *
 * A rating is published the moment it is made, but its photo may take several
 * more attempts to get up — so the same version of the same rating exists as
 * "no picture yet" on one phone and "picture, and here it is" on another.
 * Last-write-wins cannot tell those apart, because they are the same write:
 * the tie keeps whichever copy was already held, and a phone that pulled the
 * rating before the photo landed would keep the blank one for good.
 *
 * So a tie takes the addresses instead of choosing between them. Returns null
 * when there is nothing to learn, which is the ordinary case.
 */
function learnPhotoUrls(mine: Entry, theirs: Entry): Entry | null {
  // A deleted entry has had its photo removed on purpose.
  if (mine.deleted || theirs.deleted) return null;
  const photoUrl = mine.photoUrl ?? theirs.photoUrl;
  const thumbUrl = mine.thumbUrl ?? theirs.thumbUrl;
  if (photoUrl === mine.photoUrl && thumbUrl === mine.thumbUrl) return null;
  return { ...mine, photoUrl, thumbUrl };
}

/**
 * The remote entries that should replace what is stored locally — the only
 * ones worth writing back to IndexedDB after a pull.
 */
export function changesFrom(local: Entry[], remote: Entry[]): Entry[] {
  const byId = new Map(local.map((entry) => [entry.id, entry]));
  const changed: Entry[] = [];
  for (const entry of remote) {
    const mine = byId.get(entry.id);
    if (!mine || later(mine, entry) === entry) {
      changed.push(entry);
      continue;
    }
    const learned = learnPhotoUrls(mine, entry);
    if (learned) changed.push(learned);
  }
  return changed;
}

export function mergeEntries(local: Entry[], remote: Entry[]): Entry[] {
  const byId = new Map(local.map((entry) => [entry.id, entry]));
  for (const entry of changesFrom(local, remote)) byId.set(entry.id, entry);
  return [...byId.values()];
}

/** Entries changed since the last successful push, tombstones included. */
export function pendingPush(entries: Entry[], pushedAt: number): Entry[] {
  return entries.filter((entry) => versionOf(entry) > pushedAt);
}

/**
 * Takes an entry into a trip: an unclaimed one becomes yours, and one that
 * is already yours is bumped to now.
 *
 * The bump is what makes rejoining safe. Leaving withdraws your ratings by
 * leaving a tombstone in the trip; without a fresher version, that tombstone
 * would win on the way back in and delete your own copies.
 */
export function claim(entry: Entry, rater: Rater, now: number): Entry {
  if (entry.rater && entry.rater.id !== rater.id) return entry;
  return {
    ...entry,
    rater,
    updatedAt: now,
    // The photo went with the withdrawal, so it has to go up again.
    photoUrl: undefined,
  };
}

export function isMine(entry: Entry, rater?: Rater): boolean {
  // With no trip there is only one person, so everything is theirs.
  if (!rater) return true;
  return !entry.rater || entry.rater.id === rater.id;
}

/** Tombstones are storage plumbing; no screen ever shows one. */
export function visible(entries: Entry[]): Entry[] {
  return entries.filter((entry) => !entry.deleted);
}

/** Everyone who has rated something, in the order they first appear. */
export function ratersOf(entries: Entry[]): Rater[] {
  const seen = new Map<string, Rater>();
  for (const entry of entries) {
    if (entry.rater && !seen.has(entry.rater.id)) {
      seen.set(entry.rater.id, entry.rater);
    }
  }
  return [...seen.values()];
}

/** `null` means the combined board. */
export function byRater(entries: Entry[], raterId: string | null): Entry[] {
  if (raterId === null) return entries;
  return entries.filter((entry) => entry.rater?.id === raterId);
}

/**
 * Leaving a trip keeps what you made and lets go of what you were only
 * holding because you were on it. Those ratings stay in the trip itself, so
 * rejoining with the same code brings them back — which is why this must be
 * a plain local delete and never a tombstone.
 */
export function othersRatings(entries: Entry[], me: Rater): Entry[] {
  return entries.filter((entry) => entry.rater && entry.rater.id !== me.id);
}
