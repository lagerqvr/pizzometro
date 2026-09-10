"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import * as db from "./db";
import { claim } from "./merge";
import { loadSettings, saveSettings } from "./settings";
import {
  getServerSyncState,
  getSyncState,
  refreshPending,
  subscribeEntries,
  subscribeSync,
  syncNow,
} from "./sync";
import { loadTrip, newRater, resetMark, saveTrip } from "./trip";
import { DEFAULT_SETTINGS, type Entry, type Settings, type Trip } from "./types";

export function useEntries() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    db.listEntries()
      .then(setEntries)
      .catch(() => {
        setEntries([]);
        setError("Could not open local storage");
      });
  }, []);

  useEffect(refresh, [refresh]);
  // A pull that lands while the log is open should show up in it.
  useEffect(() => subscribeEntries(refresh), [refresh]);

  return { entries, loading: entries === null, error, refresh };
}

export function useEntry(id: string) {
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);

  const refresh = useCallback(() => {
    db.getEntry(id)
      .then((found) => setEntry(found ?? null))
      .catch(() => setEntry(null));
  }, [id]);

  useEffect(refresh, [refresh]);
  useEffect(() => subscribeEntries(refresh), [refresh]);

  return { entry, loading: entry === undefined, refresh };
}

/**
 * Turns a stored photo blob into an object URL, revoking it on unmount.
 * The URL is kept next to the id it belongs to, so a switch to a different
 * photo never shows the previous one for a frame.
 *
 * A photo taken on the other phone arrives as a URL and no bytes; it is
 * fetched once and kept locally, so it is there the next time with no
 * signal.
 */
export function usePhotoUrl(entry?: Pick<Entry, "photoId" | "photoUrl">) {
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);
  const photoId = entry?.photoId;
  const photoUrl = entry?.photoUrl;

  useEffect(() => {
    if (!photoId) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      let blob = await db.getPhoto(photoId);
      if (!blob && photoUrl) {
        try {
          const response = await fetch(photoUrl);
          if (response.ok) {
            blob = await response.blob();
            await db.putPhoto(photoId, blob);
          }
        } catch {
          /* No signal: the card shows its placeholder until there is. */
        }
      }
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ id: photoId, url: objectUrl });
    };
    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId, photoUrl]);

  return loaded && loaded.id === photoId ? loaded.url : null;
}

/*
 * The trip, like the settings, is one value shared by every screen.
 */
const tripListeners = new Set<() => void>();
let tripSnapshot: Trip | null | undefined;

function subscribeTrip(listener: () => void) {
  tripListeners.add(listener);
  return () => {
    tripListeners.delete(listener);
  };
}

function getTrip(): Trip | null {
  if (tripSnapshot === undefined) tripSnapshot = loadTrip();
  return tripSnapshot;
}

function getServerTrip(): Trip | null {
  return null;
}

export function useTrip() {
  const trip = useSyncExternalStore(subscribeTrip, getTrip, getServerTrip);

  const publish = useCallback((next: Trip | null) => {
    tripSnapshot = next;
    saveTrip(next);
    tripListeners.forEach((listener) => listener());
  }, []);

  /**
   * Joining takes the ratings already on this phone with it — they were
   * yours, they just did not say so yet.
   */
  const join = useCallback(
    async (code: string, name: string) => {
      const next: Trip = { code, rater: newRater(name) };
      resetMark();
      publish(next);
      const now = Date.now();
      const local = await db.listAllEntries();
      const claimed = local
        .map((entry) => claim(entry, next.rater, now))
        .filter((entry, index) => entry !== local[index]);
      await db.putEntries(claimed);
      await syncNow();
    },
    [publish],
  );

  /** Leaving keeps every rating on the phone; only the sharing stops. */
  const leave = useCallback(() => {
    resetMark();
    publish(null);
    void refreshPending();
  }, [publish]);

  return { trip, join, leave };
}

/** Test hook: drop the memoised trip. */
export function resetTripCache(): void {
  tripSnapshot = undefined;
}

export function useSync() {
  return useSyncExternalStore(subscribeSync, getSyncState, getServerSyncState);
}

/*
 * Settings live in localStorage and are read through an external store, so
 * every screen sees the same value and the server render stays consistent.
 */
const listeners = new Set<() => void>();
let snapshot: Settings | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Settings {
  snapshot ??= loadSettings();
  return snapshot;
}

function getServerSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

export function useSettings() {
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const update = useCallback((patch: Partial<Settings>) => {
    snapshot = { ...getSnapshot(), ...patch };
    saveSettings(snapshot);
    listeners.forEach((listener) => listener());
  }, []);

  return { settings, update };
}

/** Test hook: drop the memoised settings snapshot. */
export function resetSettingsCache(): void {
  snapshot = null;
}
