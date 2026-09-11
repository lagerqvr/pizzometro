import { NextResponse } from "next/server";

/**
 * Street geometry for the map, from the same OpenStreetMap service the place
 * lookup uses. Drawn as thin ink lines rather than tiles: no provider, no
 * API key, and it looks like the rest of the app.
 *
 * The response is deliberately terse — `{m, p}` rather than GeoJSON — because
 * a city block's worth of streets is a lot of numbers to send to a phone on
 * roaming data.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Pizzometro/1.0 (https://pizzometro.lagerqvr.com)";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const TIMEOUT_MS = 12_000;
/** Past this the answer would be enormous and the drawing meaningless. */
const MAX_SPAN_DEGREES = 12;
const MAJOR = ["motorway", "trunk", "primary", "secondary"];

/**
 * Which roads are worth drawing at a given size of view. A street plan is
 * the point over a few blocks; across a region only the roads that describe
 * the shape of the place are, and asking for every lane would be a enormous
 * answer nobody can see.
 */
export type Detail = {
  /** Road classes worth drawing, or none once country outlines take over. */
  roads: string | null;
  limit: number;
  /** Which settlements to name. */
  places: string;
  placeLimit: number;
};

export function detailFor(span: number): Detail {
  if (span <= 0.06) {
    return {
      roads: "motorway|trunk|primary|secondary|tertiary|residential|pedestrian|living_street",
      limit: 900,
      places: "city|town|village|suburb",
      placeLimit: 30,
    };
  }
  if (span <= 0.4) {
    return {
      roads: "motorway|trunk|primary|secondary|tertiary",
      limit: 800,
      places: "city|town|village",
      placeLimit: 40,
    };
  }
  if (span <= 2) {
    return {
      roads: "motorway|trunk|primary",
      limit: 700,
      places: "city|town",
      placeLimit: 40,
    };
  }
  // Wider than this the country outlines carry the drawing, and every road
  // in a continent would be an enormous answer to no purpose.
  return { roads: null, limit: 0, places: "city", placeLimit: 60 };
}

type OverpassElement = {
  type?: string;
  lat?: number;
  lon?: number;
  tags?: { highway?: string; place?: string; name?: string };
  geometry?: Array<{ lat: number; lon: number }>;
};

/** south,west,north,east — the order Overpass wants. */
function parseBbox(raw: string | null): number[] | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [south, west, north, east] = parts;
  if (Math.abs(south) > 90 || Math.abs(north) > 90) return null;
  if (Math.abs(west) > 180 || Math.abs(east) > 180) return null;
  if (north <= south || east <= west) return null;
  // A box the size of a country would be an enormous answer.
  if (north - south > MAX_SPAN_DEGREES || east - west > MAX_SPAN_DEGREES) {
    return null;
  }
  return parts;
}

export async function GET(request: Request) {
  const bbox = parseBbox(new URL(request.url).searchParams.get("bbox"));
  if (!bbox) {
    return NextResponse.json({ error: "bad-bbox" }, { status: 400 });
  }

  const [south, west, north, east] = bbox;
  const detail = detailFor(Math.max(north - south, east - west));
  const box = bbox.join(",");
  const query = [
    "[out:json][timeout:25];",
    detail.roads
      ? `way["highway"~"^(${detail.roads})$"](${box});out geom ${detail.limit};`
      : "",
    `node["place"~"^(${detail.places})$"]["name"](${box});out ${detail.placeLimit};`,
  ].join("");

  /**
   * Overpass rate-limits per IP and this runs on a cloud one shared with
   * everybody else asking it things, so a 429 is normal rather than
   * exceptional. It usually clears within a second.
   */
  async function ask(): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(OVERPASS, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ data: query }),
          signal: controller.signal,
        });
        if (response.status === 429 && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1_200));
          continue;
        }
        return response;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error("Overpass rate limited");
  }

  try {
    const response = await ask();
    if (!response.ok) throw new Error(`Overpass ${response.status}`);
    const parsed = (await response.json()) as { elements?: OverpassElement[] };
    const elements = parsed.elements ?? [];

    const labels = elements
      .filter(
        (element) =>
          element.type === "node" &&
          element.tags?.name &&
          typeof element.lat === "number" &&
          typeof element.lon === "number",
      )
      .map((node) => ({
        n: node.tags!.name!.slice(0, 40),
        at: [
          Math.round(node.lat! * 1e4) / 1e4,
          Math.round(node.lon! * 1e4) / 1e4,
        ],
      }));

    const roads = elements
      .filter((element) => element.type !== "node")
      .map((way) => ({
        m: MAJOR.includes(way.tags?.highway ?? "") ? 1 : 0,
        // Five decimals is about a metre, which is finer than any pixel here.
        p: (way.geometry ?? []).map((point) => [
          Math.round(point.lat * 1e5) / 1e5,
          Math.round(point.lon * 1e5) / 1e5,
        ]),
      }))
      .filter((way) => way.p.length > 1);

    return NextResponse.json(
      { roads, labels },
      {
        headers: {
          // Streets do not move; the box is rounded, so this caches well.
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    // A map without streets is still a map; the dots carry the meaning.
    return NextResponse.json({ roads: [], labels: [], error: "lookup-failed" });
  }
}
