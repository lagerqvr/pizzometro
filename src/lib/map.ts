import { distanceMeters } from "./places";
import type { Entry } from "./types";

/**
 * Where the ratings happened, as points on a flat card.
 *
 * There is no basemap: tiles would need the network, a provider and an
 * aesthetic that is not this one. What is actually useful on a trip is the
 * shape of the evening — which places were together, which was the walk out
 * of the way — and that survives perfectly well as dots with a scale bar.
 */
export type MapPoint = { entry: Entry; x: number; y: number };

export type MapView = {
  points: MapPoint[];
  /** Ratings with no location, which cannot be drawn. */
  missing: number;
  /** How wide the drawn area is, in metres. */
  spanMeters: number;
};

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
  if (here.length === 0) return { points: [], missing, spanMeters: 0 };

  const lats = here.map((entry) => entry.place!.lat!);
  const lons = here.map((entry) => entry.place!.lon!);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2;
  const squash = Math.cos((midLat * Math.PI) / 180);

  const spanLon = (maxLon - minLon) * squash;
  const spanLat = maxLat - minLat;
  const inner = { width: width - pad * 2, height: height - pad * 2 };

  // One place, or several at the same address: nothing to spread out.
  const scale =
    spanLon <= 0 && spanLat <= 0
      ? 0
      : Math.min(
          spanLon > 0 ? inner.width / spanLon : Infinity,
          spanLat > 0 ? inner.height / spanLat : Infinity,
        );

  const drawnWidth = spanLon * scale;
  const drawnHeight = spanLat * scale;
  const left = pad + (inner.width - drawnWidth) / 2;
  const top = pad + (inner.height - drawnHeight) / 2;

  const points = here.map((entry) => ({
    entry,
    x: scale === 0 ? width / 2 : left + (entry.place!.lon! - minLon) * squash * scale,
    // Latitude grows northwards and y grows downwards.
    y: scale === 0 ? height / 2 : top + (maxLat - entry.place!.lat!) * scale,
  }));

  return {
    points,
    missing,
    spanMeters:
      here.length < 2
        ? 0
        : distanceMeters(
            { lat: midLat, lon: minLon },
            { lat: midLat, lon: maxLon },
          ),
  };
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

export function formatSpan(meters: number): string {
  if (meters <= 0) return "";
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km across`
    : `${Math.round(meters)} m across`;
}
