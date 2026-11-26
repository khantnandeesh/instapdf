/**
 * Focus moves the page makes on its own (after a file pick, after a dialog):
 * they follow the visitor's last input, like `:focus-visible` does for real
 * clicks. After a mouse or touch action the moved focus shows no ring
 * (`data-quiet-focus`, styled in tool-flow.css); the next key press on that
 * element brings the ring back, so keyboard users always see where they are.
 */

export type InputModality = "pointer" | "keyboard";

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/**
 * Calls `onChange` with "pointer" on every pointerdown and "keyboard" on every
 * keydown (capture phase, so nothing can stop it). Returns the cleanup.
 */
export function trackInputModality(onChange: (m: InputModality) => void, target: Listenable = document): () => void {
  const pointer = () => onChange("pointer");
  const keyboard = (e: Event) => {
    // A modifier on its own (Shift held while clicking, say) doesn't make this a keyboard session.
    const key = (e as KeyboardEvent).key;
    if (key === "Control" || key === "Meta" || key === "Alt" || key === "Shift") return;
    onChange("keyboard");
  };
  target.addEventListener("pointerdown", pointer, { capture: true });
  // Dropping files from the desktop fires no pointerdown in the page, but it is a pointer action.
  target.addEventListener("drop", pointer, { capture: true });
  target.addEventListener("keydown", keyboard, { capture: true });
  return () => {
    target.removeEventListener("pointerdown", pointer, { capture: true });
    target.removeEventListener("drop", pointer, { capture: true });
    target.removeEventListener("keydown", keyboard, { capture: true });
  };
}

type Focusable = Listenable & Pick<HTMLElement, "focus" | "setAttribute" | "removeAttribute" | "hasAttribute">;
type Doc = Pick<Document, "hasFocus">;

export const QUIET_FOCUS_ATTR = "data-quiet-focus";

/**
 * Marks `el` quiet (no visible ring) until it gets a key press or focus moves elsewhere in the page.
 * A blur because the whole window lost focus (the system file dialog, another tab or app) keeps the
 * mark: the browser gives focus back to the same element when the window returns, and must not show
 * a ring there for a mouse or touch action (eval G-7).
 */
export function markQuietFocus(el: Focusable, doc: Doc | undefined = globalThis.document): void {
  if (el.hasAttribute(QUIET_FOCUS_ATTR)) return;
  el.setAttribute(QUIET_FOCUS_ATTR, "");
  const clear = (e: Event) => {
    if (e.type === "blur" && doc && !doc.hasFocus()) return;
    el.removeAttribute(QUIET_FOCUS_ATTR);
    el.removeEventListener("keydown", clear);
    el.removeEventListener("blur", clear);
  };
  el.addEventListener("keydown", clear);
  el.addEventListener("blur", clear);
}

/**
 * Moves focus to `el`. After a pointer action the element is marked quiet
 * (no visible ring) until it gets a key press or loses focus within the page.
 */
export function moveFocus(el: Focusable, modality: InputModality, doc?: Doc): void {
  if (modality === "pointer") {
    markQuietFocus(el, doc);
    // `focusVisible: false` where the browser supports it; the attribute covers the rest.
    el.focus({ focusVisible: false } as FocusOptions);
  } else {
    el.focus();
  }
}

/** True when `el` is in the document and rendered (not `display: none` or in a hidden subtree). */
export function isShown(el: (Pick<Element, "getClientRects"> & { isConnected: boolean }) | null | undefined): el is HTMLElement {
  return !!el && el.isConnected && el.getClientRects().length > 0;
}
