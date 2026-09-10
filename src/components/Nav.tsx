"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "LOG" },
  { href: "/leaderboard", label: "RANKS" },
  { href: "/settings", label: "SETUP" },
] as const;

/** Which tab owns a screen. A single rating is still part of the log. */
export function activeTab(pathname: string): string | null {
  if (pathname === "/" || pathname.startsWith("/entry")) return "/";
  if (pathname.startsWith("/leaderboard")) return "/leaderboard";
  if (pathname.startsWith("/settings")) return "/settings";
  return null;
}

/**
 * How much of the layout viewport is hidden below what you can actually see
 * — the keyboard, in practice. iOS keeps a fixed element pinned to the
 * layout viewport while the visible one shrinks, which is what strands the
 * bar halfway up the screen; pushing it down by this much puts it back
 * behind the keyboard where it belongs.
 */
export function keyboardInset(
  innerHeight: number,
  viewport: { height: number; offsetTop: number } | null | undefined,
): number {
  if (!viewport) return 0;
  return Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop));
}

/** Hidden during the capture flow, which owns the whole screen. */
export function Nav() {
  const pathname = usePathname();
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () =>
      setInset(keyboardInset(window.innerHeight, viewport));
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  if (pathname.startsWith("/new")) return null;

  const active = activeTab(pathname);

  return (
    <nav
      style={inset > 0 ? { transform: `translateY(${inset}px)` } : undefined}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur-sm"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const current = active === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className="relative py-3.5 text-center text-[0.6875rem] tracking-[0.22em] transition-colors"
            >
              <span className={current ? "text-ink" : "text-muted"}>
                {tab.label}
              </span>
              {current && (
                <span
                  aria-hidden
                  className="absolute inset-x-[38%] bottom-2 h-[2px] bg-accent"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
