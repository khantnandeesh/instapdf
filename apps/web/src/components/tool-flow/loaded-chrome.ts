/**
 * The chrome a tool shows once a file is in (F25 §3, §6): the dock (top row or bottom bar) and the action
 * slot's parts. Never in the first load (the empty state is the picker card only): ToolFlow fetches this
 * chunk on intent and awaits it before the first file is drawn, then renders it synchronously.
 */
export { ControlDock } from "./ControlDock";
export { ProgressPill, SlotError, SlotStatus, shortError } from "./ActionSlot";
