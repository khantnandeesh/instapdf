import type { ReactNode } from "react";

/** A numbered option step of the side panel (Rotate's look): decorative, the control has its own name. */
export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="mp-step hidden dock-side:flex" aria-hidden="true">
      <span className="mp-step__n">{n}</span>
      {children}
    </span>
  );
}

/**
 * The 30px duotone page-strip glyph of the mode tiles (Rotate's ScopeIcon drawing style, spec F4/F5
 * UI P-3): small pages in groups; a filled page is in the picked set. Hidden in the bar.
 */
export function StripGlyph({ groups, filled }: { groups: number[]; filled?: boolean[] }) {
  const w = 5;
  const gap = 1.6;
  const groupGap = 4.4;
  const pages = groups.reduce((a, b) => a + b, 0);
  const width = pages * w + (pages - groups.length) * gap + (groups.length - 1) * groupGap;
  let x = (30 - width) / 2;
  let k = 0;
  const rects: ReactNode[] = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < g; i++) {
      const on = filled ? !!filled[k] : true;
      rects.push(<rect key={k} x={x} y="8" width={w} height="14" rx="1.3" fill={on ? "currentColor" : "none"} fillOpacity={on ? 0.35 : 0} />);
      x += w + (i < g - 1 ? gap : 0);
      k++;
    }
    if (gi < groups.length - 1) x += groupGap;
  });
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" className="dock-bar:hidden" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      {rects}
    </svg>
  );
}
