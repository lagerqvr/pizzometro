import { describe, expect, it } from "vitest";
import {
  byRecent,
  formatRating,
  rank,
  scaleBands,
  stats,
  verdict,
} from "./score";
import type { Entry } from "./types";

function entry(partial: Partial<Entry> & { id: string }): Entry {
  return {
    kind: "pizzeria",
    name: "Margherita",
    rating: 8,
    createdAt: 1_000,
    ...partial,
  };
}

describe("formatRating", () => {
  it("drops a trailing .0 but keeps a real decimal", () => {
    expect(formatRating(8)).toBe("8");
    expect(formatRating(8.5)).toBe("8.5");
    expect(formatRating(10)).toBe("10");
    expect(formatRating(0)).toBe("0");
  });

  it("rounds to one decimal", () => {
    expect(formatRating(7.26)).toBe("7.3");
  });
});

describe("verdict", () => {
  it("maps the scale onto words, edges included", () => {
    expect(verdict(10)).toBe("LEGGENDARIA");
    expect(verdict(9.5)).toBe("LEGGENDARIA");
    expect(verdict(9.4)).toBe("OTTIMA");
    expect(verdict(7)).toBe("BUONA");
    expect(verdict(6.9)).toBe("OK");
    expect(verdict(0)).toBe("NO");
  });
});

describe("rank", () => {
  it("orders by rating, highest first", () => {
    const ranked = rank([
      entry({ id: "a", rating: 6 }),
      entry({ id: "b", rating: 9 }),
      entry({ id: "c", rating: 7.5 }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it("breaks ties by the earlier entry", () => {
    const ranked = rank([
      entry({ id: "late", rating: 8, createdAt: 2_000 }),
      entry({ id: "early", rating: 8, createdAt: 1_000 }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["early", "late"]);
  });

  it("gives tied entries the same rank and skips the next (1,2,2,4)", () => {
    const ranked = rank([
      entry({ id: "a", rating: 9 }),
      entry({ id: "b", rating: 8, createdAt: 1 }),
      entry({ id: "c", rating: 8, createdAt: 2 }),
      entry({ id: "d", rating: 7 }),
    ]);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 2, 4]);
  });

  it("does not mutate its input", () => {
    const input = [entry({ id: "a", rating: 5 }), entry({ id: "b", rating: 9 })];
    rank(input);
    expect(input.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("handles an empty log", () => {
    expect(rank([])).toEqual([]);
  });
});

describe("byRecent", () => {
  it("puts the newest entry first", () => {
    const sorted = byRecent([
      entry({ id: "old", createdAt: 1 }),
      entry({ id: "new", createdAt: 9 }),
    ]);
    expect(sorted[0].id).toBe("new");
  });
});

describe("stats", () => {
  it("reports empty state without dividing by zero", () => {
    expect(stats([])).toEqual({
      count: 0,
      average: null,
      best: null,
      worst: null,
      places: 0,
    });
  });

  it("averages, finds the extremes and counts distinct places", () => {
    const result = stats([
      entry({ id: "a", rating: 9, place: { id: "p1", name: "Sorbillo" } }),
      entry({ id: "b", rating: 6, place: { id: "p1", name: "Sorbillo" } }),
      entry({ id: "c", rating: 7.5, place: { id: "p2", name: "Di Matteo" } }),
    ]);
    expect(result.count).toBe(3);
    expect(result.average).toBe(7.5);
    expect(result.best?.id).toBe("a");
    expect(result.worst?.id).toBe("b");
    expect(result.places).toBe(2);
  });

  it("ignores entries with no place when counting places", () => {
    const result = stats([entry({ id: "a", kind: "homemade" })]);
    expect(result.places).toBe(0);
  });
});

describe("scaleBands", () => {
  it("covers 0 to 10 with no gap and no overlap", () => {
    const bands = scaleBands();
    expect(bands[0].range).toBe("9.5–10");
    expect(bands.at(-1)?.range).toBe("0–3.4");

    // Each band starts exactly where the one above it stops.
    const edges = bands.map((band) => band.range.split("–").map(Number));
    for (let i = 1; i < edges.length; i += 1) {
      expect(edges[i - 1][0] - edges[i][1]).toBeCloseTo(0.1, 5);
    }
  });

  it("says the same words the ratings do", () => {
    for (const band of scaleBands()) {
      const low = Number(band.range.split("–")[0]);
      expect(verdict(low)).toBe(band.word);
    }
  });
});
