import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as db from "./db";
import { getSyncState, subscribeEntries, syncNow, tripExists } from "./sync";
import { loadMark, loadRoster, saveTrip } from "./trip";
import type { Entry } from "./types";

const CODE = "abcdef2345";
const rater = { id: "r-rasmus", name: "Rasmus" };

function entry(id: string, patch: Partial<Entry> = {}): Entry {
  return {
    id,
    kind: "pizzeria",
    name: `Pizza ${id}`,
    rating: 8,
    createdAt: 1_000,
    rater,
    ...patch,
  };
}

/** A fake trip endpoint: records what was pushed, replies with `serves`. */
function endpoint(serves: Entry[] = [], now = 5_000, members: unknown[] = []) {
  const pushed: Entry[][] = [];
  const announced: unknown[] = [];
  const photos: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/photos/")) {
      photos.push(url);
      return new Response(
        JSON.stringify({
          url: "https://s.public.blob.vercel-storage.com/p.jpg",
        }),
        { status: 200 },
      );
    }
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      pushed.push(body.entries);
      if (body.member) announced.push(body.member);
      return new Response(JSON.stringify({ saved: 1, now }), { status: 200 });
    }
    return new Response(JSON.stringify({ entries: serves, members, now }), {
      status: 200,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { pushed, announced, photos, fetchMock };
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: online,
    configurable: true,
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  db.resetDbCache();
  localStorage.clear();
  vi.unstubAllGlobals();
  setOnline(true);
});

describe("with no trip", () => {
  it("does nothing at all, and says so", async () => {
    const { fetchMock } = endpoint();
    await syncNow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSyncState().status).toBe("off");
  });
});

describe("offline", () => {
  it("counts what is waiting instead of reaching for the network", async () => {
    saveTrip({ code: CODE, rater });
    await db.putEntry(entry("a"));
    setOnline(false);
    const { fetchMock } = endpoint();

    await syncNow();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSyncState()).toMatchObject({ status: "offline", pending: 1 });
  });
});

describe("a round of syncing", () => {
  it("pushes what is new here and keeps what comes back", async () => {
    saveTrip({ code: CODE, rater });
    await db.putEntry(entry("mine"));
    const theirs = entry("theirs", {
      createdAt: 2_000,
      rater: { id: "r-axel", name: "Axel" },
    });
    const { pushed } = endpoint([theirs]);

    await syncNow();

    expect(pushed[0].map((item) => item.id)).toEqual(["mine"]);
    expect((await db.listEntries()).map((item) => item.id).sort()).toEqual([
      "mine",
      "theirs",
    ]);
    expect(getSyncState()).toMatchObject({ status: "idle", pending: 0 });
  });

  it("moves both markers forward so the next round is quiet", async () => {
    saveTrip({ code: CODE, rater });
    await db.putEntry(entry("a"));
    const first = endpoint([], 7_000);
    await syncNow();

    expect(loadMark().pulledAt).toBe(7_000);
    expect(loadMark().pushedAt).toBeGreaterThan(0);

    // Nothing changed since, so the second round pushes nothing.
    const second = endpoint([], 8_000);
    await syncNow();
    expect(second.pushed).toEqual([]);
    expect(first.fetchMock).not.toBe(second.fetchMock);
  });

  it("tells open screens to reload only when something arrived", async () => {
    saveTrip({ code: CODE, rater });
    const listener = vi.fn();
    const stop = subscribeEntries(listener);

    endpoint([]);
    await syncNow();
    expect(listener).not.toHaveBeenCalled();

    endpoint([entry("theirs", { createdAt: 3_000 })], 9_000);
    await syncNow();
    expect(listener).toHaveBeenCalled();
    stop();
  });

  it("keeps a local edit that is newer than the trip's copy", async () => {
    saveTrip({ code: CODE, rater });
    await db.putEntry(entry("a", { rating: 9, updatedAt: 8_000 }));
    endpoint([entry("a", { rating: 4, updatedAt: 2_000 })]);

    await syncNow();

    expect((await db.getEntry("a"))?.rating).toBe(9);
  });

  it("frees the picture of a rating deleted on the other phone", async () => {
    saveTrip({ code: CODE, rater });
    await db.putPhoto("photo:a", new Blob(["x"], { type: "image/jpeg" }));
    await db.putEntry(entry("a", { photoId: "photo:a" }));
    endpoint([entry("a", { updatedAt: 9_000, deleted: true })]);

    await syncNow();

    expect(await db.getPhoto("photo:a")).toBeUndefined();
    expect(await db.listEntries()).toEqual([]);
  });
});

describe("photos", () => {
  it("uploads the picture before the rating that points at it", async () => {
    saveTrip({ code: CODE, rater });
    await db.putPhoto("photo:a", new Blob(["x"], { type: "image/jpeg" }));
    await db.putEntry(entry("a", { photoId: "photo:a" }));
    const { pushed, photos } = endpoint();

    await syncNow();

    expect(photos[0]).toContain(`/api/trip/${CODE}/photos/photo:a`);
    expect(pushed[0][0].photoUrl).toContain("blob.vercel-storage.com");
    // Recorded locally too, so the next sync does not upload it again.
    expect((await db.getEntry("a"))?.photoUrl).toBeDefined();
  });

  it("holds the entry in the queue when its picture will not go up", async () => {
    saveTrip({ code: CODE, rater });
    await db.putPhoto("photo:a", new Blob(["x"], { type: "image/jpeg" }));
    await db.putEntry(entry("a", { photoId: "photo:a" }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/photos/")) return new Response("no", { status: 502 });
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ saved: 1, now: 5_000 }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ entries: [], now: 5_000 }), {
          status: 200,
        });
      }),
    );

    await syncNow();

    // The rating still went up; the marker did not, so the photo is retried.
    expect(loadMark().pushedAt).toBe(0);
    expect(getSyncState().pending).toBe(1);
  });
});

describe("when the trip cannot be reached", () => {
  it("calls a trip with no store behind it local-only, not broken", async () => {
    saveTrip({ code: CODE, rater });
    await db.putEntry(entry("a"));
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "sync-not-configured" }), {
          status: 503,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await syncNow();

    expect(getSyncState()).toMatchObject({
      status: "unavailable",
      reason: "not-configured",
      pending: 1,
    });

    // And it stops asking: the next automatic round makes no request at all.
    fetchMock.mockClear();
    await syncNow();
    expect(fetchMock).not.toHaveBeenCalled();

    // The SYNC NOW button still gets to try.
    await syncNow(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("keeps the queue and tries again later when the network drops", async () => {
    saveTrip({ code: CODE, rater });
    await db.putEntry(entry("a"));
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));

    await syncNow();

    expect(getSyncState()).toMatchObject({ status: "error", pending: 1 });
    expect(loadMark().pushedAt).toBe(0);
  });
});

describe("joining a trip", () => {
  it("announces this phone even with nothing to push", async () => {
    saveTrip({ code: CODE, rater });
    const { announced, pushed } = endpoint();

    await syncNow();

    // No ratings yet, but the trip is told somebody is here.
    expect(pushed[0]).toEqual([]);
    expect(announced).toEqual([rater]);
  });

  it("announces itself once, not on every sync", async () => {
    saveTrip({ code: CODE, rater });
    const first = endpoint();
    await syncNow();
    expect(first.announced).toHaveLength(1);

    const second = endpoint();
    await syncNow();
    expect(second.announced).toHaveLength(0);
  });

  it("announces again under a new name", async () => {
    saveTrip({ code: CODE, rater });
    endpoint();
    await syncNow();

    saveTrip({ code: CODE, rater: { ...rater, name: "Ras" } });
    const renamed = endpoint();
    await syncNow();

    expect(renamed.announced).toEqual([{ ...rater, name: "Ras" }]);
  });

  it("does not hand one trip's people to the next", async () => {
    saveTrip({ code: CODE, rater });
    endpoint([], 5_000, [rater, { id: "r-axel", name: "Axel" }]);
    await syncNow();
    expect(getSyncState().members).toHaveLength(2);

    // A different trip: the stored roster belongs to the old one.
    expect(loadRoster("othercode1")).toEqual([]);
  });

  it("keeps the roster the trip sends back", async () => {
    saveTrip({ code: CODE, rater });
    const people = [rater, { id: "r-axel", name: "Axel" }];
    endpoint([], 5_000, people);

    await syncNow();

    expect(getSyncState().members).toEqual(people);
    // And remembers it for the next start, before any sync has finished.
    expect(loadRoster(CODE)).toEqual(people);
  });
});

describe("tripExists", () => {
  it("is true for a trip somebody is on, or has rated in", async () => {
    endpoint([], 5_000, [rater]);
    await expect(tripExists(CODE)).resolves.toBe(true);

    endpoint([entry("a")], 5_000, []);
    await expect(tripExists(CODE)).resolves.toBe(true);
  });

  it("is false for a code nobody has ever used", async () => {
    // Exactly what a typo of the right shape looks like.
    endpoint([], 5_000, []);
    await expect(tripExists("zzzzzzzzzz")).resolves.toBe(false);
  });

  it("throws rather than answering when it cannot ask", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    await expect(tripExists(CODE)).rejects.toThrow();
  });

  it("throws on a refusal, which is not the same as an empty trip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );
    await expect(tripExists(CODE)).rejects.toThrow();
  });
});
