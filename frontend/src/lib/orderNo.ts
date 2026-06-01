export function nextOrderNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `ORD-${ymd}-`;
  const key = `gom_order_seq_${ymd}`;
  const raw = localStorage.getItem(key);
  const current = Number.parseInt(raw ?? "0", 10);
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  localStorage.setItem(key, String(next));
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
