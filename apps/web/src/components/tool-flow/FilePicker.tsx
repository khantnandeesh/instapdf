"use client";
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { prefetchPdfjs } from "@/lib/pdf/pdfjs";
import { Button, type ButtonSize, type ButtonVariant } from "../ui/Button";

export type FilePickerHandle = { open: () => void; focus: () => void; element: HTMLButtonElement | null };

/**
 * Visible button that opens a visually hidden file input. The input stays in
 * the DOM (tests use setInputFiles) and is reset after each pick so the same
 * file can be picked twice. Hover/focus prefetches pdf.js.
 */
export const FilePicker = forwardRef<
  FilePickerHandle,
  {
    accept: string;
    multiple: boolean;
    onFiles: (files: File[], trigger: HTMLElement | null) => void;
    label: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: ReactNode;
    sources?: ReactNode;
    disabled?: boolean;
    className?: string;
    inputTestId?: string;
    /** Below 640 px show only the icon (the label stays the accessible name). */
    compact?: boolean;
  }
>(function FilePicker({ accept, multiple, onFiles, label, variant = "primary", size = "lg", icon, sources, disabled, className, inputTestId, compact }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({
    open: () => input.current?.click(),
    focus: () => button.current?.focus(),
    get element() {
      return button.current;
    },
  }));
  return (
    <span className="inline-flex">
      <Button
        ref={button}
        variant={variant}
        size={size}
        iconStart={icon}
        disabled={disabled}
        className={compact ? `max-sm:w-11 max-sm:px-0 ${className ?? ""}` : className}
        onPointerEnter={prefetchPdfjs}
        onFocus={prefetchPdfjs}
        onClick={() => input.current?.click()}
      >
        {compact ? <span className="max-sm:sr-only">{label}</span> : label}
      </Button>
      {sources}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid={inputTestId}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files, button.current);
        }}
      />
    </span>
  );
});
