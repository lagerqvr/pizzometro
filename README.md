<img src="./public/pizzometro.svg" width="50" alt="Pizzometro logo">

# Pizzometro

<i>Misuratore di pizza</i>

A pizza-rating instrument. Built for a pizza trip to Napoli, 11–15.9.2026.

Photograph the pizza, rate it 0–10, and the app stamps the score, place and
name into the corner of a picture ready for social media.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 312 unit, component and route tests
npm run typecheck
npm run build
```

## How it works

**Local-first.** Ratings and photos live in IndexedDB on the device. There is
no account, and the app works with no signal — the realistic case standing in
a pizzeria on roaming data.

**Getting the trip off a phone.** `Setup → Save all pictures` renders every
stamped card and hands the lot to the share sheet in one go; because Safari
only opens that sheet from a tap and rendering forty cards takes longer than
a tap lasts, it builds first and saves on a second tap. `Export log` writes
the ratings out as JSON, and `Erase this phone` drops the database and the
app's localStorage keys, leaving a shared trip untouched — so the same trip
code on a new phone pulls everything back.

**A trip** is any number of phones sharing one log. One phone starts a trip, which is
nothing but a ten-character code; the others open the invite link and give a
name. Joining writes a member record, so somebody who has not rated yet still
shows up on the roster. Every rating carries who made it, the log shows
everyone's, and the leaderboard ranks them together *and* splits by person.

Anyone on a trip can delete a rating — tidying the shared log is fair, and the
confirmation names whose it is — but only its author can edit it. A score with
your name on it should only ever have been typed by you. Used alone, with
no trip, none of this appears and nothing leaves the phone.

**Every action answers.** Anything that changes something says so, and the
two that cannot be undone — erasing a phone, and the trip going with the last
person out — make you type the word first. A sync you asked for always
reports, including "nothing new"; the ones nobody asked for stay quiet unless
something actually happened, so a morning with no signal is one message
rather than one a minute.

**Joining** checks the trip is there first. A code is the only thing a trip
has, and writing to one that does not exist creates it — so a typo of the
right shape would quietly start a second, empty trip rather than failing.

**Your ratings follow you.** That one rule decides everything else. Leaving a
trip takes your ratings off it and off everyone else's phones, and takes
everyone else's off yours — what stays here is exactly what you made. The last
person out therefore leaves nothing behind, so the trip is deleted with them.
Erasing a phone is the same thing plus wiping it. There is no separate "clear
the trip": with nobody on a trip, there is no trip.

Withdrawing works by replacing each of your ratings in the store with a
tombstone and deleting its photo, so the other phones drop them on their next
sync. Rejoining bumps your own entries past that tombstone before pushing them
— without it, the marker you left behind would come back and delete your own
copies.


**Syncing** runs on app open, on regaining signal, on returning to the screen
and once a minute — never on the critical path of saving a rating. Local
changes queue until they can go up, and the header says whether the phone is
offline and how many ratings are waiting. Entries are written to Vercel Blob
under a path that carries their version, so nothing is ever overwritten, two
phones cannot clobber each other, and a merge is decided by last-write-wins
with deletes winning ties. A delete leaves a tombstone: without one, the entry
comes straight back on the next pull.

**The viewfinder** asks for the whole sensor and steps down until the device
agrees — a phone gives 4032px, a laptop webcam refuses outright rather than
offering what it has, and the last rung asks only for a camera. It can mirror
itself, and what it saves, so what you framed is what you keep. iOS never
remembers camera permission for an installed web app, so Setup can hand the
job to the camera app instead and stop the prompt on every launch.

**Photos** are kept at the camera's own resolution by default, or capped at
1600px if `Setup → Photo quality` is set to balanced — roughly 3–6 MB against
150 KB. There is only ever one copy. The setting carries through to the saved
picture: at full quality it comes out at the photo's own size, with the stamp
scaled to match, and at balanced it is the 1080px social-media size. Anything that is not already a JPEG is re-encoded, because an
iPhone hands over HEIC and only Safari can read it. Bytes are stored as raw
bytes plus a MIME type rather than as `Blob` objects, which several Safari
versions fail to hand back intact.

**The share picture** is centre-cropped to a square or keeps the photo's own
shape, as you like. It is 1080px along its longest side, or 2048 at full
quality — and never bigger than the photo, since upscaling only invents
detail. The photo itself is kept whole, but the picture has to be composited
and JPEG-encoded on the phone every time one is saved, and a 3088px canvas is
six times the pixels of a 1080 one: the wait shows.
The stamp is plain white monospace, one size for every line — score, place,
pizza — hard against a corner with no panel, rule or shadow behind it. The
corner, the text size, the picture's shape and which lines appear are all
configurable in Setup, and the line budget follows the text size so a long
pizzeria name can never run off the edge.

**Saving to the camera roll**: iOS gives the web no API for writing directly
to Photos, so the app opens the share sheet, where "Save Image" is the first
option. Android and desktop fall back to a normal download.

**The map** draws the ratings as dots on a flat card with a scale bar, over
real streets — fetched as geometry from the same OpenStreetMap service the
place lookup uses and drawn as thin ink lines, rather than as tiles from a
provider that would look nothing like the rest of this. Two weights, so the
big roads read as the shape of the place. The projection is equirectangular,
squashed by the cosine of the latitude, or Naples comes out stretched; it
fits every rating on the card and will not zoom past 500 m, since three
pizzerias on one street would otherwise fill it. Dots closer together than a
fingertip are nudged apart, deterministically, so none can hide under
another. Only ratings with coordinates can be drawn: a place picked from the
list has them, and one typed by hand takes the phone's position, but one
typed before the app did that has nothing to place — the empty map says so
and points at Edit.

**Map links** open a place's own listing when it has a street behind it, and
drop a pin on the coordinates when all that is known is a point. A bare name
is never enough on its own: "Da Michele" opens a map of Germany.

**Location** comes from the phone's GPS, resolved through `/api/places`,
which proxies OpenStreetMap (Overpass for nearby venues, Nominatim for text
search). The proxy exists because those services want a real `User-Agent` a
browser cannot set, and because the position is rounded to about 110 m before
it is asked — everyone at the same table then asks one identical question the
edge cache can answer once, which is also what keeps us inside Overpass's
rate limit. A 429 is retried once and then falls back to Nominatim, a
position that never arrives gives up after ten seconds, and a lookup failure
never blocks a rating: typing the name always works.

## Layout

| Path | What |
| --- | --- |
| `src/app/page.tsx` | The log, newest first, plus the `+` button |
| `src/app/new/page.tsx` | Shoot → rate → preview → save |
| `src/app/entry/page.tsx` | One rating: review, edit, save the picture |
| `src/app/leaderboard/page.tsx` | Ranked board, split by person |
| `src/app/map/page.tsx` | Where the ratings happened |
| `src/app/settings/page.tsx` | Trip, picture shape, stamp, camera, the scale, data |
| `src/app/join/page.tsx` | The other end of an invite link |
| `src/app/api/trip/[code]/` | Push and pull against the shared blob store |
| `src/lib/` | Pure domain logic — scoring, entries, card layout, places |
| `src/lib/map.ts` | Projecting ratings onto a flat card |
| `src/app/api/roads/` | Street geometry for the map |
| `src/lib/merge.ts` | Merge rules for the shared log |
| `src/lib/bulk.ts` | Saving every picture at once |
| `src/lib/wipe.ts` | Taking the app off a phone |
| `src/lib/sync.ts` | The sync engine and its state |
| `src/lib/render.ts` | Canvas drawing (browser only) |

The logic in `src/lib` is deliberately free of React so it can be tested
directly; the components stay thin.

## Deploying

Sync needs one thing on Vercel: a Blob store attached to the project, which
sets `BLOB_READ_WRITE_TOKEN`. Without it the trip endpoints answer 503, the
app says so once and stays local — no crashes, no lost ratings, no repeated
nagging.

```bash
npm run trips                  # every trip in the store, and what it holds
npm run trips -- clear <code>  # empty one
npm run trips -- clear --all   # empty the store
```

Emptying trips lives in the CLI rather than the app because it needs the
store's own token. The app can only clear a trip whose code it already holds:
the code is the only credential a trip has, and an endpoint that wiped
everything would need nothing but the URL.

## Icons

Two masters live in `public/`: `pizzometro.svg` is the bare mark, inlined in
the header and served as the favicon, and `pizzometro_app.svg` is the same
mark on its near-black tile, which is what an installed app shows.
`npm run icons` renders every PNG size from them and copies the bare mark to
`src/app/icon.svg`, so the mark is only ever edited in one place. The
maskable variant scales the art into the 80% safe circle.

Brand colours are `#BF360C` and `#E65100` on `#212121`, kept in `globals.css`
as `--color-accent`, `--color-accent-warm` and `--color-ink`.
