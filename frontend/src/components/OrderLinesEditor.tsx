import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { CategoryDef, OrderLine } from "../types";
import { billedAmountsForLine } from "../lib/billingLineAmounts";
import { formatDecimalEn } from "../lib/banglaNumerals";
import { roundMarkupPercent, roundMoneyTwoDecimals } from "../lib/markupPercentInput";
import {
  computePurchaseLineTotal,
  linesReadyForPurchaseInvoice,
  linesReadyForPurchaseInvoiceWithCostDrafts,
} from "../lib/invoiceFlow";
import { COL, UNKNOWN_CATEGORY_LABEL, UNKNOWN_ITEM_LABEL } from "../lib/uiLabels";

export type OrderLinesEditorHandle = {
  /**
   * Commits in-progress cost unit drafts into the line list, clears those drafts, and calls `onChange`.
   * Use before saving / generating purchase invoice so the server receives typed-but-not-blurred costs.
   */
  mergeCostUnitDraftsIntoLines: () => OrderLine[];
};

export type OrderLinesEditorProps = {
  lines: OrderLine[];
  onChange: (next: OrderLine[]) => void;
  categories: CategoryDef[];
  showPricing?: boolean;
  largeText?: boolean;
  billingMarkupsByCategory?: Record<string, number>;
  billingMarkupPreview?: boolean;
  globalBillingMarkupPercent?: number;
  linesLocked?: boolean;
  quantityLocked?: boolean;
  pricingLocked?: boolean;
  markupLocked?: boolean;
  onPurchaseLinesReadyChange?: (ready: boolean) => void;
};

export const OrderLinesEditor = forwardRef<OrderLinesEditorHandle, OrderLinesEditorProps>(
  function OrderLinesEditor(
    {
      lines,
      onChange,
      categories,
      showPricing = false,
      largeText = false,
      billingMarkupsByCategory,
      billingMarkupPreview = false,
      globalBillingMarkupPercent = 0,
      linesLocked = false,
      quantityLocked: quantityLockedProp,
      pricingLocked: pricingLockedProp,
      markupLocked,
      onPurchaseLinesReadyChange,
    },
    ref,
  ) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const billingCategoryMap = billingMarkupsByCategory ?? {};
  const showMarkupCols = Boolean(
    showPricing && (billingMarkupPreview || billingMarkupsByCategory != null),
  );
  const lockAll = Boolean(linesLocked);
  const quantityLocked = lockAll || Boolean(quantityLockedProp);
  const pricingLocked = lockAll || Boolean(pricingLockedProp);
  /**
   * Admin billing preview: never infer markup lock from cost lock (purchase invoice locks cost, not markup).
   * Pass markupLocked explicitly to freeze % after billing if needed.
   */
  const markupLockedEffective =
    lockAll ||
    (markupLocked !== undefined
      ? Boolean(markupLocked)
      : showMarkupCols
        ? false
        : pricingLocked);

  /** Lets users type fractional cost units (e.g. `12.55`) without controlled-number stripping mid-edit. */
  const [costUnitDrafts, setCostUnitDrafts] = useState<Record<string, string>>({});
  /** Same for markup % (e.g. `7.25` or `7.` while typing). */
  const [markupDrafts, setMarkupDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = new Set(lines.map((l) => l.id));
    setCostUnitDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setMarkupDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [lines]);

  useEffect(() => {
    if (pricingLocked) setCostUnitDrafts({});
  }, [pricingLocked]);

  useEffect(() => {
    if (markupLockedEffective) setMarkupDrafts({});
  }, [markupLockedEffective]);

  useLayoutEffect(() => {
    if (!onPurchaseLinesReadyChange || !showPricing) return;
    if (pricingLocked) {
      onPurchaseLinesReadyChange(linesReadyForPurchaseInvoice(lines));
      return;
    }
    onPurchaseLinesReadyChange(linesReadyForPurchaseInvoiceWithCostDrafts(lines, costUnitDrafts));
  }, [lines, costUnitDrafts, pricingLocked, showPricing, onPurchaseLinesReadyChange]);

  useImperativeHandle(ref, () => ({
    mergeCostUnitDraftsIntoLines: () => {
      if (pricingLocked || lockAll) return lines;
      const idsWithDraft = Object.keys(costUnitDrafts);
      if (idsWithDraft.length === 0) return lines;

      const snapshot = { ...costUnitDrafts };
      const merged = lines.map((line) => {
        if (!Object.prototype.hasOwnProperty.call(snapshot, line.id)) return line;
        const raw = (snapshot[line.id] ?? "").trim().replace(",", ".");
        if (raw === "" || raw === ".") {
          return { ...line, unitPrice: undefined, lineTotal: undefined };
        }
        const unit = parseFloat(raw);
        if (!Number.isFinite(unit) || unit < 0) return line;
        const unitRounded = roundMoneyTwoDecimals(unit);
        return { ...line, unitPrice: unitRounded, lineTotal: computePurchaseLineTotal(line, unitRounded) };
      });

      setCostUnitDrafts((prev) => {
        const next = { ...prev };
        for (const id of idsWithDraft) delete next[id];
        return next;
      });
      onChange(merged);
      return merged;
    },
  }), [lines, costUnitDrafts, pricingLocked, lockAll, onChange]);

  const costUnitInputValue = (line: OrderLine) =>
    costUnitDrafts[line.id] !== undefined
      ? costUnitDrafts[line.id]!
      : line.unitPrice == null
        ? ""
        : String(line.unitPrice);

  const draftParsedCostUnit = (lineId: string): number | null => {
    const raw = costUnitDrafts[lineId];
    if (raw === undefined) return null;
    const t = raw.trim().replace(",", ".");
    if (t === "" || t === ".") return null;
    const u = parseFloat(t);
    return Number.isFinite(u) && u >= 0 ? u : null;
  };

  const draftParsedMarkupPercent = (lineId: string): number | null => {
    const raw = markupDrafts[lineId];
    if (raw === undefined) return null;
    const t = raw.trim().replace(",", ".");
    if (t === "" || t === ".") return null;
    const n = parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const markupInputDisplayValue = (line: OrderLine) => {
    if (markupDrafts[line.id] !== undefined) return markupDrafts[line.id]!;
    const has =
      line.markupPercent !== undefined &&
      line.markupPercent !== null &&
      Number.isFinite(Number(line.markupPercent));
    return has ? String(line.markupPercent) : "";
  };

  const update = (id: string, patch: Partial<OrderLine>) => {
    if (lockAll) return;
    if (
      quantityLocked &&
      ("kg" in patch || "gram" in patch || "piece" in patch || "instructions" in patch)
    ) {
      return;
    }
    if (markupLockedEffective && "markupPercent" in patch) return;
    if (pricingLocked && ("unitPrice" in patch || "lineTotal" in patch)) return;
    onChange(
      lines.map((l) => {
        if (l.id !== id) return l;
        const merged = { ...l, ...patch };
        if (showPricing) {
          if (merged.unitPrice != null && merged.unitPrice > 0) {
            merged.lineTotal = computePurchaseLineTotal(merged, merged.unitPrice);
          } else {
            merged.lineTotal = undefined;
          }
        }
        return merged;
      }),
    );
  };

  const remove = (id: string) => {
    if (pricingLocked) return;
    onChange(lines.filter((l) => l.id !== id).map((l, i) => ({ ...l, serial: i + 1 })));
  };

  const commitCostUnitDraft = (lineId: string) => {
    if (pricingLocked) return;
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    const raw = (costUnitDrafts[lineId] ?? "").trim().replace(",", ".");
    setCostUnitDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    if (raw === "" || raw === ".") {
      update(lineId, { unitPrice: undefined, lineTotal: undefined });
      return;
    }
    const unit = parseFloat(raw);
    if (!Number.isFinite(unit) || unit < 0) return;
    const unitRounded = roundMoneyTwoDecimals(unit);
    const total = computePurchaseLineTotal(line, unitRounded);
    update(lineId, { unitPrice: unitRounded, lineTotal: total });
  };

  const commitMarkupDraft = (lineId: string) => {
    if (markupLockedEffective) return;
    const raw = (markupDrafts[lineId] ?? "").trim().replace(",", ".");
    setMarkupDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    if (raw === "" || raw === ".") {
      update(lineId, { markupPercent: undefined });
      return;
    }
    const pct = parseFloat(raw);
    if (!Number.isFinite(pct) || pct < 0) return;
    update(lineId, { markupPercent: roundMarkupPercent(pct) });
  };

  return (
    <div
      className={`table-scroll rounded-2xl border shadow-card ${
        showPricing
          ? "border-border bg-muted"
          : "border-slate-200 bg-white"
      }`}
    >
      <table
        className={`min-w-[720px] w-full border-collapse ${
          showPricing ? "text-base" : largeText ? "text-base" : "text-sm"
        }`}
      >
        <thead>
          <tr
            className={`text-left font-semibold uppercase tracking-wide ${
              showPricing ? "bg-muted text-foreground" : "bg-slate-50 text-slate-500"
            } ${
              showPricing || largeText ? "text-sm" : "text-xs"
            }`}
          >
            <th className="px-3 py-3 normal-case">{COL.serial}</th>
            <th className="px-3 py-3 normal-case">{COL.category}</th>
            <th className="px-3 py-3 normal-case">{COL.item}</th>
            <th className="px-3 py-3 normal-case">{COL.kg}</th>
            <th className="px-3 py-3 normal-case">{COL.gram}</th>
            <th className="px-3 py-3 normal-case">{COL.piece}</th>
            <th className="px-3 py-3 normal-case">Instructions</th>
            {showPricing ? (
              <>
                <th className="px-3 py-3 text-right normal-case">Cost unit (required)</th>
                <th className="px-3 py-3 text-right normal-case">{COL.lineTotal}</th>
                {showMarkupCols ? (
                  <>
                    <th className="px-3 py-3 text-right normal-case">Markup %</th>
                    <th className="px-3 py-3 text-right normal-case">After markup unit</th>
                    <th className="px-3 py-3 text-right normal-case">After markup total</th>
                  </>
                ) : null}
              </>
            ) : null}
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const cat = catMap.get(line.categoryId);
            const markupPctFromCat = Number(
              billingCategoryMap[line.categoryId] ?? globalBillingMarkupPercent,
            );
            const draftCostU = draftParsedCostUnit(line.id);
            const draftMu = draftParsedMarkupPercent(line.id);
            let lineForBilling: OrderLine = { ...line };
            if (draftCostU != null) {
              lineForBilling = {
                ...lineForBilling,
                unitPrice: draftCostU,
                lineTotal: computePurchaseLineTotal(line, draftCostU),
              };
            }
            if (draftMu !== null) {
              lineForBilling = { ...lineForBilling, markupPercent: draftMu };
            }
            const billingPreviewLive = Boolean(showMarkupCols && !markupLockedEffective);
            const { billedUnit: billingUnit, billedLine: billingLineTotal, pct: effectiveMarkupPct } =
              showMarkupCols
                ? billedAmountsForLine(lineForBilling, billingCategoryMap, globalBillingMarkupPercent, {
                    ignorePersistedBilling: billingPreviewLive,
                  })
                : { billedUnit: null as number | null, billedLine: null as number | null, pct: 0 };
            const lineMarkupOverride =
              line.markupPercent !== undefined &&
              line.markupPercent !== null &&
              Number.isFinite(Number(line.markupPercent));
            const markupPlaceholder = Number.isFinite(markupPctFromCat)
              ? formatDecimalEn(markupPctFromCat, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
              : "—";
            const markupTitle = Number.isFinite(markupPctFromCat)
              ? `Category default ${formatDecimalEn(markupPctFromCat, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}% (editable)`
              : "Markup %";
            const markupPctInvoiceStyle = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
            const markupValueLocked = markupLockedEffective
              ? lineMarkupOverride
                ? formatDecimalEn(Number(line.markupPercent), markupPctInvoiceStyle)
                : formatDecimalEn(effectiveMarkupPct, markupPctInvoiceStyle)
              : null;
            return (
              <tr key={line.id} className={`${showPricing ? "border-t border-border bg-card" : "border-t border-slate-100"} align-top`}>
                <td className={`px-3 py-2 font-mono text-slate-600 ${largeText ? "text-base" : "text-sm"}`}>
                  {line.serial}
                </td>
                <td className={`px-3 py-2 text-slate-800 ${largeText ? "text-base" : "text-sm"}`}>
                  {cat ? (
                    <>
                      <span className="font-medium">{cat.nameEn}</span>
                      <span className={`mt-0.5 block font-bn text-slate-500 ${largeText ? "text-sm" : "text-xs"}`}>
                        {cat.nameBn}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{UNKNOWN_CATEGORY_LABEL}</span>
                  )}
                </td>
                <td className={`px-3 py-2 ${largeText ? "text-base" : "text-sm"}`}>
                  {!String(line.itemNameEn ?? "").trim() && !String(line.itemNameBn ?? "").trim() ? (
                    <span className="text-muted-foreground">{UNKNOWN_ITEM_LABEL}</span>
                  ) : (
                    <>
                      <div className="font-medium">
                        {String(line.itemNameEn ?? "").trim() || String(line.itemNameBn ?? "").trim()}
                      </div>
                      <div className={`font-bn text-slate-600 ${largeText ? "text-sm" : "text-xs"}`}>
                        {String(line.itemNameBn ?? "").trim() || "—"}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    readOnly={quantityLocked}
                    disabled={quantityLocked}
                    className={`w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 disabled:cursor-not-allowed disabled:bg-slate-100 ${largeText ? "text-base" : "text-sm"}`}
                    value={line.kg}
                    onChange={(e) => {
                      const kg = e.target.value;
                      const hasWeight = (parseFloat(kg) || 0) > 0 || (parseFloat(line.gram) || 0) > 0;
                      update(line.id, { kg, piece: hasWeight ? "" : line.piece });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    readOnly={quantityLocked}
                    disabled={quantityLocked}
                    className={`w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 disabled:cursor-not-allowed disabled:bg-slate-100 ${largeText ? "text-base" : "text-sm"}`}
                    value={line.gram}
                    onChange={(e) => {
                      const gram = e.target.value;
                      const hasWeight = (parseFloat(line.kg) || 0) > 0 || (parseFloat(gram) || 0) > 0;
                      update(line.id, { gram, piece: hasWeight ? "" : line.piece });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    readOnly={quantityLocked}
                    disabled={quantityLocked}
                    className={`w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 disabled:cursor-not-allowed disabled:bg-slate-100 ${largeText ? "text-base" : "text-sm"}`}
                    value={line.piece}
                    onChange={(e) => {
                      const piece = e.target.value;
                      const hasPiece = (parseFloat(piece) || 0) > 0;
                      update(line.id, { piece, kg: hasPiece ? "" : line.kg, gram: hasPiece ? "" : line.gram });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    readOnly={quantityLocked}
                    disabled={quantityLocked}
                    className={`w-52 rounded-lg border border-slate-200 bg-white px-2 py-1.5 disabled:cursor-not-allowed disabled:bg-slate-100 ${largeText ? "text-base" : "text-sm"}`}
                    value={line.instructions ?? ""}
                    onChange={(e) => update(line.id, { instructions: e.target.value })}
                    placeholder="Particulars / instructions"
                  />
                </td>
                {showPricing ? (
                  <>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        readOnly={pricingLocked}
                        disabled={pricingLocked}
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-700"
                        value={costUnitInputValue(line)}
                        placeholder="0"
                        onChange={(e) => {
                          if (pricingLocked) return;
                          setCostUnitDrafts((prev) => ({ ...prev, [line.id]: e.target.value }));
                        }}
                        onBlur={() => {
                          commitCostUnitDraft(line.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-medium tabular-nums">
                      {(() => {
                        const draftU = draftParsedCostUnit(line.id);
                        const total =
                          draftU != null ? computePurchaseLineTotal(line, draftU) : line.lineTotal;
                        return total != null
                          ? formatDecimalEn(total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : "—";
                      })()}
                    </td>
                    {showMarkupCols ? (
                      <>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label="Markup percent for this line"
                            readOnly={markupLockedEffective}
                            disabled={markupLockedEffective}
                            className={`pointer-events-auto w-28 rounded-lg border px-2 py-1.5 text-right text-sm tabular-nums outline-none transition-colors ${
                              markupLockedEffective
                                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-600"
                                : "cursor-text border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-500 hover:border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/25"
                            }`}
                            value={markupValueLocked ?? markupInputDisplayValue(line)}
                            placeholder={markupPlaceholder}
                            title={markupTitle}
                            onChange={(e) => {
                              if (markupLockedEffective) return;
                              setMarkupDrafts((prev) => ({ ...prev, [line.id]: e.target.value }));
                            }}
                            onBlur={() => {
                              commitMarkupDraft(line.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-blue-700">
                          {billingUnit != null
                            ? formatDecimalEn(billingUnit, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-blue-700">
                          {billingLineTotal != null
                            ? formatDecimalEn(billingLineTotal, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </td>
                      </>
                    ) : null}
                  </>
                ) : null}
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => remove(line.id)}
                    disabled={pricingLocked}
                    className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                    title="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

