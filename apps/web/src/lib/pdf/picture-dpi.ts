/** Flatten to pictures: the resolutions on offer. Pure, so the option panel does not load the drawing code. */
export const PICTURE_DPI = [75, 100, 150, 220] as const;
export type PictureDpi = (typeof PICTURE_DPI)[number];
