"use client";

import { useCallback, useState } from "react";
import { TripFooter, Wordmark } from "@/components/Wordmark";
import { useConfirm } from "@/components/Confirm";
import { useSnackbar } from "@/components/Snackbar";
import { useSettings, useSync, useTrip } from "@/lib/hooks";
import { exportEntries } from "@/lib/db";
import { syncNow, type SyncState } from "@/lib/sync";
import { isTripCode, joinLink, newTripCode, normaliseCode } from "@/lib/trip";
import type { Corner } from "@/lib/types";

const CORNERS: Array<{ value: Corner; label: string }> = [
  { value: "tl", label: "Top left" },
  { value: "tr", label: "Top right" },
  { value: "bl", label: "Bottom left" },
  { value: "br", label: "Bottom right" },
];

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const { trip } = useTrip();
  const snack = useSnackbar();
  const [exporting, setExporting] = useState(false);

  const exportJson = useCallback(async () => {
    setExporting(true);
    try {
      const json = await exportEntries();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pizzometro-log.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      snack("Log exported (ratings only, no photos)");
    } catch {
      snack("Could not export the log", "warn");
    } finally {
      setExporting(false);
    }
  }, [snack]);

  return (
    <main className="flex-1 pb-28">
      <Wordmark subtitle="Setup" />

      <TripSection />

      <section className="mt-8 px-5">
        <h2 className="label">Stats placement</h2>
        <p className="mt-1 text-xs text-muted">
          Which corner of the saved picture the stats are stamped into.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {CORNERS.map((corner) => {
            const active = settings.stampCorner === corner.value;
            return (
              <button
                key={corner.value}
                type="button"
                aria-pressed={active}
                onClick={() => update({ stampCorner: corner.value })}
                className={`border p-2 text-left transition-colors ${
                  active ? "border-ink bg-ink text-paper" : "border-rule"
                }`}
              >
                {/* A miniature of the card, so the choice is visible. */}
                <span
                  aria-hidden
                  className={`relative block aspect-square w-full ${
                    active ? "bg-paper/15" : "bg-paper-dim"
                  }`}
                >
                  {/* One block per line the picture actually stamps —
                      score, place, pizza — the score in the stronger tone
                      because that is what the eye lands on. */}
                  <span
                    className={`absolute inset-x-2 flex flex-col gap-1 ${
                      corner.value.startsWith("t") ? "top-2" : "bottom-2"
                    } ${
                      corner.value.endsWith("l") ? "items-start" : "items-end"
                    }`}
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
                <span className="mt-2 block text-[0.625rem] tracking-[0.16em] uppercase">
                  {corner.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8 px-5">
        <h2 className="label">Stamp on picture</h2>
        <div className="mt-2">
          {(
            [
              ["rating", "Rating"],
              ["place", "Location"],
              ["name", "Pizza name"],
              ["date", "Date"],
            ] as const
          ).map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              checked={settings.stamp[key]}
              onChange={(checked) =>
                update({ stamp: { ...settings.stamp, [key]: checked } })
              }
            />
          ))}
        </div>
      </section>

      <section className="mt-8 px-5">
        <h2 className="label">Camera</h2>
        <div className="mt-2">
          <Toggle
            label="Centering guides"
            hint="Rule of thirds, centre ring and square-crop markers"
            checked={settings.cameraGuides}
            onChange={(cameraGuides) => update({ cameraGuides })}
          />
        </div>
      </section>

      <section className="mt-8 px-5">
        <h2 className="label">Data</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {trip
            ? "Ratings and photos live on this phone and in the shared trip. The log below is a plain backup either way."
            : "Ratings and photos live on this device only. Nothing is uploaded."}
        </p>
        <button
          type="button"
          onClick={exportJson}
          disabled={exporting}
          className="mt-3 w-full border border-ink py-3.5 text-[0.6875rem] tracking-[0.22em] disabled:opacity-40"
        >
          {exporting ? "EXPORTING…" : "EXPORT LOG (JSON)"}
        </button>
      </section>

      <TripFooter />
    </main>
  );
}

/** How the network is doing, in a sentence rather than a badge. */
function statusLine(sync: SyncState): string {
  switch (sync.status) {
    case "offline":
      return sync.pending > 0
        ? `Offline — ${sync.pending} waiting to go up`
        : "Offline — everything here is already shared";
    case "syncing":
      return "Syncing…";
    case "unavailable":
      return "Sharing is not set up yet — ratings stay on this phone";
    case "error":
      return "Could not reach the trip — it will try again";
    case "idle":
      if (sync.pending > 0) return `${sync.pending} waiting to go up`;
      return sync.lastSyncedAt
        ? `Synced at ${new Date(sync.lastSyncedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "Ready";
    case "off":
      return "";
  }
}

/**
 * A trip is two phones agreeing on a ten-character code. There is no account
 * to make and nothing to log into, and leaving one takes nothing away.
 */
function TripSection() {
  const { trip, join, leave } = useTrip();
  const sync = useSync();
  const snack = useSnackbar();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const start = useCallback(
    async (tripCode: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await join(tripCode, name);
        snack("Trip started — send the link to the other phone");
      } catch {
        snack("Could not start the trip", "warn");
      } finally {
        setBusy(false);
      }
    },
    [busy, join, name, snack],
  );

  const copyLink = useCallback(async () => {
    if (!trip) return;
    const link = joinLink(trip.code, window.location.origin);
    try {
      await navigator.clipboard.writeText(link);
      snack("Invite link copied");
    } catch {
      // Clipboard is blocked in some in-app browsers; the sheet still works.
      try {
        await navigator.share({ url: link, title: "Pizzometro" });
      } catch {
        snack(link);
      }
    }
  }, [trip, snack]);

  if (!trip) {
    const typed = normaliseCode(code);
    return (
      <section className="mt-6 px-5">
        <h2 className="label">Trip</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Share one log between two phones. The leaderboard then splits by
          person as well as ranking everything together.
        </p>

        <label className="plate mt-3 block px-4 py-3">
          <span className="label">Your name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Rasmus"
            maxLength={24}
            className="mt-1 w-full bg-transparent text-base outline-none placeholder:text-muted"
          />
        </label>

        <button
          type="button"
          disabled={busy || name.trim().length === 0}
          onClick={() => start(newTripCode())}
          className="mt-3 w-full bg-ink py-3.5 text-[0.6875rem] tracking-[0.22em] text-paper disabled:opacity-40"
        >
          {busy ? "WORKING…" : "START A TRIP"}
        </button>

        <div className="mt-4 flex items-center gap-2">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="TRIP CODE"
            maxLength={16}
            className="plate min-w-0 flex-1 px-4 py-3 text-base tracking-[0.14em] outline-none placeholder:text-muted"
          />
          <button
            type="button"
            disabled={busy || !isTripCode(typed) || name.trim().length === 0}
            onClick={() => start(typed)}
            className="shrink-0 border border-ink px-5 py-3 text-[0.6875rem] tracking-[0.22em] disabled:opacity-40"
          >
            JOIN
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 px-5">
      <h2 className="label">Trip</h2>

      <div className="plate mt-3 px-4 py-3">
        <p className="label">Trip code</p>
        <p className="mt-0.5 font-[family-name:var(--font-type)] text-xl font-bold tracking-[0.22em]">
          {trip.code}
        </p>
        <p className="mt-2 text-xs text-muted">
          Rating as {trip.rater.name} · {statusLine(sync)}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="border border-ink py-3.5 text-[0.6875rem] tracking-[0.22em]"
        >
          COPY LINK
        </button>
        <button
          type="button"
          onClick={() => void syncNow(true)}
          disabled={sync.status === "syncing"}
          className="border border-ink py-3.5 text-[0.6875rem] tracking-[0.22em] disabled:opacity-40"
        >
          {sync.status === "syncing" ? "SYNCING…" : "SYNC NOW"}
        </button>
      </div>

      <button
        type="button"
        onClick={async () => {
          const sure = await confirm({
            title: "Leave the trip?",
            body: "Every rating stays on this phone. You can join again with the same code.",
            action: "LEAVE",
            destructive: true,
          });
          if (sure) {
            leave();
            snack("Left the trip");
          }
        }}
        className="mt-2 w-full border border-rule py-3.5 text-[0.6875rem] tracking-[0.22em] text-muted"
      >
        LEAVE TRIP
      </button>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-dashed border-rule py-3">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 border transition-colors ${
          checked ? "border-ink bg-ink" : "border-rule bg-transparent"
        } peer-focus-visible:ring-2 peer-focus-visible:ring-accent`}
      >
        <span
          className={`absolute top-[3px] h-[16px] w-[16px] transition-transform duration-200 ${
            checked
              ? "translate-x-[25px] bg-accent"
              : "translate-x-[3px] bg-muted"
          }`}
        />
      </span>
    </label>
  );
}
