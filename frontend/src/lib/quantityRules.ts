import { parseDeliveryWindow } from "./deliveryWindow";

/** Weight (kg and/or g) OR pieces only — not both at once. */

export function parseQty(s: string): number {
  const n = parseFloat(String(s).replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function validateLineQuantity(kg: string, gram: string, piece: string): string | null {
  const k = parseQty(kg);
  const g = parseQty(gram);
  const p = parseQty(piece);
  const hasWeight = k > 0 || g > 0;
  const hasPiece = p > 0;
  if (!hasWeight && !hasPiece) {
    return "Enter kg and/or grams, or pieces only (কেজি/গ্রাম অথবা শুধু পিস).";
  }
  if (hasWeight && hasPiece) {
    return "Cannot mix weight and pieces (ওজন ও পিস একসাথে নয়).";
  }
  return null;
}

export function hoursUntilDelivery(deliveryIsoDate: string): number {
  const d = new Date(deliveryIsoDate + "T23:59:59");
  return (d.getTime() - Date.now()) / (1000 * 60 * 60);
}

function hoursUntilDateTime(dateTime: string): number {
  const d = new Date(dateTime);
  return (d.getTime() - Date.now()) / (1000 * 60 * 60);
}

export function canEditOrder(deliveryIsoDate: string, deliveryWindow?: string): boolean {
  const { startDate } = parseDeliveryWindow(deliveryWindow);
  if (startDate) {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? `${startDate}T23:59:59`
      : startDate;
    return hoursUntilDateTime(normalized) >= 24;
  }
  return hoursUntilDelivery(deliveryIsoDate) >= 24;
}
