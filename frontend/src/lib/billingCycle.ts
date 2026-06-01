/** Matches GET /api/v1/billing-cycle-config */
export type BillingCycleConfig = {
  cycleDays: 7 | 14;
  /** 0 = Sunday … 6 = Saturday (aligned with Date#getDay()) */
  weekStartDay: number;
  label: string;
};

export const DEFAULT_BILLING_CYCLE_CONFIG: BillingCycleConfig = {
  cycleDays: 7,
  weekStartDay: 0,
  label: "Weekly (Sunday - Saturday)",
};

export function parseBillingCycleConfig(raw: unknown): BillingCycleConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_BILLING_CYCLE_CONFIG;
  const o = raw as Record<string, unknown>;
  const cd = Number(o.cycleDays ?? o.cycle_days ?? 7);
  const cycleDays: 7 | 14 = cd === 14 ? 14 : 7;
  let weekStartDay = Number(o.weekStartDay ?? o.week_start_day ?? 0);
  if (!Number.isFinite(weekStartDay)) weekStartDay = 0;
  weekStartDay = Math.min(6, Math.max(0, Math.floor(weekStartDay)));
  const label =
    typeof o.label === "string" && o.label.trim() !== ""
      ? o.label.trim()
      : DEFAULT_BILLING_CYCLE_CONFIG.label;
  return { cycleDays, weekStartDay, label };
}

/** Start date (local midnight) of the billing period containing `date`. */
export function startOfCycle(date: Date, cycleDays: 7 | 14, weekStartDay: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const ws = ((weekStartDay % 7) + 7) % 7;

  if (cycleDays === 7) {
    const day = d.getDay();
    const daysSinceStart = (day - ws + 7) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - daysSinceStart);
    return start;
  }

  const weekAligned = startOfCycle(d, 7, ws);
  const anchor = new Date("2026-01-04T00:00:00");
  anchor.setHours(0, 0, 0, 0);
  const anchorWeekStart = startOfCycle(anchor, 7, ws);
  const diffDays = Math.floor((weekAligned.getTime() - anchorWeekStart.getTime()) / 86_400_000);
  const blockIndex = Math.floor(diffDays / 14);
  const start = new Date(anchorWeekStart);
  start.setDate(anchorWeekStart.getDate() + blockIndex * 14);
  return start;
}
