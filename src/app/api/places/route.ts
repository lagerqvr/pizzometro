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
const TIMEOUT_MS = 7000;

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

/** Restaurants, fast food and cafés within `radius` metres. */
function overpassQuery(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:10];(
    nwr["amenity"~"^(restaurant|fast_food|cafe|bar|ice_cream)$"](around:${radius},${lat},${lon});
  );out center tags 40;`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim();
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
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
        url.searchParams.set(
          "viewbox",
          `${lon - d},${lat + d},${lon + d},${lat - d}`,
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
    const body = new URLSearchParams({
      data: overpassQuery(lat, lon, radius),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let elements: OverpassElement[] = [];
    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      elements = ((await response.json()) as { elements?: OverpassElement[] })
        .elements ?? [];
    } finally {
      clearTimeout(timer);
    }

    return NextResponse.json(
      { places: parseOverpass(elements, from).slice(0, 12) },
      { headers: { "Cache-Control": "public, s-maxage=600" } },
    );
  } catch {
    // A lookup failure must never block a rating: the client falls back to
    // typing the place name by hand.
    return NextResponse.json({ places: [], error: "lookup-failed" });
  }
}
