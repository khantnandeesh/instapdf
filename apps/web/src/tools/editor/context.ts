"use client";
import { createContext, useContext } from "react";
import type { Controller } from "./controller";

export const EditorContext = createContext<Controller | null>(null);

export function useCtl(): Controller {
  const c = useContext(EditorContext);
  if (!c) throw new Error("EditorContext missing");
  return c;
}

/** CSS px per point at 100% zoom (96 / 72), as PDF viewers use. */
export const BASE_SCALE = 4 / 3;
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
