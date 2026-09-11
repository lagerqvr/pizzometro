"use client";

import Link from "next/link";
import { usePhotoUrl, useTrip } from "@/lib/hooks";
import { formatRating } from "@/lib/score";
import { initialOf } from "@/lib/trip";
import type { Entry } from "@/lib/types";

function subtitle(entry: Entry): string {
  if (entry.kind === "homemade") return "SELF MADE";
  return entry.place?.name?.toUpperCase() ?? "NO LOCATION";
}

export function EntryCard({ entry, rank }: { entry: Entry; rank?: number }) {
  // The card is 64px across: the small copy is all it can show.
  const photo = usePhotoUrl(entry, "thumb");
  const { trip } = useTrip();
  // Only worth saying whose it is when there is somebody else on the trip.
  const who = trip && entry.rater ? initialOf(entry.rater) : null;

  return (
    <Link
      href={`/entry?id=${entry.id}`}
      className="group flex items-center gap-4 border-b border-dashed border-rule py-3 transition-transform active:scale-[0.99]"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden border border-rule bg-paper-dim">
        {photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo}
            alt=""
            className="animate-fade h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[0.625rem] text-muted">
            NO IMG
          </span>
        )}
        {rank != null && (
          <span className="absolute left-0 top-0 bg-ink px-1.5 py-0.5 text-[0.625rem] font-bold text-paper">
            {rank}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <p className="truncate text-[0.6875rem] tracking-[0.12em] text-muted">
          {who && <span className="text-ink">{who}</span>}
          {who && " · "}
          {subtitle(entry)}
        </p>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="font-[family-name:var(--font-type)] text-2xl font-bold tabular-nums">
          {formatRating(entry.rating)}
        </span>
        <span className="text-[0.625rem] text-muted">/10</span>
      </div>
    </Link>
  );
}

/** The shape of a card, for the moment before the ratings have been read. */
export function EntryCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex animate-pulse items-center gap-4 border-b border-dashed border-rule py-3"
    >
      <div className="h-16 w-16 shrink-0 border border-rule bg-paper-dim" />
      <div className="min-w-0 flex-1">
        <div className="h-3.5 w-2/5 bg-paper-dim" />
        <div className="mt-2 h-2.5 w-3/5 bg-paper-dim" />
      </div>
      <div className="h-6 w-10 bg-paper-dim" />
    </div>
  );
}
