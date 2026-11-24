import { ShieldIcon } from "../ui/icons";
import { copy } from "./copy";

/** Short limits line; the full limits (total size and pages) are its tooltip and reach screen readers. */
export function LimitsNote({ text, full }: { text: string; full: string }) {
  return (
    <p className="text-sm text-muted tabular-nums" title={full}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{full}</span>
    </p>
  );
}

/** Browser tools only: server tools get their own copy in F6 and no result variant. */
export function PrivacyNote({ runtime, context, text }: { runtime: "client" | "server"; context: "intro" | "result"; text?: string }) {
  if (runtime !== "client") return null;
  return (
    <p className="flex items-center gap-2 text-sm text-ink" data-testid={`privacy-${context}`}>
      <ShieldIcon size={18} className="shrink-0 text-brand-strong" />
      {text ?? (context === "intro" ? copy.privacyIntro : copy.privacyResult)}
    </p>
  );
}
