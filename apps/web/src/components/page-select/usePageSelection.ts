"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LoadedFile } from "../tool-flow/types";
import { planFiles, useLazyModule, useLiveState } from "./hooks";
import type * as Sel from "./selection";

const loadSelection = () => import("./selection");
const EMPTY: Sel.SelectionState = { sets: {}, text: "", differs: false, anchor: null, pick: "custom" };

/**
 * The page selection of Extract (picked) and Delete (marked) as a hook (spec F4/F5 UI P-4
 * `usePageSelection`): click, Shift+click, Ctrl/Cmd+click, Space, Shift+Space, Escape, the field.
 * The selection model (./selection, with the range parser) arrives after hydration; until then
 * nothing can be selected, because no file is ready yet.
 */
export function usePageSelection(onUserChange?: (state: Sel.SelectionState, files: Sel.SelFile[]) => void) {
  const sel = useLazyModule(loadSelection);
  const selRef = useRef(sel);
  selRef.current = sel;
  // Live state (eval G-3): the run reads the selection as typed, even before React shows it.
  const [files, setFiles, filesRef] = useLiveState<Sel.SelFile[]>([]);
  const [state, setState, live] = useLiveState<Sel.SelectionState>(EMPTY);

  const onFilesChange = useCallback((all: LoadedFile[]) => {
    const next = planFiles(all);
    setFiles((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [setFiles]);
  useEffect(() => {
    if (sel) setState((s) => sel.syncFiles(s, files));
  }, [files, sel, setState]);
  // The live message follows the user's own changes, not files arriving.
  const user = useRef(false);
  const onUserRef = useRef(onUserChange);
  onUserRef.current = onUserChange;
  useEffect(() => {
    if (!user.current) return;
    user.current = false;
    onUserRef.current?.(state, filesRef.current);
  }, [state, filesRef]);

  const actions = useMemo(() => {
    // A user's change: the live message follows it (blur and Start over say nothing).
    const change = (fn: (m: typeof Sel, s: Sel.SelectionState) => Sel.SelectionState) => {
      const m = selRef.current;
      if (!m) return;
      user.current = true;
      setState((s) => fn(m, s));
    };
    return {
      activate: (fileId: string, index: number, shift: boolean) =>
        change((m, s) => (shift ? m.extendTo(s, filesRef.current, fileId, index) : m.togglePage(s, filesRef.current, fileId, index))),
      type: (text: string) => change((m, s) => m.typeText(s, text, filesRef.current)),
      blur: () => setState((s) => selRef.current?.blurText(s, filesRef.current) ?? s),
      clear: () => change((m, s) => m.clearSelection(s)),
      selectAll: () => change((m, s) => m.selectAll(s, filesRef.current)),
      quickPick: (pick: "odd" | "even") => change((m, s) => m.quickPick(s, filesRef.current, pick)),
      /** Extract's Custom pick: the selection stays, the field is free to edit. */
      custom: () => setState((s) => (s.pick === "custom" ? s : { ...s, pick: "custom" })),
      reset: () => setState(EMPTY),
    };
  }, [filesRef, setState]);
  const error = sel ? sel.fieldError(state.text, files) : null;
  const errorText = sel && error ? sel.rangeErrorText(error, files.map((f) => f.pageCount)) : null;
  const count = sel ? sel.selectedCount(state, files) : 0;
  const total = files.reduce((n, f) => n + f.pageCount, 0);
  /** Files with nothing selected (Extract skips them) and with every page selected (Delete can't run). */
  const empty = files.filter((f) => !(state.sets[f.id]?.length ?? 0));
  const full = files.filter((f) => (state.sets[f.id]?.length ?? 0) >= f.pageCount);
  /**
   * The run and Enter: the selection and files as the last change left them (`live`), with the
   * checks the dock shows (`problem`: the field's error, nothing picked, every page of a file marked).
   */
  const current = useCallback(() => {
    const m = selRef.current;
    const st = live.current;
    const fs = filesRef.current;
    const err = m ? m.fieldError(st.text, fs) : null;
    return {
      state: st,
      files: fs,
      errorText: m && err ? m.rangeErrorText(err, fs.map((f) => f.pageCount)) : null,
      count: m ? m.selectedCount(st, fs) : 0,
      full: fs.filter((f) => (st.sets[f.id]?.length ?? 0) >= f.pageCount),
    };
  }, [filesRef, live]);
  return { files, state, error, errorText, count, total, empty, full, onFilesChange, current, ...actions };
}
