"use client";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { MAX_COUNT } from "@/lib/plan-counts";
import { alternateCopy as a } from "./copy";

/** A card's settings as the user set them (the per-turn text may be invalid while typing). */
export type Mix = { reverse: boolean; perTurn: string; repeat: boolean };

/**
 * One card's settings (spec F4/F5 §3g, P-5): order, pages per turn and, for a one-page file, Repeat.
 * Cards exist only once a file is in, so this loads apart from the page (budget, P-12).
 */
export function MixSettings({ id, name, pageCount, mix: m, onChange, announce }: { id: string; name: string; pageCount: number; mix: Mix; onChange: (patch: Partial<Mix>) => void; announce: (msg: string) => void }) {
  return (
    <>
      <SegmentedControl
        look="tabs"
        label={a.orderOf(name)}
        value={m.reverse ? "reverse" : "normal"}
        options={[
          { value: "normal", label: a.normal },
          { value: "reverse", label: a.reverse },
        ]}
        onChange={(v) => {
          onChange({ reverse: v === "reverse" });
          announce(a.orderChanged(name, v === "reverse"));
        }}
        className="max-w-[220px] self-start"
      />
      <div className="flex min-h-11 items-center gap-2">
        <NumberStepper
          value={m.perTurn}
          onChange={(t) => onChange({ perTurn: t })}
          label={a.perTurnFrom(name)}
          decLabel={a.fewer(name)}
          incLabel={a.more(name)}
          error={a.perTurnError}
          max={MAX_COUNT}
          float
        />
        <span className="text-sm whitespace-nowrap text-muted" aria-hidden="true">
          {a.perTurn}
        </span>
      </div>
      {pageCount === 1 && <Switch id={`repeat-${id}`} label={a.repeat} ariaLabel={a.repeatName(name)} checked={m.repeat} onChange={(on) => onChange({ repeat: on })} className="self-start" />}
    </>
  );
}
