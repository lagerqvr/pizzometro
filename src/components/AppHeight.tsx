"use client";

import { useEffect } from "react";

/**
 * Sets the shell's height from what the phone actually reports, rather than
 * trusting `dvh`.
 *
 * `100dvh` is resolved by the browser at a moment of its choosing, and on an
 * installed web app that moment is before the screen has settled — which is
 * how the bar ends up in the wrong place until something else forces a
 * layout. A number we set ourselves is recalculated whenever we say, and
 * changing a height always reflows.
 */
export function AppHeight() {
  useEffect(() => {
    const set = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${height}px`);
    };
    set();
    // The screen settles a beat after launch; these are cheap.
    const soon = setTimeout(set, 120);
    const later = setTimeout(set, 600);
    window.addEventListener("resize", set);
    window.addEventListener("orientationchange", set);
    window.visualViewport?.addEventListener("resize", set);
    return () => {
      clearTimeout(soon);
      clearTimeout(later);
      window.removeEventListener("resize", set);
      window.removeEventListener("orientationchange", set);
      window.visualViewport?.removeEventListener("resize", set);
    };
  }, []);

  return null;
}
