import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("@vercel/blob", () => ({
  list: (...args: unknown[]) => list(...args),
  put: (...args: unknown[]) => put(...args),
  del: (...args: unknown[]) => del(...args),
}));

const { GET, POST, DELETE } = await import("./route");

const CODE = "abcdef2345";
const params = (code = CODE) => ({ params: Promise.resolve({ code }) });

function blob(pathname: string, uploadedAt: number) {
  return {
    pathname,
    url: `https://store.public.blob.vercel-storage.com/${pathname}`,
    uploadedAt: new Date(uploadedAt),
  };
}

function stored(id: string, version: number, extra: object = {}) {
  return {
    id,
    kind: "pizzeria",
    name: `Pizza ${id}`,
    rating: 8,
    createdAt: version,
    ...extra,
  };
}

/**
 * The endpoint lists two prefixes now — the ratings and the roster — so the
 * mock answers by prefix rather than by call order.
 */
function lists(
  byPrefix: Record<string, Array<ReturnType<typeof blob>>>,
  pages: Record<string, Array<{ blobs: unknown[]; hasMore: boolean; cursor?: string }>> = {},
) {
  const taken: Record<string, number> = {};
  list.mockImplementation(async ({ prefix }: { prefix: string }) => {
    const kind = prefix.includes("/members/") ? "members" : "entries";
    const paged = pages[kind];
    if (paged) {
      const index = taken[kind] ?? 0;
      taken[kind] = index + 1;
      return paged[Math.min(index, paged.length - 1)];
    }
    return { blobs: byPrefix[kind] ?? [], hasMore: false };
  });
}

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  list.mockReset();
  put.mockReset();
  del.mockReset();
  del.mockResolvedValue(undefined);
  put.mockResolvedValue({ url: "https://store.public.blob.vercel-storage.com/x" });
});

afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.unstubAllGlobals();
});

/** Serves each blob URL from a map of pathname → JSON. */
function serve(contents: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const pathname = url.split("blob.vercel-storage.com/")[1];
      const body = contents[pathname];
      if (!body) return new Response("missing", { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

describe("GET /api/trip/[code]", () => {
  it("turns away a code that could escape the store", async () => {
    const response = await GET(new Request("http://x/"), params("../etc"));
    expect(response.status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it("says so when no blob store is attached yet", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const response = await GET(new Request("http://x/"), params());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "sync-not-configured" });
  });

  it("returns only the newest version of each entry", async () => {
    lists({
      entries: [
        blob(`trips/${CODE}/entries/a/100.json`, 100),
        blob(`trips/${CODE}/entries/a/300.json`, 300),
      ],
    });
    serve({
      [`trips/${CODE}/entries/a/100.json`]: stored("a", 100, { rating: 5 }),
      [`trips/${CODE}/entries/a/300.json`]: stored("a", 300, { rating: 9 }),
    });

    const response = await GET(new Request("http://x/"), params());
    const body = await response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].rating).toBe(9);
  });

  it("sends back only what changed since the last pull", async () => {
    lists({
      entries: [
        blob(`trips/${CODE}/entries/old/100.json`, 100_000),
        blob(`trips/${CODE}/entries/new/900.json`, 900_000),
      ],
    });
    serve({
      [`trips/${CODE}/entries/old/100.json`]: stored("old", 100),
      [`trips/${CODE}/entries/new/900.json`]: stored("new", 900),
    });

    const response = await GET(
      new Request("http://x/?since=500000"),
      params(),
    );
    const body = await response.json();
    expect(body.entries.map((entry: { id: string }) => entry.id)).toEqual(["new"]);
  });

  it("survives one unreadable blob rather than losing the pull", async () => {
    lists({
      entries: [
        blob(`trips/${CODE}/entries/good/100.json`, 100),
        blob(`trips/${CODE}/entries/gone/100.json`, 100),
      ],
    });
    serve({ [`trips/${CODE}/entries/good/100.json`]: stored("good", 100) });

    const response = await GET(new Request("http://x/"), params());
    const body = await response.json();
    expect(body.entries.map((entry: { id: string }) => entry.id)).toEqual(["good"]);
  });

  it("walks every page of a long trip", async () => {
    lists(
      {},
      {
        entries: [
          {
            blobs: [blob(`trips/${CODE}/entries/a/1.json`, 1)],
            hasMore: true,
            cursor: "next",
          },
          { blobs: [blob(`trips/${CODE}/entries/b/2.json`, 2)], hasMore: false },
        ],
        members: [{ blobs: [], hasMore: false }],
      },
    );
    serve({
      [`trips/${CODE}/entries/a/1.json`]: stored("a", 1),
      [`trips/${CODE}/entries/b/2.json`]: stored("b", 2),
    });

    const response = await GET(new Request("http://x/"), params());
    expect((await response.json()).entries).toHaveLength(2);
    // Two pages of ratings, plus the roster in one.
    expect(list).toHaveBeenCalledTimes(3);
  });
});

describe("POST /api/trip/[code]", () => {
  function push(body: unknown, code = CODE) {
    return POST(
      new Request("http://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      params(code),
    );
  }

  it("writes each entry to a path carrying its version", async () => {
    const response = await push({ entries: [stored("a", 100)] });
    expect(response.status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe(`trips/${CODE}/entries/a/100.json`);
    expect(put.mock.calls[0][2]).toMatchObject({
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  });

  it("stores the edited version under its own path", async () => {
    await push({ entries: [stored("a", 100, { updatedAt: 400 })] });
    expect(put.mock.calls[0][0]).toBe(`trips/${CODE}/entries/a/400.json`);
  });

  it("drops entries it cannot make sense of, keeping the rest", async () => {
    const response = await push({
      entries: [stored("a", 100), { id: "../../evil" }, null],
    });
    expect(await response.json()).toMatchObject({ saved: 1 });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("refuses a body that is not a list of entries", async () => {
    expect((await push({ entries: "nope" })).status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it("reports a store that fails rather than pretending it saved", async () => {
    put.mockRejectedValue(new Error("blob down"));
    const response = await push({ entries: [stored("a", 100)] });
    expect(response.status).toBe(502);
  });
});

describe("the roster", () => {
  const member = { id: "dev-axel", name: "Axel" };

  it("comes back with the ratings, so a phone that has not rated is seen", async () => {
    lists({
      entries: [],
      members: [blob(`trips/${CODE}/members/dev-axel.json`, 100)],
    });
    serve({ [`trips/${CODE}/members/dev-axel.json`]: member });

    const body = await (await GET(new Request("http://x/"), params())).json();

    expect(body.entries).toHaveLength(0);
    expect(body.members).toEqual([member]);
  });

  it("is sent whole even when nothing has changed since the last pull", async () => {
    lists({
      entries: [],
      members: [blob(`trips/${CODE}/members/dev-axel.json`, 100)],
    });
    serve({ [`trips/${CODE}/members/dev-axel.json`]: member });

    const body = await (
      await GET(new Request("http://x/?since=999999999"), params())
    ).json();

    expect(body.members).toEqual([member]);
  });

  it("writes a member when one is announced", async () => {
    lists({});
    const response = await POST(
      new Request("http://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries: [], member }),
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(put.mock.calls[0][0]).toBe(`trips/${CODE}/members/dev-axel.json`);
  });

  it("ignores a member that is not one", async () => {
    lists({});
    await POST(
      new Request("http://x/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries: [], member: { id: "../evil" } }),
      }),
      params(),
    );

    expect(put).not.toHaveBeenCalled();
  });
});

describe("clearing a whole trip", () => {
  function clearing(code = CODE) {
    return DELETE(new Request("http://x/?scope=trip"), params(code));
  }

  it("deletes everything under the trip and nothing else", async () => {
    lists({
      entries: [
        blob(`trips/${CODE}/entries/a/1.json`, 1),
        blob(`trips/${CODE}/photos/p1`, 1),
        blob(`trips/${CODE}/members/m1.json`, 1),
      ],
    });

    const response = await clearing();

    expect(await response.json()).toEqual({ cleared: 3 });
    const deleted = del.mock.calls[0][0] as string[];
    expect(deleted).toHaveLength(3);
    // Only ever this trip's own files, addressed by their URLs.
    expect(deleted.every((url: string) => url.includes(CODE))).toBe(true);
  });

  it("still needs a real trip code", async () => {
    expect((await clearing("short")).status).toBe(400);
    expect(del).not.toHaveBeenCalled();
  });

  it("reports a store that would not empty", async () => {
    lists({ entries: [blob(`trips/${CODE}/entries/a/1.json`, 1)] });
    del.mockRejectedValue(new Error("blob down"));
    expect((await clearing()).status).toBe(502);
  });
});

describe("withdrawing one person's ratings", () => {
  const rasmus = { id: "dev-rasmus", name: "Rasmus" };
  const axel = { id: "dev-axel", name: "Axel" };

  function withdrawing(who: string, code = CODE) {
    return DELETE(
      new Request(`http://x/?scope=mine&member=${who}`),
      params(code),
    );
  }

  function entryBlobs() {
    lists({
      entries: [
        blob(`trips/${CODE}/entries/mine/100.json`, 100),
        blob(`trips/${CODE}/entries/mine/200.json`, 200),
        blob(`trips/${CODE}/entries/theirs/100.json`, 100),
      ],
    });
    serve({
      [`trips/${CODE}/entries/mine/200.json`]: stored("mine", 200, {
        rater: rasmus,
        photoId: "photo:mine",
      }),
      [`trips/${CODE}/entries/theirs/100.json`]: stored("theirs", 100, {
        rater: axel,
      }),
    });
  }

  it("replaces the leaver's ratings with tombstones and keeps the rest", async () => {
    entryBlobs();

    const response = await withdrawing(rasmus.id);

    expect(await response.json()).toEqual({ withdrawn: 1 });
    const written = JSON.parse(String(put.mock.calls[0][1]));
    expect(written).toMatchObject({ id: "mine", deleted: true });
    // A tombstone carries no photo, and outranks every version it replaces.
    expect(written.photoId).toBeUndefined();
    expect(written.updatedAt).toBeGreaterThan(200);
  });

  it("deletes every version of them, and the photo", async () => {
    entryBlobs();

    await withdrawing(rasmus.id);

    const deletedUrls = del.mock.calls.flatMap((call) =>
      Array.isArray(call[0]) ? call[0] : [call[0]],
    );
    expect(deletedUrls.some((u: string) => u.includes("entries/mine/100"))).toBe(true);
    expect(deletedUrls.some((u: string) => u.includes("entries/mine/200"))).toBe(true);
    expect(deletedUrls.some((u: string) => u.includes("photos/photo:mine"))).toBe(true);
    // Somebody else's rating is not the leaver's to take.
    expect(deletedUrls.some((u: string) => u.includes("entries/theirs"))).toBe(false);
  });

  it("takes the member record too", async () => {
    entryBlobs();
    await withdrawing(rasmus.id);
    const deletedUrls = del.mock.calls.flatMap((call) =>
      Array.isArray(call[0]) ? call[0] : [call[0]],
    );
    expect(
      deletedUrls.some((u: string) => u.includes(`members/${rasmus.id}`)),
    ).toBe(true);
  });

  it("refuses a member id that could escape the store", async () => {
    lists({});
    expect((await withdrawing("..%2Fetc")).status).toBe(400);
  });

  it("refuses an unknown scope rather than guessing", async () => {
    lists({});
    const response = await DELETE(new Request("http://x/"), params());
    expect(response.status).toBe(400);
  });
});
