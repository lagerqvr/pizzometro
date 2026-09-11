"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBottomInset } from "@/lib/hooks";

const TABS = [
  { href: "/", label: "LOG" },
  { href: "/leaderboard", label: "RANKS" },
  { href: "/map", label: "MAP" },
  { href: "/settings", label: "SETUP" },
] as const;

/** Which tab owns a screen. A single rating is still part of the log. */
export function activeTab(pathname: string): string | null {
  if (pathname === "/" || pathname.startsWith("/entry")) return "/";
  if (pathname.startsWith("/leaderboard")) return "/leaderboard";
  if (pathname.startsWith("/map")) return "/map";
  if (pathname.startsWith("/settings")) return "/settings";
  return null;
}

/** Hidden during the capture flow, which owns the whole screen. */
export function Nav() {
  const pathname = usePathname();
  const inset = useBottomInset();

  if (pathname.startsWith("/new")) return null;

  const active = activeTab(pathname);

  return (
    <nav
      style={inset > 0 ? { transform: `translateY(${inset}px)` } : undefined}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur-sm"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 pb-[env(safe-area-inset-bottom)]">
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
