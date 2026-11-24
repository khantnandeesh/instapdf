/**
 * F23: everything cloud on a tool page past tool-cloud.tsx, as one lazy chunk fetched on intent: the
 * caret's menu, the intake, the download cards, Save to cloud and Merge's menus. One chunk, not one
 * per part, keeps the webpack runtime (on every page) small.
 */
export { SourceCaret } from "./SourceCaret";
export { CloudDownloads } from "./CloudDownloads";
export { SaveToCloud, originPrivacyLine } from "./SaveToCloud";
export { openCloud } from "./intake-engine";
/** Merge loads its menu button from here in cloud builds (MergeTool.tsx loadMenu). */
export { CloudAddMenu as MenuButton } from "./merge-menus";
