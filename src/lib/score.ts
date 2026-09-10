import type { Entry } from "./types";

/** "8.5" / "10" — one decimal, but never a trailing ".0". */
export function formatRating(rating: number): string {
  const rounded = Math.round(rating * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * The scale, in the app's own words. Everything that shows a verdict reads
 * this list, so the readout and the explanation in Setup cannot drift apart.
 */
export const SCALE = [
  { from: 9.5, word: "LEGGENDARIA", meaning: "Worth the trip on its own" },
  { from: 8.5, word: "OTTIMA", meaning: "Excellent — go back" },
  { from: 7, word: "BUONA", meaning: "Good pizza, no complaints" },
  { from: 5.5, word: "OK", meaning: "Edible, forgettable" },
  { from: 3.5, word: "MEH", meaning: "Something was wrong" },
  { from: 0, word: "NO", meaning: "Do not repeat" },
] as const;

/** A one-word verdict, in the spirit of a gauge readout. */
export function verdict(rating: number): string {
  const band = SCALE.find((step) => rating >= step.from);
  return (band ?? SCALE[SCALE.length - 1]).word;
}

/** The scale as rows: word, the range it covers, and what it means. */
export function scaleBands(): Array<{
  word: string;
  range: string;
  meaning: string;
}> {
  return SCALE.map((step, index) => {
    const top = index === 0 ? 10 : SCALE[index - 1].from - 0.1;
    return {
      word: step.word,
      meaning: step.meaning,
      range: `${formatRating(step.from)}–${formatRating(top)}`,
    };
  });
}

/** The band a rating falls in, for anything that wants more than the word. */
export function band(rating: number): (typeof SCALE)[number] {
  return SCALE.find((step) => rating >= step.from) ?? SCALE[SCALE.length - 1];
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
