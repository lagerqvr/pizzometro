/**
 * Builds `public/countries.json` — country outlines for the map when the
 * view is wider than street data is worth asking for.
 *
 * Natural Earth 1:110m, simplified hard: coordinates to two decimals (about
 * a kilometre, finer than a pixel at this scale), rings below a threshold
 * dropped, and every property discarded but the name. Public domain, so it
 * can simply be shipped.
 *
 *   node scripts/countries.mjs [path-to-ne_110m_admin_0_countries.geojson]
 */
import { readFile, writeFile } from "node:fs/promises";

const source = process.argv[2] ?? "/tmp/ne_110m_admin_0_countries.geojson";
const raw = JSON.parse(await readFile(source, "utf8"));

const round = (n) => Math.round(n * 100) / 100;

/**
 * Drops points closer together than `step`, keeping the ring closed.
 *
 * Deliberately not Douglas-Peucker: a ring starts and ends at the same
 * point, so the baseline it measures against has no length and every
 * distance collapses to the same number. This is cruder and cannot fail.
 */
function decimate(points, step) {
  const kept = [points[0]];
  for (const point of points.slice(1)) {
    const last = kept[kept.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= step) {
      kept.push(point);
    }
  }
  if (kept.length > 2) kept.push(kept[0]);
  return kept;
}

function rings(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

/** Rough area, to throw away islands too small to see. */
function area(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

const countries = [];
for (const feature of raw.features) {
  const name = feature.properties?.NAME ?? feature.properties?.name;
  if (!name) continue;
  const kept = rings(feature.geometry)
    .filter((ring) => area(ring) > 0.6)
    .map((ring) =>
      decimate(ring, 0.35).map(([lon, lat]) => [round(lon), round(lat)]),
    )
    .filter((ring) => ring.length > 3);
  if (kept.length === 0) continue;

  // The label goes in the middle of the biggest piece of the country.
  const biggest = kept.reduce((a, b) => (area(a) > area(b) ? a : b));
  const lons = biggest.map(([lon]) => lon);
  const lats = biggest.map(([, lat]) => lat);
  countries.push({
    n: name,
    at: [
      round((Math.min(...lons) + Math.max(...lons)) / 2),
      round((Math.min(...lats) + Math.max(...lats)) / 2),
    ],
    r: kept,
  });
}

const out = JSON.stringify({ countries });
await writeFile("public/countries.json", out);
console.log(
  `${countries.length} countries, ${countries.reduce((n, c) => n + c.r.length, 0)} rings, ${(out.length / 1024).toFixed(0)} kB`,
);
