import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { ArrowLeft, Receipt, User } from "lucide-react";
import { BanglaInvoiceTemplate } from "../components/BanglaInvoiceTemplate";
import { StatusBadge } from "../components/StatusBadge";
import { useOrders } from "../context/OrdersContext";
import { formatMoneyBn } from "../lib/banglaNumerals";
import { billedAmountsForLine } from "../lib/billingLineAmounts";
import { hasBillingInvoice } from "../lib/invoiceFlow";

export function UserInvoiceDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { getById } = useOrders();
  const order = id ? getById(id) : undefined;
  const backTo = location.pathname.startsWith("/admin/") ? "/admin/billing-invoices" : "/user/invoices";

  useEffect(() => {
    if (!order) return;
    const prevTitle = document.title;
    document.body.classList.add("print-isolated");
    document.title = `Invoice-${order.orderNo}`;
    return () => {
      document.body.classList.remove("print-isolated");
      document.title = prevTitle;
    };
  }, [order]);

  const lineCount = order?.lines.length ?? 0;
  const subtotal = useMemo(() => {
    if (!order) return 0;
    const fromOrder = order.billingSubtotal ?? order.grandTotal;
    if (Number.isFinite(Number(fromOrder)) && Number(fromOrder) > 0) return Number(fromOrder);
    const markups = order.billingCategoryMarkups ?? {};
    const globalPct = Number(order.markupPercent ?? 0);
    return order.lines.reduce(
      (s, l) => s + billedAmountsForLine(l, markups, globalPct).billedLine,
      0,
    );
  }, [order]);
  const printDoc = () => window.print();
  const saveAsPdf = () => window.print();

  const hasInvoice = order && hasBillingInvoice(order);

  if (!order) {
    return (
      <div className="rounded-2xl border border-border bg-muted p-8 text-center">
        <p className="text-slate-700">Order not found.</p>
        <Link
          to={backTo}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Billing documents
        </Link>
      </div>
    );
  }

  if (!hasInvoice) {
    return (
      <div className="rounded-2xl border border-border bg-muted p-8 text-center">
        <p className="text-slate-700">Invoice is not available for this order yet.</p>
        <Link
          to={backTo}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Billing documents
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 print:space-y-0">
      <Link
        to={backTo}
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Billing documents
      </Link>

      <div className="rounded-3xl border border-border bg-primary p-6 text-primary-foreground shadow-xl sm:p-8 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground">E-invoice</p>
            <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight sm:text-3xl">{order.orderNo}</h1>
            <p className="mt-2 flex items-center gap-2 text-primary-foreground">
              <User className="h-4 w-4 shrink-0" />
              <span className="font-medium text-primary-foreground">{order.contactPerson}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={order.status} />
            <div className="flex flex-wrap justify-end gap-2 text-xs font-medium text-primary-foreground">
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-900">
                {lineCount} line{lineCount !== 1 ? "s" : ""}
              </span>
              <span className="rounded-full bg-blue-800 px-3 py-1 text-white">Invoice</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 print:hidden">
        <div className="rounded-2xl border border-border bg-muted p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Lines</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{lineCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Line total (sum)</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">
            {subtotal > 0 ? `৳ ${formatMoneyBn(Math.round(subtotal), { minFractionDigits: 0, maxFractionDigits: 0 })}` : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-muted p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Grand total</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">
            {order.grandTotal != null
              ? `৳ ${formatMoneyBn(Math.round(order.grandTotal), { minFractionDigits: 0, maxFractionDigits: 0 })}`
              : "—"}
          </p>
        </div>
      </div>

      <section className="space-y-3 print:space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted px-4 py-3 print:hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-primary">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">Invoice preview</h2>
              <p className="text-xs text-foreground">Final billing document</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={printDoc}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Print
            </button>
            <button
              type="button"
              onClick={saveAsPdf}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
            >
              Save as PDF
            </button>
          </div>
        </div>
        <div className="print-invoice-only print:p-0">
          <BanglaInvoiceTemplate order={order} />
        </div>
      </section>
    </div>
  );
}
