/**
 * Trips in the shared store, from the command line.
 *
 *   npm run trips                 list every trip and what it holds
 *   npm run trips -- clear <code> empty one trip
 *   npm run trips -- clear --all  empty every trip
 *
 * This lives here rather than in the app on purpose: emptying the whole
 * store needs the store's own token, not merely the URL of a deployed site.
 */
import { readFile } from "node:fs/promises";
import { del, list } from "@vercel/blob";

async function token() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const env = await readFile(".env.local", "utf8");
    const found = env.match(/^BLOB_READ_WRITE_TOKEN=(.+)$/m);
    if (found) return found[1].trim().replace(/^"|"$/g, "");
  } catch {
    /* falls through to the error below */
  }
  throw new Error(
    "No BLOB_READ_WRITE_TOKEN. Run `vercel env pull .env.local` first.",
  );
}

async function everything(rwToken) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: "trips/", limit: 1000, cursor, token: rwToken });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

function groupByTrip(blobs) {
  const trips = new Map();
  for (const blob of blobs) {
    const code = blob.pathname.split("/")[1];
    if (!code) continue;
    const trip = trips.get(code) ?? { entries: 0, photos: 0, members: 0, bytes: 0 };
    if (blob.pathname.includes("/entries/")) trip.entries += 1;
    else if (blob.pathname.includes("/photos/")) trip.photos += 1;
    else if (blob.pathname.includes("/members/")) trip.members += 1;
    trip.bytes += blob.size;
    trips.set(code, trip);
  }
  return trips;
}

const rwToken = await token();
const [command, target] = process.argv.slice(2);
const blobs = await everything(rwToken);
const trips = groupByTrip(blobs);

if (!command) {
  if (trips.size === 0) console.log("No trips in the store.");
  for (const [code, trip] of trips) {
    console.log(
      `${code}  ${String(trip.members).padStart(2)} on it  ` +
        `${String(trip.entries).padStart(3)} rating files  ` +
        `${String(trip.photos).padStart(3)} photos  ` +
        `${(trip.bytes / 1024 / 1024).toFixed(1)} MB`,
    );
  }
  process.exit(0);
}

if (command !== "clear" || !target) {
  console.error("Usage: npm run trips -- clear <code>|--all");
  process.exit(1);
}

const doomed =
  target === "--all"
    ? blobs
    : blobs.filter((blob) => blob.pathname.startsWith(`trips/${target}/`));

if (doomed.length === 0) {
  console.log(target === "--all" ? "Nothing to clear." : `No trip ${target}.`);
  process.exit(0);
}

console.log(`Deleting ${doomed.length} files…`);
for (let i = 0; i < doomed.length; i += 50) {
  await del(doomed.slice(i, i + 50).map((blob) => blob.url), { token: rwToken });
}
console.log("Done.");
