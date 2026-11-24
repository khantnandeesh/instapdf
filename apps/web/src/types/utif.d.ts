/** Minimal types for UTIF.js (MIT, Photopea), the TIFF decoder used for Merge's TIFF input. */
declare module "utif" {
  export type IFD = { width: number; height: number; data?: Uint8Array; [tag: string]: unknown };
  const UTIF: {
    decode(buffer: ArrayBuffer | Uint8Array): IFD[];
    decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: IFD, ifds?: IFD[]): void;
    toRGBA8(ifd: IFD): Uint8Array;
  };
  export default UTIF;
}
