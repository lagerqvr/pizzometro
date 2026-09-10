import { describe, expect, it } from "vitest";
import {
  initialOf,
  isTripCode,
  joinLink,
  newRater,
  newTripCode,
  normaliseCode,
  parseMark,
  parseTrip,
} from "./trip";

describe("trip codes", () => {
  it("generates codes that pass its own gate", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isTripCode(newTripCode())).toBe(true);
    }
  });

  it("generates a different code each time", () => {
    const codes = new Set(Array.from({ length: 50 }, newTripCode));
    expect(codes.size).toBe(50);
  });

  it("forgives how a code was typed", () => {
    expect(normaliseCode("  ABCD-EF2345 ")).toBe("abcdef2345");
  });

  it("rejects anything that could escape a storage path", () => {
    expect(isTripCode("../../etc")).toBe(false);
    expect(isTripCode("abc/def123")).toBe(false);
    expect(isTripCode("short")).toBe(false);
    expect(isTripCode("waytoolongacode")).toBe(false);
    expect(isTripCode(42)).toBe(false);
  });
});

describe("raters", () => {
  it("trims a name and never ends up empty", () => {
    expect(newRater("  Rasmus  ").name).toBe("Rasmus");
    expect(newRater("   ").name).toBe("Anon");
  });

  it("gives each device its own id", () => {
    expect(newRater("Axel").id).not.toBe(newRater("Axel").id);
  });

  it("reads an initial off a name", () => {
    expect(initialOf({ id: "1", name: "axel" })).toBe("A");
    expect(initialOf(undefined)).toBe("?");
  });
});

describe("parseTrip", () => {
  it("reads back what was stored", () => {
    const raw = JSON.stringify({
      code: "abcdef2345",
      rater: { id: "r1", name: "Axel" },
    });
    expect(parseTrip(raw)).toEqual({
      code: "abcdef2345",
      rater: { id: "r1", name: "Axel" },
    });
  });

  it("refuses a stored trip whose code would not be accepted now", () => {
    expect(parseTrip('{"code":"../x","rater":{"id":"r","name":"A"}}')).toBeNull();
  });

  it("survives junk in storage", () => {
    expect(parseTrip("not json")).toBeNull();
    expect(parseTrip('{"code":"abcdef2345"}')).toBeNull();
    expect(parseTrip(null)).toBeNull();
  });
});

describe("parseMark", () => {
  it("starts from zero when nothing has synced yet", () => {
    expect(parseMark(null)).toEqual({ pushedAt: 0, pulledAt: 0 });
    expect(parseMark("{}")).toEqual({ pushedAt: 0, pulledAt: 0 });
    expect(parseMark("broken")).toEqual({ pushedAt: 0, pulledAt: 0 });
  });

  it("keeps the two halves apart", () => {
    expect(parseMark('{"pushedAt":5,"pulledAt":9}')).toEqual({
      pushedAt: 5,
      pulledAt: 9,
    });
  });
});

describe("joinLink", () => {
  it("builds a link the other phone can open", () => {
    expect(joinLink("abcdef2345", "https://pizzometro.lagerqvr.com/")).toBe(
      "https://pizzometro.lagerqvr.com/join?trip=abcdef2345",
    );
  });
});
