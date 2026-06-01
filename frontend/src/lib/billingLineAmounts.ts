import type { OrderLine } from "../types";

/**
 * Customer billing row: use persisted after-markup from DB when present,
 * otherwise purchase cost + category/global markup % (same as admin pricing table).
 *
 * @param opts.ignorePersistedBilling — When true (e.g. admin order line editor while markup is editable),
 *   always derive unit/total from purchase cost × markup so changing markup % updates both columns together.
 */
export function billedAmountsForLine(
  line: OrderLine,
  billingCategoryMarkups: Record<string, number>,
  globalMarkupPercent: number,
  opts?: { ignorePersistedBilling?: boolean },
): { billedUnit: number; billedLine: number; pct: number } {
  const linePctRaw = line.markupPercent;
  const hasLinePct = linePctRaw != null && Number.isFinite(Number(linePctRaw));
  const linePct = hasLinePct ? Math.max(0, Number(linePctRaw)) : null;
  const fallbackPct = Number(
    billingCategoryMarkups[line.categoryId] ?? globalMarkupPercent ?? 0,
  );
  const pct = linePct ?? fallbackPct;

  const storedLine = line.lineTotalAfterMarkup;
  const usePersisted =
    !opts?.ignorePersistedBilling && storedLine != null && Number.isFinite(Number(storedLine));
  if (usePersisted) {
    const billedLine = Number(storedLine);
    const storedUnit = line.unitPriceAfterMarkup;
    const billedUnit =
      storedUnit != null && Number.isFinite(Number(storedUnit))
        ? Number(storedUnit)
        : (() => {
            const pu = Number(line.unitPrice ?? 0);
            return pu + Math.round(pu * (pct / 100));
          })();
    return { billedUnit, billedLine, pct };
  }

  const purchaseUnit = Number(line.unitPrice ?? 0);
  const purchaseLine = Number(line.lineTotal ?? 0);
  return {
    billedUnit: purchaseUnit + Math.round(purchaseUnit * (pct / 100)),
    billedLine: purchaseLine + Math.round(purchaseLine * (pct / 100)),
    pct,
  };
}
