"use client";
import { useEffect, useRef, useState } from "react";
import { useLiveState } from "@/components/page-select/hooks";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn, ReadyFile } from "@/components/tool-flow/types";
import { Button } from "@/components/ui/Button";
import { rowsChanged, rowsError, rowsFromOutline, toTree, type BookmarkRow } from "@/lib/pdf/bookmark-edit";
import type { OutlineEntry } from "@/lib/pdf/split-outline";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { bookmarksCopy as c } from "./copy";
import "./doc-tools.css";

const tool = flowTool("pdf-bookmarks");
// The list editor is loaded when first opened (it is no part of the first load).
const loadDialog = () => import("./BookmarksDialog");
type DialogModule = Awaited<ReturnType<typeof loadDialog>>;

/** The file's bookmarks, read once per file. Renders nothing. */
function ReadOutline({ file, onRead }: { file: ReadyFile | undefined; onRead: (file: ReadyFile | undefined, entries: OutlineEntry[] | null) => void }) {
  const report = useRef(onRead);
  report.current = onRead;
  useEffect(() => {
    let live = true;
    report.current(file, null);
    if (file)
      void import("@/lib/pdf/split-outline")
        .then((m) => m.readOutline(file.source, file.password))
        .catch(() => [] as OutlineEntry[])
        .then((entries) => live && report.current(file, entries));
    return () => {
      live = false;
    };
  }, [file]);
  return null;
}

/**
 * Bookmarks (spec F10 §4): the file's outline in a list to edit: rename, send to another page,
 * reorder, nest, add and delete. One file at a time.
 */
export function BookmarksTool() {
  const [file, setFile] = useState<ReadyFile | undefined>();
  const [from, setFrom] = useState<OutlineEntry[] | null>(null);
  const [rows, setRows, rowsLive] = useLiveState<BookmarkRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<DialogModule | null>(null);

  const process: ProcessFn = async (files, signal, onProgress) => {
    const f = files[0];
    const out = await runInWorker({ kind: "bookmarks", zipName: "", items: toTree(rowsLive.current), files: [{ name: f.name, source: f.source, password: f.password }] }, { signal, onProgress });
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };
  const pageCount = file?.pageCount ?? 1;
  const canRun = () => {
    if (!from) return c.reading;
    const error = rowsError(rows, pageCount);
    if (error) return error === "title" ? c.errors.title : c.errors.page(pageCount);
    if (!rowsChanged(rows, from)) return from.length ? c.needsChange : c.needsOne;
    return true as const;
  };
  const edit = (where: string) => (
    <Button
      variant="line"
      disabled={!from}
      data-testid={`bm-edit-${where}`}
      onClick={() => {
        setOpen(true);
        if (!editor) void loadDialog().then(setEditor);
      }}
    >
      {c.edit}
    </Button>
  );
  const count = (
    <p className="ip-doc-note ip-doc-line" data-testid="bm-count">
      {from ? c.count(rows.length) : c.reading}
    </p>
  );
  return (
    <>
      <ToolFlow
        tool={tool}
        process={process}
        canRun={canRun}
        onReset={() => {
          setFrom(null);
          setRows([]);
          setOpen(false);
        }}
        renderOptions={(ctx) => (
          <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-bar:flex-1">
            <ReadOutline
              file={ctx.readyFiles[0]}
              onRead={(f, entries) => {
                setFile(f);
                setFrom(entries);
                setRows(entries ? rowsFromOutline(entries) : []);
              }}
            />
            <div className="ip-opt-bar ip-doc-two ip-doc-next min-w-0 dock-bar:flex-1">
              {edit("bar")}
              {count}
            </div>
            <div className="ip-opt-side">
              <Group n={1} title={c.step}>
                {edit("side")}
                {count}
                <p className="ip-doc-note">{c.note}</p>
              </Group>
            </div>
          </div>
        )}
      />
      {editor && <editor.BookmarksDialog open={open} onClose={() => setOpen(false)} rows={rows} onChange={setRows} pageCount={pageCount} />}
    </>
  );
}
