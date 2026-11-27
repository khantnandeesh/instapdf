"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useLiveState } from "@/components/ui/live-state";
import type { CardView } from "@/components/page-edit/SegmentGrid";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { LoadedFile, WorkspaceContext } from "@/components/tool-flow/types";
import { A4, isBlank, segmentsOf, type PageRef, type Segment } from "@/lib/page-list";
import { canMix, interleave, type MixCard } from "@/lib/mix-plan";
import { parseCount } from "@/lib/plan-counts";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { ALTERNATE_OPTIONS } from "@/lib/pdf/merge-options";
import { mixedName } from "@/lib/pdf/naming";
import { mergeCopy } from "@/tools/merge/copy";
import { EditablePageGrid, SegmentGrid, usePageWorkspace } from "@/tools/merge/workspace";
import { flowTool } from "@/tools/registry";
import { alternateCopy as a } from "./copy";
import type { Mix } from "./MixSettings";

const tool = flowTool("alternate-mix-pdf");

const loadMixSettings = () => import("./MixSettings");
// The tools row's Sort menu: drawn only once a file is in, so apart from the route like the cards' settings.
const loadSortMenu = () => import("./SortMenu");
const SortMenu = dynamic(() => loadSortMenu().then((m) => m.SortMenu), { ssr: false, loading: () => <span className="inline-block h-9 w-11 shrink-0" aria-hidden="true" /> });
const OneFileHint = dynamic(() => import("./OneFileHint").then((m) => m.OneFileHint), { ssr: false });
const MixSettings = dynamic(() => loadMixSettings().then((m) => m.MixSettings), { ssr: false, loading: () => <div className="min-h-[120px]" aria-hidden="true" /> });
const DEFAULT_MIX: Mix = { reverse: false, perTurn: "1", repeat: true };
const NO_SELECTION: ReadonlySet<string> = new Set();
const noop = () => {};

/** Cards in order (each a whole, read file), as the interleave sees them. */
function cardsOf(segments: readonly Segment[], sources: Record<string, { name: string } | undefined>, mix: Record<string, Mix>): MixCard[] {
  return segments.flatMap((seg) => {
    if (!seg.sourceId || seg.pages.some((p) => p.pending)) return [];
    const m = mix[seg.sourceId] ?? DEFAULT_MIX;
    return [{ sourceId: seg.sourceId, name: sources[seg.sourceId]?.name ?? "", pageCount: seg.pages.length, reverse: m.reverse, perTurn: parseCount(m.perTurn) ?? 1, repeat: m.repeat }];
  });
}

/** Whether any card's pages per turn, as typed, is not a valid count. */
const anyInvalid = (cards: MixCard[], mix: Record<string, Mix>) => cards.some((c) => parseCount((mix[c.sourceId] ?? DEFAULT_MIX).perTurn) === null);

/** The output order as page refs: the read-only pages view and the run use the same list. */
function orderOf(cards: MixCard[], files: ReadonlyMap<string, LoadedFile>): PageRef[] {
  return interleave(cards).map((p, i) => ({ uid: `r${i}`, sourceId: p.sourceId, sourceIndex: p.sourceIndex, rotation: 0, size: files.get(p.sourceId)?.pages?.[p.sourceIndex] ?? A4 }));
}

/**
 * Alternate & mix (spec F4/F5 §3g): one wide card per file with its order, pages per turn and (one-page
 * files) Repeat; the pages view shows the resulting order, read-only. The page list holds each file
 * whole, as one segment, so Merge's card moves, drag, removal and undo notice apply unchanged.
 */
export function AlternateTool() {
  // No Undo│Redo: card moves and settings are few, and removal keeps the undo notice (P-11 #3).
  const ws = usePageWorkspace({ tool });
  // Live (eval G-3): the run reads pages per turn as typed, even before React shows it.
  const [mix, setMix, mixLive] = useLiveState<Record<string, Mix>>({});
  const mixOf = (id: string) => mix[id] ?? DEFAULT_MIX;
  const patchMix = (id: string, patch: Partial<Mix>) => setMix((m) => ({ ...m, [id]: { ...(m[id] ?? DEFAULT_MIX), ...patch } }));

  const pending = ws.pages.some((p) => p.pending);
  /** Cards in order (each a whole, read file), as the interleave sees them. */
  const cards: MixCard[] = useMemo(() => cardsOf(ws.segments, ws.sources, mix), [ws.segments, ws.sources, mix]);
  const invalid = anyInvalid(cards, mix);
  const result: PageRef[] = useMemo(() => orderOf(cards, ws.filesById), [cards, ws.filesById]);
  const status = a.status(result.length, cards.length);
  const mixable = canMix(cards);

  // ---- one file: offer Organize, whose two-sided scan order fixes a fronts-then-backs scan (P-11 #11) ----
  // An inline callout at the top of the workspace (visual gate 2026-11-26): it stays while one file is
  // in, so a floating notice would sit on the cards or the tools row the whole time.
  const single = cards.length === 1 && !pending && ws.segments.length === 1 ? cards[0].sourceId : null;
  const [hintClosed, setHintClosed] = useState<string | null>(null);
  useEffect(() => {
    void loadMixSettings();
    void loadSortMenu();
  }, []);
  const oneFileHint = (w: WorkspaceContext) =>
    single && hintClosed !== single && !w.dimmed ? <OneFileHint file={ws.filesById.get(single)} onClose={() => setHintClosed(single)} /> : null;

  /** The cards from the live page list and settings, not this render's (eval G-3); null while any number is invalid. */
  const liveCards = () => {
    const now = cardsOf(segmentsOf(ws.pagesRef.current), ws.sourcesRef.current, mixLive.current);
    return anyInvalid(now, mixLive.current) ? null : now;
  };
  /** Enter in a card's pages per turn: mix when every card's number, as typed, is valid. */
  const submit = () => {
    const now = liveCards();
    if (now && canMix(now) && !ws.pagesRef.current.some((p) => p.pending)) ws.api.current?.submit();
  };
  const settings = (card: CardView) => {
    const id = card.fileId;
    if (!id) return null;
    const count = ws.sources[id]?.pageCount || ws.filesById.get(id)?.pageCount || 0;
    return <MixSettings id={id} name={card.name} pageCount={count} mix={mixOf(id)} onChange={(patch) => patchMix(id, patch)} announce={ws.announce} onEnter={submit} />;
  };

  const renderWorkspace = (w: WorkspaceContext) => (
    <>
      {oneFileHint(w)}
      {w.view === "files" ? (
        <SegmentGrid
          variant="mix"
          listRef={ws.gridList}
          model={ws.viewModel}
          labels={{ list: a.filesLabel, hint: a.filesHint }}
          focusUid={ws.focus}
          dimmed={w.dimmed}
          sourceCount={ws.sourceCount}
          onMove={(key, step) => ws.moveCard(key, ws.stepTarget(step))}
          onDragTo={(key, gap) => ws.moveCard(key, (i) => (gap > i ? gap - 1 : gap))}
          onRemove={ws.removeCard}
          onRotate={noop}
          onPreview={(key) => {
            const seg = ws.segments.find((s) => s.key === key);
            const first = seg?.pages.find((p) => !isBlank(p) && !p.pending);
            if (seg && first) ws.api.current?.openPreview(seg.pages.map((p) => ({ fileId: p.sourceId!, index: p.sourceIndex, rotation: p.rotation })), 0);
          }}
          onAddFiles={() => w.api.openPicker()}
          onDragState={(s) => ws.announce(s.phase === "start" ? mergeCopy.dragStart(s.name) : mergeCopy.dragCancel)}
          renderSettings={settings}
        />
      ) : (
        <EditablePageGrid
          readOnly
          model={{ pages: result, sources: ws.sources, files: ws.filesById }}
          labels={{ list: a.resultLabel, hint: a.resultHint }}
          selection={NO_SELECTION}
          inserted={NO_SELECTION}
          focusUid={null}
          dimmed={w.dimmed}
          selectionCount={0}
          onSelect={noop}
          onSelectAll={noop}
          onClearSelection={noop}
          onMove={noop}
          onDragTo={noop}
          onAction={(uid, action) => action === "enlarge" && ws.enlarge(uid, result)}
          onInsert={noop}
          onRotateSelection={noop}
          onRemoveSelection={noop}
          onDragState={noop}
        />
      )}
    </>
  );

  return (
    <>
      <ToolFlow
        tool={tool}
        {...ws.flowProps}
        process={ws.runList(
          () => {
            const now = liveCards();
            if (!now) throw new Error(USER_ERROR + a.perTurnError);
            return orderOf(now, ws.filesById);
          },
          () => ALTERNATE_OPTIONS,
          mixedName,
        )}
        copyOverrides={{ pickerButton: mergeCopy.pickerButton, pickerHint: mergeCopy.pickerHint, limits: mergeCopy.limits, limitsFull: mergeCopy.limitsFull, statusEmpty: mergeCopy.statusEmpty, errorType: mergeCopy.errorType }}
        canRun={() => (pending ? mergeCopy.statusPending : !ws.pages.length ? mergeCopy.statusEmpty : !mixable ? a.needsAnother : invalid ? status : true)}
        readyStatus={() => status}
        phoneAddMenu={undefined}
        renderWorkspace={renderWorkspace}
        toolbarStart={(w) => <SortMenu ws={ws} disabled={w.dimmed} />}
        // No options before or after a file is in: each card holds its own (spec P-3).
        renderOptions={() => null}
      />
    </>
  );
}
