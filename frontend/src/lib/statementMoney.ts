/** Round to 2 decimals (paisa) for statement math. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Balance = due − paid (exact paisa; fractions count). */
export function statementBalanceDue(totalDue: number, paid: number): number {
  const due = roundMoney(totalDue);
  const p = roundMoney(Math.max(0, paid));
  return Math.max(0, roundMoney(due - p));
}

export function statementPaymentStatus(
  totalDue: number,
  paid: number,
): "Paid" | "Partial" | "Unpaid" {
  const p = roundMoney(Math.max(0, paid));
  if (p <= 0) return "Unpaid";
  if (statementBalanceDue(totalDue, paid) <= 0) return "Paid";
  return "Partial";
}

/** Format ৳ for statement UI (whole taka; balance already cleared of sub-1 fractions). */
export function formatStatementTaka(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Same rule as Pending bills / Outstanding bills — whole taka per invoice. */
export function pendingBillRemainingTaka(cap: number, netPaid: number): number {
  return Math.max(0, Math.round(cap) - Math.round(netPaid));
}

/** Sum billing invoice amounts in whole taka (avoids 142204 vs 142203 drift from decimals). */
export function billingInvoiceAmountTaka(amount: number): number {
  return Math.round(Number(amount) || 0);
}

/** Per-order balance (exact paisa) — same math as pending bills & statement per-order rows. */
export function orderInvoiceRemainingExact(cap: number, netPaid: number): number {
  return Math.max(0, roundMoney(cap) - roundMoney(netPaid));
}

/** After save: cumulative total paid (current + pay now), clamped to [0, cap] (2 decimal paisa). */
export function previewPaidAfterPayNow(
  cap: number,
  currentPaid: number,
  payNowRaw: string,
): number | null {
  const t = payNowRaw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const capR = roundMoney(cap);
  const curR = roundMoney(currentPaid);
  return roundMoney(Math.min(capR, Math.max(0, curR + n)));
}

/** Show paisa when needed (payment history); otherwise whole taka. */
export function formatStatementAmount(n: number): string {
  const r = roundMoney(n);
  if (Math.abs(r - Math.round(r)) < 0.005) {
    return Math.round(r).toLocaleString("en-US");
  }
  return r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type StatementDisplayAmounts = {
  totalDue: number;
  paid: number;
  balance: number;
  /** Cycle bucket: payments − adjustments (exact). */
  paidRaw: number;
  /** Row total due from invoices + carry-over (may include decimals). */
  dueRaw: number;
  /** dueRaw − paidRaw − balance (rounding / carry-over drift). */
  roundingGap: number;
};

/**
 * Statement row totals (exact paisa). When fully settled, Total due = Paid and Balance = 0.
 */
export function reconcileStatementDisplay(
  dueExact: number,
  paidExact: number,
  fullySettled: boolean,
): StatementDisplayAmounts {
  const dueR = roundMoney(dueExact);
  const paidR = roundMoney(Math.max(0, paidExact));
  let balance = statementBalanceDue(dueR, paidR);

  if (fullySettled || balance < 0.01) {
    const settledAmount = paidR > 0 ? paidR : dueR;
    return {
      totalDue: settledAmount,
      paid: settledAmount,
      balance: 0,
      paidRaw: paidR,
      dueRaw: dueR,
      roundingGap: roundMoney(dueR - paidR),
    };
  }

  return {
    totalDue: dueR,
    paid: paidR,
    balance,
    paidRaw: paidR,
    dueRaw: dueR,
    roundingGap: roundMoney(dueR - paidR - balance),
  };
}
