"use client";
/**
 * The editor's state container: one plain object, replaced on every change, with selector
 * subscriptions (useSyncExternalStore) so a change re-renders only the parts that read it
 * (a page re-renders when its own objects change, not on every edit elsewhere).
 */
import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Guide } from "@/lib/editor/snap";
import type { History } from "@/lib/editor/history";
import type { PageText } from "@/lib/editor/berry-engine";
import type { EditorObject, MarkupKind, SigSource } from "@/lib/editor/model";

export type ToolId = "select" | "edit" | "text" | "sign" | "mark" | "draw" | "shapes" | "image" | "whiteout";

export type ToolDefaults = {
  text: { font: string; size: number | null; bold: boolean; italic: boolean; underline: boolean; color: string; align: "left" | "center" | "right" };
  mark: { type: MarkupKind; color: string };
  draw: { marker: boolean; color: string; markerColor: string; width: "S" | "M" | "L" };
  shapes: { shape: "rect" | "ellipse" | "line" | "arrow"; stroke: string; fill: string | null; width: number };
  whiteout: { fill: string | "page" };
  sign: { role: "signature" | "initials" };
};

/** What a placement click drops (image, signature, initials). */
export type Placement = {
  kind: "image" | "signature";
  role?: "signature" | "initials";
  sig?: SigSource;
  asset?: string;
  color?: string;
  /** Width / height. */
  aspect: number;
  /** Preview image URL for the ghost. */
  preview: string;
  label: string;
};

export type EditorState = {
  history: History;
  selection: string[];
  tool: ToolId;
  locked: boolean;
  defaults: ToolDefaults;
  /** CSS px per point = BASE_SCALE × zoom, or fit to width. */
  zoom: number;
  fit: "width" | "page" | null;
  current: number;
  /** Object being typed into. */
  editing: string | null;
  /** Live geometry while dragging (not in history until release). */
  draft: Record<string, EditorObject> | null;
  guides: { page: string; guides: Guide[] } | null;
  readout: string | null;
  hideAnnots: boolean;
  placement: Placement | null;
  save: "saved" | "saving" | "off" | "idle";
  /** History index last downloaded (unsaved-changes check). */
  downloadedAt: number;
  flash: { ids: string[]; key: number } | null;
  /** Engine reading of each source page (lines and words), when loaded for the shown version. */
  texts: Record<number, PageText>;
  /** Source pages whose text is from the shown version (older text stays visible, read-only). */
  fresh: Record<number, boolean>;
  /** Bumped per source page when its raster must be redrawn from the shown bytes. */
  rasterRev: Record<number, number>;
  /** Bumped when pdf.js opens another version of the bytes. */
  pdfRev: number;
  /** The engine could open the file: existing text is editable. */
  engineReady: boolean;
  /** Line being edited (Edit text). */
  lineEdit: { src: number; line: number; text: string } | null;
  busy: "edit" | "save" | null;
  panel: boolean;
  panelTab: "pages" | "objects" | "history";
  /** Layout width class: rail and side panel (≥1024) or dock (<1024). */
  wide: boolean;
  readOnly: boolean;
  /** Flash over the glyphs an existing-text edit changed. */
  lineFlash: { src: number; rects: { x0: number; y0: number; x1: number; y1: number }[]; key: number } | null;
};

export type Store = {
  get: () => EditorState;
  set: (patch: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void;
  subscribe: (fn: () => void) => () => void;
};

export function createStore(initial: EditorState): Store {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...p };
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/** Reads a slice of the store; re-renders only when the slice changes (by `equal`, default Object.is). */
export function useStore<T>(store: Store, select: (s: EditorState) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const last = useRef<{ v: T } | null>(null);
  const get = useCallback(() => {
    const v = select(store.get());
    if (last.current && equal(last.current.v, v)) return last.current.v;
    last.current = { v };
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, select]);
  return useSyncExternalStore(store.subscribe, get, get);
}

export const shallowArray = <T,>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x, i) => x === b[i]);
