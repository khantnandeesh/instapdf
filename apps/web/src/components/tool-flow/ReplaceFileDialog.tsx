"use client";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

/** Single-file tools only: confirm before a new file replaces the loaded one. */
export function ReplaceFileDialog({ open, fileName, onConfirm, onCancel }: { open: boolean; fileName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={`Replace ${fileName}?`}
      description="This tool works on one file at a time. The new file takes its place."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Keep current file
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Replace
          </Button>
        </>
      }
    />
  );
}
