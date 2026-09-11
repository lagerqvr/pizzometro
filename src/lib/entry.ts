import type { Corner, Entry, EntryKind, Place } from "./types";

/**
 * Which form fields apply to a given kind. The form renders from this so
 * "self made hides location" / "dessert hides fields" lives in one place.
 */
export function fieldsFor(kind: EntryKind): {
  place: boolean;
  style: boolean;
  nameLabel: string;
  namePlaceholder: string;
  /** One tap instead of typing, for the three styles you meet most. */
  styles: string[];
} {
  const styles = ["Napoletana", "Romana", "Al taglio"];
  switch (kind) {
    case "pizzeria":
      return {
        place: true,
        style: true,
        nameLabel: "PIZZA",
        namePlaceholder: "Margherita",
        styles,
      };
    case "homemade":
      return {
        place: false,
        style: true,
        nameLabel: "PIZZA",
        namePlaceholder: "Margherita",
        styles,
      };
    case "other":
      return {
        place: true,
        style: false,
        nameLabel: "ITEM",
        namePlaceholder: "Sfogliatella",
        // A dolce has no style field to offer them in.
        styles: [],
      };
  }
}

export type Draft = {
  kind: EntryKind;
  name: string;
  style: string;
  rating: number;
  place: Place | null;
  note: string;
  /** When it was eaten, as yyyy-mm-dd. Empty means "when it was entered". */
  date: string;
  /**
   * Where this picture's text goes. Null means "use the setting", which is
   * what it stays unless the corner is picked for this one pizza.
   */
  corner: Corner | null;
};

export const EMPTY_DRAFT: Draft = {
  kind: "pizzeria",
  name: "",
  style: "",
  rating: 7,
  place: null,
  note: "",
  date: "",
  corner: null,
};

export type ValidationError = { field: keyof Draft; message: string };

/**
 * Deliberately permissive: the point of the app is a fast log, so only a
 * rating in range is truly required. Name falls back to the kind's default.
 */
export function validate(draft: Draft): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Number.isFinite(draft.rating) || draft.rating < 0 || draft.rating > 10) {
    errors.push({ field: "rating", message: "Rating must be between 0 and 10" });
  }
  if (draft.name.trim().length > 60) {
    errors.push({ field: "name", message: "Keep the name under 60 characters" });
  }
  return errors;
}

const FALLBACK_NAME: Record<EntryKind, string> = {
  pizzeria: "Pizza",
  homemade: "Pizza",
  other: "Dolce",
};

/** yyyy-mm-dd as local midday, which no timezone can push onto another day. */
export function dateToTime(date: string, fallback: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const at = new Date(year, month - 1, day, 12, 0, 0);
  // A Date rolls an impossible day over instead of refusing it — the 40th of
  // month 13 becomes a real day in 2027 — so the parts have to be checked
  // against what came back.
  if (
    at.getFullYear() !== year ||
    at.getMonth() !== month - 1 ||
    at.getDate() !== day
  ) {
    return fallback;
  }
  // Keep the time of day it was first entered, so the log's order holds.
  const original = new Date(fallback);
  at.setHours(original.getHours(), original.getMinutes(), 0, 0);
  return at.getTime();
}

/** The other direction, for the date field. */
export function timeToDate(time: number): string {
  const at = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Normalises a draft into an Entry, dropping fields the kind doesn't use. */
export function toEntry(
  draft: Draft,
  opts: { id: string; createdAt: number; photoId?: string },
): Entry {
  const fields = fieldsFor(draft.kind);
  return {
    id: opts.id,
    createdAt: dateToTime(draft.date, opts.createdAt),
    photoId: opts.photoId,
    kind: draft.kind,
    name: draft.name.trim() || FALLBACK_NAME[draft.kind],
    style: fields.style && draft.style.trim() ? draft.style.trim() : undefined,
    rating: Math.round(clamp(draft.rating, 0, 10) * 10) / 10,
    place: fields.place && draft.place ? draft.place : undefined,
    note: draft.note.trim() || undefined,
    corner: draft.corner ?? undefined,
  };
}

export function toDraft(entry: Entry): Draft {
  return {
    kind: entry.kind,
    name: entry.name,
    style: entry.style ?? "",
    rating: entry.rating,
    place: entry.place ?? null,
    note: entry.note ?? "",
    date: timeToDate(entry.createdAt),
    corner: entry.corner ?? null,
  };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
