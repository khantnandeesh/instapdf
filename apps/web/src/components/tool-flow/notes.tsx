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

/** The privacy line under the picker and on the result (F25 AC-603): honest for server tools too. */
export function privacyText(runtime: "client" | "server", context: "intro" | "result"): string {
  if (runtime === "server") return context === "intro" ? copy.privacyIntroServer : copy.privacyResultServer;
  return context === "intro" ? copy.privacyIntro : copy.privacyResult;
}

export function PrivacyNote({ runtime, context }: { runtime: "client" | "server"; context: "intro" | "result" }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink" data-testid={`privacy-${context}`}>
      <ShieldIcon size={18} className="shrink-0 text-brand-strong" />
      {privacyText(runtime, context)}
    </p>
  );
}
