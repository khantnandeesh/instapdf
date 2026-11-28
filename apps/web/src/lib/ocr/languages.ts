/** The languages the recogniser ships with (spec F15 §2). The data is copied by scripts/copy-ocr.mjs from the list in ocr.json. */
import config from "./ocr.json";

export type OcrLanguage = { code: string; name: string };

export const OCR_LANGUAGES: readonly OcrLanguage[] = config.languages.map(({ code, name }) => ({ code, name }));
export const OCR_DEFAULT = "eng";
export const isOcrLanguage = (code: unknown): code is string => typeof code === "string" && OCR_LANGUAGES.some((l) => l.code === code);

/** The shipped language a browser locale ("pt-BR") reads, or English. */
export function languageForLocale(locale: string | undefined): string {
  const base = (locale ?? "").toLowerCase().split("-")[0];
  return config.languages.find((l) => l.locales.includes(base))?.code ?? OCR_DEFAULT;
}

/** Where the recogniser's files are served from: folders named by version, cached for a year. */
export const OCR_PATHS = {
  worker: `/ocr/engine-${config.engine}/worker.min.js`,
  core: `/ocr/engine-${config.engine}/core`,
  data: `/ocr/data-${config.data}`,
} as const;
