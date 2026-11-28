"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { selectCopy } from "@/components/page-select/copy";
import { planFiles, useDebouncedAnnounce, useLazyModule, useLiveState, useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { RangeField, type RangeFieldHandle } from "@/components/page-select/RangeField";
import type { SelFile } from "@/components/page-select/selection";
import { Step, StripGlyph } from "@/components/page-select/Step";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, LoadedFile, ProcessFn } from "@/components/tool-flow/types";
import { ScissorsIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import type { Area } from "@/lib/pdf/area";
import type { OutlineEntry, OutlineParts } from "@/lib/pdf/split-outline";
import type { TextPoint } from "@/lib/pdf/split-text";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { flowTool } from "@/tools/registry";
import { splitCopy as c, splitTextCopy as t } from "./copy";
import { clearParts, DEFAULT_N, DEFAULT_PATTERN, initialSplit, setKind as withKind, setN, typeParts, type SplitKind, type SplitState } from "./state";

// The rules and the engine planner arrive after hydration (spec UI P-12); no file is ready before.
const loadModel = () => import("./model");
const loadOutline = () => import("@/lib/pdf/split-outline");
type OutlineModule = Awaited<ReturnType<typeof loadOutline>>;
const loadText = () => import("@/lib/pdf/split-text");
type TextModule = Awaited<ReturnType<typeof loadText>>;
const loadAreaDialog = () => import("./TextAreaDialog");
type AreaDialogModule = Awaited<ReturnType<typeof loadAreaDialog>>;
/** Where the box starts when the dialog first opens: the top left, where a document number usually is. */
const FIRST_AREA: Area = { x: 0.05, y: 0.04, w: 0.5, h: 0.1 };
const noModule = () => Promise.resolve(null);

/** The same workspace, with the parts worked out for the person (spec F7): they can still move any mark. */
export type SplitVariant = "bookmarks" | "text";
const SLUG = { bookmarks: "split-pdf-by-bookmarks", text: "split-pdf-by-text" } as const;

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
export function SplitTool({ variant }: { variant?: SplitVariant } = {}) {
  const tool = flowTool(variant ? SLUG[variant] : "split-pdf");
  const m = useLazyModule(loadModel);
  // The outline module names the parts for both variants (`titleAsName`).
  const o = useLazyModule<OutlineModule | null>(variant ? loadOutline : noModule);
  const tx = useLazyModule<TextModule | null>(variant === "text" ? loadText : noModule);
  const apiRef = useRef<FlowApi | null>(null);
  const announce = useDebouncedAnnounce(apiRef);
  const selectId = useId();
  const [files, setFiles, filesLive] = useLiveState<SelFile[]>([]);
  // Live state (eval G-3): the run and Enter read the parts as typed, even before React shows them.
  const [split, setSplit, splitLive] = useLiveState<SplitState>(() => (variant ? { ...initialSplit(), kind: "custom" } : initialSplit()));
  const [renames, setRenames] = useLiveState<Record<string, string>>({});
  const partsField = useRef<RangeFieldHandle>(null);
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check, (stored) => {
    // A variant always works in Custom: its parts are marks the person can move.
    if (!variant) setSplit((s) => ({ ...s, ...(stored.kind ? { kind: stored.kind } : {}), ...(stored.nText ? { nText: stored.nText } : {}) }));
  });
  const user = useRef(false);

  const [loaded, setLoaded] = useState<LoadedFile[]>([]);
  const onFilesChange = useCallback((all: LoadedFile[]) => {
    const next = planFiles(all);
    setFiles((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    if (variant) setLoaded(all.filter((f) => f.status === "ready"));
  }, [setFiles, variant]);

  // Split by bookmarks: each file's bookmarks, read once; the level and the title filter make the parts.
  const [outlines, setOutlines] = useState<Record<string, OutlineEntry[]>>({});
  const [level, setLevel] = useState(1);
  const [contains, setContains] = useState("");
  const levelId = useId();
  const containsId = useId();
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (variant !== "bookmarks" || !o) return;
    for (const f of loaded) {
      if (asked.current.has(f.id)) continue;
      asked.current.add(f.id);
      void o.readOutline(f.source, f.password).then(
        (entries) => setOutlines((all) => ({ ...all, [f.id]: entries })),
        () => setOutlines((all) => ({ ...all, [f.id]: [] })),
      );
    }
  }, [variant, o, loaded]);
  const outlineReady = variant === "bookmarks" && !!o && files.length > 0 && files.every((f) => outlines[f.id]);
  const entries = useMemo(() => files.flatMap((f) => outlines[f.id] ?? []), [files, outlines]);
  const depth = o ? o.outlineDepth(entries) : 0;
  const shownLevel = Math.min(level, Math.max(1, depth));

  // Split by text: each file's text points, read once; the area makes the parts.
  const [points, setPoints] = useState<Record<string, TextPoint[][]>>({});
  const [area, setArea] = useState<Area | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaDialog, setAreaDialog] = useState<AreaDialogModule | null>(null);
  useEffect(() => {
    if (variant !== "text" || !tx) return;
    for (const f of loaded) {
      if (asked.current.has(f.id)) continue;
      asked.current.add(f.id);
      void tx.readPagePoints(f.source, f.password).then(
        (pages) => setPoints((all) => ({ ...all, [f.id]: pages })),
        () => setPoints((all) => ({ ...all, [f.id]: [] })),
      );
    }
  }, [variant, tx, loaded]);
  const textReady = variant === "text" && !!tx && files.length > 0 && files.every((f) => points[f.id]);
  const texts = useMemo(
    () => (textReady && tx && area ? Object.fromEntries(files.map((f) => [f.id, points[f.id].map((page) => tx.textIn(page, area))])) : null),
    [textReady, tx, area, files, points],
  );

  const outlined = useMemo<Record<string, OutlineParts> | null>(() => {
    if (texts && tx) return Object.fromEntries(files.map((f) => [f.id, tx.partsFromTexts(texts[f.id], f.pageCount)]));
    return outlineReady && o ? Object.fromEntries(files.map((f) => [f.id, o.partsFromOutline(outlines[f.id], shownLevel, f.pageCount, contains)])) : null;
  }, [outlineReady, o, tx, texts, files, outlines, shownLevel, contains]);
  const areaKey = area ? `${area.x},${area.y},${area.w},${area.h}` : "";
  // Marks moved by hand stay when a file is added or removed: only a new file, or a new level or
  // filter, writes parts from the bookmarks.
  const written = useRef({ key: "", ids: new Set<string>() });
  useEffect(() => {
    if (!outlined || !m) return;
    const key = `${shownLevel}\n${contains}\n${areaKey}`;
    const before = written.current.key === key ? written.current.ids : new Set<string>();
    const ids = Object.keys(outlined);
    written.current = { key, ids: new Set(ids) };
    if (ids.every((id) => before.has(id))) return;
    setSplit((s) => {
      const perFile = Object.fromEntries(ids.map((id) => [id, before.has(id) && s.perFile[id] ? s.perFile[id] : outlined[id].parts]));
      return { ...s, kind: "custom", perFile, ...m.textForParts(perFile, filesLive.current) };
    });
  }, [outlined, m, shownLevel, contains, areaKey, setSplit, filesLive]);

  /** A user's change, worked out from the live settings (never from this render's, which may be behind). */
  const change = (fn: (s: SplitState) => SplitState) => {
    user.current = true;
    setSplit(fn);
  };
  const setKind = (kind: SplitKind) => {
    change((s) => withKind(s, kind));
    setOpts({ kind });
  };

  const problem = m ? m.splitProblem(split, files) : null;
  const live = useMemo(() => Object.fromEntries(files.map((f) => [f.id, m ? m.partsOf(split, f, files) : null])), [m, split, files]);
  // A part that starts where a bookmark does is named after it; a name the person typed wins.
  const names = useMemo(() => {
    if (!outlined || !m || !o) return renames;
    const auto: Record<string, string> = {};
    for (const f of files) {
      const r = outlined[f.id];
      const titleAt = new Map(r.parts.map((p, i) => [p[0], r.titles[i]]));
      for (const part of live[f.id] ?? []) {
        const title = o.titleAsName(titleAt.get(part[0]) ?? "");
        if (title) auto[`${f.id}:${m.formatPages(part)}`] = title;
      }
    }
    return { ...auto, ...renames };
  }, [outlined, m, o, files, live, renames]);
  const namesLive = useRef(names);
  namesLive.current = names;
  const plan = useMemo(() => (m ? m.splitPlan(split, files, { pattern: opts.pattern, renames: names }) : null), [m, split, files, opts.pattern, names]);
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
    const model = m ?? (await loadModel());
    const s = splitLive.current;
    const planned = planFiles(ready);
    const run = model.splitPlan(s, planned, { pattern: optsLive.current.pattern, renames: namesLive.current });
    if (!run) {
      const bad = model.splitProblem(s, planned);
      throw new Error(USER_ERROR + (bad && "field" in bad ? model.rangeErrorText(bad.field, planned.map((f) => f.pageCount)) : selectCopy.stepperError));
    }
    const { runPlan } = await import("@/components/page-select/job");
    return runPlan("split", run, ready, optsLive.current.removeBookmarks, signal, onProgress);
  };
  /** Enter in the Parts or N field: run when the settings as typed make files. */
  const submit = () => {
    const s = splitLive.current;
    const fs = filesLive.current;
    if (!m || !fs.length) return;
    if (m.splitProblem(s, fs)) return partsField.current?.shake();
    if (m.splitPlan(s, fs)?.documents.length) apiRef.current?.submit();
  };

  /** The title filter: in the row from 640 px, in the More options sheet on a phone (one place at a time). */
  const titleFilter = (id: string, className: string) => (
    <TextInput
      id={id}
      label={c.contains}
      hideLabel={id === containsId}
      placeholder={c.containsPlaceholder}
      value={contains}
      onChange={(v) => {
        user.current = true;
        setContains(v);
      }}
      onEnter={() => apiRef.current?.submit()}
      className={className}
    />
  );

  return (
    <>
      <ToolFlow
        tool={tool}
        apiRef={apiRef}
        process={process}
        onFilesChange={onFilesChange}
        onReset={() => {
          setSplit((s) => ({ ...initialSplit(), kind: s.kind, nText: s.nText }));
          setRenames({});
          setLevel(1);
          setContains("");
          setArea(null);
        }}
        canRun={() => {
          if (variant === "bookmarks") {
            if (!outlineReady) return c.reading;
            if (!entries.length) return c.noBookmarks(files.length);
            if (docCount <= files.length && !Object.values(outlined ?? {}).some((r) => r.titles.some(Boolean))) return c.noMatch;
          }
          if (variant === "text") {
            if (!area) return t.needsArea;
            if (!textReady) return t.reading;
            if (!Object.values(texts ?? {}).some((pages) => pages.some(Boolean))) return t.noText;
            if (docCount <= files.length && Object.values(outlined ?? {}).every((r) => r.parts.length === 1)) return t.same;
          }
          return problem || !plan || !docCount ? c.statusPages(total) : true;
        }}
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
                    change((s) => m.toggleMark(s, filesLive.current, file.id, index));
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
              ...(variant === "bookmarks" ? { extra: titleFilter(`${containsId}-more`, "sm:hidden") } : {}),
            }}
          />
        )}
        renderOptions={() =>
          variant === "text" ? (
            <Button
              variant="line"
              className="max-sm:flex-1"
              data-testid="choose-area"
              onClick={() => {
                setArea((a) => a ?? FIRST_AREA);
                setAreaOpen(true);
                if (!areaDialog) void loadAreaDialog().then(setAreaDialog);
              }}
            >
              {area ? t.change : t.choose}
            </Button>
          ) : variant === "bookmarks" ? (
            <div className="flex min-w-0 items-center gap-3 max-sm:flex-1">
              <div className="w-[200px] shrink-0 max-sm:flex-1">
                <Select
                  id={levelId}
                  label={c.level}
                  hideLabel
                  value={String(shownLevel)}
                  options={Array.from({ length: Math.max(1, depth) }, (_, i) => ({ value: String(i + 1), label: c.levelOption(i + 1, entries.filter((e) => e.level === i + 1).length) }))}
                  onChange={(v) => {
                    user.current = true;
                    setLevel(Number(v));
                  }}
                />
              </div>
  {titleFilter(containsId, "min-w-0 w-[150px] shrink max-sm:hidden")}
            </div>
          ) : (
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
                  className="max-lg:hidden dock-side:grid-flow-row dock-side:grid-cols-2 dock-bar:w-auto dock-bar:auto-cols-max dock-bar:gap-2.5 dock-bar:max-xl:hidden"
                />
                {/* Where the four pills don't fit beside a field (below 1024 px, and the row at 1024–1279, F25
                    §3.4): a native select "Split" (one tap on touch). */}
                <div className="w-[150px] max-sm:w-[130px] lg:hidden dock-bar:max-xl:block">
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
                          change((s) => setN(s, nText));
                          if (/^\d{1,4}$/.test(nText.trim())) setOpts({ nText: nText.trim() });
                        }}
                        label={c.perFile}
                        decLabel={c.fewer}
                        incLabel={c.more}
                        error={selectCopy.stepperError}
                        onEnter={submit}
                      />
                    </div>
                  </>
                )}
                {split.kind === "custom" && (
                  <>
                    <Step n={2}>{c.parts}</Step>
                    <RangeField
                      ref={partsField}
                      label={c.parts}
                      value={split.text}
                      placeholder={c.placeholder}
                      differs={split.differs}
                      error={fieldError}
                      clearLabel={selectCopy.clearParts}
                      canClear={!!split.text || Object.keys(split.perFile).length > 0}
                      onChange={(text) => change((s) => typeParts(s, text))}
                      onBlur={() => setSplit((s) => (m ? m.blurParts(s, filesLive.current) : s))}
                      onClear={() => change(clearParts)}
                      onEnter={submit}
                      className="min-w-0 flex-1 dock-bar:lg:max-xl:max-w-[190px] dock-bar:xl:flex-none dock-bar:xl:max-[1439px]:w-[180px] dock-bar:min-[1440px]:w-[300px]"
                    />
                  </>
                )}
              </div>
            </div>
          )
        }
      />
      {areaDialog && area && (
        <areaDialog.TextAreaDialog
          open={areaOpen}
          onClose={() => setAreaOpen(false)}
          file={loaded[0]}
          api={apiRef.current}
          area={area}
          onChange={(next) => {
            user.current = true;
            setArea(next);
          }}
          textAt={(index) => (tx && loaded[0] ? tx.textIn(points[loaded[0].id]?.[index] ?? [], area) : "")}
        />
      )}
    </>
  );
}
