/**
 * The editor's idle prefetch, as a chunk of its own (U-E13). Loading this small chunk makes the
 * webpack runtime add a `<link rel="prefetch">` for each chunk imported below with
 * `webpackPrefetch`: the editor shell and pdf.js are downloaded into the HTTP cache at the
 * browser's idle priority and not evaluated. Evaluating them (a few hundred ms of main-thread work
 * on a phone) waits for intent (pointer or focus on Open PDF, a drag) or the pick itself, so it is
 * never a long task on an idle landing (Lighthouse TBT).
 *
 * Nothing here is called: the imports only declare what to prefetch. EditorTool loads this chunk
 * on idle, and only where early fetches are allowed (not on Data Saver or 2g).
 */
export const prefetched = [() => import(/* webpackPrefetch: true */ "./EditorShell"), () => import(/* webpackPrefetch: true */ "pdfjs-dist")] as const;
