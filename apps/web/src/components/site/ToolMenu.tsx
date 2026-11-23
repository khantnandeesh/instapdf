"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { clearRecent } from "@/lib/recent-tools";
import { matchTools } from "@/lib/catalogue/search";
import { catalogueCopy as copy } from "../catalogue/copy";
import { RecentStrip } from "../catalogue/RecentStrip";
import { useToolIndex } from "../catalogue/ToolIndexProvider";
import { CATALOGUE_SEARCH_ID, usable, type ToolIndexItem } from "../catalogue/types";
import { useRecentTools } from "../catalogue/useRecentTools";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Dialog } from "../ui/Dialog";
import { ChevronDownIcon, CloseIcon, GridIcon } from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { LiveRegion } from "../ui/LiveRegion";
import { RuntimeMarker } from "../ui/RuntimeMarker";
import { SearchField } from "../ui/SearchField";
import { siteCopy } from "./copy";

const DESKTOP = "(min-width: 768px)";
const MENU_ID = "tool-menu";
const RESULTS_ID = "tool-menu-results";

type Mode = "panel" | "dialog";

const isTyping = (t: EventTarget | null) =>
  t instanceof Element && (!!t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") || (t as HTMLElement).isContentEditable);

/**
 * "All tools" button plus the tool menu (spec F2 §3d/§3e, H-7).
 * >= 768 px: a disclosure panel under the header (not modal, page not scrolled).
 * <  768 px: a full-screen modal dialog with a focus trap and scroll lock.
 * Also owns the global "/" shortcut (AC-61).
 */
export function ToolMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("panel");
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [focusSearch, setFocusSearch] = useState(true);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const openMenu = useCallback((focus: "search" | "title") => {
    setMode(window.matchMedia(DESKTOP).matches ? "panel" : "dialog");
    setFocusSearch(focus === "search");
    setQuery("");
    setOpen(true);
  }, []);

  /** Closes; `returnFocus` puts focus back on the trigger (Escape, ×). The dialog does that itself. */
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Route change closes the menu (AC-29).
  useEffect(() => setOpen(false), [pathname]);

  // Crossing the breakpoint while open closes it rather than switching container (H-4).
  useEffect(() => {
    if (open && desktop !== null && desktop !== (mode === "panel")) close(true);
  }, [desktop, mode, open, close]);

  // Raise the header above the tool page's dock and overlays while the panel is open.
  useEffect(() => {
    const header = wrapperRef.current?.closest("header");
    if (!header) return;
    if (open && mode === "panel") header.setAttribute("data-menu-open", "");
    else header.removeAttribute("data-menu-open");
  }, [open, mode]);

  // Panel: focus the search on open (AC-28); Escape closes and returns focus (AC-26).
  useEffect(() => {
    if (!open || mode !== "panel") return;
    searchRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      close(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, mode, close]);

  // Dialog: lock page scrolling behind it (AC-38).
  useEffect(() => {
    if (!open || mode !== "dialog") return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [open, mode]);

  // "/" focuses the home search, or opens the menu with its search focused (AC-61).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      if (open) {
        searchRef.current?.focus();
        return;
      }
      const home = document.getElementById(CATALOGUE_SEARCH_ID);
      if (home) {
        home.scrollIntoView({ block: "center" });
        home.focus({ preventScroll: true });
      } else openMenu("search");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, openMenu]);

  const toggle = () => (open ? close(false) : openMenu(mode === "dialog" || desktop === false ? "title" : "search"));

  const content = (
    <MenuContent
      mode={mode}
      query={query}
      setQuery={setQuery}
      searchRef={searchRef}
      onClose={() => close(mode === "panel")}
      onChoose={() => close(false)}
    />
  );

  return (
    <div
      ref={wrapperRef}
      className="flex items-center"
      onBlur={(e) => {
        // Panel only: close once keyboard focus moves to something outside the trigger and panel.
        const next = e.relatedTarget;
        if (open && mode === "panel" && next instanceof Node && !wrapperRef.current?.contains(next)) close(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={MENU_ID}
        aria-haspopup={desktop === false ? "dialog" : undefined}
        onClick={toggle}
        data-testid="all-tools-button"
        className={cx(
          "ip-js-only inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-(--ip-duration-fast) md:h-9",
          "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']",
          open ? "bg-primary-soft text-on-primary-soft" : "text-fg hover:bg-surface-sunken",
        )}
      >
        <GridIcon size={16} />
        {siteCopy.menuButton}
        <ChevronDownIcon size={16} className={cx("transition-transform duration-(--ip-duration-fast)", open && "rotate-180")} />
      </button>
      <noscript>
        <Link href="/#tools" prefetch={false} className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap md:h-9">
          {siteCopy.menuButton}
        </Link>
      </noscript>

      {open && mode === "panel" && (
        <>
          <div aria-hidden="true" className="ip-fade-in fixed inset-x-0 top-(--ip-header-h) bottom-0 bg-scrim" onClick={() => close(false)} data-testid="tool-menu-scrim" />
          <div
            id={MENU_ID}
            className="ip-drop-in fixed inset-x-0 top-(--ip-header-h) max-h-(--ip-menu-max-h) overflow-y-auto overscroll-contain border-b border-border bg-surface-raised shadow-lg"
            data-testid="tool-menu"
          >
            <div className="relative mx-auto max-w-[1280px] px-6 pt-6 pb-8 lg:px-8">{content}</div>
          </div>
        </>
      )}
      {mode === "dialog" && (
        <Dialog
          open={open}
          onClose={() => close(false)}
          title={copy.title}
          variant="fullscreen"
          initialFocusRef={focusSearch ? searchRef : undefined}
          returnFocusRef={triggerRef}
        >
          <div id={MENU_ID} data-testid="tool-menu" className="px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
            {content}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function MenuContent({
  mode,
  query,
  setQuery,
  searchRef,
  onClose,
  onChoose,
}: {
  mode: Mode;
  query: string;
  setQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onChoose: () => void;
}) {
  const { items, categories } = useToolIndex();
  const recent = useRecentTools();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState("");
  const matches = useMemo(() => matchTools(items, query), [items, query]);
  const searching = query.trim() !== "";
  const groups = categories
    .map((c) => ({ ...c, items: matches.filter((m) => m.item.category === c.id).map((m) => m.item) }))
    .filter((g) => g.items.length > 0);

  useEffect(() => {
    if (!searching) return setLive("");
    const t = setTimeout(() => setLive(copy.live(matches.length)), 400);
    return () => clearTimeout(t);
  }, [matches.length, searching]);

  const firstLink = () => resultsRef.current?.querySelector<HTMLAnchorElement>("a[href]") ?? null;
  const closeButton = <IconButton label={siteCopy.menuClose} icon={<CloseIcon />} tooltip={false} onClick={onClose} data-testid="tool-menu-close" />;

  const search = (
    <SearchField
      ref={searchRef}
      id="tool-menu-search"
      label={copy.searchLabel}
      hideLabel
      value={query}
      onChange={setQuery}
      onEnter={() => firstLink()?.click()}
      onArrowDown={() => firstLink()?.focus()}
      placeholder={copy.searchLabel}
      controls={RESULTS_ID}
      className="min-w-0 flex-1 md:max-w-[420px]"
    />
  );
  const count = <span className="min-w-[9ch] text-sm text-fg-muted tabular-nums">{copy.ofTotal(matches.length, items.length)}</span>;

  return (
    <div
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest("a[href]")) onChoose();
      }}
    >
      <LiveRegion message={live} />
      {mode === "panel" ? (
        <div className="flex items-center gap-4 pe-14">
          {search}
          {count}
        </div>
      ) : (
        <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-surface-raised px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-2">
          <div className="flex items-center gap-2">
            {search}
            {closeButton}
          </div>
          <div className="mt-1 text-xs">{count}</div>
        </div>
      )}

      {!searching && recent.length > 0 && (
        <div className="mt-4 border-b border-border pb-4">
          <RecentStrip
            items={recent}
            idPrefix="menu"
            level={2}
            onClear={() => {
              clearRecent();
              setLive(copy.recentCleared);
              searchRef.current?.focus();
            }}
          />
        </div>
      )}

      <div ref={resultsRef} id={RESULTS_ID}>
        {groups.length === 0 ? (
          <div className="mt-6 flex flex-wrap items-center gap-3" data-testid="tool-menu-no-results">
            <p className="text-sm font-semibold [overflow-wrap:anywhere]">{copy.none(query.trim())}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              {copy.clear}
            </Button>
          </div>
        ) : (
          <nav aria-label={copy.title} className="mt-6 gap-8 md:columns-3 xl:columns-4">
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`menu-cat-${g.id}`} className="mb-6 break-inside-avoid" data-testid="tool-menu-group">
                <h2 id={`menu-cat-${g.id}`} className="mb-1 flex items-baseline gap-2 px-2 text-sm font-semibold text-fg-muted">
                  {g.label}
                  <span className="text-xs font-normal tabular-nums">{g.items.length}</span>
                </h2>
                <ul>
                  {g.items.map((item) => (
                    <li key={item.slug}>
                      <MenuEntry item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        )}
      </div>
      {mode === "panel" && <div className="absolute top-6 end-6 lg:end-8">{closeButton}</div>}
    </div>
  );
}

function MenuEntry({ item }: { item: ToolIndexItem }) {
  const base = `menu-${item.slug}`;
  const badge = item.status === "beta" ? copy.beta : item.status === "planned" ? copy.soon : null;
  const ids = [`${base}-name`, badge && `${base}-badge`, item.runtime === "client" && `${base}-rt`].filter(Boolean).join(" ");
  return (
    <Link
      href={`/${item.slug}`}
      prefetch={false}
      aria-labelledby={ids}
      className="flex min-h-11 flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 hover:bg-surface-sunken"
    >
      <span className="flex items-center gap-2">
        <span className={cx("shrink-0", usable(item) ? "text-primary" : "text-fg-muted")}>{item.icon}</span>
        <span id={`${base}-name`} className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere] text-fg">
          {item.name}
        </span>
        {badge && (
          <Badge id={`${base}-badge`} tone={item.status === "planned" ? "soon" : "beta"}>
            {badge}
          </Badge>
        )}
      </span>
      {item.runtime === "client" && <RuntimeMarker id={`${base}-rt`} className="ps-7" />}
    </Link>
  );
}
