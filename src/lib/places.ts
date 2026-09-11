import type { Place } from "./types";

/** Great-circle distance in metres. */
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function formatDistance(meters?: number): string {
  if (meters == null) return "";
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Minimal shape of an Overpass element we care about. */
export type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function addressOf(tags: Record<string, string>): string | undefined {
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  if (street && number) return `${street} ${number}`;
  return street || tags["addr:city"] || undefined;
}

/**
 * Overpass returns nodes, ways and relations; ways carry their coordinates in
 * `center`. Unnamed elements are useless as a place label, so they're dropped.
 */
export function parseOverpass(
  elements: OverpassElement[],
  from?: { lat: number; lon: number },
): Place[] {
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const element of elements) {
    const name = element.tags?.name?.trim();
    if (!name) continue;
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      id: `osm:${element.type}/${element.id}`,
      name,
      address: element.tags ? addressOf(element.tags) : undefined,
      lat,
      lon,
      distance:
        from && lat != null && lon != null
          ? distanceMeters(from, { lat, lon })
          : undefined,
    });
  }
  return places.sort(
    (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
  );
}

/** Minimal shape of a Nominatim search result. */
export type NominatimResult = {
  osm_type?: string;
  osm_id?: number;
  place_id?: number;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
};

export function parseNominatim(
  results: NominatimResult[],
  from?: { lat: number; lon: number },
): Place[] {
  const places: Place[] = [];
  for (const result of results) {
    const display = result.display_name ?? "";
    const name = result.name?.trim() || display.split(",")[0]?.trim();
    if (!name) continue;
    const lat = result.lat ? Number(result.lat) : undefined;
    const lon = result.lon ? Number(result.lon) : undefined;
    // Second and third comma-parts read as a street address; the tail is
    // city/region/country noise we don't want on the share card.
    const address =
      display
        .split(",")
        .slice(1, 3)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ") || undefined;
    places.push({
      id:
        result.osm_type && result.osm_id
          ? `osm:${result.osm_type}/${result.osm_id}`
          : `nominatim:${result.place_id ?? name}`,
      name,
      address,
      lat,
      lon,
      distance:
        from && lat != null && lon != null && Number.isFinite(lat)
          ? distanceMeters(from, { lat, lon })
          : undefined,
    });
  }
  return places;
}

/**
 * A place typed by hand. It takes the phone's position with it when there is
 * one: without coordinates the map link is a worldwide search for the name,
 * which is how "Da Michele" opened a map of Germany.
 */
export function manualPlace(
  name: string,
  at?: { lat: number; lon: number } | null,
): Place {
  return {
    id: `manual:${name.trim().toLowerCase()}`,
    name: name.trim(),
    lat: at?.lat,
    lon: at?.lon,
  };
}

/** Merge suggestion lists, keeping the first occurrence of each place. */
export function mergePlaces(...lists: Place[][]): Place[] {
  const seen = new Set<string>();
  const merged: Place[] = [];
  for (const list of lists) {
    for (const place of list) {
      const key = place.id.startsWith("manual:")
        ? place.id
        : place.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(place);
    }
  }
  return merged;
}

export function placeLabel(place?: Place | null): string {
  if (!place) return "";
  return place.name;
}

/**
 * Opens the place in the phone's map app — Google Maps if it is installed,
 * the web map otherwise, and on iOS the web map offers to hand over to Maps.
 *
 * A name with a street behind it opens the place's own listing, which is
 * what you want when you are deciding whether to go back. Coordinates alone
 * only ever drop a pin, so they are the fallback, not the first choice —
 * but they are what stops a bare name from opening a different Da Michele in
 * another country.
 */
export function mapsUrl(place: Place): string {
  const named = place.name?.trim();
  const street = place.address?.trim();
  const query =
    named && street
      ? `${named}, ${street}`
      : place.lat != null && place.lon != null
        ? `${place.lat},${place.lon}`
        : named;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query ?? "")}`;
}
