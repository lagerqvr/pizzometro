import { describe, expect, it } from "vitest";
import {
  entryPath,
  isSafeId,
  newestVersions,
  parseEntryPath,
  sanitiseEntry,
} from "./wire";
import type { Entry } from "./types";

const entry: Entry = {
  id: "e1",
  kind: "pizzeria",
  name: "Margherita",
  rating: 8.5,
  createdAt: 1_000,
};

describe("paths", () => {
  it("puts the version in the path, so nothing is ever overwritten", () => {
    expect(entryPath("abcdef2345", entry)).toBe(
      "trips/abcdef2345/entries/e1/1000.json",
    );
    expect(entryPath("abcdef2345", { ...entry, updatedAt: 4_000 })).toBe(
      "trips/abcdef2345/entries/e1/4000.json",
    );
  });

  it("round-trips back to an id and a version", () => {
    expect(parseEntryPath(entryPath("abcdef2345", entry))).toEqual({
      id: "e1",
      version: 1_000,
    });
    expect(parseEntryPath("trips/x/photos/p1")).toBeNull();
  });

  it("accepts the ids the app actually makes", () => {
    expect(isSafeId("photo:0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isSafeId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isSafeId("e1-2_3")).toBe(true);
  });

  it("rejects ids that are not safe to put in a path", () => {
    expect(isSafeId("../secret")).toBe(false);
    expect(isSafeId("a/b")).toBe(false);
    expect(isSafeId("a.b")).toBe(false);
    expect(isSafeId("")).toBe(false);
    expect(isSafeId("x".repeat(65))).toBe(false);
  });
});

describe("newestVersions", () => {
  it("keeps only the latest version of each entry", () => {
    const blobs = [
      { pathname: "trips/t/entries/a/100.json" },
      { pathname: "trips/t/entries/a/300.json" },
      { pathname: "trips/t/entries/b/200.json" },
      { pathname: "trips/t/photos/p1" },
    ];
    expect(newestVersions(blobs).map((blob) => blob.pathname).sort()).toEqual([
      "trips/t/entries/a/300.json",
      "trips/t/entries/b/200.json",
    ]);
  });
});

describe("sanitiseEntry", () => {
  it("passes a well-formed entry through", () => {
    expect(sanitiseEntry({ ...entry })).toMatchObject({
      id: "e1",
      name: "Margherita",
      rating: 8.5,
    });
  });

  it("drops fields nobody asked for", () => {
    const dirty = sanitiseEntry({ ...entry, evil: "<script>" }) as Record<
      string,
      unknown
    >;
    expect(dirty.evil).toBeUndefined();
  });

  it("refuses an entry with no usable id or rating", () => {
    expect(sanitiseEntry({ ...entry, id: "../../etc" })).toBeNull();
    expect(sanitiseEntry({ ...entry, rating: "nine" })).toBeNull();
    expect(sanitiseEntry(null)).toBeNull();
    expect(sanitiseEntry("nope")).toBeNull();
  });

  it("clamps a rating that arrived out of range", () => {
    expect(sanitiseEntry({ ...entry, rating: 99 })?.rating).toBe(10);
    expect(sanitiseEntry({ ...entry, rating: -3 })?.rating).toBe(0);
  });

  it("only accepts a photo URL that points back at the blob store", () => {
    const good = "https://x1.public.blob.vercel-storage.com/trips/t/photos/p1";
    expect(sanitiseEntry({ ...entry, photoUrl: good })?.photoUrl).toBe(good);
    expect(
      sanitiseEntry({ ...entry, photoUrl: "https://evil.example.com/p.jpg" })
        ?.photoUrl,
    ).toBeUndefined();
    expect(
      sanitiseEntry({ ...entry, photoUrl: "javascript:alert(1)" })?.photoUrl,
    ).toBeUndefined();
  });

  it("keeps the photo key that the local store uses", () => {
    const photoId = "photo:0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(sanitiseEntry({ ...entry, photoId })?.photoId).toBe(photoId);
  });

  it("keeps a tombstone a tombstone", () => {
    expect(sanitiseEntry({ ...entry, deleted: true })?.deleted).toBe(true);
    expect(sanitiseEntry({ ...entry, deleted: "yes" })?.deleted).toBeUndefined();
  });

  it("falls back to a sane kind and name", () => {
    const odd = sanitiseEntry({ ...entry, kind: "sushi", name: "   " });
    expect(odd?.kind).toBe("pizzeria");
    expect(odd?.name).toBe("Pizza");
  });
});
