import type { Order } from "../types";
import { formatDateDdMmYyyyOrDash, formatDateTimeDdMmYyyy } from "./formatDisplayDate";

/** Shown in admin/moderator lists when the customer submitted the order (not draft). */
export function formatOrderSubmittedAt(order: Order): string {
  if (order.status === "draft") return "—";
  if (order.submittedAt?.trim()) {
    const t = formatDateTimeDdMmYyyy(order.submittedAt);
    if (t) return t;
  }
  return formatDateDdMmYyyyOrDash(order.orderDate);
}

/** Saved timestamp shown in lists; falls back to orderDate on old rows. */
export function formatOrderSavedAt(order: Order): string {
  const source = order.createdAt || order.orderDate;
  if (!source) return "—";
  const d = new Date(source);
  if (Number.isNaN(d.getTime())) return formatDateDdMmYyyyOrDash(source);
  return formatDateTimeDdMmYyyy(source);
}
