import { Link, useLocation } from "react-router-dom";
import { useOrders } from "../context/OrdersContext";
import { StatusBadge } from "../components/StatusBadge";
import { useEffect, useMemo, useState } from "react";
import { SortableHeader, nextSort, sortRows, type SortDir } from "../components/SortableHeader";
import { ExportToolbar, useColumnVisibility } from "../components/ExportToolbar";
import { PaginationControls } from "../components/PaginationControls";
import { ClipboardCheck, Calendar, FileBadge2, FileText, MoreVertical, ReceiptText, Search } from "lucide-react";
import { OrderDeliveredAtCell, OrderScheduledDeliveryCell } from "../components/OrderDeliveryTableCells";
import { formatDateDdMmYyyyOrDash } from "../lib/formatDisplayDate";
import { NOTIFICATIONS_EVENT, readModeratorSeenOrderIds } from "../lib/orderNotifications";
import { hasPurchaseInvoice } from "../lib/invoiceFlow";
import type { OrderStatus } from "../types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  tableActionsContainerClass,
  tableActionsTightSingle,
  tableActionsWideSingle,
} from "@/lib/tableActionsLayout";
import { StatMetricCard } from "../components/StatMetricCard";
import { apiEnabled } from "../lib/api";

export function ModeratorOrdersPage() {
  const { orders, loadOrders } = useOrders();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OrderStatus>("all");
  const [customer, setCustomer] = useState("all");
  const [docFilter, setDocFilter] = useState<
    | "all"
    | "challan_yes"
    | "challan_no"
    | "purchase_yes"
    | "purchase_no"
    | "billing_yes"
    | "billing_no"
  >("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [seenTick, setSeenTick] = useState(0);

  const handleSort = (field: string) => {
    const next = nextSort({ key: sortKey, dir: sortDir }, field);
    setSortKey(next.key);
    setSortDir(next.dir);
    setPage(1);
  };

  const MOD_COLS = [
    { key: "orderNo", label: "Order" },
    { key: "contactPerson", label: "Customer" },
    { key: "orderDate", label: "Order date" },
    { key: "deliveryDate", label: "Delivery date" },
    { key: "delivery", label: "Delivery" },
    { key: "deliveredAt", label: "Delivered" },
    { key: "status", label: "Status" },
    { key: "documents", label: "Documents" },
    { key: "purchaseBalance", label: "Purchase balance" },
    { key: "purchasePayment", label: "Purchase payment" },
  ];
  const { visibleColumns: modVisibleCols, toggleColumn: toggleModCol, isVisible: modColVisible } = useColumnVisibility(MOD_COLS);

  const getModData = () => {
    const headers = MOD_COLS.filter((c) => modColVisible(c.key)).map((c) => c.label);
    const rows = sorted.map((o) => {
      const cols: string[] = [];
      if (modColVisible("orderNo")) cols.push(o.orderNo);
      if (modColVisible("contactPerson")) cols.push(o.contactPerson);
      if (modColVisible("orderDate")) cols.push(o.orderDate ?? "");
      if (modColVisible("deliveryDate")) cols.push(o.deliveryDate ?? "");
      if (modColVisible("delivery")) cols.push(o.deliveryDate ?? "");
      if (modColVisible("deliveredAt")) cols.push(o.deliveredAt ?? "");
      if (modColVisible("status")) cols.push(o.status);
      if (modColVisible("documents")) cols.push(o.challanGenerated ? "Challan" : "—");
      if (modColVisible("purchaseBalance")) cols.push(String(o.purchaseSubtotal ?? "—"));
      if (modColVisible("purchasePayment")) cols.push("—");
      return cols;
    });
    return { headers, rows };
  };
  const [adjustOrderId, setAdjustOrderId] = useState<string | null>(null);
  const [adjustInput, setAdjustInput] = useState("");
  const [purchasePayments, setPurchasePayments] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem("gom_purchase_payments");
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, number>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const sync = () => setSeenTick((t) => t + 1);
    window.addEventListener(NOTIFICATIONS_EVENT, sync);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, sync);
  }, []);

  const mode = useMemo<"orders" | "purchase">(() => {
    if (location.pathname.startsWith("/moderator/purchase-invoices")) return "purchase";
    return "orders";
  }, [location.pathname]);

  useEffect(() => {
    setPage(1);
    if (mode === "purchase") setDocFilter("purchase_yes");
    else setDocFilter("all");
  }, [mode]);

  useEffect(() => {
    localStorage.setItem("gom_purchase_payments", JSON.stringify(purchasePayments));
  }, [purchasePayments]);

  const modSeen = useMemo(() => readModeratorSeenOrderIds(), [seenTick]);
  const isNewSubmitted = (id: string, status: string) => status === "submitted" && !modSeen.has(id);
  const adjustOrder = adjustOrderId ? orders.find((o) => o.id === adjustOrderId) ?? null : null;

  function purchaseAmountOf(orderId: string): number {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return 0;
    return order.lines.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0);
  }

  function paidPurchaseOf(orderId: string): number {
    return Math.max(0, Number(purchasePayments[orderId] ?? 0));
  }

  function purchaseBalanceOf(orderId: string): number {
    return Math.max(0, purchaseAmountOf(orderId) - paidPurchaseOf(orderId));
  }

  function purchasePaymentStatusOf(orderId: string): "Paid" | "Partial" | "Pending" {
    const total = purchaseAmountOf(orderId);
    if (total <= 0) return "Pending";
    const paid = paidPurchaseOf(orderId);
    if (paid <= 0) return "Pending";
    if (paid >= total) return "Paid";
    return "Partial";
  }

  function savePurchaseAdjustment() {
    if (!adjustOrder) return;
    const raw = adjustInput.trim().replace(",", ".");
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount < 0) return;
    const rounded = Math.round(amount * 100) / 100;
    const total = purchaseAmountOf(adjustOrder.id);
    setPurchasePayments((prev) => ({ ...prev, [adjustOrder.id]: Math.min(total, rounded) }));
    setAdjustOrderId(null);
    setAdjustInput("");
  }

  const customers = useMemo(
    () =>
      [...new Set(orders.map((o) => o.contactPerson?.trim()).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b)),
      ),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (mode === "purchase" && o.status === "draft") return false;
      if (status !== "all" && o.status !== status) return false;
      if (customer !== "all" && o.contactPerson !== customer) return false;
      if (docFilter === "challan_yes" && !o.challanGenerated) return false;
      if (docFilter === "challan_no" && o.challanGenerated) return false;
      if (docFilter === "purchase_yes" && !hasPurchaseInvoice(o)) return false;
      if (docFilter === "purchase_no" && hasPurchaseInvoice(o)) return false;
      if (!q) return true;
      return (
        o.orderNo.toLowerCase().includes(q) ||
        o.contactPerson.toLowerCase().includes(q) ||
        (o.phone || "").toLowerCase().includes(q) ||
        o.deliveryAddress.toLowerCase().includes(q)
      );
    });
  }, [orders, query, status, customer, docFilter, mode, purchasePayments]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return sortRows(filtered, sortKey as keyof typeof filtered[0], sortDir);
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageList = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const challanCount = orders.filter((o) => o.challanGenerated).length;
  const invoiceCount = orders.filter((o) => o.status === "delivered").length;
  const underReview = orders.filter((o) => o.status === "under_review").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900">
          {mode === "purchase" ? "Purchase invoice list" : "Moderator panel"}
        </h1>
        <p className="mt-1 text-base font-medium text-slate-600">
          {mode === "purchase"
            ? "Purchase invoice status, payment adjustments, and pending balances."
            : "Edit quantities, set cost pricing, generate challan, and send purchase invoice to admin."}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatMetricCard
          title="Under review"
          value={String(underReview)}
          icon={ClipboardCheck}
          tone="amber"
          sparkSeed="mod-under-review"
        />
        <StatMetricCard
          title="Challan ready"
          value={String(challanCount)}
          icon={FileText}
          tone="teal"
          sparkSeed="mod-challan-ready"
        />
        <StatMetricCard
          title="Delivered for invoicing"
          value={String(invoiceCount)}
          icon={ReceiptText}
          tone="navy"
          sparkSeed="mod-delivered-invoice"
        />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="border-b border-border bg-card px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground sm:col-span-2 lg:col-span-2">
              <span className="mb-1 flex items-center gap-1.5 text-slate-600">
                <Search className="h-3.5 w-3.5" />
                Search
              </span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Order no., customer, phone, address…"
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Status
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "all" | OrderStatus);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="draft">Drafted</option>
                <option value="submitted">Ordered</option>
                <option value="under_review">Processing</option>
                <option value="delivered">Delivered</option>
                <option value="invoiced">Completed (Invoice)</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Customer
              <select
                value={customer}
                onChange={(e) => {
                  setCustomer(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">All customers</option>
                {customers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Showing <strong className="text-slate-700">{sorted.length}</strong> of {orders.length} orders
            </p>
            <ExportToolbar
              filename="moderator-orders-export"
              columns={MOD_COLS}
              visibleColumns={modVisibleCols}
              onToggleColumn={toggleModCol}
              getData={getModData}
            />
          </div>
        </div>

        <div className={tableActionsContainerClass("table-scroll hidden md:block")}>
          <table className="min-w-[1180px] w-full text-left text-sm lg:text-base">
          <thead className="bg-muted text-sm uppercase tracking-wide text-foreground">
            <tr>
              {modColVisible("orderNo") && <th className="px-4 py-3"><SortableHeader label="Order" field="orderNo" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
              {modColVisible("contactPerson") && <th className="px-4 py-3"><SortableHeader label="Customer" field="contactPerson" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
              {modColVisible("orderDate") && <th className="px-4 py-3 whitespace-nowrap"><SortableHeader label="Order date" field="orderDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
              {modColVisible("deliveryDate") && <th className="px-4 py-3 whitespace-nowrap"><SortableHeader label="Delivery date" field="deliveryDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
              {modColVisible("delivery") && <th className="px-4 py-3 min-w-[160px]">Delivery</th>}
              {modColVisible("deliveredAt") && <th className="px-4 py-3 min-w-[160px]"><SortableHeader label="Delivered" field="deliveredAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
              {modColVisible("status") && <th className="px-4 py-3"><SortableHeader label="Status" field="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
              {modColVisible("documents") && <th className="px-4 py-3">Documents</th>}
              {modColVisible("purchaseBalance") && <th className="px-4 py-3 text-right">Purchase balance</th>}
              {modColVisible("purchasePayment") && <th className="px-4 py-3">Purchase payment</th>}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageList.map((o) => (
              <tr key={o.id} className="border-t border-border bg-card">
                <td className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-semibold text-slate-900">{o.orderNo}</span>
                    {isNewSubmitted(o.id, o.status) ? (
                      <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950 shadow-sm">
                        New
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-base font-semibold text-slate-800">{o.contactPerson}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-800">{formatDateDdMmYyyyOrDash(o.orderDate)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-800">{formatDateDdMmYyyyOrDash(o.deliveryDate)}</td>
                <td className="px-4 py-3 text-sm text-slate-800">
                  <OrderScheduledDeliveryCell order={o} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-800">
                  <OrderDeliveredAtCell order={o} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={o.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {o.challanGenerated ? (
                      <Link
                        to={`/moderator/challans/${o.id}`}
                        className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        View challan
                      </Link>
                    ) : null}
                    {hasPurchaseInvoice(o) ? (
                      <Link
                        to={`/moderator/purchase-invoices/${o.id}`}
                        className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        View purchase invoice
                      </Link>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  ৳ {Math.round(purchaseBalanceOf(o.id)).toLocaleString("en-US")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      purchasePaymentStatusOf(o.id) === "Paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : purchasePaymentStatusOf(o.id) === "Partial"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {purchasePaymentStatusOf(o.id)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className={tableActionsWideSingle()}>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-primary hover:text-primary" asChild title="Open order">
                      <Link to={`/moderator/orders/${o.id}`} aria-label="Open order">
                        <FileBadge2 className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  <div className={tableActionsTightSingle()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label="Order actions">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem asChild>
                          <Link to={`/moderator/orders/${o.id}`} className="flex cursor-pointer items-center gap-2">
                            <FileBadge2 className="h-4 w-4" />
                            Open
                          </Link>
                        </DropdownMenuItem>
                          {hasPurchaseInvoice(o) ? (
                            <DropdownMenuItem asChild>
                              <Link to={`/moderator/purchase-invoices/${o.id}`} className="flex cursor-pointer items-center gap-2">
                                <FileBadge2 className="h-4 w-4" />
                                Purchase invoice
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          {hasPurchaseInvoice(o) ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setAdjustOrderId(o.id);
                                setAdjustInput(String(Math.round(paidPurchaseOf(o.id))));
                              }}
                            >
                              Adjust payment
                            </DropdownMenuItem>
                          ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
          {pageList.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No orders match your search or filters.</p>
          ) : null}
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {pageList.map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-semibold text-slate-900">{o.orderNo}</p>
                  {isNewSubmitted(o.id, o.status) ? (
                    <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-950">
                      New
                    </span>
                  ) : null}
                </div>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-2 text-sm font-medium text-slate-700">Customer: {o.contactPerson}</p>
              <p className="mt-1 text-xs text-slate-600">
                Order date: <span className="font-medium text-slate-800">{formatDateDdMmYyyyOrDash(o.orderDate)}</span>
                {" · "}
                Delivery date: <span className="font-medium text-slate-800">{formatDateDdMmYyyyOrDash(o.deliveryDate)}</span>
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery</p>
              <div className="text-sm text-slate-800">
                <OrderScheduledDeliveryCell order={o} />
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Delivered</p>
              <div className="text-sm text-slate-800">
                <OrderDeliveredAtCell order={o} />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Balance: <span className="font-semibold text-slate-900">৳ {Math.round(purchaseBalanceOf(o.id)).toLocaleString("en-US")}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {o.challanGenerated ? (
                  <Link
                    to={`/moderator/challans/${o.id}`}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800"
                  >
                    View challan
                  </Link>
                ) : null}
                {hasPurchaseInvoice(o) ? (
                  <Link
                    to={`/moderator/purchase-invoices/${o.id}`}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800"
                  >
                    View purchase invoice
                  </Link>
                ) : null}
                <span
                  className={`rounded-full px-2.5 py-1 font-semibold ${
                    purchasePaymentStatusOf(o.id) === "Paid"
                      ? "bg-emerald-100 text-emerald-800"
                      : purchasePaymentStatusOf(o.id) === "Partial"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  Purchase payment: {purchasePaymentStatusOf(o.id)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={`/moderator/orders/${o.id}`}
                  className="inline-flex items-center gap-1 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white"
                >
                  <FileBadge2 className="h-4 w-4" />
                  Open
                </Link>
                {apiEnabled() ? (
                  <Link
                    to={`/moderator/orders/${o.id}/bookkeeping`}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800"
                  >
                    <Calendar className="h-4 w-4" />
                    Dates
                  </Link>
                ) : null}
                {hasPurchaseInvoice(o) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustOrderId(o.id);
                      setAdjustInput(String(Math.round(paidPurchaseOf(o.id))));
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-800"
                  >
                    Adjust payment
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {pageList.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No orders match your search or filters.</p>
          ) : null}
        </div>
        {sorted.length > 0 ? (
          <PaginationControls
            totalItems={sorted.length}
            page={safePage}
            perPage={pageSize}
            onPageChange={setPage}
            onPerPageChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        ) : null}
      </div>

      {adjustOrder ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Adjust purchase payment</h3>
            <p className="mt-1 text-sm text-slate-600">
              {adjustOrder.orderNo} · {adjustOrder.contactPerson}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Purchase total</p>
                <p className="text-sm font-semibold text-slate-900">
                  ৳ {Math.round(purchaseAmountOf(adjustOrder.id)).toLocaleString("en-US")}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Paid</p>
                <p className="text-sm font-semibold text-slate-900">
                  ৳ {Math.round(paidPurchaseOf(adjustOrder.id)).toLocaleString("en-US")}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Pending</p>
                <p className="text-sm font-semibold text-slate-900">
                  ৳ {Math.round(purchaseBalanceOf(adjustOrder.id)).toLocaleString("en-US")}
                </p>
              </div>
            </div>
            <label className="mt-5 block text-sm font-semibold text-slate-600">
              Set paid amount
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={adjustInput}
                onChange={(e) => setAdjustInput(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg tabular-nums"
                placeholder="Enter total paid amount (decimals allowed)"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdjustOrderId(null);
                  setAdjustInput("");
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePurchaseAdjustment}
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Save adjustment
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
