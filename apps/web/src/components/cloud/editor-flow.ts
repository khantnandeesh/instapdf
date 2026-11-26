/**
 * What the cloud intake and the /cloud window read for the editor's landing (F23 E6): the editor is not
 * on the shared flow (tools/registry.ts has no `flow` for it), so this is its own small subset.
 */
import { EDITOR_MAX_BYTES, EDITOR_TITLE } from "@/tools/editor/limits";
import type { ToolFlowConfig } from "@/tools/registry";

export const EDITOR_CLOUD_FLOW: CloudFlow = {
  title: EDITOR_TITLE,
  accept: { mime: ["application/pdf"], extensions: [".pdf"] },
  multiFile: false,
  maxFileBytes: EDITOR_MAX_BYTES,
};

/** The part of a tool's flow config the cloud intake uses. */
export type CloudFlow = Pick<ToolFlowConfig, "title" | "accept" | "multiFile" | "maxFileBytes">;
