import { del, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isTripCode } from "@/lib/trip";
import {
  MAX_PUSH,
  entryPath,
  memberPath,
  newestVersions,
  parseEntryPath,
  photoPath,
  sanitiseEntry,
  sanitiseRater,
} from "@/lib/wire";
import { isSafeId } from "@/lib/wire";
import type { Entry, Rater } from "@/lib/types";

/**
 * The shared trip. Two phones, one blob store, no accounts: the trip code is
 * the secret, which is why it is checked against a strict pattern before it
 * is ever allowed near a storage path.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Blob timestamps come from the store's clock and `since` from a previous
 * response, but a few seconds of slack costs one re-read and closes the gap
 * where a write lands in the same second as a pull.
 */
const CLOCK_SLACK_MS = 5_000;
const CONCURRENCY = 8;

function configured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/* Built per request: a Response body is a stream, and one shared instance
 * would come back empty to everybody after the first reader. */
const notConfigured = () =>
  NextResponse.json({ error: "sync-not-configured" }, { status: 503 });

const badCode = () =>
  NextResponse.json({ error: "bad-trip-code" }, { status: 400 });

/** Runs `task` over `items`, a few at a time, so a big push behaves. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map(task))));
  }
  return results;
}

type StoredBlob = { pathname: string; url: string; uploadedAt: Date };

async function listAll(prefix: string): Promise<StoredBlob[]> {
  const found: StoredBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    found.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found;
}

/** Pull: every entry whose newest version landed after `since`. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isTripCode(code)) return badCode();
  if (!configured()) return notConfigured();

  const raw = Number(new URL(request.url).searchParams.get("since"));
  const since = Number.isFinite(raw) && raw > 0 ? raw - CLOCK_SLACK_MS : 0;

  try {
    const [entryBlobs, memberBlobs] = await Promise.all([
      listAll(`trips/${code}/entries/`),
      listAll(`trips/${code}/members/`),
    ]);

    const newest = newestVersions(entryBlobs);
    const fresh = newest.filter((blob) => blob.uploadedAt.getTime() > since);

    const [entries, members] = await Promise.all([
      mapLimit(fresh, CONCURRENCY, async (blob) => {
        try {
          const response = await fetch(blob.url);
          if (!response.ok) return null;
          return sanitiseEntry(await response.json());
        } catch {
          // One unreadable blob must not fail the whole pull.
          return null;
        }
      }),
      // The roster is small and always sent: it is how a phone that has
      // joined but not yet rated shows up on everybody else's.
      mapLimit(memberBlobs, CONCURRENCY, async (blob) => {
        try {
          const response = await fetch(blob.url);
          if (!response.ok) return null;
          return sanitiseRater(await response.json()) ?? null;
        } catch {
          return null;
        }
      }),
    ]);

    return NextResponse.json(
      {
        entries: entries.filter((entry): entry is Entry => entry !== null),
        members: members.filter((rater): rater is Rater => rater !== null),
        now: Date.now(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "pull-failed" }, { status: 502 });
  }
}

/**
 * Push. Each entry is written to a path that carries its version, so a
 * retried push rewrites the same bytes and two devices never overwrite each
 * other's work.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isTripCode(code)) return badCode();
  if (!configured()) return notConfigured();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-body" }, { status: 400 });
  }

  const body = payload as { entries?: unknown; member?: unknown };
  const incoming = body?.entries ?? [];
  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: "bad-body" }, { status: 400 });
  }

  const entries = incoming
    .slice(0, MAX_PUSH)
    .map(sanitiseEntry)
    .filter((entry): entry is Entry => entry !== null);

  // Joining is announced the same way a rating is pushed.
  const member = sanitiseRater(body?.member);

  try {
    if (member && isSafeId(member.id)) {
      await put(memberPath(code, member.id), JSON.stringify(member), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
    }
    await mapLimit(entries, CONCURRENCY, (entry) =>
      put(entryPath(code, entry), JSON.stringify(entry), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      }),
    );
    return NextResponse.json({ saved: entries.length, now: Date.now() });
  } catch {
    return NextResponse.json({ error: "push-failed" }, { status: 502 });
  }
}

/**
 * Leaving, in its two shapes: withdrawing one person's ratings
 * (`scope=mine`), or taking the whole trip away once nobody is left on it
 * (`scope=trip`).
 *
 * Both need the code, which is the only credential a trip has — so this can
 * only ever reach a trip the caller is already on. There is deliberately no
 * way to ask for "every trip": that would be an unauthenticated wipe of the
 * whole store behind a URL. Emptying the store is a job for the CLI, with
 * the store's own token (`npm run trips`).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isTripCode(code)) return badCode();
  if (!configured()) return notConfigured();

  const query = new URL(request.url).searchParams;

  /*
   * Withdrawing. A leaver takes their own ratings out of the trip: each one
   * is replaced by a tombstone so the other phones learn to drop it, and the
   * photos — the only large things here — are deleted outright. The server
   * decides what belongs to whom; the client only says who is leaving.
   */
  if (query.get("scope") === "mine") {
    const who = query.get("member");
    if (!isSafeId(who)) {
      return NextResponse.json({ error: "bad-member" }, { status: 400 });
    }
    try {
      const blobs = await listAll(`trips/${code}/entries/`);
      const newest = newestVersions(blobs);

      const mine = (
        await mapLimit(newest, CONCURRENCY, async (blob) => {
          try {
            const response = await fetch(blob.url);
            if (!response.ok) return null;
            const entry = sanitiseEntry(await response.json());
            return entry?.rater?.id === who ? entry : null;
          } catch {
            return null;
          }
        })
      ).filter((entry): entry is Entry => entry !== null);

      const version = Date.now();
      await mapLimit(mine, CONCURRENCY, async (entry) => {
        // Every version of it goes, including the photo it points at.
        const versions = blobs.filter(
          (blob) => parseEntryPath(blob.pathname)?.id === entry.id,
        );
        if (versions.length > 0) await del(versions.map((blob) => blob.url));
        if (entry.photoId) {
          await del(photoPath(code, entry.photoId)).catch(() => {});
        }
        // One tombstone left behind, so the other phones hear about it.
        const stone: Entry = {
          ...entry,
          deleted: true,
          updatedAt: version,
          photoId: undefined,
          photoUrl: undefined,
        };
        await put(entryPath(code, stone), JSON.stringify(stone), {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
        });
      });

      await del(memberPath(code, who)).catch(() => {});
      return NextResponse.json({ withdrawn: mine.length });
    } catch {
      return NextResponse.json({ error: "withdraw-failed" }, { status: 502 });
    }
  }

  if (query.get("scope") === "trip") {
    try {
      const blobs = await listAll(`trips/${code}/`);
      // Each phone keeps whatever is already on it; only the shared copy goes.
      for (let i = 0; i < blobs.length; i += 50) {
        await del(blobs.slice(i, i + 50).map((blob) => blob.url));
      }
      return NextResponse.json({ cleared: blobs.length });
    } catch {
      return NextResponse.json({ error: "clear-failed" }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "bad-scope" }, { status: 400 });
}
