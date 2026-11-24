/** F23 off: what tool-cloud.ts becomes in builds without NEXT_PUBLIC_CLOUD_SOURCES=1 (next.config.ts). */
import type * as On from "./tool-cloud";
import { useNoCloud } from "./off";

export const useCloud: typeof On.useCloud = useNoCloud;
export const cloudMenus: typeof On.cloudMenus = null;
