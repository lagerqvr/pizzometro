import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Courier_Prime } from "next/font/google";
import "./globals.css";
import { AppHeight } from "@/components/AppHeight";
import { Nav } from "@/components/Nav";
import { NewRatingButton } from "@/components/NewRatingButton";
import { ConfirmProvider } from "@/components/Confirm";
import { SnackbarProvider } from "@/components/Snackbar";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SyncProvider } from "@/components/SyncBadge";

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

const courier = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-courier",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pizzometro",
  description: "A pizza-rating instrument. Made for a pizza trip to Napoli.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Pizzometro",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Pizzometro",
    description: "A pizza-rating instrument.",
    type: "website",
  },
};

export const viewport: Viewport = {
  // Paper, like the app and the icon tile: on a light theme colour iOS
  // and Android both draw the status bar contents dark.
  themeColor: "#F3F0E7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The rating slider and camera view are worse with pinch-zoom in the way.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plex.variable} ${courier.variable}`}>
      <body className="antialiased">
        {/*
          * iOS 26 blurs page content as it scrolls under the status bar (its
          * "scroll edge effect"). The app draws edge to edge, so an opaque
          * band of paper across that strip means there is nothing to blur but
          * flat colour. It sits below the camera and the nav.
          */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)] bg-paper"
        />
        {/*
          * One screen-high column that never scrolls, with the scrolling
          * inside it. The bar is simply its last row: nothing is pinned to
          * the viewport, so nothing can be left behind when the viewport
          * changes under it.
          */}
        <AppHeight />
        <div
          style={{ height: "var(--app-h, 100dvh)" }}
          className="relative flex flex-col overflow-hidden"
        >
          <SnackbarProvider>
            <ConfirmProvider>
              <SyncProvider>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <div className="mx-auto w-full max-w-lg">{children}</div>
                </div>
                <Nav />
                <NewRatingButton />
              </SyncProvider>
            </ConfirmProvider>
          </SnackbarProvider>
        </div>
        <ServiceWorker />
      </body>
    </html>
  );
}
