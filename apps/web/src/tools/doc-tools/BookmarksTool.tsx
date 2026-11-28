"use client";
import { useEffect, useRef, useState } from "react";
import { useLiveState } from "@/components/page-select/hooks";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn, ReadyFile } from "@/components/tool-flow/types";
import { Button } from "@/components/ui/Button";
import { outlineTooBig, rowsChanged, rowsError, rowsFromOutline, toTree, type BookmarkRow } from "@/lib/pdf/bookmark-edit";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { bookmarksCopy as c } from "./bookmarks-copy";
import "./doc-tools.css";

const tool = flowTool("pdf-bookmarks");
// The list editor is loaded when first opened (it is no part of the first load).
const loadEditor = () => import("./BookmarksDialog");
type EditorModule = Awaited<ReturnType<typeof loadEditor>>;

/** Tells the tool which file is loaded. Renders nothing; the options it sits in come and go (result screen, 1024 px), the tool's list does not. */
function TellFile({ file, onFile }: { file: ReadyFile | undefined; onFile: (file: ReadyFile | undefined) => void }) {
  const tell = useRef(onFile);
  tell.current = onFile;
  useEffect(() => tell.current(file), [file]);
  return null;
}

type Read = "reading" | "ready" | "failed" | "tooBig";

/**
 * Bookmarks (spec F10 §4): the file's outline in a list to edit: rename, send to another page,
 * reorder, nest, add and delete. One file at a time.
 */
export function BookmarksTool() {
  const [file, setFile] = useState<ReadyFile | undefined>();
  const [read, setRead] = useState<Read>("reading");
  // The rows as the file gave them: what "changed" is measured against.
  const [base, setBase] = useState<BookmarkRow[]>([]);
  const [rows, setRows, rowsLive] = useLiveState<BookmarkRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<EditorModule | null>(null);

  // Read once per file: the list is only ever replaced when the file is.
  const id = file?.id;
  useEffect(() => {
    let live = true;
    setRead("reading");
    setBase([]);
    setRows([]);
    setOpen(false);
    if (!file) return;
    void import("@/lib/pdf/bookmark-read")
      .then((m) => m.readForEdit(file.source, file.password))
      .catch(() => null)
      .then((entries) => {
        if (!live) return;
        if (!entries) return setRead("failed");
        if (outlineTooBig(entries)) return setRead("tooBig");
        const first = rowsFromOutline(entries);
        setBase(first);
        setRows(first);
        setRead("ready");
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the file's id: the same file re-rendered is not a new file
  }, [id]);

  const process: ProcessFn = async (files, signal, onProgress) => {
    const f = files[0];
    const out = await runInWorker({ kind: "bookmarks", zipName: "", items: toTree(rowsLive.current), files: [{ name: f.name, source: f.source, password: f.password }] }, { signal, onProgress });
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };
  const pageCount = file?.pageCount ?? 1;
  const canRun = () => {
    if (read !== "ready") return c[read];
    const error = rowsError(rows, pageCount);
    if (error) return error === "title" ? c.errors.title : c.errors.page(pageCount);
    if (!rowsChanged(rows, base)) return base.length ? c.needsChange : c.needsOne;
    return true as const;
  };
  const edit = (where: string) => (
    <Button
      variant="line"
      disabled={read !== "ready"}
      data-testid={`bm-edit-${where}`}
      onClick={() => {
        setOpen(true);
        if (!editor) void loadEditor().then(setEditor);
      }}
    >
      {c.edit}
    </Button>
  );
  const count = (
    <p className="ip-doc-note ip-doc-line" data-testid="bm-count">
      {read === "ready" ? c.count(rows.length) : c[read]}
    </p>
  );
  return (
    <>
      <ToolFlow
        tool={tool}
        process={process}
        canRun={canRun}
        onReset={() => setFile(undefined)}
        renderOptions={(ctx) => (
          <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-bar:flex-1">
            <TellFile file={ctx.readyFiles[0]} onFile={(f) => setFile((was) => (was?.id === f?.id ? was : f))} />
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
