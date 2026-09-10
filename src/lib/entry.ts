import type { Entry, EntryKind, Place } from "./types";

/**
 * Which form fields apply to a given kind. The form renders from this so
 * "self made hides location" / "dessert hides fields" lives in one place.
 */
export function fieldsFor(kind: EntryKind): {
  place: boolean;
  style: boolean;
  nameLabel: string;
  namePlaceholder: string;
} {
  switch (kind) {
    case "pizzeria":
      return {
        place: true,
        style: true,
        nameLabel: "PIZZA",
        namePlaceholder: "Margherita",
      };
    case "homemade":
      return {
        place: false,
        style: true,
        nameLabel: "PIZZA",
        namePlaceholder: "Margherita",
      };
    case "other":
      return {
        place: true,
        style: false,
        nameLabel: "ITEM",
        namePlaceholder: "Sfogliatella",
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
};

export const EMPTY_DRAFT: Draft = {
  kind: "pizzeria",
  name: "",
  style: "",
  rating: 7,
  place: null,
  note: "",
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

/** Normalises a draft into an Entry, dropping fields the kind doesn't use. */
export function toEntry(
  draft: Draft,
  opts: { id: string; createdAt: number; photoId?: string },
): Entry {
  const fields = fieldsFor(draft.kind);
  return {
    id: opts.id,
    createdAt: opts.createdAt,
    photoId: opts.photoId,
    kind: draft.kind,
    name: draft.name.trim() || FALLBACK_NAME[draft.kind],
    style: fields.style && draft.style.trim() ? draft.style.trim() : undefined,
    rating: Math.round(clamp(draft.rating, 0, 10) * 10) / 10,
    place: fields.place && draft.place ? draft.place : undefined,
    note: draft.note.trim() || undefined,
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
  };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
