"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { useEntries } from "@/lib/hooks";
import { bboxParam, parseRoads, project, scaleBar, spread, type Road } from "@/lib/map";
import { formatRating } from "@/lib/score";

/** The drawing is a fixed square; the screen scales it. */
const SIZE = 400;
const PAD = 30;
/** No two dots closer than this, or one hides under another. */
const DOT_GAP = 20;

export default function MapPage() {
  const { entries, loading } = useEntries();
  const [open, setOpen] = useState<string | null>(null);
  const [roads, setRoads] = useState<Road[]>([]);

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
    if (!bbox) return;
    let cancelled = false;
    fetch(`/api/roads?bbox=${bbox}`)
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled) setRoads(parseRoads(body));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bbox]);

  return (
    <main className="flex-1 pb-28">
      <Wordmark subtitle="Where we ate" />

      <section className="mt-5 px-5">
        {loading ? (
          <p className="label py-10 text-center">LOADING…</p>
        ) : points.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            Nothing with a location yet. Ratings that name a place turn up
            here.
          </p>
        ) : (
          <>
            <div className="plate relative">
              <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="block w-full"
                role="img"
                aria-label={`${points.length} rated places`}
              >
                {/* Two weights, so the big roads read as the shape of the
                    place rather than as more of the same. */}
                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                  {roads.map((road, index) => (
                    <polyline
                      key={index}
                      className={road.major ? "stroke-muted" : "stroke-rule"}
                      strokeWidth={road.major ? 2.6 : 1.2}
                      points={road.points
                        .map(([lat, lon]) => {
                          const at = view.place(lat, lon);
                          return `${at.x.toFixed(1)},${at.y.toFixed(1)}`;
                        })
                        .join(" ")}
                    />
                  ))}
                </g>

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
              </svg>
            </div>

            <p className="mt-2 text-center text-[0.625rem] tracking-[0.16em] text-muted">
              {points.length} {points.length === 1 ? "PLACE" : "PLACES"}
              {view.missing > 0 && ` · ${view.missing} WITHOUT A LOCATION`}
            </p>

            {selected ? (
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
