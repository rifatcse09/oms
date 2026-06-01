import { useEffect, useMemo, useState } from "react";
import { SortableHeader, nextSort, type SortDir } from "../components/SortableHeader";
import { ExportToolbar, useColumnVisibility } from "../components/ExportToolbar";
import { PaginationControls } from "../components/PaginationControls";
import { useOrders } from "../context/OrdersContext";
import { useAuth } from "../context/AuthContext";
import {
  apiGetBillingCycleConfig,
  apiListAdjustments,
  apiListPayments,
  formatPaymentHistoryWhen,
  type AdjustmentTxn,
  type PaymentTxn,
  apiEnabled,
} from "../lib/api";
import { DEFAULT_BILLING_CYCLE_CONFIG, startOfCycle, type BillingCycleConfig } from "../lib/billingCycle";
import { applyPaymentAwareCarryover } from "../lib/statementCarryover";
import { resolvePaymentTxnEffectiveType } from "../lib/paymentTxnType";
import {
  invoiceCapForStatement,
  netPaidAppliedOnOrder,
  orderNumericId,
  resolveStatementTxnBucketMeta,
  statementBucketKeyForTxn,
} from "../lib/statementPaymentAllocation";
import { formatDateDdMmYyyy } from "../lib/formatDisplayDate";
import {
  formatStatementAmount,
  formatStatementTaka,
  orderInvoiceRemainingExact,
  reconcileStatementDisplay,
  roundMoney,
} from "../lib/statementMoney";
import type { Order } from "../types";

interface StatementRow {
  key: string;
  customer: string;
  start: Date;
  end: Date;
  dueDate: Date;
  invoiceCount: number;
  invoiceTotal: number;
  previousDue: number;
  totalDue: number;
  status: "Due" | "Overdue";
  invoices: Array<{ orderNo: string; orderDate: string; amount: number }>;
}

export function AdminBillingStatementsPage() {
  const { orders } = useOrders();
  const { user } = useAuth();
  const [customer, setCustomer] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "history">("active");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = (field: string) => {
    const next = nextSort({ key: sortKey, dir: sortDir }, field);
    setSortKey(next.key);
    setSortDir(next.dir);
    setPage(1);
  };
  const [transactions, setTransactions] = useState<{ payments: PaymentTxn[]; adjustments: AdjustmentTxn[] }>({
    payments: [],
    adjustments: [],
  });
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [cycleConfig, setCycleConfig] = useState<BillingCycleConfig>(DEFAULT_BILLING_CYCLE_CONFIG);

  const customers = useMemo(
    () =>
      [...new Set(orders.map((o) => o.contactPerson?.trim()).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b))),
    [orders],
  );

  useEffect(() => {
    if (!apiEnabled()) return;
    void apiGetBillingCycleConfig()
      .then(setCycleConfig)
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  useEffect(() => {
    if (!user || !apiEnabled()) return;
    void Promise.all([apiListPayments(), apiListAdjustments()])
      .then(([payments, adjustments]) => setTransactions({ payments, adjustments }))
      .catch(() => setTransactions({ payments: [], adjustments: [] }));
  }, [user, cycleConfig.cycleDays, cycleConfig.weekStartDay]);

  const paymentsByKey = useMemo(() => {
    const map = new Map<string, number>();
    transactions.payments
      .filter((txn) => resolvePaymentTxnEffectiveType(txn) === "billing")
      .forEach((txn) => {
        const meta = resolveStatementTxnBucketMeta(txn, orders);
        if (!meta) return;
        const dt = parseIso(meta.orderDateKey);
        if (!dt) return;
        const cycleStart = startOfCycle(dt, cycleConfig.cycleDays, cycleConfig.weekStartDay);
        const key = `${formatIso(cycleStart)}::${meta.customer}`;
        map.set(key, (map.get(key) ?? 0) + Number(txn.amount || 0));
      });
    transactions.adjustments
      .filter((txn) => txn.type === "billing")
      .forEach((txn) => {
        const meta = resolveStatementTxnBucketMeta(txn, orders);
        if (!meta) return;
        const dt = parseIso(meta.orderDateKey);
        if (!dt) return;
        const cycleStart = startOfCycle(dt, cycleConfig.cycleDays, cycleConfig.weekStartDay);
        const key = `${formatIso(cycleStart)}::${meta.customer}`;
        map.set(key, (map.get(key) ?? 0) - Number(txn.amount || 0));
      });
    return map;
  }, [transactions, cycleConfig, orders]);

  const statements = useMemo(() => {
    const cycleDays = cycleConfig.cycleDays;
    const weekStart = cycleConfig.weekStartDay;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only orders with a generated billing invoice and a billing total (see invoiceFlow / API flags).
    const eligible = orders
      .filter((o) => o.billingInvoiceGenerated)
      .filter((o) => billingStatementAmount(o) > 0)
      .filter((o) => (customer === "all" ? true : o.contactPerson === customer))
      .sort((a, b) => a.orderDate.localeCompare(b.orderDate));

    const bucket = new Map<
      string,
      { customer: string; start: Date; end: Date; total: number; invoices: StatementRow["invoices"] }
    >();

    for (const o of eligible) {
      const d = parseIso(o.orderDate);
      if (!d) continue;
      const start = startOfCycle(d, cycleDays, weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + cycleDays - 1);
      const c = (o.contactPerson ?? "").trim() || "Unknown customer";
      const key = `${formatIso(start)}::${c}`;
      const prev = bucket.get(key);
      const lineAmt = roundMoney(invoiceCapForStatement(o, "billing"));
      bucket.set(key, {
        customer: c,
        start,
        end,
        total: (prev?.total ?? 0) + lineAmt,
        invoices: [
          ...(prev?.invoices ?? []),
          { orderNo: o.orderNo, orderDate: o.orderDate, amount: lineAmt },
        ],
      });
    }

    const bucketRows = [...bucket.entries()].map(([key, v]) => ({
      key,
      customer: v.customer,
      start: v.start,
      end: v.end,
      invoiceCount: v.invoices.length,
      invoiceTotal: v.total,
      invoices: v.invoices,
    }));

    const netPaid = (k: string) => Math.max(0, paymentsByKey.get(k) ?? 0);
    const withCarry = applyPaymentAwareCarryover(bucketRows, netPaid);

    const rows: StatementRow[] = withCarry.map((s) => {
      const dueDate = new Date(s.end);
      dueDate.setDate(dueDate.getDate() + cycleDays);
      const status: StatementRow["status"] = dueDate.getTime() < today.getTime() ? "Overdue" : "Due";
      return { ...s, dueDate, status };
    });

    return rows.sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [orders, customer, cycleConfig, paymentsByKey]);

  function paidOf(key: string): number {
    return Math.max(0, paymentsByKey.get(key) ?? 0);
  }

  /** Exact invoice + carry-over due for this cycle row (paisa). */
  function dueExactForRow(row: StatementRow): number {
    const ordersInRow = ordersForStatementRow(row);
    const invoicePart = ordersInRow.reduce(
      (sum, o) => sum + roundMoney(invoiceCapForStatement(o, "billing")),
      0,
    );
    return roundMoney(roundMoney(row.previousDue) + invoicePart);
  }

  function paidExactForRow(row: StatementRow): number {
    return roundMoney(paidOf(row.key));
  }

  function displayAmounts(row: StatementRow) {
    return reconcileStatementDisplay(
      dueExactForRow(row),
      paidExactForRow(row),
      isCustomerBillingFullySettled(row.customer),
    );
  }

  function ordersForStatementRow(row: StatementRow): Order[] {
    const customer = row.customer.trim();
    return row.invoices
      .map((inv) =>
        orders.find(
          (o) => o.orderNo === inv.orderNo && (o.contactPerson ?? "").trim() === customer,
        ),
      )
      .filter((o): o is Order => Boolean(o));
  }

  function orderBillingRemaining(o: Order): number {
    const oid = orderNumericId(o);
    const cap = invoiceCapForStatement(o, "billing");
    const net =
      oid != null
        ? netPaidAppliedOnOrder(oid, "billing", transactions.payments, transactions.adjustments)
        : 0;
    if (o.billingAmountDue != null && Number.isFinite(o.billingAmountDue)) {
      return Math.max(0, roundMoney(o.billingAmountDue));
    }
    return orderInvoiceRemainingExact(cap, net);
  }

  function isCustomerBillingFullySettled(customer: string): boolean {
    const c = customer.trim();
    const invoiced = orders.filter(
      (o) =>
        o.billingInvoiceGenerated &&
        billingStatementAmount(o) > 0 &&
        (o.contactPerson ?? "").trim() === c,
    );
    if (invoiced.length === 0) return false;
    return invoiced.every((o) => orderBillingRemaining(o) < 0.01);
  }

  function balanceOf(row: StatementRow): number {
    return displayAmounts(row).balance;
  }

  function paymentStatusOf(row: StatementRow): "Paid" | "Partial" | "Unpaid" {
    const bal = balanceOf(row);
    const paid = paidOf(row.key);
    if (bal <= 0) return paid > 0 || isCustomerBillingFullySettled(row.customer) ? "Paid" : "Unpaid";
    if (paid <= 0) return "Unpaid";
    return "Partial";
  }

  /** Calendar deadline vs today, but once balance is cleared do not keep showing Overdue. */
  function scheduleDueLabel(row: StatementRow): "Due" | "Overdue" | "Paid" {
    if (paymentStatusOf(row) === "Paid") return "Paid";
    return row.status;
  }

  const dateRangeFiltered = useMemo(() => {
    const fromKey = fromDate.trim() || null;
    const toKey = toDate.trim() || null;
    return statements.filter((row) => {
      const startKey = formatIso(row.start);
      const endKey = formatIso(row.end);
      if (fromKey && endKey < fromKey) return false;
      if (toKey && startKey > toKey) return false;
      return true;
    });
  }, [statements, fromDate, toDate]);

  const activeStatements = useMemo(
    () => dateRangeFiltered,
    [dateRangeFiltered, paymentsByKey],
  );

  const historyStatements = useMemo(
    () =>
      dateRangeFiltered.filter((row) => {
        return paymentStatusOf(row) === "Paid";
      }),
    [dateRangeFiltered, paymentsByKey],
  );

  const listSource = viewMode === "active" ? activeStatements : historyStatements;

  const sortedListSource = useMemo(() => {
    if (!sortKey) return listSource;
    return [...listSource].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "customer") { av = a.customer; bv = b.customer; }
      else if (sortKey === "start") { av = a.start.getTime(); bv = b.start.getTime(); }
      else if (sortKey === "invoiceCount") { av = a.invoiceCount; bv = b.invoiceCount; }
      else if (sortKey === "totalDue") { av = a.totalDue; bv = b.totalDue; }
      else if (sortKey === "dueDate") { av = a.dueDate.getTime(); bv = b.dueDate.getTime(); }
      const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [listSource, sortKey, sortDir]);

  const listTotals = useMemo(() => {
    let totalDue = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    for (const row of listSource) {
      const d = displayAmounts(row);
      totalDue += d.totalDue;
      totalPaid += d.paid;
      totalBalance += d.balance;
    }
    return { totalDue, totalPaid, totalBalance };
  }, [listSource, paymentsByKey, transactions, orders]);

  const BILLING_STMT_COLS = [
    { key: "customer", label: "Customer" },
    { key: "period", label: "Period" },
    { key: "invoiceCount", label: "# Billing inv." },
    { key: "totalDue", label: "Total due" },
    { key: "paid", label: "Paid (billing)" },
    { key: "balance", label: "Balance" },
    { key: "dueStatus", label: "Due status" },
    { key: "payment", label: "Payment" },
  ];
  const { visibleColumns: billingStmtVisibleCols, toggleColumn: toggleBillingStmtCol, isVisible: billingStmtColVisible } = useColumnVisibility(BILLING_STMT_COLS);

  const getBillingStmtData = () => {
    const headers = BILLING_STMT_COLS.filter((c) => billingStmtColVisible(c.key)).map((c) => c.label);
    const exportRows = sortedListSource.map((r) => {
      const amt = displayAmounts(r);
      const cols: string[] = [];
      if (billingStmtColVisible("customer")) cols.push(r.customer);
      if (billingStmtColVisible("period")) cols.push(`${formatDateDdMmYyyy(formatIso(r.start))} - ${formatDateDdMmYyyy(formatIso(r.end))}`);
      if (billingStmtColVisible("invoiceCount")) cols.push(String(r.invoiceCount));
      if (billingStmtColVisible("totalDue")) cols.push(String(amt.totalDue));
      if (billingStmtColVisible("paid")) cols.push(String(amt.paid));
      if (billingStmtColVisible("balance")) cols.push(String(amt.balance));
      if (billingStmtColVisible("dueStatus")) cols.push(scheduleDueLabel(r));
      if (billingStmtColVisible("payment")) cols.push(paymentStatusOf(r));
      return cols;
    });
    return { headers, rows: exportRows };
  };

  const safePage = Math.min(page, Math.max(1, Math.ceil(sortedListSource.length / perPage)));
  const paged = sortedListSource.slice((safePage - 1) * perPage, safePage * perPage);
  const selected = selectedKey ? listSource.find((s) => s.key === selectedKey) ?? null : null;

  const selectedPerOrderBilling = useMemo(() => {
    if (!selected) return [];
    return selected.invoices.map((inv) => {
      const o = orders.find((x) => x.orderNo === inv.orderNo);
      const oid = o ? orderNumericId(o) : null;
      const invoiceAmt = inv.amount;
      const cap = o ? invoiceCapForStatement(o, "billing") : invoiceAmt;
      const net =
        oid != null ? netPaidAppliedOnOrder(oid, "billing", transactions.payments, transactions.adjustments) : 0;
      const due = o ? orderBillingRemaining(o) : orderInvoiceRemainingExact(cap, net);
      return {
        orderNo: inv.orderNo,
        orderDate: inv.orderDate,
        cap,
        invoiceAmt,
        net,
        due,
        hasOrder: Boolean(o),
      };
    });
  }, [selected, orders, transactions.payments, transactions.adjustments]);

  const statementBillingHistoryRows = useMemo(() => {
    if (!selected) return [];
    const key = selected.key;
    type H = {
      kind: "payment" | "adjustment";
      id: number;
      at: string;
      orderDate: string | null;
      orderLabel: string;
      amount: number;
      note: string;
    };
    const rows: H[] = [];
    for (const p of transactions.payments) {
      if (resolvePaymentTxnEffectiveType(p) !== "billing") continue;
      if (statementBucketKeyForTxn(p, orders, cycleConfig, "billing") !== key) continue;
      rows.push({
        kind: "payment",
        id: p.id,
        at: p.created_at || "",
        orderDate: p.order_date ?? null,
        orderLabel: p.order_no?.trim() ? String(p.order_no) : p.order_id != null ? `#${p.order_id}` : "—",
        amount: Number(p.amount ?? 0),
        note: p.note?.trim() ? p.note : "—",
      });
    }
    for (const a of transactions.adjustments) {
      if (a.type !== "billing") continue;
      if (statementBucketKeyForTxn(a, orders, cycleConfig, "billing") !== key) continue;
      rows.push({
        kind: "adjustment",
        id: a.id,
        at: a.created_at || "",
        orderDate: a.order_date ?? null,
        orderLabel: a.order_no?.trim() ? String(a.order_no) : a.order_id != null ? `#${a.order_id}` : "—",
        amount: Number(a.amount ?? 0),
        note: a.reason?.trim() ? a.reason : "—",
      });
    }
    rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id));
    return rows;
  }, [selected, transactions.payments, transactions.adjustments, orders, cycleConfig]);

  const billingHistoryTotals = useMemo(() => {
    let payments = 0;
    let adjustments = 0;
    for (const r of statementBillingHistoryRows) {
      if (r.kind === "payment") payments += Number(r.amount ?? 0);
      else adjustments += Number(r.amount ?? 0);
    }
    return {
      payments: roundMoney(payments),
      adjustments: roundMoney(adjustments),
      net: roundMoney(payments - adjustments),
    };
  }, [statementBillingHistoryRows]);

  useEffect(() => {
    if (!selected) setPaymentHistoryOpen(false);
  }, [selected]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Billing statements</h1>
        <p className="text-sm text-slate-600">
          Customer-wise cycle totals with previous due carry-over and due status. Previous due is unpaid balance
          from older cycles (after payments), not a second copy of old invoice totals.{" "}
          <span className="font-medium text-slate-800">
            Only orders that have a billing invoice generated are included
          </span>{" "}
          (separate from purchase invoices).{" "}
          <span className="font-medium text-slate-800">Record billing payments and corrections under Pending bills</span>{" "}
          — this page is for review only. Tables scroll when there are many rows or on narrow screens.
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Cycle</p>
            <p className="text-sm font-semibold">{cycleConfig.label}</p>
          </div>
          <label className="text-xs text-slate-600">
            Customer
            <select
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                setPage(1);
                setSelectedKey(null);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All customers</option>
              {customers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            From date
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
                setSelectedKey(null);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            To date
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
                setSelectedKey(null);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setViewMode("active");
              setPage(1);
              setSelectedKey(null);
            }}
            className={
              viewMode === "active"
                ? "rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            }
          >
            Active ({activeStatements.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("history");
              setPage(1);
              setSelectedKey(null);
            }}
            className={
              viewMode === "history"
                ? "rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            }
          >
            History ({historyStatements.length})
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Total due ({viewMode})</p>
            <p className="text-sm font-semibold">৳ {formatStatementAmount(listTotals.totalDue)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-xs text-emerald-700">Total paid ({viewMode})</p>
            <p className="text-sm font-semibold text-emerald-800">
              ৳ {formatStatementAmount(listTotals.totalPaid)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">Total balance ({viewMode})</p>
            <p className="text-sm font-semibold text-amber-900">
              ৳ {formatStatementAmount(listTotals.totalBalance)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Showing <strong>{sortedListSource.length}</strong> statements</p>
          <ExportToolbar filename="billing-statements" columns={BILLING_STMT_COLS} visibleColumns={billingStmtVisibleCols} onToggleColumn={toggleBillingStmtCol} getData={getBillingStmtData} />
        </div>

        <div className="table-scroll mt-2 max-h-[min(70vh,640px)] rounded-2xl border border-border shadow-inner">
          <table className="min-w-[1080px] w-full text-left text-base">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted text-xs font-bold uppercase tracking-wide text-foreground shadow-sm">
              <tr>
                {billingStmtColVisible("customer") && <th className="px-4 py-3.5"><SortableHeader label="Customer" field="customer" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {billingStmtColVisible("period") && <th className="px-4 py-3.5"><SortableHeader label="Period" field="start" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {billingStmtColVisible("invoiceCount") && <th className="px-4 py-3.5"><SortableHeader label="# billing inv." field="invoiceCount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {billingStmtColVisible("totalDue") && <th className="px-4 py-3.5 text-right"><SortableHeader label="Total due" field="totalDue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {billingStmtColVisible("paid") && <th className="px-4 py-3.5 text-right">Paid (billing)</th>}
                {billingStmtColVisible("balance") && <th className="px-4 py-3.5 text-right">Balance</th>}
                {billingStmtColVisible("dueStatus") && <th className="px-4 py-3.5"><SortableHeader label="Due status" field="dueDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {billingStmtColVisible("payment") && <th className="px-4 py-3.5">Payment</th>}
                <th className="px-4 py-3.5 text-right">View</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const amt = displayAmounts(r);
                return (
                <tr
                  key={r.key}
                  onClick={() => setSelectedKey(r.key)}
                  className={`cursor-pointer border-t border-border ${
                    selected?.key === r.key
                      ? "bg-muted"
                      : scheduleDueLabel(r) === "Overdue"
                        ? "bg-red-50"
                        : "bg-card"
                  }`}
                >
                  {billingStmtColVisible("customer") && <td className="px-3 py-3.5 font-semibold">{r.customer}</td>}
                  {billingStmtColVisible("period") && (
                    <td className="px-3 py-3.5">
                      {formatDateDdMmYyyy(formatIso(r.start))} to {formatDateDdMmYyyy(formatIso(r.end))}
                      <span className="ml-1 text-xs text-slate-500">· Due {formatDateDdMmYyyy(formatIso(r.dueDate))}</span>
                    </td>
                  )}
                  {billingStmtColVisible("invoiceCount") && <td className="px-3 py-3.5">{r.invoiceCount}</td>}
                  {billingStmtColVisible("totalDue") && <td className="px-3 py-3.5 text-right font-semibold">৳ {formatStatementAmount(amt.totalDue)}</td>}
                  {billingStmtColVisible("paid") && <td className="px-3 py-3.5 text-right">৳ {formatStatementAmount(amt.paid)}</td>}
                  {billingStmtColVisible("balance") && <td className="px-3 py-3.5 text-right font-semibold">৳ {formatStatementAmount(amt.balance)}</td>}
                  {billingStmtColVisible("dueStatus") && (
                    <td className="px-3 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${scheduleDueLabel(r) === "Overdue" ? "bg-red-100 text-red-700" : scheduleDueLabel(r) === "Paid" ? "bg-emerald-100 text-emerald-800" : "bg-emerald-100 text-emerald-700"}`}>
                        {scheduleDueLabel(r)}
                      </span>
                    </td>
                  )}
                  {billingStmtColVisible("payment") && (
                    <td className="px-3 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paymentStatusOf(r) === "Paid" ? "bg-emerald-100 text-emerald-700" : paymentStatusOf(r) === "Partial" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                        {paymentStatusOf(r)}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedKey(r.key);
                      }}
                      className="relative z-[1] inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              );
              })}
              {paged.length === 0 ? (
                <tr className="border-t border-border bg-card">
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    {viewMode === "active"
                      ? "No active statements found."
                      : "No history statements found."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <PaginationControls
          totalItems={sortedListSource.length}
          page={safePage}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={(size) => {
            setPerPage(size);
            setPage(1);
          }}
        />
      </div>

      {selected ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
          <h2 className="text-sm font-semibold">Billing statement details</h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
              {selected.customer} · {formatDateDdMmYyyy(formatIso(selected.start))} to{" "}
              {formatDateDdMmYyyy(formatIso(selected.end))} · Due {formatDateDdMmYyyy(formatIso(selected.dueDate))}
            </div>
            <button
              type="button"
              onClick={() => setPaymentHistoryOpen(true)}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Payment history
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Totals below are from <strong>customer billing invoices</strong> in this cycle.{" "}
            <strong>Paid</strong> is net billing collections for this statement (supplier purchase side is separate).
            When fully paid, <strong>Total due and Paid show the same amount</strong> (fractions included). Otherwise Total due = Paid + Balance (exact paisa).
          </p>
          {(() => {
            const amt = displayAmounts(selected);
            return (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <DetailStat
                label="Billing invoice total (cycle)"
                value={`৳ ${formatStatementTaka(selected.invoiceTotal)}`}
              />
              <DetailStat
                label="Previous due carry-over"
                value={`৳ ${formatStatementTaka(selected.previousDue)}`}
              />
              <DetailStat label="Total bill due (display)" value={`৳ ${formatStatementAmount(amt.totalDue)}`} />
              <DetailStat label="Paid (this cycle)" value={`৳ ${formatStatementAmount(amt.paid)}`} />
              <DetailStat label="Balance due" value={`৳ ${formatStatementAmount(amt.balance)}`} />
              <DetailStat label="Payment status" value={paymentStatusOf(selected)} />
            </div>
            {Math.abs(amt.roundingGap) >= 0.01 ? (
              <p className="mt-3 text-xs text-amber-800">
                Rounding note: exact invoice + carry-over total ৳ {formatStatementAmount(amt.dueRaw)}, payments in
                this cycle (net) ৳ {formatStatementAmount(amt.paidRaw)}. Difference ৳{" "}
                {formatStatementAmount(Math.abs(amt.roundingGap))} is from per-invoice decimals vs whole-taka payments
                — open <strong>Payment history</strong> to see each amount.
              </p>
            ) : null}
          </div>
            );
          })()}

          <div className="table-scroll mt-3 max-h-[min(40vh,320px)] rounded-2xl border border-border shadow-inner">
            <table className="min-w-[720px] w-full text-left text-base">
              <caption className="px-3 py-2 text-left text-xs font-semibold text-slate-700">
                Per-order billing settlement (invoice date, cap, net paid, still due)
              </caption>
              <thead className="sticky top-0 z-10 border-b border-border bg-muted text-sm font-semibold uppercase tracking-wide text-foreground shadow-sm">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Order date</th>
                  <th className="px-3 py-2 text-right">Invoice cap</th>
                  <th className="px-3 py-2 text-right">Net paid (billing)</th>
                  <th className="px-3 py-2 text-right">Still due (order)</th>
                </tr>
              </thead>
              <tbody>
                {selectedPerOrderBilling.map((row) => (
                  <tr key={row.orderNo} className="border-t border-border bg-card">
                    <td className="px-3 py-3 font-semibold">
                      {row.orderNo}
                      {!row.hasOrder ? <span className="ml-1 text-xs font-normal text-amber-700">(order not in list)</span> : null}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700">{formatDateDdMmYyyy(row.orderDate)}</td>
                    <td className="px-3 py-3 text-right">৳ {formatStatementAmount(row.cap)}</td>
                    <td className="px-3 py-3 text-right">৳ {formatStatementAmount(row.net)}</td>
                    <td className="px-3 py-3 text-right font-semibold">৳ {formatStatementTaka(row.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 shadow-card">
          Click <strong>View details</strong> in any statement row to open details.
        </div>
      )}

      {paymentHistoryOpen && selected ? (
        <div
          className="fixed inset-0 z-[290] flex items-center justify-center bg-slate-900/35 p-4"
          onClick={() => setPaymentHistoryOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[min(85vh,720px)] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="billing-payment-history-title"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 id="billing-payment-history-title" className="text-lg font-bold text-slate-900">
                  Payment history
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Billing payments and adjustments in <strong>this statement&apos;s cycle bucket</strong> (same period as
                  the row you selected). Table From/To only filters which rows appear; this list always matches the
                  selected cycle.
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {selected.customer} · {formatDateDdMmYyyy(formatIso(selected.start))} to{" "}
                  {formatDateDdMmYyyy(formatIso(selected.end))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentHistoryOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="table-scroll max-h-[min(60vh,520px)] overflow-auto px-2 pb-4">
              <table className="min-w-[640px] w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2 text-right">Amount (৳)</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {statementBillingHistoryRows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                        {formatPaymentHistoryWhen({ created_at: r.at, order_date: r.orderDate })}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            r.kind === "payment"
                              ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                              : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                          }
                        >
                          {r.kind === "payment" ? "Payment" : "Adjustment"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.orderLabel}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {r.kind === "adjustment" ? "−" : ""}
                        {formatStatementAmount(r.amount)}
                      </td>
                      <td className="max-w-[220px] px-3 py-2 text-xs text-slate-700 break-words">{r.note}</td>
                    </tr>
                  ))}
                  {statementBillingHistoryRows.length === 0 ? (
                    <tr className="border-t border-slate-100">
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                        No billing payments or adjustments in this cycle bucket yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {statementBillingHistoryRows.length > 0 ? (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800">
                    <tr>
                      <td colSpan={3} className="px-3 py-2">
                        Cycle totals (exact amounts — fractions shown when present)
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <div>Payments: ৳ {formatStatementAmount(billingHistoryTotals.payments)}</div>
                        <div className="text-amber-900">
                          Adjustments: −৳ {formatStatementAmount(billingHistoryTotals.adjustments)}
                        </div>
                        <div className="mt-1 border-t border-slate-200 pt-1">
                          Net paid: ৳ {formatStatementAmount(billingHistoryTotals.net)}
                        </div>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function parseIso(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function billingStatementAmount(o: {
  grandTotal?: number;
  billingSubtotal?: number;
  subtotal?: number;
  lines?: Array<{ lineTotalAfterMarkup?: number | null; lineTotal?: number }>;
}): number {
  const direct = Number(o.grandTotal ?? o.billingSubtotal ?? o.subtotal ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const rows = Array.isArray(o.lines) ? o.lines : [];
  const fallback = rows.reduce((sum, line) => {
    const billed = Number(line.lineTotalAfterMarkup ?? line.lineTotal ?? 0);
    return sum + (Number.isFinite(billed) ? billed : 0);
  }, 0);
  return fallback > 0 ? fallback : 0;
}

function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}
