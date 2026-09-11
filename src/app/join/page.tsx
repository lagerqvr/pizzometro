"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { useSnackbar } from "@/components/Snackbar";
import { useTrip } from "@/lib/hooks";
import { isTripCode, normaliseCode } from "@/lib/trip";
import { tripExists } from "@/lib/sync";

/**
 * The other end of a shared link. Nothing happens until a name is given:
 * the whole point of the trip is knowing whose 9.5 it was.
 */
function JoinForm() {
  const router = useRouter();
  const snack = useSnackbar();
  const { join } = useTrip();
  const code = normaliseCode(useSearchParams().get("trip") ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = isTripCode(code);

  const confirm = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      // Joining something that is not there would create it, empty.
      if (!(await tripExists(code))) {
        setBusy(false);
        snack("No trip with that code — ask for the link again", "warn");
        return;
      }
      await join(code, name);
      snack("Joined the trip");
      router.replace("/");
    } catch {
      setBusy(false);
      snack("Could not reach that trip — try again with signal", "warn");
    }
  };

  return (
    <main className="flex-1 pb-6">
      <Wordmark subtitle="Join a trip" />

      <div className="mt-6 px-5">
        {!valid ? (
          <p className="text-sm text-muted">
            That link is missing its trip code. Ask for it again, or type it in
            Setup.
          </p>
        ) : (
          <>
            <p className="label">Trip code</p>
            <p className="mt-1 font-[family-name:var(--font-type)] text-2xl font-bold tracking-[0.24em]">
              {code}
            </p>

            <label className="plate mt-6 block px-4 py-3">
              <span className="label">Your name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Rasmus"
                maxLength={24}
                className="mt-1 w-full bg-transparent text-base outline-none placeholder:text-muted"
              />
            </label>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              Ratings already on this phone join the trip with you.
            </p>

            <button
              type="button"
              onClick={confirm}
              disabled={busy || name.trim().length === 0}
              className="mt-5 w-full bg-ink py-4 text-[0.75rem] tracking-[0.22em] text-paper disabled:opacity-40"
            >
              {busy ? "JOINING…" : "JOIN THE TRIP"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<p className="label py-20 text-center">LOADING…</p>}>
      <JoinForm />
    </Suspense>
  );
}
