"use client";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

export type MenuEntry =
  | { id: string; label: string; icon?: ReactNode; disabled?: boolean; onSelect: () => void }
  | { separator: true }
  | { note: string };

const isItem = (e: MenuEntry): e is Extract<MenuEntry, { id: string }> => "id" in e;

export type MenuButtonHandle = { focus: () => void; open: () => void; element: HTMLButtonElement | null };

/**
 * WAI-ARIA menu button (spec F3 M-4 `Menu`). The popup uses the native
 * `popover="auto"` attribute: top layer, light dismiss, no z-index fights.
 * It opens below the trigger, or above it when there is not enough room.
 * Arrow keys, Home/End and first-letter type-ahead move between items;
 * Escape closes and returns focus to the trigger; Tab closes and moves on.
 */
export const MenuButton = forwardRef<
  MenuButtonHandle,
  {
    /** Accessible name of the trigger. */
    label: string;
    /** What the trigger shows (defaults to the label). */
    children?: ReactNode;
    items: MenuEntry[];
    className?: string;
    placement?: "bottom-start" | "bottom-end";
    tabIndex?: number;
    disabled?: boolean;
    title?: string;
    onOpenChange?: (open: boolean) => void;
    onFocus?: () => void;
    onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
    "data-testid"?: string;
  }
>(function MenuButton({ label, children, items, className, placement = "bottom-start", tabIndex, disabled, title, onOpenChange, onFocus, onKeyDown, ...rest }, ref) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const focusFirst = useRef<"first" | "last">("first");

  const itemEls = () => Array.from(popup.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []);

  const position = useCallback(() => {
    const t = trigger.current?.getBoundingClientRect();
    const p = popup.current;
    if (!t || !p) return;
    const h = p.offsetHeight;
    const w = p.offsetWidth;
    const below = window.innerHeight - t.bottom;
    const top = below < h + 8 && t.top > below ? Math.max(8, t.top - h - 4) : Math.min(window.innerHeight - h - 8, t.bottom + 4);
    let left = placement === "bottom-end" ? t.right - w : t.left;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    p.style.top = `${Math.max(8, top)}px`;
    p.style.left = `${left}px`;
  }, [placement]);

  const show = useCallback(
    (where: "first" | "last" = "first") => {
      const p = popup.current;
      if (!p || disabled) return;
      focusFirst.current = where;
      try {
        p.showPopover();
      } catch {
        return;
      }
    },
    [disabled],
  );
  const hide = useCallback((returnFocus: boolean) => {
    try {
      popup.current?.hidePopover();
    } catch {}
    if (returnFocus) trigger.current?.focus();
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => trigger.current?.focus(),
    open: () => show("first"),
    get element() {
      return trigger.current;
    },
  }));

  useEffect(() => {
    const p = popup.current;
    if (!p) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      onOpenChange?.(isOpen);
      if (isOpen) {
        position();
        const list = itemEls();
        (focusFirst.current === "last" ? list[list.length - 1] : list[0])?.focus();
      }
    };
    p.addEventListener("toggle", onToggle);
    const reposition = () => {
      if (p.matches(":popover-open")) position();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      p.removeEventListener("toggle", onToggle);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [onOpenChange, position]);

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const list = itemEls();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        go(at + 1);
        break;
      case "ArrowUp":
        go(at - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(list.length - 1);
        break;
      case "Escape":
        hide(true);
        break;
      case "Tab":
        hide(false);
        trigger.current?.focus();
        return; // let Tab move on from the trigger
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const k = e.key.toLowerCase();
          const start = at + 1;
          const hit = [...list.slice(start), ...list.slice(0, start)].find((el) => el.textContent?.trim().toLowerCase().startsWith(k));
          hit?.focus();
          break;
        }
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        tabIndex={tabIndex}
        disabled={disabled}
        title={title}
        className={className}
        onFocus={onFocus}
        onClick={() => (open ? hide(false) : show("first"))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            show(e.key === "ArrowUp" ? "last" : "first");
            return;
          }
          onKeyDown?.(e);
        }}
        data-testid={rest["data-testid"]}
      >
        {children ?? label}
      </button>
      <div
        ref={popup}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={label}
        onKeyDown={onMenuKey}
        className="fixed m-0 max-w-[calc(100vw-32px)] min-w-[200px] rounded-lg border border-border bg-surface-raised p-1 text-fg shadow-lg"
        style={{ inset: "auto" }}
      >
        {items.map((entry, i) =>
          isItem(entry) ? (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={entry.disabled}
              className={cx(
                "flex h-11 w-full items-center gap-2 rounded-md px-3 text-start text-sm font-medium whitespace-nowrap outline-none [@media(pointer:fine)]:lg:h-9",
                "hover:bg-surface-sunken focus-visible:bg-surface-sunken focus:bg-surface-sunken disabled:text-fg-disabled",
              )}
              onClick={() => {
                hide(true);
                entry.onSelect();
              }}
            >
              {entry.icon && <span className="shrink-0 text-fg-muted">{entry.icon}</span>}
              {entry.label}
            </button>
          ) : "separator" in entry ? (
            <div key={`s${i}`} role="separator" className="my-1 h-px bg-border" />
          ) : (
            <p key={`n${i}`} className="px-3 py-2 text-xs text-fg-muted">
              {entry.note}
            </p>
          ),
        )}
      </div>
    </>
  );
});
