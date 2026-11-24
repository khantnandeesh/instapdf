"use client";
/* eslint-disable @next/next/no-img-element -- blob: and data: images made on this device; next/image can't load them */
/**
 * Sign (U-E5): signatures and initials (AC-87), typed in one of 8 handwriting faces, drawn, or
 * uploaded with the background removed (AC-31). Saved ones live on this device only (IndexedDB)
 * and the last 5 of each are offered for one-click reuse (AC-32, AC-66). Choosing one arms the
 * placement ghost (AC-67).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cx } from "@/components/ui/cx";
import { SIGN_FACES, cssFamily } from "@/lib/editor/fonts";
import { cssFont, ensureFace, measurer } from "@/lib/editor/fonts-browser";
import { newId, type Pt, type SigSource } from "@/lib/editor/model";
import { svgPolyline } from "@/lib/editor/draw-math";
import { drawnPreview, safeHex } from "@/lib/editor/sign-preview";
import { deleteSignature, listSignatures, saveSignature, type SavedSignature } from "@/lib/editor/persist";
import { IMAGE_ACCEPT, addAsset, imageError, imageFromFile, plainAssets, releaseAsset } from "./assets";
import { useCtl } from "./context";
import { CloseBold, PenBold, TextBold, UploadBold } from "./icons";
import { INK } from "./Properties";
import type { Placement } from "./store";

type Role = "signature" | "initials";
type Mode = "type" | "draw" | "upload";

/** Box aspect (w/h) and a ghost image for a typed signature. */
export async function typedPlacement(text: string, face: string, color: string): Promise<{ aspect: number; preview: string }> {
  const m = await ensureFace(face, false, false, text);
  const size = 48;
  const tw = Math.max(size, measurer(face, size)(text));
  const h = (m.ascent + m.descent) * size * 1.15;
  const w = tw * 1.08;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * 2);
  c.height = Math.ceil(h * 2);
  const ctx = c.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.font = cssFont(face, size);
  ctx.fillStyle = safeHex(color);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, (w - tw) / 2, (h - (m.ascent + m.descent) * size) / 2 + m.ascent * size);
  return { aspect: w / h, preview: c.toDataURL("image/png") };
}

export function SignDialog({ open, role: initialRole, onClose, onPlace }: { open: boolean; role: Role; onClose: () => void; onPlace: (p: Placement) => void }) {
  const ctl = useCtl();
  const [role, setRole] = useState<Role>(initialRole);
  const [mode, setMode] = useState<Mode>("type");
  const [text, setText] = useState("");
  const [face, setFace] = useState(SIGN_FACES[0].id);
  const [color, setColor] = useState(INK[0].hex);
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const [upload, setUpload] = useState<{ id: string; url: string; aspect: number } | null>(null);
  const [clean, setClean] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [keep, setKeep] = useState(true);
  const [saved, setSaved] = useState<SavedSignature[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facesReady, setFacesReady] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const aspect = role === "initials" ? 1.6 : 3.2;

  useEffect(() => {
    if (!open) return;
    setRole(initialRole);
    setError(null);
    void listSignatures().then(setSaved);
  }, [open, initialRole]);

  // All 8 faces load on open (each is a small latin file), so the grid shows real handwriting.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void Promise.allSettled(SIGN_FACES.map((f) => ensureFace(f.id, false, false, text || "Ab"))).then(() => alive && setFacesReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [open, text]);

  // Re-run the background removal when the toggle changes. The upload it replaces is released;
  // the current one is held until the dialog closes (placed ones are then kept by the placement).
  const uploadId = useRef<string | null>(null);
  const mineHeld = useRef(new Set<string>());
  const hold = useCallback(
    (id: string) => {
      ctl.rt.held.add(id);
      mineHeld.current.add(id);
    },
    [ctl],
  );
  useEffect(() => {
    const rt = ctl.rt;
    const held = mineHeld.current;
    return () => {
      for (const id of held) rt.held.delete(id);
      held.clear();
    };
  }, [ctl]);
  useEffect(() => {
    if (!file) return;
    let alive = true;
    setBusy(true);
    imageFromFile(ctl.rt, file, clean)
      .then((id) => {
        if (!alive) return releaseAsset(ctl.rt, id);
        const prev = uploadId.current;
        if (prev && prev !== id) {
          ctl.rt.held.delete(prev);
          mineHeld.current.delete(prev);
          releaseAsset(ctl.rt, prev);
        }
        uploadId.current = id;
        hold(id);
        const a = ctl.rt.assets[id];
        setUpload({ id, url: a.url, aspect: a.w / Math.max(1, a.h) });
        setError(null);
      })
      .catch((e: Error) => alive && setError(imageError(e, true)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [file, clean, ctl, hold]);

  const mine = saved.filter((s) => s.role === role).sort((a, b) => b.at - a.at).slice(0, 5);
  const label = role === "initials" ? "Initials" : "Signature";

  const ready = mode === "type" ? text.trim().length > 0 : mode === "draw" ? strokes.length > 0 : !!upload;

  async function place() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      let sig: SigSource;
      let p: Pick<Placement, "aspect" | "preview">;
      if (mode === "type") {
        sig = { type: "typed", text: text.trim(), face };
        p = await typedPlacement(text.trim(), face, color);
      } else if (mode === "draw") {
        sig = { type: "drawn", strokes, aspect };
        p = { aspect, preview: drawnPreview(strokes, aspect, color) };
      } else {
        sig = { type: "image", asset: upload!.id };
        p = { aspect: upload!.aspect, preview: upload!.url };
      }
      if (keep) {
        const assets = sig.type === "image" ? plainAssets({ [sig.asset]: ctl.rt.assets[sig.asset] }) : {};
        const ok = await saveSignature({ id: newId("sig"), role, sig, color, aspect: p.aspect, assets, at: Date.now() });
        if (!ok) ctl.toast({ text: "This browser can’t keep signatures on this device.", tone: "info" });
      }
      onPlace({ kind: "signature", role, sig, color, ...p, label });
    } catch {
      setError("That didn’t work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pickSaved(s: SavedSignature) {
    setBusy(true);
    try {
      for (const [id, a] of Object.entries(s.assets)) {
        hold(id);
        if (!ctl.rt.assets[id]) await addAsset(ctl.rt, a, id);
      }
      const preview = s.sig.type === "typed" ? (await typedPlacement(s.sig.text, s.sig.face, s.color)).preview : s.sig.type === "drawn" ? drawnPreview(s.sig.strokes, s.sig.aspect, s.color) : ctl.rt.assets[s.sig.asset].url;
      await saveSignature({ ...s, at: Date.now() });
      onPlace({ kind: "signature", role: s.role, sig: s.sig, color: s.color, aspect: s.aspect, preview, label: s.role === "initials" ? "Initials" : "Signature" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={<span className="sr-only">Sign</span>}
      className="ed-sign"
      onCloseButton={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Save on this device
          </label>
          <span className="flex gap-2">
            <Button variant="plain" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!ready} busy={busy} onClick={() => void place()} data-testid="sign-place">
              Place
            </Button>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-4" data-testid="sign-dialog">
        <SegmentedControl
          label="Sign as"
          look="tabs"
          fullWidth
          value={role}
          onChange={(r) => (setRole(r), setStrokes([]))}
          options={[
            { value: "signature", label: "Signature" },
            { value: "initials", label: "Initials" },
          ]}
        />
        {mine.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={`Saved ${role === "initials" ? "initials" : "signatures"}`}>
            {mine.map((s) => (
              <li key={s.id} className="ed-sigchip">
                <button type="button" className="ed-sigchip__use" aria-label={`Use saved ${s.role}`} onClick={() => void pickSaved(s)} disabled={busy}>
                  <SavedArt s={s} />
                </button>
                <button
                  type="button"
                  className="ed-sigchip__x"
                  aria-label={`Remove saved ${s.role}`}
                  onClick={() => void deleteSignature(s.id).then(() => setSaved((all) => all.filter((x) => x.id !== s.id)))}
                >
                  <CloseBold size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <SegmentedControl
          label="How"
          look="tabs"
          value={mode}
          onChange={setMode}
          options={[
            { value: "type", label: "Type", icon: <TextBold size={16} /> },
            { value: "draw", label: "Draw", icon: <PenBold size={16} /> },
            { value: "upload", label: "Upload", icon: <UploadBold size={16} /> },
          ]}
        />
        {mode === "type" && (
          <div className="flex flex-col gap-3">
            <input
              className="ed-field text-base"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={role === "initials" ? "Your initials" : "Your name"}
              aria-label={role === "initials" ? "Your initials" : "Your name"}
              maxLength={role === "initials" ? 6 : 60}
              autoComplete={role === "initials" ? "off" : "name"}
              data-autofocus
              data-testid="sign-text"
            />
            <div role="radiogroup" aria-label="Style" className="ed-faces" data-ready={facesReady || undefined}>
              {SIGN_FACES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={face === f.id}
                  aria-label={f.label}
                  className={cx("ed-face", face === f.id && "ed-face--on")}
                  style={{ fontFamily: `"${cssFamily(f.id)}", cursive`, color }}
                  onClick={() => setFace(f.id)}
                >
                  {text.trim() || (role === "initials" ? "AB" : "Your name")}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === "draw" && <DrawPad strokes={strokes} onChange={setStrokes} aspect={aspect} color={color} />}
        {mode === "upload" && (
          <div className="flex flex-col items-center gap-3">
            {upload ? <img src={upload.url} alt="Uploaded signature" className="ed-sigupload" /> : null}
            <input
              ref={input}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              data-testid="sign-upload"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setFile(f);
              }}
            />
            <Button variant="soft" iconStart={<UploadBold size={16} />} onClick={() => input.current?.click()}>
              {upload ? "Choose another" : "Choose image"}
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} />
              Remove background
            </label>
          </div>
        )}
        {mode !== "upload" && (
          <div role="radiogroup" aria-label="Ink" className="flex justify-center gap-2">
            {INK.map((c) => (
              <button key={c.hex} type="button" role="radio" aria-checked={color === c.hex} aria-label={c.name} title={c.name} className={cx("ed-swatch", color === c.hex && "ed-swatch--on")} style={{ background: c.hex }} onClick={() => setColor(c.hex)} />
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-danger-strong">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function SavedArt({ s }: { s: SavedSignature }) {
  const ctl = useCtl();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (s.sig.type === "typed") void typedPlacement(s.sig.text, s.sig.face, s.color).then((p) => alive && setUrl(p.preview));
    else if (s.sig.type === "drawn") setUrl(drawnPreview(s.sig.strokes, s.sig.aspect, s.color));
    else {
      const a = s.assets[s.sig.asset];
      if (a) {
        const u = URL.createObjectURL(new Blob([a.bytes as Uint8Array<ArrayBuffer>], { type: a.mime }));
        setUrl(u);
        return () => {
          alive = false;
          URL.revokeObjectURL(u);
        };
      }
    }
    return () => {
      alive = false;
    };
  }, [s, ctl]);
  return url ? <img src={url} alt="" className="h-9 w-auto max-w-[140px]" /> : <span className="h-9 w-16" />;
}

/** Drawing pad: strokes in a 0..1 box; pen, mouse or one finger. */
function DrawPad({ strokes, onChange, aspect, color }: { strokes: Pt[][]; onChange: (s: Pt[][]) => void; aspect: number; color: string }) {
  const pad = useRef<HTMLDivElement>(null);
  const live = useRef<Pt[] | null>(null);
  const [, force] = useState(0);
  const at = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const r = pad.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }, []);
  const all = live.current ? [...strokes, live.current] : strokes;
  return (
    <div className="flex flex-col gap-2">
      <div
        ref={pad}
        className="ed-pad"
        style={{ aspectRatio: String(aspect) }}
        role="img"
        aria-label={strokes.length ? "Your drawing" : "Draw here"}
        data-testid="sign-pad"
        onPointerDown={(e) => {
          e.preventDefault();
          pad.current?.setPointerCapture(e.pointerId);
          live.current = [at(e)];
          force((n) => n + 1);
        }}
        onPointerMove={(e) => {
          if (!live.current) return;
          const p = at(e);
          const last = live.current[live.current.length - 1];
          if (Math.hypot(p[0] - last[0], (p[1] - last[1]) / aspect) < 0.004) return;
          live.current.push(p);
          force((n) => n + 1);
        }}
        onPointerUp={() => {
          if (live.current) onChange([...strokes, live.current]);
          live.current = null;
        }}
        onPointerCancel={() => {
          live.current = null;
          force((n) => n + 1);
        }}
      >
        <svg viewBox={`0 0 ${aspect * 100} 100`} className="size-full" aria-hidden="true">
          {all.map((s, i) => (
            <path key={i} d={svgPolyline((s.length === 1 ? [s[0], [s[0][0] + 0.002, s[0][1]]] : s).map(([u, v]) => [u * aspect * 100, v * 100] as Pt))} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
        {!all.length && <span className="ed-pad__hint">Draw here</span>}
        <span className="ed-pad__line" aria-hidden="true" />
      </div>
      <Button variant="plain" size="sm" className="self-end" disabled={!strokes.length} onClick={() => onChange([])}>
        Clear
      </Button>
    </div>
  );
}
