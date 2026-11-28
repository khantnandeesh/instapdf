"use client";
import { useRef, useState } from "react";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Step } from "@/components/page-select/Step";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { cx } from "@/components/ui/cx";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { ALLOW_ALL, canProtect, ownerSameAsOpen, passwordTooLong, passwordUnfit, restricts, type ProtectAllow, type ProtectOptions, type ProtectStrength } from "@/lib/pdf/protect-options";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { protectCopy as c } from "./copy";

const tool = flowTool("protect-pdf");
const PRINTS = ["any", "low", "none"] as const;
const EDITS = ["any", "comment", "forms", "pages", "none"] as const;
const STRENGTHS = ["aes256", "aes128"] as const;

/** Why the options cannot run yet, or true. Passwords are never remembered between visits. */
export function protectCheck(o: ProtectOptions): true | string {
  if (!canProtect(o)) return c.needs;
  if (passwordTooLong(o.openPassword, o.strength) || passwordTooLong(o.ownerPassword, o.strength)) return c.tooLong;
  if (passwordUnfit(o.openPassword, o.strength) || passwordUnfit(o.ownerPassword, o.strength)) return c.unfit;
  // The same password for both would open the file with every right, so the restrictions would mean nothing.
  if (ownerSameAsOpen(o)) return c.sameAsOpen;
  return true;
}

/** Protect (spec F11 §2): a password to open the file, and what people may do with it. A settings tool (F25 §4). */
export function ProtectTool() {
  const [openPassword, setOpenPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [allow, setAllow] = useState<ProtectAllow>(ALLOW_ALL);
  const [strength, setStrength] = useState<ProtectStrength>("aes256");
  const options: ProtectOptions = { openPassword, ownerPassword: restricts(allow) ? ownerPassword : "", allow, strength };
  const live = useRef(options);
  live.current = options;

  const process: ProcessFn = async (files, signal, onProgress) => {
    const out = await runInWorker(
      { kind: "protect", zipName: tool.flow.outputName?.(files.map((f) => f.name)) ?? "", files: files.map((f) => ({ name: f.name, source: f.source, password: f.password })), options: live.current },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };

  const copying = (id: string) => ({ id: `${id}-copy`, label: c.copy, value: allow.copy, onChange: (copy: boolean) => setAllow((a) => ({ ...a, copy })) });
  const printing = (id: string) => <Select id={`${id}-print`} label={c.print} hideLabel={id === "side"} value={allow.print} options={PRINTS.map((value) => ({ value, label: c.prints[value] }))} onChange={(print) => setAllow((a) => ({ ...a, print }))} />;
  const editing = (id: string) => <Select id={`${id}-edit`} label={c.edit} hideLabel={id === "side"} value={allow.edit} options={EDITS.map((value) => ({ value, label: c.edits[value] }))} onChange={(edit) => setAllow((a) => ({ ...a, edit }))} />;
  const cipher = (id: string) => <Select id={`${id}-strength`} label={c.strength} hideLabel={id === "side"} value={strength} options={STRENGTHS.map((value) => ({ value, label: c.strengths[value] }))} onChange={setStrength} />;
  // Always in place and last, shown once something is switched off: the panel and the sheet never shift (polish rules).
  const owner = (id: string) => (
    <div className={cx(!restricts(allow) && "invisible")} aria-hidden={!restricts(allow) || undefined} inert={!restricts(allow)}>
      <PasswordInput id={`${id}-owner`} label={c.owner} placeholder={c.ownerPlaceholder} value={ownerPassword} onChange={setOwnerPassword} autoComplete="new-password" />
    </div>
  );
  const changed = Number(allow.print !== "any") + Number(!allow.copy) + Number(allow.edit !== "any") + Number(strength !== "aes256");

  return (
    <ToolFlow
      tool={tool}
      process={process}
      canRun={() => protectCheck(options)}
      onReset={() => {
        setOpenPassword("");
        setOwnerPassword("");
        setAllow(ALLOW_ALL);
        setStrength("aes256");
      }}
      renderMore={(ctx) => <MoreOptions changed={changed} disabled={ctx.disabled} content={{
            togglesTitle: c.stepAllow,
            toggles: [copying("more")],
            extra: (
              <div className="flex flex-col gap-3.5">
                {printing("more")}
                {editing("more")}
                {cipher("more")}
                {owner("more")}
              </div>
            ),
          }} />}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-7 dock-bar:flex-1">
          <div className="flex min-w-0 flex-col gap-3.5 dock-bar:flex-1">
            <Step n={1}>{c.stepPassword}</Step>
            <PasswordInput id="protect-open" label={c.password} placeholder={c.passwordPlaceholder} value={openPassword} onChange={setOpenPassword} autoComplete="new-password" />
          </div>
          <div className="hidden flex-col gap-1.5 dock-side:flex">
            <Step n={2}>{c.stepAllow}</Step>
            <div className="flex flex-col gap-3">
              {printing("side")}
              {editing("side")}
              <Switch {...(({ value, ...t }) => ({ ...t, checked: value }))(copying("side"))} spread />
              {cipher("side")}
              {owner("side")}
            </div>
          </div>
        </div>
      )}
    />
  );
}
