import { describe, expect, it } from "vitest";
import {
  byRater,
  changesFrom,
  claim,
  isMine,
  mergeEntries,
  pendingPush,
  ratersOf,
  versionOf,
  visible,
} from "./merge";
import type { Entry, Rater } from "./types";

const axel: Rater = { id: "r-axel", name: "Axel" };
const rasmus: Rater = { id: "r-rasmus", name: "Rasmus" };

function entry(patch: Partial<Entry> & { id: string }): Entry {
  return {
    kind: "pizzeria",
    name: "Margherita",
    rating: 8,
    createdAt: 1_000,
    ...patch,
  };
}

describe("versionOf", () => {
  it("falls back to the creation time on an entry that was never edited", () => {
    expect(versionOf(entry({ id: "a" }))).toBe(1_000);
    expect(versionOf(entry({ id: "a", updatedAt: 5_000 }))).toBe(5_000);
  });
});

describe("changesFrom", () => {
  it("takes an entry this phone has never seen", () => {
    const remote = entry({ id: "new" });
    expect(changesFrom([], [remote])).toEqual([remote]);
  });

  it("takes the newer of two versions", () => {
    const mine = entry({ id: "a", rating: 8, updatedAt: 1_000 });
    const theirs = entry({ id: "a", rating: 9, updatedAt: 2_000 });
    expect(changesFrom([mine], [theirs])).toEqual([theirs]);
  });

  it("keeps a local edit that is newer than the copy in the trip", () => {
    const mine = entry({ id: "a", rating: 9, updatedAt: 3_000 });
    const theirs = entry({ id: "a", rating: 8, updatedAt: 2_000 });
    expect(changesFrom([mine], [theirs])).toEqual([]);
  });

  it("ignores an entry it already has, byte for byte", () => {
    // The pull window overlaps by a few seconds, so this arrives twice.
    const mine = entry({ id: "a", updatedAt: 2_000 });
    expect(changesFrom([mine], [{ ...mine }])).toEqual([]);
  });

  it("lets a delete win a tie, so a deletion cannot come back", () => {
    const mine = entry({ id: "a", updatedAt: 2_000 });
    const tombstone = entry({ id: "a", updatedAt: 2_000, deleted: true });
    expect(changesFrom([mine], [tombstone])).toEqual([tombstone]);
    // …and the same delete does not bounce the other way.
    expect(changesFrom([tombstone], [mine])).toEqual([]);
  });
});

describe("mergeEntries", () => {
  it("keeps both sides' work", () => {
    const merged = mergeEntries(
      [entry({ id: "mine" })],
      [entry({ id: "theirs" })],
    );
    expect(merged.map((item) => item.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("is idempotent — merging the same pull twice changes nothing", () => {
    const local = [entry({ id: "a", updatedAt: 1_000 })];
    const remote = [entry({ id: "a", rating: 9, updatedAt: 2_000 })];
    const once = mergeEntries(local, remote);
    expect(mergeEntries(once, remote)).toEqual(once);
  });
});

describe("pendingPush", () => {
  it("queues only what changed since the last push", () => {
    const entries = [
      entry({ id: "old", createdAt: 1_000 }),
      entry({ id: "fresh", createdAt: 3_000 }),
    ];
    expect(pendingPush(entries, 2_000).map((item) => item.id)).toEqual(["fresh"]);
  });

  it("queues tombstones too, so a delete reaches the other phone", () => {
    const gone = entry({ id: "gone", updatedAt: 4_000, deleted: true });
    expect(pendingPush([gone], 2_000)).toEqual([gone]);
  });
});

describe("claim", () => {
  it("stamps an unclaimed entry and bumps its version", () => {
    const claimed = claim(entry({ id: "a" }), rasmus, 9_000);
    expect(claimed.rater).toEqual(rasmus);
    expect(claimed.updatedAt).toBe(9_000);
  });

  it("leaves somebody else's entry exactly as it was", () => {
    const theirs = entry({ id: "a", rater: axel });
    expect(claim(theirs, rasmus, 9_000)).toBe(theirs);
  });
});

describe("isMine", () => {
  it("says yes to everything when there is no trip", () => {
    expect(isMine(entry({ id: "a", rater: axel }), undefined)).toBe(true);
  });

  it("separates the two people on a trip", () => {
    expect(isMine(entry({ id: "a", rater: axel }), rasmus)).toBe(false);
    expect(isMine(entry({ id: "a", rater: rasmus }), rasmus)).toBe(true);
  });

  it("treats an entry from before the trip as yours", () => {
    expect(isMine(entry({ id: "a" }), rasmus)).toBe(true);
  });
});

describe("visible", () => {
  it("hides tombstones from every screen", () => {
    const entries = [entry({ id: "a" }), entry({ id: "b", deleted: true })];
    expect(visible(entries).map((item) => item.id)).toEqual(["a"]);
  });
});

describe("ratersOf / byRater", () => {
  const entries = [
    entry({ id: "a", rater: rasmus }),
    entry({ id: "b", rater: axel }),
    entry({ id: "c", rater: rasmus }),
    entry({ id: "d" }),
  ];

  it("lists each person once, in the order they appear", () => {
    expect(ratersOf(entries)).toEqual([rasmus, axel]);
  });

  it("splits the board by person, and null keeps everything", () => {
    expect(byRater(entries, rasmus.id).map((item) => item.id)).toEqual(["a", "c"]);
    expect(byRater(entries, null)).toHaveLength(4);
  });
});
