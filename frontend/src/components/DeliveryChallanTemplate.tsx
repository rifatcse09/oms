import { useBrand } from "../context/BrandContext";
import { formatDeliveryWindow } from "../lib/deliveryWindow";
import { formatDateDdMmYyyy } from "../lib/formatDisplayDate";
import { formatQtyLineBn, itemLabelBn } from "../lib/uiLabels";
import type { Order, OrderLine } from "../types";

/** বাংলা ডেলিভারি চালান — শুধু বস্তু ও পরিমাণ, মূল্য ছাড়া। */
export function DeliveryChallanTemplate({ order }: { order: Order }) {
  const { brand } = useBrand();
  const logoSrc = brand.logoUrl ?? `${import.meta.env.BASE_URL}hmc-logo.png`;
  const rows: OrderLine[] = order.lines;

  return (
    <div className="font-bn">
      <div className="flex min-h-[1080px] flex-col bg-white p-4 print:block print:min-h-0 print:p-0 sm:p-6">
        {/* ── Company header ──────────────────────────────────────── */}
        <div className="print-challan-header flex flex-nowrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          {/* Left: company info — flex-1 min-w-0 so it shrinks instead of pushing the logo off */}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
              {brand.companyNameBn}
            </h2>
            {(brand.challanDescription ?? "").split("\n").map((line, i) => (
              <p
                key={i}
                className="text-sm font-bold text-slate-900 sm:text-base"
              >
                {line}
              </p>
            ))}
            <p className="mt-4 text-xs text-slate-700 sm:text-sm">
              {brand.companyAddress}
            </p>
            <p className="text-xs text-slate-700 sm:text-sm">
              হটলাইন: {brand.hotline}
            </p>
          </div>
          {/* Right: logo + challan number — shrink-0 keeps it from collapsing */}
          <div className="shrink-0 self-start text-right -mt-4 print:-mt-6">
            <img
              src={logoSrc}
              alt={brand.companyNameBn}
              className="ml-auto h-24 w-auto object-contain sm:h-28"
            />
            <h3 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">
              ডেলিভারি চালান
            </h3>
            <p className="mt-0.5 font-mono text-base font-bold text-blue-700 sm:text-lg">
              #{order.orderNo}
            </p>
          </div>
        </div>

        {/* ── Order meta + item list ───────────────────────────────── */}
        <div className="print-challan-body">
          <div className="mt-4 grid gap-3 print:mt-3 sm:grid-cols-3">
            <div className="rounded-xl p-3">
              <p className="text-xs text-slate-500">অর্ডারের তারিখ</p>
              <p className="font-semibold">{toBanglaDate(order.orderDate)}</p>
            </div>
            <div className="rounded-xl p-3">
              <p className="text-xs text-slate-500">ডেলিভারির তারিখ</p>
              <p className="font-semibold">
                {toBanglaDate(order.deliveryDate)}
              </p>
            </div>
            <div className="rounded-xl p-3">
              <p className="text-xs text-slate-500">সময়</p>
              <p className="font-semibold">
                {formatDeliveryWindow(order.deliveryTime)}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">প্রদানকারী</p>
              <p className="font-semibold">{order.contactPerson}</p>
              <p className="mt-0.5 text-sm text-slate-700">{order.phone}</p>
              <p className="mt-1 text-sm text-slate-700">
                {order.billingAddress}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">ডেলিভারি ঠিকানা</p>
              <p className="text-sm font-medium">{order.deliveryAddress}</p>
            </div>
          </div>

          {/* Screen: rounded border card */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 print:hidden">
            <div className="divide-y divide-slate-100 md:hidden">
              {rows.map((r) => (
                <div key={r.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        ক্রমিক: {toBanglaNum(String(r.serial))}
                      </p>
                      <p className="font-semibold">{itemLabelBn(r)}</p>
                    </div>
                    <p className="max-w-[14rem] rounded-lg bg-slate-50 px-2 py-1 text-left text-sm font-medium leading-relaxed whitespace-normal break-words">
                      {formatQtyLineBn(r.kg, r.gram, r.piece)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <table className="hidden w-full table-fixed text-left text-sm md:table">
              <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="w-20 px-3 py-2 whitespace-nowrap">ক্রমিক</th>
                  <th className="px-3 py-2">পণ্যের নাম</th>
                  <th className="w-72 px-3 py-2 text-left whitespace-nowrap">
                    পরিমাণ
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {toBanglaNum(String(r.serial))}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {itemLabelBn(r)}
                    </td>
                    <td className="px-3 py-2 text-left whitespace-normal break-words leading-relaxed">
                      {formatQtyLineBn(r.kg, r.gram, r.piece)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/*
           * Print-only table: uses border-collapse + per-cell borders instead of an
           * outer border box. Per-cell borders never "close" at a page break, so there
           * is no empty-space artifact and no double-border between pages.
           * Each <tr> has break-inside:avoid so no row is ever split mid-page.
           */}
          <table className="hidden w-full table-fixed border-collapse text-left text-sm print:table">
            <thead className="text-xs font-semibold text-slate-600">
              <tr>
                <th className="w-20 border border-slate-300 bg-slate-100 px-3 py-2 whitespace-nowrap">
                  ক্রমিক
                </th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2">
                  পণ্যের নাম
                </th>
                <th className="w-72 border border-slate-300 bg-slate-100 px-3 py-2 text-left whitespace-nowrap">
                  পরিমাণ
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ breakInside: "avoid" }}>
                  <td className="border border-slate-200 px-3 py-2 font-medium whitespace-nowrap">
                    {toBanglaNum(String(r.serial))}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 font-semibold">
                    {itemLabelBn(r)}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-left whitespace-normal break-words leading-relaxed">
                    {formatQtyLineBn(r.kg, r.gram, r.piece)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Signature footer ─────────────────────────────────────── */}
        <div className="print-challan-footer mt-auto pt-8 print:mt-8 print:pt-0">
          <div className="flex items-end justify-between gap-12 sm:gap-24">
            <div className="text-left">
              <div className="h-0 w-32 border-t-2 border-black sm:w-44" />
              <p className="mt-2 text-sm font-semibold text-slate-900 sm:text-base">
                অর্ডার প্রস্তুতকারী
              </p>
            </div>
            <div className="text-right">
              {order.signatureDataUrl ? (
                <div className="mb-2 flex justify-end">
                  <img
                    src={order.signatureDataUrl}
                    alt="Signature"
                    className="h-16 max-w-[180px] object-contain"
                  />
                </div>
              ) : null}
              <div className="ml-auto h-0 w-32 border-t-2 border-black sm:w-44" />
              <p className="mt-2 text-sm font-semibold text-slate-900 sm:text-base">
                পক্ষে / কোম্পানি
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function toBanglaNum(input: string): string {
  const map: Record<string, string> = {
    "0": "০",
    "1": "১",
    "2": "২",
    "3": "৩",
    "4": "৪",
    "5": "৫",
    "6": "৬",
    "7": "৭",
    "8": "৮",
    "9": "৯",
  };
  return input.replace(/[0-9]/g, (d) => map[d] ?? d);
}

function toBanglaDate(iso: string): string {
  return toBanglaNum(formatDateDdMmYyyy(iso));
}
