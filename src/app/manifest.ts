import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pizzometro",
    short_name: "Pizzometro",
    description: "A pizza-rating instrument. Made for a pizza trip to Napoli.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F3F0E7",
    theme_color: "#F3F0E7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "New rating", short_name: "Rate", url: "/new" },
      { name: "Leaderboard", short_name: "Ranks", url: "/leaderboard" },
    ],
  };
}
