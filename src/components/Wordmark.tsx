import Link from "next/link";
import { SyncBadge } from "@/components/SyncBadge";
import { TRIP } from "@/lib/types";

export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <header className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="flex items-center gap-2.5">
        <Link
          href="/"
          aria-label="Pizzometro — back to the log"
          className="flex min-w-0 items-center gap-2.5 transition-transform active:scale-[0.98]"
        >
          {/* The mark, from public/pizzometro.svg. */}
          <svg
            aria-hidden
            viewBox="0 0 878 869"
            className="h-5 w-5 shrink-0"
          >
            <path d="M464.986 0.00961808L625.373 0.0647233L675.411 0.0414591C698.109 0.0334992 718.334 -0.73065 740.726 4.66375C771.892 12.3261 800.389 28.3116 823.179 50.913C857.106 83.8831 876.492 129.019 877.043 176.326L877.025 539.131L877.037 643.302C877.037 668.725 878.445 699.916 873.253 724.182C865.477 759.108 847.971 791.113 822.756 816.499C799.862 839.999 770.79 856.544 738.895 864.228C715.578 869.831 693.737 868.79 670.06 868.796L611.621 868.79L413.014 868.784H255.129L202.565 868.808C179.534 868.814 160.028 869.604 137.237 863.94C106.164 856.182 77.8041 840.073 55.226 817.362C31.1122 793.274 13.8905 763.167 5.3507 730.17C-1.03197 704.68 0.0787596 687.609 0.083658 662.002L0.104474 610.465L0.0910017 460.07L309.973 460.076L409.149 460.083C425.095 460.083 441.511 460.211 457.48 459.88C459.384 459.844 461.484 458.944 462.849 457.743C464.374 456.39 464.937 449.055 464.95 446.826C465.023 430.447 464.999 414.004 464.993 397.63L464.962 300.149L464.986 0.00961808Z" fill="var(--color-accent)" />
            <path d="M166.043 0.689542C173.85 -0.0740015 186.783 0.230316 194.764 0.235826L242.87 0.257259L400.195 0.256045L400.22 266.844L400.243 351.045C400.248 365.476 400.409 379.975 400.037 394.401C399.872 400.867 394.879 401.869 389.394 401.958C372.248 402.237 355.05 402.095 337.891 402.094L234.514 402.085L0.100863 402.083L0.084345 254.47L0.0665746 203.904C0.0635131 179.441 -0.924122 162.477 4.81379 138.066C11.4677 110.647 24.5202 85.1931 42.9028 63.7882C74.9172 26.0665 117.027 4.87158 166.043 0.689542Z" fill="var(--color-accent-warm)" />
          </svg>
          <h1 className="font-[family-name:var(--font-type)] text-xl font-bold tracking-[0.14em]">
            PIZZOMETRO
          </h1>
        </Link>
        <span className="ml-auto">
          <SyncBadge />
        </span>
      </div>
      {subtitle && <p className="label mt-1.5">{subtitle}</p>}
    </header>
  );
}

export function TripFooter() {
  return (
    <p className="px-5 pb-6 pt-8 text-center text-[0.625rem] leading-relaxed tracking-[0.16em] text-muted">
      {TRIP.label}
      <br />
      {TRIP.dates}
    </p>
  );
}
