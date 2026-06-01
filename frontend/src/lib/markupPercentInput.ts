/** Align with DB `decimal(8,2)` for markup % fields. */
export const MARKUP_PERCENT_DECIMALS = 2;

export function roundMarkupPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** MARKUP_PERCENT_DECIMALS;
  return Math.round(Math.max(0, n) * f) / f;
}

/** Parse user text (comma or dot decimals). */
export function parseMarkupPercentInput(raw: string): number {
  const t = raw.trim().replace(",", ".");
  if (t === "" || t === ".") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMarkupPercent(n);
}

/** Display string for a stored markup % (trim trailing zeros). */
export function markupPercentToInputString(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  const r = roundMarkupPercent(n);
  if (r === 0) return "0";
  return String(r);
}

/** Purchase cost unit / line amounts (non-negative, 2 dp) — typical `decimal(12,2)` money fields. */
export function roundMoneyTwoDecimals(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = 100;
  return Math.round(Math.max(0, n) * f) / f;
}
