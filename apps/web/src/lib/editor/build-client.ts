"use client";
/** Main-thread side of the download worker. Created on the first Download intent (pointerenter/focus) or click. */
import type { BuildInput } from "./build";
import type { BuildResponse } from "./build.worker";

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  worker ??= new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module", name: "berry-build" });
  return worker;
}

/** Starts the worker (and its pdf-lib chunk) early, on Download intent. */
export function warmBuild(): void {
  getWorker().postMessage({ id: 0, warm: true });
}

export function buildInWorker(input: BuildInput): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = nextId++;
    const onMessage = (e: MessageEvent<BuildResponse>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      if (e.data.ok) resolve(e.data.bytes);
      else reject(new Error(e.data.message));
    };
    const onError = (e: ErrorEvent) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      if (worker === w) {
        w.terminate();
        worker = null;
      }
      reject(new Error(e.message || "Build worker failed"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    // Copies (not transfers) the bytes: the editor keeps its own for further edits.
    w.postMessage({ id, input });
  });
}
