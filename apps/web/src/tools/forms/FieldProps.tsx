"use client";
/**
 * Field properties popover (U-F4, AC-234 to AC-236): the main controls for the selected field's
 * kind in one row, the rest under "More". Every change goes out as a new form state with a short
 * label for the undo history; the popover itself holds only what is being typed.
 */
import { memo, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { checkFieldName, propsFor, renameField, setCheckboxOn, setDefaultValue, setOptions, suggestsMultiline, type PropKey } from "@/lib/forms/edit";
import { addRadioButton, deleteField, duplicateField, repeatOnAllPages, setMaxLen, setRadioValue, updateField } from "@/lib/forms/model";
import type { FieldStyle, FormField, FormPage, FormState } from "@/lib/forms/types";
import "./forms.css";

export type FieldPropsProps = {
  form: FormState;
  fieldId: string;
  /** The widget that was clicked (radio: which button's value to edit). */
  widgetId?: string;
  pages: FormPage[];
  onChange: (next: FormState, label: string) => void;
  /** After a delete, or Escape. */
  onClose: () => void;
};

const KIND_LABEL: Record<FormField["kind"], string> = {
  text: "Text field",
  checkbox: "Checkbox",
  radio: "Radio group",
  dropdown: "Dropdown",
  list: "List",
  signature: "Signature",
  button: "Button",
};

export const FieldProps = memo(function FieldProps({ form, fieldId, widgetId, pages, onChange, onClose }: FieldPropsProps) {
  const f = form.fields.find((x) => x.id === fieldId);
  const uid = useId();
  const [more, setMore] = useState(false);
  if (!f) return null;
  const widget = f.widgets.find((w) => w.id === widgetId) ?? f.widgets[0];
  const { main, more: extra } = propsFor(f.kind);
  const patch = (p: Partial<FormField>, label: string) => onChange(updateField(form, f.id, p), label);
  const style = (p: Partial<FieldStyle>, label: string) => patch({ style: { ...f.style, ...p } }, label);

  const control = (k: PropKey): ReactNode => {
    switch (k) {
      case "name":
        return <NameInput key={k} id={`${uid}-name`} form={form} field={f} label={f.kind === "radio" ? "Group name" : "Name"} onChange={onChange} />;
      case "required":
        return <Toggle key={k} label="Required" checked={f.required} onChange={(v) => patch({ required: v }, v ? "Make field required" : "Make field optional")} />;
      case "readOnly":
        return <Toggle key={k} label="Read-only" checked={f.readOnly} onChange={(v) => patch({ readOnly: v }, v ? "Make field read-only" : "Make field editable")} />;
      case "multiline":
        return <Toggle key={k} label="Multi-line" checked={f.multiline} disabled={f.comb} onChange={(v) => patch({ multiline: v }, "Change multi-line")} />;
      case "comb":
        return <Toggle key={k} label={f.maxLen ? `Comb (${f.maxLen} boxes)` : "Comb (set a max length)"} checked={f.comb} disabled={!f.maxLen} onChange={(v) => patch({ comb: v, multiline: v ? false : f.multiline }, "Change comb")} />;
      case "editable":
        return <Toggle key={k} label="Allow own text" checked={f.editable} onChange={(v) => patch({ editable: v }, "Change dropdown typing")} />;
      case "multiSelect":
        return <Toggle key={k} label="Pick more than one" checked={f.multiSelect} onChange={(v) => patch({ multiSelect: v, value: v ? f.value : (f.value as string[]).slice(0, 1) }, "Change multi-select")} />;
      case "size":
        return (
          <div key={k} className="bf-prop bf-prop--tight" role="group" aria-label="Text size">
            <span className="bf-prop-label">Size</span>
            <button type="button" className="bf-step" aria-label="Smaller text" onClick={() => style({ fontSize: Math.max(4, (f.style.fontSize || 12) - 1) }, "Change text size")}>−</button>
            <span className="bf-step-value" aria-live="polite">{f.style.fontSize ? `${f.style.fontSize} pt` : "Auto"}</span>
            <button type="button" className="bf-step" aria-label="Larger text" onClick={() => style({ fontSize: Math.min(72, (f.style.fontSize || 12) + 1) }, "Change text size")}>+</button>
            {f.style.fontSize > 0 && (
              <button type="button" className="bf-link" onClick={() => style({ fontSize: 0 }, "Fit text to field")}>Auto</button>
            )}
          </div>
        );
      case "color":
        return <ColorInput key={k} label="Colour" value={f.style.color} onChange={(c) => style({ color: c ?? "#000000" }, "Change text colour")} />;
      case "border":
        return (
          <div key={k} className="bf-propgroup">
            <ColorInput label="Border" value={f.style.border} allowNone onChange={(c) => style({ border: c, borderWidth: c && !f.style.borderWidth ? 1 : f.style.borderWidth }, "Change border")} />
            {f.style.border && (
              <div className="bf-prop bf-prop--tight" role="radiogroup" aria-label="Border width">
                <span className="bf-prop-label">Width</span>
                {[1, 2, 3].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={(f.style.borderWidth || 1) === n} aria-label={`${n} pt`} className="bf-seg" onClick={() => style({ borderWidth: n }, "Change border width")}>
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      case "background":
        return <ColorInput key={k} label="Fill" value={f.style.background} allowNone onChange={(c) => style({ background: c }, "Change fill")} />;
      case "align":
        return (
          <div key={k} className="bf-prop" role="radiogroup" aria-label="Align text">
            <span className="bf-prop-label">Align</span>
            {(["left", "center", "right"] as const).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={f.style.align === a} className="bf-seg" onClick={() => style({ align: a }, "Align text")}>
                {a === "left" ? "Left" : a === "center" ? "Centre" : "Right"}
              </button>
            ))}
          </div>
        );
      case "tooltip":
        return <TextInput key={k} label="Tooltip" value={f.tooltip} placeholder="For screen readers" onCommit={(v) => patch({ tooltip: v }, "Change tooltip")} />;
      case "maxLen":
        return (
          <TextInput
            key={k}
            label="Max length"
            inputMode="numeric"
            value={f.maxLen == null ? "" : String(f.maxLen)}
            placeholder="None"
            onCommit={(v) => onChange(setMaxLen(form, f.id, /^\d+$/.test(v.trim()) ? Number(v.trim()) : null), "Change max length")}
          />
        );
      case "default":
        return <DefaultControl key={k} form={form} field={f} widgetOn={widget?.on} onChange={onChange} />;
      case "exportValue":
        return <TextInput key={k} label="Value when checked" value={widget?.on ?? "Yes"} onCommit={(v) => onChange(setCheckboxOn(form, f.id, v), "Change checkbox value")} />;
      case "buttonValue":
        return widget ? (
          <TextInput key={k} label="This button's value" value={widget.on ?? ""} onCommit={(v) => v.trim() && !f.widgets.some((w) => w.id !== widget.id && w.on === v.trim()) && onChange(setRadioValue(form, widget.id, v.trim()), "Change button value")} />
        ) : null;
      case "addButton":
        return (
          <button key={k} type="button" className="bf-act" onClick={() => onChange(addRadioButton(form, f.id), "Add radio button")}>
            Add button
          </button>
        );
      case "options":
        return <OptionsEditor key={k} id={`${uid}-opts`} field={f} onCommit={(lines) => onChange(setOptions(form, f.id, lines), "Change options")} />;
      case "repeat":
        return pages.length > 1 ? (
          <button key={k} type="button" className="bf-act" onClick={() => onChange(repeatOnAllPages(form, f.id, pages), "Repeat field on all pages")}>
            Repeat on all pages
          </button>
        ) : null;
      case "duplicate":
        return (
          <button key={k} type="button" className="bf-act" onClick={() => onChange(duplicateField(form, f.id).state, "Duplicate field")}>
            Duplicate
          </button>
        );
    }
  };

  return (
    <div
      className="bf-props"
      role="dialog"
      aria-label={`${KIND_LABEL[f.kind]} ${f.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="bf-props-row">
        {main.map(control)}
        <div className="bf-props-actions">
          <button type="button" className="bf-act" aria-expanded={more} aria-controls={`${uid}-more`} onClick={() => setMore(!more)}>
            More
          </button>
          <button
            type="button"
            className="bf-act bf-act--danger"
            onClick={() => {
              onChange(deleteField(form, f.id), "Delete field");
              onClose();
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {suggestsMultiline(f, widget) && (
        <button type="button" className="bf-hint" onClick={() => patch({ multiline: true }, "Make field multi-line")}>
          Make multi-line
        </button>
      )}
      {more && (
        <div id={`${uid}-more`} className="bf-props-more">
          {extra.map(control)}
        </div>
      )}
    </div>
  );
});

/**
 * Commits a draft that was typed but not yet committed when the input goes away: a click on the
 * page that closes the popover, or Escape (G-10, G-11). Runs once, on unmount.
 */
function useCommitOnUnmount(pending: () => void) {
  const latest = useRef(pending);
  latest.current = pending;
  useEffect(() => () => latest.current(), []);
}

function NameInput({ id, form, field, label, onChange }: { id: string; form: FormState; field: FormField; label: string; onChange: FieldPropsProps["onChange"] }) {
  const [draft, setDraft] = useState(field.name);
  useEffect(() => setDraft(field.name), [field.name]);
  const check = draft === field.name ? ({ ok: true } as const) : checkFieldName(form, field.id, draft);
  const done = useRef(field.name);
  const commit = (name: string) => {
    done.current = name;
    const r = renameField(form, field.id, name);
    if (r.check.ok && r.state !== form) onChange(r.state, "Rename field");
  };
  useCommitOnUnmount(() => {
    if (draft !== field.name && draft !== done.current && check.ok) commit(draft);
  });
  return (
    <div className="bf-prop bf-prop--name">
      <label htmlFor={id} className="bf-prop-label">{label}</label>
      <input
        id={id}
        className="bf-text"
        value={draft}
        spellCheck={false}
        aria-invalid={!check.ok || undefined}
        aria-describedby={!check.ok ? `${id}-note` : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => (check.ok ? commit(draft) : undefined)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && check.ok) commit(draft);
        }}
      />
      {!check.ok && (
        <p id={`${id}-note`} className="bf-note">
          <span aria-hidden>⚠</span> {check.reason === "empty" ? "A name is needed." : check.reason === "dot" ? "Names cannot have a dot." : "Another field has this name."}{" "}
          <button
            type="button"
            className="bf-link"
            onClick={() => {
              setDraft(check.suggestion);
              commit(check.suggestion);
            }}
          >
            Use {check.suggestion}
          </button>
        </p>
      )}
    </div>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="bf-prop bf-toggle" data-disabled={disabled || undefined}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function TextInput({ label, value, placeholder, inputMode, onCommit }: { label: string; value: string; placeholder?: string; inputMode?: "numeric"; onCommit: (v: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const done = useRef(value);
  const commit = () => {
    if (draft === value || draft === done.current) return;
    done.current = draft;
    onCommit(draft);
  };
  useCommitOnUnmount(commit);
  return (
    <div className="bf-prop">
      <label htmlFor={id} className="bf-prop-label">{label}</label>
      <input id={id} className="bf-text" value={draft} placeholder={placeholder} inputMode={inputMode} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </div>
  );
}

function ColorInput({ label, value, allowNone, onChange }: { label: string; value: string | null; allowNone?: boolean; onChange: (v: string | null) => void }) {
  const id = useId();
  return (
    <div className="bf-prop">
      <label htmlFor={id} className="bf-prop-label">{label}</label>
      <input id={id} type="color" className="bf-color" value={value ?? "#ffffff"} data-none={value == null || undefined} onChange={(e) => onChange(e.target.value)} />
      {allowNone && value != null && (
        <button type="button" className="bf-link" onClick={() => onChange(null)}>
          None
        </button>
      )}
    </div>
  );
}

function DefaultControl({ form, field: f, widgetOn, onChange }: { form: FormState; field: FormField; widgetOn?: string; onChange: FieldPropsProps["onChange"] }) {
  if (f.kind === "checkbox")
    return <Toggle label="Checked by default" checked={!!f.defaultValue} onChange={(v) => onChange(setDefaultValue(form, f.id, v ? (widgetOn ?? "Yes") : ""), "Change default")} />;
  if (f.kind === "radio")
    return <Toggle label="This button by default" checked={!!widgetOn && f.defaultValue === widgetOn} onChange={(v) => onChange(setDefaultValue(form, f.id, v ? (widgetOn ?? "") : ""), "Change default")} />;
  return <TextInput label="Default value" value={String(f.defaultValue)} onCommit={(v) => onChange(setDefaultValue(form, f.id, v), "Change default")} />;
}

/** One option per line; the field's default is picked below the box. */
function OptionsEditor({ id, field, onCommit }: { id: string; field: FormField; onCommit: (lines: string[]) => void }) {
  const text = field.options.join("\n");
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  return (
    <div className="bf-prop bf-prop--options">
      <label htmlFor={id} className="bf-prop-label">Options, one per line</label>
      <textarea id={id} className="bf-text bf-options" rows={Math.min(6, Math.max(3, field.options.length))} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== text && onCommit(draft.split(/\r?\n/))} />
    </div>
  );
}
