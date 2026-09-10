import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isTripCode } from "@/lib/trip";
import {
  MAX_PUSH,
  entryPath,
  newestVersions,
  sanitiseEntry,
} from "@/lib/wire";
import type { Entry } from "@/lib/types";

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
    const newest = newestVersions(await listAll(`trips/${code}/entries/`));
    const fresh = newest.filter((blob) => blob.uploadedAt.getTime() > since);

    const entries = await mapLimit(fresh, CONCURRENCY, async (blob) => {
      try {
        const response = await fetch(blob.url);
        if (!response.ok) return null;
        return sanitiseEntry(await response.json());
      } catch {
        // One unreadable blob must not fail the whole pull.
        return null;
      }
    });

    return NextResponse.json(
      { entries: entries.filter((entry): entry is Entry => entry !== null), now: Date.now() },
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

  const incoming = (payload as { entries?: unknown })?.entries;
  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: "bad-body" }, { status: 400 });
  }

  const entries = incoming
    .slice(0, MAX_PUSH)
    .map(sanitiseEntry)
    .filter((entry): entry is Entry => entry !== null);

  try {
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
