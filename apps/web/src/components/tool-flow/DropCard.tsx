import type { ReactNode } from "react";
import { FileIcon } from "../ui/icons";

export function DropCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[280px] place-items-center rounded-xl border-2 border-dashed border-border-strong bg-surface-raised p-6 text-center transition-colors duration-(--ip-duration-fast) hover:border-primary lg:min-h-[420px]">
      <div className="flex max-w-md flex-col items-center gap-4">
        <FileIcon size={48} className="text-primary" />
        {children}
      </div>
    </div>
  );
}
