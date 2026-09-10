import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
const put = vi.fn();
vi.mock("@vercel/blob", () => ({
  list: (...args: unknown[]) => list(...args),
  put: (...args: unknown[]) => put(...args),
}));

const { GET, POST } = await import("./route");

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

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  list.mockReset();
  put.mockReset();
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
    list.mockResolvedValue({
      blobs: [
        blob(`trips/${CODE}/entries/a/100.json`, 100),
        blob(`trips/${CODE}/entries/a/300.json`, 300),
      ],
      hasMore: false,
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
    list.mockResolvedValue({
      blobs: [
        blob(`trips/${CODE}/entries/old/100.json`, 100_000),
        blob(`trips/${CODE}/entries/new/900.json`, 900_000),
      ],
      hasMore: false,
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
    list.mockResolvedValue({
      blobs: [
        blob(`trips/${CODE}/entries/good/100.json`, 100),
        blob(`trips/${CODE}/entries/gone/100.json`, 100),
      ],
      hasMore: false,
    });
    serve({ [`trips/${CODE}/entries/good/100.json`]: stored("good", 100) });

    const response = await GET(new Request("http://x/"), params());
    const body = await response.json();
    expect(body.entries.map((entry: { id: string }) => entry.id)).toEqual(["good"]);
  });

  it("walks every page of a long trip", async () => {
    list
      .mockResolvedValueOnce({
        blobs: [blob(`trips/${CODE}/entries/a/1.json`, 1)],
        hasMore: true,
        cursor: "next",
      })
      .mockResolvedValueOnce({
        blobs: [blob(`trips/${CODE}/entries/b/2.json`, 2)],
        hasMore: false,
      });
    serve({
      [`trips/${CODE}/entries/a/1.json`]: stored("a", 1),
      [`trips/${CODE}/entries/b/2.json`]: stored("b", 2),
    });

    const response = await GET(new Request("http://x/"), params());
    expect((await response.json()).entries).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(2);
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
