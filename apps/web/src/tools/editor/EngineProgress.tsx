"use client";
/**
 * Load progress of the text engine, shown only when someone asked for Edit text (picked the tool
 * or clicked a line) before it was ready. A small ring with the percentage: on the Edit text tool
 * in the rail, and as a pill on narrow screens, where that tool often sits under More. If the
 * download fails, an inline Retry.
 */
import { useSyncExternalStore } from "react";
import { getEngineStatus, subscribeEngine } from "@/lib/editor/engine-client";
import { percent } from "@/lib/editor/engine-load";
import { cx } from "@/components/ui/cx";
import { useCtl } from "./context";
import { useStore } from "./store";

const R = 8;
const C = 2 * Math.PI * R;

function useEngineProgress() {
  const ctl = useCtl();
  const wanted = useStore(ctl.store, (s) => s.engineWanted && !s.engineReady);
  const status = useSyncExternalStore(subscribeEngine, getEngineStatus, getEngineStatus);
  return { ctl, show: wanted && ctl.engineAllowed, failed: status.state === "failed", pct: status.state === "ready" ? 100 : percent(status) };
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
  const { ctl, show, failed, pct } = useEngineProgress();
  if (!show || (wide && !failed)) return null;
  return (
    <div className={cx("ed-engine ed-glass", failed && "ed-engine--failed")} data-testid="engine-progress">
      {failed ? (
        <>
          <span>Text editing didn’t load.</span>
          <button type="button" className="ed-engine__retry" onClick={() => void ctl.openEngine()}>
            Retry
          </button>
        </>
      ) : (
        <span role="progressbar" aria-label="Getting text editing ready" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="flex items-center gap-1.5">
          <Ring pct={pct} />
          <span className="ed-engine__pct" data-testid="engine-percent">
            {pct}%
          </span>
        </span>
      )}
    </div>
  );
}
