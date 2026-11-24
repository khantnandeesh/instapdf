"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InsertKind, PageAction } from "@/components/page-edit/EditablePageGrid";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, LoadedFile, ProcessFn, WorkspaceContext } from "@/components/tool-flow/types";
import { cx } from "@/components/ui/cx";
import { ChevronDownIcon, PlusIcon } from "@/components/ui/icons";
import type { MenuEntry } from "@/components/ui/Menu";
import {
  A4,
  blankSizeAt,
  duplicatePages,
  gapToIndex,
  insertPages,
  isBlank,
  moveBlock,
  moveSegment,
  pageLabel,
  removePages,
  reverseSegments,
  rotatePages,
  segmentsOf,
  sortByName,
  sortPages,
  sourceLetter,
  sourcesInOrder,
  stepIndex,
  type MoveStep,
  type PageRef,
  type SortKey,
  type SourceInfo,
} from "@/lib/page-list";
import { changedCount, defaultMergeOptions, MERGE_OPTIONS_KEY, parseMergeOptions, type MergeOptions as Options } from "@/lib/pdf/merge-options";
import { mergedName } from "@/lib/pdf/naming";
import { acceptAttribute } from "@/lib/pdf/validation";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { mergeCopy as c } from "./copy";
import { MergeOptions } from "./MergeOptions";

const tool = flowTool("merge-pdf");

// The workspace (both views, menus) and the dialogs are separate chunks: nothing of
// them is needed before the first file arrives, so they are prefetched on idle
// and never part of the route's first load (spec F3 M-10).
const loadSegmentGrid = () => import("@/components/page-edit/SegmentGrid");
const SegmentGrid = dynamic(() => loadSegmentGrid().then((m) => m.SegmentGrid), { ssr: false, loading: () => <div className="h-40" aria-hidden="true" /> });
const ShortcutsHelp = dynamic(() => loadSegmentGrid().then((m) => m.ShortcutsHelp), { ssr: false });
const loadMenu = () => import("@/components/ui/Menu");
const MenuButton = dynamic(() => loadMenu().then((m) => m.MenuButton), { ssr: false, loading: () => <span className="inline-block h-9 w-11" aria-hidden="true" /> });
const loadPageGrid = () => import("@/components/page-edit/EditablePageGrid");
const EditablePageGrid = dynamic(loadPageGrid, { ssr: false, loading: () => <div className="h-40" aria-hidden="true" /> });
const loadDialogs = () => import("@/components/page-edit/dialogs");
const PagePickerDialog = dynamic(() => loadDialogs().then((m) => m.PagePickerDialog), { ssr: false });
const MoveToPositionDialog = dynamic(() => loadDialogs().then((m) => m.MoveToPositionDialog), { ssr: false });
const RemoveSelectedDialog = dynamic(() => loadDialogs().then((m) => m.RemoveSelectedDialog), { ssr: false });

/** Lazily loaded: says which document properties a merge will not keep (non-blocking notice). */
const inspectPdf = () => import("@/lib/pdf/inspect").then((m) => m.inspector);

type IntakeTag = { at?: number; picker?: boolean };
type Undo = { snapshot: PageRef[]; noticeId: string };
type Picker = { fileId: string; at: number | null; letter: string; afterLabel: string | null };
type MoveDialog = { uids: string[]; subject: string; current: number; total: number };
type Confirm = { uid: string; label: string; count: number };

const isTextField = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable='true']");

export function MergeTool() {
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
  const filesById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [undo, setUndoState] = useState<Undo | null>(null);
  const undoRef = useRef<Undo | null>(null);
  const setUndo = (u: Undo | null) => {
    undoRef.current = u;
    setUndoState(u);
  };
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
  const [options, setOptions] = useState<Options>(defaultMergeOptions);

  const filesHereInput = useRef<HTMLInputElement>(null);
  const pagesInput = useRef<HTMLInputElement>(null);
  const pendingAt = useRef<number | null>(null);

  const announce = (m: string) => api.current?.announce(m);

  // ---- options, remembered on this device (AC-42) ----
  useEffect(() => {
    try {
      setOptions(parseMergeOptions(localStorage.getItem(MERGE_OPTIONS_KEY)));
    } catch {}
  }, []);
  const changeOptions = (next: Options) => {
    setOptions(next);
    try {
      localStorage.setItem(MERGE_OPTIONS_KEY, JSON.stringify(next));
    } catch {}
  };

  // ---- undo (single level; spec AC-79, M-11 #3: removals, sort and reverse) ----
  const clearUndo = useCallback(() => {
    const u = undoRef.current;
    if (!u) return;
    setUndo(null);
    api.current?.dismissNotice(u.noticeId);
  }, []);

  const doUndoRef = useRef<() => void>(() => {});
  doUndoRef.current = () => {
    const u = undoRef.current;
    if (!u) return;
    const current = new Set(pagesRef.current.map((p) => p.uid));
    const restored = u.snapshot.filter((p) => !current.has(p.uid));
    setUndo(null);
    api.current?.dismissNotice(u.noticeId);
    setPages(u.snapshot);
    if (restored.length) {
      const first = restored[0];
      const pos = segmentsOf(u.snapshot).findIndex((s) => s.pages.some((p) => p.uid === first.uid)) + 1;
      announce(c.restored(describeRef(first), pos));
      setInserted(new Set(restored.map((p) => p.uid)));
      focusOn(first.uid);
    } else {
      announce(c.undone);
    }
  };

  /** Applies an edit. Edits that offer undo replace the notice; any other edit ends undo. */
  const commit = (next: PageRef[], o: { undo?: string } = {}): boolean => {
    const prev = pagesRef.current;
    // Edits that add pages (blank, duplicate) respect the same total-page cap as intake (spec §2, §5).
    if (next.length > prev.length && next.length > tool.flow.maxTotalPages) {
      api.current?.pushNotice({ tone: "warning", title: c.overPages(tool.flow.maxTotalPages) });
      return false;
    }
    if (o.undo) {
      const old = undoRef.current;
      if (old) api.current?.dismissNotice(old.noticeId);
      const noticeId =
        api.current?.pushNotice({
          tone: "info",
          title: o.undo,
          action: { label: c.undo, onClick: () => doUndoRef.current() },
          timeoutMs: 10_000,
          onExpire: () => {
            if (undoRef.current?.noticeId === noticeId) setUndo(null);
          },
        }) ?? "";
      setUndo({ snapshot: prev, noticeId });
    } else clearUndo();
    setPages(next);
    const alive = new Set(next.map((p) => p.uid));
    setSelection((s) => (Array.from(s).every((u) => alive.has(u)) ? s : new Set(Array.from(s).filter((u) => alive.has(u)))));
    return true;
  };

  // Ctrl/Cmd+Z while the undo notice is shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!undoRef.current || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z" || isTextField(e.target)) return;
      e.preventDefault();
      doUndoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Glow on inserted or restored tiles fades out.
  useEffect(() => {
    if (!inserted.size) return;
    const t = setTimeout(() => setInserted(new Set()), 1300);
    return () => clearTimeout(t);
  }, [inserted]);

  // ---- names ----
  const describeRef = (p: PageRef) => (isBlank(p) ? c.blankName : (sourcesRef.current[p.sourceId!]?.name ?? ""));
  const labelOf = (p: PageRef) => pageLabel(p, sourcesRef.current);

  // ---- files <-> page list ----
  /** Files held by the flow that no page (and no undo, no open picker) needs any more. */
  const collectOrphans = useCallback(() => {
    const flow = api.current;
    if (!flow) return;
    const used = new Set<string>();
    for (const p of pagesRef.current) if (p.sourceId) used.add(p.sourceId);
    for (const p of undoRef.current?.snapshot ?? []) if (p.sourceId) used.add(p.sourceId);
    if (pickerRef.current) used.add(pickerRef.current.fileId);
    const orphans = filesRef.current.filter((f) => !used.has(f.id)).map((f) => f.id);
    if (orphans.length) flow.removeFiles(orphans);
  }, []);
  const filesRef = useRef<LoadedFile[]>([]);

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
          return f.pages.map((size, i) => ({ uid: `p${++uidSeq.current}`, sourceId: f.id, sourceIndex: i, rotation: 0, size }));
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
    if (!undo) collectOrphans();
  }, [undo, pages, picker, collectOrphans]);

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
    commit(insertPages(pagesRef.current, at, placeholders));
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
              commit(removePages(pagesRef.current, uids), { undo: dups.length === 1 ? c.removed(dups[0].name) : c.removedPages(uids.size) });
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
    setUndo(null);
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
  const select = (uid: string, how: { toggle: boolean; range: boolean }) => {
    const list = pagesRef.current;
    let next: Set<string>;
    if (how.range && anchor.current) {
      const a = list.findIndex((p) => p.uid === anchor.current);
      const b = list.findIndex((p) => p.uid === uid);
      const lo = Math.min(a < 0 ? b : a, b);
      const hi = Math.max(a < 0 ? b : a, b);
      next = new Set(how.toggle ? selection : []);
      for (let i = lo; i <= hi; i++) next.add(list[i].uid);
    } else if (how.toggle) {
      next = new Set(selection);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      anchor.current = uid;
    } else {
      next = new Set([uid]);
      anchor.current = uid;
    }
    setSelection(next);
    announceSelection(next.size);
  };
  const clearSelection = () => {
    setSelection(new Set());
    announceSelection(0);
  };
  /** Pages an action on `uid` applies to: the selection if `uid` is in it (spec §3c). */
  const scopeOf = (uid: string) => (selection.has(uid) ? pagesRef.current.filter((p) => selection.has(p.uid)).map((p) => p.uid) : [uid]);

  // ---- moves ----
  const announceMove = (uids: string[], next: PageRef[]) => {
    const first = next.findIndex((p) => p.uid === uids[0]);
    if (uids.length === 1) announce(c.moved(labelOf(next[first]), first + 1, next.length));
    else announce(c.movedMany(uids.length, first + 1, first + uids.length, next.length));
  };
  const movePages = (uid: string, step: MoveStep) => {
    const uids = scopeOf(uid);
    const set = new Set(uids);
    const list = pagesRef.current;
    const to = stepIndex(list, set, step);
    const next = moveBlock(list, set, to);
    const label = uids.length === 1 ? labelOf(list.find((p) => p.uid === uid)!) : c.selected(uids.length);
    if (next.every((p, i) => p.uid === list[i].uid)) {
      announce(step === "earlier" || step === "first" ? c.alreadyFirst(label) : c.alreadyLast(label));
      return;
    }
    commit(next);
    announceMove(uids, next);
    focusOn(uid);
  };
  const dragPages = (uid: string, gap: number) => {
    const uids = scopeOf(uid);
    const set = new Set(uids);
    const list = pagesRef.current;
    const next = moveBlock(list, set, gapToIndex(list, set, gap));
    if (next.every((p, i) => p.uid === list[i].uid)) {
      announce(c.dragCancel);
      return;
    }
    commit(next);
    announceMove(uids, next);
    focusOn(uid);
  };
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
    commit(next);
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
    commit(next, { undo: uids.length === 1 || what !== "" ? c.removed(what || describeRef(list[firstIdx])) : c.removedPages(uids.length) });
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
  const removeSelection = () => {
    const uids = pagesRef.current.filter((p) => selection.has(p.uid)).map((p) => p.uid);
    if (!uids.length) return;
    removeUids(uids, uids.length === 1 ? labelOf(pagesRef.current.find((p) => p.uid === uids[0])!) : "");
    setSelection(new Set());
  };

  // ---- inserting ----
  const insertBlank = (at: number) => {
    const list = pagesRef.current;
    const blank: PageRef = { uid: newUid(), sourceId: null, sourceIndex: -1, rotation: 0, size: blankSizeAt(list, at) };
    if (!commit(insertPages(list, at, [blank]))) return;
    api.current?.setView("pages");
    setInserted(new Set([blank.uid]));
    announce(c.blankAdded(list[at - 1] ? c.after(labelOf(list[at - 1])) : at === 0 && list.length ? c.atStart : c.atEnd));
    focusOn(blank.uid, true);
  };
  const openFilesHere = (at: number) => {
    pendingAt.current = at;
    filesHereInput.current?.click();
  };
  const openPagesPicker = (at: number | null) => {
    pendingAt.current = at;
    pagesInput.current?.click();
  };
  const toolbarBlank = () => {
    const list = pagesRef.current;
    const last = list.reduce((acc, p, i) => (selection.has(p.uid) ? i : acc), -1);
    insertBlank(last >= 0 ? last + 1 : list.length);
  };

  const confirmPicker = (indexes: number[]) => {
    const pk = pickerRef.current;
    if (!pk) return;
    const file = filesRef.current.find((f) => f.id === pk.fileId);
    if (!file?.pages) return;
    const added: PageRef[] = indexes.map((i) => ({ uid: newUid(), sourceId: file.id, sourceIndex: i, rotation: 0, size: file.pages![i] }));
    const at = pk.at ?? pagesRef.current.length;
    const before = pagesRef.current[at - 1];
    setPicker(null);
    commit(insertPages(pagesRef.current, at, added));
    api.current?.setView("pages");
    setInserted(new Set(added.map((p) => p.uid)));
    announce(c.pagesAdded(added.length, before ? c.after(labelOf(before)) : c.atEnd));
    focusOn(added[0]?.uid, true);
  };
  const cancelPicker = () => {
    const pk = pickerRef.current;
    if (!pk) return;
    setPicker(null);
    if (letterSeq.current > 0 && sourceLetter(letterSeq.current - 1) === pk.letter) letterSeq.current--;
    setSources((prev) => {
      const next = { ...prev };
      delete next[pk.fileId];
      return next;
    });
    api.current?.removeFiles([pk.fileId]);
  };

  // ---- page actions ----
  const onPageAction = (uid: string, action: PageAction) => {
    const list = pagesRef.current;
    const index = list.findIndex((p) => p.uid === uid);
    if (index < 0) return;
    const page = list[index];
    switch (action) {
      case "rotate-left":
      case "rotate-right": {
        const step = action === "rotate-right" ? 90 : -90;
        const uids = scopeOf(uid);
        commit(rotatePages(list, new Set(uids), step));
        announce(c.rotatedAnnounce(uids.length > 1 ? c.selected(uids.length) : labelOf(page), step > 0 ? "right" : "left"));
        return;
      }
      case "remove": {
        const others = [...selection].filter((u) => u !== uid);
        if (others.length) {
          const count = selection.has(uid) ? selection.size : selection.size + 1;
          setConfirm({ uid, label: labelOf(page), count });
          setDialogsUsed((d) => ({ ...d, confirm: true }));
        } else removeUids([uid], labelOf(page));
        return;
      }
      case "duplicate": {
        const { pages: next, added } = duplicatePages(list, new Set(scopeOf(uid)), newUid);
        if (!commit(next)) return;
        setInserted(new Set(added));
        focusOn(added[0]);
        return;
      }
      case "move-to": {
        const uids = scopeOf(uid);
        const first = list.findIndex((p) => uids.includes(p.uid));
        setMoveDialog({ uids, subject: uids.length > 1 ? `${uids.length} pages` : labelOf(page), current: first + 1, total: list.length - uids.length + 1 });
        setDialogsUsed((d) => ({ ...d, move: true }));
        return;
      }
      case "move-earlier":
      case "move-later":
        movePages(uid, action === "move-earlier" ? "earlier" : "later");
        return;
      case "blank-after":
        insertBlank(index + 1);
        return;
      case "pages-after":
        openPagesPicker(index + 1);
        return;
      case "files-after":
        openFilesHere(index + 1);
        return;
      case "enlarge": {
        const shown = list.filter((p) => !isBlank(p) && !p.pending);
        api.current?.openPreview(
          shown.map((p) => ({ fileId: p.sourceId!, index: p.sourceIndex, rotation: p.rotation })),
          Math.max(0, shown.findIndex((p) => p.uid === uid)),
        );
        return;
      }
    }
  };
  const onInsert = (gap: number, kind: InsertKind) => {
    if (kind === "blank") insertBlank(gap);
    else if (kind === "files") openFilesHere(gap);
    else openPagesPicker(gap);
  };

  // ---- sorting ----
  const sortBy = (key: SortKey | "reverse") => {
    const list = pagesRef.current;
    const next = key === "reverse" ? reverseSegments(list) : sortPages(list, sourcesRef.current, key);
    commit(next, { undo: c.sorted[key] });
    announce(c.sorted[key]);
  };

  // ---- run ----
  const process: ProcessFn = async (ready, signal, onProgress) => {
    const list = pagesRef.current;
    const ids = sourcesInOrder(list);
    const srcs = ids.map((id) => {
      const f = ready.find((r) => r.id === id);
      if (!f) throw new Error("A file is not ready");
      return { id, name: f.name, kind: f.kind === "image" ? ("image" as const) : ("pdf" as const), source: f.source, password: f.password };
    });
    const out = await runInWorker(
      {
        kind: "merge",
        name: mergedName(sourcesRef.current[ids[0]]?.name),
        sources: srcs,
        pages: list.map((p) => ({ sourceId: p.sourceId, sourceIndex: p.sourceIndex, rotation: p.rotation, size: p.sourceId ? undefined : p.size })),
        options,
      },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };

  // Prefetch the workspace chunks at the first sign of intent (a pointer, key, focus or drag: the
  // file chooser then hides the load) or after 4 s, so the first pick never waits for them and the
  // first load stays within the phone JS budget (SEO checklist).
  useEffect(() => {
    const events = ["pointerdown", "keydown", "focusin", "dragenter"] as const;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      stop();
      void Promise.all([loadSegmentGrid(), loadMenu()]).catch(() => {});
    };
    const t = setTimeout(go, 4000);
    const stop = () => {
      clearTimeout(t);
      for (const e of events) window.removeEventListener(e, go, true);
    };
    for (const e of events) window.addEventListener(e, go, true);
    return stop;
  }, []);

  // Load the pages view chunk on idle once there is something to show.
  useEffect(() => {
    if (!pages.length) return;
    const t = setTimeout(() => void loadPageGrid(), 1500);
    return () => clearTimeout(t);
  }, [pages.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = acceptAttribute(tool.flow.accept);
  const changed = changedCount(options);
  const pk = picker;
  const pickerFile = pk ? filesById.get(pk.fileId) : undefined;
  const fallback = () => api.current?.fallbackFocus() ?? null;

  const sortItems: MenuEntry[] =
    segments.length < 2
      ? [{ note: c.sortNeedsMore }, ...(["name-asc", "name-desc", "date-asc", "date-desc"] as const).map((k) => ({ id: k, label: c.sortItems[k], disabled: true, onSelect: () => {} })), { separator: true as const }, { id: "reverse", label: c.sortItems.reverse, disabled: true, onSelect: () => {} }]
      : [
          ...(["name-asc", "name-desc", "date-asc", "date-desc"] as const).map((k) => ({ id: k, label: c.sortItems[k], onSelect: () => sortBy(k) })),
          { separator: true as const },
          { id: "reverse", label: c.sortItems.reverse, onSelect: () => sortBy("reverse") },
        ];

  // BerryPDF EditorToolbar: blueberry editing tools, like "Add files" beside them.
  const toolbarButton = "mp-btn mp-btn--tool whitespace-nowrap max-sm:size-11 max-sm:px-0";

  const renderWorkspace = (w: WorkspaceContext) => (
    <>
      {w.view === "files" ? (
        <SegmentGrid
          model={viewModel}
          focusUid={focus}
          dimmed={w.dimmed}
          sourceCount={sourceCount}
          onMove={(key, step) => moveCard(key, stepTarget(step))}
          onDragTo={(key, gap) => moveCard(key, (i) => (gap > i ? gap - 1 : gap))}
          onRemove={removeCard}
          onRotate={(key, step) => {
            const seg = segmentsOf(pagesRef.current).find((s) => s.key === key);
            if (!seg) return;
            commit(rotatePages(pagesRef.current, new Set(seg.pages.map((p) => p.uid)), step));
            announce(c.rotatedAnnounce(seg.sourceId ? (sourcesRef.current[seg.sourceId]?.name ?? "") : c.blankName, step > 0 ? "right" : "left"));
          }}
          onPreview={(key) => {
            const seg = segmentsOf(pagesRef.current).find((s) => s.key === key);
            const shown = seg?.pages.filter((p) => !isBlank(p) && !p.pending) ?? [];
            if (shown.length) api.current?.openPreview(shown.map((p) => ({ fileId: p.sourceId!, index: p.sourceIndex, rotation: p.rotation })), 0);
          }}
          onAddFiles={() => w.api.openPicker()}
          onDragState={(s) => announce(s.phase === "start" ? c.dragStart(s.name) : c.dragCancel)}
        />
      ) : (
        <EditablePageGrid
          model={viewModel}
          selection={selection}
          inserted={inserted}
          focusUid={focus}
          dimmed={w.dimmed}
          selectionCount={selection.size}
          onSelect={select}
          onSelectAll={() => {
            setSelection(new Set(pagesRef.current.map((p) => p.uid)));
            announceSelection(pagesRef.current.length);
          }}
          onClearSelection={clearSelection}
          onMove={movePages}
          onDragTo={dragPages}
          onAction={onPageAction}
          onInsert={onInsert}
          onRotateSelection={(step) => {
            const uids = pagesRef.current.filter((p) => selection.has(p.uid)).map((p) => p.uid);
            commit(rotatePages(pagesRef.current, new Set(uids), step));
            announce(c.rotatedAnnounce(c.selected(uids.length), step > 0 ? "right" : "left"));
          }}
          onRemoveSelection={removeSelection}
          onDragState={(s) => announce(s.phase === "start" ? c.dragStart(s.count > 1 ? `${s.count} pages` : s.label) : c.dragCancel)}
        />
      )}
      <ShortcutsHelp />
      <input
        ref={filesHereInput}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid="insert-file-input"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (list.length) void w.api.intake(list, null, { at: pendingAt.current ?? undefined } satisfies IntakeTag);
        }}
      />
      <input
        ref={pagesInput}
        type="file"
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid="pages-file-input"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []).slice(0, 1);
          e.target.value = "";
          if (list.length) void w.api.intake(list, null, { picker: true, at: pendingAt.current ?? undefined } satisfies IntakeTag);
        }}
      />
    </>
  );

  return (
    <>
      <ToolFlow
        tool={tool}
        apiRef={api}
        process={process}
        onReset={onReset}
        sortIntake={(list) => sortByName(list)}
        onFilesAdded={onFilesAdded}
        onFilesChange={onFilesChange}
        beforeIntake={() => {
          clearUndo();
          collectOrphans();
        }}
        workspaceEmpty={pages.length === 0 && !picker}
        viewToggleFromOneFile
        compactAddFiles
        optionsBadge={changed ? c.changed(changed) : undefined}
        copyOverrides={{ pickerButton: c.pickerButton, pickerHint: c.pickerHint, limits: c.limits, limitsFull: c.limitsFull, statusEmpty: c.statusEmpty, errorType: c.errorType }}
        canRun={() => (pages.some((p) => p.pending) || picker ? c.statusPending : pages.length ? true : c.statusEmpty)}
        readyStatus={() => c.status(readyPages.length, sourceCount)}
        renderWorkspace={renderWorkspace}
        toolbarStart={(w) => (
          <MenuButton label={c.sort} items={sortItems} disabled={w.dimmed} className={toolbarButton} title={c.sort} data-testid="sort-menu">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
            </svg>
            <span className="max-md:sr-only">{c.sort}</span>
            <ChevronDownIcon size={16} className="max-md:hidden" />
          </MenuButton>
        )}
        toolbarEnd={(w) => (
          <MenuButton
            label={c.addPages}
            placement="bottom-end"
            disabled={w.dimmed}
            className={cx(toolbarButton, "-ms-1")}
            items={[
              { id: "from-file", label: c.fromFile, onSelect: () => openPagesPicker(null) },
              { id: "blank", label: c.blankPage, onSelect: toolbarBlank },
            ]}
            data-testid="add-pages-menu"
          >
            <PlusIcon size={18} className="sm:hidden" />
            <span className="max-sm:sr-only">{c.addPages}</span>
            <ChevronDownIcon size={16} className="max-sm:hidden" />
          </MenuButton>
        )}
        inspectPdf={inspectPdf}
        renderOptions={(ctx) => <MergeOptions value={options} onChange={changeOptions} announce={ctx.announce} />}
      />
      {dialogsUsed.picker && (
        <PagePickerDialog
          open={!!pk && pickerFile?.status === "ready"}
          fileId={pk?.fileId ?? ""}
          letter={pk?.letter ?? ""}
          pages={pickerFile?.pages ?? []}
          fileName={pickerFile?.name ?? ""}
          where={pk?.afterLabel ? c.after(pk.afterLabel) : pk?.at === 0 && pages.length ? c.atStart : c.atEnd}
          onConfirm={confirmPicker}
          onCancel={cancelPicker}
          announce={announce}
          fallbackFocus={fallback}
        />
      )}
      {dialogsUsed.move && (
        <MoveToPositionDialog
          open={!!moveDialog}
          current={moveDialog?.current ?? 1}
          total={moveDialog?.total ?? 1}
          subject={moveDialog?.subject ?? ""}
          onMove={(pos) => {
            const m = moveDialog;
            setMoveDialog(null);
            if (!m) return;
            const next = moveBlock(pagesRef.current, new Set(m.uids), pos - 1);
            commit(next);
            announceMove(m.uids, next);
            focusOn(m.uids[0]);
          }}
          onCancel={() => setMoveDialog(null)}
          fallbackFocus={fallback}
        />
      )}
      {dialogsUsed.confirm && (
        <RemoveSelectedDialog
          open={!!confirm}
          pageLabel={confirm?.label ?? ""}
          count={confirm?.count ?? 0}
          onOnlyThis={() => {
            const cf = confirm;
            setConfirm(null);
            if (cf) {
              setSelection((s) => {
                const n = new Set(s);
                n.delete(cf.uid);
                return n;
              });
              removeUids([cf.uid], cf.label);
            }
          }}
          onAll={() => {
            const cf = confirm;
            setConfirm(null);
            if (!cf) return;
            const uids = pagesRef.current.filter((p) => selection.has(p.uid) || p.uid === cf.uid).map((p) => p.uid);
            removeUids(uids, "");
            setSelection(new Set());
          }}
          onCancel={() => setConfirm(null)}
          fallbackFocus={fallback}
        />
      )}
    </>
  );
}
