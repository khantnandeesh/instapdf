"use client";
/**
 * Editor chrome (U-E2, F25 E1): the editor bar under the site header (h1, file menu, the tools centred
 * from 1024 px, Undo│Redo, Download in its action slot), the priority dock with More (< 1024), the view
 * pill, the save and privacy chips, and each page's header row.
 * Icons only (Phosphor Bold, no boxes); names and shortcuts are in tooltips and accessible names.
 */
import { FieldsChipSlot } from "@/tools/forms/lazy";
import { lazy, Suspense, useEffect, useId, useLayoutEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ActionSlot, ProgressPill, SlotError } from "@/components/tool-flow/ActionSlot";
import { MenuButton, type MenuEntry } from "@/components/ui/Menu";
import { cx } from "@/components/ui/cx";
import * as H from "@/lib/editor/history";
import { ToolRing } from "./EngineProgress";
import { useCtl } from "./context";
import { TOOL_NAMES } from "./controller";
import {
  CaretDownBold,
  CaretLeftBold,
  CaretRightBold,
  CheckBold,
  CopyBold,
  DownloadBold,
  DrawBold,
  EditTextBold,
  FilePlusBold,
  FitBold,
  ImageBold,
  LockBold,
  MarkBold,
  MinusBold,
  MoreBold,
  PagesBold,
  RedoBold,
  UndoBold,
  PlusBold,
  RotateLeftBold,
  RotateRightBold,
  SavedBold,
  SelectBold,
  ShapesBold,
  ShieldBold,
  SignBold,
  TextBold,
  TrashBold,
  WarningBold,
  WhiteoutBold,
  EyeBold,
  EyeSlashBold,
} from "./icons";
import { TextFieldIcon } from "@/tools/forms/icons";
import { Pop } from "./Pop";
import { useStore, type ToolId } from "./store";

export type ToolDef = { id: ToolId; key: string; hint: string; icon: ReactNode };

export const TOOLS: ToolDef[] = [
  { id: "select", key: "V", hint: "Click to select, drag to move", icon: <SelectBold size={22} /> },
  { id: "edit", key: "E", hint: "Click a line to change its words", icon: <EditTextBold size={22} /> },
  { id: "text", key: "T", hint: "Click to type, drag for a box · Esc to stop", icon: <TextBold size={22} /> },
  { id: "sign", key: "S", hint: "Sign or add initials", icon: <SignBold size={22} /> },
  { id: "form", key: "F", hint: "Add form fields, or find them with Detect", icon: <TextFieldIcon size={22} /> },
  { id: "mark", key: "H", hint: "Drag across words to mark them", icon: <MarkBold size={22} /> },
  { id: "draw", key: "P", hint: "Draw freehand", icon: <DrawBold size={22} /> },
  { id: "shapes", key: "R", hint: "Drag to draw a shape", icon: <ShapesBold size={22} /> },
  { id: "image", key: "I", hint: "Add a picture", icon: <ImageBold size={22} /> },
  { id: "whiteout", key: "W", hint: "Drag to cover an area", icon: <WhiteoutBold size={22} /> },
];
/** Dock order on phones and tablets (U-E2 < 640): most used first. */
export const DOCK_ORDER: ToolId[] = ["text", "sign", "mark", "whiteout", "draw", "image", "shapes", "select", "edit", "form"];

const toolDef = (id: ToolId) => TOOLS.find((t) => t.id === id)!;

function useTool() {
  const ctl = useCtl();
  const tool = useStore(ctl.store, (s) => s.tool);
  const locked = useStore(ctl.store, (s) => s.locked);
  const readOnly = useStore(ctl.store, (s) => s.readOnly);
  const pick = (id: ToolId, lock = false) => {
    if (id === "sign") ctl.openSign?.();
    else if (id === "image") ctl.pickImage?.();
    ctl.setTool(id, lock);
  };
  return { tool, locked, readOnly, pick };
}

/**
 * A tooltip next to its button, not inside it: the button's name stays exactly what it shows (its
 * icon, so the name), and the tip is its description (aria-describedby). A tip inside the button
 * made the active tool's visible text "Mark H Drag across…" against the name "Mark" (WCAG 2.5.3).
 */
function Tip({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  return (
    <span id={id} role="tooltip" className={cx("ed-tip", className)}>
      {children}
    </span>
  );
}

function ToolButton({ t, active, locked, disabled, onPick, tabIndex, side, label }: { t: ToolDef; active: boolean; locked: boolean; disabled: boolean; onPick: (lock: boolean) => void; tabIndex: number; side: "right" | "top" | "bottom"; label?: string }) {
  const name = TOOL_NAMES[t.id];
  const tip = useId();
  return (
    <span className="ed-tool-slot">
      <button
        type="button"
        className={cx("ed-tool group/tool", active && "ed-tool--on")}
        aria-pressed={active}
        aria-label={name}
        aria-describedby={tip}
        aria-keyshortcuts={t.key}
        aria-disabled={disabled || undefined}
        tabIndex={tabIndex}
        data-tool={t.id}
        onClick={() => !disabled && onPick(false)}
        onDoubleClick={() => !disabled && onPick(true)}
      >
        {t.icon}
        {t.id === "edit" && <ToolRing />}
        {label && <span className="ed-tool__label">{label}</span>}
        {active && locked && (
          <span className="ed-tool__lock" aria-hidden="true">
            <LockBold size={10} />
          </span>
        )}
      </button>
      <Tip id={tip} className={`ed-tip--${side}`}>
        <b>{name}</b> <kbd>{t.key}</kbd>
        <span className="ed-tip__hint">{disabled ? "Locked by the file’s owner" : t.hint}</span>
      </Tip>
    </span>
  );
}

/** Roving tabindex over a toolbar's buttons (arrows move, Home/End). */
function roving(e: KeyboardEvent<HTMLElement>, vertical: boolean) {
  const keys = vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  if (![...keys, "Home", "End"].includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(":scope > button, :scope > span > button"));
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  e.stopPropagation();
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === keys[1] ? 1 : -1) + items.length) % items.length;
  items.forEach((el, k) => (el.tabIndex = k === next ? 0 : -1));
  items[next]?.focus();
}

/** The tools in the editor bar, centred (F25 E1, from 1024 px): one row, roving tabindex. */
export function ToolBar() {
  const { tool, locked, readOnly, pick } = useTool();
  return (
    <div role="toolbar" aria-label="Tools" aria-orientation="horizontal" className="ed-tools" onKeyDown={(e) => roving(e, false)} data-region="tools" data-testid="editor-tools">
      {TOOLS.map((t) => (
        <ToolButton key={t.id} t={t} active={tool === t.id} locked={locked} disabled={readOnly && t.id !== "select"} onPick={(l) => pick(t.id, l)} tabIndex={tool === t.id ? 0 : -1} side="bottom" />
      ))}
    </div>
  );
}

export function ToolDock({ onMore }: { onMore: () => void }) {
  const { tool, locked, readOnly, pick } = useTool();
  const [vw, setVw] = useState(390);
  useLayoutEffect(() => {
    const on = () => setVw(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const fit = Math.max(3, Math.floor((vw - 16) / 60) - 1);
  const all = DOCK_ORDER.map(toolDef);
  const shown = fit >= all.length ? all : all.slice(0, fit);
  const hidden = all.slice(shown.length);
  const hiddenActive = hidden.find((t) => t.id === tool);
  return (
    <div role="toolbar" aria-label="Tools" aria-orientation="horizontal" className="ed-dock ed-glass" onKeyDown={(e) => roving(e, false)} data-region="tools" data-testid="dock">
      {shown.map((t) => (
        <ToolButton key={t.id} t={t} active={tool === t.id} locked={locked} disabled={readOnly && t.id !== "select"} onPick={(l) => pick(t.id, l)} tabIndex={tool === t.id || (!all.some((x) => x.id === tool) && t === shown[0]) ? 0 : -1} side="top" />
      ))}
      {hidden.length > 0 && (
        <button type="button" className={cx("ed-tool", hiddenActive && "ed-tool--on")} aria-label={hiddenActive ? `More tools (${TOOL_NAMES[hiddenActive.id]} active)` : "More tools"} aria-haspopup="dialog" tabIndex={hiddenActive ? 0 : -1} onClick={onMore} data-testid="dock-more">
          {hiddenActive ? hiddenActive.icon : <MoreBold size={22} />}
          {hiddenActive && (
            <span className="ed-tool__badge" aria-hidden="true">
              <MoreBold size={10} />
            </span>
          )}
        </button>
      )}
    </div>
  );
}

/** Tools that don't fit the dock (More sheet). */
export function MoreTools({ onDone }: { onDone: () => void }) {
  const { tool, pick, readOnly } = useTool();
  const [vw] = useState(() => (typeof window === "undefined" ? 390 : window.innerWidth));
  const fit = Math.max(3, Math.floor((vw - 16) / 60) - 1);
  const hidden = DOCK_ORDER.slice(fit).map(toolDef);
  return (
    <div className="grid grid-cols-4 gap-2">
      {hidden.map((t) => (
        <button
          key={t.id}
          type="button"
          className={cx("ed-sheettool", tool === t.id && "ed-sheettool--on")}
          aria-pressed={tool === t.id}
          disabled={readOnly && t.id !== "select"}
          onClick={() => {
            onDone();
            pick(t.id);
          }}
        >
          {t.icon}
          <span>{TOOL_NAMES[t.id]}</span>
        </button>
      ))}
    </div>
  );
}

export function UndoRedo() {
  const ctl = useCtl();
  const history = useStore(ctl.store, (s) => s.history);
  const busy = useStore(ctl.store, (s) => s.busy);
  const u = H.undoEntry(history);
  const r = H.redoEntry(history);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? "⌘" : "Ctrl+";
  const tips = useId();
  return (
    <span className="flex items-center">
      <span className="ed-tool-slot">
        <button type="button" className="ed-ctl ed-ctl--top group/tt" aria-label="Undo" aria-describedby={`${tips}-undo`} aria-keyshortcuts="Control+Z Meta+Z" disabled={!u || !!busy} onClick={() => void ctl.undo()}>
          <UndoBold size={20} />
        </button>
        <Tip id={`${tips}-undo`} className="ed-tip--bottom">
          {u ? `Undo ${u.label.toLowerCase()}` : "Undo"} <kbd>{mod}Z</kbd>
        </Tip>
      </span>
      <span className="ed-tool-slot">
        <button type="button" className="ed-ctl ed-ctl--top group/tt" aria-label="Redo" aria-describedby={`${tips}-redo`} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" disabled={!r || !!busy} onClick={() => void ctl.redo()}>
          <RedoBold size={20} />
        </button>
        <Tip id={`${tips}-redo`} className="ed-tip--bottom">
          {r ? `Redo ${r.label.toLowerCase()}` : "Redo"} <kbd>{mac ? "⇧⌘Z" : "Ctrl+Y"}</kbd>
        </Tip>
      </span>
    </span>
  );
}

/** "0 B uploaded" (AC-3) with how to check it. */
export function PrivacyChip({ short }: { short?: boolean }) {
  return (
    <Pop label={short ? "0 B uploaded" : "0 B uploaded"} title="Nothing leaves this device" className="ed-privacy" testId="privacy-chip" trigger={<><ShieldBold size={16} /><span>{short ? "0 B" : "0 B uploaded"}</span></>} panelClassName="w-[280px] p-4">
      <div className="flex flex-col gap-2 text-sm text-ink">
        <p className="font-semibold">Nothing leaves this device</p>
        <p className="text-muted">Your PDF is read, edited and saved by your browser. This page is not allowed to send files anywhere.</p>
        <a className="mp-link font-semibold" href="/privacy#files" target="_blank" rel="noopener">
          How to check
        </a>
      </div>
    </Pop>
  );
}

/**
 * Download in the editor's action slot (F25 §6, §7): the berry button; while the file is made the
 * progress pill ("Downloading…", Cancel); then "Downloaded" with a tick for 2.4s, and a small card
 * under it. An error shows the short line and "Try again" in the same box.
 */
export function DownloadButton({ compact }: { compact?: boolean }) {
  const ctl = useCtl();
  const busy = useStore(ctl.store, (s) => s.busy === "save");
  // Encrypted input: the copy is saved without a password (re-encryption comes later). Read-only
  // files download unchanged, so they keep theirs.
  const noPassword = useStore(ctl.store, (s) => ctl.rt.wasEncrypted && !s.readOnly);
  const hasCard = useStore(ctl.store, (s) => !!s.downloaded);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [edited, setEdited] = useState(false);
  const [name, setName] = useState(() => ctl.outputName());
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 2400);
    return () => clearTimeout(t);
  }, [done]);
  const run = async (n?: string) => {
    setFailed(false);
    const r = await ctl.download?.(n);
    if (r === "done") setDone(true);
    else if (r === "failed") setFailed(true);
  };
  const warm = () => void import("@/lib/editor/build-client").then((m) => m.warmBuild());
  return (
    <span className="ed-download" onPointerEnter={warm} onPointerDown={warm} onFocus={warm}>
      <ActionSlot kind="editor">
        {busy ? (
          <ProgressPill state={{ phase: "work", verb: "Downloading" }} action="Download" onCancel={() => ctl.cancelDownload?.()} />
        ) : failed && !compact ? (
          <SlotError line="Couldn’t make the PDF." onRetry={() => void run()} />
        ) : (
          <>
            <Button
              variant="primary"
              size={compact ? "sm" : "md"}
              className="ip-slot__main min-w-0"
              aria-label="Download PDF"
              aria-keyshortcuts="Control+S Meta+S"
              iconStart={done ? <CheckBold size={18} /> : <DownloadBold size={18} />}
              onClick={() => void run()}
              data-testid="download"
              data-done={done || undefined}
            >
              <span className="max-[359px]:sr-only">{done ? "Downloaded" : "Download"}</span>
            </Button>
            {!compact && (
              <Pop label="Save as" title="Save as" className="ed-download__more" trigger={<CaretDownBold size={14} />} panelClassName="w-[280px] p-4">
                {(close) => (
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      close();
                      void run(name);
                    }}
                  >
                    <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
                      File name
                      <input className="ed-field w-full" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={edited}
                        onChange={(e) => {
                          setEdited(e.target.checked);
                          setName(ctl.outputName(e.target.checked));
                        }}
                      />
                      Add “-edited”
                    </label>
                    <Button variant="primary" size="sm" type="submit" iconStart={<DownloadBold size={16} />}>
                      Download
                    </Button>
                  </form>
                )}
              </Pop>
            )}
          </>
        )}
      </ActionSlot>
      {noPassword && (
        <span className="ed-download__note" data-testid="no-password-note">
          The downloaded copy has no password.
        </span>
      )}
      {hasCard && (
        <Suspense fallback={null}>
          <DownloadCard />
        </Suspense>
      )}
    </span>
  );
}

// The card after a download (F25 §7) carries the registry for its Keep going chips: its own chunk.
const DownloadCard = lazy(() => import("./DownloadCard").then((m) => ({ default: m.DownloadCard })));

export function TopBar({ wide, fileMenu }: { wide: boolean; fileMenu: MenuEntry[] }) {
  const ctl = useCtl();
  return (
    <header className="ed-top" data-region="top" role="group" aria-label="Document">
      <h1 className="ed-title">Edit PDF</h1>
      <span className="ed-beta">
        <Badge tone="beta">Beta</Badge>
      </span>
      <MenuButton label={`File: ${ctl.rt.name}`} items={fileMenu} className="ed-file" data-testid="file-menu">
        <h2 className="truncate">{ctl.rt.name}</h2>
        <CaretDownBold size={12} className="shrink-0" />
      </MenuButton>
      <div className="ed-top__slot">{wide && <ToolBar />}</div>
      <FieldsChipSlot />
      <UndoRedo />
      <DownloadButton compact={!wide} />
    </header>
  );
}

export function SaveChip() {
  const ctl = useCtl();
  const save = useStore(ctl.store, (s) => s.save);
  if (save === "idle") return null;
  return (
    <div className={cx("ed-chip ed-glass ed-savechip", save === "off" && "ed-savechip--off")} title={save === "off" ? "Changes aren’t kept on this device for this file" : "Changes are kept on this device"} data-testid="save-chip" role="status">
      {save === "off" ? <WarningBold size={16} aria-hidden="true" /> : <SavedBold size={16} aria-hidden="true" />}
      <span>{save === "saving" ? "Saving…" : save === "off" ? "Not saved on device" : "Saved"}</span>
    </div>
  );
}

export function ViewPill({ pageCount, onZoom, onFit, onGo }: { pageCount: number; onZoom: (z: number | "in" | "out") => void; onFit: (f: "width" | "page") => void; onGo: (i: number) => void }) {
  const ctl = useCtl();
  const current = useStore(ctl.store, (s) => s.current);
  const zoom = useStore(ctl.store, (s) => s.zoom);
  const [text, setText] = useState(String(current + 1));
  useEffect(() => setText(String(current + 1)), [current]);
  const go = () => {
    const n = parseInt(text, 10);
    if (Number.isFinite(n)) onGo(Math.max(0, Math.min(pageCount - 1, n - 1)));
    else setText(String(current + 1));
  };
  const zoomItems: MenuEntry[] = [
    { id: "fw", label: "Fit width", onSelect: () => onFit("width") },
    { id: "fp", label: "Fit page", onSelect: () => onFit("page") },
    { separator: true },
    ...[50, 75, 100, 125, 150, 200, 300].map((z) => ({ id: `z${z}`, label: `${z}%`, onSelect: () => onZoom(z / 100) })),
  ];
  return (
    <div className="ed-viewpill ed-glass" role="group" aria-label="View" data-region="view">
      <button type="button" className="ed-ctl" aria-label="Previous page" title="Previous page" disabled={current <= 0} onClick={() => onGo(current - 1)}>
        <CaretLeftBold size={16} />
      </button>
      <span className="flex items-center gap-1 text-sm tabular-nums">
        <input aria-label="Page number" className="ed-field ed-field--page" value={text} inputMode="numeric" onChange={(e) => setText(e.target.value)} onBlur={go} onKeyDown={(e) => (e.stopPropagation(), e.key === "Enter" && go())} />
        <span aria-hidden="true">/ {pageCount}</span>
        <span className="sr-only">of {pageCount}</span>
      </span>
      <button type="button" className="ed-ctl" aria-label="Next page" title="Next page" disabled={current >= pageCount - 1} onClick={() => onGo(current + 1)}>
        <CaretRightBold size={16} />
      </button>
      <span className="ed-viewpill__sep" aria-hidden="true" />
      <button type="button" className="ed-ctl" aria-label="Zoom out" title="Zoom out · Ctrl+−" onClick={() => onZoom("out")}>
        <MinusBold size={16} />
      </button>
      <MenuButton label={`Zoom ${Math.round(zoom * 100)}%`} items={zoomItems} className="ed-zoom" placement="bottom-start">
        <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
      </MenuButton>
      <button type="button" className="ed-ctl" aria-label="Zoom in" title="Zoom in · Ctrl++" onClick={() => onZoom("in")}>
        <PlusBold size={16} />
      </button>
      <button type="button" className="ed-ctl" aria-label="Fit width" title="Fit width" onClick={() => onFit("width")}>
        <FitBold size={16} />
      </button>
      <span className="ed-viewpill__sep" aria-hidden="true" />
      <AnnotsToggle />
    </div>
  );
}

/** Page actions (AC-41, U-E5): rotate left/right, duplicate, insert blank after, delete. */
export function pageActions(ctl: ReturnType<typeof useCtl>, pageId: string, total: number, index: number): MenuEntry[] {
  return [
    { id: "rl", label: "Rotate left", icon: <RotateLeftBold size={16} />, onSelect: () => ctl.rotatePage(pageId, -90) },
    { id: "rr", label: "Rotate right", icon: <RotateRightBold size={16} />, onSelect: () => ctl.rotatePage(pageId, 90) },
    { id: "dup", label: "Duplicate page", icon: <CopyBold size={16} />, onSelect: () => ctl.duplicatePage(pageId) },
    { id: "ins", label: "Insert blank page after", icon: <FilePlusBold size={16} />, onSelect: () => ctl.insertBlank(pageId) },
    { id: "up", label: "Move up", disabled: index === 0, onSelect: () => ctl.movePage(pageId, index - 1) },
    { id: "down", label: "Move down", disabled: index === total - 1, onSelect: () => ctl.movePage(pageId, index + 1) },
    { id: "del", label: "Delete page", icon: <TrashBold size={16} />, disabled: total <= 1, onSelect: () => ctl.deletePage(pageId) },
  ];
}

export function PageHeader({ pageId, index, total }: { pageId: string; index: number; total: number }) {
  const ctl = useCtl();
  const current = useStore(ctl.store, (s) => s.current === index);
  const btn = (label: string, icon: ReactNode, run: () => void, disabled = false) => (
    <button type="button" className="ed-ctl ed-ctl--sm" aria-label={`${label}, page ${index + 1}`} title={label} disabled={disabled} onClick={run}>
      {icon}
    </button>
  );
  return (
    <div className={cx("ed-pagehead", current && "ed-pagehead--current")}>
      <span className="ed-pagehead__n" aria-hidden="true">
        {index + 1}
      </span>
      <div className="ed-pagehead__acts" role="group" aria-label={`Page ${index + 1} actions`}>
        {btn("Rotate left", <RotateLeftBold size={16} />, () => ctl.rotatePage(pageId, -90))}
        {btn("Rotate right", <RotateRightBold size={16} />, () => ctl.rotatePage(pageId, 90))}
        {btn("Duplicate page", <CopyBold size={16} />, () => ctl.duplicatePage(pageId))}
        {btn("Insert blank page after", <FilePlusBold size={16} />, () => ctl.insertBlank(pageId))}
        {btn("Delete page", <TrashBold size={16} />, () => ctl.deletePage(pageId), total <= 1)}
      </div>
    </div>
  );
}

export function PageChip({ onOpen }: { onOpen: () => void }) {
  const ctl = useCtl();
  const current = useStore(ctl.store, (s) => s.current);
  const total = useStore(ctl.store, (s) => H.current(s.history).pages.length);
  return (
    <button type="button" className="ed-pagechip ed-glass" aria-label={`Pages ${current + 1}/${total}`} onClick={onOpen} data-testid="page-chip">
      <PagesBold size={16} />
      <span className="tabular-nums">
        {current + 1}/{total}
      </span>
    </button>
  );
}

/** Show/Hide annotations (marks and drawings): view only, never saved (AC-70). */
export function AnnotsToggle() {
  const ctl = useCtl();
  const hide = useStore(ctl.store, (s) => s.hideAnnots);
  return (
    <button
      type="button"
      className="ed-ctl"
      aria-label="Hide annotations"
      aria-pressed={hide}
      title={hide ? "Show annotations" : "Hide annotations"}
      data-testid="hide-annots"
      onClick={() => {
        ctl.store.set({ hideAnnots: !hide });
        ctl.announce(hide ? "Annotations shown" : "Annotations hidden. They are still saved.");
      }}
    >
      {hide ? <EyeSlashBold size={16} /> : <EyeBold size={16} />}
    </button>
  );
}
