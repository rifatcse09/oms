import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { DeliveryChallanTemplate } from "../components/DeliveryChallanTemplate";
import { useOrders } from "../context/OrdersContext";

export function UserChallanDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { getById } = useOrders();
  const order = id ? getById(id) : undefined;
  const backTo = location.pathname.startsWith("/admin/")
    ? "/admin/orders"
    : location.pathname.startsWith("/moderator/")
      ? "/moderator/orders"
      : "/user/orders";

  useEffect(() => {
    if (!order) return;
    const prevTitle = document.title;
    document.body.classList.add("print-isolated");
    document.title = `Challan-${order.orderNo}`;
    return () => {
      document.body.classList.remove("print-isolated");
      document.title = prevTitle;
    };
  }, [order]);

  if (!order || !order.challanGenerated) {
    return (
      <div className="rounded-2xl border border-border bg-muted p-8 text-center">
        <p className="text-slate-700">Challan is not available for this order yet.</p>
        <Link
          to={backTo}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 print:space-y-0">
      <Link
        to={backTo}
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <section className="space-y-3 print:space-y-0">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted px-4 py-3 print:hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-emerald-950">Challan preview</h2>
              <p className="text-xs text-emerald-900">Delivery document (quantities)</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
        <div className="print-doc-only print:p-0">
          <DeliveryChallanTemplate order={order} />
        </div>
      </section>
    </div>
  );
}
