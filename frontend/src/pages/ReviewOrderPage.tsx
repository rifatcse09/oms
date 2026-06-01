import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Package,
  Pen,
  Phone,
  Truck,
  User,
} from "lucide-react";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { useOrders } from "../context/OrdersContext";
import { StatusBadge } from "../components/StatusBadge";
import { canEditOrder, validateLineQuantity } from "../lib/quantityRules";
import { formatOrderSubmittedAt } from "../lib/formatOrderSubmit";
import { formatDeliveryWindow } from "../lib/deliveryWindow";
import { formatDateDdMmYyyyOrDash } from "../lib/formatDisplayDate";
import { formatShortDeliveredAt } from "../lib/deliveryPunctuality";

function formatQty(kg: string, gram: string, piece: string) {
  const parts: string[] = [];
  if (piece && Number(piece) > 0) return `${piece} pcs`;
  if (kg && Number(kg) > 0) parts.push(`${kg} kg`);
  if (gram && Number(gram) > 0) parts.push(`${gram} g`);
  return parts.join(" + ") || "—";
}

export function ReviewOrderPage() {
  const { id } = useParams();
  const { loadOrders, getById, upsertOrder, deleteOrder } = useOrders();
  const navigate = useNavigate();
  const base = id ? getById(id) : undefined;
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const order = useMemo(() => {
    if (!base) return undefined;
    return { ...base };
  }, [base]);

  if (!order) {
    return (
      <div className="rounded-2xl border border-border bg-muted p-8 text-center">
        <p className="text-slate-700">Order not found.</p>
        <Link
          to="/user/orders"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to order list
        </Link>
      </div>
    );
  }

  const linesOk = order.lines.every(
    (l) => validateLineQuantity(l.kg, l.gram, l.piece) == null,
  );
  const deliveryOk = canEditOrder(order.deliveryDate, order.deliveryTime);
  const signed = Boolean(order.signatureDataUrl);

  const confirm = () => {
    if (!linesOk || !deliveryOk || !signed) return;
    upsertOrder({
      ...order,
      status: "submitted",
      signatureDataUrl: order.signatureDataUrl,
      submittedAt: order.submittedAt ?? new Date().toISOString(),
    });
    navigate("/user/orders");
  };

  const saveAsDraft = () => {
    upsertOrder({ ...order, status: "draft", signatureDataUrl: order.signatureDataUrl });
    navigate("/user/orders");
  };

  const lineCount = order.lines.length;
  const subtotal = order.lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  const canDeleteBeforeSubmit = order.status === "draft" && !order.submittedAt;
  const primaryBtn =
    "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:hover:bg-slate-100 dark:hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
  const secondaryBtn =
    "rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-muted";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/user/orders"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Order list
        </Link>
        <Link
          to={`/user/orders/${order.id}/edit`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-foreground"
        >
          Edit form
        </Link>
      </div>

      {!deliveryOk ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Delivery is within 24 hours; submission is not allowed.
        </div>
      ) : null}

      {/* Hero — same family as admin / moderator */}
      <div className="rounded-3xl border border-border bg-primary p-6 text-primary-foreground shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground">Review before submit</p>
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
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-muted p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Lines</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{lineCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Line total (sum)</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">
            {subtotal > 0 ? `৳ ${Math.round(subtotal).toLocaleString("en-US")}` : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-muted p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Grand total</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">
            {order.grandTotal != null ? `৳ ${Math.round(order.grandTotal).toLocaleString("en-US")}` : "—"}
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-primary">
            <Package className="h-5 w-5" />
          </span>
          Order details
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <DetailTile icon={Calendar} label="Order date" value={formatDateDdMmYyyyOrDash(order.orderDate)} />
          <DetailTile icon={Calendar} label="Submitted" value={formatOrderSubmittedAt(order)} />
          <DetailTile icon={Calendar} label="Delivery date" value={formatDateDdMmYyyyOrDash(order.deliveryDate)} />
          <DetailTile icon={Phone} label="Phone" value={order.phone} />
          <DetailTile icon={Clock} label="Time window" value={formatDeliveryWindow(order.deliveryTime)} />
          {order.status === "delivered" || order.status === "invoiced" ? (
            <DetailTile
              icon={Truck}
              label="Delivered"
              value={order.deliveredAt ? formatShortDeliveredAt(order.deliveredAt) : "Time will appear when recorded"}
            />
          ) : null}
          <div className="sm:col-span-2">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Billing address
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">{order.billingAddress}</p>
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Delivery address
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">{order.deliveryAddress}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-border bg-white shadow-card">
        <div className="border-b border-border bg-muted px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Package className="h-5 w-5 text-foreground" />
            Items
            <span className="ml-2 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
              Read-only
            </span>
          </h2>
        </div>
        <div className="table-scroll">
          <table className="min-w-[600px] w-full text-left text-base">
            <thead className="bg-muted text-sm uppercase tracking-wide text-foreground">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Instructions</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id} className="border-t border-border bg-card">
                  <td className="px-4 py-3.5 font-mono text-sm text-slate-600">{line.serial}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-slate-900">{line.itemNameEn}</p>
                    <p className="font-bn text-sm text-slate-500">{line.itemNameBn}</p>
                  </td>
                  <td className="px-4 py-3.5 text-slate-700">{formatQty(line.kg, line.gram, line.piece)}</td>
                  <td className="px-4 py-3.5 text-slate-700">{line.instructions?.trim() || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-primary">
            <Pen className="h-5 w-5" />
          </span>
          Signature
        </h2>
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          {order.signatureDataUrl ? (
            <img
              src={order.signatureDataUrl}
              alt="Signature"
              className="h-24 max-w-[280px] object-contain"
            />
          ) : (
            <p className="text-sm text-amber-800">
              No signature yet. Add one from the <strong>Edit form</strong> page before you can submit.
            </p>
          )}
        </div>
      </section>

      {!linesOk ? <p className="text-sm font-medium text-red-600">Some lines break quantity rules.</p> : null}
      {!signed ? <p className="text-sm font-medium text-amber-800">Signature is required to submit.</p> : null}

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <h2 className="text-base font-bold text-slate-900">Submit</h2>
        <p className="mt-1 text-sm text-slate-600">Save as draft, continue editing, or confirm your order</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to={`/user/orders/${order.id}/edit`} className={secondaryBtn}>
            Edit order
          </Link>
          <button type="button" onClick={saveAsDraft} className={secondaryBtn}>
            Save as draft
          </button>
          {canDeleteBeforeSubmit ? (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100"
            >
              Delete order
            </button>
          ) : null}
          <button type="button" disabled={!linesOk || !deliveryOk || !signed} onClick={confirm} className={primaryBtn}>
            Confirm &amp; submit
          </button>
        </div>
      </section>
      <ConfirmActionModal
        open={showDeleteModal}
        title="Delete order"
        description={`Are you sure you want to delete ${order.orderNo}? This action cannot be undone.`}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={() => {
          deleteOrder(order.id);
          setShowDeleteModal(false);
          navigate("/user/orders");
        }}
      />
    </div>
  );
}

function DetailTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </p>
      <p className="mt-2 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
