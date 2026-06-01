import { formatDateDdMmYyyy } from "./formatDisplayDate";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function isIsoDateOrDateTime(value: string): boolean {
  return ISO_DATE_RE.test(value) || ISO_DATE_TIME_RE.test(value);
}

function formatDateLong(date: Date): string {
  return formatDateDdMmYyyy(date);
}

function formatTimeShort(rawTime: string): string {
  const m = rawTime.match(/^(\d{2}):(\d{2})$/);
  if (!m) return rawTime;
  const hh = Number(m[1]);
  const mm = m[2];
  const hour12 = hh % 12 || 12;
  const ampm = hh >= 12 ? "PM" : "AM";
  return `${hour12}:${mm} ${ampm}`;
}

export function parseDeliveryWindow(input?: string): {
  startDate: string;
  endDate: string;
} {
  const value = (input ?? "").trim();
  if (!value) return { startDate: "", endDate: "" };

  const matched = value.match(
    /^(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)\s*(?:to|–|—|-)\s*(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)$/i,
  );
  if (matched) {
    return { startDate: matched[1], endDate: matched[2] };
  }

  if (isIsoDateOrDateTime(value)) {
    return { startDate: value, endDate: value };
  }

  return { startDate: "", endDate: "" };
}

export function buildDeliveryWindow(startDate: string, endDate: string): string | undefined {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!start && !end) return undefined;
  if (start && end) return `${start} to ${end}`;
  return start || end;
}

export function formatDeliveryWindow(input?: string, deliveryDate?: string): string {
  const value = (input ?? "").trim();
  if (!value) return "—";

  const timeOnlyMatch = value.match(/^(\d{2}):(\d{2})$/);
  if (timeOnlyMatch) {
    const hh = Number(timeOnlyMatch[1]);
    const mm = timeOnlyMatch[2];
    const hour12 = hh % 12 || 12;
    const ampm = hh >= 12 ? "PM" : "AM";
    const timeText = `${hour12}:${mm} ${ampm}`;
    const datePart = /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate ?? "") ? (deliveryDate as string) : "";
    if (!datePart) return timeText;
    const d = new Date(`${datePart}T00:00:00`);
    const dateText = Number.isNaN(d.getTime()) ? datePart : formatDateLong(d);
    return `${dateText}, ${timeText}`;
  }

  const { startDate, endDate } = parseDeliveryWindow(value);
  if (!startDate && !endDate) return value;
  const fmt = (raw: string) => {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00` : raw;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return raw;
    const dateText = formatDateLong(d);
    const timeText = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
    return `${dateText}, ${timeText}`;
  };
  if (startDate && endDate) return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} to ${fmt(endDate)}`;
  return fmt(startDate || endDate);
}

/** Time window only (no date), for list cells where delivery date is shown separately. */
export function formatDeliveryTimeOnly(input?: string): string {
  const value = (input ?? "").trim();
  if (!value) return "—";
  const timeOnlyMatch = value.match(/^(\d{2}:\d{2})$/);
  if (timeOnlyMatch) return formatTimeShort(timeOnlyMatch[1]);

  const { startDate, endDate } = parseDeliveryWindow(value);
  const toTime = (raw: string): string => {
    const m = raw.match(/T(\d{2}:\d{2})$/);
    if (m) return formatTimeShort(m[1]);
    if (/^\d{2}:\d{2}$/.test(raw)) return formatTimeShort(raw);
    return raw;
  };
  if (startDate && endDate) return startDate === endDate ? toTime(startDate) : `${toTime(startDate)} to ${toTime(endDate)}`;
  if (startDate || endDate) return toTime(startDate || endDate);
  return value;
}

/** Normalize stored `deliveryTime` to `HH:mm` for `<input type="time" />`. */
export function toTimeInputValue(value?: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[2];
  const rangeStartMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})\s*(?:to|–|—|-)\s*/i);
  if (rangeStartMatch) return rangeStartMatch[2];
  const anyTime = raw.match(/(\d{2}:\d{2})/);
  return anyTime ? anyTime[1] : "";
}
