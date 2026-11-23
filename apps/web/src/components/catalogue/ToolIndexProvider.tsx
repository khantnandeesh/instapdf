"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { ToolIndex } from "./types";

const Ctx = createContext<ToolIndex>({ items: [], categories: [] });

/** One copy of the tool list (with icons) shared by the header menu and the home catalogue. */
export function ToolIndexProvider({ index, children }: { index: ToolIndex; children: ReactNode }) {
  return <Ctx.Provider value={index}>{children}</Ctx.Provider>;
}

export const useToolIndex = () => useContext(Ctx);
