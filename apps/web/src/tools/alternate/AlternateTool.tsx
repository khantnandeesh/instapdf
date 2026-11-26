"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CardView } from "@/components/page-edit/SegmentGrid";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { WorkspaceContext } from "@/components/tool-flow/types";
import { ChevronDownIcon } from "@/components/ui/icons";
import type { MenuEntry } from "@/components/ui/Menu";
import { Notice } from "@/components/ui/Notice";
import { A4, isBlank, sortPages, type PageRef } from "@/lib/page-list";
import { canMix, interleave, type MixCard } from "@/lib/mix-plan";
import { parseCount } from "@/lib/plan-counts";
import { setHandoff } from "@/lib/pdf/handoff";
import { ALTERNATE_OPTIONS } from "@/lib/pdf/merge-options";
import { mixedName } from "@/lib/pdf/naming";
import { mergeCopy } from "@/tools/merge/copy";
import { EditablePageGrid, PlainMenuButton, SegmentGrid, SortGlyph, toolbarButton, usePageWorkspace } from "@/tools/merge/workspace";
import { flowTool } from "@/tools/registry";
import { alternateCopy as a } from "./copy";
import type { Mix } from "./MixSettings";

const tool = flowTool("alternate-mix-pdf");

const loadMixSettings = () => import("./MixSettings");
const MixSettings = dynamic(() => loadMixSettings().then((m) => m.MixSettings), { ssr: false, loading: () => <div className="min-h-[120px]" aria-hidden="true" /> });
const DEFAULT_MIX: Mix = { reverse: false, perTurn: "1", repeat: true };
const NO_SELECTION: ReadonlySet<string> = new Set();
const noop = () => {};

/**
 * Alternate & mix (spec F4/F5 §3g): one wide card per file with its order, pages per turn and (one-page
 * files) Repeat; the pages view shows the resulting order, read-only. The page list holds each file
 * whole, as one segment, so Merge's card moves, drag, removal and undo notice apply unchanged.
 */
export function AlternateTool() {
  // No Undo│Redo: card moves and settings are few, and removal keeps the undo notice (P-11 #3).
  const ws = usePageWorkspace({ tool });
  const router = useRouter();
  const [mix, setMix] = useState<Record<string, Mix>>({});
  const mixOf = (id: string) => mix[id] ?? DEFAULT_MIX;
  const patchMix = (id: string, patch: Partial<Mix>) => setMix((m) => ({ ...m, [id]: { ...(m[id] ?? DEFAULT_MIX), ...patch } }));

  const pending = ws.pages.some((p) => p.pending);
  /** Cards in order (each a whole, read file), as the interleave sees them. */
  const cards: MixCard[] = useMemo(
    () =>
      ws.segments.flatMap((seg) => {
        if (!seg.sourceId || seg.pages.some((p) => p.pending)) return [];
        const m = mix[seg.sourceId] ?? DEFAULT_MIX;
        return [{ sourceId: seg.sourceId, name: ws.sources[seg.sourceId]?.name ?? "", pageCount: seg.pages.length, reverse: m.reverse, perTurn: parseCount(m.perTurn) ?? 1, repeat: m.repeat }];
      }),
    [ws.segments, ws.sources, mix],
  );
  const invalid = cards.some((c) => parseCount(mixOf(c.sourceId).perTurn) === null);
  /** The output order, as page refs (the read-only pages view and the run use the same list). */
  const result: PageRef[] = useMemo(
    () =>
      interleave(cards).map((p, i) => ({
        uid: `r${i}`,
        sourceId: p.sourceId,
        sourceIndex: p.sourceIndex,
        rotation: 0,
        size: ws.filesById.get(p.sourceId)?.pages?.[p.sourceIndex] ?? A4,
      })),
    [cards, ws.filesById],
  );
  const status = a.status(result.length, cards.length);
  const mixable = canMix(cards);

  // ---- one file: offer Organize, whose two-sided scan order fixes a fronts-then-backs scan (P-11 #11) ----
  // An inline callout at the top of the workspace (visual gate 2026-11-26): it stays while one file is
  // in, so a floating notice would sit on the cards or the tools row the whole time.
  const single = cards.length === 1 && !pending && ws.segments.length === 1 ? cards[0].sourceId : null;
  const [hintClosed, setHintClosed] = useState<string | null>(null);
  useEffect(() => {
    void loadMixSettings();
  }, []);
  const openInOrganize = (id: string) => {
    const f = ws.filesById.get(id);
    if (!f) return;
    setHandoff("organize-pdf", [f.source instanceof File ? f.source : new File([f.source], f.name, { type: f.source.type })]);
    router.push("/organize-pdf");
  };
  const oneFileHint = (w: WorkspaceContext) =>
    single && hintClosed !== single && !w.dimmed ? (
      <div className="pt-1 pb-3" data-testid="one-file-hint">
        <Notice tone="info" look="callout" title={a.oneFile} onDismiss={() => setHintClosed(single)} action={{ label: a.openOrganize, onClick: () => openInOrganize(single) }} />
      </div>
    ) : null;

  // ---- Sort ▾: name order of the cards (AC-529) ----
  const sortItems: MenuEntry[] = (["name-asc", "name-desc"] as const).map((k) => ({
    id: k,
    label: a.sortItems[k],
    disabled: ws.fileRuns < 2,
    onSelect: () => ws.reorder(sortPages(ws.pagesRef.current, ws.sourcesRef.current, k), "sort", a.sorted[k]),
  }));

  const settings = (card: CardView) => {
    const id = card.fileId;
    if (!id) return null;
    const count = ws.sources[id]?.pageCount || ws.filesById.get(id)?.pageCount || 0;
    return <MixSettings id={id} name={card.name} pageCount={count} mix={mixOf(id)} onChange={(patch) => patchMix(id, patch)} announce={ws.announce} />;
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
        emptyLayout="bar"
        process={ws.runList(
          () => result,
          () => ALTERNATE_OPTIONS,
          mixedName,
        )}
        copyOverrides={{ pickerButton: mergeCopy.pickerButton, pickerHint: mergeCopy.pickerHint, limits: mergeCopy.limits, limitsFull: mergeCopy.limitsFull, statusEmpty: mergeCopy.statusEmpty, errorType: mergeCopy.errorType }}
        canRun={() => (pending ? mergeCopy.statusPending : !ws.pages.length ? mergeCopy.statusEmpty : !mixable ? a.needsAnother : invalid ? status : true)}
        readyStatus={() => status}
        phoneAddMenu={undefined}
        renderWorkspace={renderWorkspace}
        toolbarStart={(w) => (
          <PlainMenuButton label={a.sort} items={ws.segments.length < 2 ? [{ note: a.sortNeedsMore }, ...sortItems] : sortItems} disabled={w.dimmed} className={toolbarButton} title={a.sort} data-testid="sort-menu">
            <SortGlyph />
            <span className="max-md:sr-only">{a.sort}</span>
            <ChevronDownIcon size={16} className="max-md:hidden" />
          </PlainMenuButton>
        )}
        // No options before or after a file is in: each card holds its own (spec P-3).
        renderOptions={() => null}
      />
    </>
  );
}
