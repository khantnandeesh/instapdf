"use client";
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { prefetchPdfjs } from "@/lib/pdf/pdfjs";
import { Button, type ButtonSize, type ButtonVariant } from "../ui/Button";
import { pickedFromDevice } from "../cloud/tool-cloud";

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
    /** Classes for the label (for example `max-[399px]:sr-only` for an icon-only button on narrow screens). */
    labelClassName?: string;
    inputTestId?: string;
  }
>(function FilePicker({ accept, multiple, onFiles, label, variant = "primary", size = "lg", icon, sources, disabled, className, labelClassName, inputTestId }, ref) {
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
    // With a `sources` slot (F23 caret) the two halves form one split button (components/cloud/cloud.css).
    <span className={process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && sources ? `ip-split inline-flex ${variant === "tool" ? "ip-split--tool" : "ip-split--lg"}` : "inline-flex"}>
      <Button
        ref={button}
        variant={variant}
        size={size}
        iconStart={icon}
        disabled={disabled}
        className={className}
        onPointerEnter={prefetchPdfjs}
        onFocus={prefetchPdfjs}
        onClick={() => input.current?.click()}
      >
        {labelClassName ? <span className={labelClassName}>{label}</span> : label}
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
          if (files.length) {
            // F23: a pick here (a tool's own picker) makes "This device" the last used source (U-12).
            if (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && sources) pickedFromDevice();
            onFiles(files, button.current);
          }
        }}
      />
    </span>
  );
});
