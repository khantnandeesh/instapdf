import type { ReactNode } from "react";
import { FileIcon } from "../ui/icons";

export function DropCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[280px] place-items-center rounded-xl border-2 border-dashed border-field-line bg-surface-raised p-6 text-center transition-colors duration-(--ip-duration-fast) hover:border-accent hover:bg-primary-faint lg:min-h-[420px]">
      <div className="flex max-w-md flex-col items-center gap-4">
        <span className="grid size-16 place-items-center rounded-full bg-primary-soft text-primary-ink">
          <FileIcon size={32} />
        </span>
        {children}
      </div>
    </div>
  );
}
