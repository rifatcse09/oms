import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  tableActionsContainerClass,
  tableActionsTightSingle,
  tableActionsWideSingle,
} from "@/lib/tableActionsLayout";
import {
  Eye,
  MoreVertical,
  Search,
  Trash2,
  Truck,
  UserCog,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import {
  ExportToolbar,
  useColumnVisibility,
} from "../components/ExportToolbar";
import {
  OrderDeliveredAtCell,
  OrderScheduledDeliveryCell,
} from "../components/OrderDeliveryTableCells";
import { PaginationControls } from "../components/PaginationControls";
import {
  SortableHeader,
  nextSort,
  sortRows,
  type SortDir,
} from "../components/SortableHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useOrders } from "../context/OrdersContext";
import {
  apiAssignOrder,
  apiDeleteOrder,
  apiEnabled,
  apiMarkOrderDelivered,
} from "../lib/api";
import { hasBillingInvoice, hasPurchaseInvoice } from "../lib/invoiceFlow";
import {
  NOTIFICATIONS_EVENT,
  readAdminNotifyOrderIds,
} from "../lib/orderNotifications";
import { isAdministrationRole, type Order, type OrderStatus } from "../types";

const statusFilters: { value: "all" | OrderStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafted" },
  { value: "submitted", label: "Ordered" },
  { value: "under_review", label: "Processing" },
  { value: "delivered", label: "Delivered" },
  { value: "invoiced", label: "Completed" },
];

function canMarkDelivered(o: Order): boolean {
  return o.status === "submitted" || o.status === "under_review";
}

function formatCreatorRoleLabel(role: string): string {
  const map: Record<string, string> = {
    user: "Customer",
    moderator: "Moderator",
    admin: "Admin",
    master_admin: "Master admin",
  };
  return map[role] ?? role.replace(/_/g, " ");
}

function OrderCreatedByCell({ order }: { order: Order }) {
  const name = order.createdByName?.trim();
  const role = order.createdByRole?.trim();
  if (!name && !role) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="text-sm leading-snug text-slate-800">
      <span className="font-semibold">{name || "Unknown"}</span>
      {role ? (
        <span className="text-slate-500">
          {" "}
          · {formatCreatorRoleLabel(role)}
        </span>
      ) : null}
    </div>
  );
}

function AssignModeratorSelect({
  order,
  onChanged,
}: {
  order: Order;
  onChanged: () => void;
}) {
  const { listAccounts } = useAuth();
  const [busy, setBusy] = useState(false);
  const moderators = listAccounts().filter(
    (a) => a.role === "moderator" && a.isActive !== false,
  );
  if (!apiEnabled()) {
    const assigned = moderators.find((m) => m.id === order.assignedModeratorId);
    return (
      <span className="text-xs text-slate-500">
        {assigned ? assigned.name : "—"}
      </span>
    );
  }
  return (
    <select
      value={order.assignedModeratorId ?? ""}
      disabled={busy}
      onChange={async (e) => {
        const val = e.target.value || null;
        setBusy(true);
        try {
          await apiAssignOrder(order.id, val);
          onChanged();
        } catch {
          // ignore
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm disabled:opacity-50"
    >
      <option value="">— Unassigned —</option>
      {moderators.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

const adminDocLinkClass =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold leading-none";

function AdminDocCell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-8 items-center">{children}</div>;
}

export function AdminOrdersPage() {
  const { user, listAccounts } = useAuth();
  const { orders, loadOrders, deleteOrder } = useOrders();
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
  const [adminNewIds, setAdminNewIds] = useState(() =>
    readAdminNotifyOrderIds(),
  );
  const location = useLocation();
  const [deliverBusyId, setDeliverBusyId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [showDeletedOrders, setShowDeletedOrders] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [assignTarget, setAssignTarget] = useState<Order | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (field: string) => {
    const next = nextSort({ key: sortKey, dir: sortDir }, field);
    setSortKey(next.key);
    setSortDir(next.dir);
    setPage(1);
  };

  const ORDER_COLS = [
    { key: "orderNo", label: "Order" },
    { key: "contactPerson", label: "Customer" },
    { key: "createdByName", label: "Created by" },
    { key: "deliveryDate", label: "Delivery" },
    { key: "deliveredAt", label: "Delivered" },
    { key: "status", label: "Status" },
    { key: "moderator", label: "Moderator" },
    { key: "challan", label: "Challan" },
    { key: "purchaseInvoice", label: "Purchase invoice" },
    { key: "billingInvoice", label: "Billing invoice" },
  ];
  const {
    visibleColumns: orderVisibleCols,
    toggleColumn: toggleOrderCol,
    isVisible: orderColVisible,
  } = useColumnVisibility(ORDER_COLS);

  const getOrderData = () => {
    const accounts = listAccounts();
    const headers = ORDER_COLS.filter((c) => orderColVisible(c.key)).map(
      (c) => c.label,
    );
    const rows = sorted.map((o) => {
      const cols: string[] = [];
      if (orderColVisible("orderNo")) cols.push(o.orderNo);
      if (orderColVisible("contactPerson")) cols.push(o.contactPerson);
      if (orderColVisible("createdByName")) cols.push(o.createdByName ?? "");
      if (orderColVisible("deliveryDate")) cols.push(o.deliveryDate ?? "");
      if (orderColVisible("deliveredAt")) cols.push(o.deliveredAt ?? "");
      if (orderColVisible("status")) cols.push(o.status);
      if (orderColVisible("moderator")) {
        const mod = accounts.find((a) => a.id === o.assignedModeratorId);
        cols.push(mod ? mod.name : "");
      }
      if (orderColVisible("challan"))
        cols.push(o.challanGenerated ? "Yes" : "No");
      if (orderColVisible("purchaseInvoice"))
        cols.push(hasPurchaseInvoice(o) ? "Yes" : "No");
      if (orderColVisible("billingInvoice"))
        cols.push(hasBillingInvoice(o) ? "Yes" : "No");
      return cols;
    });
    return { headers, rows };
  };

  const mode = useMemo<"orders" | "purchase" | "billing">(() => {
    if (location.pathname.startsWith("/admin/purchase-invoices"))
      return "purchase";
    if (location.pathname.startsWith("/admin/billing-invoices"))
      return "billing";
    return "orders";
  }, [location.pathname]);

  const canAdminPanel = !!(user && isAdministrationRole(user.role));
  const listLoadOpts = useMemo(
    () =>
      canAdminPanel && showDeletedOrders
        ? { includeDeleted: true as const }
        : undefined,
    [canAdminPanel, showDeletedOrders],
  );

  useEffect(() => {
    void loadOrders(listLoadOpts);
  }, [loadOrders, listLoadOpts]);

  async function softDeleteOrderFromList(o: Order) {
    if (o.deletedAt) return;
    setListError(null);
    try {
      if (apiEnabled()) {
        await apiDeleteOrder(o.id);
        await loadOrders(listLoadOpts);
      } else {
        deleteOrder(o.id);
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Soft-delete failed.");
    }
  }

  useEffect(() => {
    const sync = () => setAdminNewIds(readAdminNotifyOrderIds());
    window.addEventListener(NOTIFICATIONS_EVENT, sync);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, sync);
  }, []);

  useEffect(() => {
    setPage(1);
    if (mode === "purchase") setDocFilter("purchase_yes");
    else if (mode === "billing") setDocFilter("billing_yes");
    else setDocFilter("all");
  }, [mode]);

  async function markOrderDelivered(o: Order) {
    if (!apiEnabled()) return;
    setListError(null);
    setDeliverBusyId(o.id);
    try {
      await apiMarkOrderDelivered(o.id);
      await loadOrders(listLoadOpts);
    } catch (e) {
      setListError(
        e instanceof Error ? e.message : "Could not mark order as delivered.",
      );
    } finally {
      setDeliverBusyId(null);
    }
  }

  const customers = useMemo(
    () =>
      [
        ...new Set(orders.map((o) => o.contactPerson?.trim()).filter(Boolean)),
      ].sort((a, b) => String(a).localeCompare(String(b))),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (customer !== "all" && o.contactPerson !== customer) return false;
      if (docFilter === "challan_yes" && !o.challanGenerated) return false;
      if (docFilter === "challan_no" && o.challanGenerated) return false;
      if (docFilter === "purchase_yes" && !hasPurchaseInvoice(o)) return false;
      if (docFilter === "purchase_no" && hasPurchaseInvoice(o)) return false;
      if (docFilter === "billing_yes" && !hasBillingInvoice(o)) return false;
      if (docFilter === "billing_no" && hasBillingInvoice(o)) return false;
      if (!q) return true;
      return (
        o.orderNo.toLowerCase().includes(q) ||
        o.contactPerson.toLowerCase().includes(q) ||
        (o.phone || "").toLowerCase().includes(q) ||
        o.deliveryAddress.toLowerCase().includes(q) ||
        (o.createdByName || "").toLowerCase().includes(q) ||
        (o.createdByRole || "").toLowerCase().includes(q) ||
        formatCreatorRoleLabel(o.createdByRole || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [orders, query, status, customer, docFilter, mode]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return sortRows(filtered, sortKey as keyof Order, sortDir);
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageList = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">
            {mode === "purchase"
              ? "Purchase invoice list"
              : mode === "billing"
                ? "Billing invoice list"
                : "Admin order list"}
          </h1>
          <p className="mt-1 text-base font-medium text-slate-600">
            {mode === "purchase"
              ? "Orders with purchase invoices. Track available and pending purchase documents."
              : mode === "billing"
                ? "Orders with billing invoices. Open invoice details and track pending billing documents."
                : "Admin can edit orders, add pricing, generate challan, purchase and billing invoices, and mark orders delivered. Scheduled and actual delivery appear in separate columns."}
          </p>
          {listError ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {listError}
            </p>
          ) : null}
        </div>
        <Link
          to="/admin/orders/new"
          className="inline-flex items-center rounded-xl bg-slate-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-600"
        >
          Create order
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="border-b border-border bg-card px-4 py-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {statusFilters.map((tab) => {
              const active = status === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setStatus(tab.value);
                    setPage(1);
                  }}
                  className={
                    active
                      ? "rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {canAdminPanel ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-3">
                <input
                  type="checkbox"
                  checked={showDeletedOrders}
                  onChange={(e) => {
                    setShowDeletedOrders(e.target.checked);
                    setPage(1);
                  }}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Show soft-deleted orders (removed from totals and normal lists)
              </label>
            ) : null}
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground sm:col-span-2 lg:col-span-1">
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
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-1">
              Documents
              <select
                value={docFilter}
                onChange={(e) => {
                  setDocFilter(e.target.value as typeof docFilter);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">All orders</option>
                <option value="challan_yes">Challan available</option>
                <option value="challan_no">Challan pending</option>
                <option value="purchase_yes">Purchase invoice available</option>
                <option value="purchase_no">Purchase invoice pending</option>
                <option value="billing_yes">Billing invoice available</option>
                <option value="billing_no">Billing invoice pending</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Showing{" "}
              <strong className="text-slate-700">{sorted.length}</strong> of{" "}
              {orders.length} orders
            </p>
            <ExportToolbar
              filename="orders-export"
              columns={ORDER_COLS}
              visibleColumns={orderVisibleCols}
              onToggleColumn={toggleOrderCol}
              getData={getOrderData}
            />
          </div>
        </div>

        <div
          className={tableActionsContainerClass("table-scroll hidden md:block")}
        >
          <table className="min-w-[1280px] w-full text-left text-base">
            <thead className="bg-muted text-sm font-semibold uppercase tracking-wide text-foreground">
              <tr>
                {orderColVisible("orderNo") && (
                  <th className="px-4 py-3">
                    <SortableHeader
                      label="Order"
                      field="orderNo"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                )}
                {orderColVisible("contactPerson") && (
                  <th className="px-4 py-3">
                    <SortableHeader
                      label="Customer"
                      field="contactPerson"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                )}
                {orderColVisible("createdByName") && (
                  <th className="px-4 py-3 min-w-[140px]">
                    <SortableHeader
                      label="Created by"
                      field="createdByName"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                )}
                {orderColVisible("deliveryDate") && (
                  <th className="px-4 py-3 min-w-[160px]">
                    <SortableHeader
                      label="Delivery"
                      field="deliveryDate"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                )}
                {orderColVisible("deliveredAt") && (
                  <th className="px-4 py-3 min-w-[160px]">
                    <SortableHeader
                      label="Delivered"
                      field="deliveredAt"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                )}
                {orderColVisible("status") && (
                  <th className="px-4 py-3">
                    <SortableHeader
                      label="Status"
                      field="status"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                )}
                {orderColVisible("moderator") && (
                  <th className="px-4 py-3 min-w-[160px]">Moderator</th>
                )}
                {orderColVisible("challan") && (
                  <th className="px-4 py-3">Challan</th>
                )}
                {orderColVisible("purchaseInvoice") && (
                  <th className="px-4 py-3">Purchase invoice</th>
                )}
                {orderColVisible("billingInvoice") && (
                  <th className="px-4 py-3">Billing invoice</th>
                )}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageList.map((o) => (
                <tr key={o.id} className="border-t border-border bg-card">
                  {orderColVisible("orderNo") && (
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-semibold text-slate-900">
                          {o.orderNo}
                        </span>
                        {adminNewIds.includes(o.id) ? (
                          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 shadow-sm">
                            New
                          </span>
                        ) : null}
                        {o.deletedAt ? (
                          <span className="rounded-full bg-slate-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            Deleted
                          </span>
                        ) : null}
                      </div>
                    </td>
                  )}
                  {orderColVisible("contactPerson") && (
                    <td className="px-4 py-3 align-middle text-base font-semibold text-slate-800">
                      {o.contactPerson}
                    </td>
                  )}
                  {orderColVisible("createdByName") && (
                    <td className="px-4 py-3 align-middle">
                      <OrderCreatedByCell order={o} />
                    </td>
                  )}
                  {orderColVisible("deliveryDate") && (
                    <td className="px-4 py-3 align-middle text-sm text-slate-800">
                      <OrderScheduledDeliveryCell order={o} />
                    </td>
                  )}
                  {orderColVisible("deliveredAt") && (
                    <td className="px-4 py-3 align-middle text-sm text-slate-800">
                      <OrderDeliveredAtCell order={o} />
                    </td>
                  )}
                  {orderColVisible("status") && (
                    <td className="px-4 py-3 align-middle">
                      <StatusBadge status={o.status} />
                    </td>
                  )}
                  {orderColVisible("moderator") && (
                    <td className="px-4 py-3 align-middle">
                      <AssignModeratorSelect
                        order={o}
                        onChanged={() => void loadOrders(listLoadOpts)}
                      />
                    </td>
                  )}
                  {orderColVisible("challan") && (
                    <td className="px-4 py-3 align-middle">
                      <AdminDocCell>
                        {o.challanGenerated ? (
                          <Link
                            to={`/admin/challans/${o.id}`}
                            title="Open delivery challan"
                            className={`${adminDocLinkClass} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
                          >
                            View challan
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </AdminDocCell>
                    </td>
                  )}
                  {orderColVisible("purchaseInvoice") && (
                    <td className="px-4 py-3 align-middle">
                      <AdminDocCell>
                        {hasPurchaseInvoice(o) ? (
                          <Link
                            to={`/admin/purchase-invoices/${o.id}`}
                            title="Open purchase invoice"
                            className={`${adminDocLinkClass} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`}
                          >
                            View purchase invoice
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </AdminDocCell>
                    </td>
                  )}
                  {orderColVisible("billingInvoice") && (
                    <td className="px-4 py-3 align-middle">
                      <AdminDocCell>
                        {hasBillingInvoice(o) ? (
                          <Link
                            to={`/admin/billing-invoices/${o.id}`}
                            title="Open billing invoice"
                            className={`${adminDocLinkClass} border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100`}
                          >
                            View invoice
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </AdminDocCell>
                    </td>
                  )}
                  <td className="px-4 py-3 align-middle text-right">
                    <div
                      className={`${tableActionsWideSingle()} flex flex-wrap items-center gap-1`}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-primary hover:text-primary"
                        asChild
                        title="Edit order"
                      >
                        <Link
                          to={`/admin/orders/${o.id}`}
                          aria-label="Edit order"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      {canAdminPanel && !o.deletedAt ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-red-600 hover:text-red-700"
                          title="Delete order"
                          aria-label="Delete order"
                          onClick={() => setDeleteTarget(o)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className={tableActionsTightSingle()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground"
                            aria-label="Order actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem asChild>
                            <Link
                              to={`/admin/orders/${o.id}`}
                              className="flex cursor-pointer items-center gap-2"
                            >
                              <Eye className="h-4 w-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          {hasPurchaseInvoice(o) ? (
                            <DropdownMenuItem asChild>
                              <Link
                                to={`/admin/purchase-invoices/${o.id}`}
                                className="flex cursor-pointer items-center gap-2"
                              >
                                <Eye className="h-4 w-4" />
                                Purchase invoice
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          {hasBillingInvoice(o) ? (
                            <DropdownMenuItem asChild>
                              <Link
                                to={`/admin/billing-invoices/${o.id}`}
                                className="flex cursor-pointer items-center gap-2"
                              >
                                <Eye className="h-4 w-4" />
                                Invoice details
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          {mode === "orders" &&
                          apiEnabled() &&
                          canMarkDelivered(o) ? (
                            <DropdownMenuItem
                              disabled={deliverBusyId === o.id}
                              className="cursor-pointer gap-2"
                              onSelect={(e) => {
                                e.preventDefault();
                                void markOrderDelivered(o);
                              }}
                            >
                              <Truck className="h-4 w-4" />
                              Mark delivery complete
                            </DropdownMenuItem>
                          ) : null}
                          {(user?.role === "admin" ||
                            user?.role === "master_admin" ||
                            user?.role === "moderator") &&
                          apiEnabled() ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="gap-2">
                                  <UserCog className="h-4 w-4" />
                                  Assign moderator
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {listAccounts()
                                    .filter(
                                      (a) =>
                                        a.role === "moderator" &&
                                        a.isActive !== false,
                                    )
                                    .map((mod) => (
                                      <DropdownMenuItem
                                        key={mod.id}
                                        disabled={
                                          o.assignedModeratorId === mod.id
                                        }
                                        onSelect={async () => {
                                          try {
                                            await apiAssignOrder(o.id, mod.id);
                                            await loadOrders();
                                          } catch {}
                                        }}
                                      >
                                        {mod.name}
                                      </DropdownMenuItem>
                                    ))}
                                  {o.assignedModeratorId && (
                                    <DropdownMenuItem
                                      className="text-muted-foreground"
                                      onSelect={async () => {
                                        try {
                                          await apiAssignOrder(o.id, null);
                                          await loadOrders();
                                        } catch {}
                                      }}
                                    >
                                      Unassign
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            </>
                          ) : null}
                          {canAdminPanel && !o.deletedAt ? (
                            <DropdownMenuItem
                              className="cursor-pointer gap-2 text-red-600 focus:text-red-600"
                              onSelect={() => setDeleteTarget(o)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete order
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
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              No orders match your search or filters.
            </p>
          ) : null}
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {pageList.map((o) => (
            <div
              key={o.id}
              className="rounded-2xl border border-border bg-white p-3.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {o.orderNo}
                  </p>
                  {adminNewIds.includes(o.id) ? (
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-950">
                      New
                    </span>
                  ) : null}
                  {o.deletedAt ? (
                    <span className="rounded-full bg-slate-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Deleted
                    </span>
                  ) : null}
                </div>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-2 text-sm font-medium text-slate-700">
                Customer: {o.contactPerson}
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Created by
              </p>
              <OrderCreatedByCell order={o} />
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Delivery
              </p>
              <div className="text-sm text-slate-800">
                <OrderScheduledDeliveryCell order={o} />
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Delivered
              </p>
              <div className="text-sm text-slate-800">
                <OrderDeliveredAtCell order={o} />
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Moderator
              </p>
              <div className="mt-1">
                <AssignModeratorSelect
                  order={o}
                  onChanged={() => void loadOrders(listLoadOpts)}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {o.challanGenerated ? (
                  <Link
                    to={`/admin/challans/${o.id}`}
                    title="Open delivery challan"
                    className={`${adminDocLinkClass} border-emerald-200 bg-emerald-50 text-emerald-800`}
                  >
                    View challan
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">—</span>
                )}
                {hasPurchaseInvoice(o) ? (
                  <Link
                    to={`/admin/purchase-invoices/${o.id}`}
                    title="Open purchase invoice"
                    className={`${adminDocLinkClass} border-amber-200 bg-amber-50 text-amber-800`}
                  >
                    View purchase invoice
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">—</span>
                )}
                {hasBillingInvoice(o) ? (
                  <Link
                    to={`/admin/billing-invoices/${o.id}`}
                    title="Open billing invoice"
                    className={`${adminDocLinkClass} border-blue-200 bg-blue-50 text-blue-800`}
                  >
                    View invoice
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">—</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={`/admin/orders/${o.id}`}
                  className="inline-flex rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-white"
                >
                  Edit
                </Link>
                {canAdminPanel && !o.deletedAt ? (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(o)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-800"
                    title="Delete order"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                ) : null}
                {mode === "orders" && apiEnabled() && canMarkDelivered(o) ? (
                  <button
                    type="button"
                    disabled={deliverBusyId === o.id}
                    onClick={() => void markOrderDelivered(o)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-teal-600 bg-teal-50 px-3.5 py-2 text-sm font-semibold text-teal-900 disabled:opacity-50"
                  >
                    <Truck className="h-4 w-4" />
                    Mark delivery complete
                  </button>
                ) : null}
              </div>
              {o.challanGenerated ? (
                <Link
                  to={`/admin/challans/${o.id}`}
                  className="mt-2 inline-flex rounded-xl border border-border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700"
                >
                  View challan
                </Link>
              ) : null}
              {hasPurchaseInvoice(o) ? (
                <Link
                  to={`/admin/purchase-invoices/${o.id}`}
                  className="mt-2 inline-flex rounded-xl border border-border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700"
                >
                  Purchase invoice
                </Link>
              ) : null}
              {hasBillingInvoice(o) ? (
                <Link
                  to={`/admin/billing-invoices/${o.id}`}
                  className="mt-2 inline-flex rounded-xl border border-border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700"
                >
                  Invoice details
                </Link>
              ) : null}
            </div>
          ))}
          {pageList.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No orders match your search or filters.
            </p>
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

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title="Delete order?"
        description={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.orderNo}? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const target = deleteTarget;
          setDeleteTarget(null);
          void softDeleteOrderFromList(target);
        }}
      />
    </div>
  );
}
