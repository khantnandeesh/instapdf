"use client";
import { useEffect, useState } from "react";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn, ReadyFile } from "@/components/tool-flow/types";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { useLiveState } from "@/components/ui/live-state";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextInput } from "@/components/ui/TextInput";
import { FIELD_LIMITS, fieldNameError, STANDARD_FIELDS, type MetadataField } from "@/lib/pdf/metadata-options";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { metadataCopy as c } from "./copy";
import "./doc-tools.css";

const tool = flowTool("edit-pdf-metadata");

type Mode = "edit" | "remove";
const MODES: { value: Mode; label: string }[] = [
  { value: "edit", label: c.edit },
  { value: "remove", label: c.remove },
];
/** `loaded`: the names of the own fields the file came with, so one the reader deletes is taken out of the file. */
type Form = { mode: Mode; standard: Record<string, string>; own: MetadataField[]; loaded: string[] };
const empty: Form = { mode: "edit", standard: {}, own: [], loaded: [] };
const isStandard = (name: string) => (STANDARD_FIELDS as readonly string[]).includes(name);
/** Short fields share a row; the ones people write sentences in get the full width. */
const WIDE = new Set(["Title", "Keywords"]);

/** The first problem among the maker's own fields, or null. A row with no name and no value is ignored. */
export function ownFieldsError(own: readonly MetadataField[]): string | null {
  for (const [i, f] of own.entries()) {
    if (!f.name.trim() && !f.value.trim()) continue;
    const error = fieldNameError(f.name, [...STANDARD_FIELDS, ...own.filter((_, k) => k < i).map((o) => o.name.trim())]);
    if (error) return c.errors[error];
  }
  return null;
}

/** Reads the first file's details into the form once it is ready (and again when another file takes its place). */
function Prefill({ file, onLoad }: { file: ReadyFile | undefined; onLoad: (fields: MetadataField[]) => void }) {
  const key = file ? `${file.id}:${file.password ?? ""}` : "";
  useEffect(() => {
    if (!file) return;
    let live = true;
    void import("@/lib/pdf/metadata-read")
      .then((m) => m.readDocFields(file.source, file.password))
      .then((fields) => live && onLoad(fields))
      .catch(() => live && onLoad([]));
    return () => {
      live = false;
    };
    // The file's identity is the key: the callback and the object change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/**
 * Metadata (spec F10 §3): the file's details in a form, filled in from the file. Edit and save
 * them, add fields of your own, or take every detail out. With several files, all get the same.
 */
export function MetadataTool() {
  const [form, setForm, live] = useLiveState<Form>(empty);
  const [loaded, setLoaded] = useState(false);
  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const setOwn = (i: number, p: Partial<MetadataField>) => setForm((f) => ({ ...f, own: f.own.map((o, k) => (k === i ? { ...o, ...p } : o)) }));

  const process: ProcessFn = async (files, signal, onProgress) => {
    const f = live.current;
    const all = [...STANDARD_FIELDS.map((name) => ({ name: name as string, value: f.standard[name] ?? "" })), ...f.own].filter((x) => x.name.trim());
    const fields = all.filter((x) => x.value.trim());
    // Out go the fields the reader emptied and the file's own fields the reader deleted or renamed. Anything the form never showed stays.
    const kept = new Set(fields.map((x) => x.name.trim()));
    const remove = [...all.filter((x) => !x.value.trim()).map((x) => x.name.trim()), ...f.loaded].filter((name) => !kept.has(name));
    const out = await runInWorker(
      { kind: "metadata", zipName: tool.flow.outputName?.(files.map((x) => x.name)) ?? "", files: files.map((x) => ({ name: x.name, source: x.source, password: x.password })), ...(f.mode === "remove" ? { mode: "remove" as const } : { mode: "update" as const, fields, remove }) },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };

  const mode = (where: string) => <SegmentedControl look="tabs" label={c.mode} value={form.mode} options={MODES} onChange={(m) => patch({ mode: m })} className="shrink-0" data-where={where} />;
  const fields = (where: string, many: boolean) =>
    form.mode === "remove" ? (
      <p className="ip-doc-note">{c.removeNote}</p>
    ) : (
      <div className="flex flex-col gap-2.5" aria-busy={!loaded || undefined}>
        <div className="ip-doc-fields">
          {STANDARD_FIELDS.map((name) => (
            <TextInput key={name} id={`meta-${name}-${where}`} label={c.fields[name]} value={form.standard[name] ?? ""} maxLength={FIELD_LIMITS.value} onChange={(value) => setForm((f) => ({ ...f, standard: { ...f.standard, [name]: value } }))} className={WIDE.has(name) ? "ip-doc-wide" : undefined} />
          ))}
        </div>
        {form.own.map((o, i) => (
          <div key={i} className="ip-doc-own">
            <TextInput id={`meta-own-name-${i}-${where}`} label={c.name} hideLabel={i > 0} value={o.name} maxLength={FIELD_LIMITS.name} onChange={(name) => setOwn(i, { name })} />
            <TextInput id={`meta-own-value-${i}-${where}`} label={c.value} hideLabel={i > 0} value={o.value} maxLength={FIELD_LIMITS.value} onChange={(value) => setOwn(i, { value })} />
            <IconButton label={c.removeField(o.name.trim() || c.name.toLowerCase())} icon={<TrashIcon />} size="sm" className="mb-[5px]" onClick={() => setForm((f) => ({ ...f, own: f.own.filter((_, k) => k !== i) }))} />
          </div>
        ))}
        {form.own.length < FIELD_LIMITS.custom && (
          <Button variant="soft" iconStart={<PlusIcon />} className="self-start" data-testid={`meta-add-${where}`} onClick={() => setForm((f) => ({ ...f, own: [...f.own, { name: "", value: "" }] }))}>
            {c.add}
          </Button>
        )}
        {many && <p className="ip-doc-note">{c.many}</p>}
      </div>
    );

  return (
    <ToolFlow
      tool={tool}
      process={process}
      canRun={() => (form.mode === "edit" ? (ownFieldsError(form.own) ?? true) : true)}
      onReset={() => {
        setForm(empty);
        setLoaded(false);
      }}
      renderMore={(ctx) => (form.mode === "edit" ? <MoreOptions changed={0} disabled={ctx.disabled} content={{ extra: fields("more", ctx.readyFiles.length > 1) }} /> : null)}
      renderOptions={(ctx) => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-bar:flex-1">
          <Prefill
            file={ctx.readyFiles[0]}
            onLoad={(found) => {
              setForm((f) => ({ mode: f.mode, standard: Object.fromEntries(found.filter((x) => isStandard(x.name)).map((x) => [x.name, x.value])), own: found.filter((x) => !isStandard(x.name)).slice(0, FIELD_LIMITS.custom), loaded: found.filter((x) => !isStandard(x.name)).slice(0, FIELD_LIMITS.custom).map((x) => x.name) }));
              setLoaded(true);
            }}
          />
          <div className="ip-opt-bar">{mode("bar")}</div>
          <div className="ip-opt-side">
            <Group n={1} title={c.step}>
              {mode("side")}
              {fields("side", ctx.readyFiles.length > 1)}
            </Group>
          </div>
        </div>
      )}
    />
  );
}
