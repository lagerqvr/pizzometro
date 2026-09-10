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
    if (before === sync.status || sync.status === "off") return;

    if (sync.status === "offline") {
      snack("Offline — ratings are safe on this phone", "warn");
      return;
    }
    if (sync.status === "unavailable") {
      // Said once. It will not change until the app is deployed with a store.
      if (!warned.current) {
        warned.current = true;
        snack("Sharing is not set up yet — ratings stay on this phone", "warn");
      }
      return;
    }
    if (
      sync.status === "idle" &&
      (before === "offline" || before === "error" || before === "unavailable")
    ) {
      const pulled = sync.moved?.pulled ?? 0;
      snack(
        pulled > 0
          ? `Back online — ${pulled} new ${pulled === 1 ? "rating" : "ratings"}`
          : "Back online — everything is synced",
      );
    }
  }, [sync.status, sync.reason, sync.moved, snack]);

  return <>{children}</>;
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

  return (
    <Link
      href="/settings"
      className="flex shrink-0 items-center gap-1.5 text-[0.625rem] tracking-[0.16em] text-muted"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 ${
          sync.status === "syncing"
            ? "animate-pulse bg-accent-warm"
            : status.warn
              ? "bg-accent"
              : "bg-ink"
        }`}
      />
      {status.text}
    </Link>
  );
}
