"use client";
/** Main-thread side of the font matching worker, created on the first match. */
import type { FontProgram } from "../editor/berry-engine";
import type { FontMatch } from "./match";
import type { MatchRequest, MatchResponse } from "./match.worker";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (m: FontMatch[]) => void; reject: (e: Error) => void }>();

function fail(e: Error) {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.reject(e);
  pending.clear();
}

/** The library fonts closest to a document font, best first. */
export function matchFont(program: Pick<FontProgram, "format" | "bytes" | "glyphs">, top = 5): Promise<FontMatch[]> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker(new URL("./match.worker.ts", import.meta.url), { type: "module", name: "berry-fontmatch" });
      worker.onmessage = (e: MessageEvent<MatchResponse>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.matches);
        else p.reject(new Error(e.data.message));
      };
      worker.onerror = (e) => fail(new Error(e.message || "Font matching failed"));
    }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, program, top } satisfies MatchRequest);
  });
}

export function disposeMatcher(): void {
  fail(new Error("closed"));
}
