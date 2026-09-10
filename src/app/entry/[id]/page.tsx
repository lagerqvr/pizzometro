"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { useSnackbar } from "@/components/Snackbar";
import { useEntry, usePhotoUrl, useSettings, useTrip } from "@/lib/hooks";
import { deleteEntry, getPhoto } from "@/lib/db";
import { renderCard } from "@/lib/render";
import { formatRating, verdict } from "@/lib/score";
import { saveMessage, saveToPhotos } from "@/lib/share";
import { formatStampDate } from "@/lib/compose";
import { isMine } from "@/lib/merge";
import { syncNow } from "@/lib/sync";

export default function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const snack = useSnackbar();
  const confirm = useConfirm();
  const { settings } = useSettings();
  const { entry, loading } = useEntry(id);
  const { trip } = useTrip();
  const photo = usePhotoUrl(entry ?? undefined);
  const [busy, setBusy] = useState(false);

  /** Re-renders the card from the stored photo with the current settings. */
  const savePicture = useCallback(async () => {
    if (!entry?.photoId) return;
    setBusy(true);
    try {
      const blob = await getPhoto(entry.photoId);
      if (!blob) throw new Error("missing photo");
      const card = await renderCard(blob, entry, settings);
      const result = await saveToPhotos(card, entry);
      snack(saveMessage(result), result === "failed" ? "warn" : "ok");
    } catch {
      snack("Could not build the picture", "warn");
    } finally {
      setBusy(false);
    }
  }, [entry, settings, snack]);

  const remove = useCallback(async () => {
    if (!entry) return;
    const sure = await confirm({
      title: `Delete “${entry.name}”?`,
      body: trip
        ? "It goes from this phone and from the trip. The picture you saved to your photos stays."
        : "This cannot be undone. The picture you saved to your photos stays.",
      action: "DELETE",
      destructive: true,
    });
    if (!sure) return;
    await deleteEntry(entry.id, Boolean(trip));
    snack("Rating deleted");
    if (trip) void syncNow();
    router.replace("/");
  }, [entry, router, snack, trip, confirm]);

  if (loading) {
    return <p className="label py-20 text-center">LOADING…</p>;
  }

  if (!entry) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted">That rating is gone.</p>
        <Link href="/" className="label underline">
          BACK TO THE LOG
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 pb-28">
      <header className="px-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-[0.6875rem] tracking-[0.22em] text-muted"
        >
          ← BACK
        </button>
      </header>

      <div className="animate-rise px-5 pt-4">
        {photo && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo}
            alt={entry.name}
            className="aspect-square w-full border border-rule object-cover"
          />
        )}

        <div className="mt-5 flex items-end justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-medium">{entry.name}</h2>
            <p className="label mt-0.5">{verdict(entry.rating)}</p>
          </div>
          <div className="flex shrink-0 items-baseline gap-1">
            <span className="animate-stamp font-[family-name:var(--font-type)] text-5xl font-bold tabular-nums">
              {formatRating(entry.rating)}
            </span>
            <span className="text-sm text-muted">/10</span>
          </div>
        </div>

        <div className="my-5 border-b border-rule" aria-hidden />

        <dl className="space-y-0">
          <Row label="Kind" value={KIND_LABEL[entry.kind]} />
          {entry.style && <Row label="Style" value={entry.style} />}
          {entry.place && (
            <Row
              label="Location"
              value={
                entry.place.address
                  ? `${entry.place.name} · ${entry.place.address}`
                  : entry.place.name
              }
            />
          )}
          {entry.note && <Row label="Note" value={entry.note} />}
          <Row label="Date" value={formatStampDate(entry.createdAt)} />
          {trip && entry.rater && <Row label="Rated by" value={entry.rater.name} />}
        </dl>

        <button
          type="button"
          onClick={savePicture}
          disabled={busy || !entry.photoId}
          className="mt-6 w-full border border-ink py-4 text-[0.75rem] tracking-[0.22em] transition-transform active:scale-[0.985] disabled:opacity-40"
        >
          {busy ? "BUILDING…" : "SAVE PICTURE AGAIN"}
        </button>

        {/* Only your own ratings: nobody deletes somebody else's dinner. */}
        {isMine(entry, trip?.rater) && (
        <button
          type="button"
          onClick={remove}
          className="mt-3 flex w-full items-center justify-center gap-2 border border-accent py-4 text-[0.75rem] tracking-[0.22em] text-accent transition-transform active:scale-[0.985]"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5">
            <path
              d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.2A1 1 0 0 0 5.7 14h4.6a1 1 0 0 0 1-.8L12 4M6.6 6.8v4.4M9.4 6.8v4.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="square"
            />
          </svg>
          DELETE THIS RATING
        </button>
        )}
      </div>
    </main>
  );
}

const KIND_LABEL = {
  pizzeria: "Pizzeria",
  homemade: "Self made",
  other: "Dessert / other",
} as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-rule py-2.5">
      <dt className="label shrink-0 pt-0.5">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </div>
  );
}
