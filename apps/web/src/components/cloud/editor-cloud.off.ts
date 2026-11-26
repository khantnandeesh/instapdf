// F23 off (next.config.ts swaps this in for editor-cloud.tsx): nothing ships, and nothing calls it.
import type * as On from "./editor-cloud";

const none = null as never;
export const useEditorCloud: typeof On.useEditorCloud = none;
export const EditorCloudCaret: typeof On.EditorCloudCaret = none;
export const EditorCloudRow: typeof On.EditorCloudRow = none;
export const EditorCloudStatus: typeof On.EditorCloudStatus = none;
