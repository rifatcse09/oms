const KEY = "gom_category_markup_settings";
const HISTORY_KEY = "gom_category_markup_history";

export type CategoryMarkupSettings = Record<string, number>;
export interface CategoryMarkupHistoryEntry {
  id: string;
  categoryId: string;
  previousPercent: number;
  nextPercent: number;
  changedAtIso: string;
}

export function loadCategoryMarkupSettings(): CategoryMarkupSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cleaned: CategoryMarkupSettings = {};
    Object.entries(parsed).forEach(([categoryId, value]) => {
      const pct = Number(value);
      if (Number.isFinite(pct) && pct >= 0) {
        cleaned[categoryId] = pct;
      }
    });
    return cleaned;
  } catch {
    return {};
  }
}

export function saveCategoryMarkupSettings(settings: CategoryMarkupSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function loadCategoryMarkupHistory(): CategoryMarkupHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CategoryMarkupHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) =>
        typeof x?.id === "string" &&
        typeof x?.categoryId === "string" &&
        Number.isFinite(Number(x?.previousPercent)) &&
        Number.isFinite(Number(x?.nextPercent)) &&
        typeof x?.changedAtIso === "string",
    );
  } catch {
    return [];
  }
}

export function appendCategoryMarkupHistory(
  entry: Omit<CategoryMarkupHistoryEntry, "id" | "changedAtIso">,
) {
  const prev = loadCategoryMarkupHistory();
  const next: CategoryMarkupHistoryEntry[] = [
    {
      id: crypto.randomUUID(),
      categoryId: entry.categoryId,
      previousPercent: entry.previousPercent,
      nextPercent: entry.nextPercent,
      changedAtIso: new Date().toISOString(),
    },
    ...prev,
  ].slice(0, 300);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}
