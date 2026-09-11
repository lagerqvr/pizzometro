"use client";

import { useState } from "react";
import { EntryCard, EntryCardSkeleton } from "@/components/EntryCard";
import { Wordmark } from "@/components/Wordmark";
import { useEntries, useTrip } from "@/lib/hooks";
import { byRater, ratersOf } from "@/lib/merge";
import { formatRating, rank, stats } from "@/lib/score";
import type { Rater } from "@/lib/types";

export default function LeaderboardPage() {
  const { entries, loading, expected } = useEntries();
  const { trip } = useTrip();
  const [selected, setSelected] = useState<string | null>(null);

  const all = entries ?? [];
  const raters = ratersOf(all);
  // Alone, or before the other one has rated anything, there is one board.
  const split = Boolean(trip) && raters.length > 1;
  // A selected person who no longer has any ratings falls back to everyone,
  // rather than leaving a tab lit above an empty board.
  const who =
    split && raters.some((rater) => rater.id === selected) ? selected : null;
  const ranked = rank(byRater(all, who));

  return (
    <main className="flex-1 pb-6">
      <Wordmark subtitle="Leaderboard" />

      {split && (
        <>
          {/* Two people fill the width; a table of six scrolls sideways
              rather than shrinking to nothing. */}
          <div className="mt-5 flex gap-px overflow-x-auto border-y border-ink bg-ink">
            <Tab
              label={raters.length > 2 ? "EVERYONE" : "BOTH"}
              active={who === null}
              onClick={() => setSelected(null)}
            />
            {raters.map((rater) => (
              <Tab
                key={rater.id}
                label={rater.name.toUpperCase()}
                active={who === rater.id}
                onClick={() => setSelected(rater.id)}
              />
            ))}
          </div>

          {who === null &&
            (raters.length <= 3 ? (
              <section
                className={`grid border-b border-rule ${
                  raters.length === 3 ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                {raters.map((rater, index) => (
                  <Score
                    key={rater.id}
                    rater={rater}
                    entries={byRater(all, rater.id)}
                    divider={index > 0}
                  />
                ))}
              </section>
            ) : (
              /* Past three, columns are narrower than the numbers in them. */
              <section className="border-b border-rule">
                {raters.map((rater) => (
                  <ScoreRow
                    key={rater.id}
                    rater={rater}
                    entries={byRater(all, rater.id)}
                  />
                ))}
              </section>
            ))}
        </>
      )}

      <section className="mt-6 px-5">
        {loading ? (
          <ol>
            {Array.from({ length: Math.max(expected, 1) }, (_, index) => (
              <li key={index}>
                <EntryCardSkeleton />
              </li>
            ))}
          </ol>
        ) : ranked.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            The board fills up once you rate something.
          </p>
        ) : (
          <ol>
            {ranked.map((entry) => (
              <li key={entry.id} className="animate-rise">
                <EntryCard entry={entry} rank={entry.rank} />
              </li>
            ))}
          </ol>
        )}
      </section>

    </main>
  );
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-w-[5.5rem] flex-1 shrink-0 truncate px-3 py-3 text-[0.625rem] tracking-[0.16em] transition-colors ${
        active ? "bg-ink text-paper" : "bg-paper text-muted"
      }`}
    >
      {label}
    </button>
  );
}

/** How one person's half of the trip is going. */
function Score({
  rater,
  entries,
  divider,
}: {
  rater: Rater;
  entries: ReturnType<typeof byRater>;
  /** Only inside a row: a left rule on a row's first cell looks wrong. */
  divider: boolean;
}) {
  const summary = stats(entries);
  return (
    <div className={`px-5 py-3 ${divider ? "border-l border-rule" : ""}`}>
      <p className="label truncate">{rater.name}</p>
      <p className="font-[family-name:var(--font-type)] text-2xl font-bold tabular-nums">
        {summary.average == null ? "—" : formatRating(summary.average)}
      </p>
      <p className="text-[0.625rem] tracking-[0.16em] text-muted">
        {summary.count} RATED
      </p>
    </div>
  );
}

/** The same numbers as `Score`, in a row, for a bigger table. */
function ScoreRow({
  rater,
  entries,
}: {
  rater: Rater;
  entries: ReturnType<typeof byRater>;
}) {
  const summary = stats(entries);
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-rule px-5 py-2 last:border-b-0">
      <p className="min-w-0 truncate text-sm">{rater.name}</p>
      <p className="flex shrink-0 items-baseline gap-2">
        <span className="text-[0.625rem] tracking-[0.16em] text-muted">
          {summary.count} RATED
        </span>
        <span className="font-[family-name:var(--font-type)] text-xl font-bold tabular-nums">
          {summary.average == null ? "—" : formatRating(summary.average)}
        </span>
      </p>
    </div>
  );
}
