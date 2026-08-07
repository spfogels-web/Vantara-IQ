/**
 * Read the time and place a JPEG was actually taken, out of the file itself.
 *
 * This exists because of one integrity rule: a photo chosen from the camera
 * roll was taken somewhere else, at some other time, and stamping it with the
 * phone's current position would manufacture evidence. So a library photo gets
 * its location from its own EXIF or it gets none.
 *
 * Deliberately small — GPS and DateTimeOriginal, nothing else. It reads the
 * TIFF header inside APP1 rather than pulling in a full EXIF library, because
 * those two tags are the only ones that carry any weight in a dispute.
 *
 * Returns nulls freely. Phones strip EXIF on share sheets, screenshots have
 * none, and a missing tag has to read as "unknown" rather than a default.
 */

export interface ExifFacts {
  /** When the shutter fired, per the camera's own clock. */
  capturedAt: Date | null;
  lat: number | null;
  lng: number | null;
}

const EXIF_HEADER = 0x45786966; // "Exif"

/** IFD tag numbers we care about. */
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LNG_REF = 0x0003;
const TAG_GPS_LNG = 0x0004;

/** EXIF type codes, with their byte widths. */
const TYPE_WIDTH: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

export function readExif(bytes: Uint8Array): ExifFacts {
  const empty: ExifFacts = { capturedAt: null, lat: null, lng: null };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // JPEG only. A PNG or HEIC gets nothing rather than a wrong answer.
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return empty;

  // Walk the JPEG marker segments looking for APP1/Exif.
  let offset = 2;
  let tiffStart = -1;
  while (offset + 4 <= bytes.length) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    // Start of scan — image data from here, no more metadata.
    if (marker === 0xda) break;
    const size = view.getUint16(offset + 2);
    if (size < 2) break;

    if (marker === 0xe1 && offset + 10 <= bytes.length && view.getUint32(offset + 4) === EXIF_HEADER) {
      tiffStart = offset + 10; // skip "Exif\0\0"
      break;
    }
    offset += 2 + size;
  }
  if (tiffStart < 0 || tiffStart + 8 > bytes.length) return empty;

  // TIFF header: byte order, magic 42, offset to IFD0.
  const byteOrder = view.getUint16(tiffStart);
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) return empty;
  if (view.getUint16(tiffStart + 2, little) !== 42) return empty;

  const ifd0 = tiffStart + view.getUint32(tiffStart + 4, little);

  interface Entry {
    type: number;
    count: number;
    valueOffset: number;
  }

  /** Read one IFD into a tag map. Returns null if it runs off the end. */
  function readIfd(start: number): Map<number, Entry> | null {
    if (start + 2 > bytes.length) return null;
    const count = view.getUint16(start, little);
    const out = new Map<number, Entry>();
    for (let i = 0; i < count; i++) {
      const e = start + 2 + i * 12;
      if (e + 12 > bytes.length) return out;
      const tag = view.getUint16(e, little);
      const type = view.getUint16(e + 2, little);
      const n = view.getUint32(e + 4, little);
      const width = TYPE_WIDTH[type] ?? 0;
      const total = width * n;
      // Values of 4 bytes or fewer sit inline; anything larger is a pointer.
      const valueOffset = total <= 4 ? e + 8 : tiffStart + view.getUint32(e + 8, little);
      out.set(tag, { type, count: n, valueOffset });
    }
    return out;
  }

  function ascii(entry: Entry): string {
    let s = "";
    for (let i = 0; i < entry.count; i++) {
      const at = entry.valueOffset + i;
      if (at >= bytes.length) break;
      const c = view.getUint8(at);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  function rationals(entry: Entry, want: number): number[] | null {
    const out: number[] = [];
    for (let i = 0; i < Math.min(entry.count, want); i++) {
      const at = entry.valueOffset + i * 8;
      if (at + 8 > bytes.length) return null;
      const num = view.getUint32(at, little);
      const den = view.getUint32(at + 4, little);
      if (den === 0) return null;
      out.push(num / den);
    }
    return out.length === want ? out : null;
  }

  const root = readIfd(ifd0);
  if (!root) return empty;

  // --- when ---
  let capturedAt: Date | null = null;
  const exifPtr = root.get(TAG_EXIF_IFD);
  const exif = exifPtr ? readIfd(tiffStart + view.getUint32(exifPtr.valueOffset, little)) : null;

  const dtEntry =
    exif?.get(TAG_DATETIME_ORIGINAL) ?? root.get(TAG_DATETIME_ORIGINAL) ?? null;
  if (dtEntry && dtEntry.type === 2) {
    // EXIF writes "YYYY:MM:DD HH:MM:SS" with no timezone. Read it as local —
    // it is the camera's wall clock, which is the honest interpretation.
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(ascii(dtEntry).trim());
    if (m) {
      const d = new Date(
        Number(m[1]), Number(m[2]) - 1, Number(m[3]),
        Number(m[4]), Number(m[5]), Number(m[6]),
      );
      if (!Number.isNaN(d.getTime())) capturedAt = d;
    }
  }

  // --- where ---
  let lat: number | null = null;
  let lng: number | null = null;
  const gpsPtr = root.get(TAG_GPS_IFD);
  if (gpsPtr) {
    const gps = readIfd(tiffStart + view.getUint32(gpsPtr.valueOffset, little));
    if (gps) {
      const dms = (entry: Entry | undefined, ref: string) => {
        if (!entry) return null;
        const parts = rationals(entry, 3);
        if (!parts) return null;
        const deg = parts[0] + parts[1] / 60 + parts[2] / 3600;
        if (!Number.isFinite(deg)) return null;
        return /^[SW]/i.test(ref) ? -deg : deg;
      };
      const latRef = gps.get(TAG_GPS_LAT_REF);
      const lngRef = gps.get(TAG_GPS_LNG_REF);
      lat = dms(gps.get(TAG_GPS_LAT), latRef ? ascii(latRef) : "N");
      lng = dms(gps.get(TAG_GPS_LNG), lngRef ? ascii(lngRef) : "E");

      // A 0,0 fix is Null Island — the camera wrote a placeholder, not a place.
      if (lat === 0 && lng === 0) {
        lat = null;
        lng = null;
      }
      if (lat !== null && (lat < -90 || lat > 90)) lat = null;
      if (lng !== null && (lng < -180 || lng > 180)) lng = null;
    }
  }

  return { capturedAt, lat, lng };
}

/** "34.8526° N, 82.3940° W" — how a coordinate reads on a record. */
export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}
