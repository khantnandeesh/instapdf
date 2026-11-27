"use client";
import { useId, useRef, useState } from "react";
import type { Permission } from "@/tools/registry";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { AlertIcon } from "../ui/icons";
import { PasswordInput } from "../ui/PasswordInput";
import { permissionLabels } from "./copy";

// The notice is its own module so a tool page's first load carries it without this dialog.
export { OwnerPermissionNotice } from "./OwnerPermissionNotice";

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
  const inputId = useId();
  const errorId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Owner password for ${fileName}`}
      description="The file's owner restricted what can be done with it. Enter the owner password to allow:"
      initialFocusRef={input}
      onCloseButton={onClose}
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
      <ul className="list-disc ps-5 text-[15px]">
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
        <PasswordInput ref={input} id={inputId} label="Owner password" value={value} onChange={setValue} invalid={!!error} describedBy={error ? errorId : undefined} />
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
