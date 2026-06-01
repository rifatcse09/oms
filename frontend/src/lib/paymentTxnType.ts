/**
 * Mirrors backend resolve_stored_payment_row_effective_type (GET /api/v1/payments).
 * Used when payment_type is null but note / invoice_type indicates purchase vs billing.
 */
export function resolvePaymentTxnEffectiveType(p: {
  payment_type?: "purchase" | "billing" | null;
  invoice_type?: "purchase" | "billing" | null;
  note?: string | null;
}): "purchase" | "billing" {
  const stored = p.payment_type;
  if (stored === "purchase" || stored === "billing") {
    return stored;
  }
  const n = (p.note ?? "").toLowerCase();
  if (n.includes("purchase statement payment")) {
    return "purchase";
  }
  if (n.includes("billing statement payment")) {
    return "billing";
  }
  const inv = p.invoice_type;
  if (inv === "purchase" || inv === "billing") {
    return inv;
  }
  return "billing";
}
