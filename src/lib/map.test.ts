import { describe, expect, it } from "vitest";
import {
  bboxParam,
  located,
  parseLabels,
  parseRoads,
  placeLabels,
  project,
  scaleBar,
  spread,
} from "./map";
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

  it("centres a single place, and still shows ground around it", () => {
    const one = project([at("only", 40.85, 14.26)], 400, 400, 30);
    expect(one.points[0]).toMatchObject({ x: 200, y: 200 });
    // A card showing nothing but one dot would be no map at all.
    expect(one.spanMeters).toBeGreaterThan(300);
    expect(one.bounds).not.toBeNull();
  });

  it("does not zoom past a tight cluster", () => {
    // Three doors apart: the card still shows a few hundred metres.
    const tight = project(
      [at("a", 40.8500, 14.2600), at("b", 40.8502, 14.2602)],
      400,
      400,
      30,
    );
    expect(tight.spanMeters).toBeGreaterThan(300);
  });

  it("can place any coordinate, not only the ratings", () => {
    const view = project(naples, 400, 400, 30);
    const michele = view.points.find((p) => p.entry.id === "michele")!;
    const same = view.place(40.8499, 14.2632);
    expect(same.x).toBeCloseTo(michele.x, 5);
    expect(same.y).toBeCloseTo(michele.y, 5);
  });

  it("has nothing to draw when nowhere is known", () => {
    const none = project([at("a"), at("b")], 400, 400, 30);
    expect(none.points).toEqual([]);
    expect(none.missing).toBe(2);
  });

  it("measures how much ground the card shows", () => {
    expect(view.spanMeters).toBeGreaterThan(300);
    expect(view.spanMeters).toBeLessThan(2000);
  });
});

describe("spread", () => {
  const limit = { width: 400, height: 400, pad: 30 };
  const pt = (id: string, x: number, y: number) => ({
    entry: at(id, 40.85, 14.26),
    x,
    y,
  });

  it("leaves dots that are already apart where they are", () => {
    const points = [pt("a", 100, 100), pt("b", 200, 200)];
    expect(spread(points, 18, limit)).toEqual(points);
  });

  it("pushes overlapping dots apart until both can be tapped", () => {
    const out = spread([pt("a", 200, 200), pt("b", 203, 201)], 18, limit);
    expect(Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y)).toBeGreaterThanOrEqual(
      17.5,
    );
  });

  it("separates dots sitting exactly on top of each other", () => {
    const out = spread([pt("a", 200, 200), pt("b", 200, 200)], 18, limit);
    expect(Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y)).toBeGreaterThan(0);
  });

  it("is the same every time, so the map does not shuffle", () => {
    const input = [pt("a", 200, 200), pt("b", 200, 200), pt("c", 201, 200)];
    expect(spread(input, 18, limit)).toEqual(spread(input, 18, limit));
  });

  it("keeps every dot on the card", () => {
    const crowd = Array.from({ length: 8 }, (_, i) => pt(`p${i}`, 380, 380));
    for (const point of spread(crowd, 24, limit)) {
      expect(point.x).toBeGreaterThanOrEqual(30);
      expect(point.x).toBeLessThanOrEqual(370);
      expect(point.y).toBeGreaterThanOrEqual(30);
      expect(point.y).toBeLessThanOrEqual(370);
    }
  });
});

describe("bboxParam", () => {
  it("rounds the box so the same view asks the same question", () => {
    expect(
      bboxParam({ south: 40.84991, west: 14.25551, north: 40.851, east: 14.264 }),
    ).toBe("40.8499,14.2555,40.851,14.264");
  });
});

describe("parseRoads", () => {
  it("keeps lines, drops anything that is not one", () => {
    const roads = parseRoads({
      roads: [
        { m: 1, p: [[40.85, 14.26], [40.851, 14.261]] },
        { m: 0, p: [[40.85, 14.26]] },
        { p: "nope" },
        null,
      ],
    });
    expect(roads).toHaveLength(1);
    expect(roads[0].major).toBe(true);
  });

  it("survives junk instead of throwing it at the map", () => {
    expect(parseRoads(null)).toEqual([]);
    expect(parseRoads({})).toEqual([]);
    expect(parseRoads({ roads: "no" })).toEqual([]);
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

describe("placeLabels", () => {
  const size = { width: 400, height: 400 };

  it("keeps names that do not touch", () => {
    const kept = placeLabels(
      [
        { name: "Napoli", x: 100, y: 100 },
        { name: "Pompei", x: 300, y: 300 },
      ],
      size,
    );
    expect(kept.map((l) => l.name)).toEqual(["Napoli", "Pompei"]);
  });

  it("drops a name that would land on another", () => {
    const kept = placeLabels(
      [
        { name: "Napoli", x: 200, y: 200 },
        { name: "Casoria", x: 210, y: 203 },
      ],
      size,
    );
    expect(kept.map((l) => l.name)).toEqual(["Napoli"]);
  });

  it("keeps the first of a crowd, which is the most important", () => {
    const crowd = ["Napoli", "Portici", "Ercolano", "Torre del Greco"].map(
      (name, i) => ({ name, x: 200 + i, y: 200 }),
    );
    expect(placeLabels(crowd, size)).toHaveLength(1);
    expect(placeLabels(crowd, size)[0].name).toBe("Napoli");
  });

  it("drops names that fall off the card", () => {
    const kept = placeLabels(
      [
        { name: "Off left", x: -20, y: 200 },
        { name: "Off bottom", x: 200, y: 480 },
        { name: "On", x: 200, y: 200 },
      ],
      size,
    );
    expect(kept.map((l) => l.name)).toEqual(["On"]);
  });

  it("gives the same answer every time", () => {
    const input = [
      { name: "A", x: 100, y: 100 },
      { name: "B", x: 104, y: 101 },
      { name: "C", x: 300, y: 300 },
    ];
    expect(placeLabels(input, size)).toEqual(placeLabels(input, size));
  });
});

describe("parseLabels", () => {
  it("reads names and where they belong", () => {
    expect(
      parseLabels({ labels: [{ n: "Napoli", at: [40.85, 14.26] }] }),
    ).toEqual([{ name: "Napoli", lat: 40.85, lon: 14.26 }]);
  });

  it("ignores anything that is not a named point", () => {
    expect(
      parseLabels({
        labels: [{ n: "Napoli" }, { at: [1, 2] }, null, { n: 5, at: [1, 2] }],
      }),
    ).toEqual([]);
    expect(parseLabels(null)).toEqual([]);
  });
});
