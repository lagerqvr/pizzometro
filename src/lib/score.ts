import type { Entry } from "./types";

/** "8.5" / "10" — one decimal, but never a trailing ".0". */
export function formatRating(rating: number): string {
  const rounded = Math.round(rating * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** A one-word verdict, in the spirit of a gauge readout. */
export function verdict(rating: number): string {
  if (rating >= 9.5) return "LEGGENDARIA";
  if (rating >= 8.5) return "OTTIMA";
  if (rating >= 7) return "BUONA";
  if (rating >= 5.5) return "OK";
  if (rating >= 3.5) return "MEH";
  return "NO";
}

export type Ranked = Entry & { rank: number };

/**
 * Highest rating first; ties broken by the earlier entry (whoever got there
 * first keeps the higher rank), so ranks are stable as new entries land.
 */
export function rank(entries: Entry[]): Ranked[] {
  const sorted = [...entries].sort(
    (a, b) => b.rating - a.rating || a.createdAt - b.createdAt,
  );
  const ranked: Ranked[] = [];
  sorted.forEach((entry, index) => {
    const previous = ranked[index - 1];
    // Equal ratings share a rank (1,2,2,4) — standard competition ranking.
    const shared = previous && previous.rating === entry.rating;
    ranked.push({ ...entry, rank: shared ? previous.rank : index + 1 });
  });
  return ranked;
}

/** Newest first — the home log. */
export function byRecent(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt);
}

export type Stats = {
  count: number;
  average: number | null;
  best: Entry | null;
  worst: Entry | null;
  places: number;
};

export function stats(entries: Entry[]): Stats {
  if (entries.length === 0) {
    return { count: 0, average: null, best: null, worst: null, places: 0 };
  }
  const ranked = rank(entries);
  const total = entries.reduce((sum, entry) => sum + entry.rating, 0);
  const places = new Set(
    entries.map((entry) => entry.place?.id).filter(Boolean),
  );
  return {
    count: entries.length,
    average: Math.round((total / entries.length) * 10) / 10,
    best: ranked[0],
    worst: ranked[ranked.length - 1],
    places: places.size,
  };
}
