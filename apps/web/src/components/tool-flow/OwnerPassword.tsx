"use client";
import { useId, useRef, useState } from "react";
import type { Permission } from "@/tools/registry";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { IconButton } from "../ui/IconButton";
import { AlertIcon, CloseIcon, EyeIcon, LockIcon } from "../ui/icons";
import { Notice } from "../ui/Notice";
import { permissionLabels } from "./copy";

/**
 * Shown when a tool needs a permission the file denies (deferred consumers:
 * F16 Editor, F17 Sign; spec D-1, D-2). Rotate needs none, so it never shows.
 */
export function OwnerPermissionNotice({ fileName, denied, onEnterPassword }: { fileName: string; denied: Permission[]; onEnterPassword: () => void }) {
  return (
    <Notice tone="warning" title={`${fileName} has limited permissions`} action={{ label: "Enter owner password", onClick: onEnterPassword }}>
      This tool needs a permission the file does not allow: {denied.map((p) => permissionLabels[p].toLowerCase()).join(", ")}.
    </Notice>
  );
}

export function OwnerPasswordDialog({
  open,
  fileName,
  denied,
  error,
  busy,
  onSubmit,
  onClose,
}: {
  open: boolean;
  fileName: string;
  denied: Permission[];
  error?: string;
  busy?: boolean;
  onSubmit: (password: string) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const errorId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<LockIcon />}
      title={`Owner password for ${fileName}`}
      description="The file's owner restricted what can be done with it. Enter the owner password to allow:"
      initialFocusRef={input}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="ip-owner-form" busy={busy}>
            Unlock
          </Button>
        </>
      }
    >
      <IconButton label="Close" size="sm" className="absolute top-3 right-3" tooltip={false} icon={<CloseIcon size={18} />} onClick={onClose} />
      <ul className="mp-seedlist mx-auto text-start text-[15px]">
        {denied.map((p) => (
          <li key={p}>{permissionLabels[p]}</li>
        ))}
      </ul>
      <form
        id="ip-owner-form"
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Owner password
        </label>
        <div className="relative">
          <input
            ref={input}
            id={inputId}
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Owner password"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="ip-field h-12 w-full ps-[14px] pe-12"
          />
          <IconButton label="Show password" pressed={visible} size="sm" tooltip={false} className="absolute top-[7px] right-[7px]" icon={<EyeIcon size={18} />} onClick={() => setVisible((v) => !v)} />
        </div>
        <p id={errorId} role="alert" className="flex min-h-5 items-center gap-1.5 text-sm font-semibold text-danger">
          {error && (
            <>
              <AlertIcon size={16} />
              {error}
            </>
          )}
        </p>
      </form>
    </Dialog>
  );
}
