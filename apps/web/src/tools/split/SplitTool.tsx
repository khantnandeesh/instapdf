"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { selectCopy } from "@/components/page-select/copy";
import { planFiles, useDebouncedAnnounce, useLazyModule, useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { RangeField } from "@/components/page-select/RangeField";
import type { SelFile } from "@/components/page-select/selection";
import { Step, StripGlyph } from "@/components/page-select/Step";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, LoadedFile, ProcessFn } from "@/components/tool-flow/types";
import { ScissorsIcon } from "@/components/ui/icons";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { flowTool } from "@/tools/registry";
import { splitCopy as c } from "./copy";
import { clearParts, DEFAULT_N, DEFAULT_PATTERN, initialSplit, setKind as withKind, setN, typeParts, type SplitKind, type SplitState } from "./state";

// The rules and the engine planner arrive after hydration (spec UI P-12); no file is ready before.
const loadModel = () => import("./model");

const tool = flowTool("split-pdf");

type Remembered = { kind: SplitKind; nText: string; pattern: string; removeBookmarks: boolean };
const defaults: Remembered = { kind: "every", nText: DEFAULT_N, pattern: DEFAULT_PATTERN, removeBookmarks: false };
const KINDS: SplitKind[] = ["every", "everyN", "spreads", "custom"];
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(KINDS.includes(s.kind as SplitKind) ? { kind: s.kind as SplitKind } : {}),
  ...(typeof s.nText === "string" && /^\d{1,4}$/.test(s.nText) ? { nText: s.nText } : {}),
  ...(typeof s.pattern === "string" ? { pattern: s.pattern } : {}),
  ...(typeof s.removeBookmarks === "boolean" ? { removeBookmarks: s.removeBookmarks } : {}),
});

const modes = [
  { value: "every" as const, label: c.every, icon: <StripGlyph groups={[1, 1, 1]} /> },
  {
    value: "everyN" as const,
    label: c.everyN,
    icon: <StripGlyph groups={[2, 2]} />,
    // The tile reads "Every N" on one line, in the bar and the side panel (P-5; visual gate round 2): the
    // stepper of step 2 says what N is. The accessible name stays "Every N pages".
    node: (
      <>
        {c.everyNShort}
        <span className="sr-only">{c.everyNRest}</span>
      </>
    ),
  },
  { value: "spreads" as const, label: c.spreads, title: c.spreadsTip, icon: <StripGlyph groups={[1, 2, 1]} /> },
  { value: "custom" as const, label: c.custom, icon: <StripGlyph groups={[1, 3]} filled={[true, true, false, true]} /> },
];

/** Split (spec F4/F5 §3b, §6a; UI P-5, P-6): one file per part; the grid shows the parts live. */
export function SplitTool() {
  const m = useLazyModule(loadModel);
  const apiRef = useRef<FlowApi | null>(null);
  const announce = useDebouncedAnnounce(apiRef);
  const selectId = useId();
  const [files, setFiles] = useState<SelFile[]>([]);
  const [split, setSplit] = useState<SplitState>(initialSplit);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [opts, setOpts] = useRemembered("split-pdf", defaults, check, (stored) =>
    setSplit((s) => ({ ...s, ...(stored.kind ? { kind: stored.kind } : {}), ...(stored.nText ? { nText: stored.nText } : {}) })),
  );
  const user = useRef(false);

  const onFilesChange = useCallback((all: LoadedFile[]) => {
    const next = planFiles(all);
    setFiles((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  const change = (next: SplitState) => {
    user.current = true;
    setSplit(next);
  };
  const setKind = (kind: SplitKind) => {
    change(withKind(split, kind));
    setOpts({ kind });
  };

  const problem = m ? m.splitProblem(split, files) : null;
  const plan = useMemo(() => (m ? m.splitPlan(split, files, { pattern: opts.pattern, renames }) : null), [m, split, files, opts.pattern, renames]);
  const live = useMemo(() => Object.fromEntries(files.map((f) => [f.id, m ? m.partsOf(split, f, files) : null])), [m, split, files]);
  // While the typed parts don't parse, the grid draws no parts and no marks (the bubble says what is wrong):
  // no tile claims a part that the text does not make, and marks would do nothing (visual gate round 2).
  const invalid = !!problem && "field" in problem;
  const parts = live;
  const pageParts = useMemo(() => (m ? Object.fromEntries(files.map((f) => [f.id, m.pageParts(parts[f.id] ?? null, f.pageCount)])) : {}), [m, parts, files]);
  const total = files.reduce((n, f) => n + f.pageCount, 0);
  const docCount = plan?.documents.length ?? 0;
  const used = m ? m.pagesUsed(plan) : 0;

  // "3 files" after the user's own changes (P-8), not when files arrive.
  useEffect(() => {
    if (!user.current) return;
    user.current = false;
    if (plan && files.length) announce(c.live(docCount));
  }, [plan, docCount, files.length, announce]);

  const fieldError = m && problem && "field" in problem ? m.rangeErrorText(problem.field, files.map((f) => f.pageCount)) : null;
  const changed = (opts.pattern !== DEFAULT_PATTERN ? 1 : 0) + (opts.removeBookmarks ? 1 : 0) + (plan?.documents.some((d) => d.key in renames) ? 1 : 0);

  const process: ProcessFn = async (ready, signal, onProgress) => {
    const run = (m ?? (await loadModel())).splitPlan(split, planFiles(ready), { pattern: opts.pattern, renames });
    if (!run) throw new Error("Split settings are invalid");
    const { runPlan } = await import("@/components/page-select/job");
    return runPlan("split", run, ready, opts.removeBookmarks, signal, onProgress);
  };

  return (
    <ToolFlow
      tool={tool}
      apiRef={apiRef}
      process={process}
      onFilesChange={onFilesChange}
      onReset={() => {
        setSplit((s) => ({ ...initialSplit(), kind: s.kind, nText: s.nText }));
        setRenames({});
      }}
      canRun={() => (problem || !plan || !docCount ? c.statusPages(total) : true)}
      readyStatus={() => (used < total ? c.statusLeftOut(used, total, docCount) : c.status(total, docCount))}
      primaryLabel={() => c.primary(docCount)}
      decoratePage={(file, index) => {
        if (invalid) return { pendingDelta: 0, inScope: false };
        const p = pageParts[file.id]?.[index];
        const count = parts[file.id]?.length ?? 0;
        if (p === undefined) return { pendingDelta: 0, inScope: false };
        return p
          ? { pendingDelta: 0, inScope: false, part: { n: p.part, first: p.first }, leftOut: false, label: c.tile(index + 1, p.part, count) }
          : { pendingDelta: 0, inScope: false, leftOut: true, label: c.tileLeftOut(index + 1) };
      }}
      renderGap={(file, index, tabIndex, busy) => {
        // Marks are off while the flow is busy (processing, result).
        if (!m || busy || invalid || index >= file.pageCount - 1) return null;
        const state = m.markAfter(parts[file.id] ?? null, index);
        if (state === "hidden") return null;
        const on = state === "on";
        return (
          <>
            {on && <span aria-hidden="true" className="ip-cut" data-testid="cut-line" />}
            <span className="ip-split-slot">
              <button
                type="button"
                className="ip-split-mark"
                aria-pressed={on}
                aria-label={c.mark(index + 1)}
                title={c.mark(index + 1)}
                tabIndex={tabIndex}
                data-testid="split-mark"
                onClick={() => {
                  change(m.toggleMark(split, files, file.id, index));
                  setOpts({ kind: "custom" });
                }}
              >
                <ScissorsIcon size={16} />
              </button>
            </span>
          </>
        );
      }}
      renderMore={(ctx) => (
        <MoreOptions
          changed={changed}
          disabled={ctx.disabled}
          content={{
            parts: plan
              ? { rows: plan.documents.map((d, i) => ({ key: d.key, n: i + 1, name: d.name, range: d.range })), onRename: (key, name) => setRenames((r) => ({ ...r, [key]: name })) }
              : { rows: [], onRename: () => {} },
            pattern: { value: opts.pattern, onChange: (pattern) => setOpts({ pattern }) },
            bookmarks: { value: opts.removeBookmarks, onChange: (removeBookmarks) => setOpts({ removeBookmarks }) },
          }}
        />
      )}
      renderOptions={() => (
          <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-7 max-sm:flex-1">
            <div className="flex shrink-0 flex-col gap-3.5">
              <Step n={1}>{c.mode}</Step>
              <SegmentedControl
                look="tiles"
                label={c.mode}
                value={split.kind}
                options={modes}
                onChange={setKind}
                fullWidth
                className="max-lg:hidden dock-side:grid-flow-row dock-side:grid-cols-2 dock-bar:w-auto dock-bar:auto-cols-max dock-bar:gap-1.5"
              />
              {/* Below 1024 px the four pills don't fit beside a field: a native select (one tap on touch). */}
              <div className="w-[150px] max-sm:w-[130px] lg:hidden">
                <Select id={selectId} label={c.mode} hideLabel value={split.kind} options={modes.map((o) => ({ value: o.value, label: o.value === "everyN" ? c.everyNShort : o.label }))} onChange={setKind} />
              </div>
            </div>
            {/* Step 2, when the mode has one. The side panel is the empty state, where the options wait for a file
                (disabled), so nothing switches there and no slot is reserved: the panel fits --ip-work-h with More
                options right under the steps (visual gate round 2). In the bar the row keeps its place. */}
            <div className="flex min-w-0 flex-1 flex-col gap-3.5 empty:hidden dock-bar:flex-row dock-bar:items-center">
              {split.kind === "everyN" && (
                <>
                  <Step n={2}>{c.perFile}</Step>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span aria-hidden="true" className="hidden text-sm font-semibold whitespace-nowrap text-ink xl:dock-bar:inline">
                      {c.perFile}
                    </span>
                    <NumberStepper
                      value={split.nText}
                      onChange={(nText) => {
                        change(setN(split, nText));
                        if (/^\d{1,4}$/.test(nText.trim())) setOpts({ nText: nText.trim() });
                      }}
                      label={c.perFile}
                      decLabel={c.fewer}
                      incLabel={c.more}
                      error={selectCopy.stepperError}
                    />
                  </div>
                </>
              )}
              {split.kind === "custom" && (
                <>
                  <Step n={2}>{c.parts}</Step>
                  <RangeField
                    label={c.parts}
                    value={split.text}
                    placeholder={c.placeholder}
                    differs={split.differs}
                    error={fieldError}
                    clearLabel={selectCopy.clearParts}
                    canClear={!!split.text || Object.keys(split.perFile).length > 0}
                    onChange={(text) => change(typeParts(split, text))}
                    onBlur={() => setSplit((s) => (m ? m.blurParts(s, files) : s))}
                    onClear={() => change(clearParts(split))}
                    className="min-w-0 flex-1 dock-bar:lg:w-[190px] dock-bar:lg:flex-none dock-bar:xl:w-[300px]"
                  />
                </>
              )}
            </div>
          </div>
      )}
    />
  );
}
