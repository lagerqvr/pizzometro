"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "@/components/Camera";
import { PlacePicker } from "@/components/PlacePicker";
import { RatingDial } from "@/components/RatingDial";
import { useSnackbar } from "@/components/Snackbar";
import { EMPTY_DRAFT, fieldsFor, toEntry, validate, type Draft } from "@/lib/entry";
import { useSettings, useTrip } from "@/lib/hooks";
import { newId, putEntry, putPhoto } from "@/lib/db";
import { renderCard, shrinkPhoto } from "@/lib/render";
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

  const [step, setStep] = useState<Step>("shoot");
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = useRef(false);

  const photo = shot?.blob ?? null;
  const photoUrl = shot?.url ?? null;

  // Object URLs are released when the flow unmounts; the values themselves
  // are created alongside their blob, never in an effect.
  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot.url);
      if (card) URL.revokeObjectURL(card.url);
    };
  }, [shot, card]);

  const patch = useCallback(
    (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next })),
    [],
  );

  const onCapture = useCallback(async (blob: Blob) => {
    setBusy(true);
    try {
      const shrunk = await shrinkPhoto(blob);
      setShot({ blob: shrunk, url: URL.createObjectURL(shrunk) });
      setStep("details");
    } catch {
      snack("Could not read that photo", "warn");
    } finally {
      setBusy(false);
    }
  }, [snack]);

  const fields = fieldsFor(draft.kind);
  const errors = validate(draft);

  /** Details → preview: build the entry and render the picture. */
  const buildCard = useCallback(async () => {
    if (!photo || errors.length > 0) return;
    setBusy(true);
    try {
      const entry = toEntry(draft, { id: "preview", createdAt: Date.now() });
      const blob = await renderCard(photo, entry, settings);
      if (card) URL.revokeObjectURL(card.url);
      setCard({ blob, url: URL.createObjectURL(blob) });
      setStep("preview");
    } catch {
      snack("Could not build the picture", "warn");
    } finally {
      setBusy(false);
    }
  }, [photo, draft, settings, errors.length, card, snack]);

  /** Preview → done: persist, then push the picture at the camera roll. */
  const commit = useCallback(async () => {
    if (!photo || !card || saved.current) return;
    saved.current = true;
    setBusy(true);
    try {
      const id = newId();
      const photoId = `photo:${id}`;
      await putPhoto(photoId, photo);
      const entry = toEntry(draft, { id, createdAt: Date.now(), photoId });
      await putEntry(trip ? { ...entry, rater: trip.rater } : entry);
      // Straight into the queue; it goes up now or the next time there is
      // signal, and either way the rating is already saved.
      if (trip) void syncNow();

      const result = await saveToPhotos(card.blob, entry);
      snack(saveMessage(result), result === "failed" ? "warn" : "ok");
      router.replace(`/entry?id=${id}`);
    } catch {
      saved.current = false;
      setBusy(false);
      snack("Could not save the rating", "warn");
    }
  }, [photo, card, draft, router, snack, trip]);

  if (step === "shoot") {
    return (
      <Camera
        guides={settings.cameraGuides}
        systemCamera={settings.systemCamera}
        onCapture={onCapture}
        onCancel={() => router.replace("/")}
      />
    );
  }

  return (
    <main className="flex-1 pb-32">
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
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

          <label className="plate block px-4 py-3">
            <span className="label">{fields.nameLabel}</span>
            <input
              value={draft.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder={fields.namePlaceholder}
              className="mt-1 w-full bg-transparent text-base outline-none placeholder:text-muted"
            />
          </label>

          {fields.style && (
            <label className="plate block px-4 py-3">
              <span className="label">Style</span>
              <input
                value={draft.style}
                onChange={(event) => patch({ style: event.target.value })}
                placeholder="Napoletana"
                className="mt-1 w-full bg-transparent text-base outline-none placeholder:text-muted"
              />
            </label>
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

      {step === "preview" && card && (
        <div className="animate-rise space-y-4 px-5 pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.url}
            alt="The picture that will be saved"
            className="w-full border border-rule"
          />
          <p className="text-center text-xs text-muted">
            Saving puts this in your photos. Corner placement lives in Setup.
          </p>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm">
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            disabled={busy || errors.length > 0}
            onClick={step === "details" ? buildCard : commit}
            className="w-full bg-ink py-4 text-[0.75rem] tracking-[0.22em] text-paper transition-transform active:scale-[0.985] disabled:opacity-40"
          >
            {busy
              ? "WORKING…"
              : step === "details"
                ? "REVIEW PICTURE"
                : "SAVE & KEEP PICTURE"}
          </button>
        </div>
      </div>
    </main>
  );
}
