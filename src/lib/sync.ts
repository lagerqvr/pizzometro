"use client";

import * as db from "./db";
import { changesFrom, pendingPush } from "./merge";
import {
  loadMark,
  loadRoster,
  loadTrip,
  markRegistered,
  needsRegistration,
  saveMark,
  saveRoster,
} from "./trip";
import { sanitiseEntry, sanitiseRater } from "./wire";
import type { Entry, Rater, Trip } from "./types";

/**
 * Sync between the two phones on a trip.
 *
 * The rules it plays by, in order of importance: the app must keep working
 * with no trip and no signal; a rating must never be lost; and a sync that
 * fails is simply a sync that happens later. Nothing here blocks a screen —
 * every path returns quietly and the state store tells the UI what happened.
 */

/**
 * `unavailable` is its own status rather than an error: the trip has no
 * storage behind it yet, which is a deployment that has not happened, not a
 * fault. The app carries on locally and stops asking.
 */
export type SyncStatus =
  | "off"
  | "idle"
  | "syncing"
  | "offline"
  | "unavailable"
  | "error";

export type SyncState = {
  status: SyncStatus;
  /** Last time a full push + pull completed. */
  lastSyncedAt: number | null;
  /** Local changes still waiting to go up. */
  pending: number;
  online: boolean;
  /** Everyone on the trip, whether or not they have rated anything yet. */
  members: Rater[];
  reason?: "network" | "server" | "not-configured";
  /** What the last successful sync moved, for the message shown after it. */
  moved?: { pushed: number; pulled: number };
};

const IDLE: SyncState = {
  status: "off",
  lastSyncedAt: null,
  pending: 0,
  online: true,
  members: [],
};

const REQUEST_TIMEOUT_MS = 20_000;
const POLL_MS = 60_000;

let state: SyncState = IDLE;
/** Set by a 503; cleared by a reload or by asking for a sync by hand. */
let unavailable = false;
const stateListeners = new Set<() => void>();
const entryListeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

export function getSyncState(): SyncState {
  return state;
}

export function getServerSyncState(): SyncState {
  return IDLE;
}

export function subscribeSync(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Fires when a pull has written new entries, so open screens can reload. */
export function subscribeEntries(listener: () => void): () => void {
  entryListeners.add(listener);
  return () => {
    entryListeners.delete(listener);
  };
}

function set(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  stateListeners.forEach((listener) => listener());
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Photos go up before the entries that point at them, so the other phone
 * never sees a rating whose picture is missing. A photo that fails to upload
 * holds back the push marker rather than the rating itself.
 */
async function uploadPhotos(
  trip: Trip,
  entries: Entry[],
): Promise<{ entries: Entry[]; complete: boolean }> {
  const prepared: Entry[] = [];
  let complete = true;

  for (const entry of entries) {
    if (!entry.photoId || entry.photoUrl || entry.deleted) {
      prepared.push(entry);
      continue;
    }
    const blob = await db.getPhoto(entry.photoId);
    if (!blob) {
      prepared.push(entry);
      continue;
    }
    try {
      const response = await request(
        `/api/trip/${trip.code}/photos/${entry.photoId}`,
        {
          method: "POST",
          headers: { "content-type": blob.type || "image/jpeg" },
          body: blob,
        },
      );
      if (!response.ok) throw new Error(String(response.status));
      const { url } = (await response.json()) as { url?: string };
      if (typeof url !== "string") throw new Error("no url");
      // Same version, so recording the URL costs no extra round of syncing.
      const updated: Entry = { ...entry, photoUrl: url };
      await db.putEntry(updated);
      prepared.push(updated);
    } catch {
      complete = false;
      prepared.push(entry);
    }
  }

  return { entries: prepared, complete };
}

/** A refusal from the trip endpoint, told apart from a bad connection. */
function stopped(status: number, pending: number): void {
  if (status === 503) {
    unavailable = true;
    set({ status: "unavailable", reason: "not-configured", pending });
    return;
  }
  set({ status: "error", reason: "server", pending });
}

async function run(): Promise<void> {
  const trip = loadTrip();
  if (!trip) {
    set({ status: "off", pending: 0, online: isOnline() });
    return;
  }

  const mark = loadMark();
  const local = await db.listAllEntries();
  const outgoing = pendingPush(local, mark.pushedAt);

  if (unavailable) {
    set({ status: "unavailable", pending: outgoing.length, online: isOnline() });
    return;
  }

  if (!isOnline()) {
    set({ status: "offline", online: false, pending: outgoing.length });
    return;
  }

  set({ status: "syncing", online: true, pending: outgoing.length });
  const startedAt = Date.now();

  try {
    // Joining is worth a push of its own: without it nobody else can see
    // that this phone is on the trip until it rates something.
    const joining = needsRegistration(trip) ? trip.rater : null;

    let pushed = 0;
    if (outgoing.length > 0 || joining) {
      const { entries, complete } = await uploadPhotos(trip, outgoing);
      const response = await request(`/api/trip/${trip.code}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries, member: joining ?? undefined }),
      });
      if (!response.ok) {
        stopped(response.status, outgoing.length);
        return;
      }
      pushed = entries.length;
      if (joining) markRegistered(trip);
      // A photo left behind keeps its entry in the queue for the next round.
      if (complete) saveMark({ ...mark, pushedAt: startedAt });
    } else {
      saveMark({ ...mark, pushedAt: startedAt });
    }

    const response = await request(
      `/api/trip/${trip.code}?since=${mark.pulledAt}`,
    );
    if (!response.ok) {
      stopped(response.status, outgoing.length);
      return;
    }

    const body = (await response.json()) as {
      entries?: unknown;
      members?: unknown;
      now?: number;
    };
    const incoming = Array.isArray(body.entries)
      ? body.entries
          .map(sanitiseEntry)
          .filter((entry): entry is Entry => entry !== null)
      : [];
    const members = Array.isArray(body.members)
      ? body.members
          .map(sanitiseRater)
          .filter((rater): rater is Rater => rater !== undefined)
      : loadRoster(trip.code);
    saveRoster(trip.code, members);

    const changed = changesFrom(local, incoming);
    if (changed.length > 0) {
      await db.putEntries(changed);
      // A rating deleted on the other phone takes its picture with it.
      const known = new Map(local.map((entry) => [entry.id, entry]));
      for (const entry of changed) {
        const photoId = entry.deleted && known.get(entry.id)?.photoId;
        if (photoId) await db.deletePhoto(photoId);
      }
      entryListeners.forEach((listener) => listener());
    }

    saveMark({
      pushedAt: loadMark().pushedAt,
      pulledAt: typeof body.now === "number" ? body.now : Date.now(),
    });

    const stillPending = pendingPush(
      await db.listAllEntries(),
      loadMark().pushedAt,
    ).length;

    unavailable = false;
    set({
      status: "idle",
      online: true,
      lastSyncedAt: Date.now(),
      pending: stillPending,
      members,
      reason: undefined,
      moved: { pushed, pulled: changed.length },
    });
  } catch {
    // Aborted, offline mid-flight, DNS gone: all the same answer — later.
    set({
      status: isOnline() ? "error" : "offline",
      online: isOnline(),
      reason: "network",
      pending: outgoing.length,
    });
  }
}

/**
 * Never runs twice at once; a call during a sync waits for that one.
 * `force` is the SYNC NOW button: it tries again even after a 503.
 */
export function syncNow(force = false): Promise<void> {
  if (force) unavailable = false;
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Forgets who was on the last trip. Called when one is joined or started,
 * so nobody is shown as being on a trip they have never been near.
 */
export function forgetRoster(): void {
  set({ members: [] });
}

/** Test hook: forget everything the engine is holding on to. */
export function resetSyncState(): void {
  state = IDLE;
  unavailable = false;
  inFlight = null;
}

/** Recomputes the queue without touching the network. */
export async function refreshPending(): Promise<void> {
  if (!loadTrip()) {
    set({ status: "off", pending: 0 });
    return;
  }
  const pending = pendingPush(
    await db.listAllEntries(),
    loadMark().pushedAt,
  ).length;
  set({ pending, online: isOnline() });
}

/**
 * Syncs when there is a reason to: the app opened, the phone came back onto
 * the network, the screen came back into view, or a minute passed. Nothing
 * here polls hard — this runs on somebody's roaming data.
 */
export function startSync(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const online = () => {
    set({ online: true });
    void syncNow();
  };
  const offline = () => {
    set({ status: "offline", online: false });
  };
  const visibility = () => {
    if (document.visibilityState === "visible") void syncNow();
  };

  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  document.addEventListener("visibilitychange", visibility);
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void syncNow();
  }, POLL_MS);

  void syncNow();

  return () => {
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
    document.removeEventListener("visibilitychange", visibility);
    if (timer) clearInterval(timer);
  };
}


/**
 * Whether a trip with this code is actually out there. A code is all it
 * takes to write to a trip, so nothing distinguishes joining one from
 * inventing one — except asking first. Throws if the question could not be
 * put, which is not the same answer as "no".
 */
export async function tripExists(code: string): Promise<boolean> {
  const response = await request(`/api/trip/${code}`);
  if (!response.ok) throw new Error(`check ${response.status}`);
  const body = (await response.json()) as {
    entries?: unknown[];
    members?: unknown[];
  };
  return (body.entries?.length ?? 0) > 0 || (body.members?.length ?? 0) > 0;
}

/**
 * Takes this phone's ratings out of a trip other people are still on: the
 * server replaces each with a tombstone and deletes the photos, so the other
 * phones drop them on their next sync. The copies here are untouched.
 */
export async function withdrawFrom(trip: Trip): Promise<number> {
  const response = await request(
    `/api/trip/${trip.code}?scope=mine&member=${encodeURIComponent(trip.rater.id)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error(`withdraw ${response.status}`);
  const body = (await response.json()) as { withdrawn?: number };
  return body.withdrawn ?? 0;
}

/** Empties a trip in the shared store. Each phone keeps its own copies. */
export async function clearTrip(trip: Trip): Promise<number> {
  const response = await request(`/api/trip/${trip.code}?scope=trip`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`clear ${response.status}`);
  const body = (await response.json()) as { cleared?: number };
  return body.cleared ?? 0;
}
