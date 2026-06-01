import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { BanglaInvoiceTemplate } from "../components/BanglaInvoiceTemplate";
import { toBanglaDigits } from "../lib/banglaNumerals";
import { formatDateTimeDdMmYyyy } from "../lib/formatDisplayDate";
import { useOrders } from "../context/OrdersContext";
import { hasPurchaseInvoice } from "../lib/invoiceFlow";

export function PurchaseInvoiceDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { getById } = useOrders();
  const order = id ? getById(id) : undefined;
  const isAdmin = location.pathname.startsWith("/admin/");
  const backTo = isAdmin ? "/admin/purchase-invoices" : "/moderator/orders";
  const deliveredAtText = order?.deliveredAt
    ? toBanglaDigits(formatDateTimeDdMmYyyy(order.deliveredAt))
    : "Not marked delivered yet";

  useEffect(() => {
    if (!order) return;
    const prevTitle = document.title;
    document.body.classList.add("print-isolated");
    document.title = `Purchase-Invoice-${order.orderNo}`;
    return () => {
      document.body.classList.remove("print-isolated");
      document.title = prevTitle;
    };
  }, [order]);

  if (!order) {
    return (
      <div className="rounded-2xl border border-border bg-muted p-8 text-center">
        <p className="text-slate-700">Order not found.</p>
        <Link to={backTo} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">
          <ArrowLeft className="h-4 w-4" />
          Purchase invoices
        </Link>
      </div>
    );
  }

  if (!hasPurchaseInvoice(order)) {
    return (
      <div className="rounded-2xl border border-border bg-muted p-8 text-center">
        <p className="text-slate-700">Purchase invoice is not available for this order yet.</p>
        <Link to={backTo} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">
          <ArrowLeft className="h-4 w-4" />
          Purchase invoices
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 print:space-y-0">
      <Link to={backTo} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-foreground print:hidden">
        <ArrowLeft className="h-4 w-4" />
        Purchase invoices
      </Link>

      <section className="space-y-3 print:space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted px-4 py-3 print:hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-lg font-extrabold text-amber-700">
              ৳
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">Purchase invoice preview</h2>
              <p className="text-xs text-foreground">Procurement cost document</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              Delivered at: {deliveredAtText}
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Print
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
            >
              Save as PDF
            </button>
          </div>
        </div>
        <div className="print-invoice-only print:p-0">
          <BanglaInvoiceTemplate order={order} invoiceType="purchase" />
        </div>
      </section>
    </div>
  );
}

