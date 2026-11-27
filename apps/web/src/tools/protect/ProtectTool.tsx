"use client";
import { useRef, useState } from "react";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Step } from "@/components/page-select/Step";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { cx } from "@/components/ui/cx";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Switch } from "@/components/ui/Switch";
import { ALLOW_ALL, canProtect, ownerSameAsOpen, passwordTooLong, restricts, type ProtectAllow, type ProtectOptions } from "@/lib/pdf/protect-options";
import { runInWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { protectCopy as c } from "./copy";

const tool = flowTool("protect-pdf");
const RIGHTS = ["print", "copy", "edit"] as const;

/** Why the options cannot run yet, or true. Passwords are never remembered between visits. */
export function protectCheck(o: ProtectOptions): true | string {
  if (!canProtect(o)) return c.needs;
  if (passwordTooLong(o.openPassword) || passwordTooLong(o.ownerPassword)) return c.tooLong;
  // The same password for both would open the file with every right, so the restrictions would mean nothing.
  if (ownerSameAsOpen(o)) return c.sameAsOpen;
  return true;
}

/** Protect (spec F11 §2): a password to open the file, and what people may do with it. A settings tool (F25 §4). */
export function ProtectTool() {
  const [openPassword, setOpenPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [allow, setAllow] = useState<ProtectAllow>(ALLOW_ALL);
  const options: ProtectOptions = { openPassword, ownerPassword: restricts(allow) ? ownerPassword : "", allow };
  const live = useRef(options);
  live.current = options;

  const process: ProcessFn = async (files, signal, onProgress) => {
    const out = await runInWorker(
      { kind: "protect", zipName: tool.flow.outputName?.(files.map((f) => f.name)) ?? "", files: files.map((f) => ({ name: f.name, source: f.source, password: f.password })), options: live.current },
      { signal, onProgress },
    );
    return { name: out.name, type: out.type, blob: out.blob, size: out.blob.size, pageCount: out.pageCount, entries: out.entries, wasEncrypted: out.wasEncrypted, warnings: out.warnings };
  };

  const rights = (id: string) => RIGHTS.map((k) => ({ id: `${id}-${k}`, label: c.allow[k], value: allow[k], onChange: (on: boolean) => setAllow((a) => ({ ...a, [k]: on })) }));
  // Always in place, shown once something is switched off: the panel and the sheet never shift (polish rules).
  const owner = (id: string) => (
    <div className={cx(!restricts(allow) && "invisible")} aria-hidden={!restricts(allow) || undefined} inert={!restricts(allow)}>
      <PasswordInput id={`${id}-owner`} label={c.owner} placeholder={c.ownerPlaceholder} value={ownerPassword} onChange={setOwnerPassword} autoComplete="new-password" />
    </div>
  );
  const changed = RIGHTS.filter((k) => !allow[k]).length;

  return (
    <ToolFlow
      tool={tool}
      process={process}
      canRun={() => protectCheck(options)}
      onReset={() => {
        setOpenPassword("");
        setOwnerPassword("");
        setAllow(ALLOW_ALL);
      }}
      renderMore={(ctx) => <MoreOptions changed={changed} disabled={ctx.disabled} content={{ togglesTitle: c.stepAllow, toggles: rights("more"), extra: owner("more") }} />}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-7 dock-bar:flex-1">
          <div className="flex min-w-0 flex-col gap-3.5 dock-bar:flex-1">
            <Step n={1}>{c.stepPassword}</Step>
            <PasswordInput id="protect-open" label={c.password} placeholder={c.passwordPlaceholder} value={openPassword} onChange={setOpenPassword} autoComplete="new-password" />
          </div>
          <div className="hidden flex-col gap-1.5 dock-side:flex">
            <Step n={2}>{c.stepAllow}</Step>
            {rights("side").map((t) => (
              <Switch key={t.id} id={t.id} label={t.label} checked={t.value} onChange={t.onChange} spread />
            ))}
            {owner("side")}
          </div>
        </div>
      )}
    />
  );
}
