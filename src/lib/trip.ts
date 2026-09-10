import type { Rater, Trip } from "./types";

/**
 * A shared trip is a code and nothing else: no accounts, no login. The code
 * is the secret, so it has to be long enough that nobody stumbles onto
 * somebody else's pizza, and short enough to read down the phone.
 */
const TRIP_KEY = "pizzometro:trip";
const RATER_KEY = "pizzometro:rater-id";
const MEMBER_KEY = "pizzometro:member";
const ROSTER_KEY = "pizzometro:roster";
const MARK_KEY = "pizzometro:sync";
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // No l/o/0/1 to read aloud.
const CODE_LENGTH = 10;
const CODE_PATTERN = /^[a-z0-9]{10}$/;

export function newTripCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.random() * 256;
  }
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/**
 * The gate in front of the blob store: a code goes straight into a storage
 * path, so anything that is not exactly ten lowercase alphanumerics is not a
 * code. Typed input is forgiven its spaces and case first.
 */
export function normaliseCode(input: string): string {
  return input.trim().toLowerCase().replace(/[\s-]/g, "");
}

export function isTripCode(value: unknown): value is string {
  return typeof value === "string" && CODE_PATTERN.test(value);
}

/**
 * Who this phone is, kept apart from which trip it is on. Generating a fresh
 * id per join would mean leaving and rejoining a trip cost you ownership of
 * your own ratings — you would no longer be able to delete them.
 */
function deviceRaterId(): string {
  const stored =
    typeof localStorage === "undefined" ? null : localStorage.getItem(RATER_KEY);
  if (stored) return stored;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  if (typeof localStorage !== "undefined") localStorage.setItem(RATER_KEY, id);
  return id;
}

export function newRater(name: string): Rater {
  return { id: deviceRaterId(), name: name.trim().slice(0, 24) || "Anon" };
}

/** The initial shown on cards and leaderboard tabs. */
export function initialOf(rater: Rater | undefined): string {
  return rater?.name.trim().charAt(0).toUpperCase() || "?";
}

/** Tolerates anything in storage — a broken trip must not break the app. */
export function parseTrip(raw: string | null): Trip | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Trip>;
    const rater = parsed.rater;
    if (!isTripCode(parsed.code)) return null;
    if (!rater || typeof rater.id !== "string" || typeof rater.name !== "string") {
      return null;
    }
    return { code: parsed.code, rater: { id: rater.id, name: rater.name } };
  } catch {
    return null;
  }
}

export function loadTrip(): Trip | null {
  if (typeof localStorage === "undefined") return null;
  return parseTrip(localStorage.getItem(TRIP_KEY));
}

export function saveTrip(trip: Trip | null): void {
  if (typeof localStorage === "undefined") return;
  if (trip) localStorage.setItem(TRIP_KEY, JSON.stringify(trip));
  else localStorage.removeItem(TRIP_KEY);
}

/**
 * How far the two halves of the sync have got. Kept apart because they are
 * measured on different clocks: `pushedAt` against this phone's, `pulledAt`
 * against the server's.
 */
export type SyncMark = { pushedAt: number; pulledAt: number };

export const NO_MARK: SyncMark = { pushedAt: 0, pulledAt: 0 };

export function parseMark(raw: string | null): SyncMark {
  if (!raw) return NO_MARK;
  try {
    const parsed = JSON.parse(raw) as Partial<SyncMark>;
    return {
      pushedAt: Number.isFinite(parsed.pushedAt) ? parsed.pushedAt! : 0,
      pulledAt: Number.isFinite(parsed.pulledAt) ? parsed.pulledAt! : 0,
    };
  } catch {
    return NO_MARK;
  }
}

export function loadMark(): SyncMark {
  if (typeof localStorage === "undefined") return NO_MARK;
  return parseMark(localStorage.getItem(MARK_KEY));
}

export function saveMark(mark: SyncMark): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MARK_KEY, JSON.stringify(mark));
}

/** Clearing the marks forces the next sync to push and pull everything. */
export function resetMark(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(MARK_KEY);
}

export function joinLink(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/join?trip=${code}`;
}

/**
 * Announcing yourself to a trip is a single small write, so it happens once
 * — unless the trip or the name changes, which is exactly when it should
 * happen again.
 */
function fingerprint(trip: Trip): string {
  return `${trip.code}:${trip.rater.id}:${trip.rater.name}`;
}

export function needsRegistration(trip: Trip): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MEMBER_KEY) !== fingerprint(trip);
}

export function markRegistered(trip: Trip): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MEMBER_KEY, fingerprint(trip));
}

/**
 * The roster is kept so the names are there before the first sync lands —
 * and stored against the trip it belongs to, so starting a new one cannot
 * inherit the last one's people.
 */
export function loadRoster(code: string): Rater[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? "null");
    if (!parsed || parsed.code !== code || !Array.isArray(parsed.members)) {
      return [];
    }
    return parsed.members.filter(
      (item: unknown): item is Rater =>
        Boolean(item) &&
        typeof (item as Rater).id === "string" &&
        typeof (item as Rater).name === "string",
    );
  } catch {
    return [];
  }
}

export function saveRoster(code: string, members: Rater[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ROSTER_KEY, JSON.stringify({ code, members }));
}

/** Leaving forgets who was on it, and that this phone ever announced itself. */
export function clearMembership(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(ROSTER_KEY);
  localStorage.removeItem(MEMBER_KEY);
}
