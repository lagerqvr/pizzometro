import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

const renderCard = vi.fn<(...args: unknown[]) => Promise<Blob>>(async () =>
  new Blob(["card"], { type: "image/jpeg" }),
);
vi.mock("./render", () => ({
  renderCard: (...args: unknown[]) => renderCard(...args),
  shrinkPhoto: async (blob: Blob) => blob,
}));

const { buildCards, bulkMessage, photographed } = await import("./bulk");
const { putPhoto, resetDbCache } = await import("./db");
const { DEFAULT_SETTINGS } = await import("./types");
import type { Entry } from "./types";

function entry(id: string, patch: Partial<Entry> = {}): Entry {
  return {
    id,
    kind: "pizzeria",
    name: `Pizza ${id}`,
    rating: 8,
    createdAt: 1_000,
    photoId: `photo:${id}`,
    ...patch,
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbCache();
  renderCard.mockClear();
});

describe("photographed", () => {
  it("takes the trip in the order it happened", () => {
    const entries = [
      entry("late", { createdAt: 3_000 }),
      entry("early", { createdAt: 1_000 }),
      entry("middle", { createdAt: 2_000 }),
    ];
    expect(photographed(entries).map((item) => item.id)).toEqual([
      "early",
      "middle",
      "late",
    ]);
  });

  it("skips ratings with no picture, and deleted ones", () => {
    const entries = [
      entry("keep"),
      entry("no-photo", { photoId: undefined }),
      entry("gone", { deleted: true }),
    ];
    expect(photographed(entries).map((item) => item.id)).toEqual(["keep"]);
  });
});

describe("buildCards", () => {
  it("renders one file per rating that has its photo here", async () => {
    await putPhoto("photo:a", new Blob(["x"], { type: "image/jpeg" }));
    await putPhoto("photo:b", new Blob(["y"], { type: "image/jpeg" }));

    const files = await buildCards(
      [entry("a"), entry("b")],
      DEFAULT_SETTINGS,
    );

    expect(files).toHaveLength(2);
    expect(files[0].name).toMatch(/^pizzometro-\d{8}-pizza-a\.jpg$/);
    expect(files[0].type).toBe("image/jpeg");
  });

  it("skips a photo it cannot find rather than failing the batch", async () => {
    await putPhoto("photo:a", new Blob(["x"], { type: "image/jpeg" }));
    // "b" has no bytes here and no URL to fetch them from.
    const files = await buildCards([entry("a"), entry("b")], DEFAULT_SETTINGS);
    expect(files).toHaveLength(1);
  });

  it("keeps one broken photo from costing the others", async () => {
    await putPhoto("photo:a", new Blob(["x"], { type: "image/jpeg" }));
    await putPhoto("photo:b", new Blob(["y"], { type: "image/jpeg" }));
    renderCard.mockRejectedValueOnce(new Error("undecodable"));

    const files = await buildCards([entry("a"), entry("b")], DEFAULT_SETTINGS);

    expect(files).toHaveLength(1);
  });

  it("reports progress from nothing to done", async () => {
    await putPhoto("photo:a", new Blob(["x"], { type: "image/jpeg" }));
    const seen: string[] = [];

    await buildCards([entry("a")], DEFAULT_SETTINGS, (progress) =>
      seen.push(`${progress.done}/${progress.total}`),
    );

    expect(seen[0]).toBe("0/1");
    expect(seen.at(-1)).toBe("1/1");
  });

  it("fetches a photo taken on the other phone, and keeps it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Blob(["remote"]), { status: 200 })),
    );
    const remote = entry("r", {
      photoUrl: "https://s.public.blob.vercel-storage.com/p.jpg",
    });

    const files = await buildCards([remote], DEFAULT_SETTINGS);

    expect(files).toHaveLength(1);
    // Cached on the way past, so it is free next time.
    const { getPhoto } = await import("./db");
    expect(await getPhoto("photo:r")).toBeDefined();
    vi.unstubAllGlobals();
  });
});

describe("bulkMessage", () => {
  it("tells you what to tap on iOS", () => {
    expect(bulkMessage("shared", 12)).toContain("Save 12 Images");
  });

  it("does not call a cancelled save a failure", () => {
    expect(bulkMessage("cancelled", 3)).toContain("still here");
  });
});
