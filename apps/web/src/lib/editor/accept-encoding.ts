/**
 * Accept-Encoding patterns for next.config `has` rules (Next matches them as `^value$`). A coding
 * counts when it is listed without `q=0`: "br;q=0" means the client refuses brotli. Unit tested.
 */
const accepts = (coding: string) => `(?!.*(?:^|[\\s,])${coding}\\s*;\\s*q\\s*=\\s*0(?:\\.0{0,3})?\\s*(?:,|$))(?:.*[\\s,])?${coding}(?:\\s*;[^,]*)?(?:,.*)?`;

export const ACCEPTS_BR = accepts("br");
export const ACCEPTS_GZIP = accepts("gzip");
