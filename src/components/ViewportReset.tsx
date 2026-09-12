"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** A field still has the keyboard up, so leave the screen where iOS put it. */
export function stillTyping(active: Element | null): boolean {
  if (!(active instanceof HTMLElement)) return false;
  // isContentEditable is not implemented everywhere, so it is compared
  // rather than trusted to be a boolean.
  return (
    active.tagName === "INPUT" ||
    active.tagName === "TEXTAREA" ||
    active.isContentEditable === true
  );
}

/** Long enough for the keyboard to finish sliding away. */
const SETTLE_MS = 300;

/**
 * iOS lifts the whole app to clear the on-screen keyboard, and does not
 * always put it back when the field loses focus — which leaves the tab bar
 * sitting high with blank screen beneath it. Rating a dish is where it shows,
 * because that is the one flow that types into several fields and then
 * navigates while the keyboard is closing.
 *
 * This measures nothing and sizes nothing — the lesson of every earlier
 * attempt at this bar. The document cannot scroll at all, so putting the
 * window back to nought is a no-op on every platform except exactly the case
 * it is here for.
 */
export function ViewportReset() {
  const pathname = usePathname();

  useEffect(() => {
    const reset = () => {
      window.setTimeout(() => {
        if (!stillTyping(document.activeElement)) window.scrollTo(0, 0);
      }, SETTLE_MS);
    };
    window.addEventListener("focusout", reset);
    return () => window.removeEventListener("focusout", reset);
  }, []);

  // Arriving on a new screen — saving a rating lands on the rating itself.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
