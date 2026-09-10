import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isTripCode } from "@/lib/trip";
import { isSafeId, photoPath } from "@/lib/wire";

/**
 * Photos go up once and are never rewritten, so the URL handed back can be
 * cached by the other phone forever.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A full-quality 12-megapixel JPEG runs to about 6 MB; this leaves room for
 * a bigger sensor without letting anything absurd through.
 */
const MAX_BYTES = 24 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string; photoId: string }> },
) {
  const { code, photoId } = await params;
  if (!isTripCode(code) || !isSafeId(photoId)) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "sync-not-configured" }, { status: 503 });
  }

  const type = request.headers.get("content-type")?.split(";")[0] ?? "";
  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: "bad-type" }, { status: 415 });
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "bad-size" }, { status: 413 });
  }

  try {
    const blob = await put(photoPath(code, photoId), bytes, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: type,
    });
    return NextResponse.json({ url: blob.url });
  } catch {
    return NextResponse.json({ error: "upload-failed" }, { status: 502 });
  }
}
