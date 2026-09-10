"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import * as db from "./db";
import { claim, othersRatings } from "./merge";
import { loadSettings, saveSettings } from "./settings";
import {
  clearTrip,
  forgetRoster,
  getServerSyncState,
  getSyncState,
  refreshPending,
  subscribeEntries,
  subscribeSync,
  syncNow,
  withdrawFrom,
} from "./sync";
import {
  clearMembership,
  loadTrip,
  newRater,
  resetMark,
  saveTrip,
} from "./trip";
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
      // A tombstone is a deletion that has arrived, not something to show.
      .then((found) => setEntry(found && !found.deleted ? found : null))
      .catch(() => setEntry(null));
  }, [id]);

  useEffect(refresh, [refresh]);
  useEffect(() => subscribeEntries(refresh), [refresh]);

  return { entry, loading: entry === undefined, refresh };
}

/**
 * How far the bottom of the layout viewport sits below what can actually be
 * seen — the keyboard, in practice.
 *
 * iOS keeps a fixed element pinned to the layout viewport while the visible
 * one shrinks, which strands a bottom bar halfway up the screen. Everything
 * pinned to the bottom offsets itself by this, so it goes back behind the
 * keyboard where it belongs.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () =>
      setInset(
        Math.max(
          0,
          Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
        ),
      );
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

/**
 * One object URL per blob, released when that blob is replaced and not a
 * moment sooner. Sharing a single cleanup between two blobs is how stepping
 * back from the preview lost the photo: the card changing revoked the
 * photo's URL along with the old card's.
 */
export function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
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
      // A new trip knows nobody yet, and this phone has not announced
      // itself on it.
      clearMembership();
      forgetRoster();
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

  /**
   * Leaving takes your ratings with you. They come off the trip and off
   * everyone else's phones, and everyone else's come off yours — what stays
   * here is exactly what you made. The last one out takes the trip itself,
   * since by then there is nothing in it that is not already on this phone.
   *
   * `alone` is decided by the caller, which knows the roster.
   */
  const leave = useCallback(
    async (alone: boolean) => {
      const current = loadTrip();
      if (current) {
        if (alone) await clearTrip(current);
        else await withdrawFrom(current);

        const local = await db.listAllEntries();
        // Theirs go from this phone; mine lose the URL of a photo that is
        // no longer in the trip, so rejoining sends it up again.
        for (const entry of othersRatings(local, current.rater)) {
          await db.deleteEntry(entry.id);
        }
        const mine = local.filter(
          (entry) => entry.photoUrl && entry.rater?.id === current.rater.id,
        );
        await db.putEntries(mine.map((entry) => ({ ...entry, photoUrl: undefined })));
      }
      resetMark();
      clearMembership();
      forgetRoster();
      publish(null);
      await refreshPending();
    },
    [publish],
  );

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
