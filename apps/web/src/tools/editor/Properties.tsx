"use client";
/**
 * Tool options and object properties (U-E4): the same controls in three places, the top bar's
 * centre slot (tool defaults, ≥ 1024), the properties popover next to a selection (≥ 1024) and
 * the context strip above the dock (< 1024, at most 6 controls, the rest in ⋯).
 *
 * A property change on a selection applies live, is one undo step, and becomes that tool's
 * default for the next object (AC-96).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MenuButton, type MenuEntry } from "@/components/ui/Menu";
import { cx } from "@/components/ui/cx";
import { TEXT_FONTS, cssFamily } from "@/lib/editor/fonts";
import { ensureFace } from "@/lib/editor/fonts-browser";
import { layoutText, textBoxSize } from "@/lib/editor/text-layout";
import { measurer } from "@/lib/editor/fonts-browser";
import { kindName, type EditorObject, type MarkupKind, type TextObj } from "@/lib/editor/model";
import { useCtl } from "./context";
import {
  AlignCenterBold,
  AlignLeftBold,
  AlignRightBold,
  ArrowBold,
  BackwardBold,
  BoldBold,
  CaretDownBold,
  CheckBold,
  CircleBold,
  CopyBold,
  EyedropperBold,
  ForwardBold,
  HighlightBold,
  ItalicBold,
  LineBold,
  MarkerBold,
  MinusBold,
  MoreBold,
  PenBold,
  PlusBold,
  RotateRightBold,
  SquareBold,
  StrikeBold,
  TrashBold,
  UnderlineBold,
  WarningBold,
} from "./icons";
import { Pop } from "./Pop";
import { shallowArray, useStore, type ToolDefaults } from "./store";

export const INK = [
  { name: "Black", hex: "#000000" },
  { name: "Blue", hex: "#1a49c7" },
  { name: "Red", hex: "#c8102e" },
  { name: "Green", hex: "#12805c" },
  { name: "Purple", hex: "#5b2a86" },
];
export const MARKER = [
  { name: "Yellow", hex: "#ffe14d" },
  { name: "Green", hex: "#7cf09a" },
  { name: "Blue", hex: "#7cd3ff" },
  { name: "Pink", hex: "#ff9ad5" },
  { name: "Orange", hex: "#ffb35c" },
];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const WIDTHS = [0.5, 1, 2, 3, 4, 6];

// ---- recent colours (this session and device) ----
const RECENT_KEY = "berrypdf:editor:recent-colours";
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function pushRecent(hex: string) {
  try {
    const list = [hex, ...readRecent().filter((h) => h !== hex)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // storage off: no recent colours
  }
}

/** Colour picker (AC-60): palette, recent colours, hex field, custom, eyedropper where supported, and "No colour" for fills. */
export function ColorButton({ label, value, onChange, palette = INK, allowNone, extra, testId }: { label: string; value: string | null; onChange: (hex: string | null) => void; palette?: typeof INK; allowNone?: boolean; extra?: { label: string; value: string; active: boolean; onPick: () => void }; testId?: string }) {
  const [hex, setHex] = useState(value ?? "");
  useEffect(() => setHex(value ?? ""), [value]);
  const pick = (h: string | null, close?: () => void) => {
    if (h) pushRecent(h);
    onChange(h);
    close?.();
  };
  const eyedropper = typeof window !== "undefined" && "EyeDropper" in window;
  return (
    <Pop
      label={label}
      testId={testId}
      trigger={<span className={cx("ed-dot", !value && "ed-dot--none")} style={value ? { background: value } : undefined} aria-hidden="true" />}
      panelClassName="w-[232px] p-3"
    >
      {(close) => (
        <div className="flex flex-col gap-3">
          {extra && (
            <button type="button" className={cx("ed-chip", extra.active && "ed-chip--on")} aria-pressed={extra.active} onClick={() => (extra.onPick(), close())}>
              {extra.label}
            </button>
          )}
          <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
            {palette.map((c) => {
              const on = !extra?.active && value?.toLowerCase() === c.hex;
              return (
                <button key={c.hex} type="button" role="radio" aria-checked={on} aria-label={c.name} title={c.name} className="ed-swatch" style={{ background: c.hex }} onClick={() => pick(c.hex, close)}>
                  {on && <CheckBold size={14} />}
                </button>
              );
            })}
            {allowNone && (
              <button type="button" role="radio" aria-checked={value == null} aria-label="No colour" title="No colour" className="ed-swatch ed-swatch--none" onClick={() => pick(null, close)}>
                {value == null && <CheckBold size={14} />}
              </button>
            )}
          </div>
          <Recent onPick={(h) => pick(h, close)} />
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${label}-hex`}>
              Hex colour
            </label>
            <input
              id={`${label}-hex`}
              className="ed-field w-[92px] font-mono"
              value={hex}
              placeholder="#000000"
              maxLength={7}
              spellCheck={false}
              onChange={(e) => setHex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && /^#[0-9a-f]{6}$/i.test(hex)) pick(hex.toLowerCase(), close);
              }}
            />
            <label className="ed-ctl relative overflow-hidden" title="Custom colour">
              <span className="sr-only">Custom colour</span>
              <span className="ed-dot ed-dot--rainbow" aria-hidden="true" />
              <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value ?? "#000000"} onChange={(e) => pick(e.target.value)} />
            </label>
            {eyedropper && (
              <button
                type="button"
                className="ed-ctl"
                aria-label="Pick a colour from the screen"
                title="Pick a colour from the screen"
                onClick={async () => {
                  try {
                    const ED = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
                    const r = await new ED().open();
                    pick(r.sRGBHex, close);
                  } catch {
                    // cancelled
                  }
                }}
              >
                <EyedropperBold size={18} />
              </button>
            )}
          </div>
        </div>
      )}
    </Pop>
  );
}

function Recent({ onPick }: { onPick: (hex: string) => void }) {
  const [list] = useState(readRecent);
  if (!list.length) return null;
  return (
    <div className="flex items-center gap-2" aria-label="Recent colours" role="group">
      {list.map((h) => (
        <button key={h} type="button" className="ed-swatch ed-swatch--sm" style={{ background: h }} aria-label={`Recent ${h}`} title={h} onClick={() => onPick(h)} />
      ))}
    </div>
  );
}

/** Font size (AC-58): typed value 4–400, − / + (Shift steps by 4), presets 8–72. */
export function SizeStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.max(4, Math.min(400, Math.round(n * 2) / 2));
  const commit = (n: number) => {
    if (Number.isFinite(n)) onChange(clamp(n));
    else setText(String(value));
  };
  return (
    <span className="ed-stepper">
      <button type="button" className="ed-ctl ed-ctl--sm" aria-label="Smaller" title="Smaller" onClick={(e) => commit(value - (e.shiftKey ? 4 : 1))}>
        <MinusBold size={14} />
      </button>
      <input
        role="spinbutton"
        aria-label="Font size"
        aria-valuenow={value}
        aria-valuemin={4}
        aria-valuemax={400}
        inputMode="decimal"
        list="ed-sizes"
        className="ed-field ed-field--size"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(parseFloat(text))}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit(parseFloat(text));
          if (e.key === "ArrowUp") {
            e.preventDefault();
            commit(value + (e.shiftKey ? 4 : 1));
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            commit(value - (e.shiftKey ? 4 : 1));
          }
        }}
      />
      <datalist id="ed-sizes">
        {SIZES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button type="button" className="ed-ctl ed-ctl--sm" aria-label="Larger" title="Larger" onClick={(e) => commit(value + (e.shiftKey ? 4 : 1))}>
        <PlusBold size={14} />
      </button>
    </span>
  );
}

export function FontPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const fam = TEXT_FONTS.find((f) => f.id === value) ?? TEXT_FONTS[0];
  return (
    <Pop
      label={`Font ${fam.label}`}
      title={`Font: ${fam.label}`}
      className="ed-ctl--wide"
      testId="font-picker"
      onOpen={() => TEXT_FONTS.forEach((f) => void ensureFace(f.id, false, false, f.label).catch(() => {}))}
      trigger={
        <>
          <span className="max-w-[84px] truncate" style={{ fontFamily: `"${cssFamily(fam.id)}", Arial` }}>
            {fam.label}
          </span>
          <CaretDownBold size={12} />
        </>
      }
      panelClassName="w-[220px] p-1.5"
    >
      {(close) => (
        <div role="listbox" aria-label="Font" className="flex flex-col">
          {TEXT_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="option"
              aria-selected={f.id === value}
              className={cx("ed-menurow", f.id === value && "ed-menurow--on")}
              onClick={() => {
                onChange(f.id);
                close();
              }}
            >
              <span className="text-[17px]" style={{ fontFamily: `"${cssFamily(f.id)}", Arial` }}>
                {f.label}
              </span>
              <span className="text-help text-muted">{f.standsFor}</span>
            </button>
          ))}
        </div>
      )}
    </Pop>
  );
}

function WidthPicker({ value, onChange, label = "Line width" }: { value: number; onChange: (n: number) => void; label?: string }) {
  return (
    <Pop label={`${label} ${value} pt`} title={`${label}: ${value} pt`} className="ed-ctl--wide" trigger={<span className="text-sm tabular-nums">{value} pt</span>} panelClassName="w-[120px] p-1.5">
      {(close) => (
        <div role="listbox" aria-label={label} className="flex flex-col">
          {WIDTHS.map((w) => (
            <button key={w} type="button" role="option" aria-selected={w === value} className={cx("ed-menurow", w === value && "ed-menurow--on")} onClick={() => (onChange(w), close())}>
              <span className="w-10 tabular-nums">{w} pt</span>
              <span className="h-0 flex-1 border-t-ink" style={{ borderTopWidth: Math.max(1, w), borderTopStyle: "solid" }} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </Pop>
  );
}

export function Toggle({ label, on, onClick, icon, keys }: { label: string; on?: boolean; onClick: () => void; icon: ReactNode; keys?: string }) {
  return (
    <button type="button" className={cx("ed-ctl", on && "ed-ctl--on")} aria-label={label} aria-pressed={on} aria-keyshortcuts={keys} title={keys ? `${label} · ${keys}` : label} onClick={onClick}>
      {icon}
    </button>
  );
}

function Act({ label, onClick, icon, danger }: { label: string; onClick: () => void; icon: ReactNode; danger?: boolean }) {
  return (
    <button type="button" className={cx("ed-ctl", danger && "ed-ctl--danger")} aria-label={label} title={label} onClick={onClick}>
      {icon}
    </button>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="ed-seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.label}
          title={o.label}
          className={cx("ed-ctl", o.value === value && "ed-ctl--on")}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.value === value);
            const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            e.stopPropagation();
            const next = options[(i + d + options.length) % options.length];
            onChange(next.value);
            (e.currentTarget.parentElement?.children[(i + d + options.length) % options.length] as HTMLElement | undefined)?.focus();
          }}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

const MARK_OPTIONS: { value: MarkupKind; label: string; icon: ReactNode }[] = [
  { value: "highlight", label: "Highlight", icon: <HighlightBold size={18} /> },
  { value: "underline", label: "Underline", icon: <UnderlineBold size={18} /> },
  { value: "strike", label: "Strike-out", icon: <StrikeBold size={18} /> },
];

// ---- controls for a selection ----

type Control = { key: string; node: ReactNode };

function useSelectionControls(objs: EditorObject[]): { main: Control[]; more: MenuEntry[] } {
  const ctl = useCtl();
  const ids = objs.map((o) => o.id);
  const first = objs[0];
  const name = objs.length === 1 ? kindName(first).toLowerCase() : `${objs.length} objects`;
  const setDefaults = (patch: (d: ToolDefaults) => Partial<ToolDefaults>) => ctl.store.set((s) => ({ defaults: { ...s.defaults, ...patch(s.defaults) } }));

  /** Patches the selected objects of one kind (one undo step) and keeps it as the default. */
  const set = <K extends EditorObject["kind"]>(kind: K, patch: Partial<Extract<EditorObject, { kind: K }>>, label: string) => {
    const targets = objs.filter((o) => o.kind === kind).map((o) => o.id);
    ctl.update(targets, (o) => relayout({ ...o, ...patch } as EditorObject), label);
  };
  const del: Control = { key: "del", node: <Act label="Delete" icon={<TrashBold size={18} />} danger onClick={() => ctl.remove(ids)} /> };
  const dup: MenuEntry = { id: "dup", label: "Duplicate", icon: <CopyBold size={16} />, onSelect: () => ctl.duplicate(ids) };
  const z: MenuEntry[] = [
    { id: "fwd", label: "Bring forward", icon: <ForwardBold size={16} />, onSelect: () => ctl.reorder(ids, 1) },
    { id: "back", label: "Send backward", icon: <BackwardBold size={16} />, onSelect: () => ctl.reorder(ids, -1) },
  ];

  if (objs.some((o) => o.kind !== first.kind)) return { main: [del], more: [dup, ...z] };

  switch (first.kind) {
    case "text": {
      const t = first;
      return {
        main: [
          { key: "font", node: <FontPicker value={t.font} onChange={(font) => (set("text", { font }, "Change font"), setDefaults((d) => ({ text: { ...d.text, font } })))} /> },
          { key: "size", node: <SizeStepper value={t.size} onChange={(size) => (set("text", { size }, "Change size"), setDefaults((d) => ({ text: { ...d.text, size } })))} /> },
          { key: "b", node: <Toggle label="Bold" on={t.bold} icon={<BoldBold size={18} />} keys="Control+B" onClick={() => (set("text", { bold: !t.bold }, "Bold"), setDefaults((d) => ({ text: { ...d.text, bold: !t.bold } })))} /> },
          { key: "i", node: <Toggle label="Italic" on={t.italic} icon={<ItalicBold size={18} />} keys="Control+I" onClick={() => (set("text", { italic: !t.italic }, "Italic"), setDefaults((d) => ({ text: { ...d.text, italic: !t.italic } })))} /> },
          { key: "c", node: <ColorButton label="Text colour" testId="text-colour" value={t.color} onChange={(c) => c && (set("text", { color: c }, "Change colour"), setDefaults((d) => ({ text: { ...d.text, color: c } })))} /> },
          del,
        ],
        more: [
          { id: "u", label: t.underline ? "Remove underline" : "Underline", icon: <UnderlineBold size={16} />, onSelect: () => (set("text", { underline: !t.underline }, "Underline"), setDefaults((d) => ({ text: { ...d.text, underline: !t.underline } }))) },
          { id: "al", label: "Align left", icon: <AlignLeftBold size={16} />, onSelect: () => set("text", { align: "left" }, "Align left") },
          { id: "ac", label: "Align centre", icon: <AlignCenterBold size={16} />, onSelect: () => set("text", { align: "center" }, "Align centre") },
          { id: "ar", label: "Align right", icon: <AlignRightBold size={16} />, onSelect: () => set("text", { align: "right" }, "Align right") },
          dup,
          ...z,
        ],
      };
    }
    case "image":
      return {
        main: [
          { key: "rot", node: <Act label="Rotate 90°" icon={<RotateRightBold size={18} />} onClick={() => ctl.update(ids, (o) => ({ ...o, rot: ((("rot" in o ? o.rot : 0) + 90) % 360) }) as EditorObject, "Rotate image")} /> },
          {
            key: "op",
            node: (
              <Pop label={`Opacity ${Math.round(first.opacity * 100)}%`} title={`Opacity ${Math.round(first.opacity * 100)}%`} className="ed-ctl--wide" trigger={<span className="text-sm tabular-nums">{Math.round(first.opacity * 100)}%</span>} panelClassName="w-[200px] p-3">
                <label className="flex flex-col gap-2 text-sm">
                  Opacity
                  <input type="range" min={10} max={100} step={5} defaultValue={Math.round(first.opacity * 100)} onChange={(e) => set("image", { opacity: Number(e.target.value) / 100 }, "Change opacity")} />
                </label>
              </Pop>
            ),
          },
          { key: "dup", node: <Act label="Duplicate" icon={<CopyBold size={18} />} onClick={() => ctl.duplicate(ids)} /> },
          del,
        ],
        more: [
          {
            id: "aspect",
            label: "Reset aspect",
            onSelect: () =>
              ctl.update(ids, (o) => {
                if (o.kind !== "image") return o;
                const a = ctl.rt.assets[o.asset];
                return a ? { ...o, h: o.w * (a.h / a.w) } : o;
              }, "Reset aspect"),
          },
          ...z,
        ],
      };
    case "signature":
      return {
        main: [
          ...(first.sig.type !== "image" ? [{ key: "c", node: <ColorButton label="Ink colour" value={first.color} onChange={(c) => c && set("signature", { color: c }, "Change colour")} /> }] : []),
          { key: "dup", node: <Act label="Duplicate" icon={<CopyBold size={18} />} onClick={() => ctl.duplicate(ids)} /> },
          del,
        ],
        more: z,
      };
    case "shape":
    case "line": {
      const kind = first.kind;
      const stroke = first.kind === "shape" ? first.stroke : first.stroke;
      return {
        main: [
          { key: "s", node: <ColorButton label="Line colour" value={stroke} allowNone={kind === "shape"} onChange={(c) => (ctl.update(ids, (o) => ({ ...o, stroke: c ?? (o.kind === "line" ? "#000000" : null) }) as EditorObject, "Change line colour"), setDefaults((d) => ({ shapes: { ...d.shapes, stroke: c ?? d.shapes.stroke } })))} /> },
          ...(first.kind === "shape" ? [{ key: "f", node: <ColorButton label="Fill colour" palette={[...INK, ...MARKER]} value={first.fill} allowNone onChange={(c) => (set("shape", { fill: c }, "Change fill"), setDefaults((d) => ({ shapes: { ...d.shapes, fill: c } })))} /> }] : []),
          { key: "w", node: <WidthPicker value={first.width} onChange={(width) => (ctl.update(ids, (o) => ({ ...o, width }) as EditorObject, "Change width"), setDefaults((d) => ({ shapes: { ...d.shapes, width } })))} /> },
          del,
        ],
        more: [dup, ...z],
      };
    }
    case "markup":
      return {
        main: [
          { key: "k", node: <Seg label="Kind" value={first.type} options={MARK_OPTIONS} onChange={(type) => (set("markup", { type }, "Change mark"), setDefaults((d) => ({ mark: { ...d.mark, type } })))} /> },
          { key: "c", node: <ColorButton label="Mark colour" palette={first.type === "highlight" ? MARKER : INK} value={first.color} onChange={(c) => c && (set("markup", { color: c }, "Change colour"), setDefaults((d) => ({ mark: { ...d.mark, color: c } })))} /> },
          del,
        ],
        more: [],
      };
    case "ink":
      return {
        main: [
          { key: "c", node: <ColorButton label="Ink colour" palette={first.marker ? MARKER : INK} value={first.color} onChange={(c) => c && set("ink", { color: c }, "Change colour")} /> },
          { key: "w", node: <WidthPicker value={first.width} onChange={(width) => set("ink", { width }, "Change width")} /> },
          del,
        ],
        more: [dup],
      };
    case "whiteout":
      return {
        main: [
          { key: "c", node: <ColorButton label="Fill colour" palette={[{ name: "White", hex: "#ffffff" }, ...INK]} value={first.fill} onChange={(c) => c && set("whiteout", { fill: c }, "Change fill")} /> },
          { key: "bc", node: <ColorButton label="Border colour" value={first.border} allowNone onChange={(c) => set("whiteout", { border: c, borderWidth: c ? first.borderWidth || 1 : 0 }, "Change border")} /> },
          { key: "bw", node: <WidthPicker label="Border width" value={first.borderWidth} onChange={(borderWidth) => set("whiteout", { borderWidth, border: first.border ?? "#000000" }, "Change border")} /> },
          del,
        ],
        more: [dup, ...z],
      };
  }
  void name;
  return { main: [del], more: [] };
}

/** Text whose font, size or style changed needs its lines and box measured again. */
function relayout(o: EditorObject): EditorObject {
  if (o.kind !== "text") return o;
  const m = measurer(o.font, o.size, o.bold, o.italic);
  const lines = layoutText(o.text, o.wrap, m);
  const box = textBoxSize(lines, o.wrap, o.size, m);
  // Fonts load lazily: lay out again once the face is in (same step, no new undo entry).
  return { ...o, lines, w: box.w, h: box.h } satisfies TextObj;
}

function Bar({ controls, more, compact, label }: { controls: Control[]; more: MenuEntry[]; compact?: boolean; label: string }) {
  const max = compact ? 5 : 99;
  const shown = controls.slice(0, max);
  const overflow = controls.slice(max);
  const ref = useRef<HTMLDivElement>(null);
  // Roving: Left/Right move between controls (U-E4).
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if ((e.target as HTMLElement).matches("input")) return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(":scope > * > button, :scope > button, :scope > * > [role=radiogroup] > button, :scope .ed-stepper > *") ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    items[(i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return (
    <div ref={ref} role="toolbar" aria-label={label} className="ed-bar" onKeyDown={onKey}>
      {shown.map((c) => (
        <span key={c.key} className="contents">
          {c.node}
        </span>
      ))}
      {(more.length > 0 || overflow.length > 0) && (
        overflow.length ? (
          <Pop label="More" trigger={<MoreBold size={18} />} panelClassName="p-2">
            <div className="flex flex-wrap items-center gap-1">
              {overflow.map((c) => (
                <span key={c.key} className="contents">
                  {c.node}
                </span>
              ))}
              {more.map((m) => "id" in m && <button key={m.id} type="button" className="ed-menurow" onClick={m.onSelect}>{m.icon}{m.label}</button>)}
            </div>
          </Pop>
        ) : (
          <MenuButton label="More" items={more} className="ed-ctl" placement="bottom-end">
            <MoreBold size={18} />
          </MenuButton>
        )
      )}
    </div>
  );
}

/** Properties of the selection (popover ≥ 1024; the context strip uses `SelectionBar`). */
export function PropertiesPopover({ objs, anchor, pageHeight }: { objs: EditorObject[]; anchor: { left: number; top: number; width: number; height: number }; pageHeight: number }) {
  const { main, more } = useSelectionControls(objs);
  const below = anchor.top < 56;
  const name = objs.length === 1 ? kindName(objs[0]) : "Selection";
  return (
    <div data-popover className={cx("ed-popover", below && "ed-popover--below")} style={{ left: anchor.left + anchor.width / 2, top: below ? Math.min(pageHeight, anchor.top + anchor.height) + 10 : anchor.top - 10 }} onPointerDown={(e) => e.stopPropagation()}>
      <Bar controls={main} more={more} label={`${name} properties`} />
    </div>
  );
}

export function SelectionBar({ objs }: { objs: EditorObject[] }) {
  const { main, more } = useSelectionControls(objs);
  const name = objs.length === 1 ? kindName(objs[0]) : "Selection";
  return <Bar controls={main} more={more} compact label={`${name} properties`} />;
}

/** The active tool's defaults (top-bar centre slot ≥ 1024, context strip below). */
export function ToolOptions({ compact }: { compact?: boolean }) {
  const ctl = useCtl();
  const tool = useStore(ctl.store, (s) => s.tool);
  const d = useStore(ctl.store, (s) => s.defaults);
  const set = (patch: Partial<ToolDefaults>) => ctl.store.set((s) => ({ defaults: { ...s.defaults, ...patch } }));
  let controls: Control[] = [];
  switch (tool) {
    case "text":
      controls = [
        { key: "font", node: <FontPicker value={d.text.font} onChange={(font) => set({ text: { ...d.text, font } })} /> },
        { key: "size", node: <SizeStepper value={d.text.size ?? 12} onChange={(size) => set({ text: { ...d.text, size } })} /> },
        { key: "b", node: <Toggle label="Bold" on={d.text.bold} icon={<BoldBold size={18} />} onClick={() => set({ text: { ...d.text, bold: !d.text.bold } })} /> },
        { key: "i", node: <Toggle label="Italic" on={d.text.italic} icon={<ItalicBold size={18} />} onClick={() => set({ text: { ...d.text, italic: !d.text.italic } })} /> },
        { key: "c", node: <ColorButton label="Text colour" value={d.text.color} onChange={(c) => c && set({ text: { ...d.text, color: c } })} /> },
      ];
      break;
    case "mark":
      controls = [
        { key: "k", node: <Seg label="Mark" value={d.mark.type} options={MARK_OPTIONS} onChange={(type) => set({ mark: { type, color: type === "highlight" ? (MARKER.some((m) => m.hex === d.mark.color) ? d.mark.color : MARKER[0].hex) : INK.some((m) => m.hex === d.mark.color) ? d.mark.color : INK[2].hex } })} /> },
        { key: "c", node: <ColorButton label="Mark colour" testId="mark-colour" palette={d.mark.type === "highlight" ? MARKER : INK} value={d.mark.color} onChange={(c) => c && set({ mark: { ...d.mark, color: c } })} /> },
      ];
      break;
    case "draw":
      controls = [
        { key: "k", node: <Seg label="Pen or marker" value={d.draw.marker ? "marker" : "pen"} options={[{ value: "pen", label: "Pen", icon: <PenBold size={18} /> }, { value: "marker", label: "Marker", icon: <MarkerBold size={18} /> }]} onChange={(v) => set({ draw: { ...d.draw, marker: v === "marker" } })} /> },
        { key: "c", node: d.draw.marker ? <ColorButton label="Marker colour" palette={MARKER} value={d.draw.markerColor} onChange={(c) => c && set({ draw: { ...d.draw, markerColor: c } })} /> : <ColorButton label="Pen colour" value={d.draw.color} onChange={(c) => c && set({ draw: { ...d.draw, color: c } })} /> },
        ...(!d.draw.marker
          ? [{ key: "w", node: <Seg label="Width" value={d.draw.width} options={(["S", "M", "L"] as const).map((w) => ({ value: w, label: { S: "Thin", M: "Medium", L: "Thick" }[w], icon: <span className="ed-wdot" data-w={w} aria-hidden="true" /> }))} onChange={(width) => set({ draw: { ...d.draw, width } })} /> }]
          : []),
      ];
      break;
    case "shapes":
      controls = [
        {
          key: "k",
          node: (
            <Seg
              label="Shape"
              value={d.shapes.shape}
              options={[
                { value: "rect", label: "Rectangle", icon: <SquareBold size={18} /> },
                { value: "ellipse", label: "Ellipse", icon: <CircleBold size={18} /> },
                { value: "line", label: "Line", icon: <LineBold size={18} /> },
                { value: "arrow", label: "Arrow", icon: <ArrowBold size={18} /> },
              ]}
              onChange={(shape) => set({ shapes: { ...d.shapes, shape } })}
            />
          ),
        },
        { key: "s", node: <ColorButton label="Line colour" value={d.shapes.stroke} onChange={(c) => c && set({ shapes: { ...d.shapes, stroke: c } })} /> },
        ...(d.shapes.shape === "rect" || d.shapes.shape === "ellipse" ? [{ key: "f", node: <ColorButton label="Fill colour" palette={[...INK, ...MARKER]} value={d.shapes.fill} allowNone onChange={(c) => set({ shapes: { ...d.shapes, fill: c } })} /> }] : []),
        { key: "w", node: <WidthPicker value={d.shapes.width} onChange={(width) => set({ shapes: { ...d.shapes, width } })} /> },
      ];
      break;
    case "whiteout":
      controls = [
        {
          key: "c",
          node: (
            <ColorButton
              label="Whiteout colour"
              palette={[{ name: "White", hex: "#ffffff" }, ...INK]}
              value={d.whiteout.fill === "page" ? null : d.whiteout.fill}
              extra={{ label: "Page colour", value: "page", active: d.whiteout.fill === "page", onPick: () => set({ whiteout: { fill: "page" } }) }}
              onChange={(c) => c && set({ whiteout: { fill: c } })}
            />
          ),
        },
        {
          key: "warn",
          node: (
            <span className="ed-warn" title="Whiteout covers what is under it. The content is still in the file and can be recovered, so don't use it to remove private information.">
              <WarningBold size={16} aria-hidden="true" />
              <span>Hides content; doesn&rsquo;t delete it</span>
            </span>
          ),
        },
      ];
      break;
    case "sign":
      controls = [{ key: "role", node: <SignRole /> }];
      break;
  }
  if (!controls.length) return compact ? null : <div className="ed-bar ed-bar--empty" aria-hidden="true" />;
  return (
    <div key={tool} className="ed-options">
      <Bar controls={controls} more={[]} compact={compact} label={`${tool} options`} />
    </div>
  );
}

function SignRole() {
  const ctl = useCtl();
  const role = useStore(ctl.store, (s) => s.defaults.sign.role);
  return (
    <div role="group" aria-label="Sign" className="ed-seg">
      {(["signature", "initials"] as const).map((r) => (
        <button key={r} type="button" className={cx("ed-ctl ed-ctl--text", role === r && "ed-ctl--on")} aria-pressed={role === r} onClick={() => (ctl.store.set((s) => ({ defaults: { ...s.defaults, sign: { role: r } } })), ctl.openSign?.(r))}>
          {r === "signature" ? "Signature" : "Initials"}
        </button>
      ))}
    </div>
  );
}

export { shallowArray };
