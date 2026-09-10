"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistance, manualPlace, mergePlaces } from "@/lib/places";
import type { Place } from "@/lib/types";

type Status = "idle" | "locating" | "loading" | "ready" | "denied" | "failed";

async function fetchPlaces(params: URLSearchParams): Promise<Place[]> {
  const response = await fetch(`/api/places?${params}`);
  if (!response.ok) return [];
  const data = (await response.json()) as { places?: Place[] };
  return data.places ?? [];
}

/**
 * Asks "this place?" from the phone's position, and always leaves a plain
 * text field as the escape hatch — GPS indoors in Naples is a coin flip.
 */
export function PlacePicker({
  value,
  onChange,
}: {
  value: Place | null;
  onChange: (place: Place | null) => void;
}) {
  const [nearby, setNearby] = useState<Place[]>([]);
  // Results are stored with the query they answer, so a stale response for a
  // previous query can never be shown against the current one.
  const [results, setResults] = useState<{ query: string; places: Place[] }>({
    query: "",
    places: [],
  });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>(() =>
    typeof navigator !== "undefined" && navigator.geolocation
      ? "locating"
      : "failed",
  );
  const coords = useRef<{ lat: number; lon: number } | null>(null);
  // A place already chosen needs no lookup: editing an old rating should not
  // spend a GPS fix and an Overpass call to re-answer a settled question.
  const chosen = value !== null;

  useEffect(() => {
    if (chosen) return;
    if (!navigator.geolocation) return;
    let cancelled = false;

    /*
     * iOS can answer a denied permission with silence — neither callback
     * ever runs — which used to leave "LOCATING…" on the screen for good.
     * This is the backstop: after it, the text field is the way in.
     */
    const watchdog = setTimeout(() => {
      if (!cancelled) {
        setStatus((current) => (current === "locating" ? "denied" : current));
      }
    }, 10_000);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        clearTimeout(watchdog);
        if (cancelled) return;
        coords.current = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        setStatus("loading");
        const params = new URLSearchParams({
          lat: String(coords.current.lat),
          lon: String(coords.current.lon),
        });
        const places = await fetchPlaces(params).catch(() => []);
        if (cancelled) return;
        setNearby(places);
        setStatus(places.length ? "ready" : "failed");
      },
      () => {
        clearTimeout(watchdog);
        if (!cancelled) setStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
  }, [chosen]);

  // Debounced search, so typing doesn't hammer the proxy.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) return;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q: trimmed });
      if (coords.current) {
        params.set("lat", String(coords.current.lat));
        params.set("lon", String(coords.current.lon));
      }
      const places = await fetchPlaces(params).catch(() => []);
      setResults({ query: trimmed, places });
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmed = query.trim();
  const searching = trimmed.length >= 3;
  const matched = results.query === trimmed ? results.places : [];
  const suggestions = searching
    ? mergePlaces(
        matched,
        nearby.filter((place) =>
          place.name.toLowerCase().includes(trimmed.toLowerCase()),
        ),
      )
    : nearby;

  if (value) {
    return (
      <div className="plate flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="label">Location</p>
          <p className="truncate text-sm font-medium">{value.name}</p>
          {value.address && (
            <p className="truncate text-xs text-muted">{value.address}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-[0.6875rem] tracking-[0.18em] text-accent"
        >
          CHANGE
        </button>
      </div>
    );
  }

  return (
    <div className="plate px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="label">Location</p>
        <p className="text-[0.625rem] tracking-[0.18em] text-muted">
          {status === "locating" && "LOCATING…"}
          {status === "loading" && "LOOKING AROUND…"}
          {status === "ready" && "THIS PLACE?"}
          {status === "denied" && "NO GPS — TYPE IT"}
          {status === "failed" && "NOTHING NEARBY — TYPE IT"}
        </p>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search or type a name"
        aria-label="Search for a place"
        className="mt-2 w-full border-b border-rule bg-transparent py-2 text-sm outline-none placeholder:text-muted focus:border-ink"
      />

      <ul className="mt-1 max-h-56 overflow-y-auto">
        {suggestions.slice(0, 8).map((place) => (
          <li key={place.id}>
            <button
              type="button"
              onClick={() => onChange(place)}
              className="flex w-full items-center justify-between gap-3 border-b border-dashed border-rule py-2.5 text-left transition-colors active:bg-paper-dim"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{place.name}</span>
                {place.address && (
                  <span className="block truncate text-xs text-muted">
                    {place.address}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[0.625rem] text-muted">
                {formatDistance(place.distance)}
              </span>
            </button>
          </li>
        ))}

        {trimmed.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => onChange(manualPlace(trimmed))}
              className="w-full py-2.5 text-left text-sm text-accent"
            >
              Use “{trimmed}”
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
