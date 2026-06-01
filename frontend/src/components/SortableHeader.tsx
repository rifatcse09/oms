import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

export type SortDir = "asc" | "desc";

type Props = {
  label: string;
  field: string;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (field: string) => void;
  className?: string;
};

export function SortableHeader({ label, field, sortKey, sortDir, onSort, className }: Props) {
  const active = sortKey === field;
  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground ${active ? "text-foreground" : ""} ${className ?? ""}`}
    >
      {label}
      <Icon className="h-3.5 w-3.5 shrink-0" />
    </button>
  );
}

/** Toggle sort: same field → flip dir; new field → asc. */
export function nextSort(
  current: { key: string | null; dir: SortDir },
  field: string,
): { key: string; dir: SortDir } {
  if (current.key === field) {
    return { key: field, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key: field, dir: "asc" };
}

/** Generic string/number/date comparator. */
export function sortRows<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const av = a[key] ?? "";
    const bv = b[key] ?? "";
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return dir === "asc" ? cmp : -cmp;
  });
}
