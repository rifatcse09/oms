import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function PaginationControls({
  totalItems,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
}: {
  totalItems: number;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pages = compactPages(safePage, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3 text-xs text-muted-foreground sm:px-4">
      <div className="flex items-center gap-2">
        <span>Rows</span>
        <Select
          value={String(perPage)}
          onValueChange={(v) => onPerPageChange(parseInt(v, 10))}
        >
          <SelectTrigger className="h-8 w-[4.5rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5</SelectItem>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {pages.map((p, idx) =>
          p === "..." ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={p}
              type="button"
              variant={p === safePage ? "default" : "outline"}
              size="sm"
              className={cn("h-8 min-w-8 px-2", p === safePage && "pointer-events-none")}
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <span className="ml-2">Go to</span>
        <Input
          type="number"
          min={1}
          max={totalPages}
          defaultValue={safePage}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
            if (Number.isFinite(v)) onPageChange(Math.min(totalPages, Math.max(1, v)));
          }}
          className="h-8 w-14 text-xs"
        />
        <span>
          / {totalPages} ({totalItems})
        </span>
      </div>
    </div>
  );
}

function compactPages(current: number, total: number): Array<number | "..."> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  const nums = Array.from(set).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | "..."> = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push("...");
    out.push(nums[i]);
  }
  return out;
}
