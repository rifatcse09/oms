import { useId, useMemo } from "react";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { hashTrend, sparkPoints } from "@/lib/metricSparkline";

export type MetricCardTone = "coral" | "teal" | "navy" | "amber" | "rose" | "slate";

const TONE_STYLES: Record<
  MetricCardTone,
  { iconWrap: string; stroke: string; fillTop: string; fillBottom: string }
> = {
  coral: {
    iconWrap: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300",
    stroke: "#ea580c",
    fillTop: "#ffedd5",
    fillBottom: "#ffffff",
  },
  teal: {
    iconWrap: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
    stroke: "#0d9488",
    fillTop: "#ccfbf1",
    fillBottom: "#ffffff",
  },
  navy: {
    iconWrap: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    stroke: "#1d4ed8",
    fillTop: "#dbeafe",
    fillBottom: "#ffffff",
  },
  amber: {
    iconWrap: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    stroke: "#d97706",
    fillTop: "#fef3c7",
    fillBottom: "#ffffff",
  },
  rose: {
    iconWrap: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    stroke: "#e11d48",
    fillTop: "#ffe4e6",
    fillBottom: "#ffffff",
  },
  slate: {
    iconWrap: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    stroke: "#475569",
    fillTop: "#e2e8f0",
    fillBottom: "#ffffff",
  },
};

type StatMetricCardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  tone: MetricCardTone;
  /** If omitted, derived from `sparkSeed` via `hashTrend`. */
  trendPercent?: number;
  trendSuffix?: string;
  /** Used for deterministic sparkline + default trend when `trendPercent` omitted. */
  sparkSeed: string;
  secondaryLine?: string;
  compact?: boolean;
  /** When false, hides the arrow/% row (e.g. KPI is already a % headline). */
  showTrendRow?: boolean;
  /** Muted line under the headline when `showTrendRow` is false. */
  caption?: string;
};

export function StatMetricCard({
  title,
  value,
  icon: Icon,
  tone,
  trendPercent: trendProp,
  trendSuffix = "vs last month",
  sparkSeed,
  secondaryLine,
  compact,
  showTrendRow = true,
  caption,
}: StatMetricCardProps) {
  const uid = useId().replace(/:/g, "");
  const trend = trendProp ?? hashTrend(sparkSeed);
  const data = useMemo(() => sparkPoints(sparkSeed, compact ? 10 : 12), [sparkSeed, compact]);
  const t = TONE_STYLES[tone];
  const gradId = `spark-fill-${uid}`;

  const up = trend >= 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-zinc-950",
        compact ? "p-4" : "p-5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p
            className={cn(
              "mt-1 font-bold tracking-tight text-slate-900 dark:text-white",
              compact ? "text-2xl" : "text-3xl",
            )}
          >
            {value}
          </p>
          {showTrendRow ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
              {up ? (
                <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
              )}
              <span
                className={cn(
                  "font-semibold",
                  up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                )}
              >
                {up ? "+" : ""}
                {trend.toFixed(1)}%
              </span>
              <span className="text-slate-400 dark:text-slate-500">{trendSuffix}</span>
            </p>
          ) : caption ? (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{caption}</p>
          ) : null}
          {secondaryLine ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{secondaryLine}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            t.iconWrap,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>

      <div className={cn("pointer-events-none relative -mx-5 mt-4 select-none", compact ? "-mb-4 h-10" : "-mb-5 h-14")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.fillTop} />
                <stop offset="100%" stopColor={t.fillBottom} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={t.stroke}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
