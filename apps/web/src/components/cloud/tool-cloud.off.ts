// F23 off (next.config.ts swaps this in for tool-cloud.tsx): nothing ships, and nothing calls it.
import type * as On from "./tool-cloud";

const none = null as never;
export const useCloud: typeof On.useCloud = none;
export const CloudCaret: typeof On.CloudCaret = none;
export const pageHub: typeof On.pageHub = none;
export const loadCloud: typeof On.loadCloud = none;
export const cloudUi: typeof On.cloudUi = none;
export const pickedFromDevice: typeof On.pickedFromDevice = none;
