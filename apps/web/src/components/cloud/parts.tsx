"use client";
/**
 * F23: the cloud parts of a tool page, behind one lazy component (ToolFlow loads it once, from ui.ts):
 * the caret in the upload button, the one-tap row under it, and the download cards. Each part hands
 * the page's hub to the intake as it mounts.
 */
import { useEffect } from "react";
import { CloudDownloads } from "./CloudDownloads";
import { CloudRow } from "./CloudRow";
import { attach } from "./intake-engine";
import { SourceCaret, type SourceCaretProps } from "./SourceCaret";
import type { CloudHub } from "./tool-cloud";

export type CloudPartProps = { hub: CloudHub } & (({ part: "caret" } & Omit<SourceCaretProps, "replace">) | { part: "row" } | { part: "cards" });

export function CloudPart(p: CloudPartProps) {
  useEffect(() => attach(p.hub), [p.hub]);
  return p.part === "caret" ? (
    // In the toolbar of a single-file tool the clouds replace the file.
    <SourceCaret look={p.look} replace={p.look === "tool" && !p.hub.deps?.tool.flow.multiFile} className={p.className} disabled={p.disabled} />
  ) : p.part === "row" ? (
    <CloudRow />
  ) : (
    <CloudDownloads downloads={p.hub.s.downloads} />
  );
}
