"use client";

import { formatRating, verdict } from "@/lib/score";

/**
 * The rating input: a big readout over a slider, styled as a gauge. Half
 * steps only — nobody needs to agonise over 7.3 with a pizza going cold.
 */
export function RatingDial({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="plate px-4 py-5">
      <div className="flex items-end justify-between">
        <span className="label">Rating</span>
        <span className="label">{verdict(value)}</span>
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <output
          key={value}
          className="animate-stamp font-[family-name:var(--font-type)] text-6xl font-bold leading-none tabular-nums"
        >
          {formatRating(value)}
        </output>
        <span className="text-lg text-muted">/10</span>
      </div>

      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={value}
        aria-label="Rating out of ten"
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-5 w-full"
      />

      {/* Gauge ticks, 0–10. */}
      <div aria-hidden className="mt-2 flex justify-between">
        {Array.from({ length: 11 }, (_, index) => (
          <span
            key={index}
            className={`h-2 w-px ${
              index <= value ? "bg-ink" : "bg-rule"
            } ${index % 5 === 0 ? "h-3" : ""}`}
          />
        ))}
      </div>
      <div aria-hidden className="mt-1 flex justify-between text-[0.625rem] text-muted">
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
}
