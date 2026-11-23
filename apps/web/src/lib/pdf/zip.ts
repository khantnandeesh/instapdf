import { Zip, ZipPassThrough } from "fflate";

/** Fixed timestamp: the output does not leak when the file was made. */
const MTIME = new Date("2000-01-01T00:00:00Z");

/**
 * Streaming ZIP writer. Entries are stored (PDFs are already compressed) and
 * written as they are added; the written bytes are moved into a Blob after
 * each entry, so the caller can drop every entry's buffer right after `add`.
 * Names must already be unique (see `uniqueNames`).
 */
export function createZipWriter() {
  let blob = new Blob([]);
  let pending: Uint8Array<ArrayBuffer>[] = [];
  let failure: Error | null = null;
  let finished = false;
  const zip = new Zip((err, chunk, final) => {
    if (err) failure = err;
    else pending.push(chunk as Uint8Array<ArrayBuffer>);
    if (final) finished = true;
  });
  const flush = () => {
    if (failure) throw failure;
    if (pending.length) {
      blob = new Blob([blob, ...pending]);
      pending = [];
    }
  };
  return {
    add(name: string, bytes: Uint8Array) {
      const entry = new ZipPassThrough(name);
      entry.mtime = MTIME;
      zip.add(entry);
      entry.push(bytes, true);
      flush();
    },
    finish(): Blob {
      zip.end();
      flush();
      if (!finished) throw new Error("ZIP stream did not finish");
      return new Blob([blob], { type: "application/zip" });
    },
  };
}
