"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "LOG" },
  { href: "/leaderboard", label: "RANKS" },
  { href: "/settings", label: "SETUP" },
] as const;

/** Hidden during the capture flow, which owns the whole screen. */
export function Nav() {
  const pathname = usePathname();
  if (pathname.startsWith("/new")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto grid max-w-lg grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className="relative py-3.5 text-center text-[0.6875rem] tracking-[0.22em] transition-colors"
            >
              <span className={active ? "text-ink" : "text-muted"}>
                {tab.label}
              </span>
              {active && (
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
