import { Banknote, Receipt, RefreshCw, Scale } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SortableHeader, nextSort, sortRows, type SortDir } from "../components/SortableHeader";
import { ExportToolbar, useColumnVisibility } from "../components/ExportToolbar";
import { useLocation } from "react-router-dom";
import { StatMetricCard } from "../components/StatMetricCard";
import { PaginationControls } from "../components/PaginationControls";
import { apiListLedger, type LedgerEntry } from "../lib/api";
import { formatDateDdMmYyyyOrDash } from "../lib/formatDisplayDate";
import { humanLedgerEntryType, ledgerBookFromEntryType, ledgerBookLabel, type LedgerBook } from "../lib/ledgerDisplay";

type RowType = "Invoice" | "Payment" | "Adjustment";

type NormalizedLedgerRow = {
  id: number;
  date: string;
  customer: string;
  orderNo: string;
  book: LedgerBook;
  entryLabel: string;
  entryTypeRaw: string;
  ref: string;
  type: RowType;
  debit: number;
  credit: number;
};

function classifyRow(entryType: string): RowType {
  const isInvoice = entryType.includes("invoice");
  const isPayment = entryType.includes("payment");
  if (isInvoice) return "Invoice";
  if (isPayment) return "Payment";
  return "Adjustment";
}

export function AdminFinancialLedgerPage() {
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | RowType>("all");
  const [bookFilter, setBookFilter] = useState<"all" | LedgerBook>("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (field: string) => {
    const next = nextSort({ key: sortKey, dir: sortDir }, field);
    setSortKey(next.key);
    setSortDir(next.dir);
    setPage(1);
  };
  const [ledgerRows, setLedgerRows] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLedger = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    void apiListLedger()
      .then((rows) => setLedgerRows(rows))
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Failed to load ledger data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void loadLedger();
  }, [location.key, loadLedger]);

  const normalized = useMemo((): NormalizedLedgerRow[] => {
    const out: NormalizedLedgerRow[] = [];
    ledgerRows.forEach((entry) => {
      const entryTypeRaw = String(entry.entry_type ?? "");
      const book = ledgerBookFromEntryType(entryTypeRaw);
      const amount = Number(entry.amount || 0);
      const orderNo = entry.order_no?.trim() || "";
      const createdSlice = String(entry.created_at ?? "").trim().slice(0, 10);
      const orderDateSlice = String(entry.order_date ?? "").trim().slice(0, 10);
      const rawDate = createdSlice || orderDateSlice;
      out.push({
        id: entry.id ?? 0,
        date: rawDate ? formatDateDdMmYyyyOrDash(rawDate) : "—",
        customer: entry.contact_person?.trim() || "—",
        orderNo,
        book,
        entryLabel: humanLedgerEntryType(entryTypeRaw),
        entryTypeRaw,
        ref: orderNo ? `${orderNo} · ${humanLedgerEntryType(entryTypeRaw)}` : humanLedgerEntryType(entryTypeRaw),
        type: classifyRow(entryTypeRaw),
        debit: entry.direction === "debit" ? amount : 0,
        credit: entry.direction === "credit" ? amount : 0,
      });
    });
    out.sort((a, b) => a.id - b.id);
    return out;
  }, [ledgerRows]);

  const filtered = useMemo(() => {
    return normalized.filter((r) => {
      if (bookFilter !== "all" && r.book !== bookFilter) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (customerFilter !== "all" && r.customer !== customerFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        r.customer.toLowerCase().includes(q) ||
        r.ref.toLowerCase().includes(q) ||
        r.orderNo.toLowerCase().includes(q) ||
        r.entryLabel.toLowerCase().includes(q) ||
        r.entryTypeRaw.toLowerCase().includes(q) ||
        r.date.includes(q) ||
        r.type.toLowerCase().includes(q) ||
        ledgerBookLabel(r.book).toLowerCase().includes(q)
      );
    });
  }, [normalized, bookFilter, typeFilter, customerFilter, query]);

  const sortedFiltered = useMemo(() => {
    if (!sortKey) return filtered;
    return sortRows(filtered, sortKey as keyof typeof filtered[0], sortDir);
  }, [filtered, sortKey, sortDir]);

  const rows = useMemo(() => {
    let balance = 0;
    const withBalance = sortedFiltered.map((r) => {
      balance += r.credit - r.debit;
      return { ...r, balance };
    });
    return sortKey ? withBalance : withBalance.reverse();
  }, [sortedFiltered, sortKey]);

  const totalDebit = filtered.reduce((s, r) => s + r.debit, 0);
  const totalCredit = filtered.reduce((s, r) => s + r.credit, 0);
  const closing = filtered.length > 0 ? filtered.reduce((b, r) => b + (r.credit - r.debit), 0) : 0;
  const customers = [...new Set(normalized.map((r) => r.customer))].sort((a, b) => a.localeCompare(b));

  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / perPage)));
  const pagedRows = rows.slice((safePage - 1) * perPage, safePage * perPage);

  const LEDGER_COLS = [
    { key: "date", label: "Date" },
    { key: "book", label: "Book" },
    { key: "customer", label: "Customer" },
    { key: "ref", label: "Reference" },
    { key: "entryLabel", label: "Entry" },
    { key: "type", label: "Type" },
    { key: "debit", label: "Debit" },
    { key: "credit", label: "Credit" },
    { key: "balance", label: "Running balance" },
  ];
  const { visibleColumns: ledgerVisibleCols, toggleColumn: toggleLedgerCol, isVisible: ledgerColVisible } = useColumnVisibility(LEDGER_COLS);

  const getLedgerData = () => {
    const headers = LEDGER_COLS.filter((c) => ledgerColVisible(c.key)).map((c) => c.label);
    const exportRows = rows.map((r) => {
      const cols: string[] = [];
      if (ledgerColVisible("date")) cols.push(r.date);
      if (ledgerColVisible("book")) cols.push(ledgerBookLabel(r.book));
      if (ledgerColVisible("customer")) cols.push(r.customer);
      if (ledgerColVisible("ref")) cols.push(r.ref);
      if (ledgerColVisible("entryLabel")) cols.push(r.entryLabel);
      if (ledgerColVisible("type")) cols.push(r.type);
      if (ledgerColVisible("debit")) cols.push(r.debit > 0 ? String(r.debit) : "");
      if (ledgerColVisible("credit")) cols.push(r.credit > 0 ? String(r.credit) : "");
      if (ledgerColVisible("balance")) cols.push(String(r.balance));
      return cols;
    });
    return { headers, rows: exportRows };
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Financial ledger</h1>
        {loadError ? <p className="mt-1 text-sm font-semibold text-rose-600">{loadError}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPage(1);
              void loadLedger();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh from server
          </button>
          <p className="text-xs text-slate-500">
            After a DB purge or script, click refresh—this page does not poll automatically.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatMetricCard
          title="Total debit (filtered)"
          value={`৳ ${Math.round(totalDebit).toLocaleString("en-US")}`}
          icon={Receipt}
          tone="coral"
          sparkSeed="ledger-total-debit"
        />
        <StatMetricCard
          title="Total credit (filtered)"
          value={`৳ ${Math.round(totalCredit).toLocaleString("en-US")}`}
          icon={Banknote}
          tone="teal"
          sparkSeed="ledger-total-credit"
        />
        <StatMetricCard
          title="Closing credit − debit (filtered)"
          value={`৳ ${Math.round(closing).toLocaleString("en-US")}`}
          icon={Scale}
          tone="navy"
          sparkSeed="ledger-closing"
        />
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-slate-600">
            Search
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="order no, customer, entry…"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Book
            <select
              value={bookFilter}
              onChange={(e) => {
                setBookFilter(e.target.value as "all" | LedgerBook);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All books</option>
              <option value="purchase">Supplier (purchase)</option>
              <option value="billing">Customer (billing)</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Type
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as "all" | RowType);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All types</option>
              <option value="Invoice">Invoice</option>
              <option value="Payment">Payment</option>
              <option value="Adjustment">Adjustment</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Customer
            <select
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All customers</option>
              {customers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Showing <strong>{rows.length}</strong> entries</p>
          <ExportToolbar filename="ledger-export" columns={LEDGER_COLS} visibleColumns={ledgerVisibleCols} onToggleColumn={toggleLedgerCol} getData={getLedgerData} />
        </div>

        <div className="table-scroll mt-2 max-h-[min(70vh,640px)] rounded-2xl border border-border bg-white shadow-inner">
          <table className="min-w-[960px] w-full text-left text-base">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted text-sm font-semibold uppercase tracking-wide text-foreground shadow-sm">
              <tr>
                {ledgerColVisible("date") && <th className="px-3 py-2"><SortableHeader label="Date" field="date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {ledgerColVisible("book") && <th className="px-3 py-2"><SortableHeader label="Book" field="book" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {ledgerColVisible("customer") && <th className="px-3 py-2"><SortableHeader label="Customer" field="customer" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {ledgerColVisible("ref") && <th className="px-3 py-2"><SortableHeader label="Reference" field="ref" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {ledgerColVisible("entryLabel") && <th className="px-3 py-2"><SortableHeader label="Entry" field="entryLabel" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {ledgerColVisible("type") && <th className="px-3 py-2"><SortableHeader label="Type" field="type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {ledgerColVisible("debit") && <th className="px-3 py-2 text-right"><SortableHeader label="Debit" field="debit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {ledgerColVisible("credit") && <th className="px-3 py-2 text-right"><SortableHeader label="Credit" field="credit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>}
                {ledgerColVisible("balance") && <th className="px-3 py-2 text-right">Running balance</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="border-t border-border bg-card">
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-500">
                    Loading ledger entries...
                  </td>
                </tr>
              ) : null}
              {pagedRows.map((r) => (
                <tr key={r.id} className="border-t border-border bg-card">
                  {ledgerColVisible("date") && <td className="px-3 py-3.5">{r.date}</td>}
                  {ledgerColVisible("book") && <td className="px-3 py-3.5 text-xs font-semibold text-slate-700">{ledgerBookLabel(r.book)}</td>}
                  {ledgerColVisible("customer") && <td className="px-3 py-3.5 font-medium">{r.customer}</td>}
                  {ledgerColVisible("ref") && <td className="px-3 py-3.5 font-mono text-sm text-slate-800">{r.orderNo || "—"}</td>}
                  {ledgerColVisible("entryLabel") && <td className="px-3 py-3.5 text-sm text-slate-800">{r.entryLabel}</td>}
                  {ledgerColVisible("type") && (
                    <td className="px-3 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.type === "Invoice" ? "bg-muted text-primary" : r.type === "Payment" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{r.type}</span>
                    </td>
                  )}
                  {ledgerColVisible("debit") && <td className="px-3 py-3.5 text-right">৳ {Math.round(r.debit).toLocaleString("en-US")}</td>}
                  {ledgerColVisible("credit") && <td className="px-3 py-3.5 text-right">৳ {Math.round(r.credit).toLocaleString("en-US")}</td>}
                  {ledgerColVisible("balance") && <td className="px-3 py-3.5 text-right font-semibold">৳ {Math.round(r.balance).toLocaleString("en-US")}</td>}
                </tr>
              ))}
              {!loading && pagedRows.length === 0 ? (
                <tr className="border-t border-border bg-card">
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-500">
                    No ledger rows found for current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <PaginationControls
          totalItems={rows.length}
          page={safePage}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={(size) => {
            setPerPage(size);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
