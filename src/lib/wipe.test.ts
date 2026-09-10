import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { getEntry, putEntry, putPhoto, resetDbCache } from "./db";
import { clearLocalKeys, eraseDevice, ownedKeys } from "./wipe";
import type { Entry } from "./types";

const entry: Entry = {
  id: "a",
  kind: "pizzeria",
  name: "Margherita",
  rating: 8,
  createdAt: 1_000,
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbCache();
  localStorage.clear();
});

describe("ownedKeys", () => {
  it("claims only what the app wrote", () => {
    const keys = [
      "pizzometro:settings",
      "pizzometro:trip",
      "pizzometro:rater-id",
      "theme",
      "some-other-app:token",
    ];
    expect(ownedKeys(keys)).toEqual([
      "pizzometro:settings",
      "pizzometro:trip",
      "pizzometro:rater-id",
    ]);
  });
});

describe("clearLocalKeys", () => {
  it("leaves other sites' storage alone", () => {
    localStorage.setItem("pizzometro:trip", "{}");
    localStorage.setItem("pizzometro:rater-id", "r1");
    localStorage.setItem("unrelated", "keep me");

    clearLocalKeys();

    expect(localStorage.getItem("pizzometro:trip")).toBeNull();
    expect(localStorage.getItem("pizzometro:rater-id")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep me");
  });
});

describe("eraseDevice", () => {
  it("takes the ratings, the photos and the settings with it", async () => {
    await putEntry(entry);
    await putPhoto("photo:a", new Blob(["x"], { type: "image/jpeg" }));
    localStorage.setItem("pizzometro:settings", '{"stampCorner":"br"}');

    await eraseDevice();

    expect(await getEntry("a")).toBeUndefined();
    expect(localStorage.getItem("pizzometro:settings")).toBeNull();
  });

  it("leaves a phone that can be used again straight away", async () => {
    await putEntry(entry);
    await eraseDevice();
    // The database reopens empty rather than staying broken.
    await putEntry({ ...entry, id: "b" });
    expect((await getEntry("b"))?.id).toBe("b");
  });
});
