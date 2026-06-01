import { cn } from "@/lib/utils";

/** Add to the table scroll wrapper with `table-scroll` so row actions respond to table width. */
export function tableActionsContainerClass(className?: string) {
  return cn("@container", className);
}

/** ~3 icon controls — show inline from @xl (36rem) container width. */
export function tableActionsWideUserRow(className?: string) {
  return cn("hidden items-center justify-end gap-1 @xl:flex", className);
}

export function tableActionsTightUserRow(className?: string) {
  return cn("flex justify-end @xl:hidden", className);
}

/** Two icon controls — show inline from @lg (32rem). */
export function tableActionsWideAccountRow(className?: string) {
  return cn("hidden items-center justify-end gap-1 @lg:flex", className);
}

export function tableActionsTightAccountRow(className?: string) {
  return cn("flex justify-end @lg:hidden", className);
}

/** Single primary control — show icon from @md (28rem). */
export function tableActionsWideSingle(className?: string) {
  return cn("hidden items-center justify-end @md:flex", className);
}

export function tableActionsTightSingle(className?: string) {
  return cn("flex justify-end @md:hidden", className);
}
