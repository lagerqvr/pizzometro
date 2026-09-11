import { describe, expect, it } from "vitest";
import { formatSpan, located, project, scaleBar } from "./map";
import type { Entry } from "./types";

function at(id: string, lat?: number, lon?: number): Entry {
  return {
    id,
    kind: "pizzeria",
    name: `Pizza ${id}`,
    rating: 8,
    createdAt: 1_000,
    place: lat == null ? undefined : { id: `p-${id}`, name: id, lat, lon },
  };
}

// Three places across central Naples, plus one rated at home with no GPS.
const naples = [
  at("michele", 40.8499, 14.2632),
  at("sorbillo", 40.8509, 14.2559),
  at("trianon", 40.8496, 14.2637),
  at("homemade"),
];

describe("located", () => {
  it("keeps only what can be drawn", () => {
    expect(located(naples).map((e) => e.id)).toEqual([
      "michele",
      "sorbillo",
      "trianon",
    ]);
  });
});

describe("project", () => {
  const view = project(naples, 400, 400, 30);

  it("counts what it could not place", () => {
    expect(view.missing).toBe(1);
    expect(view.points).toHaveLength(3);
  });

  it("keeps every point inside the padding", () => {
    for (const point of view.points) {
      expect(point.x).toBeGreaterThanOrEqual(30);
      expect(point.x).toBeLessThanOrEqual(370);
      expect(point.y).toBeGreaterThanOrEqual(30);
      expect(point.y).toBeLessThanOrEqual(370);
    }
  });

  it("puts north at the top", () => {
    const sorbillo = view.points.find((p) => p.entry.id === "sorbillo")!;
    const michele = view.points.find((p) => p.entry.id === "michele")!;
    // Sorbillo is the northernmost of the three.
    expect(sorbillo.y).toBeLessThan(michele.y);
  });

  it("puts east on the right", () => {
    const trianon = view.points.find((p) => p.entry.id === "trianon")!;
    const sorbillo = view.points.find((p) => p.entry.id === "sorbillo")!;
    expect(trianon.x).toBeGreaterThan(sorbillo.x);
  });

  it("does not stretch longitude at Naples's latitude", () => {
    // Same degrees each way: on the ground that is a wider box than a tall
    // one, so the drawing has to be wider than it is tall.
    const square = project(
      [at("a", 40.85, 14.25), at("b", 40.86, 14.26)],
      400,
      400,
      0,
    );
    const [a, b] = square.points;
    expect(Math.abs(b.x - a.x)).toBeLessThan(Math.abs(b.y - a.y));
  });

  it("centres a single place rather than dividing by zero", () => {
    const one = project([at("only", 40.85, 14.26)], 400, 400, 30);
    expect(one.points[0]).toMatchObject({ x: 200, y: 200 });
    expect(one.spanMeters).toBe(0);
  });

  it("has nothing to draw when nowhere is known", () => {
    const none = project([at("a"), at("b")], 400, 400, 30);
    expect(none.points).toEqual([]);
    expect(none.missing).toBe(2);
  });

  it("measures how far across the ratings are spread", () => {
    // Via dei Tribunali to Sorbillo is a few hundred metres.
    expect(view.spanMeters).toBeGreaterThan(300);
    expect(view.spanMeters).toBeLessThan(1500);
  });
});

describe("scaleBar", () => {
  it("picks a round distance that fits the space", () => {
    const bar = scaleBar(1000, 400, 120)!;
    expect([100, 250]).toContain(bar.meters);
    expect(bar.pixels).toBeLessThanOrEqual(120);
  });

  it("gives up rather than drawing something meaningless", () => {
    expect(scaleBar(0, 400, 120)).toBeNull();
    // Everything at one address: no scale to speak of.
    expect(scaleBar(1, 400, 1)).toBeNull();
  });
});

describe("formatSpan", () => {
  it("reads in metres up close and kilometres further out", () => {
    expect(formatSpan(420)).toBe("420 m across");
    expect(formatSpan(2400)).toBe("2.4 km across");
    expect(formatSpan(0)).toBe("");
  });
});
