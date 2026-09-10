import { describe, expect, it } from "vitest";
import {
  CARD_PAD,
  CARD_SIZE,
  buildStamp,
  coverRect,
  formatStampDate,
  isStampEmpty,
  stampLayout,
  stampLines,
  truncate,
} from "./compose";
import { DEFAULT_SETTINGS, type Entry, type Settings } from "./types";

const entry: Entry = {
  id: "e1",
  kind: "pizzeria",
  name: "Margherita",
  rating: 8.5,
  createdAt: new Date(2026, 8, 12, 13, 30).getTime(),
  place: { id: "p1", name: "Sorbillo" },
};

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe("coverRect", () => {
  it("crops the sides of a landscape photo", () => {
    const rect = coverRect({ width: 4000, height: 3000 }, { width: 1080, height: 1080 });
    expect(rect.sw).toBe(3000);
    expect(rect.sh).toBe(3000);
    expect(rect.sx).toBe(500);
    expect(rect.sy).toBe(0);
  });

  it("crops the top and bottom of a portrait photo", () => {
    const rect = coverRect({ width: 3000, height: 4000 }, { width: 1080, height: 1080 });
    expect(rect.sw).toBe(3000);
    expect(rect.sh).toBe(3000);
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBe(500);
  });

  it("leaves a square photo untouched", () => {
    const rect = coverRect({ width: 2000, height: 2000 }, { width: 1080, height: 1080 });
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 2000, sh: 2000 });
  });
});

describe("buildStamp", () => {
  it("includes every enabled and filled field", () => {
    const stamp = buildStamp(
      entry,
      settings({ stamp: { name: true, rating: true, place: true, date: true } }),
    );
    expect(stamp.rating).toBe("8.5");
    expect(stamp.name).toBe("Margherita");
    expect(stamp.place).toBe("Sorbillo");
    expect(stamp.date).toBe("12.09.2026");
  });

  it("leaves out fields switched off in settings", () => {
    const stamp = buildStamp(
      entry,
      settings({ stamp: { name: true, rating: false, place: false, date: false } }),
    );
    expect(stamp.rating).toBeUndefined();
    expect(stamp.place).toBeUndefined();
    expect(stamp.name).toBe("Margherita");
  });

  it("leaves out a location that was never filled in", () => {
    const homemade: Entry = { ...entry, kind: "homemade", place: undefined };
    expect(buildStamp(homemade, settings()).place).toBeUndefined();
  });

  it("reports an all-off stamp as empty", () => {
    const bare = buildStamp(
      entry,
      settings({ stamp: { name: false, rating: false, place: false, date: false } }),
    );
    expect(isStampEmpty(bare)).toBe(true);
    expect(isStampEmpty(buildStamp(entry, settings()))).toBe(false);
  });
});

describe("stampLayout", () => {
  it("anchors each corner inside the padding", () => {
    expect(stampLayout("tl")).toMatchObject({
      x: CARD_PAD,
      y: CARD_PAD,
      align: "left",
      isTop: true,
    });
    expect(stampLayout("br")).toMatchObject({
      x: CARD_SIZE - CARD_PAD,
      y: CARD_SIZE - CARD_PAD,
      align: "right",
      isTop: false,
    });
  });

  it("stacks downwards from the top and upwards from the bottom", () => {
    expect(stampLayout("tr").direction).toBe("down");
    expect(stampLayout("bl").direction).toBe("up");
  });
});

describe("stampLines", () => {
  it("reads score, where, what by default", () => {
    expect(stampLines(buildStamp(entry, settings()))).toEqual([
      "8.5/10",
      "Sorbillo",
      "Margherita",
    ]);
  });

  it("appends the date when it is switched on", () => {
    const lines = stampLines(
      buildStamp(
        entry,
        settings({ stamp: { name: true, rating: true, place: true, date: true } }),
      ),
    );
    expect(lines).toEqual(["8.5/10", "Sorbillo", "Margherita", "12.09.2026"]);
  });

  it("closes the gap left by a field that is switched off", () => {
    const lines = stampLines(
      buildStamp(
        entry,
        settings({ stamp: { name: true, rating: true, place: false, date: false } }),
      ),
    );
    expect(lines).toEqual(["8.5/10", "Margherita"]);
  });

  it("is empty when nothing is stamped", () => {
    const bare = buildStamp(
      entry,
      settings({ stamp: { name: false, rating: false, place: false, date: false } }),
    );
    expect(stampLines(bare)).toEqual([]);
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("Sorbillo", 20)).toBe("Sorbillo");
  });

  it("ellipsises long text within the budget", () => {
    const result = truncate("Antica Pizzeria Da Michele Forcella", 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith("…")).toBe(true);
    // No stranded space in front of the ellipsis.
    expect(result).not.toMatch(/ …$/);
  });
});

describe("formatStampDate", () => {
  it("uses zero-padded day.month.year", () => {
    expect(formatStampDate(new Date(2026, 8, 5).getTime())).toBe("05.09.2026");
  });
});
