const YMD_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function padLocalYmd(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

/** UI date as `dd-mm-yyyy` (storage/API can stay `yyyy-mm-dd`). */
export function formatDateDdMmYyyy(value: string | Date | undefined | null): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return padLocalYmd(value);
  }
  const v = String(value).trim();
  if (!v) return "";
  const m = v.match(YMD_PREFIX);
  if (m) {
    const [, y, mo, d] = m;
    return `${d}-${mo}-${y}`;
  }
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return v;
  return padLocalYmd(parsed);
}

export function formatDateDdMmYyyyOrDash(value: string | Date | undefined | null): string {
  return formatDateDdMmYyyy(value) || "—";
}

/** Local date + short time for timestamps (e.g. submitted / delivered). */
export function formatDateTimeDdMmYyyy(iso: string | undefined | null): string {
  const v = String(iso ?? "").trim();
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const datePart = padLocalYmd(d);
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart}, ${timePart}`;
}

const DMY_FULL = /^(\d{2})-(\d{2})-(\d{4})$/;

/** Parses `dd-mm-yyyy` to calendar `yyyy-mm-dd`, or `null` if invalid. */
export function parseDdMmYyyyToIsoYmd(s: string): string | null {
  const v = s.trim();
  const m = v.match(DMY_FULL);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
