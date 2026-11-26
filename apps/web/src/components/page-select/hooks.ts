"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FlowApi, LoadedFile } from "../tool-flow/types";
import type { SelFile } from "./selection";

/**
 * Remembered options (spec F4/F5 §3a): `localStorage["berrypdf:<slug>-options"]`. Read after
 * mount (the server render and the first client render use the defaults, so nothing jumps at
 * hydration), written on every change. Storage can be missing or throw (private windows): then
 * the defaults simply stay. Selections and marks are never remembered.
 */
export function useRemembered<T extends Record<string, unknown>>(
  slug: string,
  defaults: T,
  check: (stored: Record<string, unknown>) => Partial<T>,
  /** Called once after mount with the stored values (only when something was stored). */
  onLoad?: (stored: Partial<T>) => void,
) {
  const key = `berrypdf:${slug}-options`;
  const [value, setValue] = useState<T>(defaults);
  const checkRef = useRef(check);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const stored = raw ? (JSON.parse(raw) as unknown) : null;
      if (stored && typeof stored === "object") {
        const good = checkRef.current(stored as Record<string, unknown>);
        setValue((v) => ({ ...v, ...good }));
        onLoadRef.current?.(good);
      }
    } catch {
      // no storage: keep the defaults
    }
  }, [key]);
  const update = useCallback(
    (patch: Partial<T>) =>
      setValue((v) => {
        const next = { ...v, ...patch };
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // no storage
        }
        return next;
      }),
    [key],
  );
  return [value, update] as const;
}

/** Polite announcements debounced by 500ms (spec F4/F5 UI P-8 "Live region"). */
export function useDebouncedAnnounce(apiRef: { current: FlowApi | null }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(
    (message: string) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => apiRef.current?.announce(message), 500);
    },
    [apiRef],
  );
}

/** The ready files as the planners see them. */
export function planFiles(files: readonly LoadedFile[]): SelFile[] {
  return files.filter((f) => f.status === "ready" && !!f.pages).map((f) => ({ id: f.id, name: f.name, pageCount: f.pageCount }));
}

/**
 * A module loaded after hydration instead of in the first load (spec F4/F5 UI P-12): the range
 * parser and the planners are only used once a file is in, and a file takes far longer to read than
 * this small chunk takes to arrive. Null until it is here.
 */
export function useLazyModule<T>(load: () => Promise<T>): T | null {
  const [mod, setMod] = useState<T | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    let alive = true;
    loadRef.current().then(
      (m) => alive && setMod(() => m),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  return mod;
}
