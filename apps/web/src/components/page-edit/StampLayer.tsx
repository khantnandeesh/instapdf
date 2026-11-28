import "./stamp-layer.css";
import type { EditorObject } from "@/lib/editor/model";

const pct = (n: number) => `${Math.round(n * 1e4) / 100}%`;
const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const;

/**
 * Draws stamp objects (lib/pdf/stamp, laid out for the page as shown) over a page tile: the same
 * boxes, sizes, turns and opacity the file will get. `images` maps an image stamp's asset to a URL.
 */
export function StampLayer({ page, objects, images }: { page: { w: number; h: number }; objects: readonly EditorObject[]; images?: Record<string, string> }) {
  if (!objects.length) return null;
  return (
    <span className="ip-stamps" aria-hidden="true" data-testid="stamp-layer">
      {objects.map((o) => {
        if (o.kind !== "text" && o.kind !== "image") return null;
        const box = { left: pct(o.x / page.w), top: pct(o.y / page.h), width: pct(o.w / page.w), height: pct(o.h / page.h), transform: o.rot ? `rotate(${o.rot}deg)` : undefined, opacity: o.opacity ?? 1 };
        if (o.kind === "image") {
          return (
            <span key={o.id} className="ip-stamp" style={box}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL of the picked picture */}
              {images?.[o.asset] && <img src={images[o.asset]} alt="" />}
            </span>
          );
        }
        return (
          <span
            key={o.id}
            className="ip-stamp"
            data-font={o.font}
            data-testid="stamp-text"
            style={{ ...box, justifyContent: JUSTIFY[o.align], color: o.color, fontWeight: o.bold ? 700 : 400, fontSize: `${Math.round((o.size / page.h) * 1e4) / 100}cqh` }}
          >
            {o.lines[0]}
          </span>
        );
      })}
    </span>
  );
}
