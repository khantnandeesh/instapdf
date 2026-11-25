/** The loaded engine, shared by every lib/motion entry point (load.ts sets it). No import of the engine itself. */
import type * as Engine from "./engine";

let engine: typeof Engine | undefined;

/** The engine, once it has arrived. */
export const motion = () => engine;

export const setMotion = (m: typeof Engine) => void (engine = m);
