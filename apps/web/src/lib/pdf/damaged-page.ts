/**
 * The page a damaged file shows in the task (Repair, spec F13 §2): nothing of it can be drawn, so it
 * gets a plain sheet with a tear across it. Drawn once, at twice the size it is shown.
 */
export const DAMAGED_PAGE = { width: 595, height: 842 };

type Renderer = { registerImage(id: string, blob: Blob, format: "png", frames: { width: number; height: number }[]): void };

/** Puts a file nothing can open into the task as one placeholder page (the tool flow's intake, for Repair). */
export async function takeDamaged(id: string, renderer: Renderer | null | undefined, alive: () => boolean, patch: (id: string, change: { status: "ready"; damaged: true; pageCount: 1; pages: { width: number; height: number }[] }) => void, tell: () => void): Promise<"ok" | "gone"> {
  const picture = await damagedPage();
  if (!alive()) return "gone";
  renderer?.registerImage(id, picture, "png", [{ width: DAMAGED_PAGE.width * 2, height: DAMAGED_PAGE.height * 2 }]);
  patch(id, { status: "ready", damaged: true, pageCount: 1, pages: [DAMAGED_PAGE] });
  tell();
  return "ok";
}

let made: Promise<Blob> | null = null;

export function damagedPage(): Promise<Blob> {
  made ??= new Promise<Blob>((resolve, reject) => {
    const w = DAMAGED_PAGE.width * 2;
    const h = DAMAGED_PAGE.height * 2;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("No canvas"));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    // Lines of "text", lighter below the tear: what is there, and what may be lost.
    const line = (y: number, width: number, colour: string) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.roundRect(150, y, width, 36, 18);
      ctx.fill();
    };
    [0.92, 0.7, 0.84, 0.55].forEach((f, i) => line(190 + i * 96, (w - 300) * f, "#d9d2d0"));
    [0.8, 0.62, 0.9, 0.48, 0.74].forEach((f, i) => line(980 + i * 96, (w - 300) * f, "#ece7e5"));
    // The tear: a zigzag from edge to edge.
    ctx.strokeStyle = "#b9aeab";
    ctx.lineWidth = 14;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    const ys = [760, 690, 800, 700, 820, 720, 790, 700, 770];
    ys.forEach((y, i) => (i ? ctx.lineTo((w / (ys.length - 1)) * i, y) : ctx.moveTo(0, y)));
    ctx.stroke();
    canvas.toBlob((blob) => {
      canvas.width = canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error("No picture"));
    }, "image/png");
  });
  made.catch(() => (made = null));
  return made;
}
