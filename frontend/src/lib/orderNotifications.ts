import type { Order } from "../types";

const KEY_ADMIN = "gom_admin_notify_order_ids";
const KEY_MOD_SEEN = "gom_moderator_seen_order_ids";

export const NOTIFICATIONS_EVENT = "gom-notifications-changed";

function dispatch() {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
}

export function readAdminNotifyOrderIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY_ADMIN);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Call when moderator saves order updates (e.g. after pricing) so admin can review. */
export function flagOrderForAdminReview(orderId: string) {
  const cur = readAdminNotifyOrderIds();
  if (cur.includes(orderId)) {
    dispatch();
    return;
  }
  cur.push(orderId);
  localStorage.setItem(KEY_ADMIN, JSON.stringify(cur));
  dispatch();
}

/** Call when admin opens an order detail — clears the “new” flag for that order. */
export function clearAdminOrderNotification(orderId: string) {
  const next = readAdminNotifyOrderIds().filter((id) => id !== orderId);
  localStorage.setItem(KEY_ADMIN, JSON.stringify(next));
  dispatch();
}

export function readModeratorSeenOrderIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_MOD_SEEN);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Call when moderator opens an order detail page. */
export function markModeratorSeenOrder(orderId: string) {
  const s = readModeratorSeenOrderIds();
  if (s.has(orderId)) {
    dispatch();
    return;
  }
  s.add(orderId);
  localStorage.setItem(KEY_MOD_SEEN, JSON.stringify([...s]));
  dispatch();
}

/** Submitted orders count for the header badge — always matches the order list. */
export function moderatorNewSubmittedCount(orders: Order[]): number {
  return orders.filter((o) => o.status === "submitted").length;
}

// ── New user signup notifications (admin only) ───────────────────────────────

const KEY_NEW_SIGNUPS = "gom_new_user_signups";

export interface SignupNotification {
  id: string;
  name: string;
  email: string;
  at: string; // ISO timestamp
}

export function readNewSignups(): SignupNotification[] {
  try {
    const raw = localStorage.getItem(KEY_NEW_SIGNUPS);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr)
      ? arr.filter(
          (x): x is SignupNotification =>
            typeof x === "object" && x !== null && "id" in x && "email" in x,
        )
      : [];
  } catch {
    return [];
  }
}

/** Backwards-compatible helper — returns just the IDs. */
export function readNewSignupUserIds(): string[] {
  return readNewSignups().map((s) => s.id);
}

/** Call immediately after a new customer self-registers. */
export function flagNewUserSignup(userId: string, name: string, email: string) {
  const cur = readNewSignups();
  if (cur.some((s) => s.id === userId)) return;
  cur.unshift({ id: userId, name, email, at: new Date().toISOString() });
  localStorage.setItem(KEY_NEW_SIGNUPS, JSON.stringify(cur));
  dispatch();
}

/** Call when admin dismisses a single signup notification. */
export function clearNewSignupNotification(userId: string) {
  const next = readNewSignups().filter((s) => s.id !== userId);
  localStorage.setItem(KEY_NEW_SIGNUPS, JSON.stringify(next));
  dispatch();
}

/** Call when admin visits the Users list page — clears all pending signup flags. */
export function clearAllSignupNotifications() {
  localStorage.setItem(KEY_NEW_SIGNUPS, JSON.stringify([]));
  dispatch();
}

// ────────────────────────────────────────────────────────────────────────────

/** True if moderator saved pricing-like data (unit price or line total on any line). */
export function orderHasPricingData(order: Order): boolean {
  return order.lines.some(
    (l) => (l.unitPrice != null && l.unitPrice > 0) || (l.lineTotal != null && l.lineTotal > 0),
  );
}
