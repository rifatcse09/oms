const CATEGORY_BASE_COLORS: Record<string, string> = {
  fresh: "#2563EB",
  pantry: "#FF5C35",
  dry: "#10B981",
  meat: "#F59E0B",
  household: "#64748B",
  spice: "#4F67D7",
};

const CATEGORY_DYNAMIC_COLORS = [
  "#0F766E",
  "#7C3AED",
  "#DB2777",
  "#EA580C",
  "#0891B2",
  "#65A30D",
  "#CA8A04",
  "#6D28D9",
  "#BE123C",
  "#475569",
];

/** Returns a stable color for a category id/code. */
export function getCategoryColor(categoryId: string): string {
  const normalized = categoryId.trim().toLowerCase();
  if (!normalized) return "#64748B";
  if (CATEGORY_BASE_COLORS[normalized]) return CATEGORY_BASE_COLORS[normalized];
  const hash = normalized.split("").reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0);
  const idx = Math.abs(hash) % CATEGORY_DYNAMIC_COLORS.length;
  return CATEGORY_DYNAMIC_COLORS[idx];
}
