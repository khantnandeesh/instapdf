"use client";
/**
 * Page editing on top of the page workspace (spec F3 M-4 to M-7, F4/F5 §3e, §3f): the editable files
 * and pages views, tile actions, inserting files, pages and blank pages, the Add menus, and the
 * page picker, move-to and remove dialogs. Merge, Combine & reorder and Organize draw it through
 * editing.tsx, which loads this module on intent: none of it is needed before the first file is in,
 * so it stays out of every route's first load (F3 M-10, F4/F5 P-12). It holds no state of its own:
 * everything lives in the workspace, so the three parts below share it.
 */
import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { InsertKind, PageAction, PageGridLabels } from "@/components/page-edit/EditablePageGrid";
import type { SegmentGridLabels } from "@/components/page-edit/SegmentGrid";
import type { WorkspaceContext } from "@/components/tool-flow/types";
import { cx } from "@/components/ui/cx";
import { ChevronDownIcon, PlusIcon } from "@/components/ui/icons";
import type { MenuEntry } from "@/components/ui/Menu";
import { blankSizeAt, duplicatePages, gapToIndex, insertPages, isBlank, moveBlock, rotatePages, segmentsOf, sourceLetter, stepIndex, type MoveStep, type PageRef } from "@/lib/page-list";
import { acceptAttribute } from "@/lib/pdf/validation";
import { mergeCopy as c } from "./copy";
import { EditablePageGrid, loadSegmentGrid, MenuButton, SegmentGrid, toolbarButton, type IntakeTag, type PageWorkspace } from "./workspace";

const ShortcutsHelp = dynamic(() => loadSegmentGrid().then((m) => m.ShortcutsHelp), { ssr: false });
const loadDialogs = () => import("@/components/page-edit/dialogs");
const PagePickerDialog = dynamic(() => loadDialogs().then((m) => m.PagePickerDialog), { ssr: false });
const MoveToPositionDialog = dynamic(() => loadDialogs().then((m) => m.MoveToPositionDialog), { ssr: false });
const RemoveSelectedDialog = dynamic(() => loadDialogs().then((m) => m.RemoveSelectedDialog), { ssr: false });

type Labels = { pages?: Partial<PageGridLabels>; segments?: Partial<SegmentGridLabels> };

/** The editing actions and views over `ws` (no hooks: each part below calls it on render). */
function editor(ws: PageWorkspace) {
  const { api, pages, pagesRef, sourcesRef, filesById, selection, gridList, focus, viewModel, sourceCount, announce, commit, removeUids, removeCard, moveCard, stepTarget, enlarge, selectAll, clearSelection } = ws;
  const { tool, newUid, letterSeq, setSources, filesRef, setSelection, anchor, picker, pickerRef, setPicker, moveDialog, setMoveDialog, confirm, setConfirm, dialogsUsed, setDialogsUsed, inserted, setInserted, focusOn, announceSelection, labelOf } = ws.internals;
  const { filesHereInput, pagesInput, pendingAt, focusAfterPicker } = ws.internals;

  // ---- selection ----
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
    commit(next, { step: "move" });
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
    commit(next, { step: "move" });
    announceMove(uids, next);
    focusOn(uid);
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
    if (!commit(insertPages(list, at, [blank]), { step: "blank page" })) return;
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
    commit(insertPages(pagesRef.current, at, added), { step: "add pages" });
    api.current?.setView("pages");
    setInserted(new Set(added.map((p) => p.uid)));
    announce(c.pagesAdded(added.length, before ? c.after(labelOf(before)) : c.atEnd));
    // Focus the first new tile once the picker has closed (spec M-6): while the modal is
    // open the grid behind it is inert, and closing it hands focus back to its opener.
    focusAfterPicker.current = added[0]?.uid ?? null;
  };
  const cancelPicker = () => {
    const pk = pickerRef.current;
    if (!pk) return;
    setPicker(null);
    if (pk.loaded) return;
    if (letterSeq.current > 0 && sourceLetter(letterSeq.current - 1) === pk.letter) letterSeq.current--;
    setSources((prev) => {
      const next = { ...prev };
      delete next[pk.fileId];
      return next;
    });
    api.current?.removeFiles([pk.fileId]);
  };

  // ---- page actions ----
  const rotateUids = (uids: string[], step: number, what: string) => {
    commit(rotatePages(pagesRef.current, new Set(uids), step), { step: "rotate" });
    announce(c.rotatedAnnounce(what, step > 0 ? "right" : "left"));
  };
  const onPageAction = (uid: string, action: PageAction) => {
    const list = pagesRef.current;
    const index = list.findIndex((p) => p.uid === uid);
    if (index < 0) return;
    const page = list[index];
    switch (action) {
      case "rotate-left":
      case "rotate-right": {
        const uids = scopeOf(uid);
        rotateUids(uids, action === "rotate-right" ? 90 : -90, uids.length > 1 ? c.selected(uids.length) : labelOf(page));
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
        if (!commit(next, { step: "duplicate" })) return;
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
      case "enlarge":
        enlarge(uid);
        return;
    }
  };
  const onInsert = (gap: number, kind: InsertKind) => {
    if (kind === "blank") insertBlank(gap);
    else if (kind === "files") openFilesHere(gap);
    else openPagesPicker(gap);
  };

  const accept = acceptAttribute(tool.flow.accept);
  const pk = picker;
  const pickerFile = pk ? filesById.get(pk.fileId) : undefined;
  const fallback = () => api.current?.fallbackFocus() ?? null;
  const inUse = pk?.loaded ? new Set(pages.filter((p) => p.sourceId === pk.fileId).map((p) => p.sourceIndex)) : undefined;

  /** Files and pages views of the editing tools (Merge, Combine, Organize). */
  const renderEditWorkspace = (w: WorkspaceContext, labels: Labels = {}) => (
    <>
      {w.view === "files" ? (
        <SegmentGrid
          listRef={gridList}
          model={viewModel}
          labels={labels.segments}
          focusUid={focus}
          dimmed={w.dimmed}
          sourceCount={sourceCount}
          onMove={(key, step) => moveCard(key, stepTarget(step))}
          onDragTo={(key, gap) => moveCard(key, (i) => (gap > i ? gap - 1 : gap))}
          onRemove={removeCard}
          onRotate={(key, step) => {
            const seg = segmentsOf(pagesRef.current).find((s) => s.key === key);
            if (!seg) return;
            rotateUids(
              seg.pages.map((p) => p.uid),
              step,
              seg.sourceId ? (sourcesRef.current[seg.sourceId]?.name ?? "") : c.blankName,
            );
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
          listRef={gridList}
          model={viewModel}
          labels={labels.pages}
          selection={selection}
          inserted={inserted}
          focusUid={focus}
          dimmed={w.dimmed}
          selectionCount={selection.size}
          onSelect={select}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onMove={movePages}
          onDragTo={dragPages}
          onAction={onPageAction}
          onInsert={onInsert}
          onRotateSelection={(step) => {
            const uids = pagesRef.current.filter((p) => selection.has(p.uid)).map((p) => p.uid);
            rotateUids(uids, step, c.selected(uids.length));
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

  /**
   * The toolbar's Add controls: from 1024 px "Add pages" beside the flow's "Add files"; below 1024 px
   * one "Add" menu replaces both (spec F3 M-3, F4/F5 P-3), icon-only below 360 px. `loaded`: Organize's
   * "From a loaded file" entries.
   */
  const renderAddMenus = (w: WorkspaceContext, loaded: MenuEntry[] = []) => (
    <>
      <span className="contents max-lg:hidden">
        <MenuButton
          label={c.addPages}
          placement="bottom-end"
          disabled={w.dimmed}
          className={cx(toolbarButton, "-ms-1")}
          items={[{ id: "from-file", label: c.fromFile, onSelect: () => openPagesPicker(null) }, { id: "blank", label: c.blankPage, onSelect: toolbarBlank }, ...loaded]}
          data-testid="add-pages-menu"
        >
          <span>{c.addPages}</span>
          <ChevronDownIcon size={16} />
        </MenuButton>
      </span>
      <span className="contents lg:hidden">
        <MenuButton
          label={c.add}
          placement="bottom-end"
          disabled={w.dimmed}
          className="mp-btn mp-btn--tool shadow-tool-lift h-11 shrink-0 gap-1.5 px-3.5 whitespace-nowrap max-[359px]:w-11 max-[359px]:px-0"
          items={[
            { id: "files", label: c.addFilesItem, onSelect: () => w.api.openPicker() },
            { id: "from-file", label: c.fromFile, onSelect: () => openPagesPicker(null) },
            { id: "blank", label: c.blankPage, onSelect: toolbarBlank },
            ...loaded,
          ]}
          data-testid="add-menu"
        >
          <PlusIcon size={18} />
          <span className="max-[359px]:sr-only">{c.add}</span>
        </MenuButton>
      </span>
    </>
  );

  const dialogs = (
    <>
      {dialogsUsed.picker && (
        <PagePickerDialog
          open={!!pk && pickerFile?.status === "ready"}
          fileId={pk?.fileId ?? ""}
          letter={pk?.letter ?? ""}
          pages={pickerFile?.pages ?? []}
          fileName={pickerFile?.name ?? ""}
          where={pk?.afterLabel ? c.after(pk.afterLabel) : pk?.at === 0 && pages.length ? c.atStart : c.atEnd}
          inUse={inUse}
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
            commit(next, { step: "move" });
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


  return { renderEditWorkspace, renderAddMenus, dialogs };
}

/** The files and pages views of the editing tools, with their hidden file inputs. */
export function EditWorkspace({ ws, w, labels }: { ws: PageWorkspace; w: WorkspaceContext; labels?: Labels }) {
  return editor(ws).renderEditWorkspace(w, labels);
}

/** The toolbar's Add controls. `loaded`: Organize's "From a loaded file" entries. */
export function AddMenus({ ws, w, loaded }: { ws: PageWorkspace; w: WorkspaceContext; loaded?: MenuEntry[] }) {
  return editor(ws).renderAddMenus(w, loaded);
}

/** The page picker, move-to and remove dialogs (drawn once one has been opened). */
export function EditorDialogs({ ws }: { ws: PageWorkspace }) {
  const { picker, focusAfterPicker, focusOn } = ws.internals;
  // Runs after the dialog's own close effect (a parent's effects run after its children's).
  useEffect(() => {
    if (picker || !focusAfterPicker.current) return;
    const uid = focusAfterPicker.current;
    focusAfterPicker.current = null;
    focusOn(uid, true);
  }, [picker]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the picker closes
  return editor(ws).dialogs;
}
