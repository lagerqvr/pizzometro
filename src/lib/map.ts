import { distanceMeters } from "./places";
import type { Entry } from "./types";

/**
 * Where the ratings happened, as points on a flat card.
 *
 * There is no tile basemap — tiles need a provider and look nothing like the
 * rest of this — but dots floating in space are not a map either, so the
 * street geometry is fetched from the same OpenStreetMap proxy the place
 * lookup uses and drawn as thin ink lines underneath.
 */
export type MapPoint = { entry: Entry; x: number; y: number };

export type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type MapView = {
  points: MapPoint[];
  /** Ratings with no location, which cannot be drawn. */
  missing: number;
  /** How wide the drawn card is, in metres. */
  spanMeters: number;
  /** Where a coordinate falls on the card. */
  place: (lat: number, lon: number) => { x: number; y: number };
  /** The ground the card covers, for asking which streets cross it. */
  bounds: Bounds | null;
};

const METRES_PER_DEGREE = 111_320;

/**
 * The least ground a card will ever show. One rating, or three doors apart,
 * would otherwise zoom in until the streets meant nothing.
 */
const MIN_SPAN_METERS = 500;

export function located(entries: Entry[]): Entry[] {
  return entries.filter(
    (entry) => entry.place?.lat != null && entry.place?.lon != null,
  );
}

/**
 * Equirectangular, which is right enough over a city: a degree of longitude
 * is shorter than one of latitude by the cosine of where you are standing,
 * and ignoring that leaves Naples looking stretched.
 */
export function project(
  entries: Entry[],
  width: number,
  height: number,
  pad: number,
): MapView {
  const here = located(entries);
  const missing = entries.length - here.length;
  const nowhere = {
    points: [],
    missing,
    spanMeters: 0,
    place: () => ({ x: width / 2, y: height / 2 }),
    bounds: null,
  };
  if (here.length === 0) return nowhere;

  const lats = here.map((entry) => entry.place!.lat!);
  const lons = here.map((entry) => entry.place!.lon!);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const midLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const squash = Math.cos((midLat * Math.PI) / 180) || 1;

  // Spans in degrees of latitude, so both axes are the same unit on the
  // ground; the floor keeps a tight cluster from filling the card.
  const floor = MIN_SPAN_METERS / METRES_PER_DEGREE;
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), floor);
  const spanLon = Math.max(
    (Math.max(...lons) - Math.min(...lons)) * squash,
    floor,
  );

  const inner = { width: width - pad * 2, height: height - pad * 2 };
  const scale = Math.min(inner.width / spanLon, inner.height / spanLat);

  // The card shows more than the ratings' own box once the scale is fixed.
  const shownLat = height / scale;
  const shownLon = width / scale;

  const place = (lat: number, lon: number) => ({
    x: width / 2 + (lon - midLon) * squash * scale,
    y: height / 2 - (lat - midLat) * scale,
  });

  return {
    points: here.map((entry) => ({
      entry,
      ...place(entry.place!.lat!, entry.place!.lon!),
    })),
    missing,
    spanMeters: distanceMeters(
      { lat: midLat, lon: midLon - shownLon / 2 },
      { lat: midLat, lon: midLon + shownLon / 2 },
    ),
    place,
    bounds: {
      south: midLat - shownLat / 2,
      north: midLat + shownLat / 2,
      west: midLon - shownLon / squash / 2,
      east: midLon + shownLon / squash / 2,
    },
  };
}

/**
 * Nudges dots apart until none of them sit on top of another. Two pizzerias
 * fifty metres apart land within a few pixels of each other on a card this
 * size, and one dot hiding under another is a rating you cannot tap.
 *
 * A few rounds of pushing overlapping pairs apart is enough; the result is
 * deterministic, so the map does not shuffle itself between renders.
 */
export function spread(
  points: MapPoint[],
  minGap: number,
  limit: { width: number; height: number; pad: number },
  rounds = 30,
): MapPoint[] {
  const moved = points.map((point) => ({ ...point }));
  if (moved.length < 2) return moved;

  for (let round = 0; round < rounds; round += 1) {
    let settled = true;
    for (let i = 0; i < moved.length; i += 1) {
      for (let j = i + 1; j < moved.length; j += 1) {
        const a = moved[i];
        const b = moved[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let gap = Math.hypot(dx, dy);
        if (gap >= minGap) continue;
        settled = false;
        if (gap === 0) {
          // Exactly on top of each other: any direction will do, but it has
          // to be the same one every time.
          dx = Math.cos(i + j);
          dy = Math.sin(i + j);
          gap = 1;
        }
        const push = (minGap - gap) / 2;
        const ux = (dx / gap) * push;
        const uy = (dy / gap) * push;
        a.x -= ux;
        a.y -= uy;
        b.x += ux;
        b.y += uy;
      }
    }
    if (settled) break;
  }

  // Nudging must not push a dot off the card.
  for (const point of moved) {
    point.x = Math.min(limit.width - limit.pad, Math.max(limit.pad, point.x));
    point.y = Math.min(limit.height - limit.pad, Math.max(limit.pad, point.y));
  }
  return moved;
}

/** A name to put on the map, once it is known where it goes. */
export type Label = { name: string; x: number; y: number };

/**
 * Keeps the labels that fit, drops the ones that would land on top of
 * another. Two names overlapping is worse than one name missing, and a map
 * of a region has more towns on it than there is room to say.
 *
 * Earlier labels win, so the order they arrive in is the order of
 * importance — and the result does not shuffle between renders.
 */
export function placeLabels(
  labels: Label[],
  size: { width: number; height: number },
  gap = { x: 54, y: 13 },
): Label[] {
  const kept: Label[] = [];
  for (const label of labels) {
    if (
      label.x < 4 ||
      label.y < 8 ||
      label.x > size.width - 4 ||
      label.y > size.height - 4
    ) {
      continue;
    }
    const clash = kept.some(
      (other) =>
        Math.abs(other.x - label.x) < gap.x && Math.abs(other.y - label.y) < gap.y,
    );
    if (!clash) kept.push(label);
  }
  return kept;
}

/** A round number of metres that fits inside `maxPixels` of the drawing. */
export function scaleBar(
  spanMeters: number,
  spanPixels: number,
  maxPixels: number,
): { meters: number; pixels: number } | null {
  if (spanMeters <= 0 || spanPixels <= 0) return null;
  const perPixel = spanMeters / spanPixels;
  const steps = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const pixels = steps[i] / perPixel;
    if (pixels <= maxPixels) return { meters: steps[i], pixels };
  }
  return null;
}

/** The bounding box as Overpass wants it, rounded so the cache can help. */
export function bboxParam(bounds: Bounds): string {
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  return [
    round(bounds.south),
    round(bounds.west),
    round(bounds.north),
    round(bounds.east),
  ].join(",");
}

/** The names that came back with the streets. */
export function parseLabels(input: unknown): Array<{ name: string; lat: number; lon: number }> {
  if (!input || typeof input !== "object") return [];
  const list = (input as { labels?: unknown }).labels;
  if (!Array.isArray(list)) return [];
  const names: Array<{ name: string; lat: number; lon: number }> = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const name = (item as { n?: unknown }).n;
    const at = (item as { at?: unknown }).at;
    if (typeof name !== "string" || !Array.isArray(at) || at.length !== 2) {
      continue;
    }
    if (!Number.isFinite(at[0]) || !Number.isFinite(at[1])) continue;
    names.push({ name, lat: at[0], lon: at[1] });
  }
  return names;
}

/** A street, as the points it passes through. */
export type Road = { major: boolean; points: Array<[number, number]> };

export function parseRoads(input: unknown): Road[] {
  if (!input || typeof input !== "object") return [];
  const ways = (input as { roads?: unknown }).roads;
  if (!Array.isArray(ways)) return [];
  const roads: Road[] = [];
  for (const way of ways) {
    if (!way || typeof way !== "object") continue;
    const points = (way as { p?: unknown }).p;
    if (!Array.isArray(points) || points.length < 2) continue;
    const cleaned = points.filter(
      (point): point is [number, number] =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    );
    if (cleaned.length < 2) continue;
    roads.push({ major: (way as { m?: unknown }).m === 1, points: cleaned });
  }
  return roads;
}
