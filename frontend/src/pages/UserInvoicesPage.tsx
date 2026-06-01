import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useOrders } from "../context/OrdersContext";
import { PaginationControls } from "../components/PaginationControls";
import { hasBillingInvoice } from "../lib/invoiceFlow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateDdMmYyyy, formatDateDdMmYyyyOrDash } from "../lib/formatDisplayDate";
import { apiEnabled } from "../lib/api";

type InvoiceFilter = "all" | "paid" | "pending" | "overdue";

type InvoiceRow = {
  id: string;
  invoiceNo: string;
  orderNo: string;
  customer: string;
  customerEmail: string;
  /** Display `dd-mm-yyyy` from order row. */
  orderDate: string;
  /** Display `dd-mm-yyyy` from order row. */
  deliveryDate: string;
  /** Display `dd-mm-yyyy`. */
  dueDate: string;
  /** Calendar `yyyy-mm-dd` for sorting and overdue checks (same as order date in this list). */
  issueDateIso: string;
  dueDateIso: string;
  amount: number;
  remaining: number;
  paymentStatus: Exclude<InvoiceFilter, "all">;
  challanGenerated: boolean;
  invoiceAvailable: boolean;
};

export function UserInvoicesPage() {
  const { orders } = useOrders();
  const { user, listAccounts } = useAuth();
  if (user?.role === "moderator") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-bold text-slate-900">Invoice access restricted</h1>
        <p className="mt-2 text-sm text-slate-600">
          Moderator can mark orders as delivered for invoicing but cannot view invoice lists.
        </p>
      </div>
    );
  }
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const accountEmailByName = useMemo(() => {
    const m = new Map<string, string>();
    listAccounts().forEach((a) => {
      if (a.name?.trim()) m.set(a.name.trim().toLowerCase(), a.email);
    });
    return m;
  }, [listAccounts]);

  const rows = useMemo<InvoiceRow[]>(() => {
    const visible = orders
      .filter(
        (o) => o.ownerId === user?.id || user?.role === "admin" || user?.role === "master_admin",
      )
      .filter((o) => hasBillingInvoice(o))
      .sort((a, b) => (a.orderDate || "").localeCompare(b.orderDate || ""))
      .map((o) => {
        const issue = parseIso(o.orderDate) ?? new Date();
        const due = new Date(issue);
        due.setDate(due.getDate() + 7);
        const issueIso = formatIso(issue);
        const dueIso = formatIso(due);
        const amount = Math.max(
          0,
          o.grandTotal ??
            o.lines.reduce((sum, l) => {
              const line = Number(l.lineTotal ?? 0);
              return sum + (Number.isFinite(line) ? line : 0);
            }, 0),
        );
        /** Same source as admin billing settlement: API `billingAmountDue` / `billingNetPaid`. */
        let remaining = amount;
        if (o.billingAmountDue != null && Number.isFinite(o.billingAmountDue)) {
          remaining = Math.max(0, o.billingAmountDue);
        } else if (o.billingNetPaid != null && Number.isFinite(o.billingNetPaid)) {
          remaining = Math.max(0, amount - o.billingNetPaid);
        }
        const digits = o.orderNo.replace(/\D/g, "");
        const invoiceNo = `INV-${(digits || o.id.replace(/\D/g, "")).slice(-5).padStart(5, "0")}`;
        const customer = o.contactPerson || "Unknown customer";
        const customerEmail = accountEmailByName.get(customer.trim().toLowerCase()) ?? "—";
        return {
          id: o.id,
          invoiceNo,
          orderNo: o.orderNo,
          customer,
          customerEmail,
          orderDate: formatDateDdMmYyyyOrDash(o.orderDate),
          deliveryDate: formatDateDdMmYyyyOrDash(o.deliveryDate),
          dueDate: formatDateDdMmYyyy(dueIso),
          issueDateIso: issueIso,
          dueDateIso: dueIso,
          amount,
          remaining,
          paymentStatus: "pending" as const,
          challanGenerated: Boolean(o.challanGenerated),
          invoiceAvailable: hasBillingInvoice(o),
        };
      });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return visible
      .map((r) => {
        const due = parseIso(r.dueDateIso);
        const overdue = Boolean(due && due.getTime() < today.getTime() && r.remaining > 0);
        const paymentStatus: InvoiceRow["paymentStatus"] = r.remaining <= 0 ? "paid" : overdue ? "overdue" : "pending";
        return {
          ...r,
          paymentStatus,
        };
      })
      .sort((a, b) => b.issueDateIso.localeCompare(a.issueDateIso));
  }, [orders, user, accountEmailByName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.paymentStatus !== filter) return false;
      if (!q) return true;
      return (
        r.invoiceNo.toLowerCase().includes(q) ||
        r.orderNo.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.customerEmail.toLowerCase().includes(q) ||
        r.orderDate.toLowerCase().includes(q) ||
        r.deliveryDate.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageList = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const countBy = useMemo(
    () => ({
      all: rows.length,
      paid: rows.filter((r) => r.paymentStatus === "paid").length,
      pending: rows.filter((r) => r.paymentStatus === "pending").length,
      overdue: rows.filter((r) => r.paymentStatus === "overdue").length,
    }),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "All"],
              ["paid", "Paid"],
              ["pending", "Pending"],
              ["overdue", "Overdue"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFilter(id);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                filter === id
                  ? "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                  : "bg-card text-slate-500 hover:bg-muted hover:text-foreground"
              }`}
            >
              {label} {countBy[id] > 0 ? `(${countBy[id]})` : ""}
            </button>
          ))}
        </div>
        {apiEnabled() ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Paid</span> uses the same rule as admin billing: recorded
            customer payments (minus adjustments) up to the invoice total.{" "}
            <span className="font-medium text-foreground">Pending</span> means there is still an amount due on that
            invoice.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search invoices..."
              className="h-9 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              Columns
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="hidden table-scroll md:block">
          <table className="min-w-[1040px] w-full text-left text-sm">
            <thead className="bg-muted text-xs font-semibold uppercase tracking-wide text-foreground">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" aria-label="Select all invoices" className="h-4 w-4 rounded border-border" />
                </th>
                <th className="px-3 py-3">Invoice</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3 whitespace-nowrap">Order date</th>
                <th className="px-3 py-3 whitespace-nowrap">Delivery date</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Due date</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="w-12 px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageList.map((r) => (
                <tr key={r.id} className="border-t border-border bg-card">
                  <td className="px-3 py-3">
                    <input type="checkbox" aria-label={`Select ${r.invoiceNo}`} className="h-4 w-4 rounded border-border" />
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-mono text-sm font-semibold text-slate-900">{r.invoiceNo}</p>
                    <p className="text-xs text-slate-500">{r.orderNo}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-900">{r.customer}</p>
                    <p className="text-xs text-slate-500">{r.customerEmail}</p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-700">{r.orderDate}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-700">{r.deliveryDate}</td>
                  <td className="px-3 py-3">
                    <InvoiceStatusChip status={r.paymentStatus} />
                  </td>
                  <td className="px-3 py-3 text-slate-700">{r.dueDate}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">
                    {`৳ ${Math.round(r.amount).toLocaleString("en-US")}`}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild>
                          <Link to={`/user/invoices/${r.id}`} className="cursor-pointer">
                            View invoice
                          </Link>
                        </DropdownMenuItem>
                        {r.challanGenerated ? (
                          <DropdownMenuItem asChild>
                            <Link to={`/user/challans/${r.id}`} className="cursor-pointer">
                              View challan
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled>{r.invoiceAvailable ? "Invoice generated" : "Invoice pending"}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {pageList.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{r.invoiceNo}</p>
                  <p className="text-xs text-slate-500">{r.orderNo}</p>
                </div>
                <InvoiceStatusChip status={r.paymentStatus} />
              </div>
              <p className="mt-2 text-sm font-medium text-slate-900">{r.customer}</p>
              <p className="text-xs text-slate-500">{r.customerEmail}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
                <div>
                  <p className="font-semibold">Order date</p>
                  <p>{r.orderDate}</p>
                </div>
                <div>
                  <p className="font-semibold">Delivery date</p>
                  <p>{r.deliveryDate}</p>
                </div>
                <div>
                  <p className="font-semibold">Due</p>
                  <p>{r.dueDate}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-600">Amount</span>
                <span className="font-bold text-slate-900">{`৳ ${Math.round(r.amount).toLocaleString("en-US")}`}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/user/invoices/${r.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900">
                  View invoice
                </Link>
                {r.challanGenerated ? (
                  <Link to={`/user/challans/${r.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900">
                    View challan
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No invoices match your filters.</p>
        ) : null}

        {filtered.length > 0 ? (
          <PaginationControls
            totalItems={filtered.length}
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
    </div>
  );
}

function InvoiceStatusChip({ status }: { status: "paid" | "pending" | "overdue" }) {
  const style =
    status === "paid"
      ? "bg-emerald-600 text-white"
      : status === "overdue"
        ? "bg-red-600 text-white"
        : "bg-slate-200 text-slate-800";
  const label = status === "paid" ? "Paid" : status === "overdue" ? "Overdue" : "Pending";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}

function parseIso(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
