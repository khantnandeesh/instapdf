/**
 * F23 stand-in for useCloudIntake in builds without NEXT_PUBLIC_CLOUD_SOURCES=1: same shape, no
 * providers, no code. tool-cloud.off.ts exports it in place of the real hook, so those builds ship none
 * of the cloud code (AC-120: the tool page is as before F23).
 */
import type { useCloudIntake } from "./useCloudIntake";

const none: ReturnType<typeof useCloudIntake> = {
  providers: [],
  enabled: false,
  open: () => {},
  downloads: [],
  holding: false,
  pending: 0,
  statusText: null,
  stop: () => {},
  retry: () => {},
  originOf: () => undefined,
  markLocal: () => {},
};

export const useNoCloud: typeof useCloudIntake = () => none;
