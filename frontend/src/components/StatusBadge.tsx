import type { OrderStatus } from "../types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const styles: Record<OrderStatus, string> = {
  draft: "border-transparent bg-slate-200 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100",
  submitted: "border-transparent bg-blue-600 text-white hover:bg-blue-600 dark:bg-blue-500 dark:text-white",
  under_review: "border-transparent bg-amber-500 text-amber-950 hover:bg-amber-500 dark:bg-amber-400 dark:text-amber-950",
  delivered: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:text-white",
  invoiced: "border-transparent bg-violet-600 text-white hover:bg-violet-600 dark:bg-violet-500 dark:text-white",
};

const labels: Record<OrderStatus, string> = {
  draft: "Drafted",
  submitted: "Ordered",
  under_review: "Processing",
  delivered: "Delivered",
  invoiced: "Completed (Invoice)",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={cn("gap-1 rounded-full px-2.5 py-0.5 font-medium", styles[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span>{labels[status]}</span>
    </Badge>
  );
}
