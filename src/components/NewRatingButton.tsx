"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The whole point of the app: one tap from open to shooting.
 *
 * It lives in the app shell rather than on the log, so it can be positioned
 * against something that never scrolls and never moves.
 */
export function NewRatingButton() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  return (
    <Link
      href="/new"
      aria-label="Rate a new pizza"
      className="absolute bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-1/2 z-40 flex h-14 w-14 -translate-x-1/2 items-center justify-center bg-ink text-2xl text-paper shadow-[0_4px_0_rgba(33,33,33,0.25)] transition-transform active:translate-y-[2px] active:scale-95 active:shadow-[0_2px_0_rgba(33,33,33,0.25)]"
    >
      +
    </Link>
  );
}
