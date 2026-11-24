/**
 * Which bytes the editor's engine worker may reopen with BerryDocument.setMadeAfter (a trust
 * boundary: objects above madeAfter were made by the engine's own edits, so a sibling font an
 * earlier edit made can be extended instead of copied). The worker reopens its output after
 * every edit, which would otherwise reset madeAfter.
 *
 * An epoch starts at bytes handed to the worker that it did not save itself (the person's file):
 * madeAfter is read from that first open. Bytes the worker saves from the epoch's bytes join it.
 * Reopening any of them (the next edit, undo, redo, a rollback) restores madeAfter; any other
 * bytes start a new epoch. Fingerprints are synchronous so the worker never yields between
 * opening a document and setting its boundary.
 */
export interface TrustedDocument {
  madeAfter(): number;
  setMadeAfter(n: number): void;
}

/** Two 32-bit FNV-1a style hashes (different primes and seeds) and the length. */
export function fingerprint(bytes: Uint8Array): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i]!, 0x01000193);
    b = Math.imul(b ^ bytes[i]!, 0x5bd1e995);
  }
  return `${bytes.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

export class MadeAfterTrust {
  private epoch: { madeAfter: number; ours: Set<string> } | null = null;

  /** Restores madeAfter on a document just opened from bytes with this fingerprint, if ours. */
  restore(print: string, doc: TrustedDocument): void {
    if (this.epoch?.ours.has(print)) doc.setMadeAfter(this.epoch.madeAfter);
  }

  /**
   * After an open request: bytes of this epoch keep it (restore has run); others start a new one
   * from this document, which must not have been restored.
   */
  opened(print: string, doc: TrustedDocument): void {
    if (this.epoch?.ours.has(print)) return;
    this.epoch = { madeAfter: doc.madeAfter(), ours: new Set([print]) };
  }

  /** Output the worker saved from bytes of the current epoch. */
  saved(print: string): void {
    this.epoch?.ours.add(print);
  }
}
