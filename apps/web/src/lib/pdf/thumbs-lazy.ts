/**
 * The thumbnail renderer, fetched the first time a file is in (it and the picture helpers it uses
 * are never needed on an empty tool page). Calls made before it arrives run in order once it does,
 * so a register always precedes the requests for that file.
 */
import type { ImageFormat } from "./image-names";
import type { ThumbnailRenderer } from "./thumbnails";

export type Thumbs = Pick<ThumbnailRenderer, "register" | "registerImage" | "unregister" | "request">;

export const loadThumbnails = () => import("./thumbnails");

export class LazyThumbnails implements Thumbs {
  private real: ThumbnailRenderer | null = null;
  private pending: ((r: ThumbnailRenderer) => void)[] = [];
  private loading: Promise<void> | null = null;

  /** `loader` is the chunk import (a test passes its own). */
  constructor(private readonly loader: () => Promise<Pick<typeof import("./thumbnails"), "ThumbnailRenderer">> = loadThumbnails) {}

  /**
   * Fetches the renderer (idempotent). If the chunk fails to load (offline, a new deploy), the queued
   * calls are dropped, so they stop holding PDF documents, and the next call tries again.
   */
  load(): Promise<void> {
    return (this.loading ??= this.loader().then(
      (m) => {
        const real = new m.ThumbnailRenderer();
        this.real = real;
        for (const op of this.pending.splice(0)) op(real);
      },
      (err: unknown) => {
        this.loading = null;
        this.pending.length = 0;
        throw err;
      },
    ));
  }

  private run(op: (r: ThumbnailRenderer) => void): void {
    if (this.real) op(this.real);
    else {
      this.pending.push(op);
      // A failed load is handled above (queue dropped, retried on the next call); nothing to report here.
      this.load().catch(() => {});
    }
  }

  register(fileId: string, doc: Parameters<ThumbnailRenderer["register"]>[1]): void {
    this.run((r) => r.register(fileId, doc));
  }

  registerImage(fileId: string, blob: Blob, format: ImageFormat, frames: { width: number; height: number }[]): void {
    this.run((r) => r.registerImage(fileId, blob, format, frames));
  }

  unregister(fileId: string): void {
    this.run((r) => r.unregister(fileId));
  }

  request(fileId: string, index: number, cssSize: number, priority: number, onDone: (canvas: HTMLCanvasElement) => void): () => void {
    if (this.real) return this.real.request(fileId, index, cssSize, priority, onDone);
    let cancel: (() => void) | null = null;
    let cancelled = false;
    this.run((r) => {
      if (!cancelled) cancel = r.request(fileId, index, cssSize, priority, onDone);
    });
    return () => {
      cancelled = true;
      cancel?.();
    };
  }
}
