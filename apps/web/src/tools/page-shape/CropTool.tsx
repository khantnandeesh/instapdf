"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLazyModule, useLiveState, useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, LoadedFile, ProcessFn } from "@/components/tool-flow/types";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { Area } from "@/lib/pdf/area";
import { USER_ERROR } from "@/lib/pdf/user-error";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { cropCopy as c } from "./copy";

const tool = flowTool("crop-pdf");

const loadTrim = () => import("@/lib/pdf/trim");
const loadDialog = () => import("./CropAreaDialog");
type DialogModule = Awaited<ReturnType<typeof loadDialog>>;

type Mode = "auto" | "area";
type Remembered = { mode: Mode; sameSize: boolean };
const defaults: Remembered = { mode: "auto", sameSize: true };
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(s.mode === "auto" || s.mode === "area" ? { mode: s.mode } : {}),
  ...(typeof s.sameSize === "boolean" ? { sameSize: s.sameSize } : {}),
});
const MODES: { value: Mode; label: string }[] = [
  { value: "auto", label: c.auto },
  { value: "area", label: c.area },
];

/** Pages are measured on a picture this many CSS px on its longer side: half a percent of the page per pixel, or finer. */
const MEASURE = 220;
/** Where the box starts in the dialog: the page less a tenth on every side. */
const FIRST_AREA: Area = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
const whole = (a: Area) => a.x <= 0.001 && a.y <= 0.001 && a.w >= 0.998 && a.h >= 0.998;

type Measured = Record<string, (Area | undefined)[]>;

/**
 * Crop (spec F8 §3): trim the white margins in one click, or drag a box around what should stay.
 * Trim measures every page from its picture; the pages on screen show what will be left before the run.
 */
export function CropTool() {
  const apiRef = useRef<FlowApi | null>(null);
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const trim = useLazyModule(loadTrim);
  const [loaded, setLoaded] = useState<LoadedFile[]>([]);
  const [area, setArea, areaLive] = useLiveState<Area | null>(null);
  const [measured, setMeasured, measuredLive] = useLiveState<Measured>({});
  const [open, setOpen] = useState(false);
  const [areaDialog, setAreaDialog] = useState<DialogModule | null>(null);

  const onFilesChange = useCallback((all: LoadedFile[]) => {
    const ready = all.filter((f) => f.status === "ready");
    setLoaded((prev) => (prev.length === ready.length && prev.every((f, i) => f.id === ready[i].id) ? prev : ready));
  }, []);

  /** One page's ink box, from a small picture of the page. */
  const measure = useCallback(
    (fileId: string, index: number, done: (area: Area) => void, background: boolean) => {
      const api = apiRef.current;
      if (!api || !trim) return () => {};
      return api.renderPage(
        fileId,
        index,
        MEASURE,
        (drawn) => {
          // Copied to a canvas of our own: the renderer's may not hand out its pixels.
          const copy = document.createElement("canvas");
          copy.width = drawn.width;
          copy.height = drawn.height;
          const ctx = copy.getContext("2d", { willReadFrequently: true });
          ctx?.drawImage(drawn, 0, 0);
          done(ctx ? trim.contentArea(ctx.getImageData(0, 0, copy.width, copy.height).data, copy.width, copy.height) : { x: 0, y: 0, w: 1, h: 1 });
          copy.width = 0;
        },
        background,
      );
    },
    [trim],
  );

  // Trim margins: every page is measured once, one after the other, behind the pages on screen.
  useEffect(() => {
    if (opts.mode !== "auto" || !trim) return;
    const todo = loaded.flatMap((f) => Array.from({ length: f.pageCount }, (_, i) => [f.id, i] as const)).filter(([id, i]) => !measuredLive.current[id]?.[i]);
    let stop = false;
    let cancel = () => {};
    let k = 0;
    // Results are shown in batches, so a long file does not redraw the grid once per page.
    let batch: [string, number, Area][] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const add = batch;
      batch = [];
      setMeasured((m) => {
        const next = { ...m };
        for (const [id, i, a] of add) {
          next[id] = [...(next[id] ?? [])];
          next[id][i] = a;
        }
        return next;
      });
    };
    const next = () => {
      if (stop) return;
      if (k >= todo.length) return void (batch.length && flush());
      const [id, i] = todo[k++];
      cancel = measure(
        id,
        i,
        (a) => {
          batch.push([id, i, a]);
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
  }, [opts.mode, trim, loaded, measure, measuredLive, setMeasured]);

  const total = loaded.reduce((n, f) => n + f.pageCount, 0);
  const done = loaded.reduce((n, f) => n + (measured[f.id]?.filter(Boolean).length ?? 0), 0);
  const allMeasured = total > 0 && done === total;

  /** What stays of each page, per file: the chosen box, each page's own ink box, or one box that holds every page's ink. */
  const areas = useMemo(() => {
    const out: Record<string, (Area | undefined)[]> = {};
    for (const f of loaded) {
      if (opts.mode === "area") out[f.id] = Array.from({ length: f.pageCount }, () => area ?? undefined);
      else if (!opts.sameSize || !trim) out[f.id] = measured[f.id] ?? [];
      else {
        // One crop for the file needs every page measured first: a page not seen yet could reach further out.
        const list = measured[f.id] ?? [];
        const complete = list.filter(Boolean).length === f.pageCount;
        const union = complete ? trim.unionArea(list as Area[]) : undefined;
        out[f.id] = Array.from({ length: f.pageCount }, () => union);
      }
    }
    return out;
  }, [loaded, opts.mode, opts.sameSize, area, measured, trim]);
  const areasLive = useRef(areas);
  areasLive.current = areas;
  const cropped = loaded.reduce((n, f) => n + (areas[f.id]?.filter((a) => a && !whole(a)).length ?? 0), 0);

  const process: ProcessFn = async (files, signal, onProgress) => {
    const now = areasLive.current;
    if (optsLive.current.mode === "area" && !areaLive.current) throw new Error(USER_ERROR + c.needsArea);
    const out = await runInWorker(
      {
        kind: "crop",
        zipName: tool.flow.outputName?.(files.map((f) => f.name)) ?? "",
        files: files.map((f) => ({ name: f.name, source: f.source, password: f.password, areas: Object.fromEntries((now[f.id] ?? []).flatMap((a, i) => (a ? [[i, a]] : []))) })),
      },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };

  return (
    <>
      <ToolFlow
        tool={tool}
        apiRef={apiRef}
        process={process}
        onFilesChange={onFilesChange}
        onReset={() => {
          setArea(null);
          setMeasured({});
        }}
        canRun={() => {
          if (opts.mode === "area") return area ? (whole(area) ? c.nothing : true) : c.needsArea;
          if (!allMeasured) return c.measuring(done, total);
          return cropped ? true : c.nothing;
        }}
        readyStatus={() => c.status(cropped)}
        decoratePage={(file, index) => {
          const keep = areas[file.id]?.[index];
          return { pendingDelta: 0, inScope: false, ...(keep && !whole(keep) ? { keep } : {}) };
        }}
        renderMore={(ctx) => (
          <MoreOptions
            changed={opts.sameSize ? 0 : 1}
            disabled={ctx.disabled || opts.mode === "area"}
            content={{ toggles: [{ id: "same", label: c.sameSize, value: opts.sameSize, onChange: (sameSize) => setOpts({ sameSize }) }] }}
          />
        )}
        renderOptions={() => (
          <div className="flex min-w-0 items-center gap-3 max-sm:flex-1">
            <SegmentedControl look="tabs" label={c.mode} value={opts.mode} options={MODES} onChange={(mode) => setOpts({ mode })} className="shrink-0" />
            {/* Always in place, so nothing beside it moves when the mode changes. */}
            <Button
              variant="line"
              className={cx("max-sm:min-w-0 max-sm:flex-1", opts.mode !== "area" && "invisible")}
              aria-hidden={opts.mode !== "area" || undefined}
              tabIndex={opts.mode === "area" ? undefined : -1}
              data-testid="choose-area"
              onClick={() => {
                setArea((a) => a ?? FIRST_AREA);
                setOpen(true);
                if (!areaDialog) void loadDialog().then(setAreaDialog);
              }}
            >
              {area ? c.change : c.choose}
            </Button>
          </div>
        )}
      />
      {areaDialog && area && (
        <areaDialog.CropAreaDialog
          open={open}
          onClose={() => setOpen(false)}
          file={loaded[0]}
          api={apiRef.current}
          area={area}
          onChange={setArea}
          onFit={(index) => loaded[0] && measure(loaded[0].id, index, setArea, false)}
        />
      )}
    </>
  );
}
