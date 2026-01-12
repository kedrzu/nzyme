import type { Writable } from '@nzyme/types';

import { identity } from './functions/identity.js';

/**
 * Creates a writable version of a value.
 * This is a type-level operation that doesn't actually modify the value at runtime.
 * It's useful when you need to temporarily treat a readonly value as writable.
 *
 * @template T - The type of the value to make writable
 * @param value - The value to make writable
 * @returns The same value, but with a writable type
 *
 * @example
 * ```typescript
 * const readonlyObj = { a: 1, b: 2 } as const;
 * const writableObj = writable(readonlyObj);
 * // writableObj is typed as { a: number; b: number }
 * ```
 */
export const writable = identity as <T>(value: T) => Writable<T>;
