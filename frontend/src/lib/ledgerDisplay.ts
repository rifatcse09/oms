/** Which sub-ledger a row belongs to (matches `entry_type` prefix in API). */
export type LedgerBook = "purchase" | "billing" | "other";

export function ledgerBookFromEntryType(entryType: string): LedgerBook {
  const t = entryType.toLowerCase();
  if (t.startsWith("purchase_")) return "purchase";
  if (t.startsWith("billing_")) return "billing";
  return "other";
}

/** Short label for table + tooltips (aligned with backend `add_ledger` types). */
export function humanLedgerEntryType(entryType: string): string {
  const map: Record<string, string> = {
    purchase_invoice: "Purchase invoice",
    purchase_payment: "Purchase payment",
    purchase_adjustment: "Purchase adjustment",
    billing_invoice: "Billing invoice",
    billing_payment: "Billing payment",
    billing_adjustment: "Billing adjustment",
  };
  return map[entryType] ?? entryType.replaceAll("_", " ");
}

export function ledgerBookLabel(book: LedgerBook): string {
  if (book === "purchase") return "Supplier (purchase)";
  if (book === "billing") return "Customer (billing)";
  return "Other";
}
