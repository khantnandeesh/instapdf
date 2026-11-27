"use client";
import { useCallback, useRef, useState } from "react";

/**
 * State whose latest value the run reads at once (eval G-3). The setter works out the next value
 * itself, from the last one it set, and keeps it in `live` before React renders it. So a run started
 * in the same moment as a change (a paste and Enter, a fill and a click) uses the change even when
 * React has not committed it yet: React may hold a commit (a stylesheet still loading, a slow device),
 * and the primary's click then reaches a handler from the render before. Every change must go
 * through this setter, so `live` is never behind the state.
 */
export function useLiveState<T>(initial: T | (() => T)) {
  const [state, setState] = useState(initial);
  const live = useRef(state);
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const value = typeof next === "function" ? (next as (prev: T) => T)(live.current) : next;
    live.current = value;
    setState(value);
  }, []);
  return [state, set, live as { readonly current: T }] as const;
}
