"use client";
/**
 * Form tool options (U-F2): the kind of field to draw, then Detect and Tab order. Sits in the
 * top bar's tool-options slot on wide screens and in the context strip below 1024 px.
 */
import { memo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { CheckboxIcon, DetectIcon, DropdownIcon, ListIcon, MultilineIcon, RadioIcon, SignatureIcon, TabOrderIcon, TextFieldIcon } from "./icons";
import "./forms.css";

/** What the Form tool draws next. "multiline" is a text field with Multi-line on. */
export type DrawKind = "text" | "multiline" | "checkbox" | "radio" | "dropdown" | "list" | "signature";

export const DRAW_KINDS: { value: DrawKind; label: string; icon: ReactNode }[] = [
  { value: "text", label: "Text field", icon: <TextFieldIcon /> },
  { value: "multiline", label: "Multi-line text", icon: <MultilineIcon /> },
  { value: "checkbox", label: "Checkbox", icon: <CheckboxIcon /> },
  { value: "radio", label: "Radio buttons", icon: <RadioIcon /> },
  { value: "dropdown", label: "Dropdown", icon: <DropdownIcon /> },
  { value: "list", label: "List", icon: <ListIcon /> },
  { value: "signature", label: "Signature field", icon: <SignatureIcon /> },
];

export type FormToolOptionsProps = {
  kind: DrawKind;
  onKind: (kind: DrawKind) => void;
  /** Detect fields is running or its proposals are under review. */
  detecting?: boolean;
  onDetect: () => void;
  tabOrderOpen?: boolean;
  onTabOrder: () => void;
};

export const FormToolOptions = memo(function FormToolOptions({ kind, onKind, detecting, onDetect, tabOrderOpen, onTabOrder }: FormToolOptionsProps) {
  return (
    <div className="bf-formopts" data-testid="form-tool-options">
      <KindPicker kind={kind} onKind={onKind} />
      <span className="bf-divider" aria-hidden />
      <button type="button" className="bf-optbtn" aria-pressed={!!detecting} onClick={onDetect} title="Find the blanks on every page and propose fields" aria-label="Detect fields">
        <DetectIcon />
        <span>Detect</span>
      </button>
      <button type="button" className="bf-optbtn" aria-pressed={!!tabOrderOpen} onClick={onTabOrder}>
        <TabOrderIcon />
        <span>Tab order</span>
      </button>
    </div>
  );
});

/** Icon radio group with a roving tab stop; arrow keys move and pick. Names show as tooltips. */
function KindPicker({ kind, onKind }: { kind: DrawKind; onKind: (k: DrawKind) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, DRAW_KINDS.findIndex((k) => k.value === kind));
  const onKeyDown = (e: KeyboardEvent) => {
    const n = DRAW_KINDS.length;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (current + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (current - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onKind(DRAW_KINDS[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Field to add" className="bf-kinds" onKeyDown={onKeyDown}>
      {DRAW_KINDS.map((k, i) => (
        <button
          key={k.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === current}
          aria-label={k.label}
          title={k.label}
          tabIndex={i === current ? 0 : -1}
          className="bf-kind"
          onClick={() => onKind(k.value)}
        >
          {k.icon}
        </button>
      ))}
    </div>
  );
}

export type FieldsChipProps = {
  /** Fields a user can fill (read-only ones excluded). */
  count: number;
  /** Required fields still empty; shown instead of the count once the user has tried to download. */
  requiredEmpty: number;
  nudge: boolean;
  /** Jumps to the next empty field (required first when nudging). */
  onJump: () => void;
};

/** "12 fields" in the top bar; "2 required empty" after a download with gaps (U-F1, AC-233). Never blocks. */
export const FieldsChip = memo(function FieldsChip({ count, requiredEmpty, nudge, onJump }: FieldsChipProps) {
  if (!count) return null;
  const warn = nudge && requiredEmpty > 0;
  return (
    <button type="button" className="bf-fieldschip" data-warn={warn || undefined} onClick={onJump} aria-label={`${warn ? `${requiredEmpty} required ${requiredEmpty === 1 ? "field is" : "fields are"} empty` : `${count} ${count === 1 ? "field" : "fields"}`}. Go to the next empty field`}>
      {warn && <span aria-hidden>⚠</span>}
      {warn ? `${requiredEmpty} required empty` : `${count} ${count === 1 ? "field" : "fields"}`}
    </button>
  );
});
