"use client";
import { useEffect, useRef } from "react";
import { selectCopy } from "@/components/page-select/copy";
import { planFiles, useDebouncedAnnounce, useRemembered } from "@/components/page-select/hooks";
import { usePageSelection } from "@/components/page-select/usePageSelection";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { RangeField, type RangeFieldHandle } from "@/components/page-select/RangeField";
import { Step, StripGlyph } from "@/components/page-select/Step";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, ProcessFn } from "@/components/tool-flow/types";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { flowTool } from "@/tools/registry";
import { extractCopy as c } from "./copy";

const tool = flowTool("extract-pdf-pages");

type Remembered = { pattern: string; removeBookmarks: boolean };
const defaults: Remembered = { pattern: c.defaultPattern, removeBookmarks: false };
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(typeof s.pattern === "string" ? { pattern: s.pattern } : {}),
  ...(typeof s.removeBookmarks === "boolean" ? { removeBookmarks: s.removeBookmarks } : {}),
});

const picks = [
  { value: "odd" as const, label: c.odd, icon: <StripGlyph groups={[3]} filled={[true, false, true]} /> },
  { value: "even" as const, label: c.even, icon: <StripGlyph groups={[3]} filled={[false, true, false]} /> },
  { value: "custom" as const, label: c.custom, icon: <StripGlyph groups={[3]} filled={[false, true, true]} /> },
];

/** Extract pages (spec F4/F5 §3c, §6b; UI P-5, P-6): the picked pages of each file, in document order. */
export function ExtractTool() {
  const apiRef = useRef<FlowApi | null>(null);
  const announce = useDebouncedAnnounce(apiRef);
  const s = usePageSelection((state, files) => {
    const picked = files.reduce((n, f) => n + (state.sets[f.id]?.length ?? 0), 0);
    if (files.length) announce(c.live(picked, files.reduce((n, f) => n + f.pageCount, 0)));
  });
  const [opts, setOpts, optsLive] = useRemembered("extract-pdf-pages", defaults, check);
  const field = useRef<RangeFieldHandle>(null);

  const errorText = s.errorText;

  // A file with none of the typed pages is skipped, and a notice names it (§5, AC-460).
  const skippedKey = s.count > 0 && s.files.length > 1 ? s.empty.map((f) => f.name).join("\n") : "";
  const notice = useRef<string | null>(null);
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    if (notice.current) api.dismissNotice(notice.current);
    notice.current = null;
    if (skippedKey) {
      const names = skippedKey.split("\n");
      notice.current = api.pushNotice({ tone: "info", title: names.length === 1 ? selectCopy.skipped(names[0]) : c.skippedTitle, items: names.length > 1 ? names.map(selectCopy.skipped) : undefined });
    }
  }, [skippedKey]);

  const changed = (opts.pattern !== c.defaultPattern ? 1 : 0) + (opts.removeBookmarks ? 1 : 0);

  // The planner is only needed for the run (kept out of the first load, spec UI P-12).
  const process: ProcessFn = async (files, signal, onProgress) => {
    // The selection as typed (eval G-3): read live, not from this render.
    const now = s.current();
    if (now.errorText) throw new Error(USER_ERROR + now.errorText);
    const { planExtract } = await import("@/lib/page-plans");
    const run = planExtract(planFiles(files), now.state.sets, { pattern: optsLive.current.pattern });
    const { runPlan } = await import("@/components/page-select/job");
    return runPlan("extract", run, files, optsLive.current.removeBookmarks, signal, onProgress);
  };
  /** Enter in the field: run when the pages as typed pick something. */
  const submit = () => {
    const now = s.current();
    if (now.errorText) return field.current?.shake();
    if (now.count > 0) apiRef.current?.submit();
  };

  return (
    <ToolFlow
      tool={tool}
      apiRef={apiRef}
      process={process}
      onFilesChange={s.onFilesChange}
      onReset={s.reset}
      canRun={() => (s.error ? c.status(s.count, s.total) : s.count === 0 ? c.statusEmpty : true)}
      readyStatus={() => c.status(s.count, s.total)}
      primaryLabel={() => c.primary(s.count)}
      gridHint={c.gridHint}
      decoratePage={(file, index) => {
        const picked = (s.state.sets[file.id] ?? []).includes(index);
        return { pendingDelta: 0, inScope: picked, picked, pressed: picked, label: c.tile(index + 1, file.pageCount) };
      }}
      onTileActivate={(file, index, mods) => s.activate(file.id, index, mods.shift)}
      onPageKey={(_file, _index, key, e) => {
        if (key === "Escape") {
          s.clear();
          return true;
        }
        if ((key === "a" || key === "A") && (e?.ctrlKey || e?.metaKey)) {
          s.selectAll();
          return true;
        }
        return false;
      }}
      renderMore={(ctx) => (
        <MoreOptions
          changed={changed}
          disabled={ctx.disabled}
          content={{
            pattern: { value: opts.pattern, onChange: (pattern) => setOpts({ pattern }) },
            bookmarks: { value: opts.removeBookmarks, onChange: (removeBookmarks) => setOpts({ removeBookmarks }) },
          }}
        />
      )}
      renderOptions={() => (
        // Below 400 px the field gets its own row under the pills, so it stays usable (P-5).
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-3.5 max-sm:flex-1 max-[399px]:flex-wrap">
          <Step n={1}>{c.step}</Step>
          <SegmentedControl
            look="tiles"
            label={c.pick}
            value={s.state.pick}
            options={picks}
            onChange={(v) => (v === "custom" ? s.custom() : s.quickPick(v))}
            fullWidth
            className="shrink-0 dock-bar:w-auto dock-bar:gap-2.5 max-sm:dock-bar:[&>button]:px-2"
          />
          <RangeField
            ref={field}
            label={c.field}
            value={s.state.text}
            placeholder={c.placeholder}
            differs={s.state.differs}
            error={errorText}
            clearLabel={selectCopy.clearSelection}
            canClear={s.count > 0 || !!s.state.text}
            onChange={s.type}
            onBlur={s.blur}
            onClear={s.clear}
            onEnter={submit}
            className="min-w-0 flex-1 dock-bar:lg:max-xl:max-w-[190px] dock-bar:xl:flex-none dock-bar:xl:max-[1439px]:w-[220px] dock-bar:min-[1440px]:w-[300px] max-[399px]:basis-full"
          />
        </div>
      )}
    />
  );
}
