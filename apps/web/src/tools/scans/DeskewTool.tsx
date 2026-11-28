"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLazyModule, useLiveState, useRemembered } from "@/components/page-select/hooks";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, LoadedFile, ProcessFn } from "@/components/tool-flow/types";
import { RangeField } from "@/components/page-select/RangeField";
import { rangeErrorText } from "@/components/page-select/range-errors";
import { Switch } from "@/components/ui/Switch";
import { selectedPages, validatePageRanges } from "@/lib/page-ranges";
import { formatTilt } from "@/lib/pdf/tilt-text";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { deskewCopy as c } from "./copy";

const tool = flowTool("deskew-pdf");

const loadSkew = () => import("@/lib/pdf/skew");
const loadDialog = () => import("./StraightenDialog");
type DialogModule = Awaited<ReturnType<typeof loadDialog>>;

type Remembered = { strongOnly: boolean };
const defaults: Remembered = { strongOnly: false };
const check = (s: Record<string, unknown>): Partial<Remembered> => (typeof s.strongOnly === "boolean" ? { strongOnly: s.strongOnly } : {});

/** Pages are measured on a picture this many CSS px on its longer side: a tenth of a degree is then about a pixel across the page. */
const MEASURE = 800;
/** A tilt under this is the scanner's noise, not a tilt: the page is left alone. */
const LEAST = 0.2;
/** "Strongly tilted": what the option keeps. */
const STRONG = 1;

/** Turns by page, per file. */
type Turns = Record<string, (number | undefined)[]>;

/**
 * Deskew (spec F15 §1): every page is measured from its picture as soon as the file is in, and the
 * pages on screen are shown straightened before the run. A click on a page opens it with a slider
 * to set its turn by hand.
 */
export function DeskewTool() {
  const apiRef = useRef<FlowApi | null>(null);
  const [opts, setOpts] = useRemembered(tool.slug, defaults, check);
  const skew = useLazyModule(loadSkew);
  const [loaded, setLoaded] = useState<LoadedFile[]>([]);
  const [found, setFound, foundLive] = useLiveState<Turns>({});
  const [manual, setManual] = useState<Turns>({});
  /** "Only these pages": the pages whose found tilt is corrected. Empty means every page. */
  const [only, setOnly] = useState("");
  const [open, setOpen] = useState<{ fileId: string; index: number } | null>(null);
  const [shown, setShown] = useState(false);
  const [straighten, setStraighten] = useState<DialogModule | null>(null);

  const onFilesChange = useCallback((all: LoadedFile[]) => {
    const ready = all.filter((f) => f.status === "ready");
    setLoaded((prev) => (prev.length === ready.length && prev.every((f, i) => f.id === ready[i].id) ? prev : ready));
  }, []);

  // Every page is measured once, one after the other, behind the pages on screen.
  useEffect(() => {
    const api = apiRef.current;
    if (!skew || !api) return;
    const todo = loaded.flatMap((f) => Array.from({ length: f.pageCount }, (_, i) => [f.id, i] as const)).filter(([id, i]) => foundLive.current[id]?.[i] === undefined);
    let stop = false;
    let cancel = () => {};
    let k = 0;
    // Results are shown in batches, so a long file does not redraw the grid once per page.
    let batch: [string, number, number][] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const add = batch;
      batch = [];
      setFound((m) => {
        const next = { ...m };
        for (const [id, i, turn] of add) {
          next[id] = [...(next[id] ?? [])];
          next[id][i] = turn;
        }
        return next;
      });
    };
    const next = () => {
      if (stop) return;
      if (k >= todo.length) return void (batch.length && flush());
      const [id, i] = todo[k++];
      cancel = api.renderPage(
        id,
        i,
        MEASURE,
        (drawn) => {
          // Copied to a canvas of our own: the renderer's may not hand out its pixels.
          const copy = document.createElement("canvas");
          copy.width = drawn.width;
          copy.height = drawn.height;
          const ctx = copy.getContext("2d", { willReadFrequently: true });
          ctx?.drawImage(drawn, 0, 0);
          // The page is tilted clockwise by `angle`: the turn that straightens it is the same size the other way.
          const turn = ctx ? -skew.estimateSkew(ctx.getImageData(0, 0, copy.width, copy.height).data, copy.width, copy.height).angle || 0 : 0;
          copy.width = 0;
          batch.push([id, i, turn]);
          timer ??= setTimeout(flush, 150);
          next();
        },
        true,
      );
    };
    next();
    return () => {
      stop = true;
      cancel();
      clearTimeout(timer);
      if (batch.length) flush();
    };
  }, [skew, loaded, foundLive, setFound]);

  const counts = useMemo(() => loaded.map((f) => f.pageCount), [loaded]);
  const range = useMemo(() => (only.trim() ? validatePageRanges(only, counts) : null), [only, counts]);
  const rangeError = range && !range.ok ? rangeErrorText(range.error, counts) : null;

  /** The turn each page will get: the one set by hand, else the one found when it is large enough to count and the page is among those asked for. */
  const turns = useMemo(() => {
    const least = opts.strongOnly ? STRONG : LEAST;
    const out: Record<string, number[]> = {};
    for (const f of loaded) {
      const asked = range?.ok ? new Set(selectedPages(range.items, f.pageCount)) : null;
      out[f.id] = Array.from({ length: f.pageCount }, (_, i) => {
        const hand = manual[f.id]?.[i];
        if (hand !== undefined) return hand;
        if (asked && !asked.has(i)) return 0;
        const auto = found[f.id]?.[i] ?? 0;
        return Math.abs(auto) >= least - 1e-9 ? auto : 0;
      });
    }
    return out;
  }, [loaded, found, manual, opts.strongOnly, range]);
  const turnsLive = useRef(turns);
  turnsLive.current = turns;

  const total = loaded.reduce((n, f) => n + f.pageCount, 0);
  const done = loaded.reduce((n, f) => n + Array.from({ length: f.pageCount }, (_, i) => i).filter((i) => found[f.id]?.[i] !== undefined || manual[f.id]?.[i] !== undefined).length, 0);
  const turned = loaded.reduce((n, f) => n + (turns[f.id]?.filter(Boolean).length ?? 0), 0);

  const process: ProcessFn = async (files, signal, onProgress) => {
    const now = turnsLive.current;
    const out = await runInWorker(
      {
        kind: "deskew",
        zipName: tool.flow.outputName?.(files.map((f) => f.name)) ?? "",
        files: files.map((f) => ({ name: f.name, source: f.source, password: f.password, turns: Object.fromEntries((now[f.id] ?? []).flatMap((t, i) => (t ? [[i, t]] : []))) })),
      },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };

  const file = loaded.find((f) => f.id === open?.fileId);
  return (
    <>
      <ToolFlow
        tool={tool}
        apiRef={apiRef}
        process={process}
        onFilesChange={onFilesChange}
        onReset={() => {
          setFound({});
          setManual({});
          setOnly("");
          setOpen(null);
        }}
        canRun={() => {
          if (rangeError) return rangeError;
          if (turned) return true;
          return done < total ? c.measuring(done, total) : c.nothing;
        }}
        readyStatus={() => (done < total ? c.measuring(done, total) : turned ? c.status(turned) : c.nothing)}
        gridHint={c.gridHint}
        decoratePage={(f, index) => {
          const tilt = turns[f.id]?.[index] ?? 0;
          return { pendingDelta: 0, inScope: false, tilt, badge: formatTilt(tilt), label: c.tile(index + 1, f.pageCount, tilt) };
        }}
        onTileActivate={(f, index) => {
          setOpen({ fileId: f.id, index });
          setShown(true);
          if (!straighten) void loadDialog().then(setStraighten);
        }}
        renderOptions={() => (
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 dock-bar:flex-1">
            <Switch id="deskew-strong" label={c.strongOnly} ariaLabel={c.strongOnlyName} checked={opts.strongOnly} onChange={(strongOnly) => setOpts({ strongOnly })} />
            <RangeField
              label={c.only}
              value={only}
              placeholder={c.onlyPlaceholder}
              error={rangeError}
              clearLabel={c.onlyClear}
              canClear={!!only}
              onChange={setOnly}
              onBlur={() => {}}
              onClear={() => setOnly("")}
              onEnter={() => !rangeError && turned > 0 && apiRef.current?.submit()}
              className="min-w-0 flex-1 dock-bar:lg:max-w-[220px]"
              testId="deskew-only"
            />
          </div>
        )}
      />
      {straighten && open && (
        <straighten.StraightenDialog
          open={shown && !!file}
          onClose={() => setShown(false)}
          file={file}
          api={apiRef.current}
          startAt={open.index}
          turnOf={(i) => turns[open.fileId]?.[i] ?? 0}
          detected={(i) => found[open.fileId]?.[i]}
          byHand={(i) => manual[open.fileId]?.[i] !== undefined}
          onTurn={(i, turn) =>
            setManual((m) => {
              const list = [...(m[open.fileId] ?? [])];
              list[i] = turn;
              return { ...m, [open.fileId]: list };
            })
          }
        />
      )}
    </>
  );
}
