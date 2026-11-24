// F23 off (next.config.ts swaps this in for tool-cloud.ts): nothing ships, and nothing calls it.
import type * as On from "./tool-cloud";

export const useCloud = null as unknown as typeof On.useCloud;
export const cloudReady = false;
