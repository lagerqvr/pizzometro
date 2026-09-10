"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

/**
 * The rating lives in the query string rather than the path, which keeps this
 * one static page instead of a server-rendered route per id. That is what
 * lets it open with no signal: the page is in the offline cache, and the
 * rating itself comes from IndexedDB.
 */
function EntryView() {
  const id = useSearchParams().get("id") ?? "";
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
    // Anyone on the trip can tidy the shared log, but never by accident:
    // somebody else's rating is named as theirs before it goes.
    const mine = isMine(entry, trip?.rater);
    const owner = entry.rater?.name ?? "someone else";
    const sure = await confirm({
      title: mine
        ? `Delete “${entry.name}”?`
        : `Delete ${owner}'s rating of “${entry.name}”?`,
      body: mine
        ? trip
          ? "It goes from this phone and from the trip. The picture you saved to your photos stays."
          : "This cannot be undone. The picture you saved to your photos stays."
        : `It goes from the trip, and from ${owner}'s phone the next time they sync.`,
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

      <div className="animate-rise px-5 pt-3">
        {photo && (
          /* The picture is sized off the viewport rather than the width, so
             the whole rating fits on one screen without scrolling. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo}
            alt={entry.name}
            className="mx-auto block h-[34vh] w-[34vh] max-w-full border border-rule object-cover"
          />
        )}

        <div className="mt-4 flex items-end justify-between">
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

        <div className="my-4 border-b border-rule" aria-hidden />

        {/* Short facts share a row; only the ones that can run long get one
            to themselves. */}
        <dl>
          <Pair>
            <Cell label="Kind" value={KIND_LABEL[entry.kind]} />
            <Cell label="Date" value={formatStampDate(entry.createdAt)} />
          </Pair>
          {(entry.style || (trip && entry.rater)) && (
            <Pair>
              <Cell label="Style" value={entry.style ?? "—"} />
              <Cell label="Rated by" value={entry.rater?.name ?? "—"} />
            </Pair>
          )}
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
        </dl>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={savePicture}
            disabled={busy || !entry.photoId}
            className="col-span-2 border border-ink py-4 text-[0.75rem] tracking-[0.22em] transition-transform active:scale-[0.985] disabled:opacity-40"
          >
            {busy ? "BUILDING…" : "SAVE PICTURE"}
          </button>

          <button
            type="button"
            onClick={remove}
            aria-label="Delete this rating"
            className="flex items-center justify-center gap-1.5 border border-accent py-4 text-[0.75rem] tracking-[0.16em] text-accent transition-transform active:scale-[0.985]"
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
            DELETE
          </button>
        </div>
      </div>
    </main>
  );
}

export default function EntryPage() {
  return (
    <Suspense fallback={<p className="label py-20 text-center">LOADING…</p>}>
      <EntryView />
    </Suspense>
  );
}

const KIND_LABEL = {
  pizzeria: "Pizzeria",
  homemade: "Self made",
  other: "Dessert / other",
} as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-rule py-2">
      <dt className="label shrink-0 pt-0.5">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </div>
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 border-b border-dashed border-rule py-2">
      {children}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  );
}
