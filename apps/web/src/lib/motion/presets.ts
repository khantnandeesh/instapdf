/** The motion presets (docs/design/motion.md §2): call sites name one, never a duration or an ease. */
export type Preset =
  | "menu"
  | "panel"
  | "popover"
  | "dialog"
  | "sheet"
  | "overlay"
  | "toast"
  | "card"
  | "list"
  | "thumb"
  | "result"
  | "tick"
  | "reorder"
  | "filter"
  | "swap";
