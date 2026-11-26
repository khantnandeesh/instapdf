"use client";
/**
 * The page workspace shared by Merge, Combine & reorder, Organize and Alternate & mix (spec F3 M-4,
 * F4/F5 P-4): one page list (lib/page-list.ts) behind the files and pages views, with intake, moves,
 * removal with the undo notice, the page picker, sorting and, where the tool asks for it, full
 * undo / redo (F4/F5 I-10). Each tool composes it with its own toolbar, options and run.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { loadCloud } from "@/components/cloud/tool-cloud";
import { onIntent } from "@/components/tool-flow/intent";
import type { FlowApi, FlowContext, LoadedFile, ProcessFn } from "@/components/tool-flow/types";
import {
  A4,
  insertPages,
  isBlank,
  moveSegment,
  pageLabel,
  removePages,
  segmentsOf,
  sourceLetter,
  sourcesInOrder,
  type MoveStep,
  type PageRef,
  type SourceInfo,
} from "@/lib/page-list";
import { flip } from "@/lib/motion/flow";
import type { MergeOptions } from "@/lib/pdf/merge-options";
import { runInWorker } from "@/lib/pdf/worker-client";
import type { FlowTool } from "@/tools/registry";
import { mergeCopy as c } from "./copy";
import type { FullHistory } from "./full-history";
import * as H from "./history";

// The workspace (both views, menus) and the dialogs are separate chunks: nothing of
// them is needed before the first file arrives, so they are prefetched on intent
// and never part of the route's first load (spec F3 M-10).
export const loadSegmentGrid = () => import("@/components/page-edit/SegmentGrid");
export const SegmentGrid = dynamic(() => loadSegmentGrid().then((m) => m.SegmentGrid), { ssr: false, loading: () => <div className="h-40" aria-hidden="true" /> });
// F23: cloud builds take the Add menus from the cloud chunk (through tool-cloud.tsx loadCloud, so the
// page's cloud controls use it too), whose MenuButton adds the providers to the Add menus
// (cloud/merge-menus.tsx) and passes every other menu through. They are drawn once files are in, which
// fetches it then: the idle prefetch below never fetches the cloud chunk. Builds without cloud sources
// fold this to the plain menu.
export const loadMenu = () => import("@/components/ui/Menu");
export const MenuButton = dynamic(
  () => (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? (loadCloud() as unknown as ReturnType<typeof loadMenu>) : loadMenu()).then((m) => m.MenuButton),
  { ssr: false, loading: () => <span className="inline-block h-9 w-11 shrink-0" aria-hidden="true" /> },
);
/** The plain menu (Organize's Select, Sort and Remove: no cloud entries in them). */
export const PlainMenuButton = dynamic(() => loadMenu().then((m) => m.MenuButton), {
  ssr: false,
  loading: () => <span className="inline-block h-9 w-11 shrink-0" aria-hidden="true" />,
});
/** The idle prefetch's part of the menus: none in cloud builds (the cloud chunk is fetched on intent only). */
const prefetchMenu = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? () => {} : loadMenu;
export const loadPageGrid = () => import("@/components/page-edit/EditablePageGrid");
export const EditablePageGrid = dynamic(loadPageGrid, { ssr: false, loading: () => <div className="h-40" aria-hidden="true" /> });

/** Lazily loaded: says which document properties a merge will not keep (non-blocking notice). */
const inspectPdf = () => import("@/lib/pdf/inspect").then((m) => m.inspector);

export type IntakeTag = { at?: number; picker?: boolean };
/** `loaded`: Organize's "From a loaded file": the file stays when the picker is cancelled. */
export type Picker = { fileId: string; at: number | null; letter: string; afterLabel: string | null; loaded?: boolean };
export type MoveDialog = { uids: string[]; subject: string; current: number; total: number };
export type Confirm = { uid: string; label: string; count: number };
type CommitOptions = { step: H.HistoryStep; undo?: string };

const isTextField = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable='true']");

/** BerryPDF EditorToolbar: blueberry editing tools. `shrink-0` so a narrow toolbar never squeezes them (F4/F5 P-3). */
export const toolbarButton = "mp-btn mp-btn--tool shrink-0 whitespace-nowrap max-sm:size-11 max-sm:px-0";

export type PageWorkspace = ReturnType<typeof usePageWorkspace>;

/**
 * `history`: full undo / redo (Organize, Combine & reorder), or none for F3's single undo behind the
 * notice (Merge, AC-79).
 */
export function usePageWorkspace({ tool, history: full }: { tool: FlowTool; history?: FullHistory }) {
  const historyOn = !!full;
  const api = useRef<FlowApi | null>(null);
  const uidSeq = useRef(0);
  const newUid = () => `p${++uidSeq.current}`;
  const letterSeq = useRef(0);

  const [pages, setPagesState] = useState<PageRef[]>([]);
  const pagesRef = useRef<PageRef[]>([]);
  const setPages = useCallback((next: PageRef[]) => {
    pagesRef.current = next;
    setPagesState(next);
  }, []);
  const [sources, setSourcesState] = useState<Record<string, SourceInfo>>({});
  const sourcesRef = useRef<Record<string, SourceInfo>>({});
  const setSources = useCallback((fn: (prev: Record<string, SourceInfo>) => Record<string, SourceInfo>) => {
    sourcesRef.current = fn(sourcesRef.current);
    setSourcesState(sourcesRef.current);
  }, []);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const filesRef = useRef<LoadedFile[]>([]);
  const filesById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const anchor = useRef<string | null>(null);
  // The list of whichever grid is shown (files or pages): what Sort and Undo FLIP.
  const gridList = useRef<HTMLDivElement>(null);

  const [hist, setHistState] = useState<H.History>(H.emptyHistory);
  const histRef = useRef<H.History>(H.emptyHistory);
  const setHist = useCallback((h: H.History) => {
    histRef.current = h;
    setHistState(h);
  }, []);
  /** The undo notice on screen (F3 AC-79), if any. */
  const noticeRef = useRef<string | null>(null);
  /** Pages a placeholder became once its file was read: restored lists reuse them (same uids). */
  const expanded = useRef(new Map<string, PageRef[]>());

  const [picker, setPickerState] = useState<Picker | null>(null);
  const pickerRef = useRef<Picker | null>(null);
  const setPicker = (p: Picker | null) => {
    pickerRef.current = p;
    setPickerState(p);
  };
  const [moveDialog, setMoveDialog] = useState<MoveDialog | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [dialogsUsed, setDialogsUsed] = useState({ picker: false, move: false, confirm: false });
  const [inserted, setInserted] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<{ uid: string; tick: number; onMount: boolean } | null>(null);
  /** `switchesView`: the action also opens the pages view, so the grid that mounts takes the request. */
  const focusOn = (uid: string | undefined, switchesView = false) => uid && setFocus((f) => ({ uid, tick: (f?.tick ?? 0) + 1, onMount: switchesView }));


  const announce = (m: string) => api.current?.announce(m);
  // Used by the editing parts (page-editing.tsx), which hold no state of their own.
  const filesHereInput = useRef<HTMLInputElement>(null);
  const pagesInput = useRef<HTMLInputElement>(null);
  const pendingAt = useRef<number | null>(null);
  const focusAfterPicker = useRef<string | null>(null);

  // ---- names ----
  const describeRef = (p: PageRef) => (isBlank(p) ? c.blankName : (sourcesRef.current[p.sourceId!]?.name ?? ""));
  const labelOf = (p: PageRef) => pageLabel(p, sourcesRef.current);

  // ---- history and the undo notice ----
  const dismissUndoNotice = useCallback(() => {
    const id = noticeRef.current;
    if (!id) return;
    noticeRef.current = null;
    api.current?.dismissNotice(id);
  }, []);
  /** Merge (no history): the single undo lasts until the next edit or intake (F3 AC-79). */
  const endSingleUndo = useCallback(() => {
    dismissUndoNotice();
    if (!historyOn && histRef.current.past.length) setHist(H.emptyHistory);
  }, [dismissUndoNotice, historyOn, setHist]);

  /** A restored list, with placeholders of files read since then replaced by their pages. */
  const materialize = (list: readonly PageRef[]) =>
    H.materialize(list, (p) => {
      const done = expanded.current.get(p.uid);
      if (done) return done;
      const f = filesRef.current.find((x) => x.id === p.sourceId);
      if (!f) return [];
      if (f.status === "ready" && f.pages) {
        const real = f.pages.map((size, i) => ({ uid: newUid(), sourceId: f.id, sourceIndex: i, rotation: 0, size }));
        expanded.current.set(p.uid, real);
        return real;
      }
      return f.status === "loading" || f.status === "locked" ? null : [];
    });

  const pruneSelection = (next: readonly PageRef[]) => {
    const alive = new Set(next.map((p) => p.uid));
    setSelection((s) => (Array.from(s).every((u) => alive.has(u)) ? s : new Set(Array.from(s).filter((u) => alive.has(u)))));
  };

  const restore = (list: PageRef[], before: readonly PageRef[], verb: (step: string) => string, step: H.HistoryStep, legacy: boolean) => {
    // The grid moves back (T9 FLIP; removed tiles fade, restored ones glow in).
    flip(gridList.current, () => flushSync(() => setPages(list)), "reorder");
    pruneSelection(list);
    const had = new Set(before.map((p) => p.uid));
    const back = list.filter((p) => !had.has(p.uid));
    if (back.length) {
      const first = back[0];
      const pos = segmentsOf(list).findIndex((s) => s.pages.some((p) => p.uid === first.uid)) + 1;
      const restored = c.restored(describeRef(first), pos);
      announce(legacy ? restored : `${verb(step)}. ${restored}`);
      setInserted(new Set(back.map((p) => p.uid)));
      focusOn(first.uid);
    } else announce(legacy ? c.undone : verb(step));
  };

  const doUndoRef = useRef<() => void>(() => {});
  doUndoRef.current = () => {
    const r = H.undo(histRef.current, pagesRef.current);
    if (!r) return;
    dismissUndoNotice();
    const before = pagesRef.current;
    setHist(historyOn ? r.history : H.emptyHistory);
    restore(materialize(r.pages), before, full ? full.undoneStep : String, r.step, !full);
  };
  const doRedoRef = useRef<() => void>(() => {});
  doRedoRef.current = () => {
    if (!full) return;
    const r = full.redo(histRef.current, pagesRef.current);
    if (!r) return;
    dismissUndoNotice();
    const before = pagesRef.current;
    setHist(r.history);
    restore(materialize(r.pages), before, full.redoneStep, r.step, false);
  };

  /** Applies an edit. Edits that offer undo show the notice; every other edit ends it (single level, F3 AC-79). */
  const commit = (next: PageRef[], o: CommitOptions): boolean => {
    const prev = pagesRef.current;
    // Edits that add pages (blank, duplicate) respect the same total-page cap as intake (spec §2, §5).
    if (next.length > prev.length && next.length > tool.flow.maxTotalPages) {
      api.current?.pushNotice({ tone: "warning", title: c.overPages(tool.flow.maxTotalPages) });
      return false;
    }
    dismissUndoNotice();
    if (historyOn) setHist(H.record(histRef.current, prev, o.step));
    else setHist(o.undo ? H.record(H.emptyHistory, prev, o.step) : H.emptyHistory);
    if (o.undo) {
      const noticeId =
        api.current?.pushNotice({
          tone: "info",
          title: o.undo,
          action: { label: c.undo, onClick: () => doUndoRef.current() },
          timeoutMs: 10_000,
          onExpire: () => {
            if (noticeRef.current !== noticeId) return;
            noticeRef.current = null;
            if (!historyOn) setHist(H.emptyHistory);
          },
        }) ?? null;
      noticeRef.current = noticeId;
    }
    setPages(next);
    pruneSelection(next);
    return true;
  };

  // Ctrl/Cmd+Z (with history, or while the undo notice is shown); Ctrl/Cmd+Shift+Z and Ctrl+Y redo.
  // Ignored in text fields and dialogs (AC-549), and once the result is shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return;
      if (e.target instanceof Element && e.target.closest("[role=dialog]")) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = historyOn && ((key === "z" && e.shiftKey) || (key === "y" && e.ctrlKey && !e.shiftKey));
      if (!isUndo && !isRedo) return;
      const state = document.querySelector("[data-testid=tool-flow]")?.getAttribute("data-state");
      if (state === "processing" || state === "done") return;
      const h = histRef.current;
      if (isUndo ? !h.past.length : !h.future.length) return;
      e.preventDefault();
      if (isUndo) doUndoRef.current();
      else doRedoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOn]);
  useEffect(() => full?.prefetch(), [full]);

  // Glow on inserted or restored tiles fades out.
  useEffect(() => {
    if (!inserted.size) return;
    const t = setTimeout(() => setInserted(new Set()), 1300);
    return () => clearTimeout(t);
  }, [inserted]);

  // ---- files <-> page list ----
  /** Files the list, an undo or redo step, or the open picker still needs. */
  const neededFiles = useCallback(() => {
    const used = H.referencedSources(histRef.current);
    for (const p of pagesRef.current) if (p.sourceId) used.add(p.sourceId);
    if (pickerRef.current) used.add(pickerRef.current.fileId);
    return used;
  }, []);
  /** Files held only for undo / redo: not in the task, so they count toward no cap. */
  const heldFiles = useCallback(() => {
    const inList = new Set<string>();
    for (const p of pagesRef.current) if (p.sourceId) inList.add(p.sourceId);
    if (pickerRef.current) inList.add(pickerRef.current.fileId);
    const held = new Set<string>();
    for (const id of H.referencedSources(histRef.current)) if (!inList.has(id)) held.add(id);
    return held;
  }, []);
  /** Files held by the flow that nothing needs any more. */
  const collectOrphans = useCallback(() => {
    const flow = api.current;
    if (!flow) return;
    const used = neededFiles();
    const orphans = filesRef.current.filter((f) => !used.has(f.id)).map((f) => f.id);
    if (orphans.length) flow.removeFiles(orphans);
  }, [neededFiles]);

  const onFilesChange = useCallback(
    (list: LoadedFile[]) => {
      filesRef.current = list;
      setFiles(list);
      const byId = new Map(list.map((f) => [f.id, f]));
      let changed = false;
      const next = pagesRef.current.flatMap((p): PageRef[] => {
        if (!p.sourceId) return [p];
        const f = byId.get(p.sourceId);
        if (!f) {
          changed = true;
          return [];
        }
        if (p.pending && f.status === "ready" && f.pages) {
          changed = true;
          const real = expanded.current.get(p.uid) ?? f.pages.map((size, i) => ({ uid: `p${++uidSeq.current}`, sourceId: f.id, sourceIndex: i, rotation: 0, size }));
          expanded.current.set(p.uid, real);
          return real;
        }
        return [p];
      });
      if (changed) setPages(next);
      setSources((prev) => {
        let out = prev;
        for (const f of list) {
          const s = prev[f.id];
          if (s && f.status === "ready" && s.pageCount !== f.pageCount) out = { ...out, [f.id]: { ...s, pageCount: f.pageCount } };
        }
        return out;
      });
      const pk = pickerRef.current;
      if (pk && !byId.has(pk.fileId)) setPicker(null); // the picked file failed or was skipped
    },
    [setPages, setSources],
  );

  useEffect(() => {
    collectOrphans();
  }, [hist, pages, picker, collectOrphans]);

  const beforeIntake = (incoming: File[]) => {
    endSingleUndo();
    if (full) {
      // Files kept for undo stay loaded beside a new pick while memory allows (the size cap counts them
      // here, never in the task): past it, the steps that need them are forgotten and they are released.
      const held = heldFiles();
      if (held.size) {
        const bytes = filesRef.current.reduce((s, f) => s + f.size, 0) + incoming.reduce((s, f) => s + f.size, 0);
        if (bytes > tool.flow.maxTotalBytes) setHist(full.dropSources(histRef.current, held));
      }
    }
    collectOrphans();
  };

  const onFilesAdded = (entries: LoadedFile[], rawTag: unknown) => {
    const tag = (rawTag ?? {}) as IntakeTag;
    const info = (e: LoadedFile): SourceInfo => ({
      id: e.id,
      letter: sourceLetter(letterSeq.current++),
      name: e.name,
      size: e.size,
      lastModified: e.lastModified ?? 0,
      kind: e.kind === "image" ? "image" : "pdf",
      pageCount: 0,
    });
    if (tag.picker) {
      const e = entries[0];
      const s = info(e);
      setSources((prev) => ({ ...prev, [e.id]: s }));
      const at = tag.at ?? null;
      const before = at === null ? undefined : pagesRef.current[at - 1];
      setPicker({ fileId: e.id, at, letter: s.letter, afterLabel: before ? labelOf(before) : null });
      setDialogsUsed((d) => ({ ...d, picker: true }));
      return;
    }
    // Same name, size and date as a file already in the list (AC-80): added, but say so.
    const present = new Set(pagesRef.current.map((p) => p.sourceId));
    const loaded = Object.values(sourcesRef.current).filter((s) => present.has(s.id));
    const dups = entries.filter((e) => loaded.some((s) => s.name === e.name && s.size === e.size && s.lastModified === (e.lastModified ?? 0)));
    const infos = entries.map(info);
    setSources((prev) => ({ ...prev, ...Object.fromEntries(infos.map((s) => [s.id, s])) }));
    const placeholders: PageRef[] = entries.map((e) => ({ uid: newUid(), sourceId: e.id, sourceIndex: -1, rotation: 0, size: A4, pending: true }));
    const at = tag.at ?? pagesRef.current.length;
    commit(insertPages(pagesRef.current, at, placeholders), { step: "add files" });
    if (tag.at !== undefined) setInserted(new Set(placeholders.map((p) => p.uid)));
    if (dups.length) {
      const ids = dups.map((d) => d.id);
      const noticeId = api.current?.pushNotice({
        tone: "info",
        title: c.duplicateTitle(dups.map((d) => d.name)),
        body: c.duplicateBody,
        action: {
          label: c.duplicateAction(dups.length),
          onClick: () => {
            if (noticeId) api.current?.dismissNotice(noticeId);
            const uids = new Set(pagesRef.current.filter((p) => p.sourceId && ids.includes(p.sourceId)).map((p) => p.uid));
            if (uids.size) {
              commit(removePages(pagesRef.current, uids), { step: "remove", undo: dups.length === 1 ? c.removed(dups[0].name) : c.removedPages(uids.size) });
              announce(c.removedAnnounce(dups.length === 1 ? dups[0].name : c.removedPages(uids.size)));
            }
          },
        },
      });
    }
  };

  const onReset = () => {
    setPages([]);
    setSources(() => ({}));
    letterSeq.current = 0;
    setSelection(new Set());
    dismissUndoNotice();
    setHist(H.emptyHistory);
    expanded.current.clear();
    setPicker(null);
    setMoveDialog(null);
    setConfirm(null);
  };

  // ---- derived views ----
  const segments = useMemo(() => segmentsOf(pages), [pages]);
  const readyPages = pages.filter((p) => !p.pending);
  const sourceCount = new Set(readyPages.flatMap((p) => (p.sourceId ? [p.sourceId] : []))).size;
  const viewModel = { pages, sources, files: filesById };

  // ---- selection ----
  const selectionDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceSelection = (n: number) => {
    if (selectionDebounce.current) clearTimeout(selectionDebounce.current);
    selectionDebounce.current = setTimeout(() => announce(n ? c.selected(n) : c.selectionCleared), 300);
  };
  /** Replaces the selection (Organize's Select ▾, Ctrl/Cmd+A). */
  const setSelectionTo = (uids: Iterable<string>) => {
    const next = new Set(uids);
    setSelection(next);
    announceSelection(next.size);
  };
  const clearSelection = () => setSelectionTo([]);
  const selectAll = () => setSelectionTo(pagesRef.current.filter((p) => !p.pending).map((p) => p.uid));

  // ---- moves ----
  const moveCard = (key: string, target: (i: number, n: number) => number) => {
    const segs = segmentsOf(pagesRef.current);
    const i = segs.findIndex((s) => s.key === key);
    if (i < 0) return;
    const sid = segs[i].sourceId;
    const name = sid ? (sourcesRef.current[sid]?.name ?? "") : c.blankName;
    const to = Math.max(0, Math.min(segs.length - 1, target(i, segs.length)));
    if (to === i) {
      announce(i === 0 ? c.alreadyFirst(name) : c.alreadyLast(name));
      return;
    }
    const firstUid = segs[i].pages[0].uid;
    const next = moveSegment(pagesRef.current, i, to);
    commit(next, { step: "move" });
    const after = segmentsOf(next);
    const pos = after.findIndex((s) => s.pages.some((p) => p.uid === firstUid));
    announce(c.moved(name, pos + 1, after.length) + (after.length < segs.length ? c.joined : ""));
    focusOn(firstUid);
  };
  const stepTarget = (step: MoveStep) => (i: number, n: number) => (step === "earlier" ? i - 1 : step === "later" ? i + 1 : step === "first" ? 0 : n - 1);

  // ---- removing ----
  const removeUids = (uids: string[], what: string) => {
    const list = pagesRef.current;
    const set = new Set(uids);
    const firstIdx = list.findIndex((p) => set.has(p.uid));
    const next = removePages(list, set);
    commit(next, { step: "remove", undo: uids.length === 1 || what !== "" ? c.removed(what || describeRef(list[firstIdx])) : c.removedPages(uids.length) });
    announce(c.removedAnnounce(what || c.removedPages(uids.length)));
    const neighbour = next[Math.min(firstIdx, next.length - 1)];
    if (neighbour) focusOn(neighbour.uid);
    else setTimeout(() => api.current?.fallbackFocus()?.focus(), 0);
  };
  const removeCard = (key: string) => {
    const seg = segmentsOf(pagesRef.current).find((s) => s.key === key);
    if (!seg) return;
    if (seg.pages.some((p) => p.pending)) {
      // Still loading or locked: drop the file itself (nothing to undo yet).
      const ids = new Set(seg.pages.map((p) => p.uid));
      setPages(removePages(pagesRef.current, ids));
      if (seg.sourceId) api.current?.removeFiles([seg.sourceId]);
      return;
    }
    const name = seg.sourceId ? (sourcesRef.current[seg.sourceId]?.name ?? "") : c.blankName;
    removeUids(
      seg.pages.map((p) => p.uid),
      name,
    );
  };
  // ---- page actions ----
  const enlarge = (uid: string, list: readonly PageRef[] = pagesRef.current) => {
    const shown = list.filter((p) => !isBlank(p) && !p.pending);
    api.current?.openPreview(
      shown.map((p) => ({ fileId: p.sourceId!, index: p.sourceIndex, rotation: p.rotation })),
      Math.max(0, shown.findIndex((p) => p.uid === uid)),
    );
  };
  /** A reorder of the whole list (Sort ▾): the visible grid FLIPs into the new order (T9; a crossfade above 40 items). */
  const reorder = (next: PageRef[], step: "sort" | "reverse", notice: string) => {
    flip(gridList.current, () => flushSync(() => commit(next, { step, undo: notice })), "reorder");
    announce(notice);
  };

  // ---- run ----
  /** Writes `list` (the page list, or Alternate's interleaved order) as one PDF in the worker. */
  const runList =
    (list: () => readonly Pick<PageRef, "sourceId" | "sourceIndex" | "rotation" | "size">[], options: () => MergeOptions, name: (first: string | undefined) => string): ProcessFn =>
    async (ready, signal, onProgress) => {
      const pagesOut = list();
      const ids = sourcesInOrder(pagesOut as PageRef[]);
      const srcs = ids.map((id) => {
        const f = ready.find((r) => r.id === id);
        if (!f) throw new Error("A file is not ready");
        return { id, name: f.name, kind: f.kind === "image" ? ("image" as const) : ("pdf" as const), source: f.source, password: f.password };
      });
      const out = await runInWorker(
        {
          kind: "merge",
          name: name(sourcesRef.current[ids[0]]?.name),
          sources: srcs,
          pages: pagesOut.map((p) => ({ sourceId: p.sourceId, sourceIndex: p.sourceIndex, rotation: p.rotation, size: p.sourceId ? undefined : p.size })),
          options: options(),
        },
        { signal, onProgress },
      );
      return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
    };

  // Prefetch the workspace chunks at the first sign of intent (a pointer, key, focus or drag: the
  // file chooser then hides the load) or after 4 s, so the first pick never waits for them and the
  // first load stays within the phone JS budget (SEO checklist).
  useEffect(() => onIntent(() => void Promise.all([loadSegmentGrid(), prefetchMenu()]).catch(() => {})), []);

  // Load the pages view chunk on idle once there is something to show.
  useEffect(() => {
    if (!pages.length) return;
    const t = setTimeout(() => void loadPageGrid(), 1500);
    return () => clearTimeout(t);
  }, [pages.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Organize: the page picker on a file already loaded, its used pages marked (spec §3e, AC-498). */
  const openLoadedPicker = (fileId: string) => {
    const s = sourcesRef.current[fileId];
    if (!s) return;
    setPicker({ fileId, at: null, letter: s.letter, afterLabel: null, loaded: true });
    setDialogsUsed((d) => ({ ...d, picker: true }));
  };

  /** Undo│Redo in the bottom bar (spec F4/F5 P-3, P-8): labels from 1024 px, 44 px icons below. */
  const renderHistory = (ctx: FlowContext): ReactNode => {
    if (!full) return null;
    const busy = ctx.state === "processing";
    if (ctx.state === "empty" && !hist.past.length && !hist.future.length) return null;
    return <full.Buttons canUndo={!busy && hist.past.length > 0} canRedo={!busy && hist.future.length > 0} onUndo={() => doUndoRef.current()} onRedo={() => doRedoRef.current()} />;
  };

  /** ToolFlow props every page tool shares. */
  const flowProps = {
    apiRef: api,
    onReset,
    onFilesAdded,
    onFilesChange,
    beforeIntake,
    heldFiles,
    workspaceEmpty: pages.length === 0 && !picker,
    viewToggleFromOneFile: true,
    inspectPdf,
    canRun: () => (pages.some((p) => p.pending) || picker ? c.statusPending : pages.length ? (true as const) : c.statusEmpty),
    phoneAddMenu: () => document.querySelector<HTMLElement>("[data-testid=add-menu]"),
  };

  return {
    api,
    pages,
    pagesRef,
    sources,
    sourcesRef,
    files,
    filesById,
    segments,
    readyPages,
    sourceCount,
    viewModel,
    selection,
    selectionRef,
    setSelectionTo,
    selectAll,
    clearSelection,
    focus,
    gridList,
    announce,
    commit,
    reorder,
    removeUids,
    removeCard,
    moveCard,
    stepTarget,
    enlarge,
    openLoadedPicker,
    /** Whether a dialog has been opened (editing.tsx then draws `EditorDialogs`). */
    dialogsUsed: dialogsUsed.picker || dialogsUsed.move || dialogsUsed.confirm,
    runList,
    renderHistory,
    flowProps,
    /** For `usePageEditing` (page-editing.tsx) only. */
    internals: {
      tool,
      newUid,
      letterSeq,
      setSources,
      filesRef,
      setSelection,
      anchor,
      picker,
      pickerRef,
      setPicker,
      moveDialog,
      setMoveDialog,
      confirm,
      setConfirm,
      dialogsUsed,
      setDialogsUsed,
      inserted,
      setInserted,
      focusOn,
      announceSelection,
      labelOf,
      describeRef,
      filesHereInput,
      pagesInput,
      pendingAt,
      focusAfterPicker,
    },
  };
}

/** The Sort ▾ glyph (two arrows). */
export function SortGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
    </svg>
  );
}
