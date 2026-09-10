import { NextResponse } from "next/server";
import {
  parseNominatim,
  parseOverpass,
  type NominatimResult,
  type OverpassElement,
} from "@/lib/places";

/**
 * Place lookup, proxied server-side for two reasons: OpenStreetMap's services
 * want a real User-Agent (browsers won't set one), and it keeps responses
 * cacheable at the edge so a table of four rating the same pizzeria only
 * costs one upstream call.
 */
export const runtime = "nodejs";

const UA = "Pizzometro/1.0 (https://pizzometro.lagerqvr.com)";
const TIMEOUT_MS = 9000;
const OVERPASS = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/**
 * ~110 m. A phone's GPS jitters from reading to reading; the pizzeria does
 * not. Rounding means everyone at the table asks the same question, so the
 * edge cache answers it once instead of once per person per fix — which is
 * also what keeps us under Overpass's rate limit.
 */
function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * A missing parameter is not a coordinate. `Number(null)` is 0, which is a
 * real place in the Gulf of Guinea, so the check has to be for absence
 * before it is for shape.
 */
function coord(raw: string | null, limit: number): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}

async function fetchJson<T>(url: string, headers: HeadersInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Overpass rate-limits per IP, and this runs on a cloud IP shared with every
 * other app doing the same thing, so a 429 is normal rather than exceptional.
 * It usually clears within a second.
 */
async function overpassNearby(
  lat: number,
  lon: number,
  radius: number,
): Promise<OverpassElement[]> {
  const body = new URLSearchParams({ data: overpassQuery(lat, lon, radius) });

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
        body,
        signal: controller.signal,
      });
      if (response.status === 429 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        continue;
      }
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const parsed = (await response.json()) as {
        elements?: OverpassElement[];
      };
      return parsed.elements ?? [];
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Overpass rate limited");
}

/**
 * The understudy. Nominatim has no real "what is around me" query, but a
 * bounded search still names a few places nearby — thinner than Overpass,
 * and much better than an empty list in front of somebody holding a pizza.
 */
async function nominatimNearby(
  lat: number,
  lon: number,
): Promise<NominatimResult[]> {
  const url = new URL(NOMINATIM);
  const d = 0.012;
  url.searchParams.set("q", "pizzeria");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "10");
  url.searchParams.set("bounded", "1");
  url.searchParams.set(
    "viewbox",
    `${lon - d},${lat + d},${lon + d},${lat - d}`,
  );
  return fetchJson<NominatimResult[]>(url.toString());
}

/** Restaurants, fast food and cafés within `radius` metres. */
function overpassQuery(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:10];(
    nwr["amenity"~"^(restaurant|fast_food|cafe|bar|ice_cream)$"](around:${radius},${lat},${lon});
  );out center tags 40;`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim();
  const lat = coord(params.get("lat"), 90);
  const lon = coord(params.get("lon"), 180);
  const hasCoords = lat !== null && lon !== null;
  const from = hasCoords ? { lat, lon } : undefined;

  try {
    if (query) {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "10");
      url.searchParams.set("addressdetails", "0");
      if (hasCoords) {
        // Bias results towards the user without hard-limiting to the box.
        const d = 0.25;
        const box = { lat: roundCoord(lat), lon: roundCoord(lon) };
        url.searchParams.set(
          "viewbox",
          `${box.lon - d},${box.lat + d},${box.lon + d},${box.lat - d}`,
        );
      }
      const results = await fetchJson<NominatimResult[]>(url.toString());
      return NextResponse.json(
        { places: parseNominatim(results, from) },
        { headers: { "Cache-Control": "public, s-maxage=3600" } },
      );
    }

    if (!hasCoords) {
      return NextResponse.json(
        { error: "Pass either q or lat+lon" },
        { status: 400 },
      );
    }

    const radius = Math.min(Number(params.get("radius")) || 350, 2000);
    // Distances are still measured from the real fix; only the question
    // asked upstream is rounded.
    const near = { lat: roundCoord(lat), lon: roundCoord(lon) };

    try {
      const elements = await overpassNearby(near.lat, near.lon, radius);
      return NextResponse.json(
        { places: parseOverpass(elements, from).slice(0, 12) },
        {
          headers: {
            "Cache-Control":
              "public, s-maxage=600, stale-while-revalidate=3600",
          },
        },
      );
    } catch {
      const results = await nominatimNearby(near.lat, near.lon);
      return NextResponse.json(
        { places: parseNominatim(results, from).slice(0, 12) },
        {
          headers: {
            "Cache-Control":
              "public, s-maxage=300, stale-while-revalidate=3600",
          },
        },
      );
    }
  } catch {
    // A lookup failure must never block a rating: the client falls back to
    // typing the place name by hand.
    return NextResponse.json({ places: [], error: "lookup-failed" });
  }
}
