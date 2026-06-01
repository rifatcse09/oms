/**
 * Standard styles for links/buttons inside `<td>` cells.
 * Uses an explicit surface so labels stay readable on tinted rows (e.g. overdue `bg-red-50`)
 * and avoids relying on `bg-primary` + `text-white` in table contexts.
 */
export const TABLE_ACTION_CLASS =
  "relative z-[1] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800";

export const TABLE_ACTION_CLASS_COMPACT =
  "relative z-[1] inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800";
