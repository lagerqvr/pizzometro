"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { useSnackbar } from "@/components/Snackbar";
import { ChipField } from "@/components/ChipField";
import { PlacePicker } from "@/components/PlacePicker";
import { RatingDial } from "@/components/RatingDial";
import { useEntry, usePhotoUrl, useSettings, useTrip } from "@/lib/hooks";
import { deleteEntry, putEntry } from "@/lib/db";
import { photoFor } from "@/lib/bulk";
import { fieldsFor, toDraft, toEntry, validate, type Draft } from "@/lib/entry";
import { renderCard } from "@/lib/render";
import { formatRating, verdict } from "@/lib/score";
import { saveMessage, saveToPhotos } from "@/lib/share";
import { formatStampDate } from "@/lib/compose";
import { isMine } from "@/lib/merge";
import { mapsUrl } from "@/lib/places";
import { syncNow } from "@/lib/sync";
import type { Entry } from "@/lib/types";

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
  const { entry, loading, refresh } = useEntry(id);
  const { trip } = useTrip();
  const photo = usePhotoUrl(entry ?? undefined);
  const [busy, setBusy] = useState(false);
  /**
   * The rating as it is being changed, tagged with the rating it belongs to:
   * opening a different one leaves the half-finished edit behind rather than
   * applying it to the wrong pizza.
   */
  const [editState, setEditState] = useState<{ id: string; draft: Draft } | null>(
    null,
  );
  const draft = editState?.id === id ? editState.draft : null;
  const edit = useCallback(
    (next: Draft) => setEditState({ id, draft: next }),
    [id],
  );

  /** Re-renders the card from the stored photo with the current settings. */
  const savePicture = useCallback(async () => {
    if (!entry?.photoId) return;
    setBusy(true);
    try {
      // Fetches it from the trip if this phone has never held the bytes —
      // saving somebody else's picture should not depend on having looked
      // at it long enough for the thumbnail to cache.
      const blob = await photoFor(entry);
      if (!blob) throw new Error("missing photo");
      const card = await renderCard(blob, entry, settings);
      // Not awaited: the sheet's promise can outlive the sheet on iOS, and
      // the button would sit on BUILDING… for ever waiting for it.
      void saveToPhotos(card, entry)
        .then((result) =>
          snack(saveMessage(result), result === "failed" ? "warn" : "ok"),
        )
        .catch(() => snack("Could not save the picture", "warn"));
    } catch {
      snack("Could not build the picture", "warn");
    } finally {
      setBusy(false);
    }
  }, [entry, settings, snack]);

  /**
   * Saving an edit bumps `updatedAt`, which is what carries the change to
   * the other phone — and what makes it win over the copy held there.
   */
  const saveEdit = useCallback(async () => {
    if (!entry || !draft) return;
    const errors = validate(draft);
    if (errors.length > 0) {
      snack(errors[0].message, "warn");
      return;
    }
    setBusy(true);
    try {
      const edited = toEntry(draft, {
        id: entry.id,
        createdAt: entry.createdAt,
        photoId: entry.photoId,
      });
      const next: Entry = {
        ...edited,
        // Who took it and where its picture lives are not the form's to change.
        rater: entry.rater,
        photoUrl: entry.photoUrl,
        updatedAt: Date.now(),
      };
      await putEntry(next);
      setEditState(null);
      refresh();
      if (trip) void syncNow();
      snack("Rating updated");
    } catch {
      snack("Could not save the changes", "warn");
    } finally {
      setBusy(false);
    }
  }, [entry, draft, refresh, snack, trip]);

  const remove = useCallback(async () => {
    if (!entry) return;
    // Anyone on the trip can tidy the shared log, but never by accident:
    // somebody else's rating is named as theirs before it goes.
    const isOwn = isMine(entry, trip?.rater);
    const owner = entry.rater?.name ?? "someone else";
    const sure = await confirm({
      title: isOwn
        ? `Delete “${entry.name}”?`
        : `Delete ${owner}'s rating of “${entry.name}”?`,
      body: isOwn
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

  const editing = draft !== null;
  const fields = editing ? fieldsFor(draft.kind) : null;
  /*
   * Anyone on the trip can remove a rating — tidying the shared log is fair,
   * and the confirmation names whose it is. Nobody gets to rewrite somebody
   * else's opinion, though: a score with your name on it should only ever
   * have been typed by you.
   */
  const mine = isMine(entry, trip?.rater);
  const owner = entry.rater?.name;

  return (
    <main className="flex-1 pb-28">
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <button
          type="button"
          onClick={() => (editing ? setEditState(null) : router.back())}
          className="text-[0.6875rem] tracking-[0.22em] text-muted"
        >
          {editing ? "✕ CANCEL" : "← BACK"}
        </button>
        {editing && <span className="label">EDITING</span>}
      </header>

      <div className="animate-rise px-5 pt-3">
        {photo && !editing && (
          /* The picture is sized off the viewport rather than the width, so
             the whole rating fits on one screen without scrolling. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo}
            alt={entry.name}
            className="mx-auto block h-[34vh] w-[34vh] max-w-full border border-rule object-cover"
          />
        )}

        {editing && draft ? (
          <div className="space-y-4">
            <RatingDial
              value={draft.rating}
              onChange={(rating) => edit({ ...draft, rating })}
            />

            <ChipField
              label={fields!.nameLabel}
              placeholder={fields!.namePlaceholder}
              value={draft.name}
              onChange={(name) => edit({ ...draft, name })}
            />

            {fields!.style && (
              <ChipField
                label="Style"
                placeholder="Napoletana"
                value={draft.style}
                options={fields!.styles}
                onChange={(style) => edit({ ...draft, style })}
              />
            )}

            {fields!.place && (
              <PlacePicker
                value={draft.place}
                onChange={(place) => edit({ ...draft, place })}
              />
            )}

            <label className="plate block px-4 py-3">
              <span className="label">Date</span>
              <input
                type="date"
                value={draft.date}
                onChange={(event) => edit({ ...draft, date: event.target.value })}
                className="mt-1 w-full bg-transparent text-base outline-none"
              />
            </label>

            <label className="plate block px-4 py-3">
              <span className="label">Note</span>
              <input
                value={draft.note}
                onChange={(event) => edit({ ...draft, note: event.target.value })}
                placeholder="Optional"
                className="mt-1 w-full bg-transparent text-base outline-none placeholder:text-muted"
              />
            </label>
          </div>
        ) : (
          <>
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

            {/* Short facts share a row; only the ones that can run long get
                one to themselves. */}
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
              {entry.place && <PlaceRow place={entry.place} />}
              {entry.note && <Row label="Note" value={entry.note} />}
            </dl>
          </>
        )}

        {editing ? (
          <button
            type="button"
            onClick={saveEdit}
            disabled={busy}
            className="mt-5 w-full bg-ink py-4 text-[0.75rem] tracking-[0.22em] text-paper disabled:opacity-40"
          >
            {busy ? "SAVING…" : "SAVE CHANGES"}
          </button>
        ) : (
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Action
              label={busy ? "…" : "SAVE"}
              onClick={savePicture}
              disabled={busy || !entry.photoId}
            >
              <path
                d="M8 2v8M4.5 7L8 10.5 11.5 7M2.5 12.5h11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="square"
              />
            </Action>

            <Action
              label="EDIT"
              onClick={() => edit(toDraft(entry))}
              disabled={!mine}
            >
              <path
                d="M11.2 2.3l2.5 2.5M9.9 3.6l2.5 2.5-7 7H2.9v-2.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </Action>

            <Action label="DELETE" onClick={remove} tone="accent">
              <path
                d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.2A1 1 0 0 0 5.7 14h4.6a1 1 0 0 0 1-.8L12 4M6.6 6.8v4.4M9.4 6.8v4.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="square"
              />
            </Action>
          </div>
        )}

        {!editing && !mine && (
          <p className="mt-2 text-center text-xs leading-relaxed text-muted">
            {owner}&rsquo;s rating — only {owner} can change it. You can still
            delete it from the trip.
          </p>
        )}
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

function Action({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "accent";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 border py-4 text-[0.75rem] tracking-[0.16em] transition-transform active:scale-[0.985] disabled:opacity-40 ${
        tone === "accent" ? "border-accent text-accent" : "border-ink"
      }`}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5">
        {children}
      </svg>
      {label}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-rule py-2">
      <dt className="label shrink-0 pt-0.5">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </div>
  );
}

/**
 * The name is enough on the screen; the map is one tap away — but only when
 * the place has coordinates. Sending a name to a map on its own opens
 * whichever one in the world the search likes best.
 */
function PlaceRow({ place }: { place: NonNullable<Entry["place"]> }) {
  if (place.lat == null || place.lon == null) {
    return <Row label="Location" value={place.name} />;
  }
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dashed border-rule py-2">
      <dt className="label shrink-0">Location</dt>
      <dd className="min-w-0">
        <a
          href={mapsUrl(place)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-end gap-1.5 text-sm"
        >
          <span className="truncate">{place.name}</span>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 shrink-0 text-accent"
          >
            <path
              d="M8 14.5s5-4.6 5-8a5 5 0 0 0-10 0c0 3.4 5 8 5 8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <circle cx="8" cy="6.4" r="1.8" fill="currentColor" />
          </svg>
          <span className="sr-only">Open in maps</span>
        </a>
      </dd>
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
