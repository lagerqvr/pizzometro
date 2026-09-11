"use client";

import type { Corner } from "@/lib/types";

export const CORNERS: Array<{ value: Corner; label: string }> = [
  { value: "tl", label: "Top left" },
  { value: "tr", label: "Top right" },
  { value: "bl", label: "Bottom left" },
  { value: "br", label: "Bottom right" },
];

/**
 * A miniature of the saved picture: three blocks — score, place, pizza —
 * sitting in the corner they would be stamped into. The score is the stronger
 * tone because that is what the eye lands on.
 */
function Miniature({ corner, active }: { corner: Corner; active: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative block aspect-square w-full ${
        active ? "bg-paper/15" : "bg-paper-dim"
      }`}
    >
      <span
        className={`absolute inset-x-2 flex flex-col gap-1 ${
          corner.startsWith("t") ? "top-2" : "bottom-2"
        } ${corner.endsWith("l") ? "items-start" : "items-end"}`}
      >
        {["w-1/4", "w-3/5", "w-2/5"].map((width, index) => (
          <span
            key={width}
            className={`h-4 ${width} ${
              index === 0
                ? active
                  ? "bg-paper"
                  : "bg-ink-soft"
                : active
                  ? "bg-paper/50"
                  : "bg-muted"
            }`}
          />
        ))}
      </span>
    </span>
  );
}

/**
 * Picks a corner for the stamp. Used twice: in Setup to set the default for
 * every picture, and on a single rating to override it for that one — which
 * is why `value` may be null there, meaning "whatever the setting says".
 */
export function CornerPicker({
  value,
  onChange,
  fallback,
}: {
  value: Corner | null;
  onChange: (corner: Corner) => void;
  /** Shown as the choice when `value` is null. */
  fallback?: Corner;
}) {
  const shown = value ?? fallback;
  return (
    <div className="grid grid-cols-2 gap-2">
      {CORNERS.map((corner) => {
        const active = shown === corner.value;
        return (
          <button
            key={corner.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(corner.value)}
            className={`border p-2 text-left transition-colors ${
              active ? "border-ink bg-ink text-paper" : "border-rule"
            }`}
          >
            <Miniature corner={corner.value} active={active} />
            <span className="mt-2 block text-[0.625rem] tracking-[0.16em] uppercase">
              {corner.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
