"use client";

import { deleteDatabase } from "./db";

/**
 * Everything this app has put on the phone lives under one prefix in
 * localStorage and one IndexedDB database, so taking it all off is exact
 * rather than hopeful.
 */
const PREFIX = "pizzometro:";

/** The keys the app owns, which is never all of them. */
export function ownedKeys(keys: string[]): string[] {
  return keys.filter((key) => key.startsWith(PREFIX));
}

export function clearLocalKeys(): void {
  if (typeof localStorage === "undefined") return;
  // Snapshot first: removing while iterating the live list skips entries.
  for (const key of ownedKeys(Object.keys(localStorage))) {
    localStorage.removeItem(key);
  }
}

/**
 * Wipes this phone and nothing else. A shared trip is untouched, which is
 * the point: the trip is the backup, so the same code on a new phone pulls
 * every rating back.
 */
export async function eraseDevice(): Promise<void> {
  await deleteDatabase();
  clearLocalKeys();
}
