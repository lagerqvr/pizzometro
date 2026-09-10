"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSnackbar } from "@/components/Snackbar";
import { useSync, useTrip } from "@/lib/hooks";
import { startSync } from "@/lib/sync";
import type { SyncState } from "@/lib/sync";

/**
 * Starts the sync engine and says out loud when the network comes and goes —
 * standing in a stone-walled pizzeria, knowing whether a rating has left the
 * phone yet is the difference between trusting the app and not.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const snack = useSnackbar();
  const sync = useSync();
  const previous = useRef<SyncState["status"]>("off");
  const warned = useRef(false);

  useEffect(() => startSync(), []);

  useEffect(() => {
    const before = previous.current;
    previous.current = sync.status;
    const message = syncMessage(before, sync);
    if (!message) return;
    // The one message that would otherwise repeat on every poll: nothing
    // changes it until the app is redeployed with a store behind it.
    if (message.once) {
      if (warned.current) return;
      warned.current = true;
    }
    snack(message.text, message.tone);
  }, [sync, snack]);

  return <>{children}</>;
}

type Message = { text: string; tone: "ok" | "warn"; once?: boolean };

/**
 * What to say after somebody taps SYNC NOW. Asking on purpose always gets an
 * answer, including "nothing happened" — the quiet rules below are for the
 * syncs nobody asked for.
 */
export function manualSyncMessage(sync: SyncState): Message {
  switch (sync.status) {
    case "idle": {
      const pulled = sync.moved?.pulled ?? 0;
      const pushed = sync.moved?.pushed ?? 0;
      if (pulled > 0 && pushed > 0) {
        return {
          text: `Synced — ${pushed} sent, ${pulled} received`,
          tone: "ok",
        };
      }
      if (pulled > 0) {
        return {
          text: `Synced — ${pulled} new ${pulled === 1 ? "rating" : "ratings"}`,
          tone: "ok",
        };
      }
      if (pushed > 0) {
        return {
          text: `Synced — ${pushed} ${pushed === 1 ? "rating" : "ratings"} sent`,
          tone: "ok",
        };
      }
      return { text: "Synced — nothing new", tone: "ok" };
    }
    case "offline":
      return { text: "No signal — nothing was sent", tone: "warn" };
    case "unavailable":
      return { text: "Sharing is not set up for this trip yet", tone: "warn" };
    case "syncing":
      return { text: "Still syncing…", tone: "ok" };
    case "error":
    case "off":
      return { text: "Could not reach the trip", tone: "warn" };
  }
}

/**
 * What, if anything, to say out loud when the connection state changes.
 *
 * Only a change of state can speak — holding one state, however long, is
 * silent, so a morning with no signal is one message rather than one a
 * minute. On top of that, a state nobody needs to act on stays quiet: the
 * badge in the header is always there for anyone who wants to look.
 */
export function syncMessage(
  before: SyncState["status"],
  sync: SyncState,
): Message | null {
  if (before === sync.status || sync.status === "off") return null;

  switch (sync.status) {
    case "offline":
      // Losing signal with nothing waiting costs nothing and needs no words.
      if (sync.pending === 0) return null;
      return {
        text: `Offline — ${sync.pending} ${
          sync.pending === 1 ? "rating stays" : "ratings stay"
        } on this phone until there is signal`,
        tone: "warn",
      };

    case "unavailable":
      return {
        text: "Sharing is not set up yet — ratings stay on this phone",
        tone: "warn",
        once: true,
      };

    case "idle": {
      if (before !== "offline" && before !== "error" && before !== "unavailable") {
        return null;
      }
      const pulled = sync.moved?.pulled ?? 0;
      const pushed = sync.moved?.pushed ?? 0;
      // Reconnecting and finding nothing to carry is not news.
      if (pulled === 0 && pushed === 0) return null;
      if (pulled > 0) {
        return {
          text: `Back online — ${pulled} new ${pulled === 1 ? "rating" : "ratings"}`,
          tone: "ok",
        };
      }
      return {
        text: `Back online — ${pushed} ${
          pushed === 1 ? "rating" : "ratings"
        } synced`,
        tone: "ok",
      };
    }

    // Mid-sync, and a failure that will simply be retried: the badge shows
    // both, neither is worth interrupting for.
    case "syncing":
    case "error":
      return null;
  }
}

/**
 * Colour lives in the dot, never the words: basil when everything is up,
 * orange when the connection is not, ink while something waits its turn.
 */
function dotClass(sync: SyncState): string {
  if (sync.status === "syncing") return "animate-pulse bg-accent-warm";
  if (sync.status === "offline" || sync.status === "error") return "bg-accent";
  if (sync.status === "idle" && sync.pending === 0) return "bg-basil";
  return "bg-ink";
}

function describe(sync: SyncState): { text: string; warn: boolean } | null {
  switch (sync.status) {
    case "off":
      return null;
    case "offline":
      return {
        text: sync.pending > 0 ? `OFFLINE · ${sync.pending} WAITING` : "OFFLINE",
        warn: true,
      };
    case "syncing":
      return { text: "SYNCING…", warn: false };
    case "unavailable":
      return { text: "LOCAL ONLY", warn: false };
    case "error":
      return { text: "SYNC FAILED", warn: true };
    case "idle":
      if (sync.pending > 0) return { text: `${sync.pending} WAITING`, warn: false };
      return { text: "SYNCED", warn: false };
  }
}

/** The one-line network readout in the header. Absent when flying solo. */
export function SyncBadge() {
  const { trip } = useTrip();
  const sync = useSync();
  const status = trip ? describe(sync) : null;
  if (!status) return null;

  const settled = sync.status === "idle" && sync.pending === 0;

  return (
    <Link
      href="/settings"
      className={`flex shrink-0 items-center gap-1.5 text-[0.625rem] tracking-[0.16em] ${
        settled ? "text-ink" : "text-muted"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 ${dotClass(sync)}`} />
      {status.text}
    </Link>
  );
}
