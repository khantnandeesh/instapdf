/**
 * A least-recently-used cache bounded by the total size of its entries
 * (TIFF worker: parsed files kept for their thumbnails). The newest entry is
 * always kept, even when it alone is over the limit.
 */
export function createSizedCache<V>(limitBytes: number) {
  const entries = new Map<string, { size: number; value: V }>();
  let total = 0;
  const drop = (key: string) => {
    const e = entries.get(key);
    if (!e) return;
    total -= e.size;
    entries.delete(key);
  };
  return {
    get(key: string): V | undefined {
      const e = entries.get(key);
      if (!e) return undefined;
      entries.delete(key); // most recently used goes last
      entries.set(key, e);
      return e.value;
    },
    set(key: string, size: number, value: V): void {
      drop(key);
      entries.set(key, { size, value });
      total += size;
      while (entries.size > 1 && total > limitBytes) drop(entries.keys().next().value!);
    },
    delete: drop,
    get size() {
      return entries.size;
    },
    get bytes() {
      return total;
    },
    keys: () => [...entries.keys()],
  };
}
