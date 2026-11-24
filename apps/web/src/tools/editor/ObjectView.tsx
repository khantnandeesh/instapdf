"use client";
/* eslint-disable @next/next/no-img-element -- blob: and data: images made on this device; next/image can't load them */
/**
 * How each added object looks on the page (U-E12 ObjectView). Everything is laid out in page-frame
 * points × scale (CSS px), inside the page's overlay, which the page's rotation turns as a whole.
 * Text is drawn with the same font file and the same baselines as the output (AC-91).
 */
import { listChars } from "@/lib/editor/coverage";
import { useMissing } from "./coverage-browser";
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { arrowHead, fitTypedSize, svgPolyline, typedSignatureSize } from "@/lib/editor/draw-math";
import { cssFamily, faceOf } from "@/lib/editor/fonts";
import { cssFont, ensureFace, knownManifest } from "@/lib/editor/fonts-browser";
import { objectBounds, objectLabel, type EditorObject, type Pt, type SignatureObj, type TextObj } from "@/lib/editor/model";
import { alignOffset, baselineOffset } from "@/lib/editor/text-layout";
import { measurer } from "@/lib/editor/fonts-browser";
import type { RuntimeAsset } from "./controller";

const FALLBACK = { ascent: 0.9, descent: 0.22 };

export const ROLE_NAMES: Record<EditorObject["kind"], string> = {
  text: "added text",
  image: "image",
  signature: "signature",
  shape: "shape",
  line: "shape",
  ink: "drawing",
  markup: "highlight",
  whiteout: "whiteout",
};

/** Style for an object's box (client-only: inline styles are set through the CSSOM after hydration). */
export function boxStyle(x: number, y: number, w: number, h: number, scale: number, rot = 0): CSSProperties {
  return { left: x * scale, top: y * scale, width: w * scale, height: h * scale, transform: rot ? `rotate(${rot}deg)` : undefined };
}

function metricsOf(font: string, bold: boolean, italic: boolean) {
  const m = knownManifest();
  return (m && faceOf(m, font, bold, italic)) || FALLBACK;
}

/** Loads a face and re-renders once it is in. */
export function useFace(font: string, bold: boolean, italic: boolean, text: string) {
  const [, setReady] = useState(0);
  useEffect(() => {
    let live = true;
    ensureFace(font, bold, italic, text || "A")
      .then(() => live && setReady((n) => n + 1))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [font, bold, italic, text]);
}

export const ObjectView = memo(function ObjectView({
  o,
  scale,
  assets,
  selected,
  focusable,
  editing,
  hidden,
  onTextDone,
  index,
  total,
}: {
  o: EditorObject;
  scale: number;
  assets: Record<string, RuntimeAsset>;
  selected: boolean;
  focusable: boolean;
  editing: boolean;
  hidden: boolean;
  onTextDone: (o: TextObj, text: string, cancel: boolean) => void;
  index: number;
  total: number;
}) {
  const b = objectBounds(o);
  const common = {
    "data-obj-id": o.id,
    "data-kind": o.kind,
    role: "group",
    "aria-roledescription": ROLE_NAMES[o.kind],
    "aria-label": objectLabel(o),
    "aria-describedby": `pos-${o.id}`,
    tabIndex: focusable ? 0 : -1,
    "data-selected": selected || undefined,
  } as const;
  const pos = <span id={`pos-${o.id}`} className="sr-only">{`at ${Math.round(b.x)}, ${Math.round(b.y)} pt, ${Math.round(b.w)} by ${Math.round(b.h)}. Object ${index + 1} of ${total} on this page.`}</span>;
  const cls = `ed-obj ed-obj--${o.kind}${hidden ? " ed-obj--hidden" : ""}`;

  switch (o.kind) {
    case "text":
      return (
        <div {...common} className={cls} style={boxStyle(o.x, o.y, o.w, o.h, scale, o.rot)}>
          {editing ? <TextEditor o={o} scale={scale} onDone={onTextDone} /> : <TextLines o={o} scale={scale} />}
          {!editing && <MissingNote o={o} />}
          {pos}
        </div>
      );
    case "image": {
      const a = assets[o.asset];
      return (
        <div {...common} className={cls} style={{ ...boxStyle(o.x, o.y, o.w, o.h, scale, o.rot), opacity: o.opacity }}>
          {a && <img src={a.url} alt="" draggable={false} className="size-full select-none" />}
          {pos}
        </div>
      );
    }
    case "signature":
      return (
        <div {...common} className={cls} style={boxStyle(o.x, o.y, o.w, o.h, scale, o.rot)}>
          <SignatureArt o={o} scale={scale} assets={assets} />
          {pos}
        </div>
      );
    case "shape": {
      const sw = o.stroke ? o.width * scale : 0;
      const w = o.w * scale;
      const h = o.h * scale;
      return (
        <div {...common} className={cls} style={boxStyle(o.x, o.y, o.w, o.h, scale, o.rot)}>
          <svg width={w} height={h} className="overflow-visible" aria-hidden="true">
            {o.shape === "rect" ? (
              <rect x={0} y={0} width={w} height={h} fill={o.fill ?? "none"} stroke={o.stroke ?? "none"} strokeWidth={sw} />
            ) : (
              <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={o.fill ?? "none"} stroke={o.stroke ?? "none"} strokeWidth={sw} />
            )}
          </svg>
          {pos}
        </div>
      );
    }
    case "line": {
      const pts: Pt[][] = [[o.a, o.b]];
      if (o.arrow) for (const h of arrowHead(o.a, o.b, o.width)) pts.push([o.b, h]);
      const rel = (p: Pt) => `${(p[0] - b.x) * scale},${(p[1] - b.y) * scale}`;
      return (
        <div {...common} className={cls} style={boxStyle(b.x, b.y, b.w, b.h, scale)}>
          <svg width={b.w * scale} height={b.h * scale} className="overflow-visible" aria-hidden="true">
            {pts.map((seg, i) => (
              <polyline key={i} points={seg.map(rel).join(" ")} fill="none" stroke={o.stroke} strokeWidth={o.width * scale} strokeLinecap="round" />
            ))}
            {/* A wide transparent stroke: a thin line stays easy to grab. */}
            <polyline points={[o.a, o.b].map(rel).join(" ")} fill="none" stroke="transparent" strokeWidth={Math.max(12, o.width * scale)} className="ed-hit" />
          </svg>
          {pos}
        </div>
      );
    }
    case "ink": {
      const rel = o.points.map((p) => `${(p[0] - b.x) * scale},${(p[1] - b.y) * scale}`).join(" ");
      return (
        <div {...common} className={`${cls}${o.marker ? " ed-obj--marker" : ""}`} style={boxStyle(b.x, b.y, b.w, b.h, scale)}>
          <svg width={b.w * scale} height={b.h * scale} className="overflow-visible" aria-hidden="true">
            <polyline points={rel} fill="none" stroke={o.color} strokeWidth={o.width * scale} strokeLinecap="round" strokeLinejoin="round" opacity={o.marker ? 0.4 : 1} />
            <polyline points={rel} fill="none" stroke="transparent" strokeWidth={Math.max(12, o.width * scale)} className="ed-hit" />
          </svg>
          {pos}
        </div>
      );
    }
    case "markup":
      return (
        <div {...common} className={cls} style={boxStyle(b.x, b.y, b.w, b.h, scale)}>
          {o.rects.map((r, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`ed-mark ed-mark--${o.type}`}
              style={{ ...boxStyle(r.x - b.x, r.y - b.y, r.w, r.h, scale), ["--mark" as string]: o.color, ["--t" as string]: `${Math.max(0.6, r.h * 0.07) * scale}px` }}
            />
          ))}
          {pos}
        </div>
      );
    case "whiteout":
      return (
        <div
          {...common}
          className={cls}
          style={{ ...boxStyle(o.x, o.y, o.w, o.h, scale), background: o.fill, boxShadow: o.border && o.borderWidth ? `inset 0 0 0 ${o.borderWidth * scale}px ${o.border}` : undefined }}
        >
          {pos}
        </div>
      );
  }
});

/** Added text as drawn in the output: SVG text on the same baselines and in the same font file. */
function TextLines({ o, scale }: { o: TextObj; scale: number }) {
  useFace(o.font, o.bold, o.italic, o.lines.join(""));
  const m = metricsOf(o.font, o.bold, o.italic);
  const measure = measurer(o.font, o.size, o.bold, o.italic);
  return (
    <svg width={o.w * scale} height={o.h * scale} className="pointer-events-none block overflow-visible" aria-hidden="true">
      {o.lines.map((line, i) => {
        const lw = measure(line);
        const x = alignOffset(o.align, o.w, lw);
        const y = baselineOffset(m, o.size, i);
        return (
          <g key={i}>
            <text
              x={x * scale}
              y={y * scale}
              fill={o.color}
              fontFamily={`"${cssFamily(o.font)}", Arial, sans-serif`}
              fontSize={o.size * scale}
              fontWeight={o.bold ? 700 : 400}
              fontStyle={o.italic ? "italic" : "normal"}
              xmlSpace="preserve"
              className="whitespace-pre"
            >
              {line}
            </text>
            {o.underline && line && <rect x={x * scale} y={(y + o.size * 0.12 - o.size * 0.03) * scale} width={lw * scale} height={Math.max(0.5, o.size * 0.06) * scale} fill={o.color} />}
          </g>
        );
      })}
    </svg>
  );
}

/** The editing field for added text: same font, size and line height, so nothing jumps on commit. */
function TextEditor({ o, scale, onDone }: { o: TextObj; scale: number; onDone: (o: TextObj, text: string, cancel: boolean) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(o.text);
  const done = useRef(false);
  useFace(o.font, o.bold, o.italic, value);
  const measure = measurer(o.font, o.size, o.bold, o.italic);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select(); // AC-57: the first keystroke replaces the placeholder
  }, []);

  // Grow with the text (no wrap width: as wide as the longest line).
  const lines = value.split("\n");
  const width = o.wrap != null ? o.wrap : Math.max(o.size * 2, ...lines.map((l) => measure(l) + o.size * 0.6));
  const height = Math.max(1, lines.length) * o.size * 1.25;
  const [, force] = useState(0);
  useLayoutEffect(() => {
    // Wrapped text: the textarea's own scroll height is the true height.
    if (o.wrap != null && ref.current) force((n) => n + 1);
  }, [value, o.wrap]);
  const h = o.wrap != null && ref.current ? Math.max(height * scale, ref.current.scrollHeight) : height * scale;

  const finish = (cancel: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(o, ref.current?.value ?? value, cancel);
  };

  return (
    <textarea
      ref={ref}
      data-testid="text-input"
      aria-label="Text"
      value={value}
      spellCheck
      rows={1}
      wrap={o.wrap != null ? "soft" : "off"}
      className="ed-textarea"
      style={{
        width: width * scale,
        height: h,
        font: cssFont(o.font, o.size * scale, o.bold, o.italic),
        lineHeight: 1.25,
        color: o.color,
        textAlign: o.align,
        textDecoration: o.underline ? "underline" : undefined,
      }}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(false)}
    />
  );
}

function SignatureArt({ o, scale, assets }: { o: SignatureObj; scale: number; assets: Record<string, RuntimeAsset> }) {
  const sig = o.sig;
  if (sig.type === "image") {
    const a = assets[sig.asset];
    return a ? <img src={a.url} alt="" draggable={false} className="size-full select-none" /> : null;
  }
  if (sig.type === "drawn") {
    const width = Math.max(0.6, Math.min(o.w, o.h) * 0.035) * scale;
    return (
      <svg width={o.w * scale} height={o.h * scale} className="block overflow-visible" aria-hidden="true">
        {sig.strokes.map((s, i) => (
          <path key={i} d={svgPolyline((s.length === 1 ? [s[0], [s[0][0] + 0.001, s[0][1]]] : s).map(([u, v]) => [u * o.w * scale, v * o.h * scale] as Pt))} fill="none" stroke={o.color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
    );
  }
  return <TypedSignature o={o} text={sig.text} face={sig.face} scale={scale} />;
}

function TypedSignature({ o, text, face, scale }: { o: SignatureObj; text: string; face: string; scale: number }) {
  useFace(face, false, false, text);
  const m = metricsOf(face, false, false);
  const full = typedSignatureSize(o.h, m);
  const size = fitTypedSize(full, measurer(face, full)(text), o.w);
  const tw = measurer(face, size)(text);
  const base = (o.h - (m.ascent + m.descent) * size) / 2 + m.ascent * size;
  return (
    <svg width={o.w * scale} height={o.h * scale} className="block overflow-visible" aria-hidden="true">
      <text x={((o.w - tw) / 2) * scale} y={base * scale} fill={o.color} fontFamily={`"${cssFamily(face)}", cursive`} fontSize={size * scale} xmlSpace="preserve" className="whitespace-pre">
        {text}
      </text>
    </svg>
  );
}

/** Characters of this text that no font we ship can print (AC-75): said on the box, not silently. */
function MissingNote({ o }: { o: TextObj }) {
  const missing = useMissing(o);
  if (!missing.length) return null;
  return (
    <span className="ed-missing" data-testid="text-missing">
      Won’t print: {listChars(missing)}
    </span>
  );
}
