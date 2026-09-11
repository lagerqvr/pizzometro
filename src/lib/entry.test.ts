import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, fieldsFor, toDraft, toEntry, validate, type Draft } from "./entry";
import type { Place } from "./types";

const place: Place = { id: "osm:node/1", name: "Sorbillo" };

function draft(partial: Partial<Draft> = {}): Draft {
  return { ...EMPTY_DRAFT, ...partial };
}

describe("fieldsFor", () => {
  it("asks for a location at a pizzeria", () => {
    expect(fieldsFor("pizzeria").place).toBe(true);
  });

  it("hides the location for a self-made pizza", () => {
    expect(fieldsFor("homemade").place).toBe(false);
  });

  it("hides the style field for dessert / other", () => {
    const fields = fieldsFor("other");
    expect(fields.style).toBe(false);
    expect(fields.place).toBe(true);
    expect(fields.nameLabel).toBe("ITEM");
  });
});

describe("validate", () => {
  it("accepts a bare draft — only the rating really matters", () => {
    expect(validate(draft())).toEqual([]);
  });

  it("rejects ratings outside 0–10", () => {
    expect(validate(draft({ rating: 11 }))).toHaveLength(1);
    expect(validate(draft({ rating: -1 }))).toHaveLength(1);
    expect(validate(draft({ rating: Number.NaN }))).toHaveLength(1);
  });

  it("accepts both ends of the scale", () => {
    expect(validate(draft({ rating: 0 }))).toEqual([]);
    expect(validate(draft({ rating: 10 }))).toEqual([]);
  });

  it("rejects an absurdly long name", () => {
    expect(validate(draft({ name: "x".repeat(61) }))[0].field).toBe("name");
  });
});

describe("toEntry", () => {
  const opts = { id: "e1", createdAt: 1_700_000_000_000 };

  it("drops the location for a self-made pizza even if one was picked", () => {
    const entry = toEntry(draft({ kind: "homemade", place }), opts);
    expect(entry.place).toBeUndefined();
  });

  it("drops the style for dessert / other", () => {
    const entry = toEntry(draft({ kind: "other", style: "Napoletana" }), opts);
    expect(entry.style).toBeUndefined();
  });

  it("keeps the location for a pizzeria", () => {
    expect(toEntry(draft({ place }), opts).place).toEqual(place);
  });

  it("falls back to a sensible name when the field is left blank", () => {
    expect(toEntry(draft({ name: "   " }), opts).name).toBe("Pizza");
    expect(toEntry(draft({ kind: "other", name: "" }), opts).name).toBe("Dolce");
  });

  it("trims whitespace and clamps the rating", () => {
    const entry = toEntry(draft({ name: "  Marinara  ", rating: 99 }), opts);
    expect(entry.name).toBe("Marinara");
    expect(entry.rating).toBe(10);
  });

  it("stores empty optional text as undefined, not an empty string", () => {
    const entry = toEntry(draft({ note: "  ", style: "  " }), opts);
    expect(entry.note).toBeUndefined();
    expect(entry.style).toBeUndefined();
  });

  it("carries the photo id through", () => {
    expect(toEntry(draft(), { ...opts, photoId: "photo:1" }).photoId).toBe(
      "photo:1",
    );
  });
});

describe("toDraft", () => {
  it("round-trips an entry back into an editable draft", () => {
    const entry = toEntry(draft({ name: "Marinara", place, rating: 8.5 }), {
      id: "e1",
      createdAt: 1,
    });
    const back = toDraft(entry);
    expect(back.name).toBe("Marinara");
    expect(back.rating).toBe(8.5);
    expect(back.place).toEqual(place);
    expect(back.note).toBe("");
  });
});

describe("fieldsFor styles", () => {
  it("offers three styles to tap instead of typing", () => {
    expect(fieldsFor("pizzeria").styles).toEqual([
      "Napoletana",
      "Romana",
      "Al taglio",
    ]);
    expect(fieldsFor("homemade").styles).toEqual(fieldsFor("pizzeria").styles);
  });

  it("offers none where there is no style field to hold them", () => {
    const other = fieldsFor("other");
    expect(other.style).toBe(false);
    expect(other.styles).toEqual([]);
  });

  it("suggests a style that survives being saved", () => {
    // A tapped style must not be mangled by the draft normaliser.
    for (const style of fieldsFor("pizzeria").styles) {
      const entry = toEntry(
        { ...EMPTY_DRAFT, kind: "pizzeria", style },
        { id: "x", createdAt: 1 },
      );
      expect(entry.style).toBe(style);
    }
  });
});

describe("the date on a rating", () => {
  it("keeps the moment it was entered when nothing is typed", () => {
    const at = new Date(2026, 8, 12, 20, 30).getTime();
    expect(
      toEntry({ ...EMPTY_DRAFT, date: "" }, { id: "x", createdAt: at })
        .createdAt,
    ).toBe(at);
  });

  it("moves a rating to the evening it was actually eaten", () => {
    // Entered the next morning, put back to the night before.
    const entered = new Date(2026, 8, 13, 9, 0).getTime();
    const moved = toEntry(
      { ...EMPTY_DRAFT, date: "2026-09-12" },
      { id: "x", createdAt: entered },
    ).createdAt;
    const at = new Date(moved);
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(8);
    expect(at.getDate()).toBe(12);
    // The time of day it was entered is kept, so the log's order holds.
    expect(at.getHours()).toBe(9);
  });

  it("ignores a date that is not one", () => {
    const at = new Date(2026, 8, 12, 20, 30).getTime();
    // A Date rolls impossible days over rather than refusing them.
    for (const junk of [
      "",
      "tomorrow",
      "2026-13-40",
      "2026-02-30",
      "12.9.2026",
      "2026-9-1",
    ]) {
      expect(
        toEntry({ ...EMPTY_DRAFT, date: junk }, { id: "x", createdAt: at })
          .createdAt,
      ).toBe(at);
    }
  });

  it("round-trips through the form", () => {
    const entry = toEntry(
      { ...EMPTY_DRAFT, date: "2026-09-12" },
      { id: "x", createdAt: Date.now() },
    );
    expect(toDraft(entry).date).toBe("2026-09-12");
  });
});

describe("stamp corner", () => {
  it("defaults to none, meaning the setting decides", () => {
    expect(EMPTY_DRAFT.corner).toBeNull();
    expect(
      toEntry({ ...EMPTY_DRAFT, rating: 8 }, { id: "x", createdAt: 1 }).corner,
    ).toBeUndefined();
  });

  it("carries a chosen corner onto the rating", () => {
    const entry = toEntry(
      { ...EMPTY_DRAFT, rating: 8, corner: "tr" },
      { id: "x", createdAt: 1 },
    );
    expect(entry.corner).toBe("tr");
  });

  it("survives a round trip through editing", () => {
    const entry = toEntry(
      { ...EMPTY_DRAFT, rating: 8, corner: "br" },
      { id: "x", createdAt: 1 },
    );
    const again = toEntry(toDraft(entry), { id: "x", createdAt: 1 });
    expect(again.corner).toBe("br");
  });

  it("leaves an untouched rating on the setting", () => {
    const entry = toEntry({ ...EMPTY_DRAFT, rating: 8 }, { id: "x", createdAt: 1 });
    expect(toEntry(toDraft(entry), { id: "x", createdAt: 1 }).corner).toBeUndefined();
  });
});
