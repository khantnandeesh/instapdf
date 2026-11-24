"use client";
/**
 * Load progress of the text engine, shown only when someone asked for Edit text (picked the tool
 * or clicked a line) before it was ready. A small ring with the percentage: on the Edit text tool
 * in the rail, and as a pill on narrow screens, where that tool often sits under More. If the
 * download fails, an inline Retry. The same ring counts the shaping build's download (Hindi,
 * Arabic…) after a click on a line that needs it, with its own Retry.
 */
import { useSyncExternalStore } from "react";
import { getEngineStatus, getShapingStatus, subscribeEngine } from "@/lib/editor/engine-client";
import { percent } from "@/lib/editor/engine-load";
import { cx } from "@/components/ui/cx";
import { useCtl } from "./context";
import { useStore } from "./store";

const R = 8;
const C = 2 * Math.PI * R;

function useEngineProgress() {
  const ctl = useCtl();
  const shaping = useStore(ctl.store, (s) => s.shaping === "loading" || s.shaping === "failed");
  const wanted = useStore(ctl.store, (s) => s.engineWanted && !s.engineReady);
  const base = useSyncExternalStore(subscribeEngine, getEngineStatus, getEngineStatus);
  const shaped = useSyncExternalStore(subscribeEngine, getShapingStatus, getShapingStatus);
  // The shaping download comes after the default build, so it takes over the ring.
  const status = shaping ? shaped : base;
  const retry = shaping ? () => void ctl.loadShaping() : () => void ctl.openEngine();
  return { ctl, shaping, retry, show: (wanted || shaping) && ctl.engineAllowed, failed: status.state === "failed", pct: status.state === "ready" ? 100 : percent(status) };
}

function Ring({ pct }: { pct: number }) {
  return (
    <svg className="ed-ring" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle className="ed-ring__track" cx="10" cy="10" r={R} />
      <circle className="ed-ring__bar" cx="10" cy="10" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
    </svg>
  );
}

/** On the Edit text tool button: the ring and the number. */
export function ToolRing() {
  const { show, failed, pct } = useEngineProgress();
  if (!show || failed) return null;
  return (
    <span className="ed-tool__ring" data-testid="engine-ring">
      <Ring pct={pct} />
      <span className="ed-tool__pct">{pct}%</span>
    </span>
  );
}

/** The pill (narrow screens, or a failed load anywhere). */
export function EnginePill({ wide }: { wide: boolean }) {
  const { show, failed, pct, shaping, retry } = useEngineProgress();
  if (!show || (wide && !failed)) return null;
  return (
    <div className={cx("ed-engine ed-glass", failed && "ed-engine--failed")} data-testid="engine-progress">
      {failed ? (
        <>
          <span>{shaping ? "Editing for this script didn’t load." : "Text editing didn’t load."}</span>
          <button type="button" className="ed-engine__retry" onClick={retry}>
            Retry
          </button>
        </>
      ) : (
        <span role="progressbar" aria-label={shaping ? "Getting editing ready for this script" : "Getting text editing ready"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="flex items-center gap-1.5">
          <Ring pct={pct} />
          <span className="ed-engine__pct" data-testid="engine-percent">
            {pct}%
          </span>
        </span>
      )}
    </div>
  );
}
