"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSettings } from "@/lib/hooks";

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
  const { settings } = useSettings();
  const tabs = TABS.filter((tab) => tab.href !== "/map" || settings.showMap);

  if (pathname.startsWith("/new")) return null;

  const active = activeTab(pathname);

  return (
    <nav className="shrink-0 border-t border-rule bg-paper">
      <div
        className={`mx-auto grid max-w-lg pb-[env(safe-area-inset-bottom)] ${
          tabs.length === 4 ? "grid-cols-4" : "grid-cols-3"
        }`}
      >
        {tabs.map((tab) => {
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
