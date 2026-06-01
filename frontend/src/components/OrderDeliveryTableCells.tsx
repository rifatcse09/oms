import type { Order } from "../types";
import { formatShortDeliveredAt, orderListDeliveryBadge } from "../lib/deliveryPunctuality";
import { formatDeliveryDateLabel, formatDeliveryTimeWindowLabel } from "../lib/deliverySchedule";

/** Scheduled delivery only (date + time window). */
export function OrderScheduledDeliveryCell({ order }: { order: Order }) {
  return (
    <div className="leading-tight text-sm text-slate-800">
      <div>{formatDeliveryDateLabel(order)}</div>
      <div className="text-xs text-slate-600">{formatDeliveryTimeWindowLabel(order)}</div>
    </div>
  );
}

/** Actual mark-delivered time and punctuality badge (separate list column). */
export function OrderDeliveredAtCell({ order }: { order: Order }) {
  const isClosed = order.status === "delivered" || order.status === "invoiced";
  const hasTs = Boolean(order.deliveredAt && !Number.isNaN(Date.parse(order.deliveredAt)));
  const badge = orderListDeliveryBadge(order);

  return (
    <div className="leading-tight text-sm text-slate-800">
      <div
        className={hasTs ? "text-slate-900" : "text-slate-400"}
        title={isClosed && !hasTs ? "Delivery time not recorded" : undefined}
      >
        {hasTs ? formatShortDeliveredAt(order.deliveredAt!) : "—"}
      </div>
      {badge ? (
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
        >
          {badge.text}
        </span>
      ) : null}
    </div>
  );
}
