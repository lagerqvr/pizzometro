/**
 * Core domain types. One rating = one Entry. Everything the app shows
 * (log, leaderboard, share card) is derived from a list of these.
 */

/** What was eaten. Drives which fields the form asks for. */
export type EntryKind = "pizzeria" | "homemade" | "other";

export type Place = {
  /** Stable id from the source (OSM node/way id), or "manual:<name>". */
  id: string;
  name: string;
  /** e.g. "Via dei Tribunali 32" — optional, often missing in OSM. */
  address?: string;
  lat?: number;
  lon?: number;
  /** Metres from the device when the place was suggested. */
  distance?: number;
};

/**
 * Who logged a rating. Absent on entries made before a trip was joined, and
 * on every entry if the app is used alone — which stays a supported way to
 * use it.
 */
export type Rater = {
  /** Stable per-device id, so two people can share a first name. */
  id: string;
  name: string;
};

export type Entry = {
  id: string;
  kind: EntryKind;
  /** Free text: "Margherita", "Marinara", "Tiramisu". */
  name: string;
  /** Style/category: "Napoletana", "Romana", "Dessert"... optional. */
  style?: string;
  /** 0–10, one decimal step (stored as a number like 8.5). */
  rating: number;
  /** Only meaningful for kind === "pizzeria". */
  place?: Place;
  note?: string;
  /** Epoch ms. */
  createdAt: number;
  /** Key into the photo blob store; absent if the user skipped the photo. */
  photoId?: string;
  /** Where the photo lives in the shared trip, once it has been pushed. */
  photoUrl?: string;
  /** Set once the entry belongs to a shared trip. */
  rater?: Rater;
  /** Last local edit. Drives merge order; falls back to createdAt. */
  updatedAt?: number;
  /**
   * A deleted entry is kept as a tombstone so the delete reaches the other
   * phone instead of the entry coming straight back on the next pull.
   */
  deleted?: boolean;
};

/** A shared trip: one code, and who this device is inside it. */
export type Trip = {
  /** Also the shared secret — whoever has it can read and write the trip. */
  code: string;
  rater: Rater;
};

/** Fields the share card may stamp into the corner. */
export type StampFields = {
  name?: string;
  rating?: number;
  place?: string;
  date?: number;
};

export type Corner = "tl" | "tr" | "bl" | "br";

export type Settings = {
  /** Where the stats block sits on the generated picture. */
  stampCorner: Corner;
  /** Rule-of-thirds + centering circle in the camera view. */
  cameraGuides: boolean;
  /** Include each field on the generated picture. */
  stamp: {
    name: boolean;
    rating: boolean;
    place: boolean;
    date: boolean;
  };
};

export const DEFAULT_SETTINGS: Settings = {
  stampCorner: "tl",
  cameraGuides: true,
  // The date is off by default: the picture reads better as three lines.
  stamp: { name: true, rating: true, place: true, date: false },
};

/** The trip this app was built for. Shown in the footer. */
export const TRIP = {
  label: "MADE FOR PIZZA TRIP TO NAPOLI",
  dates: "11–15.9.2026 FOR A&R",
} as const;
