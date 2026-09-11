import { describe, expect, it } from "vitest";
import { crc32, unzip, zip, type Bytes } from "./zip";

function bytes(text: string): Bytes {
  return new TextEncoder().encode(text);
}

async function roundTrip(files: Array<{ name: string; bytes: Bytes }>) {
  const blob = zip(files);
  return unzip(await blob.arrayBuffer());
}

describe("crc32", () => {
  it("matches the known checksum for a standard string", () => {
    // The canonical test vector: CRC-32 of "123456789".
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for nothing", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("zip", () => {
  it("round-trips a file", async () => {
    const files = await roundTrip([{ name: "a.txt", bytes: bytes("hello") }]);
    expect(new TextDecoder().decode(files.get("a.txt"))).toBe("hello");
  });

  it("round-trips several, keeping each one's bytes with its own name", async () => {
    const files = await roundTrip([
      { name: "pizzometro.json", bytes: bytes('{"app":"pizzometro"}') },
      { name: "photos/one.jpg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]) },
      { name: "thumbs/one.jpg", bytes: new Uint8Array([1, 2, 3]) },
    ]);
    expect([...files.keys()]).toEqual([
      "pizzometro.json",
      "photos/one.jpg",
      "thumbs/one.jpg",
    ]);
    expect([...files.get("photos/one.jpg")!]).toEqual([0xff, 0xd8, 0xff, 0x00]);
    expect([...files.get("thumbs/one.jpg")!]).toEqual([1, 2, 3]);
  });

  it("handles an empty file and an empty archive", async () => {
    expect((await roundTrip([])).size).toBe(0);
    const files = await roundTrip([{ name: "empty", bytes: new Uint8Array(0) }]);
    expect(files.get("empty")).toHaveLength(0);
  });

  it("keeps non-ascii names readable", async () => {
    const files = await roundTrip([{ name: "caffè–napoli.txt", bytes: bytes("ok") }]);
    expect(files.has("caffè–napoli.txt")).toBe(true);
  });

  it("survives bytes that look like the format's own signatures", async () => {
    // A signature inside the data would derail a scan-forward reader.
    const evil = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x50, 0x4b, 0x05, 0x06]);
    const files = await roundTrip([{ name: "evil.bin", bytes: evil }]);
    expect([...files.get("evil.bin")!]).toEqual([...evil]);
  });

  it("writes a real archive: stored method, matching checksum and sizes", async () => {
    const payload = bytes("the quick brown fox");
    const buffer = await zip([{ name: "f.txt", bytes: payload }]).arrayBuffer();
    const view = new DataView(buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // local header first
    expect(view.getUint16(8, true)).toBe(0); // stored, not deflated
    expect(view.getUint32(14, true)).toBe(crc32(payload));
    expect(view.getUint32(18, true)).toBe(payload.length); // compressed
    expect(view.getUint32(22, true)).toBe(payload.length); // uncompressed
  });

  it("refuses something that is not a zip", () => {
    expect(() => unzip(bytes("just some text").buffer)).toThrow(/not a zip/i);
  });
});
