"use client";
import "./scans.css";
import { PageDialog } from "@/components/page-edit/PageDialog";
import type { FlowApi, LoadedFile } from "@/components/tool-flow/types";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { formatTilt } from "@/lib/pdf/tilt-text";
import { MAX_SKEW } from "@/lib/pdf/skew";
import { deskewCopy as c } from "./copy";

/** Deskew (spec F15 §1): one page turned by hand against level guide lines; the slider's buttons step a tenth of a degree. */
export function StraightenDialog({
  open,
  onClose,
  file,
  api,
  startAt,
  turnOf,
  detected,
  byHand,
  onTurn,
}: {
  open: boolean;
  onClose: () => void;
  file: LoadedFile | undefined;
  api: FlowApi | null;
  startAt: number;
  /** The turn the page will get, in degrees clockwise. */
  turnOf: (index: number) => number;
  /** The turn found for the page, when it has been measured. */
  detected: (index: number) => number | undefined;
  byHand: (index: number) => boolean;
  /** `undefined` goes back to the detected turn. */
  onTurn: (index: number, turn: number | undefined) => void;
}) {
  return (
    <PageDialog
      open={open}
      onClose={onClose}
      file={file}
      api={api}
      startAt={startAt}
      title={c.dialogTitle}
      help={c.dialogHelp}
      status={(index) => `${c.found(turnOf(index))}${byHand(index) ? ` (${c.byHand})` : ""}`}
      action={(index) => (
        <>
          {/* One click leaves a page out of the run: its turn is set to none by hand. */}
          <Button variant="ghost" disabled={turnOf(index) === 0} onClick={() => onTurn(index, 0)} data-testid="leave-as-is">
            {c.leave}
          </Button>
          <Button variant="ghost" disabled={!byHand(index) || detected(index) === undefined} onClick={() => onTurn(index, undefined)} data-testid="use-detected">
            {c.reset}
          </Button>
        </>
      )}
      frame={(page, index) => (
        <span className="ip-straighten" data-testid="straighten-frame" data-turn={turnOf(index)}>
          <span className="ip-straighten__page" style={{ transform: `rotate(${turnOf(index)}deg)` }}>
            {page}
          </span>
          <span aria-hidden="true" className="ip-straighten__lines" />
        </span>
      )}
      controls={(index) => (
        <div className="flex w-full items-center gap-3">
          <Slider wide className="min-w-0 flex-1" label={c.turn} min={-MAX_SKEW} max={MAX_SKEW} step={0.1} value={turnOf(index)} valueText={c.turnText} onChange={(v) => onTurn(index, Math.round(v * 10) / 10)} />
          <output className="w-[6ch] shrink-0 text-right font-display text-sm font-semibold text-ink tabular-nums" data-testid="turn-value">
            {formatTilt(turnOf(index)) || "0.0°"}
          </output>
        </div>
      )}
    />
  );
}
