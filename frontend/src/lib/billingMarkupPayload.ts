import type { Order } from "../types";

/**
 * Effective billing % for each order line id to send as `markupByItem` when generating a billing invoice.
 * Precedence: explicit `line.markupPercent` → per-line overrides map (if set) → category map → global.
 */
export function buildMarkupByItemPayload(
  lines: Order["lines"],
  categoryMarkups: Record<string, number>,
  globalMarkupPercent: number,
  modalItemOverrides: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const globalSafe = Math.max(0, Number(globalMarkupPercent) || 0);
  for (const line of lines) {
    const lineId = String(line.id ?? "").trim();
    if (!lineId) continue;
    const catPct = Math.max(0, Number(categoryMarkups[line.categoryId] ?? globalSafe) || 0);
    const raw = line.markupPercent;
    const hasLineExplicit =
      raw !== undefined && raw !== null && Number.isFinite(Number(raw));
    if (hasLineExplicit) {
      out[lineId] = Math.max(0, Number(raw));
      continue;
    }
    if (
      Object.prototype.hasOwnProperty.call(modalItemOverrides, lineId) &&
      modalItemOverrides[lineId] !== undefined &&
      Number.isFinite(Number(modalItemOverrides[lineId]))
    ) {
      out[lineId] = Math.max(0, Number(modalItemOverrides[lineId]));
      continue;
    }
    out[lineId] = catPct;
  }
  return out;
}
