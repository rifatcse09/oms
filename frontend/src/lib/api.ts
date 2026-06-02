import type { CategoryDef, Order, Role, SessionUser } from "../types";
import {
  type BillingCycleConfig,
  parseBillingCycleConfig,
} from "./billingCycle";
import {
  formatDateDdMmYyyy,
  formatDateTimeDdMmYyyy,
} from "./formatDisplayDate";
import { resolvePaymentTxnEffectiveType } from "./paymentTxnType";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.replace(/\/+$/, "");
const SESSION_KEY = "gom_session";
const TOKEN_KEY = "gom_token";

type LoginPayload = { email: string; password: string };
type RegisterPayload = {
  name: string;
  phone: string;
  email: string;
  password: string;
  billingAddress: string;
  deliveryAddress: string;
};
type AdminCreatePayload = Omit<
  RegisterPayload,
  "billingAddress" | "deliveryAddress"
> & {
  role: Role;
  billingAddress?: string;
  deliveryAddress?: string;
};
export type PaymentTxn = {
  id: number;
  order_id: number | null;
  invoice_id: number | null;
  payment_type?: "purchase" | "billing" | null;
  amount: number;
  note: string;
  created_by: number;
  created_at: string;
  order_no?: string | null;
  order_date?: string | null;
  contact_person?: string | null;
  invoice_type?: "purchase" | "billing" | null;
};
export type AdjustmentTxn = {
  id: number;
  order_id: number | null;
  type: "purchase" | "billing";
  amount: number;
  reason: string;
  created_by: number;
  created_at: string;
  order_no?: string | null;
  order_date?: string | null;
  contact_person?: string | null;
};
export type LedgerEntry = {
  id: number;
  order_id: number | null;
  order_no?: string | null;
  order_date?: string | null;
  contact_person?: string | null;
  entry_type: string;
  direction: "debit" | "credit";
  amount: number;
  ref_type?: string | null;
  ref_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};
type ProfileUpdatePayload = {
  name: string;
  phone: string;
  billingAddress: string;
  deliveryAddress: string;
};

function token(): string | null {
  try {
    const direct = localStorage.getItem(TOKEN_KEY);
    if (direct) return direct;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser & { token?: string };
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

function optionalMoney(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Same as invoiceFlow `orderFlagIsOn` — avoid `Boolean("false") === true` from loose-typed JSON. */
function normalizeBoolFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  }
  return Boolean(v);
}

function normalizeOrderLine(
  raw: Record<string, unknown>,
): Order["lines"][number] {
  const kg = raw.kg != null && String(raw.kg) !== "" ? String(raw.kg) : "";
  const gram =
    raw.gram != null && String(raw.gram) !== "" ? String(raw.gram) : "";
  const piece =
    raw.piece != null && String(raw.piece) !== "" ? String(raw.piece) : "";
  return {
    id: String(raw.id ?? ""),
    serial: Number(raw.serial ?? 0) || 0,
    categoryId: String(raw.categoryId ?? raw.category_code ?? ""),
    itemId: String(raw.itemId ?? raw.item_code ?? ""),
    itemNameBn: String(raw.itemNameBn ?? raw.item_name_bn ?? ""),
    itemNameEn: String(raw.itemNameEn ?? raw.item_name_en ?? ""),
    kg,
    gram,
    piece,
    instructions:
      raw.instructions != null ? String(raw.instructions) : undefined,
    unitPrice: optionalMoney(raw.unitPrice ?? raw.unit_price),
    lineTotal: optionalMoney(raw.lineTotal ?? raw.line_total),
    markupPercent: (() => {
      const m = optionalMoney(raw.markupPercent ?? raw.markup_percent);
      if (m == null) return undefined;
      const billed = optionalMoney(
        raw.lineTotalAfterMarkup ?? raw.line_total_after_markup,
      );
      // DB often stores 0 when unset; treat as "use category" until a billing line exists.
      if (m === 0 && billed == null) return undefined;
      return m;
    })(),
    markupAmount: optionalMoney(raw.markupAmount ?? raw.markup_amount),
    unitPriceAfterMarkup:
      optionalMoney(raw.unitPriceAfterMarkup ?? raw.unit_price_after_markup) ??
      null,
    lineTotalAfterMarkup:
      optionalMoney(raw.lineTotalAfterMarkup ?? raw.line_total_after_markup) ??
      null,
    profitLossAmount: optionalMoney(
      raw.profitLossAmount ?? raw.profit_loss_amount,
    ),
  };
}

function normalizeOrder(order: Record<string, unknown>): Order {
  const rawStatus = String(order.status ?? "draft");
  const status: Order["status"] =
    rawStatus === "processing"
      ? "under_review"
      : rawStatus === "completed"
        ? "delivered"
        : (rawStatus as Order["status"]);
  const challanGenerated =
    Boolean(order.challanGenerated ?? order.challan_generated) ||
    rawStatus === "processing" ||
    rawStatus === "under_review" ||
    rawStatus === "completed" ||
    rawStatus === "delivered" ||
    rawStatus === "invoiced";
  // Use explicit flags / invoice records from the API only — do not infer from order status.
  // Backend sets these from purchase_invoice_generated / billing_invoice_generated and invoices table.
  const purchaseInvoiceGenerated = normalizeBoolFlag(
    order.purchaseInvoiceGenerated ?? order.purchase_invoice_generated,
  );
  // Do not use legacy `invoiceGenerated` / `invoice_generated` here — some APIs used it for any invoice,
  // which incorrectly hid billing markup as "already invoiced" and locked Markup % before customer billing.
  const billingInvoiceGenerated = normalizeBoolFlag(
    order.billingInvoiceGenerated ?? order.billing_invoice_generated,
  );

  const rawSignature =
    (order.signatureDataUrl as string | null | undefined) ??
    (order.signature_data_url as string | null | undefined) ??
    null;
  const signatureDataUrl =
    rawSignature && rawSignature.startsWith("/") && API_BASE
      ? `${API_BASE}${rawSignature}`
      : rawSignature;

  const lines: Order["lines"] = Array.isArray(order.lines)
    ? (order.lines as unknown[]).map((row) =>
        normalizeOrderLine((row ?? {}) as Record<string, unknown>),
      )
    : [];
  const purchaseSumFromLines = lines.reduce(
    (s, l) => s + Number(l.lineTotal ?? 0),
    0,
  );

  const createdByIdRaw = order.createdById ?? order.created_by_id;
  const assignedModeratorIdRaw =
    order.assignedModeratorId ?? order.assigned_moderator_id;
  const createdByNameRaw = order.createdByName ?? order.created_by_user_name;
  const createdByRoleRaw = order.createdByRole ?? order.created_by_user_role;

  return {
    id: String(order.id ?? ""),
    ownerId: String(order.ownerId ?? order.owner_id ?? ""),
    assignedModeratorId:
      assignedModeratorIdRaw === null ||
      assignedModeratorIdRaw === undefined ||
      String(assignedModeratorIdRaw).trim() === ""
        ? null
        : String(assignedModeratorIdRaw),
    createdById:
      createdByIdRaw === null ||
      createdByIdRaw === undefined ||
      String(createdByIdRaw).trim() === ""
        ? null
        : String(createdByIdRaw),
    createdByName:
      createdByNameRaw === null || createdByNameRaw === undefined
        ? null
        : String(createdByNameRaw).trim() === ""
          ? null
          : String(createdByNameRaw),
    createdByRole:
      createdByRoleRaw === null || createdByRoleRaw === undefined
        ? null
        : String(createdByRoleRaw).trim() === ""
          ? null
          : String(createdByRoleRaw),
    orderNo: String(order.orderNo ?? order.order_no ?? ""),
    orderDate: String(order.orderDate ?? order.order_date ?? ""),
    createdAt:
      (order.createdAt as string | undefined) ??
      (order.created_at as string | undefined),
    submittedAt:
      (order.submittedAt as string | undefined) ??
      (order.submitted_at as string | undefined),
    deliveredAt:
      (order.deliveredAt as string | undefined) ??
      (order.delivered_at as string | undefined),
    deliveryDate: String(
      order.deliveryDate ??
        String(order.delivery_datetime ?? "").slice(0, 10) ??
        "",
    ),
    deliveryTime: String(
      order.deliveryTime ??
        order.delivery_time_window ??
        String(order.delivery_datetime ?? "").slice(11, 16) ??
        "",
    ),
    status,
    billingAddress: String(order.billingAddress ?? order.billing_address ?? ""),
    deliveryAddress: String(
      order.deliveryAddress ?? order.delivery_address ?? "",
    ),
    contactPerson: String(order.contactPerson ?? order.contact_person ?? ""),
    phone: String(order.phone ?? ""),
    signatureDataUrl,
    challanGenerated,
    purchaseInvoiceGenerated,
    purchaseInvoiceGeneratedBy:
      order.purchaseInvoiceGeneratedBy === "moderator" ||
      order.purchase_invoice_generated_by === "moderator"
        ? "moderator"
        : order.purchaseInvoiceGeneratedBy === "admin" ||
            order.purchase_invoice_generated_by === "admin" ||
            order.purchaseInvoiceGeneratedBy === "master_admin" ||
            order.purchase_invoice_generated_by === "master_admin"
          ? "admin"
          : undefined,
    billingInvoiceGenerated,
    billingInvoiceCreatedAt:
      (order.billingInvoiceCreatedAt as string | undefined) ??
      (order.billing_invoice_created_at as string | undefined) ??
      (order.billing_invoice_generated_at as string | undefined) ??
      null,
    purchaseInvoiceCreatedAt:
      (order.purchaseInvoiceCreatedAt as string | undefined) ??
      (order.purchase_invoice_created_at as string | undefined) ??
      (order.purchase_invoice_generated_at as string | undefined) ??
      null,
    invoiceGenerated: billingInvoiceGenerated,
    purchaseSubtotal:
      optionalMoney(order.purchaseSubtotal ?? order.purchase_subtotal) ??
      (purchaseSumFromLines > 0 ? purchaseSumFromLines : undefined),
    billingSubtotal: optionalMoney(
      order.billingSubtotal ?? order.billing_subtotal,
    ),
    billingCategoryMarkups:
      order.billingCategoryMarkups &&
      typeof order.billingCategoryMarkups === "object"
        ? (order.billingCategoryMarkups as Record<string, number>)
        : order.billing_category_markups &&
            typeof order.billing_category_markups === "object"
          ? (order.billing_category_markups as Record<string, number>)
          : undefined,
    markupPercent: optionalMoney(order.markupPercent ?? order.markup_percent),
    subtotal:
      optionalMoney(order.subtotal ?? order.purchase_subtotal) ??
      (purchaseSumFromLines > 0 ? purchaseSumFromLines : undefined),
    grandTotal: optionalMoney(order.grandTotal ?? order.grand_total),
    billingNetPaid: optionalMoney(
      order.billingNetPaid ?? order.billing_net_paid,
    ),
    billingAmountDue:
      order.billingAmountDue === null || order.billing_amount_due === null
        ? null
        : optionalMoney(order.billingAmountDue ?? order.billing_amount_due),
    deletedAt:
      order.deletedAt != null
        ? String(order.deletedAt)
        : order.deleted_at != null
          ? String(order.deleted_at)
          : undefined,
    lines,
  };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("API not configured");
  const t = token();
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init?.headers ?? {}),
    },
    /** Avoid stale financial lists after DB purge / external changes (browser HTTP cache). */
    cache: init?.cache ?? "no-store",
  });
  const contentType = r.headers.get("content-type") ?? "";
  const rawBody = await r.text();
  const isJson = contentType.includes("application/json");
  const payload = (isJson ? JSON.parse(rawBody) : { message: rawBody }) as T & {
    message?: string;
  };
  if (!r.ok) {
    throw new Error(
      (payload as { message?: string }).message || `HTTP ${r.status}`,
    );
  }
  if (!isJson) {
    throw new Error(
      `Expected JSON but received non-JSON response from ${path}.`,
    );
  }
  return payload;
}

export function apiEnabled() {
  return Boolean(API_BASE);
}

export async function apiLogin(
  payload: LoginPayload,
): Promise<{ user: SessionUser; token: string }> {
  const res = await req<{ user: Record<string, unknown>; token: string }>(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return { user: normalizeUser(res.user), token: res.token };
}

export async function apiRegister(
  payload: RegisterPayload,
): Promise<{ user: SessionUser; token: string }> {
  const res = await req<{ user: Record<string, unknown>; token: string }>(
    "/api/v1/auth/register",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return { user: normalizeUser(res.user), token: res.token };
}

export async function apiLogout(): Promise<void> {
  await req("/api/v1/auth/logout", { method: "POST" });
}

export async function apiUpdateProfile(
  payload: ProfileUpdatePayload,
): Promise<SessionUser> {
  const res = await req<{ user: SessionUser }>("/api/v1/auth/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.user;
}

function normalizeUser(u: Record<string, unknown>): SessionUser {
  // Log raw fields in dev so we can see what the API actually returns
  if (import.meta.env.DEV) {
    console.log("[normalizeUser] raw API user fields:", Object.keys(u), u);
  }
  const registeredAt =
    (u.registeredAt as string | undefined) ??
    (u.created_at as string | undefined) ??
    (u.createdAt as string | undefined) ??
    (u.registered_at as string | undefined) ??
    (u.registration_date as string | undefined) ??
    (u.date_joined as string | undefined) ??
    (u.joinedAt as string | undefined) ??
    (u.join_date as string | undefined) ??
    (u.created as string | undefined) ??
    undefined;
  return {
    ...(u as unknown as SessionUser),
    registeredAt,
  };
}

export async function apiListUsers(): Promise<SessionUser[]> {
  const res = await req<{ data: Record<string, unknown>[] }>(
    "/api/v1/admin/users",
  );
  return res.data.map(normalizeUser);
}

/** Moderators and admins: list active customer accounts for on-behalf order entry. */
export async function apiListStaffCustomerAccounts(): Promise<SessionUser[]> {
  const res = await req<{ data: Record<string, unknown>[] }>(
    "/api/v1/staff/customer-accounts",
  );
  return res.data.map(normalizeUser);
}

export async function apiCreateUser(
  payload: AdminCreatePayload,
): Promise<SessionUser> {
  const res = await req<{ data: SessionUser }>("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function apiListOrders(
  includeDeleted?: boolean,
): Promise<Order[]> {
  const q = includeDeleted ? "?includeDeleted=1" : "";
  const res = await req<{ data: Record<string, unknown>[] }>(
    `/api/v1/orders${q}`,
  );
  return res.data.map(normalizeOrder);
}

export async function apiCreateOrder(payload: Partial<Order>): Promise<Order> {
  const body: Record<string, unknown> = { ...payload };
  attachSerializedLines(body, payload);
  const res = await req<{ data: Record<string, unknown> }>("/api/v1/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return normalizeOrder(res.data);
}

/** Map UI order status to backend `orders.status` values. */
function mapOrderStatusToApi(status: Order["status"]): string {
  switch (status) {
    case "under_review":
      return "processing";
    case "delivered":
      return "completed";
    default:
      return status;
  }
}

/**
 * JSON.stringify omits `undefined`; PHP then misses keys and may skip unit/line totals.
 * Send explicit nulls for numeric line fields so the API always receives a stable shape.
 */
function serializeOrderLineForApi(
  line: Order["lines"][number],
): Record<string, unknown> {
  return {
    id: line.id,
    serial: line.serial,
    categoryId: line.categoryId,
    itemId: line.itemId,
    itemNameBn: line.itemNameBn,
    itemNameEn: line.itemNameEn,
    kg: line.kg,
    gram: line.gram,
    piece: line.piece,
    instructions: line.instructions ?? "",
    unitPrice: line.unitPrice ?? null,
    lineTotal: line.lineTotal ?? null,
    markupPercent: line.markupPercent ?? null,
    markupAmount: line.markupAmount ?? null,
    unitPriceAfterMarkup: line.unitPriceAfterMarkup ?? null,
    lineTotalAfterMarkup: line.lineTotalAfterMarkup ?? null,
    profitLossAmount: line.profitLossAmount ?? null,
  };
}

function attachSerializedLines(
  body: Record<string, unknown>,
  payload: Partial<Order>,
): void {
  if (Array.isArray(payload.lines)) {
    body.lines = payload.lines.map(serializeOrderLineForApi);
  }
}

export async function apiUpdateOrder(
  id: string,
  payload: Partial<Order>,
): Promise<Order> {
  const body: Record<string, unknown> = { ...payload };
  if (payload.status !== undefined) {
    body.status = mapOrderStatusToApi(payload.status);
  }
  attachSerializedLines(body, payload);
  const res = await req<{ data: Record<string, unknown> }>(
    `/api/v1/orders/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
  return normalizeOrder(res.data);
}

export type ActivityLogEntry = {
  id: number;
  actorUserId: number;
  entityType: string;
  entityId: number;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
};

/** Admin only. Sets DB status to `completed` (shown as Delivered). Call when goods are delivered. */
export async function apiMarkOrderDelivered(orderId: string): Promise<Order> {
  const res = await req<{ data: Record<string, unknown> }>(
    `/api/v1/orders/${orderId}/mark-delivered`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return normalizeOrder(res.data);
}

export async function apiListAdminActivityLogs(params: {
  from: string;
  to: string;
  limit?: number;
  action?: string;
}): Promise<ActivityLogEntry[]> {
  const q = new URLSearchParams();
  q.set("from", params.from);
  q.set("to", params.to);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.action) q.set("action", params.action);
  const res = await req<{ data: ActivityLogEntry[] }>(
    `/api/v1/admin/activity-logs?${q.toString()}`,
  );
  return res.data;
}

export async function apiDeleteOrder(id: string): Promise<void> {
  await req(`/api/v1/orders/${id}`, {
    method: "DELETE",
  });
}

export async function apiGenerateChallan(
  id: string,
  opts?: { regenerate?: boolean },
): Promise<void> {
  await req<{ data: Record<string, unknown> }>(`/api/v1/orders/${id}/challan`, {
    method: "POST",
    body: JSON.stringify(opts?.regenerate ? { regenerate: true } : {}),
  });
}

export async function apiGeneratePurchaseInvoice(
  id: string,
  opts?: { regenerate?: boolean },
): Promise<void> {
  await req<{ data: Record<string, unknown> }>(
    `/api/v1/orders/${id}/purchase-invoice`,
    {
      method: "POST",
      body: JSON.stringify(opts?.regenerate ? { regenerate: true } : {}),
    },
  );
}

export async function apiGenerateBillingInvoice(
  id: string,
  payload: {
    markupPercent?: number;
    markupByCategory?: Record<string, number>;
    markupByItem?: Record<string, number>;
    regenerate?: boolean;
  },
): Promise<void> {
  await req<{ data: Record<string, unknown> }>(
    `/api/v1/orders/${id}/billing-invoice`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export type CategoryMarkupHistoryEntry = {
  id: string;
  categoryId: string;
  categoryNameBn: string;
  categoryNameEn: string;
  previousPercent: number;
  nextPercent: number;
  changedAt: string;
  changedByName: string;
};

export async function apiGetCategoryMarkupSettings(): Promise<{
  settings: Record<string, number>;
  categories: Array<{
    categoryId: string;
    nameBn: string;
    nameEn: string;
    markupPercent: number;
  }>;
  history: CategoryMarkupHistoryEntry[];
}> {
  const res = await req<{
    data: {
      settings?: Record<string, unknown>;
      categories?: Array<{
        categoryId?: unknown;
        nameBn?: unknown;
        nameEn?: unknown;
        markupPercent?: unknown;
      }>;
      history?: Array<Record<string, unknown>>;
    };
  }>("/api/v1/catalog/category-markups");
  const settingsRaw = res.data?.settings ?? {};
  const settings: Record<string, number> = {};
  Object.entries(settingsRaw).forEach(([categoryId, value]) => {
    const pct = Number(value);
    if (Number.isFinite(pct) && pct >= 0) settings[categoryId] = pct;
  });
  const categories = Array.isArray(res.data?.categories)
    ? res.data.categories.map((row) => ({
        categoryId: String(row?.categoryId ?? ""),
        nameBn: String(row?.nameBn ?? ""),
        nameEn: String(row?.nameEn ?? ""),
        markupPercent: Number(row?.markupPercent ?? 0),
      }))
    : [];
  const history = Array.isArray(res.data?.history)
    ? res.data.history.map((row) => ({
        id: String(row.id ?? ""),
        categoryId: String(row.categoryId ?? ""),
        categoryNameBn: String(row.categoryNameBn ?? ""),
        categoryNameEn: String(row.categoryNameEn ?? ""),
        previousPercent: Number(row.previousPercent ?? 0),
        nextPercent: Number(row.nextPercent ?? 0),
        changedAt: String(row.changedAt ?? ""),
        changedByName: String(row.changedByName ?? ""),
      }))
    : [];
  return { settings, categories, history };
}

export async function apiUpdateCategoryMarkup(
  categoryId: string,
  markupPercent: number,
): Promise<void> {
  await req<{ data: Record<string, unknown> }>(
    `/api/v1/catalog/categories/${encodeURIComponent(categoryId)}/markup`,
    {
      method: "PUT",
      body: JSON.stringify({ markupPercent }),
    },
  );
}

/** Prefer created_at; some stacks expose camelCase or only updated_at. */
function pickRowTimestamp(row: Record<string, unknown>): string {
  const candidates = [
    row.created_at,
    row.createdAt,
    row.updated_at,
    row.updatedAt,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "string" && c.trim() !== "") return c.trim();
    if (typeof c === "number" && Number.isFinite(c))
      return new Date(c).toISOString();
  }
  return "";
}

/** When column for history tables: show recorded time, else order date, else em dash. */
export function formatPaymentHistoryWhen(txn: {
  created_at: string;
  order_date?: string | null;
}): string {
  const c = String(txn.created_at ?? "").trim();
  if (c) {
    if (c.includes("T") && c.length >= 10) return formatDateTimeDdMmYyyy(c);
    return formatDateDdMmYyyy(c) || c;
  }
  const o = String(txn.order_date ?? "").trim();
  if (o) {
    const d = formatDateDdMmYyyy(o.length >= 10 ? o.slice(0, 10) : o);
    return d ? `${d} (order date)` : `${o} (order date)`;
  }
  return "—";
}

/** PDO / JSON often ship ids as strings; statement math uses strict `===` on order_id. */
function normalizePaymentTxn(row: Record<string, unknown>): PaymentTxn {
  const invType = row.invoice_type;
  const invoice_type =
    invType === "purchase" || invType === "billing" ? invType : null;
  const rawStored = row.payment_type ?? row.stored_payment_type ?? null;
  const stored =
    rawStored === "purchase" || rawStored === "billing" ? rawStored : null;
  const note = String(row.note ?? "");
  const payment_type = resolvePaymentTxnEffectiveType({
    payment_type: stored,
    invoice_type,
    note,
  });
  return {
    id: Number(row.id ?? 0),
    order_id:
      row.order_id != null && String(row.order_id) !== ""
        ? Number(row.order_id)
        : null,
    invoice_id:
      row.invoice_id != null && String(row.invoice_id) !== ""
        ? Number(row.invoice_id)
        : null,
    payment_type,
    amount: Number(row.amount ?? 0),
    note,
    created_by: Number(row.created_by ?? 0),
    created_at: pickRowTimestamp(row),
    order_no: row.order_no != null ? String(row.order_no) : null,
    order_date: row.order_date != null ? String(row.order_date) : null,
    contact_person:
      row.contact_person != null ? String(row.contact_person) : null,
    invoice_type,
  };
}

function normalizeAdjustmentTxn(row: Record<string, unknown>): AdjustmentTxn {
  const typ = row.type;
  return {
    id: Number(row.id ?? 0),
    order_id:
      row.order_id != null && String(row.order_id) !== ""
        ? Number(row.order_id)
        : null,
    type: typ === "purchase" || typ === "billing" ? typ : "billing",
    amount: Number(row.amount ?? 0),
    reason: String(row.reason ?? ""),
    created_by: Number(row.created_by ?? 0),
    created_at: pickRowTimestamp(row),
    order_no: row.order_no != null ? String(row.order_no) : null,
    order_date: row.order_date != null ? String(row.order_date) : null,
    contact_person:
      row.contact_person != null ? String(row.contact_person) : null,
  };
}

export async function apiListPayments(): Promise<PaymentTxn[]> {
  const res = await req<{ data: Record<string, unknown>[] }>(
    "/api/v1/payments",
  );
  return res.data.map((row) => normalizePaymentTxn(row));
}

export async function apiCreatePayment(payload: {
  orderId?: number;
  invoiceId?: number;
  type?: "purchase" | "billing";
  amount: number;
  note?: string;
}): Promise<PaymentTxn> {
  const res = await req<{ data: Record<string, unknown> }>("/api/v1/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizePaymentTxn(res.data);
}

/** All-or-nothing: multiple purchase/billing payments in one DB transaction (payments + ledger). */
export async function apiCreatePaymentsBatch(payload: {
  type: "purchase" | "billing";
  entries: Array<{ orderId: number; amount: number }>;
  note?: string;
}): Promise<PaymentTxn[]> {
  const res = await req<{ data: Record<string, unknown>[] }>(
    "/api/v1/payments/batch",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return res.data.map((row) => normalizePaymentTxn(row));
}

export async function apiListAdjustments(): Promise<AdjustmentTxn[]> {
  const res = await req<{ data: Record<string, unknown>[] }>(
    "/api/v1/adjustments",
  );
  return res.data.map((row) => normalizeAdjustmentTxn(row));
}

export async function apiCreateAdjustment(payload: {
  orderId?: number;
  type: "purchase" | "billing";
  amount: number;
  reason?: string;
}): Promise<AdjustmentTxn> {
  const res = await req<{ data: Record<string, unknown> }>(
    "/api/v1/adjustments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return normalizeAdjustmentTxn(res.data);
}

/** All-or-nothing: multiple adjustments in one DB transaction (adjustments + ledger). */
export async function apiCreateAdjustmentsBatch(payload: {
  type: "purchase" | "billing";
  entries: Array<{ orderId: number; amount: number }>;
  reason?: string;
}): Promise<AdjustmentTxn[]> {
  const res = await req<{ data: Record<string, unknown>[] }>(
    "/api/v1/adjustments/batch",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return res.data.map((row) => normalizeAdjustmentTxn(row));
}

/**
 * Single ACID request for statement UI: zero or more payments + zero or more adjustments
 * (each with ledger rows). Use for purchase or billing statement save so all-or-nothing
 * applies across payments, adjustments, and ledger.
 */
export async function apiApplyStatementBooking(payload: {
  type: "purchase" | "billing";
  payments: Array<{ orderId: number; amount: number }>;
  adjustments: Array<{ orderId: number; amount: number }>;
  paymentNote?: string;
  adjustmentReason?: string;
}): Promise<{ payments: PaymentTxn[]; adjustments: AdjustmentTxn[] }> {
  const res = await req<{
    data: {
      payments: Record<string, unknown>[];
      adjustments: Record<string, unknown>[];
    };
  }>("/api/v1/statement-bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return {
    payments: res.data.payments.map((row) => normalizePaymentTxn(row)),
    adjustments: res.data.adjustments.map((row) => normalizeAdjustmentTxn(row)),
  };
}

export async function apiListLedger(): Promise<LedgerEntry[]> {
  const res = await req<{ data: Record<string, unknown>[] }>("/api/v1/ledger");
  return res.data.map((row) => ({
    id: Number(row.id ?? 0),
    order_id: row.order_id != null ? Number(row.order_id) : null,
    order_no: (row.order_no as string | null | undefined) ?? null,
    order_date: (row.order_date as string | null | undefined) ?? null,
    contact_person: (row.contact_person as string | null | undefined) ?? null,
    entry_type: String(row.entry_type ?? ""),
    direction: row.direction === "credit" ? "credit" : "debit",
    amount: Number(row.amount ?? 0),
    ref_type: (row.ref_type as string | null | undefined) ?? null,
    ref_id: row.ref_id != null ? Number(row.ref_id) : null,
    created_at: pickRowTimestamp(row as Record<string, unknown>) || null,
    updated_at:
      (row.updated_at as string | null | undefined) ??
      (row.updatedAt as string | null | undefined) ??
      null,
  }));
}

export async function apiGetBillingCycleConfig(): Promise<BillingCycleConfig> {
  const res = await req<{ data: unknown }>("/api/v1/billing-cycle-config");
  return parseBillingCycleConfig(res.data);
}

export async function apiListCatalog(): Promise<CategoryDef[]> {
  const res = await req<{ data: CategoryDef[] }>("/api/v1/catalog");
  return res.data;
}

export async function apiListCatalogItems(params: {
  query?: string;
  page: number;
  perPage: number;
}): Promise<{
  data: Array<{
    id: string;
    categoryId: string;
    nameBn: string;
    nameEn: string;
    categoryNameBn: string;
    categoryNameEn: string;
  }>;
  meta: { page: number; perPage: number; total: number };
}> {
  const search = new URLSearchParams({
    query: params.query ?? "",
    page: String(params.page),
    perPage: String(params.perPage),
  });
  return req(`/api/v1/catalog/items?${search.toString()}`);
}

export async function apiListCatalogCategories(params: {
  query?: string;
  page: number;
  perPage: number;
}): Promise<{
  data: Array<{
    id: string;
    nameBn: string;
    nameEn: string;
    itemsCount: number;
  }>;
  meta: { page: number; perPage: number; total: number };
}> {
  const search = new URLSearchParams({
    query: params.query ?? "",
    page: String(params.page),
    perPage: String(params.perPage),
  });
  return req(`/api/v1/catalog/categories?${search.toString()}`);
}

export async function apiCreateCategory(
  nameBn: string,
  nameEn: string,
): Promise<CategoryDef> {
  const res = await req<{ data: CategoryDef }>("/api/v1/catalog/categories", {
    method: "POST",
    body: JSON.stringify({ nameBn, nameEn }),
  });
  return res.data;
}

export async function apiUpdateCategory(
  categoryId: string,
  nameBn: string,
  nameEn: string,
): Promise<CategoryDef> {
  const res = await req<{ data: CategoryDef }>(
    `/api/v1/catalog/categories/${encodeURIComponent(categoryId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ nameBn, nameEn }),
    },
  );
  return res.data;
}

export async function apiDeleteCategory(categoryId: string): Promise<void> {
  await req(`/api/v1/catalog/categories/${encodeURIComponent(categoryId)}`, {
    method: "DELETE",
  });
}

export async function apiCreateCatalogItem(
  categoryId: string,
  nameBn: string,
  nameEn: string,
): Promise<{ id: string; categoryId: string; nameBn: string; nameEn: string }> {
  const res = await req<{
    data: { id: string; categoryId: string; nameBn: string; nameEn: string };
  }>("/api/v1/catalog/items", {
    method: "POST",
    body: JSON.stringify({ categoryId, nameBn, nameEn }),
  });
  return res.data;
}

export async function apiUpdateCatalogItem(
  itemId: string,
  nameBn: string,
  nameEn: string,
): Promise<{ id: string; categoryId: string; nameBn: string; nameEn: string }> {
  const res = await req<{
    data: { id: string; categoryId: string; nameBn: string; nameEn: string };
  }>(`/api/v1/catalog/items/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    body: JSON.stringify({ nameBn, nameEn }),
  });
  return res.data;
}

export async function apiDeleteCatalogItem(itemId: string): Promise<void> {
  await req(`/api/v1/catalog/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

// ── Admin user management ─────────────────────────────────────────────────────

export async function apiToggleBlockUser(userId: string): Promise<SessionUser> {
  const res = await req<{ data: Record<string, unknown> }>(
    `/api/v1/admin/users/${userId}/block`,
    {
      method: "PATCH",
      body: JSON.stringify({}),
    },
  );
  return normalizeUser(res.data);
}

export async function apiUpdateUserRole(
  userId: string,
  role: string,
): Promise<SessionUser> {
  const res = await req<{ data: Record<string, unknown> }>(
    `/api/v1/admin/users/${userId}/role`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
  return normalizeUser(res.data);
}

// ── Order assignment ──────────────────────────────────────────────────────────

export async function apiAssignOrder(
  orderId: string,
  moderatorId: string | null,
): Promise<Order> {
  const res = await req<{ data: Record<string, unknown> }>(
    `/api/v1/orders/${orderId}/assign`,
    {
      method: "POST",
      body: JSON.stringify({ moderatorId }),
    },
  );
  return normalizeOrder(res.data);
}

// ── Stock management ──────────────────────────────────────────────────────────

export type StockItem = {
  id: string;
  catalogItemId: string | null;
  nameEn: string;
  nameBn: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  notes: string | null;
  isActive: boolean;
  updatedAt: string | null;
};

export async function apiListStock(): Promise<StockItem[]> {
  const res = await req<{ data: Record<string, unknown>[] }>("/api/v1/stock");
  return res.data.map(normalizeStockItem);
}

export async function apiCreateStockItem(payload: {
  nameEn: string;
  nameBn?: string;
  unit?: string;
  quantity?: number;
  reorderLevel?: number;
  catalogItemId?: string | null;
  notes?: string | null;
}): Promise<StockItem> {
  const res = await req<{ data: Record<string, unknown> }>("/api/v1/stock", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeStockItem(res.data);
}

export async function apiUpdateStockItem(
  id: string,
  payload: Partial<{
    nameEn: string;
    nameBn: string;
    unit: string;
    quantity: number;
    reorderLevel: number;
    notes: string | null;
    isActive: boolean;
  }>,
): Promise<StockItem> {
  const res = await req<{ data: Record<string, unknown> }>(
    `/api/v1/stock/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
  return normalizeStockItem(res.data);
}

export async function apiAdjustStock(
  id: string,
  delta: number,
  notes?: string,
): Promise<StockItem> {
  const res = await req<{ data: Record<string, unknown> }>(
    `/api/v1/stock/${id}/adjust`,
    {
      method: "POST",
      body: JSON.stringify({ delta, notes }),
    },
  );
  return normalizeStockItem(res.data);
}

export async function apiDeleteStockItem(id: string): Promise<void> {
  await req(`/api/v1/stock/${id}`, { method: "DELETE" });
}

function normalizeStockItem(raw: Record<string, unknown>): StockItem {
  return {
    id: String(raw.id ?? ""),
    catalogItemId: raw.catalogItemId ? String(raw.catalogItemId) : null,
    nameEn: String(raw.nameEn ?? ""),
    nameBn: String(raw.nameBn ?? ""),
    unit: String(raw.unit ?? "kg"),
    quantity: Number(raw.quantity ?? 0),
    reorderLevel: Number(raw.reorderLevel ?? 0),
    notes: raw.notes != null ? String(raw.notes) : null,
    isActive: Boolean(raw.isActive ?? true),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
  };
}
