"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TripFooter, Wordmark } from "@/components/Wordmark";
import { useConfirm } from "@/components/Confirm";
import { manualSyncMessage } from "@/components/SyncBadge";
import { useSnackbar } from "@/components/Snackbar";
import { useEntries, useSettings, useSync, useTrip } from "@/lib/hooks";
import { othersRatings, ratersOf } from "@/lib/merge";
import { scaleBands } from "@/lib/score";
import { exportEntries } from "@/lib/db";
import {
  buildCards,
  bulkMessage,
  photographed,
  saveAll,
  type BulkProgress,
} from "@/lib/bulk";
import { eraseDevice } from "@/lib/wipe";
import {
  clearTrip,
  getSyncState,
  syncNow,
  tripExists,
  withdrawFrom,
  type SyncState,
} from "@/lib/sync";
import {
  isTripCode,
  joinLink,
  loadRoster,
  newTripCode,
  normaliseCode,
} from "@/lib/trip";
import type {
  Corner,
  Entry,
  PhotoQuality,
  Rater,
  StampSize,
} from "@/lib/types";

/** The whole log as a file. Used by the button, and before anything destructive. */
async function downloadLog(): Promise<void> {
  const json = await exportEntries();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pizzometro-log-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const QUALITIES: Array<{ value: PhotoQuality; label: string; hint: string }> = [
  { value: "balanced", label: "BALANCED", hint: "1600px photo · 1080px picture" },
  { value: "full", label: "FULL", hint: "Photo as shot · 2048px picture" },
];

const SIZES: Array<{ value: StampSize; label: string }> = [
  { value: "s", label: "SMALL" },
  { value: "m", label: "MEDIUM" },
  { value: "l", label: "LARGE" },
];

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
      await downloadLog();
      snack("Log exported (ratings only, no photos)");
    } catch {
      snack("Could not export the log", "warn");
    } finally {
      setExporting(false);
    }
  }, [snack]);

  return (
    <main className="flex-1 pb-6">
      <Wordmark subtitle="Setup" />

      <TripSection />

      <section className="mt-8 px-5">
        <h2 className="label">Picture</h2>
        <div className="mt-2">
          <Toggle
            label="Square pictures"
            hint="Off keeps the photo's own shape instead of cropping it square"
            checked={settings.squareCrop}
            onChange={(squareCrop) => update({ squareCrop })}
          />
        </div>

        <div className="mt-2">
          <Toggle
            label="Show the map"
            hint="Off hides the Map tab, and stops it asking for street data"
            checked={settings.showMap}
            onChange={(showMap) => update({ showMap })}
          />
        </div>

        <h2 className="label mt-6">Photo quality</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          What is kept of each photo, and how big the saved picture comes out.
          Full keeps the camera&rsquo;s own frame end to end; balanced is
          sized for posting and about a twentieth of the bytes over roaming
          data.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-px border border-ink bg-ink">
          {QUALITIES.map((quality) => {
            const active = settings.photoQuality === quality.value;
            return (
              <button
                key={quality.value}
                type="button"
                aria-pressed={active}
                onClick={() => update({ photoQuality: quality.value })}
                className={`px-2 py-3 transition-colors ${
                  active ? "bg-ink text-paper" : "bg-paper text-ink"
                }`}
              >
                <span className="block text-[0.625rem] tracking-[0.16em]">
                  {quality.label}
                </span>
                <span
                  className={`mt-0.5 block text-[0.625rem] ${
                    active ? "text-paper/60" : "text-muted"
                  }`}
                >
                  {quality.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

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
        <h2 className="label">Text size</h2>
        <p className="mt-1 text-xs text-muted">
          How big the stats sit on the saved picture.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-px border border-ink bg-ink">
          {SIZES.map((size) => {
            const active = settings.stampSize === size.value;
            return (
              <button
                key={size.value}
                type="button"
                aria-pressed={active}
                onClick={() => update({ stampSize: size.value })}
                className={`py-3 text-[0.625rem] tracking-[0.16em] transition-colors ${
                  active ? "bg-ink text-paper" : "bg-paper text-ink"
                }`}
              >
                {size.label}
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
          <Toggle
            label="Mirror the picture"
            hint="Flips the photo left to right after it is taken. The viewfinder still shows what the lens sees."
            checked={settings.mirrorCamera}
            onChange={(mirrorCamera) => update({ mirrorCamera })}
          />
          <Toggle
            label="Use the camera app"
            hint="Skips the built-in viewfinder. iOS forgets camera permission every time an installed web app is opened, so this is the way to stop it asking."
            checked={settings.systemCamera}
            onChange={(systemCamera) => update({ systemCamera })}
          />
        </div>
      </section>

      <section className="mt-8 px-5">
        <h2 className="label">The scale</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          The word under a rating, and what it is supposed to mean.
        </p>
        <dl className="mt-2">
          {scaleBands().map((band) => (
            <div
              key={band.word}
              className="flex items-baseline justify-between gap-3 border-b border-dashed border-rule py-2"
            >
              <dt className="shrink-0">
                <span className="block text-[0.6875rem] tracking-[0.16em]">
                  {band.word}
                </span>
                <span className="block text-[0.625rem] tabular-nums text-muted">
                  {band.range}
                </span>
              </dt>
              <dd className="text-right text-xs text-muted">{band.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 px-5">
        <h2 className="label">Data</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {trip
            ? "Ratings and photos live on this phone and in the shared trip. Moving to a new phone means joining the trip again — everything comes back."
            : "Ratings and photos live on this device only. Nothing is uploaded, so these are the only copies."}
        </p>

        <PictureBackup />

        <button
          type="button"
          onClick={exportJson}
          disabled={exporting}
          className="mt-2 w-full border border-ink py-3.5 text-[0.6875rem] tracking-[0.22em] disabled:opacity-40"
        >
          {exporting ? "EXPORTING…" : "EXPORT LOG (JSON)"}
        </button>

        <EraseButton />
      </section>

      <ViewportReadout />

      <TripFooter />
    </main>
  );
}

/**
 * Who is on the trip now. The roster is the answer once there is one —
 * folding in everyone who has ever rated would keep a person on the list
 * forever, since leaving takes their name off the trip but leaves their
 * ratings in it. Before the first sync lands there is no roster, and the
 * ratings are the best guess available.
 */
export function onTrip(
  members: Rater[],
  entries: Entry[],
  me: string,
): string[] {
  const names =
    members.length > 0
      ? members.map((member) => member.name)
      : ratersOf(entries).map((rater) => rater.name);
  return [...new Set([...names, me])];
}

/**
 * What the browser thinks the screen is.
 *
 * The bottom bar has sat above the bottom of the screen on launch twice now,
 * and twice a reasoned guess at the cause has been wrong. These are the
 * numbers any fix has to be built on, read from the device itself.
 */
function ViewportReadout() {
  const [lines, setLines] = useState<string[]>([]);
  const probe = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => {
      const viewport = window.visualViewport;
      const safe = probe.current
        ? getComputedStyle(probe.current).paddingBottom
        : "?";
      const inset = viewport
        ? Math.max(
            0,
            Math.round(
              viewport.offsetTop + viewport.height - window.innerHeight,
            ),
          )
        : 0;
      setLines([
        `inner ${window.innerHeight} · outer ${window.outerHeight}`,
        viewport
          ? `visual ${Math.round(viewport.height)} @ ${Math.round(viewport.offsetTop)} · scale ${viewport.scale.toFixed(2)}`
          : "visual — none",
        `screen ${window.screen.height} · dpr ${window.devicePixelRatio}`,
        `safe bottom ${safe} · computed inset ${inset}`,
        `standalone ${window.matchMedia("(display-mode: standalone)").matches}`,
      ]);
    };
    const settle = requestAnimationFrame(read);
    const later = setTimeout(read, 800);
    window.visualViewport?.addEventListener("resize", read);
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      cancelAnimationFrame(settle);
      clearTimeout(later);
      window.visualViewport?.removeEventListener("resize", read);
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);

  return (
    <section className="mt-8 px-5">
      <h2 className="label">Viewport</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        What this phone reports about its own screen. Here to settle where the
        bottom bar belongs; it can go once that is known.
      </p>
      <div
        ref={probe}
        aria-hidden
        className="h-0 pb-[env(safe-area-inset-bottom)]"
      />
      <dl className="mt-2 font-[family-name:var(--font-mono)] text-[0.6875rem] leading-relaxed text-muted">
        {lines.map((line) => (
          <dd key={line}>{line}</dd>
        ))}
      </dl>
    </section>
  );
}

/** A trip code set the way the app sets one, inside a sentence. */
function Code({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-[family-name:var(--font-type)] font-bold tracking-[0.14em] text-ink">
      {children}
    </span>
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
  const { entries } = useEntries();
  const sync = useSync();
  const snack = useSnackbar();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const start = useCallback(
    async (tripCode: string, mustExist: boolean) => {
      if (busy) return;
      setBusy(true);
      try {
        if (mustExist) {
          // A code is the only thing a trip has, so a typo of the right
          // shape would otherwise quietly start a second, empty one.
          let exists: boolean;
          try {
            exists = await tripExists(tripCode);
          } catch {
            snack("Could not check that code — try again with signal", "warn");
            return;
          }
          if (!exists) {
            snack("No trip with that code — check it and try again", "warn");
            return;
          }
        }
        await join(tripCode, name);
        snack(
          mustExist
            ? "Joined the trip"
            : "Trip started — send the code to the others",
        );
      } catch {
        snack(mustExist ? "Could not join" : "Could not start the trip", "warn");
      } finally {
        setBusy(false);
      }
    },
    [busy, join, name, snack],
  );

  /** Copies, or falls back to the share sheet where the clipboard is blocked. */
  const copy = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        snack(`${what} copied`);
      } catch {
        try {
          await navigator.share({ text, title: "Pizzometro" });
        } catch {
          snack(text);
        }
      }
    },
    [snack],
  );

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
          onClick={() => start(newTripCode(), false)}
          className="mt-3 w-full bg-ink py-3.5 text-[0.6875rem] tracking-[0.22em] text-paper disabled:opacity-40"
        >
          {busy ? "WORKING…" : "START A TRIP"}
        </button>

        <div className="mt-4 flex items-stretch gap-2">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="TRIP CODE"
            maxLength={16}
            className="plate h-12 min-w-0 flex-1 px-4 text-base tracking-[0.14em] outline-none placeholder:text-muted"
          />
          <button
            type="button"
            disabled={busy || !isTripCode(typed) || name.trim().length === 0}
            onClick={() => start(typed, true)}
            className="h-12 shrink-0 border border-ink px-5 text-[0.6875rem] tracking-[0.22em] disabled:opacity-40"
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

      <p className="mt-2 text-xs leading-relaxed text-muted">
        On this trip:{" "}
        {onTrip(
          sync.members.length > 0 ? sync.members : loadRoster(trip.code),
          entries ?? [],
          trip.rater.name,
        ).join(", ")}
        . Anyone with the code can join.
      </p>

      {/* Both ways of passing a trip on: the link when you can send one, the
          code when you are reading it out across a table. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copy(trip.code, "Trip code")}
          className="flex items-center justify-center gap-2 border border-ink py-3.5 text-[0.6875rem] tracking-[0.18em]"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5">
            <rect
              x="5.5"
              y="2.5"
              width="8"
              height="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M10.5 13.5h-8v-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
          CODE
        </button>
        <button
          type="button"
          onClick={() =>
            void copy(joinLink(trip.code, window.location.origin), "Invite link")
          }
          className="flex items-center justify-center gap-2 border border-ink py-3.5 text-[0.6875rem] tracking-[0.18em]"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5">
            <path
              d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          LINK
        </button>
      </div>

      <button
        type="button"
        onClick={async () => {
          await syncNow(true);
          const message = manualSyncMessage(getSyncState());
          snack(message.text, message.tone);
        }}
        disabled={sync.status === "syncing"}
        className="mt-2 w-full border border-ink py-3.5 text-[0.6875rem] tracking-[0.22em] disabled:opacity-40"
      >
        {sync.status === "syncing" ? "SYNCING…" : "SYNC NOW"}
      </button>

      <button
        type="button"
        onClick={async () => {
          const theirs = othersRatings(entries ?? [], trip.rater).length;
          const mine = (entries ?? []).length - theirs;
          const alone = sync.members.length <= 1;

          const sure = await confirm({
            title: alone ? "Leave and delete the trip?" : "Leave the trip?",
            body: alone ? (
              <>
                Nobody else is on <Code>{trip.code}</Code>, so it goes with
                you. Your {mine} {mine === 1 ? "rating" : "ratings"} stay on
                this phone, and nothing is left behind in the trip.
              </>
            ) : (
              <>
                Your ratings come off the trip and off everyone else&rsquo;s
                phones — they stay on this one.
                {theirs > 0 && (
                  <>
                    {" "}
                    The {theirs} from other people come off this phone.
                  </>
                )}{" "}
                Joining again with <Code>{trip.code}</Code> puts yours back.
              </>
            ),
            action: alone ? "LEAVE & DELETE" : "LEAVE",
            destructive: true,
          });
          if (!sure) return;

          try {
            // The one case where something could be here and nowhere else:
            // a trip holding ratings whose owner never left it.
            if (alone && theirs > 0) await downloadLog().catch(() => {});
            await leave(alone);
            snack(alone ? "Trip deleted" : "Left the trip");
          } catch {
            snack("Could not leave — try again with signal", "warn");
          }
        }}
        className="mt-2 w-full border border-accent/40 py-3.5 text-[0.6875rem] tracking-[0.22em] text-accent/80"
      >
        LEAVE TRIP
      </button>
    </section>
  );
}

/**
 * The whole trip to the camera roll. Safari only opens the share sheet from
 * a tap and rendering forty cards outlasts one, so the work happens first
 * and a second tap does nothing but open the sheet.
 */
function PictureBackup() {
  const { settings } = useSettings();
  const { entries } = useEntries();
  const snack = useSnackbar();
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [ready, setReady] = useState<File[] | null>(null);

  const count = photographed(entries ?? []).length;

  const build = useCallback(async () => {
    setProgress({ done: 0, total: count });
    try {
      const files = await buildCards(entries ?? [], settings, setProgress);
      if (files.length === 0) {
        snack("No pictures to save yet", "warn");
        return;
      }
      setReady(files);
    } catch {
      snack("Could not build the pictures", "warn");
    } finally {
      setProgress(null);
    }
  }, [count, entries, settings, snack]);

  const save = useCallback(async () => {
    if (!ready) return;
    const result = await saveAll(ready);
    snack(bulkMessage(result, ready.length), result === "failed" ? "warn" : "ok");
    if (result === "shared" || result === "downloaded") setReady(null);
  }, [ready, snack]);

  if (ready) {
    return (
      <>
        <button
          type="button"
          onClick={save}
          className="mt-3 w-full bg-ink py-3.5 text-[0.6875rem] tracking-[0.22em] text-paper"
        >
          SAVE {ready.length} PICTURES
        </button>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Ready. The share sheet opens on the next tap — “Save {ready.length}{" "}
          Images” puts them all in your photos.
        </p>
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={build}
      disabled={progress !== null || count === 0}
      className="mt-3 w-full border border-ink py-3.5 text-[0.6875rem] tracking-[0.22em] disabled:opacity-40"
    >
      {progress
        ? `BUILDING ${progress.done}/${progress.total}…`
        : `SAVE ALL PICTURES (${count})`}
    </button>
  );
}

/** Taking the app off a phone, without touching what the trip holds. */
function EraseButton() {
  const { trip } = useTrip();
  const sync = useSync();
  const confirm = useConfirm();
  const snack = useSnackbar();

  const erase = useCallback(async () => {
    const sure = await confirm({
      title: "Erase everything on this phone?",
      body: trip
        ? "Every rating and photo goes from this phone, and your ratings come off the trip and off everyone else's phones too. There is no copy anywhere else. Export the log first if you want one."
        : "Every rating and photo goes, and there is no copy anywhere else. Export the log first if you want one.",
      action: "ERASE",
      destructive: true,
      confirmText: "erase",
    });
    if (!sure) return;
    try {
      // Erasing is leaving, then wiping: nothing of this phone's is left in
      // the trip, because there is nothing left here to withdraw it later.
      if (trip) {
        if (sync.members.length <= 1) await clearTrip(trip);
        else await withdrawFrom(trip);
      }
      await eraseDevice();
      snack("Everything on this phone erased");
      // A real reload, not a client-side one: the settings, the trip and the
      // sync engine are all memoised in module scope and must not outlive
      // the wipe. Held back a moment so the message is seen first.
      setTimeout(() => window.location.reload(), 1_200);
    } catch {
      snack("Could not erase this phone", "warn");
    }
  }, [confirm, snack, trip, sync.members.length]);

  return (
    <button
      type="button"
      onClick={erase}
      className="mt-2 w-full border border-accent py-3.5 text-[0.6875rem] tracking-[0.22em] text-accent"
    >
      ERASE THIS PHONE
    </button>
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
