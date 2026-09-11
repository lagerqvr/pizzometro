"use client";

import { EntryCard, EntryCardSkeleton } from "@/components/EntryCard";
import { Wordmark } from "@/components/Wordmark";
import { useEntries } from "@/lib/hooks";
import { formatRating, stats } from "@/lib/score";

export default function HomePage() {
  const { entries, loading, expected } = useEntries();
  const summary = stats(entries ?? []);

  return (
    <main className="flex-1 pb-24">
      <Wordmark subtitle="Misuratore di pizza" />

      <section className="mt-6 grid grid-cols-3 border-y border-rule">
        <Stat label="Rated" value={String(summary.count)} />
        <Stat
          label="Average"
          value={summary.average == null ? "—" : formatRating(summary.average)}
          divider
        />
        <Stat
          label="Best"
          value={summary.best ? formatRating(summary.best.rating) : "—"}
          divider
        />
      </section>

      <section className="px-5">
        {loading ? (
          // The shape of what is coming, rather than a word that then jumps.
          <ul className="pt-2">
            {Array.from({ length: Math.max(expected, 1) }, (_, index) => (
              <li key={index}>
                <EntryCardSkeleton />
              </li>
            ))}
          </ul>
        ) : entries!.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted">Nothing rated yet.</p>
            <p className="mt-1 text-xs text-muted">
              Photograph the first pizza before it goes cold.
            </p>
          </div>
        ) : (
          <ul className="pt-2">
            {entries!.map((entry) => (
              <li key={entry.id} className="animate-rise">
                <EntryCard entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${divider ? "border-l border-rule" : ""}`}>
      <p className="label">{label}</p>
      <p className="font-[family-name:var(--font-type)] text-2xl font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}
