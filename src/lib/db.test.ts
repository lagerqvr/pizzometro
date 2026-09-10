import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  deleteEntry,
  exportEntries,
  getEntry,
  getPhoto,
  listAllEntries,
  listEntries,
  newId,
  putEntries,
  putEntry,
  putPhoto,
  resetDbCache,
} from "./db";
import type { Entry } from "./types";

function entry(id: string, createdAt: number): Entry {
  return { id, kind: "pizzeria", name: `Pizza ${id}`, rating: 8, createdAt };
}

beforeEach(() => {
  // Each test gets a clean database.
  globalThis.indexedDB = new IDBFactory();
  resetDbCache();
});

describe("entries", () => {
  it("stores and reads back an entry", async () => {
    await putEntry(entry("a", 1));
    expect((await getEntry("a"))?.name).toBe("Pizza a");
  });

  it("returns undefined for an id that was never stored", async () => {
    expect(await getEntry("nope")).toBeUndefined();
  });

  it("lists newest first", async () => {
    await putEntry(entry("old", 1_000));
    await putEntry(entry("new", 9_000));
    expect((await listEntries()).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("overwrites on a repeated id rather than duplicating", async () => {
    await putEntry(entry("a", 1));
    await putEntry({ ...entry("a", 1), rating: 3 });
    const all = await listEntries();
    expect(all).toHaveLength(1);
    expect(all[0].rating).toBe(3);
  });

  it("deletes the entry and its photo together", async () => {
    await putPhoto("photo:a", new Blob(["x"]));
    await putEntry({ ...entry("a", 1), photoId: "photo:a" });
    await deleteEntry("a");
    expect(await getEntry("a")).toBeUndefined();
    expect(await getPhoto("photo:a")).toBeUndefined();
  });

  it("deletes cleanly when there is no photo", async () => {
    await putEntry(entry("a", 1));
    await expect(deleteEntry("a")).resolves.toBeUndefined();
  });
});

describe("photos", () => {
  it("round-trips a blob", async () => {
    await putPhoto("photo:a", new Blob(["hello"], { type: "image/jpeg" }));
    const blob = await getPhoto("photo:a");
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob!.text()).toBe("hello");
  });
});

describe("exportEntries", () => {
  it("emits a versioned JSON document", async () => {
    await putEntry(entry("a", 1));
    const parsed = JSON.parse(await exportEntries());
    expect(parsed.app).toBe("pizzometro");
    expect(parsed.entries).toHaveLength(1);
  });
});

describe("newId", () => {
  it("does not collide across calls", () => {
    const ids = new Set(Array.from({ length: 200 }, newId));
    expect(ids.size).toBe(200);
  });
});

describe("deleting inside a trip", () => {
  it("leaves a tombstone that the log does not show", async () => {
    await putEntry(entry("a", 1_000));
    await deleteEntry("a", true);

    expect(await listEntries()).toEqual([]);
    const tombstone = await getEntry("a");
    expect(tombstone?.deleted).toBe(true);
    // Still there for the sync engine to push at the other phone.
    expect(await listAllEntries()).toHaveLength(1);
  });

  it("takes the photo with it either way", async () => {
    await putPhoto("photo:a", new Blob(["x"], { type: "image/jpeg" }));
    await putEntry({ ...entry("a", 1_000), photoId: "photo:a" });
    await deleteEntry("a", true);

    expect(await getPhoto("photo:a")).toBeUndefined();
    expect((await getEntry("a"))?.photoId).toBeUndefined();
  });

  it("removes the row outright when there is no trip", async () => {
    await putEntry(entry("a", 1_000));
    await deleteEntry("a");
    expect(await getEntry("a")).toBeUndefined();
    expect(await listAllEntries()).toEqual([]);
  });
});

describe("putEntries", () => {
  it("writes a pull in one go", async () => {
    await putEntries([entry("a", 1_000), entry("b", 2_000)]);
    expect((await listEntries()).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("does nothing with an empty batch", async () => {
    await putEntries([]);
    expect(await listEntries()).toEqual([]);
  });
});
