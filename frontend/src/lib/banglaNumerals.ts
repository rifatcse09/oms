/** Map Western digits to Bengali (০–৯) for invoices and Bangla UI. */

const DIGIT_MAP: Record<string, string> = {
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

export function toBanglaDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => DIGIT_MAP[d] ?? d);
}

/** Formatted amount with grouping; digits converted to Bengali (commas stay ASCII). */
export function formatMoneyBn(
  n: number,
  options?: { minFractionDigits?: number; maxFractionDigits?: number },
): string {
  const min = options?.minFractionDigits ?? 2;
  const max = options?.maxFractionDigits ?? 2;
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
  return toBanglaDigits(formatted);
}

/** Western digits for admin/order tables (no Bengali digit map). Matches invoice-style decimals when min/max set. */
export function formatDecimalEn(
  n: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const min = options?.minimumFractionDigits ?? 0;
  const max = options?.maximumFractionDigits ?? 2;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}
