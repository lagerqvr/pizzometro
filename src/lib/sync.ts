"use client";

import * as db from "./db";
import { changesFrom, pendingPush } from "./merge";
import {
  loadMark,
  loadRoster,
  loadTrip,
  markRegistered,
  markRepaired,
  needsRegistration,
  needsRepair,
  saveMark,
  saveRoster,
} from "./trip";
import { makeThumb } from "./render";
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

/*
 * A photo needs its own patience. Twenty seconds is right for a few
 * kilobytes of JSON and hopeless for four megabytes of JPEG: that is 1.5
 * Mbit/s sustained, which roaming data inside a stone building does not
 * give, so the upload aborted every time and the picture never left the
 * phone however long the trip went on.
 *
 * The allowance is the size divided by a deliberately pessimistic rate, with
 * a floor for small files and a ceiling so a dead connection still gives up.
 */
const UPLOAD_FLOOR_MS = 30_000;
const UPLOAD_CEILING_MS = 5 * 60_000;
const SLOW_BYTES_PER_MS = 8; // ~64 kbit/s

export function uploadTimeout(bytes: number): number {
  const needed = UPLOAD_FLOOR_MS + bytes / SLOW_BYTES_PER_MS;
  return Math.min(UPLOAD_CEILING_MS, Math.round(needed));
}

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

async function request(
  url: string,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

  /** Sends one blob up and hands back where it landed. */
  const send = async (id: string, blob: Blob): Promise<string> => {
    const response = await request(
      `/api/trip/${trip.code}/photos/${id}`,
      {
        method: "POST",
        headers: { "content-type": blob.type || "image/jpeg" },
        body: blob,
      },
      uploadTimeout(blob.size),
    );
    if (!response.ok) throw new Error(String(response.status));
    const { url } = (await response.json()) as { url?: string };
    if (typeof url !== "string") throw new Error("no url");
    return url;
  };

  for (const entry of entries) {
    if (!entry.photoId || entry.deleted) {
      prepared.push(entry);
      continue;
    }
    if (entry.photoUrl && entry.thumbUrl) {
      prepared.push(entry);
      continue;
    }
    const photo = await db.getPhoto(entry.photoId);
    if (!photo) {
      prepared.push(entry);
      continue;
    }
    /*
     * One at a time, smallest first, saving each address the moment it
     * lands. Two uploads at once only split a weak connection between them,
     * and losing the pair because the second failed meant sending the first
     * again — four megabytes of roaming data to learn nothing.
     *
     * The thumbnail goes first because it is a fortieth of the bytes and it
     * is what the log actually shows: the other phone gets a picture tonight
     * rather than nothing until the full photo finally gets through.
     */
    let carried: Entry = entry;
    try {
      const thumbId = db.thumbKey(entry.photoId);
      if (!carried.thumbUrl) {
        const thumb = (await db.getPhoto(thumbId)) ?? (await makeThumb(photo));
        carried = { ...carried, thumbUrl: await send(thumbId, thumb) };
        await db.putEntry(carried);
      }
      if (!carried.photoUrl) {
        carried = { ...carried, photoUrl: await send(entry.photoId, photo) };
        await db.putEntry(carried);
      }
    } catch {
      // Whatever did get up is kept and pushed; the rest waits for the next
      // round, which the held-back marker guarantees there will be.
      complete = false;
    }
    prepared.push(carried);
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

    // Once per phone, the whole log rather than only what is new, so the
    // merge can pick up photo addresses it discarded on an earlier tie.
    const repairing = needsRepair();
    const response = await request(
      `/api/trip/${trip.code}?since=${repairing ? 0 : mark.pulledAt}`,
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
    // Only once the full read has actually landed and merged.
    if (repairing) markRepaired();

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
