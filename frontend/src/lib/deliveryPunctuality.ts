import type { Order } from "../types";
import { formatDateTimeDdMmYyyy } from "./formatDisplayDate";
import { parseDeliveryWindow } from "./deliveryWindow";

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_ONLY = /^(\d{2}):(\d{2})$/;
const TIME_RANGE = /^(\d{2}:\d{2})\s*(?:to|–|—|-)\s*(\d{2}:\d{2})$/i;

function parseLocalDateTimeMs(ymd: string, hh: string, mm: string): number | null {
  if (!ISO_DATE_ONLY.test(ymd)) return null;
  const d = new Date(`${ymd}T${hh}:${mm}:00`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function endOfLocalDayMs(ymd: string): number | null {
  if (!ISO_DATE_ONLY.test(ymd)) return null;
  const d = new Date(`${ymd}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function parseFlexibleEndMs(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (ISO_DATE_ONLY.test(t)) {
    return endOfLocalDayMs(t);
  }
  if (ISO_DATE_TIME.test(t)) {
    const d = new Date(`${t}:00`);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Latest moment still considered "on time" for this order (local interpretation, aligned with {@link canEditOrder}).
 */
export function getDeliveryCommitmentEndMs(order: Order): number | null {
  const datePart = (order.deliveryDate ?? "").trim();
  const timeWin = (order.deliveryTime ?? "").trim();

  if (timeWin) {
    const { startDate, endDate } = parseDeliveryWindow(timeWin);
    if (startDate && endDate) {
      return parseFlexibleEndMs(endDate);
    }
    if (ISO_DATE_ONLY.test(timeWin) || ISO_DATE_TIME.test(timeWin)) {
      return parseFlexibleEndMs(timeWin);
    }
    const range = timeWin.match(TIME_RANGE);
    if (range && ISO_DATE_ONLY.test(datePart)) {
      return parseLocalDateTimeMs(datePart, range[2].slice(0, 2), range[2].slice(3, 5));
    }
    const one = timeWin.match(TIME_ONLY);
    if (one && ISO_DATE_ONLY.test(datePart)) {
      return parseLocalDateTimeMs(datePart, one[1], one[2]);
    }
  }

  if (ISO_DATE_ONLY.test(datePart)) {
    return endOfLocalDayMs(datePart);
  }
  return null;
}

export function formatShortDeliveredAt(iso: string): string {
  if (!iso.trim()) return iso;
  return formatDateTimeDdMmYyyy(iso);
}

/** Punctuality badge for order list “Delivered” column (and similar). */
export function orderListDeliveryBadge(
  order: Order,
  now: Date = new Date(),
): { text: string; className: string } | null {
  const isDelivered = order.status === "delivered" || order.status === "invoiced";
  const deliveredMs = order.deliveredAt ? Date.parse(order.deliveredAt) : NaN;
  const deadline = getDeliveryCommitmentEndMs(order);

  if (isDelivered && order.deliveredAt && deadline != null && !Number.isNaN(deliveredMs)) {
    if (deliveredMs <= deadline) {
      return { text: "On time", className: "bg-emerald-100 text-emerald-800" };
    }
    return { text: "Late", className: "bg-rose-100 text-rose-800" };
  }
  if (!isDelivered && deadline != null && now.getTime() > deadline) {
    return { text: "Due", className: "bg-amber-100 text-amber-900" };
  }
  return null;
}
