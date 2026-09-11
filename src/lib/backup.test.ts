import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  backupFileName,
  buildBackup,
  exportMessage,
  importMessage,
  restoreBackup,
} from "./backup";
import {
  deleteEntry,
  getPhoto,
  listAllEntries,
  listEntries,
  putEntry,
  putPhoto,
  resetDbCache,
  thumbKey,
} from "./db";
import { DEFAULT_SETTINGS } from "./types";
import { unzip } from "./zip";
import type { Entry, Rater, Settings } from "./types";

const ME: Rater = { id: "me", name: "Rasmus" };
const THEM: Rater = { id: "them", name: "Axel" };

function entry(id: string, over: Partial<Entry> = {}): Entry {
  return {
    id,
    kind: "pizzeria",
    name: `Pizza ${id}`,
    rating: 8.3,
    createdAt: 1_700_000_000_000,
    ...over,
  };
}

async function withPhoto(id: string, over: Partial<Entry> = {}) {
  const photoId = `photo:${id}`;
  await putPhoto(photoId, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
  await putPhoto(thumbKey(photoId), new Blob([new Uint8Array([9])], { type: "image/jpeg" }));
  await putEntry(entry(id, { photoId, ...over }));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbCache();
});

describe("buildBackup", () => {
  it("carries the settings, the ratings and the photos", async () => {
    await withPhoto("a");
    const settings: Settings = { ...DEFAULT_SETTINGS, stampCorner: "tr" };

    const { blob, entries } = await buildBackup(undefined, settings);
    const files = unzip(await blob.arrayBuffer());

    expect(entries).toBe(1);
    expect([...files.keys()].sort()).toEqual([
      "photos/a.jpg",
      "pizzometro.json",
      "thumbs/a.jpg",
    ]);
    const manifest = JSON.parse(new TextDecoder().decode(files.get("pizzometro.json")));
    expect(manifest.app).toBe("pizzometro");
    expect(manifest.settings.stampCorner).toBe("tr");
    expect(manifest.entries[0].name).toBe("Pizza a");
    expect([...files.get("photos/a.jpg")!]).toEqual([1, 2, 3]);
  });

  it("takes only my ratings when I am on a trip", async () => {
    await putEntry(entry("mine", { rater: ME }));
    await putEntry(entry("theirs", { rater: THEM }));
    await putEntry(entry("unclaimed"));

    const { blob, entries } = await buildBackup(ME, DEFAULT_SETTINGS);
    const files = unzip(await blob.arrayBuffer());
    const manifest = JSON.parse(new TextDecoder().decode(files.get("pizzometro.json")));

    expect(entries).toBe(2);
    expect(manifest.entries.map((e: Entry) => e.id).sort()).toEqual([
      "mine",
      "unclaimed",
    ]);
  });

  it("takes everything when there is no trip", async () => {
    await putEntry(entry("mine", { rater: ME }));
    await putEntry(entry("theirs", { rater: THEM }));
    const { entries } = await buildBackup(undefined, DEFAULT_SETTINGS);
    expect(entries).toBe(2);
  });

  it("leaves out tombstones", async () => {
    await putEntry(entry("gone"));
    await deleteEntry("gone", true);
    const { entries } = await buildBackup(undefined, DEFAULT_SETTINGS);
    expect(entries).toBe(0);
  });

  it("drops the trip's photo URLs, which outlive nothing", async () => {
    await putEntry(
      entry("a", { photoUrl: "https://blob/x.jpg", thumbUrl: "https://blob/t.jpg" }),
    );
    const { blob } = await buildBackup(undefined, DEFAULT_SETTINGS);
    const files = unzip(await blob.arrayBuffer());
    const manifest = JSON.parse(new TextDecoder().decode(files.get("pizzometro.json")));
    expect(manifest.entries[0].photoUrl).toBeUndefined();
    expect(manifest.entries[0].thumbUrl).toBeUndefined();
  });

  it("copes with a rating whose photo has gone missing", async () => {
    await putEntry(entry("a", { photoId: "photo:a" })); // no bytes stored
    const { blob, entries } = await buildBackup(undefined, DEFAULT_SETTINGS);
    const files = unzip(await blob.arrayBuffer());
    const manifest = JSON.parse(new TextDecoder().decode(files.get("pizzometro.json")));
    expect(entries).toBe(1);
    expect(manifest.entries[0].photoId).toBeUndefined();
  });
});

describe("restoreBackup", () => {
  async function backupOf(entries: Entry[], settings = DEFAULT_SETTINGS) {
    for (const e of entries) await putEntry(e);
    const { blob } = await buildBackup(undefined, settings);
    globalThis.indexedDB = new IDBFactory(); // a fresh phone
    resetDbCache();
    return blob;
  }

  it("puts the ratings and photos back on an empty phone", async () => {
    await withPhoto("a");
    const { blob } = await buildBackup(undefined, DEFAULT_SETTINGS);
    globalThis.indexedDB = new IDBFactory();
    resetDbCache();

    const result = await restoreBackup(blob);
    expect(result).toMatchObject({ added: 1, skipped: 0 });

    const back = await listEntries();
    expect(back[0].name).toBe("Pizza a");
    expect(back[0].rating).toBe(8.3);
    const photo = await getPhoto("photo:a");
    expect(await photo!.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(await getPhoto(thumbKey("photo:a"))).toBeDefined();
  });

  it("brings the settings back", async () => {
    const blob = await backupOf([entry("a")], {
      ...DEFAULT_SETTINGS,
      stampCorner: "tr",
      photoQuality: "full",
    });
    const result = await restoreBackup(blob);
    expect(result.settings.stampCorner).toBe("tr");
    expect(result.settings.photoQuality).toBe("full");
  });

  it("changes nothing the second time", async () => {
    const blob = await backupOf([entry("a"), entry("b")]);

    const first = await restoreBackup(blob);
    expect(first).toMatchObject({ added: 2, skipped: 0 });
    const after = await listAllEntries();

    const second = await restoreBackup(blob);
    expect(second).toMatchObject({ added: 0, skipped: 2 });
    expect(await listAllEntries()).toEqual(after);
  });

  it("adds only what is missing", async () => {
    const blob = await backupOf([entry("a"), entry("b")]);
    await putEntry(entry("a", { name: "Edited here" }));

    const result = await restoreBackup(blob);
    expect(result).toMatchObject({ added: 1, skipped: 1 });
    // The copy already here wins: an import never overwrites.
    const held = await listEntries();
    expect(held.find((e) => e.id === "a")!.name).toBe("Edited here");
    expect(held.find((e) => e.id === "b")).toBeDefined();
  });

  it("does not resurrect something deleted since the backup", async () => {
    const blob = await backupOf([entry("a")]);
    await putEntry(entry("a"));
    await deleteEntry("a", true); // tombstoned, as inside a trip

    const result = await restoreBackup(blob);
    expect(result).toMatchObject({ added: 0, skipped: 1 });
    expect(await listEntries()).toHaveLength(0);
  });

  it("dates restored ratings now, so they still push to a trip", async () => {
    const blob = await backupOf([entry("a", { updatedAt: 1 })]);
    await restoreBackup(blob, undefined, 5_000);
    const [back] = await listAllEntries();
    expect(back.updatedAt).toBe(5_000);
    // When it was eaten is not touched.
    expect(back.createdAt).toBe(1_700_000_000_000);
  });

  it("makes restored ratings mine when I am on a trip", async () => {
    const blob = await backupOf([entry("a")]);
    await restoreBackup(blob, ME);
    const [back] = await listEntries();
    expect(back.rater).toEqual(ME);
  });

  it("keeps a per-picture corner", async () => {
    const blob = await backupOf([entry("a", { corner: "tr" })]);
    await restoreBackup(blob);
    const [back] = await listEntries();
    expect(back.corner).toBe("tr");
  });

  it("refuses a file that is not a backup", async () => {
    const notAZip = new Blob([new TextEncoder().encode("hello")]);
    await expect(restoreBackup(notAZip)).rejects.toThrow(/not a zip/i);
  });

  it("refuses a zip that is not ours", async () => {
    const { zip } = await import("./zip");
    const stranger = zip([
      { name: "notes.txt", bytes: new TextEncoder().encode("hi") },
    ]);
    await expect(restoreBackup(stranger)).rejects.toThrow(/not a pizzometro backup/i);
  });

  it("refuses a damaged manifest", async () => {
    const { zip } = await import("./zip");
    const broken = zip([
      { name: "pizzometro.json", bytes: new TextEncoder().encode("{not json") },
    ]);
    await expect(restoreBackup(broken)).rejects.toThrow(/damaged/i);
  });
});

describe("messages", () => {
  it("counts in the singular and the plural", () => {
    expect(exportMessage(1)).toBe("Backed up 1 rating");
    expect(exportMessage(4)).toBe("Backed up 4 ratings");
    expect(exportMessage(0)).toBe("Nothing to export yet");
  });

  it("says what an import actually did", () => {
    const base = { settings: DEFAULT_SETTINGS };
    expect(importMessage({ ...base, added: 3, skipped: 0 })).toBe("Restored 3 ratings");
    expect(importMessage({ ...base, added: 1, skipped: 2 })).toBe(
      "Restored 1 rating, 2 already here",
    );
    expect(importMessage({ ...base, added: 0, skipped: 5 })).toBe(
      "Already up to date — all 5 were here",
    );
    expect(importMessage({ ...base, added: 0, skipped: 0 })).toBe("That backup was empty");
  });

  it("names the file by the day", () => {
    expect(backupFileName(new Date(2026, 8, 11))).toBe("pizzometro-20260911.zip");
  });
});
