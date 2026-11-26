"use client";
import "@/components/ui/dialog.css";
import "./editor.css";
import "@/components/berry/berry-loader.css";
/**
 * Edit PDF (F16 E1): the route component. The landing is the shared F1 pieces only (title, drop
 * card, limits, privacy), so the route's first-load JS stays small (AC-86). The editor shell,
 * pdf.js and the engine are separate chunks, fetched on intent (pointer or focus on Open PDF,
 * a drag, idle after load; the engine not on Data Saver or 2g) or on the pick itself. Picking a file opens focus mode at once.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Floaties } from "@/components/berry/Berry";
import { DropOverlay } from "@/components/tool-flow/DropOverlay";
import { FilePicker, type FilePickerHandle } from "@/components/tool-flow/FilePicker";
import { LimitsNote, PrivacyNote } from "@/components/tool-flow/notes";
import { copy } from "@/components/tool-flow/copy";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
// F23 cloud sources on the landing (E6): the same caret, menu and row as every tool (builds without them get a no-op module).
import { EditorCloudCaret, EditorCloudRow, EditorCloudStatus, useEditorCloud } from "@/components/cloud/editor-cloud";
import { blankPdf, defaultPaper } from "@/lib/editor/blank";
import { earlyFetchAllowed } from "@/lib/editor/engine-load";
import { openPdf, prefetchPdfjs, type OpenedPdf } from "@/lib/pdf/pdfjs";
import { warmPdfjs } from "@/lib/pdf/pdfjs-warm";
import { FilePlusBold, FileUpBold } from "./icons";
import { prefetchEditorChunks } from "./idle-prefetch";
import type { ShellProps } from "./EditorShell";
import { EDITOR_MAX_BYTES } from "./limits";

// Only a locked PDF needs it: its own chunk, fetched after hydration, out of the first load.
const PasswordDialog = dynamic(() => import("@/components/tool-flow/PasswordDialog").then((m) => m.PasswordDialog), { ssr: false });

export const MAX_BYTES = EDITOR_MAX_BYTES;

type Opened = { name: string; bytes: Uint8Array; pdf: OpenedPdf; password?: string; key: number };

let shellModule: Promise<{ EditorShell: ComponentType<ShellProps> }> | null = null;
/** Fetches the editor chunk (the shell and its own imports). Safe to call often. */
export function prefetchShell() {
  shellModule ??= import("./EditorShell");
  shellModule.catch(() => (shellModule = null));
  prefetchPdfjs();
  return shellModule;
}

export function EditorTool() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [Shell, setShell] = useState<ComponentType<ShellProps> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [locked, setLocked] = useState<{ name: string; bytes: Uint8Array; attempt: number; error?: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const picker = useRef<FilePickerHandle>(null);
  // F23: ends the landing's cloud picks when a file comes from elsewhere (set below, with the cloud hub).
  const cancelCloud = useRef<(() => void) | undefined>(undefined);
  // A file is on its way in (set at once, before any state update lands): a cloud file arriving now is not opened over it.
  const opening = useRef(false);
  const open = !!(opened && Shell);

  const say = useCallback((text: string) => setNotice({ text, key: Date.now() }), []);

  // Prefetch on idle after the landing has loaded (U-E13), at low priority and not with Data
  // Saver on or on 2g: the editor chunk and pdf.js with its workers first (the first page needs
  // them), then the engine (Edit text). With Data Saver they load on intent or on the pick.
  // Loaded, not evaluated (idle-prefetch.ts): evaluating the shell and pdf.js waits for intent or the pick.
  useEffect(() => {
    setHydrated(true);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const go = () => {
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (!earlyFetchAllowed(conn)) return;
      prefetchEditorChunks();
      void warmPdfjs("low").then(() => import("@/lib/editor/engine-client").then((m) => m.preloadEngine("low")));
    };
    const id = w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 4000 }) : window.setTimeout(go, 2500);
    return () => {
      if (!w.requestIdleCallback) clearTimeout(id);
    };
  }, []);

  const finish = useCallback(async (name: string, bytes: Uint8Array, password?: string) => {
    const [mod, res] = await Promise.all([prefetchShell(), openPdf(bytes.slice(), password)]);
    if (!res.ok) {
      if (res.reason === "needPassword" || res.reason === "wrongPassword") {
        setLocked((l) => ({ name, bytes, attempt: (l?.attempt ?? 0) + (res.reason === "wrongPassword" ? 1 : 0), error: res.reason === "wrongPassword" ? copy.pwWrong : undefined }));
        return;
      }
      say(copy.errorCorrupt(name));
      picker.current?.focus();
      return;
    }
    setLocked(null);
    setShell(() => mod.EditorShell);
    setOpened({ name, bytes, pdf: res.pdf, password, key: Date.now() });
    setNotice(null);
    // A document is open: any cloud pick still in progress ends (its window closes).
    cancelCloud.current?.();
  }, [say]);

  const openFile = useCallback(
    async (file: File, from: "local" | "cloud" = "local") => {
      // A local pick, drop or paste wins over a cloud pick still in progress: that one ends now.
      if (from === "local") cancelCloud.current?.();
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return say(copy.errorType(file.name));
      if (file.size > MAX_BYTES) return say(copy.errorSize(file.name, 200));
      if (!file.size) return say(copy.errorCorrupt(file.name));
      setBusy(true);
      opening.current = true;
      try {
        await finish(file.name, new Uint8Array(await file.arrayBuffer()));
      } catch {
        say(copy.errorCorrupt(file.name));
      } finally {
        opening.current = false;
        setBusy(false);
      }
    },
    [finish, say],
  );

  // A PDF picked from a cloud goes through the same open path as a local pick.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the flag is a build-time constant: the same call on every render
  const cloud = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? useEditorCloud(
        (f) => void openFile(f, "cloud"),
        // Never over a file that is opening, a password being asked for, or an open document.
        () => !opening.current && !busy && !locked && !opened,
        () => picker.current?.element ?? null,
      ) : null;
  if (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1") cancelCloud.current = cloud!.cancel;

  const openBlank = useCallback(async () => {
    cancelCloud.current?.();
    setBusy(true);
    try {
      await finish("blank.pdf", blankPdf(defaultPaper(navigator.language)));
    } finally {
      setBusy(false);
    }
  }, [finish]);

  // Drop a PDF anywhere on the landing; paste a PDF (Ctrl/Cmd+V). The editor handles its own.
  useEffect(() => {
    if (open) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
      void prefetchShell();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void openFile(file);
    };
    const paste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
      if (!file) return;
      e.preventDefault();
      void openFile(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
  }, [open, openFile]);

  const close = useCallback(() => {
    setOpened(null);
    requestAnimationFrame(() => picker.current?.focus());
  }, []);

  const status = (
      <div role="status" aria-live="polite" className="mx-auto mt-2 flex min-h-6 max-w-[440px] justify-center">
        {notice && !open && (
          <p key={notice.key} className="ed-notice rounded-full bg-danger-soft px-3 py-1 text-sm text-danger-strong" data-testid="editor-notice">
            {notice.text}
          </p>
        )}
      </div>
  );

  return (
    <div data-testid="editor" data-state={open ? "open" : busy ? "opening" : "empty"} data-hydrated={hydrated || undefined}>
      <DropOverlay active={dragging && !open} mode="add" />
      <div className="mp-intro flex items-center justify-center gap-3 pt-(--space-6) pb-(--space-5) sm:pt-(--space-7)">
        <h1 className="text-page-title text-ink-black">Edit PDF</h1>
        <Badge tone="beta">Beta</Badge>
      </div>
      <div className="mp-empty ed-landing grid place-items-center px-[15px] py-6" data-testid="drop-card">
        <Floaties set="empty" />
        <div className="mp-empty__in mp-dropcard relative w-full max-w-[440px] rounded-[16px_16px_28px_16px] border-[1.5px] border-sand bg-surface-raised px-6 pt-8 pb-7 shadow-card">
          <div className="flex flex-col items-center gap-3 text-center">
            <span onPointerEnter={() => void prefetchShell()} onFocus={() => void prefetchShell()} className={process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? "inline-flex max-sm:w-full" : "inline-flex"}>
              <FilePicker
                ref={picker}
                accept=".pdf,application/pdf"
                multiple={false}
                label={busy ? "Opening…" : "Open PDF"}
                disabled={busy}
                icon={<FileUpBold size={20} />}
                onFiles={(files) => void openFile(files[0])}
                inputTestId="editor-input"
                sources={process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? <EditorCloudCaret cloud={cloud!} /> : undefined}
              />
            </span>
            {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && <EditorCloudRow cloud={cloud!} />}
            <p className="text-sm text-muted">
              or drop it here <span aria-hidden="true">·</span> <kbd className="font-ui">Ctrl+V</kbd>
            </p>
            <Button variant="plain" size="sm" iconStart={<FilePlusBold size={16} />} disabled={busy} onClick={() => void openBlank()} title="A blank A4 page (Letter in the US and Canada)">
              Blank page
            </Button>
            <LimitsNote text="Up to 200 MB" full="One PDF up to 200 MB. No page, save or hourly limits." />
            <PrivacyNote runtime="client" context="intro" />
          </div>
        </div>
      </div>
      {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? (
        // The cloud download's line sits over the same reserved slot (never moves the page), outside the live region.
        <div className="relative">
          {status}
          {/* Its notices show over the open editor too (a cloud file that arrived too late says so). */}
          <EditorCloudStatus cloud={cloud!} line={!notice && !open} />
        </div>
      ) : (
        status
      )}
      <PasswordDialog
        open={!!locked}
        fileId={locked?.name ?? ""}
        fileName={locked?.name ?? ""}
        showApplyToAll={false}
        error={locked?.error}
        busy={busy}
        attempt={locked?.attempt ?? 0}
        onSubmit={(pw) => {
          if (!locked) return;
          setBusy(true);
          void finish(locked.name, locked.bytes, pw).finally(() => setBusy(false));
        }}
        onSkip={() => setLocked(null)}
        fallbackFocus={() => picker.current?.element ?? null}
      />
      {open && opened && Shell && <Shell key={opened.key} name={opened.name} bytes={opened.bytes} pdf={opened.pdf} password={opened.password} onClose={close} onOpenFile={(f) => void openFile(f)} onBlank={() => void openBlank()} />}
    </div>
  );
}
