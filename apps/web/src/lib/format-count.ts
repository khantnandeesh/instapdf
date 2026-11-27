/**
 * "1,234": English digit grouping for whole numbers, without starting the browser's ICU number
 * formatting (its first call, often during the first render, cost ~15ms of main thread on a slow phone:
 * eval G-12). Anything else goes to toLocaleString("en").
 */
export function formatCount(v: number): string {
  if (!Number.isSafeInteger(v)) return v.toLocaleString("en");
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return v < 0 ? `-${s}` : s;
}
