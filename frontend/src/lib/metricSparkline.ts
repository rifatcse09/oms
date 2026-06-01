/** Deterministic “trend %” from a string seed (stable across re-renders). */
export function hashTrend(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997;
  return Math.round((((h % 45) - 15) + (h % 13) * 0.45) * 10) / 10;
}

/** Deterministic sparkline points for Recharts. */
export function sparkPoints(seed: string, points = 12): { i: number; v: number }[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997;
  const data: { i: number; v: number }[] = [];
  for (let j = 0; j < points; j++) {
    h = (h * 31 + j * 7) % 997;
    const wave = Math.sin(j * 0.55 + (h % 13)) * 16;
    const noise = (h % 23) - 11;
    const v = Math.max(12, Math.min(88, 48 + wave + noise * 0.45));
    data.push({ i: j, v });
  }
  return data;
}
