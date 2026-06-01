import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Package,
  Phone,
  Truck,
  User,
} from "lucide-react";
import { OrderLinesEditor } from "../components/OrderLinesEditor";
import {
  SearchableSelect,
  categoryOptionsFromCatalog,
  itemOptionsFromCatalogItems,
} from "../components/SearchableSelect";
import { useCatalog } from "../context/CatalogContext";
import { useOrders } from "../context/OrdersContext";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { formatOrderSubmittedAt } from "../lib/formatOrderSubmit";
import { clearAdminOrderNotification } from "../lib/orderNotifications";
import { nextOrderNo, todayIsoDate } from "../lib/orderNo";
import { formatDeliveryWindow, toTimeInputValue } from "../lib/deliveryWindow";
import { formatShortDeliveredAt } from "../lib/deliveryPunctuality";
import { formatDateDdMmYyyyOrDash } from "../lib/formatDisplayDate";
import { buildMarkupByItemPayload } from "../lib/billingMarkupPayload";
import {
  hasBillingInvoice,
  hasPurchaseInvoice,
  linesReadyForChallan,
  linesReadyForPurchaseInvoice,
} from "../lib/invoiceFlow";
import {
  apiCreateOrder,
  apiDeleteOrder,
  apiEnabled,
  apiGenerateBillingInvoice,
  apiGenerateChallan,
  apiGeneratePurchaseInvoice,
  apiListStaffCustomerAccounts,
  apiMarkOrderDelivered,
  apiUpdateOrder,
} from "../lib/api";
import { type Order, type SessionUser, isAdministrationRole } from "../types";
import { ConfirmActionModal } from "../components/ConfirmActionModal";

/** Compare draft to last server copy so we can gate workflow until Save. */
function orderFingerprint(o: Order): string {
  const lines = o.lines.map((l) => ({
    id: l.id,
    serial: l.serial,
    categoryId: l.categoryId,
    itemId: l.itemId,
    itemNameBn: l.itemNameBn,
    itemNameEn: l.itemNameEn,
    kg: l.kg,
    gram: l.gram,
    piece: l.piece,
    instructions: l.instructions ?? "",
    unitPrice: l.unitPrice ?? null,
    lineTotal: l.lineTotal ?? null,
    markupPercent: l.markupPercent ?? null,
    markupAmount: l.markupAmount ?? null,
    unitPriceAfterMarkup: l.unitPriceAfterMarkup ?? null,
    lineTotalAfterMarkup: l.lineTotalAfterMarkup ?? null,
    profitLossAmount: l.profitLossAmount ?? null,
  }));
  return JSON.stringify({
    ownerId: o.ownerId ?? "",
    orderDate: (o.orderDate ?? "").slice(0, 10),
    deliveryDate: (o.deliveryDate ?? "").slice(0, 10),
    deliveryTime: o.deliveryTime ?? "",
    billingAddress: o.billingAddress,
    deliveryAddress: o.deliveryAddress,
    contactPerson: o.contactPerson,
    phone: o.phone,
    lines,
  });
}

function makeAdminDraftOrder(owner: {
  id: string;
  name: string;
  phone: string;
  billingAddress: string;
  deliveryAddress: string;
}, nextNo: string): Order {
  return {
    id: crypto.randomUUID(),
    ownerId: owner.id,
    orderNo: nextNo,
    orderDate: todayIsoDate(),
    createdAt: new Date().toISOString(),
    deliveryDate: todayIsoDate(),
    status: "draft",
    billingAddress: owner.billingAddress || "—",
    deliveryAddress: owner.deliveryAddress || "—",
    contactPerson: owner.name,
    phone: owner.phone || "",
    lines: [],
    signatureDataUrl: null,
  };
}

export function AdminOrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const moderatorArea = location.pathname.startsWith("/moderator");
  const webBase = moderatorArea ? "/moderator" : "/admin";
  const staffOrdersListPath = `${webBase}/orders`;
  const isNew = id === "new" || !id;
  const navigate = useNavigate();
  const { listAccounts, user } = useAuth();
  const { categories, addCategory, addCustomItem } = useCatalog();
  const { loadOrders, getById, upsertOrder, deleteOrder } = useOrders();
  const [staffCustomerList, setStaffCustomerList] = useState<SessionUser[]>([]);
  const userAccounts = useMemo((): SessionUser[] => {
    const localUsers = listAccounts().filter((a) => a.role === "user");
    if (user?.role === "moderator" && apiEnabled() && staffCustomerList.length > 0) {
      return staffCustomerList;
    }
    return localUsers;
  }, [listAccounts, user?.role, staffCustomerList]);
  const base = !isNew && id ? getById(id) : undefined;
  const [order, setOrder] = useState(base);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [addRowModal, setAddRowModal] = useState(false);
  const [newCatBn, setNewCatBn] = useState("");
  const [newCatEn, setNewCatEn] = useState("");
  const [itemCat, setItemCat] = useState("");
  const [pickItem, setPickItem] = useState("");
  const [itemBn, setItemBn] = useState("");
  const [itemEn, setItemEn] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const [workflowSuccess, setWorkflowSuccess] = useState("");
  /** Each workflow action has its own busy flag so challan / purchase / billing never block one another. */
  const [challanBusy, setChallanBusy] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [markDeliverBusy, setMarkDeliverBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [lineItemError, setLineItemError] = useState("");
  const categoryMarkups = useMemo(() => {
    const map: Record<string, number> = {};
    categories.forEach((c) => {
      map[c.id] = Number(c.markupPercent ?? 0);
    });
    return map;
  }, [categories]);
  const itemsOf = useMemo(() => {
    const c = categories.find((x) => x.id === itemCat);
    return c?.items ?? [];
  }, [categories, itemCat]);
  const categorySelectOptions = useMemo(() => categoryOptionsFromCatalog(categories), [categories]);
  const itemSelectOptions = useMemo(() => itemOptionsFromCatalogItems(itemsOf), [itemsOf]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!apiEnabled() || !user || user.role !== "moderator") return;
    void apiListStaffCustomerAccounts()
      .then(setStaffCustomerList)
      .catch(() => setStaffCustomerList([]));
  }, [user]);

  /** Existing orders: only re-sync when the copy in OrdersContext changes (not on every render). */
  useEffect(() => {
    if (isNew) return;
    if (base) setOrder(base);
  }, [isNew, base]);

  /** New admin draft: init when user list is available; must not share deps with the sync above (unstable arrays used to reset edits). */
  useEffect(() => {
    if (!isNew) return;
    const firstUser = userAccounts[0];
    if (!firstUser) return;
    setOrder(
      makeAdminDraftOrder(
        {
          id: firstUser.id,
          name: firstUser.name,
          phone: firstUser.phone,
          billingAddress: firstUser.billingAddress,
          deliveryAddress: firstUser.deliveryAddress,
        },
        nextOrderNo(),
      ),
    );
  }, [isNew, userAccounts]);

  useEffect(() => {
    if (!order?.id) return;
    clearAdminOrderNotification(order.id);
  }, [order?.id]);

  const purchaseLinesReady = useMemo(
    () => linesReadyForPurchaseInvoice(order?.lines ?? []),
    [order?.lines],
  );
  const challanLinesReady = useMemo(() => linesReadyForChallan(order?.lines ?? []), [order?.lines]);

  /** Saved order snapshot + latest catalog/local defaults so rows don’t fall back to 0% when IDs align but storage was empty. */
  const billingMarkupMapForLines = useMemo(
    () => ({
      ...(order?.billingCategoryMarkups ?? {}),
      ...categoryMarkups,
    }),
    [order?.billingCategoryMarkups, categoryMarkups],
  );

  const isDeletedRecord = Boolean(order && !isNew && order.deletedAt);
  const isDirty = useMemo(() => {
    if (!order || isDeletedRecord) return false;
    if (isNew) return true;
    if (!base) return true;
    return orderFingerprint(order) !== orderFingerprint(base);
  }, [order, base, isNew, isDeletedRecord]);
  const workflowBlocked = isDirty || saveBusy;

  if (!order || (!isNew && !base)) {
    return (
      <div className="rounded-2xl border border-border bg-muted p-8 text-center">
        <p className="text-slate-700">Order not found.</p>
        <Link
          to={staffOrdersListPath}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to order list
        </Link>
      </div>
    );
  }

  const lineCount = order.lines.length;
  const isMasterAdmin = user?.role === "master_admin";
  const canFullAdmin = !!user && isAdministrationRole(user.role);
  const staffCanMarkDelivered =
    !!user && (user.role === "moderator" || user.role === "admin" || user.role === "master_admin");
  const deliveredOrInvoiced = !isNew && (order.status === "delivered" || order.status === "invoiced");
  const quantityLocked = isDeletedRecord || (deliveredOrInvoiced && !canFullAdmin);
  const pricingLocked =
    isDeletedRecord ||
    (!canFullAdmin &&
      (deliveredOrInvoiced ||
        (!isNew && hasPurchaseInvoice(order)) ||
        (!isNew && hasBillingInvoice(order))));
  const subtotal = order.lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  const orderDateDisplay = formatDateDdMmYyyyOrDash(order.orderDate || "");
  const save = async () => {
    if (isDeletedRecord || !order || saveBusy) return;
    if (!isDeletedRecord) {
      const od = (order.orderDate ?? "").trim().slice(0, 10);
      const dd = (order.deliveryDate ?? "").trim().slice(0, 10);
      if (!od || !dd) {
        setWorkflowError("Order date and delivery date are required.");
        return;
      }
    }
    const payload = order;
    setSaveBusy(true);
    setWorkflowError("");
    setWorkflowSuccess("");
    try {
      if (apiEnabled()) {
        if (isNew) {
          await apiCreateOrder(payload);
          await loadOrders();
          navigate(staffOrdersListPath, { replace: true });
          return;
        }
        await apiUpdateOrder(order.id, payload);
        await loadOrders();
        setWorkflowSuccess("Changes saved.");
        return;
      }
      upsertOrder(payload);
      setWorkflowSuccess("Saved locally.");
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaveBusy(false);
    }
  };
  const genChallan = async (regenerate = false) => {
    if (challanBusy) return;
    if (regenerate && !canFullAdmin) return;
    if (!regenerate && order.challanGenerated) return;
    if (regenerate && !order.challanGenerated) return;
    if (!challanLinesReady) {
      setWorkflowError(
        "Challan needs a valid quantity on every line: kg and/or grams, or pieces only (not both). Add line items if the list is empty.",
      );
      return;
    }
    setWorkflowError("");
    setWorkflowSuccess("");
    setChallanBusy(true);
    try {
      if (apiEnabled()) {
        await apiGenerateChallan(order.id, regenerate ? { regenerate: true } : undefined);
        await loadOrders();
        setWorkflowSuccess(regenerate ? "Challan snapshot updated." : "Challan generated successfully.");
        return;
      }
      const next = { ...order, challanGenerated: true, status: "under_review" as const };
      setOrder(next);
      upsertOrder(next);
      setWorkflowSuccess("Challan generated successfully.");
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : "Failed to generate challan.");
    } finally {
      setChallanBusy(false);
    }
  };

  const generatePurchaseInvoice = async (regenerate = false) => {
    if (purchaseBusy) return;
    if (regenerate && !canFullAdmin) return;
    if (!regenerate && hasPurchaseInvoice(order)) return;
    if (regenerate && !hasPurchaseInvoice(order)) return;
    if (apiEnabled() && isNew) {
      setWorkflowError("Create the order on the server first, then generate a purchase invoice.");
      return;
    }
    if (!purchaseLinesReady) {
      setWorkflowError(
        "Purchase invoice needs a cost amount on every item: valid quantity (kg/g or pcs), cost unit price greater than zero, and a positive items total.",
      );
      return;
    }
    if (!isDeletedRecord) {
      const od = (order.orderDate ?? "").trim().slice(0, 10);
      const dd = (order.deliveryDate ?? "").trim().slice(0, 10);
      if (!od || !dd) {
        setWorkflowError("Set order date and delivery date before generating the purchase invoice.");
        return;
      }
    }
    const orderForPurchase = order;
    setWorkflowError("");
    setWorkflowSuccess("");
    setPurchaseBusy(true);
    try {
      if (apiEnabled()) {
        const saved = await apiUpdateOrder(orderForPurchase.id, orderForPurchase);
        setOrder(saved);
        await apiGeneratePurchaseInvoice(saved.id, regenerate ? { regenerate: true } : undefined);
        await loadOrders();
        setWorkflowSuccess(
          regenerate ? "Purchase invoice regenerated successfully." : "Purchase invoice generated successfully.",
        );
        navigate(`/admin/purchase-invoices/${saved.id}`);
        return;
      }
      const next = {
        ...orderForPurchase,
        purchaseInvoiceGenerated: true,
        purchaseInvoiceGeneratedBy: "admin" as const,
        status: "under_review" as const,
      };
      setOrder(next);
      upsertOrder(next);
      setWorkflowSuccess("Purchase invoice generated successfully.");
      navigate(`/admin/purchase-invoices/${orderForPurchase.id}`);
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : "Failed to generate purchase invoice.");
    } finally {
      setPurchaseBusy(false);
    }
  };

  const markDeliveryComplete = async () => {
    if (!staffCanMarkDelivered) return;
    if (
      markDeliverBusy ||
      purchaseBusy ||
      billingBusy ||
      order.status === "delivered" ||
      order.status === "invoiced"
    )
      return;
    if (order.status !== "submitted" && order.status !== "under_review") return;
    setWorkflowError("");
    setWorkflowSuccess("");
    setMarkDeliverBusy(true);
    try {
      if (apiEnabled()) {
        const updated = await apiMarkOrderDelivered(order.id);
        await loadOrders();
        setOrder(updated);
        setWorkflowSuccess("Delivery marked complete. Order status updated.");
        return;
      }
      const next = { ...order, status: "delivered" as const, deliveredAt: new Date().toISOString() };
      setOrder(next);
      upsertOrder(next);
      setWorkflowSuccess("Delivery marked complete (saved locally).");
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : "Could not mark delivery complete.");
    } finally {
      setMarkDeliverBusy(false);
    }
  };

  const finalizeInvoice = async (regenerate = false) => {
    if (billingBusy || !hasPurchaseInvoice(order)) return;
    if (regenerate && !canFullAdmin) return;
    if (!regenerate && hasBillingInvoice(order)) return;
    if (regenerate && !hasBillingInvoice(order)) return;
    if (regenerate && order.status !== "invoiced") return;
    setWorkflowError("");
    setWorkflowSuccess("");
    setBillingBusy(true);
    try {
      const normalizedCategoryMarkups: Record<string, number> = {};
      Object.entries(billingMarkupMapForLines).forEach(([k, v]) => {
        const n = Number(v);
        if (Number.isFinite(n)) normalizedCategoryMarkups[k] = Math.max(0, n);
      });
      const billingGlobalMarkup = 0;
      const normalizedItemMarkups = buildMarkupByItemPayload(
        order.lines,
        normalizedCategoryMarkups,
        billingGlobalMarkup,
        {},
      );
      if (apiEnabled()) {
        await apiGenerateBillingInvoice(order.id, {
          markupPercent: billingGlobalMarkup,
          markupByCategory: normalizedCategoryMarkups,
          markupByItem: normalizedItemMarkups,
          ...(regenerate ? { regenerate: true } : {}),
        });
        await loadOrders();
        setWorkflowSuccess(
          regenerate ? "Billing invoice regenerated successfully." : "Billing invoice generated successfully.",
        );
        navigate(`${webBase}/billing-invoices/${order.id}`);
        return;
      }
      const totals = {
        purchaseSubtotal: order.lines.reduce((sum, line) => sum + Number(line.lineTotal ?? 0), 0),
        billingSubtotal: order.lines.reduce((sum, line) => {
          const purchaseLine = Number(line.lineTotal ?? 0);
          const lineId = String(line.id ?? "");
          const pct = lineId ? Number(normalizedItemMarkups[lineId] ?? 0) : 0;
          return sum + (purchaseLine + Math.round(purchaseLine * (pct / 100)));
        }, 0),
      };
      const next = {
        ...order,
        billingInvoiceGenerated: true,
        invoiceGenerated: true,
        status: "invoiced" as const,
        purchaseSubtotal: totals.purchaseSubtotal,
        billingSubtotal: totals.billingSubtotal,
        subtotal: totals.billingSubtotal,
        markupPercent: billingGlobalMarkup,
        billingCategoryMarkups: normalizedCategoryMarkups,
        grandTotal: totals.billingSubtotal,
        lines: order.lines.map((line) => {
          const lineId = String(line.id ?? "");
          const pct = lineId ? Number(normalizedItemMarkups[lineId] ?? 0) : 0;
          const base = Number(line.lineTotal ?? 0);
          const unit = line.unitPrice != null ? Number(line.unitPrice) : null;
          const markupAmount = Math.round(base * (pct / 100));
          const lineAfter = base + markupAmount;
          const unitAfter = unit != null ? unit + Math.round(unit * (pct / 100)) : undefined;
          return {
            ...line,
            markupPercent: pct,
            markupAmount,
            unitPriceAfterMarkup: unitAfter,
            lineTotalAfterMarkup: lineAfter,
            profitLossAmount: markupAmount,
          };
        }),
      };
      setOrder(next);
      upsertOrder(next);
      setWorkflowSuccess("Billing invoice generated successfully.");
      navigate(`/admin/billing-invoices/${order.id}`);
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : "Failed to generate billing invoice.");
    } finally {
      setBillingBusy(false);
    }
  };

  const addFromCatalog = () => {
    const cat = categories.find((c) => c.id === itemCat);
    const it = cat?.items.find((i) => i.id === pickItem);
    if (!cat || !it) return;
    const exists = order.lines.some((l) => l.categoryId === cat.id && l.itemId === it.id);
    if (exists) {
      setLineItemError("Same item already exists in items list.");
      return;
    }
    const next = {
      ...order,
      lines: [
        ...order.lines,
        {
          id: crypto.randomUUID(),
          serial: order.lines.length + 1,
          categoryId: cat.id,
          itemId: it.id,
          itemNameBn: it.nameBn,
          itemNameEn: it.nameEn,
          kg: "",
          gram: "",
          piece: "",
        },
      ],
    };
    setOrder(next);
    setLineItemError("");
    setAddRowModal(false);
  };

  return (
    <div className="space-y-8">
      <Link
        to={staffOrdersListPath}
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Order list
      </Link>

      {/* Hero */}
      <div className="rounded-3xl border border-border bg-primary p-6 text-primary-foreground shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground">
              {isMasterAdmin ? "Master administrator" : "Administrator full access"}
            </p>
            <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
              {isNew ? "Create user order" : order.orderNo}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-primary-foreground">
              <User className="h-4 w-4 shrink-0" />
              <span className="font-medium text-primary-foreground">{order.contactPerson}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={order.status} />
            <div className="flex flex-wrap justify-end gap-2 text-xs font-medium text-primary-foreground">
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-900">
                {lineCount} item{lineCount !== 1 ? "s" : ""}
              </span>
              {order.challanGenerated ? (
                <span className="rounded-full bg-emerald-800 px-3 py-1 text-white">Challan</span>
              ) : null}
              {hasPurchaseInvoice(order) ? (
                <span className="rounded-full bg-amber-700 px-3 py-1 text-amber-50">Purchase invoice</span>
              ) : null}
              {hasBillingInvoice(order) ? (
                <span className="rounded-full bg-blue-800 px-3 py-1 text-white">Billing invoice</span>
              ) : null}
            </div>
            {!isNew && canFullAdmin && !order.deletedAt ? (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                disabled={workflowBlocked}
                title={workflowBlocked ? "Save changes before deleting." : undefined}
                className="mt-1 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete order
              </button>
            ) : null}
            {!isNew && order.deletedAt ? (
              <span className="mt-1 rounded-xl bg-slate-600 px-3.5 py-2 text-xs font-semibold text-white">
                Deleted
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-muted p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Items</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{lineCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Purchase cost total</p>
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

      {/* Order details */}
      <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-primary">
            <Package className="h-5 w-5" />
          </span>
          Order details
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {isNew ? (
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer (user)</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={order.ownerId ?? ""}
                onChange={(e) => {
                  const selected = userAccounts.find((a) => a.id === e.target.value);
                  if (!selected) return;
                  setOrder({
                    ...order,
                    ownerId: selected.id,
                    contactPerson: selected.name,
                    phone: selected.phone,
                    billingAddress: selected.billingAddress,
                    deliveryAddress: selected.deliveryAddress,
                  });
                }}
              >
                {userAccounts.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!isDeletedRecord ? (
            <>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Order date (bookkeeping)
                </label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900"
                  value={(order.orderDate ?? "").slice(0, 10)}
                  onChange={(e) =>
                    setOrder((prev) => (prev ? { ...prev, orderDate: e.target.value } : prev))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery date</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900"
                  value={(order.deliveryDate ?? "").slice(0, 10)}
                  onChange={(e) =>
                    setOrder((prev) => (prev ? { ...prev, deliveryDate: e.target.value } : prev))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery time</label>
                <input
                  type="time"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900"
                  value={toTimeInputValue(order.deliveryTime)}
                  onChange={(e) => setOrder({ ...order, deliveryTime: e.target.value })}
                />
              </div>
            </>
          ) : (
            <>
              <DetailTile icon={Calendar} label="Order date" value={orderDateDisplay} />
              <DetailTile icon={Calendar} label="Delivery date" value={formatDateDdMmYyyyOrDash(order.deliveryDate)} />
              <DetailTile icon={Clock} label="Time window" value={formatDeliveryWindow(order.deliveryTime)} />
            </>
          )}
          <DetailTile icon={Calendar} label="Submitted" value={formatOrderSubmittedAt(order)} />
          <DetailTile icon={Phone} label="Phone" value={order.phone} />
          {order.status === "delivered" || order.status === "invoiced" ? (
            <DetailTile
              icon={Truck}
              label="Marked delivered"
              value={order.deliveredAt ? formatShortDeliveredAt(order.deliveredAt) : "Not recorded"}
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

      {/* Items */}
      <section className="overflow-hidden rounded-3xl border border-border bg-white shadow-card">
        <div className="border-b border-border bg-muted px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Package className="h-5 w-5 text-foreground" />
            Items & pricing
          </h2>
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setItemCat(categories[0]?.id ?? "");
                setShowCatalogModal(true);
              }}
              disabled={pricingLocked}
              className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Add category/item
            </button>
            <button
              type="button"
              onClick={() => {
                setItemCat(categories[0]?.id ?? "");
                setPickItem(categories[0]?.items[0]?.id ?? "");
                setLineItemError("");
                setAddRowModal(true);
              }}
              disabled={pricingLocked}
              className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Add item
            </button>
          </div>
          {lineItemError ? <p className="mb-3 text-xs font-semibold text-red-700">{lineItemError}</p> : null}
          {canFullAdmin && !isNew && !isDeletedRecord ? (
            <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              You can change items, quantities, and costs even after delivery or billing. <strong>Save changes</strong>{" "}
              updates the database; the server refreshes the purchase invoice and challan when those already exist.
              Use <strong>Regenerate billing invoice</strong> if customer totals need to match your edits.
            </p>
          ) : null}
          {!isNew && !hasPurchaseInvoice(order) ? (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
              <strong>Cost required for purchase invoice:</strong> each item must have a{" "}
              <strong>supplier cost (unit) price</strong> greater than zero, valid <strong>quantity</strong>, and a
              positive <strong>items total</strong>. The server will reject a purchase invoice without these.
            </p>
          ) : null}
          <OrderLinesEditor
            lines={order.lines}
            categories={categories}
            showPricing
            billingMarkupPreview={!moderatorArea}
            billingMarkupsByCategory={moderatorArea ? undefined : billingMarkupMapForLines}
            globalBillingMarkupPercent={0}
            linesLocked={false}
            quantityLocked={quantityLocked}
            pricingLocked={pricingLocked}
            markupLocked={
              isDeletedRecord ||
              (!canFullAdmin && (hasBillingInvoice(order) || order.status === "invoiced"))
            }
            onChange={(lines) => setOrder((prev) => (prev ? { ...prev, lines } : prev))}
          />
          {workflowBlocked && !isDeletedRecord ? (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
              {saveBusy
                ? "Saving…"
                : isNew
                  ? "Create the order to enable challan, invoices, and delivery actions."
                  : "Save changes to enable challan, invoices, delivery, and soft-delete."}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={isDeletedRecord || saveBusy}
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveBusy ? "Saving…" : isNew ? "Create order" : "Save changes"}
            </button>
            {!isNew ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void genChallan(false);
                  }}
                  disabled={Boolean(
                    challanBusy || order.challanGenerated || isDeletedRecord || workflowBlocked || !challanLinesReady,
                  )}
                  title={
                    !challanLinesReady
                      ? "Enter kg/g or pieces on every line (no empty quantities) before generating a challan."
                      : undefined
                  }
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {challanBusy ? "Generating…" : "Generate challan"}
                </button>
                {canFullAdmin && order.challanGenerated ? (
                  <button
                    type="button"
                    onClick={() => void genChallan(true)}
                    disabled={Boolean(challanBusy || isDeletedRecord || workflowBlocked || !challanLinesReady)}
                    title={
                      !challanLinesReady
                        ? "Fix quantities on every line before regenerating the challan snapshot."
                        : undefined
                    }
                    className="rounded-xl border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {challanBusy ? "Updating…" : "Regenerate challan"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void generatePurchaseInvoice(false)}
                  disabled={Boolean(
                    purchaseBusy ||
                      hasPurchaseInvoice(order) ||
                      !purchaseLinesReady ||
                      isDeletedRecord ||
                      workflowBlocked,
                  )}
                  title={
                    !hasPurchaseInvoice(order) && !purchaseLinesReady
                      ? "Enter cost (unit) price and quantity on every item before purchase invoice."
                      : undefined
                  }
                  className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {purchaseBusy ? "Generating…" : "Generate purchase invoice"}
                </button>
                {canFullAdmin && hasPurchaseInvoice(order) ? (
                  <button
                    type="button"
                    onClick={() => void generatePurchaseInvoice(true)}
                    disabled={Boolean(
                      purchaseBusy || !purchaseLinesReady || isDeletedRecord || workflowBlocked,
                    )}
                    className="rounded-xl border border-amber-800 bg-white px-4 py-2 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {purchaseBusy ? "Regenerating…" : "Regenerate purchase invoice"}
                  </button>
                ) : null}
                {staffCanMarkDelivered ? (
                  <button
                    type="button"
                    onClick={() => void markDeliveryComplete()}
                    disabled={Boolean(
                      markDeliverBusy ||
                        purchaseBusy ||
                        billingBusy ||
                        order.status === "delivered" ||
                        order.status === "invoiced" ||
                        (order.status !== "submitted" && order.status !== "under_review") ||
                        isDeletedRecord ||
                        workflowBlocked,
                    )}
                    className="inline-flex items-center gap-2 rounded-xl border border-teal-600 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Truck className="h-4 w-4" />
                    {markDeliverBusy ? "Updating…" : "Mark delivery complete"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void finalizeInvoice(false)}
                  disabled={Boolean(
                    billingBusy ||
                      !hasPurchaseInvoice(order) ||
                      hasBillingInvoice(order) ||
                      isDeletedRecord ||
                      workflowBlocked,
                  )}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {billingBusy ? "Generating…" : "Generate customer billing invoice"}
                </button>
                {canFullAdmin && hasBillingInvoice(order) && order.status === "invoiced" ? (
                  <button
                    type="button"
                    onClick={() => void finalizeInvoice(true)}
                    disabled={Boolean(
                      billingBusy || !hasPurchaseInvoice(order) || isDeletedRecord || workflowBlocked,
                    )}
                    className="rounded-xl border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {billingBusy ? "Regenerating…" : "Regenerate billing invoice"}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
          {!isNew && !hasPurchaseInvoice(order) && purchaseLinesReady ? (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Purchase invoice is required before customer billing invoice.
            </p>
          ) : null}
          {!isNew && hasPurchaseInvoice(order) && !hasBillingInvoice(order) ? (
            <p className="mt-2 text-xs font-semibold text-slate-700">
              You can generate the customer <strong>billing invoice</strong> before or after marking delivery, once a
              purchase invoice exists.
            </p>
          ) : null}
          {workflowSuccess ? <p className="mt-2 text-xs font-semibold text-emerald-700">{workflowSuccess}</p> : null}
          {workflowError ? <p className="mt-2 text-xs font-semibold text-red-700">{workflowError}</p> : null}
        </div>
      </section>

      {showCatalogModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">Catalog management</h3>
            <div className="mt-4 space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Add category</p>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Category name (Bangla)" value={newCatBn} onChange={(e) => setNewCatBn(e.target.value)} />
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Category name (English)" value={newCatEn} onChange={(e) => setNewCatEn(e.target.value)} />
                <button type="button" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white" onClick={async () => {
                  const c = await addCategory(newCatBn, newCatEn);
                  if (c) {
                    setItemCat(c.id);
                    setNewCatBn("");
                    setNewCatEn("");
                  }
                }}>
                  Save category
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Add item</p>
                <div>
                  <SearchableSelect
                    aria-label="Category for new catalog item"
                    options={categorySelectOptions}
                    value={itemCat}
                    placeholder="Select category"
                    searchPlaceholder="Search categories…"
                    onChange={setItemCat}
                  />
                </div>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Item name (Bangla)" value={itemBn} onChange={(e) => setItemBn(e.target.value)} />
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Item name (English)" value={itemEn} onChange={(e) => setItemEn(e.target.value)} />
                <button type="button" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white" onClick={async () => {
                  const created = await addCustomItem(itemCat, itemBn, itemEn);
                  if (created) {
                    setItemBn("");
                    setItemEn("");
                  }
                }}>
                  Save item
                </button>
              </div>
              <button type="button" onClick={() => setShowCatalogModal(false)} className="w-full rounded-xl border border-slate-200 py-2 text-sm text-slate-700">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addRowModal ? (
        <div className="fixed left-0 top-0 z-[250] flex h-screen w-screen items-center justify-center bg-slate-900/35 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Add item</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-600">Category</label>
                <div className="mt-1">
                  <SearchableSelect
                    aria-label="Category"
                    options={categorySelectOptions}
                    value={itemCat}
                    placeholder="Select category"
                    searchPlaceholder="Search categories…"
                    onChange={(id) => {
                      setItemCat(id);
                      const c = categories.find((x) => x.id === id);
                      setPickItem(c?.items[0]?.id ?? "");
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600">Item</label>
                <div className="mt-1">
                  <SearchableSelect
                    aria-label="Item"
                    options={itemSelectOptions}
                    value={pickItem}
                    placeholder="Select item"
                    searchPlaceholder="Search items…"
                    emptyText={itemCat ? "No items in this category." : "Pick a category first."}
                    onChange={setPickItem}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={addFromCatalog}
                className="w-full rounded-xl bg-slate-700 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                Add item
              </button>
              <button
                type="button"
                onClick={() => setAddRowModal(false)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmActionModal
        open={showDeleteModal}
        title="Delete order?"
        description={`Are you sure you want to delete ${order?.orderNo ?? "this order"}? This action cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={() => {
          void (async () => {
            setShowDeleteModal(false);
            try {
              if (apiEnabled()) {
                await apiDeleteOrder(order!.id);
                await loadOrders();
              } else {
                deleteOrder(order!.id);
              }
              navigate(staffOrdersListPath);
            } catch (e) {
              setWorkflowError(e instanceof Error ? e.message : "Soft-delete failed.");
            }
          })();
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
