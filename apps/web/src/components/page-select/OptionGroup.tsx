import type { ReactNode } from "react";
import "./option-groups.css";
import { Step } from "./Step";

/**
 * A group of options: a numbered step in the side panel, a small heading in the More options sheet.
 * The legend names the group for assistive tech in both. With the classes of option-groups.css
 * (`ip-opt-side`: only in the side panel; `ip-opt-bar`: only in the bar; `ip-opt-pair`: two side by side).
 */
export function Group({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="ip-opt-legend mb-2 text-sm font-semibold text-ink">{title}</legend>
      <Step n={n}>{title}</Step>
      {children}
    </fieldset>
  );
}
