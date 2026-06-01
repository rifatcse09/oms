import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileCheck2,
  FilePenLine,
  Hourglass,
  Send,
  Truck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatMetricCard, type MetricCardTone } from "../components/StatMetricCard";
import { BdTakaIcon } from "../components/icons/BdTakaIcon";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useOrders } from "../context/OrdersContext";
import type { Order, OrderStatus } from "../types";
import { apiListAdjustments, apiListPayments, type AdjustmentTxn, type PaymentTxn } from "../lib/api";
import { getCategoryColor } from "../lib/categoryColors";
import {
  UNCATEGORIZED_LABEL,
  UNNAMED_CATEGORY_LABEL,
  UNKNOWN_CATEGORY_LABEL,
  UNKNOWN_ITEM_LABEL,
} from "../lib/uiLabels";

export function AdminDashboardPage() {
  const { orders } = useOrders();
  const { categories } = useCatalog();
  const { user } = useAuth();
  const [historyQuery, setHistoryQuery] = useState("");
  const [trendMode, setTrendMode] = useState<"weekly" | "monthly">("weekly");
  const [dateRange, setDateRange] = useState<"all" | "7d" | "30d" | "90d">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [transactions, setTransactions] = useState<{ payments: PaymentTxn[]; adjustments: AdjustmentTxn[] }>({
    payments: [],
    adjustments: [],
  });

  useEffect(() => {
    void Promise.all([apiListPayments(), apiListAdjustments()])
      .then(([payments, adjustments]) => setTransactions({ payments, adjustments }))
      .catch(() => setTransactions({ payments: [], adjustments: [] }));
  }, []);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => {
      const label = c.nameEn || c.nameBn || UNNAMED_CATEGORY_LABEL;
      map.set(c.id, label);
    });
    return map;
  }, [categories]);

  const filterMeta = useMemo(() => {
    const customers = [...new Set(orders.map((o) => o.contactPerson).filter(Boolean))].sort();
    const categories = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.categoryId)).filter(Boolean))]
      .sort((a, b) => categoryDisplayName(a, categoryNameById).localeCompare(categoryDisplayName(b, categoryNameById)));
    const products = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.itemNameEn || l.itemNameBn)).filter(Boolean))].sort();
    return { customers, categories, products };
  }, [orders, categoryNameById]);

  const filteredOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    if (dateRange === "7d") from.setDate(from.getDate() - 7);
    if (dateRange === "30d") from.setDate(from.getDate() - 30);
    if (dateRange === "90d") from.setDate(from.getDate() - 90);

    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (customerFilter !== "all" && o.contactPerson !== customerFilter) return false;
      if (dateRange !== "all") {
        const d = parseIso(o.orderDate);
        if (!d || d.getTime() < from.getTime()) return false;
      }
      if (categoryFilter !== "all" && !o.lines.some((l) => l.categoryId === categoryFilter)) return false;
      if (
        productFilter !== "all" &&
        !o.lines.some((l) => (l.itemNameEn || l.itemNameBn) === productFilter)
      )
        return false;
      return true;
    });
  }, [orders, dateRange, statusFilter, customerFilter, categoryFilter, productFilter]);

  const stats = useMemo(() => {
    const byStatus = filteredOrders.reduce(
      (acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<OrderStatus, number>,
    );
    const totalSales = filteredOrders.reduce((s, o) => s + (o.grandTotal ?? 0), 0);
    const invoiced = filteredOrders.filter((o) => o.status === "invoiced").length;
    const avg = invoiced ? totalSales / invoiced : 0;
    const completed = filteredOrders.filter((o) => o.status === "invoiced" || o.status === "delivered").length;
    const completionRate = filteredOrders.length ? (completed / filteredOrders.length) * 100 : 0;
    const processDays = filteredOrders
      .map((o) => {
        const a = parseIso(o.orderDate);
        const b = parseIso(o.deliveryDate);
        if (!a || !b) return null;
        return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
      })
      .filter((x): x is number => x != null);
    const avgProcessing = processDays.length
      ? processDays.reduce((s, d) => s + d, 0) / processDays.length
      : 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const delayed = filteredOrders.filter((o) => {
      if (o.status === "invoiced" || o.status === "delivered") return false;
      const d = parseIso(o.deliveryDate);
      return Boolean(d && d.getTime() < now.getTime());
    }).length;
    return { byStatus, totalSales, invoiced, avg, completionRate, avgProcessing, delayed };
  }, [filteredOrders]);

  const categorySales = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((order) => {
      order.lines.forEach((line) => {
        const categoryCode = line.categoryId || "uncategorized";
        map.set(categoryCode, (map.get(categoryCode) ?? 0) + Number(line.lineTotal ?? 0));
      });
    });
    return [...map.entries()]
      .map(([code, amount]) => ({
        code,
        name: categoryDisplayName(code, categoryNameById),
        amount: Math.round(amount),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [filteredOrders, categoryNameById]);

  const pieData = categorySales.map((c) => ({ code: c.code, name: c.name, value: c.amount }));
  const totalCat = pieData.reduce((s, p) => s + p.value, 0);

  const trendAnalytics = useMemo(() => {
    const invoiced = filteredOrders.filter((o) => o.status === "invoiced" && (o.grandTotal ?? 0) > 0);

    const weekMap = new Map<string, number>();
    const monthMap = new Map<string, number>();
    for (const o of invoiced) {
      const d = parseIso(o.orderDate);
      if (!d) continue;
      const weekStart = startOfWeek(d);
      const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(
        weekStart.getDate(),
      ).padStart(2, "0")}`;
      weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + (o.grandTotal ?? 0));

      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + (o.grandTotal ?? 0));
    }

    const weekly = [...weekMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([k, v]) => ({ label: k.slice(5), revenue: Math.round(v) }));

    const monthly = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([k, v]) => ({ label: k, revenue: Math.round(v) }));

    const growth = (arr: Array<{ revenue: number }>) => {
      if (arr.length < 2) return 0;
      const prev = arr[arr.length - 2].revenue;
      const curr = arr[arr.length - 1].revenue;
      if (prev <= 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    const wow = growth(weekly);
    const mom = growth(monthly);

    const currentWeek = weekly[weekly.length - 1]?.revenue ?? 0;
    const previousWeek = weekly[weekly.length - 2]?.revenue ?? 0;
    const cycleDelta =
      previousWeek > 0 ? ((currentWeek - previousWeek) / previousWeek) * 100 : currentWeek > 0 ? 100 : 0;

    return { weekly, monthly, wow, mom, currentWeek, previousWeek, cycleDelta };
  }, [filteredOrders]);

  const trendData = trendMode === "weekly" ? trendAnalytics.weekly : trendAnalytics.monthly;

  const productInsights = useMemo(() => {
    const map = new Map<
      string,
      { name: string; orders: number; qtyScore: number; sales: number }
    >();

    filteredOrders.forEach((o) => {
      o.lines.forEach((l) => {
        const key = l.itemId || `${l.itemNameEn}-${l.itemNameBn}`;
        const qtyScore =
          (parseFloat(l.kg || "0") || 0) +
          (parseFloat(l.gram || "0") || 0) / 1000 +
          (parseFloat(l.piece || "0") || 0);
        const prev = map.get(key) ?? {
          name: l.itemNameEn || l.itemNameBn || UNKNOWN_ITEM_LABEL,
          orders: 0,
          qtyScore: 0,
          sales: 0,
        };
        map.set(key, {
          name: prev.name,
          orders: prev.orders + 1,
          qtyScore: prev.qtyScore + qtyScore,
          sales: prev.sales + (l.lineTotal ?? 0),
        });
      });
    });

    const all = [...map.values()];
    const topSelling = [...all].sort((a, b) => b.sales - a.sales || b.qtyScore - a.qtyScore).slice(0, 5);
    const leastSelling = [...all].sort((a, b) => a.sales - b.sales || a.qtyScore - b.qtyScore).slice(0, 5);
    const frequent = [...all].sort((a, b) => b.orders - a.orders || b.qtyScore - a.qtyScore).slice(0, 5);
    return { topSelling, leastSelling, frequent };
  }, [filteredOrders]);

  const limited = user?.role === "moderator";
  const isModeratorView = user?.role === "moderator";

  const paymentSummary = useMemo(() => {
    const isModerator = user?.role === "moderator";
    const billedTotal = isModerator
      ? filteredOrders
          .filter((o) => o.purchaseInvoiceGenerated && (o.purchaseInvoiceGeneratedBy ?? "admin") === "moderator")
          .reduce((s, o) => s + Number(o.purchaseSubtotal ?? 0), 0)
      : filteredOrders
          .filter((o) => o.status === "invoiced" || o.invoiceGenerated)
          .reduce((s, o) => s + Number(o.grandTotal ?? 0), 0);
    const paid = transactions.payments
      .filter((txn) => ((txn.invoice_type ?? "billing") === "purchase") === isModerator)
      .reduce((s, txn) => s + Number(txn.amount || 0), 0);
    const adjusted = transactions.adjustments
      .filter((txn) => (txn.type === "purchase") === isModerator)
      .reduce((s, txn) => s + Number(txn.amount || 0), 0);
    const settledTotal = Math.max(0, paid - adjusted);
    return {
      settledTotal: Math.min(billedTotal, settledTotal),
      pendingTotal: Math.max(0, billedTotal - settledTotal),
    };
  }, [filteredOrders, transactions, user?.role]);

  const rollingSales = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    const monthStart = new Date(now);
    monthStart.setDate(now.getDate() - 29);
    let today = 0;
    let todayDeliveredCount = 0;
    let weekly = 0;
    let weeklyDeliveredCount = 0;
    let monthly = 0;
    let monthlyDeliveredCount = 0;
    /** Delivery KPIs use full order list (date-range filters use *order date* only). */
    const ordersForDeliverySalesKpi =
      customerFilter === "all"
        ? orders
        : orders.filter((o) => o.contactPerson === customerFilter);
    ordersForDeliverySalesKpi.forEach((o) => {
      if (deliveredStatusTodayLocalDay(o, now)) {
        today += orderLineTotalSumExcludingInvoice(o);
        todayDeliveredCount += 1;
      }
      if (deliveredAtCalendarDayInRange(o, weekStart, now)) {
        weekly += orderLineTotalSumExcludingInvoice(o);
        weeklyDeliveredCount += 1;
      }
      if (deliveredAtCalendarDayInRange(o, monthStart, now)) {
        monthly += orderLineTotalSumExcludingInvoice(o);
        monthlyDeliveredCount += 1;
      }
    });
    return { today, todayDeliveredCount, weekly, weeklyDeliveredCount, monthly, monthlyDeliveredCount };
  }, [orders, customerFilter]);

  const totalPurchase = useMemo(() => {
    return filteredOrders.reduce((s, o) => {
      if (o.grandTotal != null) return s + o.grandTotal;
      const subtotal = o.lines.reduce((lineSum, l) => lineSum + (l.lineTotal ?? 0), 0);
      return s + subtotal;
    }, 0);
  }, [filteredOrders]);

  const purchaseHistoryRows = useMemo(() => {
    const grouped = new Map<
      string,
      { item: string; category: string; orders: number; qtyScore: number; amount: number }
    >();
    const query = historyQuery.trim().toLowerCase();

    filteredOrders.forEach((o) => {
      o.lines.forEach((l) => {
        const itemName = l.itemNameEn || l.itemNameBn || UNKNOWN_ITEM_LABEL;
        const categoryCode = l.categoryId || "uncategorized";
        const category = categoryDisplayName(categoryCode, categoryNameById);
        const key = `${categoryCode}::${itemName}`;
        const prev = grouped.get(key) ?? { item: itemName, category, orders: 0, qtyScore: 0, amount: 0 };
        const qtyScore =
          (parseFloat(l.kg || "0") || 0) +
          (parseFloat(l.gram || "0") || 0) / 1000 +
          (parseFloat(l.piece || "0") || 0);
        grouped.set(key, {
          item: prev.item,
          category: prev.category,
          orders: prev.orders + 1,
          qtyScore: prev.qtyScore + qtyScore,
          amount: prev.amount + (l.lineTotal ?? 0),
        });
      });
    });

    return [...grouped.values()]
      .filter((r) => {
        if (!query) return true;
        return r.item.toLowerCase().includes(query) || r.category.toLowerCase().includes(query);
      })
      .sort((a, b) => b.amount - a.amount || b.orders - a.orders);
  }, [filteredOrders, historyQuery, categoryNameById]);
  const deliveryMetrics = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let delivered = 0;
    let upcoming = 0;
    let delayed = 0;
    filteredOrders.forEach((o) => {
      if (o.status === "delivered" || o.status === "invoiced") delivered += 1;
      const dd = parseIso(o.deliveryDate);
      if (dd && dd.getTime() >= now.getTime() && o.status !== "delivered" && o.status !== "invoiced") {
        upcoming += 1;
      }
      if (dd && dd.getTime() < now.getTime() && o.status !== "delivered" && o.status !== "invoiced") {
        delayed += 1;
      }
    });
    return { delivered, upcoming, delayed };
  }, [filteredOrders]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-11 min-w-[2.75rem] items-center justify-center rounded-2xl bg-primary px-2 shadow-sm">
            <span className="text-xs font-extrabold tracking-tight text-primary-foreground">HMC</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{isModeratorView ? "Moderator dashboard" : "Admin dashboard"}</h1>
            <p className="text-sm text-brand-muted">
              {isModeratorView
                ? "Purchase history, category/item trends, and pending bill visibility."
                : "Sales, receivables, categories, and order health overview."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <Filter label="Date range">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as "all" | "7d" | "30d" | "90d")}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </Filter>
          <Filter label="Order status">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | OrderStatus)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="draft">Drafted</option>
              <option value="submitted">Ordered</option>
              <option value="under_review">Processing</option>
              <option value="delivered">Delivered</option>
              <option value="invoiced">Completed (Invoice)</option>
            </select>
          </Filter>
          <Filter label="Customer">
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All customers</option>
              {filterMeta.customers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="Category">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All categories</option>
              {filterMeta.categories.map((c) => (
                <option key={c} value={c}>
                  {categoryDisplayName(c, categoryNameById)}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="Product">
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All products</option>
              {filterMeta.products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Filter>
        </div>
        {!isModeratorView ? (
          <p className="mt-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Today / weekly / monthly sales</span> use completion date:{" "}
            <span className="font-semibold text-slate-700">deliveredAt</span> when set, otherwise{" "}
            <span className="font-semibold text-slate-700">billing invoice created</span> for invoiced-only orders
            (line item totals; not billing invoice totals). The date range above filters by{" "}
            <span className="font-semibold text-slate-700">order date</span> only for charts and tables below. Customer
            filter still applies to those three cards.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatMetricCard
          title={isModeratorView ? "Total purchase" : "Today's sales"}
          value={
            isModeratorView
              ? `৳ ${Math.round(totalPurchase).toLocaleString("en-US")}`
              : `৳ ${Math.round(rollingSales.today).toLocaleString("en-US")}`
          }
          icon={BdTakaIcon}
          tone="coral"
          sparkSeed="dash-today-sales"
          secondaryLine={
            isModeratorView
              ? undefined
              : `${rollingSales.todayDeliveredCount} completed today (delivered or invoiced) · sum of line items`
          }
        />
        <StatMetricCard
          title={isModeratorView ? "Pending bills" : "Weekly sales"}
          value={
            isModeratorView
              ? `৳ ${Math.round(paymentSummary.pendingTotal).toLocaleString("en-US")}`
              : `৳ ${Math.round(rollingSales.weekly).toLocaleString("en-US")}`
          }
          icon={CalendarDays}
          tone="teal"
          sparkSeed="dash-weekly-sales"
          secondaryLine={
            isModeratorView
              ? undefined
              : `${rollingSales.weeklyDeliveredCount} completed in last 7 days · sum of line items`
          }
        />
        <StatMetricCard
          title={isModeratorView ? "Settled by admin" : "Monthly sales"}
          value={
            isModeratorView
              ? `৳ ${Math.round(paymentSummary.settledTotal).toLocaleString("en-US")}`
              : `৳ ${Math.round(rollingSales.monthly).toLocaleString("en-US")}`
          }
          icon={BarChart3}
          tone="navy"
          sparkSeed="dash-monthly-sales"
          secondaryLine={
            isModeratorView
              ? undefined
              : `${rollingSales.monthlyDeliveredCount} completed in last 30 days · sum of line items`
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatMetricCard
          title="Total orders"
          value={String(filteredOrders.length)}
          icon={ClipboardList}
          tone="amber"
          sparkSeed="dash-total-orders"
          secondaryLine="Filtered scope"
        />
        {!isModeratorView ? (
          <StatMetricCard
            title="Average order value"
            value={limited ? "—" : `৳ ${Math.round(stats.avg).toLocaleString("en-US")}`}
            icon={Activity}
            tone="slate"
            sparkSeed="dash-aov"
          />
        ) : null}
        <StatMetricCard
          title={isModeratorView ? "Invoiced / billed orders" : "Invoiced count"}
          value={String(stats.invoiced)}
          icon={FileCheck2}
          tone="coral"
          sparkSeed="dash-invoiced"
        />
      </div>

      {!isModeratorView ? (
        <div className="grid gap-4 md:grid-cols-3">
        <StatMetricCard
          title="Order completion rate"
          value={`${stats.completionRate.toFixed(1)}%`}
          icon={CheckCircle2}
          tone="teal"
          sparkSeed="dash-completion"
        />
        <StatMetricCard
          title="Average processing time"
          value={`${stats.avgProcessing.toFixed(1)} days`}
          icon={Clock3}
          tone="navy"
          sparkSeed="dash-processing"
        />
        <StatMetricCard title="Delayed orders" value={String(stats.delayed)} icon={AlertTriangle} tone="rose" sparkSeed="dash-delayed" />
        </div>
      ) : null}

      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold text-foreground">Order delivery status</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <StatMetricCard
            title="Delivered / Closed"
            value={String(deliveryMetrics.delivered)}
            icon={Truck}
            tone="teal"
            sparkSeed="delivery-delivered"
          />
          <StatMetricCard
            title="Upcoming deliveries"
            value={String(deliveryMetrics.upcoming)}
            icon={CalendarDays}
            tone="amber"
            sparkSeed="delivery-upcoming"
          />
          <StatMetricCard
            title="Delayed deliveries"
            value={String(deliveryMetrics.delayed)}
            icon={AlertTriangle}
            tone="rose"
            sparkSeed="delivery-delayed"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
          <h2 className="text-base font-semibold">{isModeratorView ? "Purchase by category" : "Sales by category"}</h2>
          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={88}
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={getCategoryColor(String(pieData[i]?.code ?? ""))} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`৳ ${v.toLocaleString("en-US")}`, ""]} />
                <Legend wrapperStyle={{ fontSize: 14 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-sm text-slate-600">
            Total · ৳ {totalCat.toLocaleString("en-US")}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
          <h2 className="text-sm font-semibold">Category bar chart</h2>
          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categorySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={90} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`৳ ${v.toLocaleString("en-US")}`, ""]} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {categorySales.map((entry) => (
                    <Cell key={`bar-${entry.code}`} fill={getCategoryColor(entry.code)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Billing & revenue trends</h2>
          <div className="inline-flex rounded-xl border border-slate-200 p-1">
            <button
              type="button"
              onClick={() => setTrendMode("weekly")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                trendMode === "weekly" ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setTrendMode("monthly")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                trendMode === "monthly" ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <StatMetricCard
            title="Growth (WoW)"
            value={`${trendAnalytics.wow >= 0 ? "+" : ""}${trendAnalytics.wow.toFixed(1)}%`}
            icon={Activity}
            tone="teal"
            sparkSeed="trend-wow"
            showTrendRow={false}
            caption="vs prior week (invoiced revenue)"
          />
          <StatMetricCard
            title="Growth (MoM)"
            value={`${trendAnalytics.mom >= 0 ? "+" : ""}${trendAnalytics.mom.toFixed(1)}%`}
            icon={BarChart3}
            tone="navy"
            sparkSeed="trend-mom"
            showTrendRow={false}
            caption="vs prior month (invoiced revenue)"
          />
          <StatMetricCard
            title="Billing cycle comparison"
            value={`${trendAnalytics.cycleDelta >= 0 ? "+" : ""}${trendAnalytics.cycleDelta.toFixed(1)}%`}
            icon={BdTakaIcon}
            tone="coral"
            sparkSeed="trend-cycle"
            showTrendRow={false}
            caption="Week-over-week change"
            secondaryLine={`Current ৳ ${trendAnalytics.currentWeek.toLocaleString("en-US")} · Previous ৳ ${trendAnalytics.previousWeek.toLocaleString("en-US")}`}
          />
        </div>

        <div className="h-64 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip formatter={(v: number) => [`৳ ${v.toLocaleString("en-US")}`, "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="#FF5C35" strokeWidth={2.5} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold text-foreground">Orders by status</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
          {(
            [
              "draft",
              "submitted",
              "under_review",
              "delivered",
              "invoiced",
            ] as OrderStatus[]
          ).map((st, idx) => {
            const label = orderStatusLabel(st);
            const tones: MetricCardTone[] = ["slate", "amber", "teal", "navy", "coral"];
            const icons = [FilePenLine, Send, Hourglass, Truck, FileCheck2] as const;
            const Icon = icons[idx] ?? ClipboardList;
            return (
              <StatMetricCard
                key={st}
                compact
                title={label}
                value={String(stats.byStatus[st] ?? 0)}
                icon={Icon}
                tone={tones[idx] ?? "slate"}
                sparkSeed={`order-status-${st}`}
              />
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold text-foreground">{isModeratorView ? "Purchase insights" : "Product-level insights"}</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <InsightList
            title={isModeratorView ? "Top purchased products" : "Top selling products"}
            items={productInsights.topSelling}
            metricLabel={isModeratorView ? "Purchase" : "Sales"}
            metric={(x) => `৳ ${Math.round(x.sales).toLocaleString("en-US")}`}
          />
          <InsightList
            title={isModeratorView ? "Least purchased products" : "Least selling products"}
            items={productInsights.leastSelling}
            metricLabel={isModeratorView ? "Purchase" : "Sales"}
            metric={(x) => `৳ ${Math.round(x.sales).toLocaleString("en-US")}`}
          />
          <InsightList
            title="Frequently ordered items"
            items={productInsights.frequent}
            metricLabel="Orders"
            metric={(x) => String(x.orders)}
          />
        </div>
      </div>

      {isModeratorView ? (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-foreground">Purchase history (item/category)</h2>
            <input
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              placeholder="Search item or category"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-80"
            />
          </div>
          <div className="table-scroll mt-4 max-h-[420px] rounded-2xl border border-border shadow-inner">
            <table className="min-w-[780px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Order rows</th>
                  <th className="px-3 py-2 text-right">Qty score</th>
                  <th className="px-3 py-2 text-right">Total purchase</th>
                </tr>
              </thead>
              <tbody>
                {purchaseHistoryRows.map((r) => (
                  <tr key={`${r.category}-${r.item}`} className="border-t border-border bg-card">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.item}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.category}</td>
                    <td className="px-3 py-2.5 text-right">{r.orders}</td>
                    <td className="px-3 py-2.5 text-right">{r.qtyScore.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">৳ {Math.round(r.amount).toLocaleString("en-US")}</td>
                  </tr>
                ))}
                {purchaseHistoryRows.length === 0 ? (
                  <tr className="border-t border-border bg-card">
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      No purchase history found for current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

    </div>
  );
}

function orderStatusLabel(st: OrderStatus): string {
  if (st === "draft") return "Drafted";
  if (st === "submitted") return "Ordered";
  if (st === "under_review") return "Processing";
  if (st === "invoiced") return "Completed (Invoice)";
  return "Delivered";
}

function InsightList({
  title,
  items,
  metricLabel,
  metric,
}: {
  title: string;
  items: Array<{ name: string; orders: number; qtyScore: number; sales: number }>;
  metricLabel: string;
  metric: (x: { name: string; orders: number; qtyScore: number; sales: number }) => string;
}) {
  return (
    <div className="rounded-2xl border border-white bg-card p-4 shadow-sm">
      <p className="text-base font-bold text-slate-800">{title}</p>
      <div className="mt-3 space-y-2.5">
        {items.map((x, idx) => (
          <div
            key={`${title}-${x.name}-${idx}`}
            className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm"
          >
            <span className="truncate text-sm font-medium text-slate-700">
              {idx + 1}. {x.name}
            </span>
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
              {metricLabel}: {metric(x)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sum of line `lineTotal` only — does not use billing invoice totals (`grandTotal` / `billingSubtotal`). */
function orderLineTotalSumExcludingInvoice(o: Order): number {
  return o.lines.reduce((s, l) => s + Number(l.lineTotal ?? 0), 0);
}

/**
 * Calendar yyyy-mm-dd for delivered-at (handles MySQL "YYYY-MM-DD HH:mm:ss" without TZ quirks).
 * ISO strings with T/Z still go through the local Date calendar.
 */
function calendarDayFromDeliveredAt(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.includes("T") || t.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : formatIso(d);
  }
  const m = /^(\d{4}-\d{2}-\d{2})[ T]/.exec(t);
  if (m) return m[1];
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : formatIso(d);
}

/** Counts `delivered` and `invoiced` (after billing, status is no longer `delivered`). */
function isDeliveredOrInvoicedForSalesKpi(o: Order): boolean {
  return o.status === "delivered" || o.status === "invoiced";
}

/**
 * Day used for today / weekly / monthly sales: `deliveredAt` when present; else billing invoice time for invoiced
 * orders (covers legacy rows missing `deliveredAt`).
 */
function calendarDayForSalesKpi(o: Order): string | null {
  const dAt = o.deliveredAt?.trim();
  if (dAt) {
    const fromDelivered = calendarDayFromDeliveredAt(dAt);
    if (fromDelivered) return fromDelivered;
  }
  if (o.status === "invoiced") {
    const inv = o.billingInvoiceCreatedAt?.trim();
    if (inv) return calendarDayFromDeliveredAt(inv);
  }
  return null;
}

/** Completed order (`delivered` or `invoiced`) and completion calendar day in [startDay, endDay] inclusive. */
function deliveredAtCalendarDayInRange(o: Order, startDay: Date, endDay: Date): boolean {
  if (!isDeliveredOrInvoicedForSalesKpi(o)) return false;
  const day = calendarDayForSalesKpi(o);
  if (!day) return false;
  const lo = formatIso(startDay);
  const hi = formatIso(endDay);
  return day >= lo && day <= hi;
}

/** Completed today: `delivered` or `invoiced`, using `calendarDayForSalesKpi`. */
function deliveredStatusTodayLocalDay(o: Order, dayStart: Date): boolean {
  if (!isDeliveredOrInvoicedForSalesKpi(o)) return false;
  const day = calendarDayForSalesKpi(o);
  if (!day) return false;
  return day === formatIso(dayStart);
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

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function categoryDisplayName(code: string, categoryNameById: Map<string, string>): string {
  if (!code) return UNCATEGORIZED_LABEL;
  if (code === "uncategorized") return UNCATEGORIZED_LABEL;
  return categoryNameById.get(code) ?? UNKNOWN_CATEGORY_LABEL;
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs text-slate-600">
      {label}
      {children}
    </label>
  );
}
