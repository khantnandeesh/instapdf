"use client";
import { useRef } from "react";
import { selectCopy } from "@/components/page-select/copy";
import { planFiles, useDebouncedAnnounce, useRemembered } from "@/components/page-select/hooks";
import { usePageSelection } from "@/components/page-select/usePageSelection";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { RangeField, type RangeFieldHandle } from "@/components/page-select/RangeField";
import type { SelectionState, SelFile } from "@/components/page-select/selection";
import { Step } from "@/components/page-select/Step";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, ProcessFn } from "@/components/tool-flow/types";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { flowTool } from "@/tools/registry";
import { deleteCopy as c } from "./copy";

const tool = flowTool("delete-pdf-pages");

type Remembered = { removeBookmarks: boolean };
const defaults: Remembered = { removeBookmarks: false };
const check = (s: Record<string, unknown>): Partial<Remembered> => (typeof s.removeBookmarks === "boolean" ? { removeBookmarks: s.removeBookmarks } : {});

const totalOf = (files: readonly SelFile[]) => files.reduce((n, f) => n + f.pageCount, 0);

/** Delete pages (spec F4/F5 §3d, §6c; UI P-5, P-6): marked pages stay in view, dimmed, until the run. */
export function DeleteTool() {
  const apiRef = useRef<FlowApi | null>(null);
  const announce = useDebouncedAnnounce(apiRef);
  // The last single toggle, for "Page 2 marked. 11 of 12 pages kept" / "Page 2 kept".
  const lastToggle = useRef<{ fileId: string; index: number } | null>(null);
  const s = usePageSelection((state: SelectionState, files) => {
    const total = totalOf(files);
    const kept = total - files.reduce((n, f) => n + (state.sets[f.id]?.length ?? 0), 0);
    const t = lastToggle.current;
    lastToggle.current = null;
    if (t) {
      const on = (state.sets[t.fileId] ?? []).includes(t.index);
      announce(on ? c.liveMarked(t.index + 1, kept, total) : c.liveKept(t.index + 1));
    } else if (files.length) announce(c.liveCount(kept, total));
  });
  const [opts, setOpts, optsLive] = useRemembered("delete-pdf-pages", defaults, check);
  const field = useRef<RangeFieldHandle>(null);

  const kept = s.total - s.count;
  const errorText = s.errorText;
  // Every page of a file marked: the field says at least one must stay (§3d, AC-469, AC-474).
  const keepOne = !s.error && s.full.length ? selectCopy.keepOne(s.files.length > 1 ? s.full[0].name : undefined) : null;

  const toggle = (fileId: string, index: number, shift: boolean) => {
    lastToggle.current = shift ? null : { fileId, index };
    s.activate(fileId, index, shift);
  };

  // The planner is only needed for the run (kept out of the first load, spec UI P-12).
  const process: ProcessFn = async (files, signal, onProgress) => {
    // The marks as typed (eval G-3): read live, not from this render.
    const now = s.current();
    if (now.errorText) throw new Error(USER_ERROR + now.errorText);
    if (now.full.length) throw new Error(USER_ERROR + selectCopy.keepOne(now.files.length > 1 ? now.full[0].name : undefined));
    const { planDelete } = await import("@/lib/page-plans");
    const run = planDelete(planFiles(files), now.state.sets);
    const { runPlan } = await import("@/components/page-select/job");
    const out = await runPlan("delete", run, files, optsLive.current.removeBookmarks, signal, onProgress);
    // The meta line says what was removed (spec F25 §7 item 2, eval G-15): "11 pages, 2.7 KB. 1 page deleted."
    return { ...out, note: c.deleted(now.count) };
  };
  /** Enter in the field: run when the pages as typed mark something and keep a page of every file. */
  const submit = () => {
    const now = s.current();
    if (now.errorText || now.full.length) return field.current?.shake();
    if (now.count > 0) apiRef.current?.submit();
  };

  return (
    <ToolFlow
      tool={tool}
      apiRef={apiRef}
      process={process}
      onFilesChange={s.onFilesChange}
      onReset={s.reset}
      canRun={() => (s.error || keepOne ? c.status(kept, s.total) : s.count === 0 ? c.statusEmpty : true)}
      readyStatus={() => c.status(kept, s.total)}
      primaryLabel={() => c.primary(s.count)}
      gridHint={c.gridHint}
      decoratePage={(file, index) => {
        const marked = (s.state.sets[file.id] ?? []).includes(index);
        return { pendingDelta: 0, inScope: false, marked, pressed: marked, label: c.tile(index + 1) };
      }}
      onTileActivate={(file, index, mods) => toggle(file.id, index, mods.shift)}
      onPageKey={(file, index, key) => {
        if (key === "Escape") {
          s.clear();
          return true;
        }
        if (key === "Delete" || key === "Backspace") {
          toggle(file.id, index, false);
          return true;
        }
        return false;
      }}
      renderMore={(ctx) => (
        <MoreOptions
          changed={opts.removeBookmarks ? 1 : 0}
          disabled={ctx.disabled}
          content={{ bookmarks: { value: opts.removeBookmarks, onChange: (removeBookmarks) => setOpts({ removeBookmarks }) } }}
        />
      )}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-3.5 max-sm:flex-1">
          <Step n={1}>{c.step}</Step>
          <RangeField
            ref={field}
            label={c.field}
            value={s.state.text}
            placeholder={c.placeholder}
            differs={s.state.differs}
            error={errorText}
            notice={keepOne}
            clearLabel={selectCopy.clearSelection}
            canClear={s.count > 0 || !!s.state.text}
            onChange={s.type}
            onBlur={s.blur}
            onClear={s.clear}
            onEnter={submit}
            className="min-w-0 flex-1 dock-bar:lg:max-xl:max-w-[190px] dock-bar:xl:flex-none dock-bar:xl:max-[1439px]:w-[240px] dock-bar:min-[1440px]:w-[300px]"
          />
        </div>
      )}
    />
  );
}
