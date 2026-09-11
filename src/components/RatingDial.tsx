"use client";

import { formatRating, verdict } from "@/lib/score";

/**
 * The rating input: a big readout over a slider, styled as a gauge.
 *
 * Tenths, because a pizza can be better than the last one without being half
 * a point better. A hundred steps is finer than a thumb can land on a slider,
 * so there are two buttons beside the readout for the last tenth either way.
 */
/** Keeps the arithmetic on a tenth, and inside the scale. */
function step(value: number, by: number): number {
  return Math.min(10, Math.max(0, Math.round((value + by) * 10) / 10));
}

function Nudge({
  label,
  symbol,
  disabled,
  onClick,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center border border-rule text-base transition-transform active:scale-90 disabled:opacity-30"
    >
      {symbol}
    </button>
  );
}

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

      <div className="mt-1 flex items-end justify-between">
        <div className="flex items-baseline gap-2">
          <output
            key={value}
            className="animate-stamp font-[family-name:var(--font-type)] text-6xl font-bold leading-none tabular-nums"
          >
            {formatRating(value)}
          </output>
          <span className="text-lg text-muted">/10</span>
        </div>

        {/* A tenth is a few pixels of slider; these are for landing on it. */}
        <div className="flex gap-2">
          <Nudge
            label="Down a tenth"
            symbol="−"
            disabled={value <= 0}
            onClick={() => onChange(step(value, -0.1))}
          />
          <Nudge
            label="Up a tenth"
            symbol="+"
            disabled={value >= 10}
            onClick={() => onChange(step(value, 0.1))}
          />
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={10}
        step={0.1}
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
