import { cx } from "../ui/cx";
import { FilesIcon } from "../ui/icons";

export function DropOverlay({ active, mode }: { active: boolean; mode: "add" | "replace" }) {
  return (
    <div
      aria-hidden="true"
      data-testid="drop-overlay"
      data-active={active || undefined}
      className={cx(
        "pointer-events-none fixed inset-0 z-40 bg-drop-overlay transition-opacity duration-(--dur-base)",
        active ? "visible opacity-100" : "invisible opacity-0",
      )}
    >
      <div className="absolute inset-3 grid place-items-center rounded-tray border-2 border-dashed border-brand">
        <div className="flex flex-col items-center gap-3 text-card-heading text-ink">
          <FilesIcon size={40} className="text-brand-strong" />
          {mode === "add" ? "Drop to add files" : "Drop to replace the file"}
        </div>
      </div>
    </div>
  );
}
