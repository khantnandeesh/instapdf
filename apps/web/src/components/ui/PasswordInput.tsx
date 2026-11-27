"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { EyeIcon } from "./icons";

/**
 * The one password field (BerryPDF AuthForm look): the placeholder in view, the label for assistive
 * tech unless `showLabel`, and an eye that shows the text and keeps the caret where it was.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    showLabel?: boolean;
    readOnly?: boolean;
    invalid?: boolean;
    describedBy?: string;
    /** "off" for a file's existing password; "new-password" where one is being chosen. */
    autoComplete?: "off" | "new-password";
    /** Controlled "shown as text", for a parent that remounts the field (the dialog's shake) and must keep it. */
    shown?: boolean;
    onShownChange?: (shown: boolean) => void;
    className?: string;
  }
>(function PasswordInput({ id, label, value, onChange, placeholder = label, showLabel, readOnly, invalid, describedBy, autoComplete = "off", shown, onShownChange, className }, ref) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  const [own, setOwn] = useState(false);
  const visible = shown ?? own;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={showLabel ? "text-sm font-semibold text-ink" : "sr-only"}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={input}
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className="ip-field h-12 w-full ps-[14px] pe-12"
        />
        <IconButton
          label="Show password"
          pressed={visible}
          size="sm"
          tooltip={false}
          className="absolute top-[7px] right-[7px]"
          icon={<EyeIcon size={18} />}
          onClick={() => {
            const el = input.current;
            const pos = el ? [el.selectionStart, el.selectionEnd] : null;
            setOwn(!visible);
            onShownChange?.(!visible);
            requestAnimationFrame(() => {
              if (el && pos) el.setSelectionRange(pos[0], pos[1]);
            });
          }}
        />
      </div>
    </div>
  );
});
