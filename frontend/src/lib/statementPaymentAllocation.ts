import type { Order } from "../types";
import type { AdjustmentTxn, PaymentTxn } from "./api";
import type { BillingCycleConfig } from "./billingCycle";
import { startOfCycle } from "./billingCycle";
import { resolvePaymentTxnEffectiveType } from "./paymentTxnType";

export type StatementPaymentKind = "purchase" | "billing";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function orderNumericId(order: Order): number | null {
  const n = Number(order.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normalize API / DB order_date for statement cycle bucketing (handles non-string JSON). */
export function paymentTxnOrderDateKey(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    const d = raw;
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return paymentTxnOrderDateKey(new Date(raw));
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Bucket payments/adjustments by statement cycle using customer + order date.
 * Falls back to order list when API join omits contact_person / order_date (fixes net paid vs adjustments).
 */
export function resolveStatementTxnBucketMeta(
  txn: { order_id: number | null; contact_person?: string | null; order_date?: unknown },
  orderPool: Order[],
): { customer: string; orderDateKey: string } | null {
  let customer = (txn.contact_person != null ? String(txn.contact_person) : "").trim();
  let rawDate: unknown = txn.order_date;
  const oid = txn.order_id != null ? Number(txn.order_id) : null;
  if (oid != null && Number.isFinite(oid)) {
    const o = orderPool.find((x) => orderNumericId(x) === oid);
    if (o) {
      if (!customer) customer = (o.contactPerson || "").trim();
      if (rawDate == null || (typeof rawDate === "string" && rawDate.trim() === "")) {
        rawDate = o.orderDate;
      }
    }
  }
  const orderDateKey = paymentTxnOrderDateKey(rawDate);
  if (!customer || !orderDateKey) return null;
  return { customer, orderDateKey };
}

function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Statement bucket key for a payment or adjustment row — must match `paymentsByKey` / statement `row.key`
 * (purchase keys include `::${viewingForGenerator}`).
 */
export function statementBucketKeyForTxn(
  txn: { order_id: number | null; contact_person?: string | null; order_date?: unknown },
  orderPool: Order[],
  cycleConfig: BillingCycleConfig,
  kind: StatementPaymentKind,
  purchaseViewingForGenerator?: string,
): string | null {
  const meta = resolveStatementTxnBucketMeta(txn, orderPool);
  if (!meta) return null;
  const raw = meta.orderDateKey;
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const [y, mo, da] = raw.slice(0, 10).split("-").map((x) => Number(x));
  const dt = new Date(y, mo - 1, da);
  dt.setHours(0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  const start = startOfCycle(dt, cycleConfig.cycleDays, cycleConfig.weekStartDay);
  const startKey = formatLocalIsoDate(start);
  if (kind === "purchase") {
    const suffix = purchaseViewingForGenerator ?? "all";
    return `${startKey}::${meta.customer}::${suffix}`;
  }
  return `${startKey}::${meta.customer}`;
}

function purchaseInvoiceCap(order: Order): number {
  const v = order.purchaseSubtotal ?? order.lines.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0);
  return roundMoney(Number(v) || 0);
}

function billingInvoiceCap(order: Order): number {
  return roundMoney(Number(order.grandTotal ?? order.billingSubtotal ?? 0) || 0);
}

export function invoiceCapForStatement(order: Order, kind: StatementPaymentKind): number {
  return kind === "purchase" ? purchaseInvoiceCap(order) : billingInvoiceCap(order);
}

function numericOrderId(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Net payments minus adjustments for one order (all cycles; matches ledger / per-order table). */
export function netPaidAppliedOnOrder(
  orderId: number,
  kind: StatementPaymentKind,
  payments: PaymentTxn[],
  adjustments: AdjustmentTxn[],
): number {
  const ptype: StatementPaymentKind = kind;
  let pay = 0;
  for (const p of payments) {
    if (numericOrderId(p.order_id) !== orderId) continue;
    if (resolvePaymentTxnEffectiveType(p) !== ptype) continue;
    pay += Number(p.amount ?? 0);
  }
  let adj = 0;
  for (const a of adjustments) {
    if (numericOrderId(a.order_id) !== orderId || a.type !== ptype) continue;
    adj += Number(a.amount ?? 0);
  }
  return roundMoney(Math.max(0, pay - adj));
}

/** Orders in this statement cycle, customer-matched, stable by order date ascending. */
export function ordersForStatementInvoices(
  invoices: Array<{ orderNo: string }>,
  orderPool: Order[],
  customerTrimmed: string,
): Order[] {
  const list: Order[] = [];
  const seen = new Set<string>();
  for (const inv of invoices) {
    const o = orderPool.find(
      (x) => x.orderNo === inv.orderNo && (x.contactPerson || "").trim() === customerTrimmed,
    );
    if (o && !seen.has(o.id)) {
      seen.add(o.id);
      list.push(o);
    }
  }
  return list.sort((a, b) => a.orderDate.localeCompare(b.orderDate));
}

export type MoneyChunk = { orderId: number; amount: number };

/**
 * Split a positive payment delta across cycle orders without exceeding each order's invoice cap.
 * Uses a simulated payment list so multiple chunks in one save see updated room.
 *
 * Per-order room uses global net (payments − adjustments for that order), matching the backend
 * insert_payment_and_ledger_row cap; statement header "paid" stays cycle-bucketed separately.
 */
export function planPaymentIncreaseChunks(
  cycleOrders: Order[],
  kind: StatementPaymentKind,
  delta: number,
  payments: PaymentTxn[],
  adjustments: AdjustmentTxn[],
): MoneyChunk[] {
  if (delta <= 0.001) return [];
  const simPayments: PaymentTxn[] = [...payments];
  let remaining = roundMoney(delta);
  const chunks: MoneyChunk[] = [];
  for (const o of cycleOrders) {
    if (remaining <= 0.001) break;
    const oid = orderNumericId(o);
    if (oid == null) continue;
    const cap = invoiceCapForStatement(o, kind);
    if (cap <= 0.001) continue;
    const net = netPaidAppliedOnOrder(oid, kind, simPayments, adjustments);
    const room = roundMoney(Math.max(0, cap - net));
    if (room <= 0.001) continue;
    const take = roundMoney(Math.min(remaining, room));
    if (take <= 0.001) continue;
    chunks.push({ orderId: oid, amount: take });
    simPayments.push({
      id: -chunks.length,
      order_id: oid,
      invoice_id: null,
      payment_type: kind,
      amount: take,
      note: "",
      created_by: 0,
      created_at: "",
      contact_person: o.contactPerson ?? "",
      order_date: o.orderDate,
    });
    remaining = roundMoney(remaining - take);
  }
  return chunks;
}

/** Total room left to record payments across orders in this cycle (for validation). */
export function totalPaymentRoomOnOrders(
  cycleOrders: Order[],
  kind: StatementPaymentKind,
  payments: PaymentTxn[],
  adjustments: AdjustmentTxn[],
): number {
  let sum = 0;
  for (const o of cycleOrders) {
    const oid = orderNumericId(o);
    if (oid == null) continue;
    const cap = invoiceCapForStatement(o, kind);
    const net = netPaidAppliedOnOrder(oid, kind, payments, adjustments);
    sum += Math.max(0, cap - net);
  }
  return roundMoney(sum);
}

/**
 * Plan billing/purchase adjustments to lower total paid by |delta|. Newest cycle orders first.
 * Simulated adjustments so multi-chunk planning is consistent.
 * Uses global net per order (matches insert_adjustment_and_ledger_row caps).
 */
export function planAdjustmentDecreaseChunks(
  cycleOrders: Order[],
  kind: StatementPaymentKind,
  delta: number,
  payments: PaymentTxn[],
  adjustments: AdjustmentTxn[],
): MoneyChunk[] {
  if (delta >= -0.001) return [];
  let need = roundMoney(Math.abs(delta));
  const simAdj: AdjustmentTxn[] = [...adjustments];
  const chunks: MoneyChunk[] = [];
  for (const o of [...cycleOrders].reverse()) {
    if (need <= 0.001) break;
    const oid = orderNumericId(o);
    if (oid == null) continue;
    const net = netPaidAppliedOnOrder(oid, kind, payments, simAdj);
    if (net <= 0.001) continue;
    const take = roundMoney(Math.min(need, net));
    if (take <= 0.001) continue;
    chunks.push({ orderId: oid, amount: take });
    simAdj.push({
      id: -chunks.length,
      order_id: oid,
      type: kind,
      amount: take,
      reason: "",
      created_by: 0,
      created_at: "",
      contact_person: o.contactPerson ?? "",
      order_date: o.orderDate,
    });
    need = roundMoney(need - take);
  }
  return chunks;
}
