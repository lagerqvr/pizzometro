"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "@/components/Camera";
import { ChipField } from "@/components/ChipField";
import { PlacePicker } from "@/components/PlacePicker";
import { RatingDial } from "@/components/RatingDial";
import { useSnackbar } from "@/components/Snackbar";
import { EMPTY_DRAFT, fieldsFor, toEntry, validate, type Draft } from "@/lib/entry";
import {
  useKeyboardInset,
  useObjectUrl,
  useSettings,
  useTrip,
} from "@/lib/hooks";
import { newId, putEntry, putPhoto } from "@/lib/db";
import { PHOTO_MAX, renderCard, shrinkPhoto } from "@/lib/render";
import { saveMessage, saveToPhotos } from "@/lib/share";
import { syncNow } from "@/lib/sync";
import type { EntryKind } from "@/lib/types";

type Step = "shoot" | "details" | "preview";

const KINDS: Array<{ value: EntryKind; label: string }> = [
  { value: "pizzeria", label: "PIZZERIA" },
  { value: "homemade", label: "SELF MADE" },
  { value: "other", label: "DESSERT / OTHER" },
];

export default function NewEntryPage() {
  const router = useRouter();
  const snack = useSnackbar();
  const { settings } = useSettings();
  const { trip } = useTrip();
  const inset = useKeyboardInset();

  const [step, setStep] = useState<Step>("shoot");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [card, setCard] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<"" | "building" | "saving">("");
  const saved = useRef(false);

  // Each blob owns its own URL, so one changing never invalidates the other.
  const photoUrl = useObjectUrl(photo);
  const cardUrl = useObjectUrl(card);

  const patch = useCallback(
    (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next })),
    [],
  );

  const onCapture = useCallback(async (blob: Blob) => {
    setBusy("building");
    try {
      setPhoto(await shrinkPhoto(blob, PHOTO_MAX[settings.photoQuality]));
      setStep("details");
    } catch {
      snack("Could not read that photo", "warn");
    } finally {
      setBusy("");
    }
  }, [snack, settings.photoQuality]);

  const fields = fieldsFor(draft.kind);
  const errors = validate(draft);

  /** Details → preview: build the entry and render the picture. */
  const buildCard = useCallback(async () => {
    if (!photo || errors.length > 0) return;
    setBusy("building");
    try {
      const entry = toEntry(draft, { id: "preview", createdAt: Date.now() });
      setCard(await renderCard(photo, entry, settings));
      setStep("preview");
    } catch {
      snack("Could not build the picture", "warn");
    } finally {
      setBusy("");
    }
  }, [photo, draft, settings, errors.length, snack]);

  /** Preview → done: persist, then push the picture at the camera roll. */
  const commit = useCallback(async () => {
    if (!photo || !card || saved.current) return;
    saved.current = true;
    setBusy("saving");
    try {
      const id = newId();
      const photoId = `photo:${id}`;
      await putPhoto(photoId, photo);
      const entry = toEntry(draft, { id, createdAt: Date.now(), photoId });
      await putEntry(trip ? { ...entry, rater: trip.rater } : entry);
      // Straight into the queue; it goes up now or the next time there is
      // signal, and either way the rating is already saved.
      // Held back a moment: uploading a full-size photo competes with
      // rendering the screen we are about to show.
      if (trip) setTimeout(() => void syncNow(), 2_000);

      // The rating is saved; handing the picture to the share sheet is a
      // side effect that reports itself. iOS sometimes never settles that
      // promise, and waiting on it left this screen stuck on WORKING…
      void saveToPhotos(card, entry)
        .then((result) =>
          snack(saveMessage(result), result === "failed" ? "warn" : "ok"),
        )
        .catch(() => snack("Could not save the picture", "warn"));
      router.replace(`/entry?id=${id}`);
    } catch {
      saved.current = false;
      setBusy("");
      snack("Could not save the rating", "warn");
    }
  }, [photo, card, draft, router, snack, trip]);

  if (step === "shoot") {
    return (
      <Camera
        guides={settings.cameraGuides}
        square={settings.squareCrop}
        systemCamera={settings.systemCamera}
        mirror={settings.mirrorCamera}
        onCapture={onCapture}
        onCancel={() => router.replace("/")}
      />
    );
  }

  return (
    <main className="flex-1 pb-32">
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <button
          type="button"
          onClick={() =>
            step === "preview" ? setStep("details") : setStep("shoot")
          }
          className="text-[0.6875rem] tracking-[0.22em] text-muted"
        >
          ← BACK
        </button>
        <span className="label">
          {step === "details" ? "STEP 2 / 3" : "STEP 3 / 3"}
        </span>
      </header>

      {step === "details" && (
        <div className="animate-rise space-y-4 px-5 pt-5">
          {photoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photoUrl}
              alt="The pizza you just photographed"
              className="aspect-square w-full border border-rule object-cover"
            />
          )}

          <div className="grid grid-cols-3 gap-px border border-ink bg-ink">
            {KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                aria-pressed={draft.kind === kind.value}
                onClick={() => patch({ kind: kind.value })}
                className={`px-1 py-3 text-[0.625rem] leading-tight tracking-[0.12em] transition-colors ${
                  draft.kind === kind.value
                    ? "bg-ink text-paper"
                    : "bg-paper text-ink"
                }`}
              >
                {kind.label}
              </button>
            ))}
          </div>

          <RatingDial value={draft.rating} onChange={(rating) => patch({ rating })} />

          <ChipField
            label={fields.nameLabel}
            placeholder={fields.namePlaceholder}
            value={draft.name}
            onChange={(name) => patch({ name })}
          />

          {fields.style && (
            <ChipField
              label="Style"
              placeholder="Napoletana"
              value={draft.style}
              options={fields.styles}
              onChange={(style) => patch({ style })}
            />
          )}

          {fields.place && (
            <PlacePicker
              value={draft.place}
              onChange={(place) => patch({ place })}
            />
          )}

          <label className="plate block px-4 py-3">
            <span className="label">Note</span>
            <input
              value={draft.note}
              onChange={(event) => patch({ note: event.target.value })}
              placeholder="Optional"
              className="mt-1 w-full bg-transparent text-base outline-none placeholder:text-muted"
            />
          </label>

          {errors.length > 0 && (
            <p className="text-xs text-accent">{errors[0].message}</p>
          )}
        </div>
      )}

      {step === "preview" && cardUrl && (
        <div className="animate-rise space-y-4 px-5 pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cardUrl}
            alt="The picture that will be saved"
            className="w-full border border-rule"
          />
          <p className="text-center text-xs text-muted">
            Saving puts this in your photos. Corner placement lives in Setup.
          </p>
        </div>
      )}

      <div
        style={inset > 0 ? { transform: `translateY(${inset}px)` } : undefined}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm"
      >
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            disabled={busy !== "" || errors.length > 0}
            onClick={step === "details" ? buildCard : commit}
            className="w-full bg-ink py-4 text-[0.75rem] tracking-[0.22em] text-paper transition-transform active:scale-[0.985] disabled:opacity-40"
          >
            {busy === "building"
              ? "BUILDING PICTURE…"
              : busy === "saving"
                ? "SAVING…"
                : step === "details"
                  ? "REVIEW PICTURE"
                  : "SAVE & KEEP PICTURE"}
          </button>
        </div>
      </div>
    </main>
  );
}
