import { describe, expect, it } from "vitest";
import {
  CARD_PAD,
  CARD_SIZE,
  buildStamp,
  cardSize,
  stampChars,
  stampType,
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

describe("stamp sizes", () => {
  it("gives three steps, medium when nothing is stored", () => {
    expect(stampType("s")).toBe(24);
    expect(stampType("m")).toBe(38);
    expect(stampType("l")).toBe(48);
    expect(stampType(undefined)).toBe(38);
  });

  it("fits fewer characters on a line as the text grows", () => {
    const small = stampChars(stampType("s"));
    const large = stampChars(stampType("l"));
    expect(small).toBeGreaterThan(large);
    // Whatever the size, a line has to stay inside the padding.
    for (const size of ["s", "m", "l"] as const) {
      const type = stampType(size);
      expect(stampChars(type) * type * 0.6).toBeLessThanOrEqual(
        CARD_SIZE - CARD_PAD * 2,
      );
    }
  });
});

describe("stampLines at a size", () => {
  it("truncates a long place to what the chosen size allows", () => {
    const stamp = {
      rating: "9",
      place: "Antica Pizzeria Da Michele Forcella Napoli Centro",
      name: "Margherita",
    };
    const large = stampLines(stamp, stampType("l"));
    const small = stampLines(stamp, stampType("s"));
    expect(large[1].length).toBeLessThan(small[1].length);
    expect(large[1].endsWith("…")).toBe(true);
  });
});

describe("cardSize", () => {
  it("is a square when a square is asked for, whatever the photo", () => {
    expect(cardSize({ width: 4000, height: 3000 }, true)).toEqual({
      width: CARD_SIZE,
      height: CARD_SIZE,
    });
  });

  it("keeps a landscape photo's shape, long side first", () => {
    expect(cardSize({ width: 4000, height: 3000 }, false)).toEqual({
      width: 1080,
      height: 810,
    });
  });

  it("keeps a portrait photo's shape", () => {
    expect(cardSize({ width: 3000, height: 4000 }, false)).toEqual({
      width: 810,
      height: 1080,
    });
  });

  it("keeps the photo's own size when asked for one", () => {
    // A 1737x3088 phone photo, kept whole rather than shrunk to 1080.
    expect(cardSize({ width: 1737, height: 3088 }, false, 3088)).toEqual({
      width: 1737,
      height: 3088,
    });
  });

  it("cuts the biggest square the photo can give", () => {
    expect(cardSize({ width: 1737, height: 3088 }, true, 3088)).toEqual({
      width: 1737,
      height: 1737,
    });
  });

  it("never invents pixels the photo does not have", () => {
    const small = cardSize({ width: 800, height: 600 }, false, 4096);
    expect(small).toEqual({ width: 800, height: 600 });
    expect(cardSize({ width: 800, height: 600 }, true, 4096)).toEqual({
      width: 600,
      height: 600,
    });
  });

  it("falls back to a square rather than dividing by nothing", () => {
    expect(cardSize({ width: 0, height: 0 }, false)).toEqual({
      width: CARD_SIZE,
      height: CARD_SIZE,
    });
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

  it("anchors to the corners of a picture that is not square", () => {
    const layout = stampLayout("br", 1080, CARD_PAD, 810);
    expect(layout.x).toBe(1080 - CARD_PAD);
    expect(layout.y).toBe(810 - CARD_PAD);
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
