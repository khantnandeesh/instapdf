"use client";
/**
 * F23 cloud sources on the editor's landing (/edit-pdf, spec U-2 E6): the same caret, menu and
 * one-tap row as every other tool's empty state (tool-cloud.tsx), with the editor's own limits. A
 * picked PDF goes through the editor's normal open path, exactly like a local pick. The provider
 * traffic stays in the /cloud window; the page's CSP is unchanged.
 *
 * Builds without cloud sources (next.config.ts CLOUD_ON) swap this module for editor-cloud.off.ts and
 * never call it (AC-120).
 */
import { useCallback, useState } from "react";
import { NoticeStack, type FlowNotice } from "../tool-flow/NoticeStack";
import { LiveRegion } from "../ui/LiveRegion";
import { ProgressBar } from "../ui/ProgressBar";
import { CloudCaret, useCloud, type CloudDeps, type CloudHub } from "./tool-cloud";
import { EDITOR_CLOUD_FLOW } from "./editor-flow";

const editorTool = { flow: EDITOR_CLOUD_FLOW } as const;

let seq = 0;

export type EditorCloud = {
  hub: CloudHub;
  notices: FlowNotice[];
  dismiss: (id: string) => void;
  message: string;
  /** Ends every cloud pick in progress (a local file, a drop, a paste or a blank page came first). */
  cancel: () => void;
};

/** A cloud file that arrived after another file took the editor: never opened over it. */
const notOpened = (name: string) => `${name} wasn't opened: another PDF is already open.`;

/**
 * The landing's cloud hub. `open` is the editor's own open path (type, size and password checks, then
 * focus mode); the intake has already screened the type and size against EDITOR_CLOUD_FLOW.
 * `canOpen`: false while a file is opening, a password is asked for, or a document is open. A cloud
 * file that arrives then is dropped with a notice: it never replaces a document or its edits.
 */
export function useEditorCloud(open: (file: File) => void, canOpen: () => boolean, devicePicker: () => HTMLElement | null): EditorCloud {
  const hub = useCloud();
  const [notices, setNotices] = useState<FlowNotice[]>([]);
  const [message, setMessage] = useState("");
  const announce = useCallback((m: string) => setMessage((prev) => (prev === m ? `${m} ` : m)), []);
  const pushNotice = useCallback((n: Omit<FlowNotice, "id">) => {
    const id = `ecn${++seq}`;
    setNotices((prev) => [...prev, { ...n, id }]);
    return id;
  }, []);
  const dismiss = useCallback((id: string) => setNotices((prev) => prev.filter((n) => n.id !== id)), []);
  const deps: CloudDeps = {
    tool: editorTool,
    announce,
    pushNotice,
    dismissNotice: dismiss,
    intake: async (files) => {
      const file = files[0];
      if (!file) return;
      if (!canOpen()) {
        pushNotice({ tone: "warning", title: notOpened(file.name), timeoutMs: 8000 });
        return;
      }
      // A file that arrives clears the landing's other notices, as a local pick does in the tool flow.
      setNotices((prev) => prev.filter((n) => n.sticky && n.tone !== "info"));
      open(file);
    },
    files: [],
    devicePicker,
  };
  hub.deps = deps;
  const cancel = useCallback(() => hub.intake?.abort(), [hub]);
  return { hub, notices, dismiss, message, cancel };
}

/** The caret half of "Open PDF" (FilePicker's `sources` slot). */
export function EditorCloudCaret({ cloud }: { cloud: EditorCloud }) {
  return <CloudCaret hub={cloud.hub} look="primary" />;
}


/**
 * What a download from the cloud shows on the landing, in the status line under the card (its height is
 * reserved, so nothing moves): "Getting 1 file from Google Drive… 42%" with a progress bar. Plus the
 * floating notices (waiting, blocked, unreachable, denied, skipped) and the live region.
 */
export function EditorCloudStatus({ cloud, line = true }: { cloud: EditorCloud; /** False while the landing shows its own notice in the slot, or the editor is open. */ line?: boolean }) {
  const d = line ? cloud.hub.s.downloads.find((x) => x.status !== "failed") : undefined;
  const pct = d && d.total ? Math.min(100, Math.round((d.loaded / d.total) * 100)) : 0;
  return (
    <>
      <LiveRegion message={cloud.message} />
      <NoticeStack notices={cloud.notices} onDismiss={cloud.dismiss} />
      {d && cloud.hub.s.busy && (
        <div className="absolute inset-x-0 top-2 mx-auto flex w-fit max-w-[min(440px,calc(100vw-32px))] items-center gap-2 rounded-full bg-band px-3 py-1 text-sm text-ink" data-testid="editor-cloud-status">
          <span>{cloud.hub.s.busy}</span>
          <ProgressBar label={`Downloading ${d.name}`} value={pct} className="w-16 shrink-0" />
          <span className="tabular-nums">{pct}%</span>
        </div>
      )}
    </>
  );
}
