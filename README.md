<img src="./public/pizzometro.svg" width="50" alt="Pizzometro logo">

# Pizzometro

<i>Misuratore di pizza</i>

A pizza-rating instrument. Built for a pizza trip to Napoli, 11–15.9.2026.

Photograph the pizza, rate it 0–10, and the app stamps the score, name and
place into the corner of a square picture ready for social media.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 160 unit, component and route tests
npm run typecheck
npm run build
```

## How it works

**Local-first.** Ratings and photos live in IndexedDB on the device. There is
no account, and the app works with no signal — the realistic case standing in
a pizzeria on roaming data. `Setup → Export log` writes the ratings out as
JSON.

**A trip** is two phones sharing one log. One of them starts a trip, which is
nothing but a ten-character code; the other opens the invite link and gives a
name. Every rating then carries who made it, the log shows both, and the
leaderboard ranks everything together *and* splits by person. Used alone, with
no trip, none of this appears and nothing leaves the phone.

**Syncing** runs on app open, on regaining signal, on returning to the screen
and once a minute — never on the critical path of saving a rating. Local
changes queue until they can go up, and the header says whether the phone is
offline and how many ratings are waiting. Entries are written to Vercel Blob
under a path that carries their version, so nothing is ever overwritten, two
phones cannot clobber each other, and a merge is decided by last-write-wins
with deletes winning ties. A delete leaves a tombstone: without one, the entry
comes straight back on the next pull.

**Photos** are downscaled to 1600px and stored as raw bytes plus a MIME type
rather than as `Blob` objects, which several Safari versions fail to hand
back intact.

**The share picture** is drawn on a canvas at 1080², centre-cropped from the
photo. The stamp is plain white monospace at one size — score, place, pizza —
hard against a corner, with only a soft shadow so it survives a bright crust.
The corner and which lines appear are configurable in Setup.

**Saving to the camera roll**: iOS gives the web no API for writing directly
to Photos, so the app opens the share sheet, where "Save Image" is the first
option. Android and desktop fall back to a normal download.

**Location** comes from the phone's GPS, resolved through `/api/places`,
which proxies OpenStreetMap (Overpass for nearby venues, Nominatim for text
search). The proxy exists because those services want a real `User-Agent`
that a browser cannot set, and it lets responses cache at the edge. A lookup
failure never blocks a rating — typing the name always works.

## Layout

| Path | What |
| --- | --- |
| `src/app/page.tsx` | The log, newest first, plus the `+` button |
| `src/app/new/page.tsx` | Shoot → rate → preview → save |
| `src/app/leaderboard/page.tsx` | Ranked board |
| `src/app/settings/page.tsx` | Trip, stamp corner, stamp fields, camera guides |
| `src/app/join/page.tsx` | The other end of an invite link |
| `src/app/api/trip/[code]/` | Push and pull against the shared blob store |
| `src/lib/` | Pure domain logic — scoring, entries, card layout, places |
| `src/lib/merge.ts` | Merge rules for the shared log |
| `src/lib/sync.ts` | The sync engine and its state |
| `src/lib/render.ts` | Canvas drawing (browser only) |

The logic in `src/lib` is deliberately free of React so it can be tested
directly; the components stay thin.

## Deploying

Sync needs one thing on Vercel: a Blob store attached to the project, which
sets `BLOB_READ_WRITE_TOKEN`. Without it the trip endpoints answer 503 and the
app quietly stays local — no crashes, no lost ratings.

## Icons

`npm run icons` regenerates the PWA icon set from the SVG masters in
`public/`. The mark is one disc with a single slice cut out of
it: ink disc on paper in the app, inverted to a paper disc on ink for the
app icon and favicon.
