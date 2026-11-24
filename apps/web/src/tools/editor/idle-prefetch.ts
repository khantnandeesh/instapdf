/**
 * The editor's idle prefetch (U-E13): the editor shell's and pdf.js's chunks are fetched and
 * registered, not evaluated. `require.ensure` loads the chunks its dependencies live in and runs
 * none of their modules (the callback requires nothing), so evaluating them (a few hundred ms of
 * main-thread work on a phone) waits for intent (pointer or focus on Open PDF, a drag) or the
 * pick, and is never a long task on an idle landing (Lighthouse TBT). Unlike `webpackPrefetch`,
 * it needs no extra webpack runtime on every page.
 */
declare const require: { ensure(deps: string[], ready: () => void, failed: (e: unknown) => void): void };

export function prefetchEditorChunks(): void {
  require.ensure(
    ["./EditorShell", "pdfjs-dist"],
    () => {},
    () => {},
  );
}
