import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Courier_Prime } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
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
  themeColor: "#212121",
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
        <SnackbarProvider>
          <ConfirmProvider>
            <SyncProvider>
              <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
                {children}
              </div>
              <Nav />
            </SyncProvider>
          </ConfirmProvider>
        </SnackbarProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
