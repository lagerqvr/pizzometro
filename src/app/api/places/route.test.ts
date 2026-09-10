import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

/**
 * The lookup runs from a cloud IP that Overpass rate-limits, so the ways it
 * fails matter as much as the way it succeeds.
 */
const overpassBody = {
  elements: [
    {
      type: "node",
      id: 1,
      lat: 40.851,
      lon: 14.268,
      tags: { name: "Pizzeria Trianon", amenity: "restaurant" },
    },
  ],
};

const nominatimBody = [
  {
    osm_type: "node",
    osm_id: 2,
    name: "La Figlia del Presidente",
    display_name: "La Figlia del Presidente, Napoli",
    lat: "40.849",
    lon: "14.259",
  },
];

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function request(query: string) {
  return GET(new Request(`http://localhost/api/places?${query}`));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("nearby lookup", () => {
  it("returns what Overpass knows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok(overpassBody)));
    const body = await (await request("lat=40.8518&lon=14.2681")).json();
    expect(body.places).toHaveLength(1);
    expect(body.places[0].name).toBe("Pizzeria Trianon");
  });

  it("rounds the position so everyone at the table asks one question", async () => {
    const fetchMock =
      vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
        ok(overpassBody),
      );
    vi.stubGlobal("fetch", fetchMock);

    await request("lat=40.851812&lon=14.268144");
    await request("lat=40.851777&lon=14.268098");

    const asked = fetchMock.mock.calls.map((call) =>
      decodeURIComponent(String(call[1]?.body)),
    );
    // Two people, two GPS fixes, one identical upstream query.
    expect(asked[0]).toBe(asked[1]);
    expect(asked[0]).toContain("around:350,40.852,14.268");
  });

  it("retries once when Overpass rate-limits, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(ok(overpassBody));
    vi.stubGlobal("fetch", fetchMock);

    const body = await (await request("lat=40.8518&lon=14.2681")).json();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.places[0].name).toBe("Pizzeria Trianon");
  });

  it("falls back to Nominatim when Overpass stays down", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("overpass")
        ? new Response("busy", { status: 429 })
        : ok(nominatimBody),
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = await (await request("lat=40.8518&lon=14.2681")).json();

    expect(body.places).toHaveLength(1);
    expect(body.places[0].name).toBe("La Figlia del Presidente");
  });

  it("never blocks a rating, even with both services gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));

    const response = await request("lat=40.8518&lon=14.2681");
    const body = await response.json();

    // 200 with an empty list: the picker then offers the text field.
    expect(response.status).toBe(200);
    expect(body).toEqual({ places: [], error: "lookup-failed" });
  });

  it("asks for coordinates or a query, not neither", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect((await request("")).status).toBe(400);
    // Number(null) is 0, a real spot in the Atlantic: no lookup must escape.
    expect((await request("lat=&lon=")).status).toBe(400);
    expect((await request("lat=abc&lon=14.2")).status).toBe(400);
    expect((await request("lat=91&lon=14.2")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("text search", () => {
  it("searches by name when one is typed", async () => {
    const fetchMock =
      vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
        ok(nominatimBody),
      );
    vi.stubGlobal("fetch", fetchMock);

    const body = await (await request("q=Sorbillo&lat=40.8518&lon=14.2681")).json();

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("nominatim");
    expect(body.places[0].name).toBe("La Figlia del Presidente");
  });
});
