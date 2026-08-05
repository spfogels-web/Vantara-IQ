/**
 * Minimal JPEG EXIF reader — pulls the three fields a jobsite photo is worth
 * reading: when it was taken, and where.
 *
 * Runs in the browser before upload, so the metadata is captured from the
 * phone's original file rather than guessed at server-side. Deliberately
 * dependency-free and deliberately narrow: it walks the JPEG segment list to
 * APP1, then reads DateTimeOriginal (0x9003) out of the Exif IFD and the four
 * GPS tags out of the GPS IFD. Anything it doesn't understand it skips, and the
 * uploader falls back to the file's modified time.
 */

export interface ExifData {
  /** ISO string. EXIF stores no timezone, so it's read as device-local time. */
  takenAt?: string;
  latitude?: number;
  longitude?: number;
}

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TAG_DATE_TIME = 0x0132;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

/** Bytes per EXIF value type, indexed by the type code. 0 = unsupported. */
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

/** Only the first chunk can hold EXIF; no need to read a 12 MB photo to find it. */
const HEAD_BYTES = 512 * 1024;

export async function readExif(file: File): Promise<ExifData> {
  const looksJpeg =
    /^image\/jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
  if (!looksJpeg) return {};

  try {
    const buf = await file.slice(0, HEAD_BYTES).arrayBuffer();
    return parseJpeg(new DataView(buf));
  } catch {
    return {};
  }
}

function parseJpeg(view: DataView): ExifData {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {}; // not SOI
  let offset = 2;

  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return {}; // desynced — bail
    const marker = view.getUint8(offset + 1);

    // Standalone markers carry no length payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    // Start of scan: image data begins, no metadata past here.
    if (marker === 0xda) return {};

    const size = view.getUint16(offset + 2);
    if (size < 2) return {};

    if (marker === 0xe1) {
      const sig = offset + 4;
      // "Exif\0\0"
      if (
        sig + 6 <= view.byteLength &&
        view.getUint32(sig) === 0x45786966 &&
        view.getUint16(sig + 4) === 0x0000
      ) {
        return parseTiff(view, sig + 6);
      }
    }
    offset += 2 + size;
  }
  return {};
}

function parseTiff(view: DataView, tiff: number): ExifData {
  if (tiff + 8 > view.byteLength) return {};

  const byteOrder = view.getUint16(tiff);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return {};
  const le = byteOrder === 0x4949; // "II" = little-endian

  if (view.getUint16(tiff + 2, le) !== 42) return {};
  const ifd0 = view.getUint32(tiff + 4, le);
  if (!ifd0) return {};

  const root = readIfd(view, tiff, tiff + ifd0, le);
  const out: ExifData = {};

  const exifPtr = root.get(TAG_EXIF_IFD);
  const exif = exifPtr
    ? readIfd(view, tiff, tiff + readScalar(view, exifPtr, le), le)
    : new Map<number, Entry>();

  const dateEntry =
    exif.get(TAG_DATE_TIME_ORIGINAL) ??
    exif.get(TAG_DATE_TIME_DIGITIZED) ??
    root.get(TAG_DATE_TIME);
  if (dateEntry) {
    const iso = exifDateToIso(readAscii(view, dateEntry));
    if (iso) out.takenAt = iso;
  }

  const gpsPtr = root.get(TAG_GPS_IFD);
  if (gpsPtr) {
    const gps = readIfd(view, tiff, tiff + readScalar(view, gpsPtr, le), le);
    const lat = readDms(view, gps.get(TAG_GPS_LAT), le);
    const lon = readDms(view, gps.get(TAG_GPS_LON), le);
    const latEntry = gps.get(TAG_GPS_LAT_REF);
    const lonEntry = gps.get(TAG_GPS_LON_REF);
    const latRef = latEntry ? readAscii(view, latEntry) : "";
    const lonRef = lonEntry ? readAscii(view, lonEntry) : "";

    if (lat != null && lon != null) {
      const latitude = /^s/i.test(latRef) ? -lat : lat;
      const longitude = /^w/i.test(lonRef) ? -lon : lon;
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0)) {
        out.latitude = round6(latitude);
        out.longitude = round6(longitude);
      }
    }
  }

  return out;
}

interface Entry {
  type: number;
  count: number;
  /** Absolute offset of the value bytes (inline or pointed-to). */
  valueAt: number;
}

function readIfd(view: DataView, tiff: number, at: number, le: boolean) {
  const entries = new Map<number, Entry>();
  if (at + 2 > view.byteLength) return entries;

  const count = view.getUint16(at, le);
  for (let i = 0; i < count; i++) {
    const e = at + 2 + i * 12;
    if (e + 12 > view.byteLength) break;

    const tag = view.getUint16(e, le);
    const type = view.getUint16(e + 2, le);
    const n = view.getUint32(e + 4, le);
    const size = (TYPE_SIZE[type] ?? 0) * n;
    if (!size) continue;

    // Values of 4 bytes or fewer live in the entry; larger ones are pointers.
    const valueAt = size <= 4 ? e + 8 : tiff + view.getUint32(e + 8, le);
    if (valueAt + size > view.byteLength) continue;

    entries.set(tag, { type, count: n, valueAt });
  }
  return entries;
}

/** SHORT/LONG scalar — how the sub-IFD pointers are stored. */
function readScalar(view: DataView, e: Entry, le: boolean) {
  if (e.type === 3) return view.getUint16(e.valueAt, le);
  if (e.type === 4) return view.getUint32(e.valueAt, le);
  return 0;
}

function readAscii(view: DataView, e: Entry) {
  let s = "";
  for (let i = 0; i < e.count; i++) {
    const c = view.getUint8(e.valueAt + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

/** Three RATIONALs — degrees, minutes, seconds — collapsed to decimal degrees. */
function readDms(view: DataView, e: Entry | undefined, le: boolean) {
  if (!e || e.type !== 5 || e.count < 3) return null;
  const parts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const at = e.valueAt + i * 8;
    const num = view.getUint32(at, le);
    const den = view.getUint32(at + 4, le);
    if (!den) return null;
    parts.push(num / den);
  }
  const [deg, min, sec] = parts;
  return deg + min / 60 + sec / 3600;
}

/** "2026:03:14 07:42:19" → ISO. Read as device-local; EXIF carries no offset. */
function exifDateToIso(raw: string) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  if (Number.isNaN(date.getTime()) || +y < 1980) return null;
  return date.toISOString();
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
