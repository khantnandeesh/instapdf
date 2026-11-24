/// <reference lib="webworker" />
/** Detect fields analysis off the main thread (AC-240). Loaded only when Detect fields is used. */
import { analyzePage, type AnalyzeInput } from "./analyze";

self.onmessage = (e: MessageEvent<{ id: number; input: AnalyzeInput }>) => {
  const { id, input } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, found: analyzePage(input) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String((err as Error)?.message ?? err) });
  }
};
