import { describe, expect, it } from "vitest";
import { onTrip } from "./page";
import type { Entry, Rater } from "@/lib/types";

const rasmus: Rater = { id: "r1", name: "Rasmus" };
const axel: Rater = { id: "r2", name: "Axel" };
const eva: Rater = { id: "r3", name: "Eva" };

function rated(by: Rater): Entry {
  return {
    id: by.id,
    kind: "pizzeria",
    name: "Margherita",
    rating: 8,
    createdAt: 1_000,
    rater: by,
  };
}

describe("onTrip", () => {
  it("lists the roster, not everyone who has ever rated", () => {
    // Eva left; her ratings stay in the trip, but she is not on it.
    expect(
      onTrip([rasmus, axel], [rated(rasmus), rated(eva)], "Rasmus"),
    ).toEqual(["Rasmus", "Axel"]);
  });

  it("includes somebody who has joined but not rated yet", () => {
    expect(onTrip([rasmus, axel], [rated(rasmus)], "Rasmus")).toEqual([
      "Rasmus",
      "Axel",
    ]);
  });

  it("falls back to who has rated until a roster arrives", () => {
    expect(onTrip([], [rated(rasmus), rated(axel)], "Rasmus")).toEqual([
      "Rasmus",
      "Axel",
    ]);
  });

  it("always includes you, even before anything has synced", () => {
    expect(onTrip([], [], "Rasmus")).toEqual(["Rasmus"]);
  });

  it("says each name once", () => {
    expect(onTrip([rasmus, rasmus], [rated(rasmus)], "Rasmus")).toEqual([
      "Rasmus",
    ]);
  });
});
