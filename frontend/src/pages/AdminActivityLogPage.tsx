import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiEnabled, apiListAdminActivityLogs, type ActivityLogEntry } from "../lib/api";
import { Button } from "@/components/ui/button";

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All actions" },
  { value: "challan_generated", label: "Challan generated" },
  { value: "purchase_invoice_generated", label: "Purchase invoice generated" },
  { value: "billing_invoice_generated", label: "Billing invoice generated" },
  { value: "order_marked_delivered", label: "Order marked delivered" },
];

function actionLabel(action: string): string {
  const f = ACTION_OPTIONS.find((o) => o.value === action);
  return f?.label ?? action.replace(/_/g, " ");
}

function orderLinkId(row: ActivityLogEntry): string | null {
  if (row.entityType === "order") return String(row.entityId);
  const oid = row.after?.orderId;
  if (typeof oid === "number") return String(oid);
  if (typeof oid === "string" && /^\d+$/.test(oid)) return oid;
  return null;
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AdminActivityLogPage() {
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [action, setAction] = useState("");
  const [rows, setRows] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!apiEnabled()) {
      setError("API is not configured.");
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    void apiListAdminActivityLogs({ from, to, limit: 200, action: action || undefined })
      .then(setRows)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load activity log.");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [from, to, action]);

  useEffect(() => {
    load();
  }, [load]);

  const statusHelp = useMemo(
    () =>
      "Backend order status: submitted → processing (challan) → purchase invoice (stays processing) → completed when admin marks delivery → invoiced (billing invoice).",
    [],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Activity log</h1>
        <p className="mt-1 text-sm text-slate-600">
          Who did what: challan, purchase invoice, billing invoice, and mark delivered. Filter by date range (admin
          only).
        </p>
        <p className="mt-1 text-xs text-slate-500">{statusHelp}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <label className="text-xs font-semibold text-slate-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Action
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="mt-1 block min-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" onClick={() => load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border bg-muted text-xs font-semibold uppercase text-foreground">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No log entries in this range. If the database has no <code className="text-xs">activity_logs</code>{" "}
                  table yet, run migrations.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const oid = orderLinkId(row);
              const orderNo =
                (typeof row.after?.orderNo === "string" && row.after.orderNo) ||
                (typeof row.after?.order_no === "string" && row.after.order_no) ||
                null;
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.actorName}</div>
                    <div className="text-xs text-slate-500">
                      {row.actorEmail} · {row.actorRole}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{actionLabel(row.action)}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.entityType} #{row.entityId}
                    {oid ? (
                      <div className="mt-1">
                        <Link to={`/admin/orders/${oid}`} className="text-sm font-semibold text-primary hover:underline">
                          Open order{orderNo ? ` ${orderNo}` : ` #${oid}`}
                        </Link>
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-md px-4 py-3 font-mono text-xs text-slate-600">
                    {row.before && Object.keys(row.before).length > 0 ? (
                      <span className="block text-slate-500">Before: {JSON.stringify(row.before)}</span>
                    ) : null}
                    {row.after && Object.keys(row.after).length > 0 ? (
                      <span className="mt-1 block">After: {JSON.stringify(row.after)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
