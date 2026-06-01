import { statementBalanceDue } from "./statementMoney";

/**
 * Statement rows: "previous due" must be unpaid balance from older cycles for the same
 * customer, not the sum of prior invoice amounts (which ignores partial payments).
 *
 * Process cycles in order: customer name, then cycle start (oldest first). After each row,
 * carry forward unpaid balance for that cycle (whole-taka rules; sub-1 taka not carried).
 */
export type CycleStatementBucketRow = {
  key: string;
  customer: string;
  start: Date;
  end: Date;
  invoiceTotal: number;
  invoiceCount: number;
  invoices: Array<{ orderNo: string; orderDate: string; amount: number }>;
};

export function applyPaymentAwareCarryover<T extends CycleStatementBucketRow>(
  cycleRows: T[],
  netPaidForKey: (key: string) => number,
): Array<T & { previousDue: number; totalDue: number }> {
  const sorted = [...cycleRows].sort((a, b) => {
    const byCustomer = a.customer.localeCompare(b.customer);
    if (byCustomer !== 0) return byCustomer;
    return a.start.getTime() - b.start.getTime();
  });
  const unpaidAfterCycle = new Map<string, number>();
  return sorted.map((row) => {
    const ck = row.customer.trim();
    const previousDue = unpaidAfterCycle.get(ck) ?? 0;
    const totalDue = previousDue + row.invoiceTotal;
    const paid = Math.max(0, netPaidForKey(row.key));
    const unpaid = statementBalanceDue(totalDue, paid);
    unpaidAfterCycle.set(ck, unpaid);
    return { ...row, previousDue, totalDue };
  });
}
