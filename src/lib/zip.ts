/*
 * A minimal ZIP reader and writer, stored (uncompressed) only.
 *
 * The archive is almost entirely JPEG, which is already compressed — deflating
 * it would cost time and save close to nothing. Storing means the format is
 * small enough to implement exactly rather than depend on, and every unzip
 * tool still opens it.
 *
 * No zip64: that caps an archive at 4GB and 65535 files, which a phone's worth
 * of pizza photos is nowhere near.
 */

/**
 * Bytes backed by a plain ArrayBuffer. Spelled out because a bare Uint8Array
 * may sit on a SharedArrayBuffer, which a Blob will not take.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export type ZipFile = { name: string; bytes: Bytes };

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** Bit 11: the name is UTF-8, not the format's ancient default codepage. */
const UTF8_FLAG = 0x0800;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Bytes): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, which is what the format stores. */
function dosStamp(date: Date): { time: number; date: number } {
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (Math.floor(date.getSeconds() / 2) & 0x1f),
    // Years count from 1980, and the format cannot go earlier.
    date:
      (Math.max(0, date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

export function zip(files: ZipFile[], now = new Date()): Blob {
  const stamp = dosStamp(now);
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Bytes[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const sum = crc32(file.bytes);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIG, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.date, true);
    lv.setUint32(14, sum, true);
    lv.setUint32(18, file.bytes.length, true);
    lv.setUint32(22, file.bytes.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // no extra field
    local.set(name, 30);

    parts.push(local, file.bytes);

    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, CENTRAL_SIG, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true); // stored
    cv.setUint16(12, stamp.time, true);
    cv.setUint16(14, stamp.date, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, file.bytes.length, true);
    cv.setUint32(24, file.bytes.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);

    offset += local.length + file.bytes.length;
  }

  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

/**
 * Reads an archive this module wrote. Throws on anything it does not
 * recognise, so a wrong file picked in the import dialog fails loudly
 * instead of restoring nothing and claiming success.
 */
export function unzip(buffer: ArrayBuffer): Map<string, Bytes> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // The end record is last, but a trailing comment can push it back, so it
  // is found by scanning backwards.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file");

  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, Bytes>();

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIG) {
      throw new Error("Damaged zip file");
    }
    const method = view.getUint16(cursor + 10, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localAt = view.getUint32(cursor + 42, true);
    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );

    if (method !== 0) {
      throw new Error(`${name} is compressed, which this cannot read`);
    }
    if (view.getUint32(localAt, true) !== LOCAL_SIG) {
      throw new Error("Damaged zip file");
    }

    // The local header's own name and extra lengths are what locate the
    // data; the central copy's extra field is often a different size.
    const dataAt =
      localAt +
      30 +
      view.getUint16(localAt + 26, true) +
      view.getUint16(localAt + 28, true);
    files.set(name, bytes.subarray(dataAt, dataAt + size));

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}
