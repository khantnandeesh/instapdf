/** pdf.js's stand-alone image decoders (used by the unit tests to read back what we encode). */
declare module "pdfjs-dist/image_decoders/pdf.image_decoders.mjs" {
  export class JpegImage {
    width: number;
    height: number;
    numComponents: number;
    parse(data: Uint8Array): void;
    getData(options: { width: number; height: number; forceRGB: boolean; isSourcePDF: boolean }): Uint8ClampedArray;
  }
}
