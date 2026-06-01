import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { OrderLinesEditor } from "../components/OrderLinesEditor";
import { SignatureCapture } from "../components/SignatureCapture";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useOrders } from "../context/OrdersContext";
import type { Order, OrderLine } from "../types";
import { toTimeInputValue } from "../lib/deliveryWindow";
import { nextOrderNo, todayIsoDate } from "../lib/orderNo";
import { canEditOrder, validateLineQuantity } from "../lib/quantityRules";
import { formatDateDdMmYyyy } from "../lib/formatDisplayDate";
import {
  SearchableSelect,
  categoryOptionsFromCatalog,
  itemOptionsFromCatalogItems,
} from "../components/SearchableSelect";

export function OrderFormPage() {
  const { id } = useParams();
  const isNew = id === "new" || !id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { categories, addCustomItem, loadCatalog } = useCatalog();
  const { loadOrders, upsertOrder, getById } = useOrders();

  const [order, setOrder] = useState<Order | null>(null);
  const [addRowModal, setAddRowModal] = useState(false);
  const [addItemModal, setAddItemModal] = useState(false);
  const [pickCat, setPickCat] = useState(categories[0]?.id ?? "");
  const [pickItem, setPickItem] = useState("");
  const [customBn, setCustomBn] = useState("");
  const [customEn, setCustomEn] = useState("");
  const [lineItemError, setLineItemError] = useState("");
  /** Category for “Add new item to category” only (searchable); avoids sharing state with “Add item”. */
  const [newItemCategoryId, setNewItemCategoryId] = useState("");
  const [catalogModalHost, setCatalogModalHost] = useState<HTMLElement | null>(null);
  const setCatalogModalHostCb = useCallback((el: HTMLElement | null) => {
    setCatalogModalHost((prev) => (prev === el ? prev : el));
  }, []);

  useEffect(() => {
    if (!user || !isNew) return;
    if (order) return;
    setOrder({
      id: crypto.randomUUID(),
      ownerId: user.id,
      orderNo: nextOrderNo(),
      orderDate: todayIsoDate(),
      createdAt: new Date().toISOString(),
      deliveryDate: todayIsoDate(),
      status: "draft",
      billingAddress: user.billingAddress,
      deliveryAddress: user.deliveryAddress,
      contactPerson: user.name,
      phone: user.phone,
      lines: [],
      signatureDataUrl: null,
    });
  }, [isNew, user, order]);

  useEffect(() => {
    if (isNew || !id) return;
    void loadOrders();
  }, [isNew, id, loadOrders]);

  useEffect(() => {
    if (isNew || !id) return;
    const existing = getById(id);
    if (existing) setOrder({ ...existing });
  }, [isNew, id, getById]);

  const itemsOf = useMemo(() => {
    const c = categories.find((x) => x.id === pickCat);
    return c?.items ?? [];
  }, [categories, pickCat]);
  const categorySelectOptions = useMemo(() => categoryOptionsFromCatalog(categories), [categories]);
  const itemSelectOptions = useMemo(() => itemOptionsFromCatalogItems(itemsOf), [itemsOf]);

  if (!order) {
    return (
      <p className="text-sm text-slate-600">
        Loading… or order not found.{" "}
        <Link to="/user/orders" className="text-accent underline">
          Back to list
        </Link>
      </p>
    );
  }

  // New and draft orders are always editable; non-draft orders lock inside 24h.
  const editWindowOk =
    isNew || order.status === "draft" || canEditOrder(order.deliveryDate, order.deliveryTime);
  const linesOk =
    order.lines.length > 0 &&
    order.lines.every((l) => validateLineQuantity(l.kg, l.gram, l.piece) == null);
  const deliveryTimeValue = toTimeInputValue(order.deliveryTime);
  const requiredFieldIssues: string[] = [];
  if (!order.deliveryDate?.trim()) requiredFieldIssues.push("Delivery date");
  if (!deliveryTimeValue) requiredFieldIssues.push("Delivery time");
  if (!order.contactPerson?.trim()) requiredFieldIssues.push("Contact person");
  if (!order.deliveryAddress?.trim()) requiredFieldIssues.push("Delivery address");
  if (!order.phone?.trim()) requiredFieldIssues.push("Phone");
  const requiredFieldsOk = requiredFieldIssues.length === 0;

  const save = () => {
    if (!requiredFieldsOk) return;
    upsertOrder(order);
    navigate("/user/orders");
  };

  const goReview = () => {
    if (!linesOk || !editWindowOk || !requiredFieldsOk) return;
    upsertOrder(order);
    navigate(`/user/orders/${order.id}/review`);
  };

  const addFromCatalog = () => {
    const cat = categories.find((c) => c.id === pickCat);
    const it = cat?.items.find((i) => i.id === pickItem);
    if (!cat || !it) return;
    const alreadyExists = order.lines.some(
      (l) => l.categoryId === cat.id && l.itemId === it.id,
    );
    if (alreadyExists) {
      setLineItemError("Same item already exists in items list.");
      return;
    }
    setOrder((prev) => {
      if (!prev) return prev;
      const line: OrderLine = {
        id: crypto.randomUUID(),
        serial: prev.lines.length + 1,
        categoryId: cat.id,
        itemId: it.id,
        itemNameBn: it.nameBn,
        itemNameEn: it.nameEn,
        kg: "",
        gram: "",
        piece: "",
      };
      return { ...prev, lines: [...prev.lines, line] };
    });
    setLineItemError("");
    setAddRowModal(false);
  };

  const saveNewItemOnly = async () => {
    if (!newItemCategoryId || !customBn.trim() || !customEn.trim()) return;
    const created = await addCustomItem(newItemCategoryId, customBn.trim(), customEn.trim());
    if (created) {
      const alreadyExists = order.lines.some(
        (l) => l.categoryId === created.categoryId && l.itemId === created.id,
      );
      if (alreadyExists) {
        setLineItemError("Same item already exists in items list.");
        setAddItemModal(false);
        return;
      }
      setPickCat(created.categoryId);
      setPickItem(created.id);
      setOrder((prev) => {
        if (!prev) return prev;
        const line: OrderLine = {
          id: crypto.randomUUID(),
          serial: prev.lines.length + 1,
          categoryId: created.categoryId,
          itemId: created.id,
          itemNameBn: created.nameBn,
          itemNameEn: created.nameEn,
          kg: "",
          gram: "",
          piece: "",
        };
        return { ...prev, lines: [...prev.lines, line] };
      });
      setLineItemError("");
    } else {
      setLineItemError("Could not save item. Duplicate Bangla/English name may already exist in this category.");
    }
    setCustomBn("");
    setCustomEn("");
    setAddItemModal(false);
  };

  return (
    <div className="space-y-7">
      <div>
        <Link to="/user/orders" className="text-xs text-accent hover:underline">
          ← Orders
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold text-brand-dark sm:text-3xl">{isNew ? "Create order" : "Edit order"}</h1>
        <p className="mt-1 text-base font-medium text-slate-700">
          {isNew
            ? "Add items and details, then save. Open Review from your order list to sign and submit."
            : "Add basic details, items, and signature before review."}
        </p>
      </div>

      {!editWindowOk && !isNew ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Less than 24h to delivery — this order cannot be edited.
        </div>
      ) : null}

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-7">
        <h2 className="text-lg font-bold text-slate-900">Order details</h2>
        <p className="mt-1 text-sm text-slate-600">Basic order information.</p>
        {!requiredFieldsOk ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Required fields missing: {requiredFieldIssues.join(", ")}.</p>
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-slate-600">Order no.</p>
            <p className="font-mono text-xl font-bold text-slate-900">{order.orderNo}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600">Date</p>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-mono font-semibold text-slate-900"
              value={formatDateDdMmYyyy(order.orderDate)}
              readOnly
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-slate-700">Billing address</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
              rows={2}
              value={order.billingAddress}
              onChange={(e) => setOrder({ ...order, billingAddress: e.target.value })}
              disabled={!editWindowOk}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-slate-700">
              Delivery address <span className="text-red-600">*</span>
            </label>
            <textarea
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
              rows={2}
              value={order.deliveryAddress}
              onChange={(e) => setOrder({ ...order, deliveryAddress: e.target.value })}
              disabled={!editWindowOk}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">
              Delivery date <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
              value={order.deliveryDate}
              onChange={(e) => setOrder({ ...order, deliveryDate: e.target.value })}
              disabled={!editWindowOk}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">
              Delivery time <span className="text-red-600">*</span>
            </label>
            <input
              type="time"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
              value={deliveryTimeValue}
              onChange={(e) => setOrder({ ...order, deliveryTime: e.target.value })}
              disabled={!editWindowOk}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">
              Contact person <span className="text-red-600">*</span>
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
              value={order.contactPerson}
              onChange={(e) => setOrder({ ...order, contactPerson: e.target.value })}
              disabled={!editWindowOk}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">
              Phone <span className="text-red-600">*</span>
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
              value={order.phone}
              onChange={(e) => setOrder({ ...order, phone: e.target.value })}
              disabled={!editWindowOk}
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Items</h2>
            <p className="mt-1 text-sm text-slate-600">Add products to this order.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!editWindowOk}
              onClick={async () => {
                const loaded = await loadCatalog();
                setNewItemCategoryId(loaded[0]?.id ?? "");
                setPickCat(loaded[0]?.id ?? "");
                setPickItem(loaded[0]?.items[0]?.id ?? "");
                setLineItemError("");
                setAddItemModal(true);
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            >
              + Add new item
            </button>
            <button
              type="button"
              disabled={!editWindowOk}
              onClick={async () => {
                const loaded = await loadCatalog();
                setPickCat(loaded[0]?.id ?? "");
                setPickItem(loaded[0]?.items[0]?.id ?? "");
                setLineItemError("");
                setAddRowModal(true);
              }}
              className="rounded-xl bg-brand-dark px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              + Add item
            </button>
          </div>
        </div>

        {!linesOk ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Some rows break quantity rules: use kg and/or g, or pieces only
              (কেজি/গ্রাম অথবা শুধু পিস).
            </p>
          </div>
        ) : null}
        {lineItemError ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {lineItemError}
          </div>
        ) : null}

        <div className="mt-4">
          <OrderLinesEditor
            lines={order.lines}
            categories={categories}
            largeText
            onChange={(lines) => setOrder({ ...order, lines })}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-7">
        <h2 className="text-lg font-bold text-slate-900">Signature</h2>
        <p className="mt-1 text-sm text-slate-600">
          {isNew
            ? "Optional here — you will sign on the review screen before submit (from your order list after saving)."
            : "Sign before reviewing and submitting the order."}
        </p>
        <div className="mt-4">
          <SignatureCapture
            value={order.signatureDataUrl}
            onChange={(url) => setOrder({ ...order, signatureDataUrl: url })}
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigate("/user/orders")}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!editWindowOk || !requiredFieldsOk}
          className="rounded-2xl bg-slate-700 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
        >
          {isNew ? "Create order" : "Save draft"}
        </button>
        {!isNew ? (
          <button
            type="button"
            disabled={!linesOk || !editWindowOk || !requiredFieldsOk}
            onClick={goReview}
            className="inline-flex min-w-[180px] items-center justify-center rounded-2xl bg-slate-700 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
          >
            Continue to review →
          </button>
        ) : null}
      </div>

      {addRowModal ? (
        <div className="fixed left-0 top-0 z-[250] flex h-screen w-screen items-center justify-center bg-slate-900/35 p-4">
          <div
            ref={setCatalogModalHostCb}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-slate-900">Add item</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-600">Category (ধরন)</label>
                <div className="mt-1">
                  <SearchableSelect
                    aria-label="Category"
                    options={categorySelectOptions}
                    value={pickCat}
                    placeholder="Select category"
                    searchPlaceholder="Search categories…"
                    portalContainer={catalogModalHost}
                    onChange={(id) => {
                      setPickCat(id);
                      const c = categories.find((x) => x.id === id);
                      setPickItem(c?.items[0]?.id ?? "");
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600">Item (বস্তু)</label>
                <div className="mt-1">
                  <SearchableSelect
                    aria-label="Item"
                    options={itemSelectOptions}
                    value={pickItem}
                    placeholder="Select item"
                    searchPlaceholder="Search items…"
                    emptyText={pickCat ? "No items in this category." : "Pick a category first."}
                    portalContainer={catalogModalHost}
                    onChange={setPickItem}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={addFromCatalog}
                className="w-full rounded-xl bg-slate-700 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                Add from catalog
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

      {addItemModal ? (
        <div className="fixed left-0 top-0 z-[250] flex h-screen w-screen items-center justify-center bg-slate-900/35 p-4">
          <div
            ref={setCatalogModalHostCb}
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-slate-900">Add new item to category</h3>
            <p className="mt-1 text-xs text-slate-600">
              This saves the item and adds it to current order.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-600">Category (ধরন)</label>
                <p className="mt-0.5 text-[11px] text-slate-500">Type to search English or Bangla names, then pick a category.</p>
                <div className="mt-1">
                  <SearchableSelect
                    aria-label="Category for new custom item"
                    options={categorySelectOptions}
                    value={newItemCategoryId}
                    placeholder="Search or select category"
                    searchPlaceholder="Search categories…"
                    portalContainer={catalogModalHost}
                    onChange={setNewItemCategoryId}
                  />
                </div>
              </div>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bn"
                placeholder="Name (Bangla)"
                value={customBn}
                onChange={(e) => setCustomBn(e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Name (English)"
                value={customEn}
                onChange={(e) => setCustomEn(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void saveNewItemOnly();
                  }}
                  className="flex-1 rounded-xl bg-slate-700 py-2 text-sm font-semibold text-white hover:bg-slate-600"
                >
                  Save item
                </button>
                <button
                  type="button"
                  onClick={() => setAddItemModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
