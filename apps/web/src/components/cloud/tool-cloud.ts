/**
 * F23 entry point for tool pages: the cloud intake hook and Merge's cloud menus. Builds without
 * NEXT_PUBLIC_CLOUD_SOURCES=1 swap this module for tool-cloud.off.ts (next.config.ts), so they ship
 * none of the cloud code (AC-120).
 */
import { addPagesEntries, phoneAddEntries } from "./cloud-menus";
import { cloudFootnote } from "./items";
import { useCloudIntake } from "./useCloudIntake";

export const useCloud = useCloudIntake;
export const cloudMenus: { addPagesEntries: typeof addPagesEntries; phoneAddEntries: typeof phoneAddEntries; cloudFootnote: typeof cloudFootnote } | null = {
  addPagesEntries,
  phoneAddEntries,
  cloudFootnote,
};
