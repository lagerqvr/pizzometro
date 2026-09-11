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

/**
 * How many ratings there were last time. Reading IndexedDB takes a moment,
 * and a list that knows its own length can hold that shape while it waits
 * instead of flashing a word and then jumping.
 */
const COUNT_KEY = "pizzometro:count";

function rememberedCount(): number {
  if (typeof localStorage === "undefined") return 0;
  const stored = Number(localStorage.getItem(COUNT_KEY));
  return Number.isFinite(stored) && stored > 0 ? Math.min(stored, 12) : 0;
}

export function useEntries() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read once, before the first paint, so the skeleton is there immediately.
  const [expected] = useState(rememberedCount);

  const refresh = useCallback(() => {
    db.listEntries()
      .then((found) => {
        setEntries(found);
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(COUNT_KEY, String(found.length));
        }
      })
      .catch(() => {
        setEntries([]);
        setError("Could not open local storage");
      });
  }, []);

  useEffect(refresh, [refresh]);
  // A pull that lands while the log is open should show up in it.
  useEffect(() => subscribeEntries(refresh), [refresh]);

  return { entries, loading: entries === null, error, refresh, expected };
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
 * How far the bottom of the screen is below the bottom of the layout
 * viewport, which is where a `fixed` element sits.
 *
 * On launch, an installed web app is sometimes laid out shorter than the
 * screen it is on: the bar then floats a finger's width above the bottom
 * until something makes the viewport settle — which is why switching tabs
 * appeared to fix it. Measuring the visible area and pushing the bar down by
 * the difference puts it where it belongs.
 *
 * The keyboard is the same measurement the other way round; it is left
 * alone, so a bar stays behind the keyboard rather than riding above it.
 */
export function useBottomInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () =>
      setInset(
        Math.max(
          0,
          Math.round(viewport.offsetTop + viewport.height - window.innerHeight),
        ),
      );
    // Once after mount, because the viewport is still settling at first paint.
    const settle = requestAnimationFrame(update);
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(settle);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
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
export function usePhotoUrl(
  entry?: Pick<Entry, "photoId" | "photoUrl" | "thumbUrl">,
  /** The log only needs the small copy — a 64px card, not four megabytes. */
  size: "full" | "thumb" = "full",
) {
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);
  const wantsThumb = size === "thumb" && Boolean(entry?.thumbUrl);
  const photoId =
    entry?.photoId && wantsThumb
      ? db.thumbKey(entry.photoId)
      : entry?.photoId;
  const photoUrl = wantsThumb ? entry?.thumbUrl : entry?.photoUrl;

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
