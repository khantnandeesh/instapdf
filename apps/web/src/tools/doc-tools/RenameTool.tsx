"use client";
import { useEffect, useRef, useState } from "react";
import { useLiveState, useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { FlowApi, ProcessFn, ReadyFile, ToolOutput } from "@/components/tool-flow/types";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { Area } from "@/lib/pdf/area";
import { RENAME_PATTERN, renameAll } from "@/lib/pdf/rename";
import type { TextPoint } from "@/lib/pdf/split-text";
import { flowTool } from "@/tools/registry";
import { renameCopy as c } from "./copy";
import "./doc-tools.css";

const tool = flowTool("rename-pdf");
const loadText = () => import("@/lib/pdf/split-text");
// The dialog and its drag box are loaded when first opened (they are no part of the first load).
const loadDialog = () => import("@/components/page-edit/AreaDialog");
type DialogModule = Awaited<ReturnType<typeof loadDialog>>;
type TextModule = Awaited<ReturnType<typeof loadText>>;

/** Where a title usually is: the top of the page, across most of its width. */
const FIRST_AREA: Area = { x: 0.06, y: 0.05, w: 0.88, h: 0.12 };
type Remembered = { pattern: string };
const defaults: Remembered = { pattern: RENAME_PATTERN };
const check = (s: Record<string, unknown>): Partial<Remembered> => (typeof s.pattern === "string" && s.pattern.length <= 200 ? { pattern: s.pattern } : {});

/** Every ready file's first-page text, read once per file. Renders nothing. */
function ReadTexts({ files, onFirst, onRead }: { files: ReadyFile[]; onFirst: (first: ReadyFile | undefined) => void; onRead: (id: string, points: TextPoint[], tx: TextModule) => void }) {
  const asked = useRef(new Set<string>());
  const report = useRef(onRead);
  report.current = onRead;
  const first = files[0];
  const tellFirst = useRef(onFirst);
  tellFirst.current = onFirst;
  useEffect(() => tellFirst.current(first), [first]);
  useEffect(() => {
    for (const f of files) {
      if (asked.current.has(f.id)) continue;
      asked.current.add(f.id);
      void loadText().then(async (tx) => {
        const pages = await tx.readPagePoints(f.source, f.password, 1).catch(() => []);
        report.current(f.id, pages[0] ?? [], tx);
      });
    }
  }, [files]);
  return null;
}

/**
 * Rename by content (spec F10 §5): a box on the first page marks the text; each file is named
 * after what its own first page has there. The files themselves are not changed.
 */
export function RenameTool() {
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check);
  const [area, setArea, areaLive] = useLiveState<Area | null>(null);
  const [points, setPoints, pointsLive] = useLiveState<Record<string, TextPoint[]>>({});
  const [tx, setTx] = useState<TextModule | null>(null);
  const [first, setFirst] = useState<ReadyFile | undefined>();
  const [open, setOpen] = useState(false);
  const [areaDialog, setAreaDialog] = useState<DialogModule | null>(null);
  const apiRef = useRef<FlowApi | null>(null);

  const process: ProcessFn = async (files, signal, onProgress) => {
    const text = await loadText();
    const box = areaLive.current ?? FIRST_AREA;
    const texts: string[] = [];
    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const f = files[i];
      const page = pointsLive.current[f.id] ?? (await text.readPagePoints(f.source, f.password, 1).catch(() => []))[0] ?? [];
      texts.push(text.textIn(page, box));
      onProgress(((i + 1) / files.length) * 0.5);
    }
    const { names, kept } = renameAll(files.map((f, i) => ({ name: f.name, text: texts[i] })), optsLive.current.pattern);
    const warnings = kept.length ? [c.kept(kept.map((i) => files[i].name))] : undefined;
    if (files.length === 1) {
      const f = files[0];
      return { name: names[0], type: "application/pdf", blob: f.source, size: f.size, pageCount: f.pageCount, wasEncrypted: false, warnings } satisfies ToolOutput;
    }
    const { createZipWriter } = await import("@/lib/pdf/zip");
    const zip = createZipWriter();
    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      zip.add(names[i], new Uint8Array(await files[i].source.arrayBuffer()));
      onProgress(0.5 + ((i + 1) / files.length) * 0.5);
    }
    const blob = zip.finish();
    return { name: tool.flow.outputName?.(files.map((f) => f.name)) ?? "", type: "application/zip", blob, size: blob.size, entries: names.map((name, i) => ({ name, pageCount: files[i].pageCount })), wasEncrypted: false, warnings };
  };

  const firstText = first && tx && area && points[first.id] ? tx.textIn(points[first.id], area) : null;
  const firstName = first && firstText !== null ? renameAll([{ name: first.name, text: firstText }], opts.pattern) : null;
  const choose = (where: string) => (
    <Button variant="line" data-testid={`rename-area-${where}`} onClick={() => { setArea((a) => a ?? FIRST_AREA); setOpen(true); if (!areaDialog) void loadDialog().then(setAreaDialog); }}>
      {area ? c.change : c.choose}
    </Button>
  );
  const preview = (
    <p className="ip-doc-note ip-doc-line" aria-live="polite" data-testid="rename-preview">
      {!area ? " " : !firstName ? c.reading : firstName.kept.length ? c.noText : (<>{c.becomes} <strong className="font-semibold text-ink-black">{firstName.names[0]}</strong></>)}
    </p>
  );
  const pattern = (where: string) => (
    <>
      <TextInput id={`rename-pattern-${where}`} label={c.pattern} hideLabel value={opts.pattern} placeholder={RENAME_PATTERN} maxLength={200} onChange={(v) => setOpts({ pattern: v })} />
      <p className="ip-doc-note">{c.patternHelp}</p>
    </>
  );

  return (
    <>
      <ToolFlow
        tool={tool}
        process={process}
        apiRef={apiRef}
        canRun={() => (area ? true : c.needsArea)}
        onReset={() => {
          setArea(null);
          setPoints({});
          setFirst(undefined);
          setOpen(false);
        }}
        renderMore={(ctx) => <MoreOptions changed={opts.pattern.trim() && opts.pattern.trim() !== RENAME_PATTERN ? 1 : 0} disabled={ctx.disabled} content={{ extra: <div className="flex flex-col gap-2">{pattern("more")}{preview}</div> }} />}
        renderOptions={(ctx) => (
          <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-bar:flex-1">
            <ReadTexts
              files={ctx.readyFiles}
              onFirst={setFirst}
              onRead={(id, pts, mod) => {
                setTx(mod);
                setPoints((all) => ({ ...all, [id]: pts }));
              }}
            />
            <div className="ip-opt-bar ip-doc-two ip-doc-next min-w-0 dock-bar:flex-1">
              {choose("bar")}
              <p className="ip-doc-note" aria-hidden="true">{area && firstName && !firstName.kept.length ? firstName.names[0] : ""}</p>
            </div>
            <div className="ip-opt-side">
              <Group n={1} title={c.stepText}>
                {choose("side")}
              </Group>
              <Group n={2} title={c.stepName}>
                {pattern("side")}
                {preview}
              </Group>
            </div>
          </div>
        )}
      />
      {areaDialog && area && (
        <areaDialog.AreaDialog
          open={open}
          onClose={() => setOpen(false)}
          file={first}
          api={apiRef.current}
          area={area}
          onChange={setArea}
          maxPages={1}
          title={c.dialogTitle}
          help={c.dialogHelp}
          areaLabel={c.areaLabel}
          status={() => {
            const text = first && tx ? tx.textIn(points[first.id] ?? [], area) : "";
            return text ? (<>{c.found} <strong className="font-semibold text-ink-black">{text}</strong></>) : c.nothing;
          }}
        />
      )}
    </>
  );
}
