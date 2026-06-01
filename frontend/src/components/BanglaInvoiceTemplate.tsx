import { useBrand } from "../context/BrandContext";
import { formatMoneyBn, toBanglaDigits } from "../lib/banglaNumerals";
import { billedAmountsForLine } from "../lib/billingLineAmounts";
import { formatDateDdMmYyyy } from "../lib/formatDisplayDate";
import { formatQtyLineBn, itemLabelBn } from "../lib/uiLabels";
import type { Order, OrderLine } from "../types";

/** বাংলা ইনভয়েস — modern card layout inspired by sample UI. */
export function BanglaInvoiceTemplate({
  order,
  invoiceType = "billing",
  companyName,
  companyNameBn,
  companyTagline = "সকল প্রকার মুদি মালামাল সুলভ মূল্যে\nখুচরা ও পাইকারী বিক্রয় করা হয়।",
  companyTaglineBn = "সকল প্রকার মুদি ও তাজা পণ্য খুচরা ও পাইকারী।",
  companyAddress,
  hotline,
}: {
  order: Order;
  invoiceType?: "billing" | "purchase";
  companyName?: string;
  companyNameBn?: string;
  companyTagline?: string;
  companyTaglineBn?: string;
  companyAddress?: string;
  hotline?: string;
}) {
  const { brand } = useBrand();
  const logoSrc = brand.logoUrl ?? `${import.meta.env.BASE_URL}hmc-logo.png`;
  const resolvedNameEn = companyName ?? brand.companyNameEn;
  const resolvedNameBn = companyNameBn ?? brand.companyNameBn;
  const resolvedAddress = companyAddress ?? brand.companyAddress;
  const resolvedHotline = hotline ?? brand.hotline;
  const categoryMarkups = order.billingCategoryMarkups ?? {};
  const globalMarkupPercent = Number(order.markupPercent ?? 0);
  const dueDate = order.deliveryDate;

  const rows: OrderLine[] =
    order.lines.length > 0
      ? order.lines
      : [
          {
            id: "x",
            serial: 1,
            categoryId: "pantry",
            itemId: "pantry-1",
            itemNameBn: "চাউল",
            itemNameEn: "Rice",
            kg: "50",
            gram: "",
            piece: "",
            unitPrice: 120,
            lineTotal: 6000,
          },
        ];

  const purchaseBaseSum = rows.reduce(
    (s, r) => s + Number(r.lineTotal ?? 0),
    0,
  );
  const sub =
    invoiceType === "purchase"
      ? (order.purchaseSubtotal ?? purchaseBaseSum)
      : purchaseBaseSum || (order.subtotal ?? 0);

  const billedRows = rows.map((r) => {
    if (invoiceType === "purchase") {
      const purchaseUnit = Number(r.unitPrice ?? 0);
      const billedLine = Number(r.lineTotal ?? 0);
      return { line: r, billedUnit: purchaseUnit, billedLine, pct: 0 };
    }
    const { billedUnit, billedLine, pct } = billedAmountsForLine(
      r,
      categoryMarkups,
      globalMarkupPercent,
    );
    return { line: r, billedUnit, billedLine, pct };
  });
  const computedGrand = billedRows.reduce((sum, r) => sum + r.billedLine, 0);
  const headerBillingGrand =
    invoiceType === "billing"
      ? (() => {
          const a = order.billingSubtotal;
          const b = order.grandTotal;
          if (Number.isFinite(Number(a)) && Number(a) > 0) return Number(a);
          if (Number.isFinite(Number(b)) && Number(b) > 0) return Number(b);
          return undefined;
        })()
      : undefined;
  const grand =
    invoiceType === "purchase"
      ? Number(order.purchaseSubtotal) > 0
        ? Number(order.purchaseSubtotal)
        : computedGrand > 0
          ? computedGrand
          : sub
      : headerBillingGrand != null
        ? headerBillingGrand
        : computedGrand > 0
          ? computedGrand
          : sub;

  const invoiceHeading =
    invoiceType === "purchase"
      ? "PURCHASE INVOICE / ক্রয় চালান"
      : "BILLING INVOICE / গ্রাহক বিল";

  return (
    <div className="font-bn overflow-hidden rounded-3xl bg-slate-50 p-3 shadow-card print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none sm:p-5">
      <div className="rounded-3xl bg-white p-4 sm:p-6 print:overflow-visible print:p-0">
        <div className="print-invoice-header flex flex-nowrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          {/* Left: company info */}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
              {resolvedNameBn}
            </h2>
            {resolvedNameEn !== resolvedNameBn ? (
              <p className="mt-0.5 text-xs font-medium text-slate-600 sm:text-sm">
                {resolvedNameEn}
              </p>
            ) : null}
            <p className="mt-2 text-xs font-bold text-slate-900 sm:text-sm whitespace-pre-line">
              {companyTaglineBn}
            </p>
            {companyTagline !== companyTaglineBn ? (
              <p className="mt-1 text-xs font-bold text-slate-900 sm:text-sm whitespace-pre-line">
                {companyTagline}
              </p>
            ) : null}
            <p className="mt-4 text-xs text-slate-700 sm:text-sm">
              {resolvedAddress}
            </p>
            <p className="text-xs text-slate-700 sm:text-sm">
              হটলাইন: {resolvedHotline}
            </p>
          </div>
          {/* Right: logo + invoice heading */}
          <div className="shrink-0 -mt-4 self-start text-right print:-mt-6">
            <img
              src={logoSrc}
              alt={resolvedNameEn}
              className="ml-auto h-24 w-auto object-contain sm:h-28"
            />
            <h2 className="mt-1 whitespace-nowrap text-base font-extrabold tracking-[0.01em] text-slate-900 sm:text-lg">
              {invoiceHeading}
            </h2>
            <p className="font-mono text-sm font-bold text-blue-700 sm:text-base">
              #{toBanglaDigits(order.orderNo)}
            </p>
          </div>
        </div>

        <div className="print-invoice-body">
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {invoiceType !== "purchase" ? (
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">বিল প্রদানকারী</p>
                <p className="text-base font-semibold">{companyNameBn}</p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {companyAddress}
                </p>
                <p className="mt-1 text-sm text-slate-700">হটলাইন: {hotline}</p>
              </div>
            ) : null}
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">বিল গ্রহীতা</p>
              <p className="text-base font-semibold">{order.contactPerson}</p>
              <p className="mt-0.5 text-sm text-slate-700">{order.phone}</p>
              <p className="mt-1 text-sm text-slate-700">
                {order.billingAddress}
              </p>
            </div>
            {invoiceType === "purchase" ? (
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">ডেলিভারি ঠিকানা</p>
                <p className="text-sm font-medium">{order.deliveryAddress}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-0 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl p-3">
              <p className="text-xs text-slate-500">ইস্যুর তারিখ</p>
              <p className="font-semibold">
                {toBanglaDigits(formatDateDdMmYyyy(order.orderDate))}
              </p>
            </div>
            <div className="rounded-xl p-3">
              <p className="text-xs text-slate-500">পরিশোধের শেষ তারিখ</p>
              <p className="font-semibold">
                {toBanglaDigits(formatDateDdMmYyyy(dueDate))}
              </p>
            </div>
            {invoiceType !== "purchase" ? (
              <div className="rounded-xl p-3">
                <p className="text-xs text-slate-500">ডেলিভারি ঠিকানা</p>
                <p className="text-sm font-medium">{order.deliveryAddress}</p>
              </div>
            ) : null}
          </div>

          {/* Screen: rounded border card */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 print:hidden">
            <div className="divide-y divide-slate-100 md:hidden">
              {billedRows.map(({ line: r, billedLine, billedUnit }) => (
                <div key={r.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        ক্রমিক: {toBanglaDigits(String(r.serial))}
                      </p>
                      <p className="font-semibold">{itemLabelBn(r)}</p>
                    </div>
                    <p className="text-right text-sm font-semibold">
                      ৳ {formatMoneyBn(billedLine)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 px-2 py-1">
                      <p className="text-slate-500">পরিমাণ</p>
                      <p className="font-medium">
                        {formatQtyLineBn(r.kg, r.gram, r.piece)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1 text-right">
                      <p className="text-slate-500">ইউনিট মূল্য</p>
                      <p className="font-medium">
                        ৳ {formatMoneyBn(billedUnit)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2">ক্রমিক</th>
                  <th className="px-3 py-2">আইটেম</th>
                  <th className="px-3 py-2">পরিমাণ</th>
                  <th className="px-3 py-2 text-right">ইউনিট মূল্য</th>
                  <th className="px-3 py-2 text-right">মোট মূল্য</th>
                </tr>
              </thead>
              <tbody>
                {billedRows.map(({ line: r, billedUnit, billedLine }) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">
                      {toBanglaDigits(String(r.serial))}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {itemLabelBn(r)}
                    </td>
                    <td className="px-3 py-2">
                      {formatQtyLineBn(r.kg, r.gram, r.piece)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ৳ {formatMoneyBn(billedUnit)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      ৳ {formatMoneyBn(billedLine)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Print-only: per-cell borders with border-collapse — no outer box that
              closes/reopens at page breaks, matching the challan print style. */}
          <table className="hidden w-full border-collapse text-left text-sm print:table">
            <thead className="text-xs font-semibold text-slate-600">
              <tr>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2">
                  ক্রমিক
                </th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2">
                  আইটেম
                </th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2">
                  পরিমাণ
                </th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2 text-right">
                  ইউনিট মূল্য
                </th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2 text-right">
                  মোট মূল্য
                </th>
              </tr>
            </thead>
            <tbody>
              {billedRows.map(({ line: r, billedUnit, billedLine }) => (
                <tr key={r.id} style={{ breakInside: "avoid" }}>
                  <td className="border border-slate-200 px-3 py-2 font-medium">
                    {toBanglaDigits(String(r.serial))}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 font-semibold">
                    {itemLabelBn(r)}
                  </td>
                  <td className="border border-slate-200 px-3 py-2">
                    {formatQtyLineBn(r.kg, r.gram, r.piece)}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-right">
                    ৳ {formatMoneyBn(billedUnit)}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-right font-semibold">
                    ৳ {formatMoneyBn(billedLine)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_300px]">
            <div />
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between text-base font-bold">
                <span>সর্বমোট</span>
                <span className="text-slate-900">৳ {formatMoneyBn(grand)}</span>
              </div>
            </div>
          </div>

          {order.signatureDataUrl ? (
            <div className="mt-6 border-t border-dashed border-slate-200 pt-4">
              <p className="text-xs text-slate-500">গ্রাহকের স্বাক্ষর</p>
              <img
                src={order.signatureDataUrl}
                alt="Signature"
                className="mt-1 h-16 max-w-[200px] object-contain"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
