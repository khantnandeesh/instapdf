/**
 * F23: everything cloud on a tool page past tool-cloud.ts, as one lazy chunk: the caret, the row,
 * the download cards, Save to cloud, Merge's menus and the intake. One chunk, not one per part,
 * keeps the webpack runtime (on every page) small.
 */
export { CloudPart } from "./parts";
export { SaveToCloud } from "./SaveToCloud";
/** Merge loads its menu button from here in cloud builds (MergeTool.tsx loadMenu). */
export { CloudAddMenu as MenuButton } from "./merge-menus";
