import type { Flatten } from './Object.js';

/** Resolves a config type by overlaying user values V on top of defaults D for base type T. */
export type ConfigDefault<T, V extends Partial<T>, D extends T> = Flatten<{
    [K in keyof T]: K extends keyof V ? V[K] : K extends keyof D ? D[K] : never;
}>;
