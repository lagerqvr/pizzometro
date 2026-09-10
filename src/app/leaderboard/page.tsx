"use client";

import { useState } from "react";
import { EntryCard } from "@/components/EntryCard";
import { TripFooter, Wordmark } from "@/components/Wordmark";
import { useEntries, useTrip } from "@/lib/hooks";
import { byRater, ratersOf } from "@/lib/merge";
import { formatRating, rank, stats } from "@/lib/score";
import type { Rater } from "@/lib/types";

export default function LeaderboardPage() {
  const { entries, loading } = useEntries();
  const { trip } = useTrip();
  const [selected, setSelected] = useState<string | null>(null);

  const all = entries ?? [];
  const raters = ratersOf(all);
  // Alone, or before the other one has rated anything, there is one board.
  const split = Boolean(trip) && raters.length > 1;
  const who = split ? selected : null;
  const ranked = rank(byRater(all, who));

  return (
    <main className="flex-1 pb-28">
      <Wordmark subtitle="Leaderboard" />

      {split && (
        <>
          <div className="mt-5 flex gap-px border-y border-ink bg-ink">
            <Tab label="BOTH" active={who === null} onClick={() => setSelected(null)} />
            {raters.map((rater) => (
              <Tab
                key={rater.id}
                label={rater.name.toUpperCase()}
                active={who === rater.id}
                onClick={() => setSelected(rater.id)}
              />
            ))}
          </div>

          {who === null && (
            <section className="grid grid-cols-2 border-b border-rule">
              {raters.map((rater, index) => (
                <Score
                  key={rater.id}
                  rater={rater}
                  entries={byRater(all, rater.id)}
                  divider={index > 0}
                />
              ))}
            </section>
          )}
        </>
      )}

      <section className="mt-6 px-5">
        {loading ? (
          <p className="label py-10 text-center">LOADING…</p>
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

      <TripFooter />
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
      className={`flex-1 truncate px-3 py-3 text-[0.625rem] tracking-[0.16em] transition-colors ${
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
