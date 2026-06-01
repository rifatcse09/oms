import type { Order } from "../types";
import { formatDateDdMmYyyyOrDash } from "./formatDisplayDate";
import { formatDeliveryTimeOnly, formatDeliveryWindow } from "./deliveryWindow";

/** Static scheduled delivery label for lists (no timers). */
export function formatDeliveryScheduleLabel(order: Order): string {
  return formatDeliveryWindow(order.deliveryTime, order.deliveryDate);
}

export function formatDeliveryDateLabel(order: Order): string {
  const raw = (order.deliveryDate ?? "").trim();
  if (!raw) return "—";
  const formatted = formatDateDdMmYyyyOrDash(raw);
  return formatted === "—" ? raw : formatted;
}

export function formatDeliveryTimeWindowLabel(order: Order): string {
  return formatDeliveryTimeOnly(order.deliveryTime);
}
