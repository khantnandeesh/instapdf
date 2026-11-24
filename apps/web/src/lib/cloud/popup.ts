/**
 * The F23 window's features: a small window centred on this one on desktop, a plain new tab on phones
 * and touch tablets (no features). Apart from opener.ts so a tool page's own code (cloud/tool-cloud.tsx,
 * which opens the window when the cloud chunk is not here yet) carries only this.
 */
export function popupFeatures(win: { innerWidth: number; screenX?: number; screenY?: number; outerWidth?: number; outerHeight?: number; matchMedia?: (q: string) => { matches: boolean } }): string {
  const phone = win.innerWidth < 640 || !!win.matchMedia?.("(pointer: coarse)").matches;
  if (phone) return "";
  const w = 480;
  const h = 640;
  const left = Math.round((win.screenX ?? 0) + Math.max(0, ((win.outerWidth ?? w) - w) / 2));
  const top = Math.round((win.screenY ?? 0) + Math.max(0, ((win.outerHeight ?? h) - h) / 2));
  return `popup,width=${w},height=${h},left=${left},top=${top}`;
}
