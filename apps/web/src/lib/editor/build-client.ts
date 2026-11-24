"use client";
/** Main-thread side of the download worker. Created on the first Download intent (pointerenter/focus) or click. */
import type { BuildInput } from "./build";
import type { BuildResponse } from "./build.worker";

let worker: Worker | null = null;
let nextId = 1;
/** Rejects the builds still running (when the worker is stopped). */
const pending = new Map<number, (e: Error) => void>();

/** Stops the worker (the editor closed); a running build is rejected. */
export function disposeBuild(): void {
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const reject of pending.values()) reject(new Error("closed"));
  pending.clear();
}

function getWorker(): Worker {
  worker ??= new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module", name: "berry-build" });
  return worker;
}

/** Starts the worker (and its pdf-lib chunk) early, on Download intent. */
export function warmBuild(): void {
  getWorker().postMessage({ id: 0, warm: true });
}

/** True when `password` is the file's owner password (checked in the download worker). */
export function checkOwnerPassword(bytes: Uint8Array, password: string, userPassword?: string): Promise<boolean> {
  return request({ owner: { bytes, password, userPassword } }).then((r) => "owner" in r && r.owner);
}

export function buildInWorker(input: BuildInput): Promise<Uint8Array> {
  return request({ input }).then((r) => {
    if (!("bytes" in r)) throw new Error("Unexpected reply");
    return r.bytes;
  });
}

type Ok = Extract<BuildResponse, { ok: true }>;
type Body = { input: BuildInput } | { owner: { bytes: Uint8Array; password: string; userPassword?: string } };

function request(body: Body): Promise<Ok> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = nextId++;
    const done = () => {
      pending.delete(id);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    pending.set(id, (e) => {
      done();
      reject(e);
    });
    const onMessage = (e: MessageEvent<BuildResponse>) => {
      if (e.data.id !== id) return;
      done();
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.message));
    };
    const onError = (e: ErrorEvent) => {
      done();
      if (worker === w) {
        w.terminate();
        worker = null;
      }
      reject(new Error(e.message || "Build worker failed"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    // Copies (not transfers) the bytes: the editor keeps its own for further edits.
    w.postMessage({ id, ...body });
  });
}
