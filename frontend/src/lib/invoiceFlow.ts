import type { Order, OrderLine } from "../types";
import { validateLineQuantity } from "./quantityRules";

/** API / localStorage sometimes stores 0/1 or "true"/"false" strings; `Boolean("false")` would be wrong. */
function orderFlagIsOn(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  }
  return Boolean(v);
}

export function hasPurchaseInvoice(order: Order): boolean {
  return orderFlagIsOn(order.purchaseInvoiceGenerated);
}

export function hasBillingInvoice(order: Order): boolean {
  return orderFlagIsOn(order.billingInvoiceGenerated);
}

/** True when every line has valid weight-or-pieces quantity (same rules as user submit / challan). */
export function linesReadyForChallan(lines: OrderLine[]): boolean {
  if (lines.length === 0) return false;
  return lines.every((line) => validateLineQuantity(line.kg, line.gram, line.piece) === null);
}

/** Same weight/piece rules as OrderLinesEditor (supports comma decimals). */
export function computePurchaseLineTotal(line: OrderLine, unit: number): number {
  const kg = parseFloat(String(line.kg).replace(",", ".")) || 0;
  const g = (parseFloat(String(line.gram).replace(",", ".")) || 0) / 1000;
  const pc = parseFloat(String(line.piece).replace(",", ".")) || 0;
  if (pc > 0) return Math.round(unit * pc * 100) / 100;
  return Math.round(unit * (kg + g) * 100) / 100;
}

/**
 * True when a purchase invoice may be generated: every line has valid quantities and a supplier
 * cost (unit price) &gt; 0 with a positive line total (uses stored lineTotal when set, else qty × unit).
 */
export function linesReadyForPurchaseInvoice(lines: OrderLine[]): boolean {
  if (lines.length === 0) return false;
  return lines.every((line) => {
    if (validateLineQuantity(line.kg, line.gram, line.piece) != null) return false;
    const unit = Number(line.unitPrice);
    if (!Number.isFinite(unit) || unit <= 0) return false;
    const explicit = line.lineTotal;
    const computed = computePurchaseLineTotal(line, unit);
    const effective =
      explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) > 0
        ? Number(explicit)
        : computed;
    return effective > 0;
  });
}

/** Parse in-progress cost unit input (same rules as OrderLinesEditor cost drafts). */
function parseCostUnitDraft(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const t = raw.trim().replace(",", ".");
  if (t === "" || t === ".") return null;
  const u = parseFloat(t);
  return Number.isFinite(u) && u >= 0 ? u : null;
}

/**
 * Like {@link linesReadyForPurchaseInvoice} but treats in-editor cost unit drafts as committed
 * so workflow buttons can enable while the moderator types before blur.
 * When a line has an active draft key, stored `lineTotal` is ignored (it can be stale vs the draft unit).
 */
export function linesReadyForPurchaseInvoiceWithCostDrafts(
  lines: OrderLine[],
  costUnitDrafts: Record<string, string>,
): boolean {
  if (lines.length === 0) return false;
  return lines.every((line) => {
    if (validateLineQuantity(line.kg, line.gram, line.piece) != null) return false;
    const hasDraft = Object.prototype.hasOwnProperty.call(costUnitDrafts, line.id);
    if (hasDraft) {
      const parsed = parseCostUnitDraft(costUnitDrafts[line.id]);
      if (parsed === null || parsed <= 0) return false;
      const effective = computePurchaseLineTotal(line, parsed);
      return effective > 0;
    }
    const unit = Number(line.unitPrice);
    if (!Number.isFinite(unit) || unit <= 0) return false;
    const explicit = line.lineTotal;
    const computed = computePurchaseLineTotal(line, unit);
    const effective =
      explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) > 0
        ? Number(explicit)
        : computed;
    return effective > 0;
  });
}

export function computeBillingTotalsFromCategoryMarkup(
  order: Order,
  categoryMarkups: Record<string, number>,
): { purchaseSubtotal: number; billingSubtotal: number; grandTotal: number } {
  const purchaseSubtotal = order.lines.reduce((sum, line) => sum + Number(line.lineTotal ?? 0), 0);
  const billingSubtotal = order.lines.reduce((sum, line) => {
    const purchaseLine = Number(line.lineTotal ?? 0);
    const pct = Number(categoryMarkups[line.categoryId] ?? 0);
    const billedLine = purchaseLine + Math.round(purchaseLine * (pct / 100));
    return sum + billedLine;
  }, 0);
  return { purchaseSubtotal, billingSubtotal, grandTotal: billingSubtotal };
}
