import { ShieldIcon } from "../ui/icons";
import { copy } from "./copy";

export function LimitsNote({ text }: { text: string }) {
  return <p className="text-sm text-fg-muted tabular-nums">{text}</p>;
}

/** Browser tools only: server tools get their own copy in F6 and no result variant. */
export function PrivacyNote({ runtime, context }: { runtime: "client" | "server"; context: "intro" | "result" }) {
  if (runtime !== "client") return null;
  return (
    <p className="flex items-center gap-2 text-sm text-fg" data-testid={`privacy-${context}`}>
      <ShieldIcon size={18} className="shrink-0 text-success" />
      {context === "intro" ? copy.privacyIntro : copy.privacyResult}
    </p>
  );
}
