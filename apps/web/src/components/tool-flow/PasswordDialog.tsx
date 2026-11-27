"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { AlertIcon } from "../ui/icons";
import { PasswordInput } from "../ui/PasswordInput";
import { copy } from "./copy";

/** Middle-truncates long names so the start and the extension stay visible. */
function middleTruncate(name: string, max = 40): string {
  if (name.length <= max) return name;
  const keep = max - 1;
  return `${name.slice(0, Math.ceil(keep / 2))}…${name.slice(name.length - Math.floor(keep / 2))}`;
}

export function PasswordDialog({
  open,
  fileId,
  fileName,
  queuePosition,
  showApplyToAll,
  error,
  busy,
  attempt,
  onSubmit,
  onSkip,
  fallbackFocus,
}: {
  open: boolean;
  /** Identifies the locked file; the field is cleared when it changes. */
  fileId: string;
  fileName: string;
  queuePosition?: { index: number; total: number };
  showApplyToAll: boolean;
  error?: string;
  busy: boolean;
  /** Increments on each wrong password so the field shakes again. */
  attempt: number;
  onSubmit: (password: string, applyToAll: boolean) => void;
  onSkip: () => void;
  fallbackFocus: () => HTMLElement | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [applyAll, setApplyAll] = useState(false);
  const errorId = useId();
  const inputId = useId();

  // Fresh field for each file.
  useEffect(() => {
    setValue("");
    setVisible(false);
  }, [fileId]);

  // Wrong password: keep the value, select it all, focus.
  useEffect(() => {
    if (attempt > 0 && error) {
      input.current?.focus();
      input.current?.select();
    }
  }, [attempt, error]);

  return (
    <Dialog
      open={open}
      onClose={() => onSkip()}
      title={copy.pwTitle(middleTruncate(fileName))}
      initialFocusRef={input}
      fallbackFocus={fallbackFocus}
      description={
        <>
          {queuePosition && queuePosition.total > 1 && <span className="block">{copy.pwQueue(queuePosition.index, queuePosition.total)}</span>}
          {copy.pwBody}
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onSkip} disabled={busy}>
            {copy.pwSkip}
          </Button>
          <Button variant="primary" type="submit" form="ip-pw-form" busy={busy}>
            {copy.pwUnlock}
          </Button>
        </>
      }
    >
      <form
        id="ip-pw-form"
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onSubmit(value, showApplyToAll && applyAll);
        }}
      >
        <div key={attempt} className={error && attempt > 0 ? "ip-shake" : undefined}>
          <PasswordInput ref={input} id={inputId} label="Password" value={value} onChange={setValue} readOnly={busy} shown={visible} onShownChange={setVisible} invalid={!!error} describedBy={error ? errorId : undefined} />
        </div>
        <p id={errorId} role="alert" className="flex min-h-5 items-start gap-1.5 text-sm text-danger" data-testid="password-error">
          {error && (
            <>
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <span className="font-semibold">{error}</span>
            </>
          )}
        </p>
        {showApplyToAll && (
          <label className="mt-1 flex min-h-11 cursor-pointer items-start gap-[9px] text-start text-[15px]">
            <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="mp-checkbox" />
            {copy.pwApplyAll}
          </label>
        )}
      </form>
    </Dialog>
  );
}
