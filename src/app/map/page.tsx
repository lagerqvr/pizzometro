"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { useEntries, useSettings } from "@/lib/hooks";
import {
  bboxParam,
  parseLabels,
  parseRoads,
  placeLabels,
  project,
  scaleBar,
  spread,
  type Label,
  type Road,
} from "@/lib/map";
import { mapsUrl } from "@/lib/places";
import { formatRating } from "@/lib/score";

type Country = { n: string; at: [number, number]; r: Array<Array<[number, number]>> };

/** The drawing is a fixed square; the screen scales it. */
const SIZE = 400;
const PAD = 30;
/** No two dots closer than this, or one hides under another. */
const DOT_GAP = 20;

export default function MapPage() {
  const { entries, loading } = useEntries();
  const { settings } = useSettings();
  const [open, setOpen] = useState<string | null>(null);
  const [roads, setRoads] = useState<Road[]>([]);
  const [named, setNamed] = useState<Array<{ name: string; lat: number; lon: number }>>([]);
  const [countries, setCountries] = useState<Country[] | null>(null);

  const view = project(entries ?? [], SIZE, SIZE, PAD);
  const points = spread(view.points, DOT_GAP, {
    width: SIZE,
    height: SIZE,
    pad: PAD,
  });
  const bar = scaleBar(view.spanMeters, SIZE, 110);
  const selected = points.find((point) => point.entry.id === open);
  const bbox = view.bounds ? bboxParam(view.bounds) : null;

  // Streets for whatever ground the card is showing. A failure here is not
  // worth a word on screen: the dots still say where everything was.
  useEffect(() => {
    if (!bbox || !settings.showMap) return;
    let cancelled = false;
    fetch(`/api/roads?bbox=${bbox}`)
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        setRoads(parseRoads(body));
        setNamed(parseLabels(body));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bbox, settings.showMap]);

  // Country outlines only matter once the view is wider than streets are
  // worth drawing, so the file is fetched then and not before.
  const wide = view.bounds
    ? Math.max(
        view.bounds.north - view.bounds.south,
        view.bounds.east - view.bounds.west,
      ) > 2
    : false;

  useEffect(() => {
    if (!wide || countries || !settings.showMap) return;
    let cancelled = false;
    fetch("/countries.json")
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled) setCountries(body.countries ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wide, countries, settings.showMap]);

  // Every name that wants to be on the map, most important first, then only
  // those that do not land on one another.
  const labels: Label[] = placeLabels(
    [
      ...(wide && countries
        ? countries.map((country) => ({
            name: country.n.toUpperCase(),
            ...view.place(country.at[1], country.at[0]),
          }))
        : []),
      ...named.map((entry) => ({
        name: entry.name,
        ...view.place(entry.lat, entry.lon),
      })),
    ],
    // The bottom strip belongs to the scale bar and the attribution.
    { width: SIZE, height: SIZE - 24 },
    points,
  );

  return (
    <main className="flex-1 pb-28">
      <Wordmark subtitle="Where we ate" />

      <section className="mt-5 px-5">
        {!settings.showMap ? (
          <p className="py-16 text-center text-sm text-muted">
            The map is switched off in Setup.
          </p>
        ) : loading ? (
          <p className="label py-10 text-center">LOADING…</p>
        ) : points.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted">Nothing to put on a map yet.</p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted">
              {view.missing > 0
                ? `${view.missing} ${view.missing === 1 ? "rating names a place" : "ratings name places"} that were typed in rather than picked from the list, so there are no coordinates to draw. Picking the place again from Edit puts it on the map.`
                : "Ratings appear here once they have a location."}
            </p>
          </div>
        ) : (
          <>
            <div className="plate relative">
              <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="block w-full"
                role="img"
                aria-label={`${points.length} rated places`}
              >
                {wide &&
                  countries?.map((country) =>
                    country.r.map((ring, index) => (
                      <polygon
                        key={`${country.n}-${index}`}
                        className="fill-paper-dim stroke-rule"
                        strokeWidth="0.8"
                        points={ring
                          .map(([lon, lat]) => {
                            const at = view.place(lat, lon);
                            return `${at.x.toFixed(1)},${at.y.toFixed(1)}`;
                          })
                          .join(" ")}
                      />
                    )),
                  )}

                {/* Two weights, so the big roads read as the shape of the
                    place rather than as more of the same. */}
                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                  {roads.map((road, index) => (
                    <polyline
                      key={index}
                      className={road.major ? "stroke-muted" : "stroke-rule"}
                      strokeWidth={road.major ? 2 : 1.1}
                      points={road.points
                        .map(([lat, lon]) => {
                          const at = view.place(lat, lon);
                          return `${at.x.toFixed(1)},${at.y.toFixed(1)}`;
                        })
                        .join(" ")}
                    />
                  ))}
                </g>

                {labels.map((label) => (
                  <text
                    key={`${label.name}-${label.x}-${label.y}`}
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    className="fill-muted"
                    fontSize="8"
                    letterSpacing="0.5"
                    stroke="var(--color-paper)"
                    strokeWidth="4.5"
                    strokeLinejoin="round"
                    paintOrder="stroke"
                  >
                    {label.name}
                  </text>
                ))}

                <text
                  x={SIZE - 14}
                  y="18"
                  textAnchor="middle"
                  className="fill-muted"
                  fontSize="9"
                  letterSpacing="2"
                >
                  N
                </text>

                {points.map((point) => {
                  const active = point.entry.id === open;
                  return (
                    <g
                      key={point.entry.id}
                      onClick={() => setOpen(active ? null : point.entry.id)}
                      className="cursor-pointer"
                    >
                      {/* A generous invisible target: the dots are small. */}
                      <circle cx={point.x} cy={point.y} r="16" fill="transparent" />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={active ? 7 : 5}
                        className={active ? "fill-accent" : "fill-ink"}
                        stroke="var(--color-paper)"
                        strokeWidth="1.5"
                      />
                      {active && (
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="11"
                          fill="none"
                          className="stroke-accent"
                          strokeWidth="1"
                        />
                      )}
                    </g>
                  );
                })}

                {bar && (
                  <g transform={`translate(${PAD} ${SIZE - 14})`}>
                    <line x1="0" y1="0" x2={bar.pixels} y2="0" className="stroke-ink" strokeWidth="1.5" />
                    <line x1="0" y1="-3" x2="0" y2="3" className="stroke-ink" strokeWidth="1.5" />
                    <line x1={bar.pixels} y1="-3" x2={bar.pixels} y2="3" className="stroke-ink" strokeWidth="1.5" />
                    <text x={bar.pixels + 6} y="3.5" className="fill-muted" fontSize="9">
                      {bar.meters >= 1000 ? `${bar.meters / 1000} km` : `${bar.meters} m`}
                    </text>
                  </g>
                )}
                <text
                  x={SIZE - 6}
                  y={SIZE - 5}
                  textAnchor="end"
                  className="fill-muted"
                  fontSize="6.5"
                  opacity="0.8"
                >
                  © OpenStreetMap contributors
                </text>
              </svg>
            </div>

            <p className="mt-2 text-center text-[0.625rem] tracking-[0.16em] text-muted">
              {points.length} {points.length === 1 ? "PLACE" : "PLACES"}
              {view.missing > 0 && ` · ${view.missing} WITHOUT A LOCATION`}
            </p>

            {selected ? (
              <>
              <Link
                href={`/entry?id=${selected.entry.id}`}
                className="mt-3 flex items-center justify-between gap-4 border border-ink px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {selected.entry.name}
                  </span>
                  <span className="block truncate text-[0.6875rem] tracking-[0.12em] text-muted">
                    {selected.entry.place?.name}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1">
                  <span className="font-[family-name:var(--font-type)] text-2xl font-bold tabular-nums">
                    {formatRating(selected.entry.rating)}
                  </span>
                  <span className="text-[0.625rem] text-muted">/10</span>
                </span>
              </Link>

              {selected.entry.place && (
                <a
                  href={mapsUrl(selected.entry.place)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex w-full items-center justify-center gap-2 border border-accent/40 py-3 text-[0.6875rem] tracking-[0.22em] text-accent"
                >
                  <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5">
                    <path
                      d="M8 14.5s5-4.6 5-8a5 5 0 0 0-10 0c0 3.4 5 8 5 8z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <circle cx="8" cy="6.4" r="1.8" fill="currentColor" />
                  </svg>
                  VIEW IN MAPS
                </a>
              )}
              </>
            ) : (
              <p className="mt-3 text-center text-xs text-muted">
                Tap a dot to see what it was.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
