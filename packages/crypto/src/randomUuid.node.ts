import { randomUUID } from 'node:crypto';
import type { UUID } from 'node:crypto';

/**
 * Generates a random UUID v4 string.
 *
 * @returns A random UUID v4 string.
 */
export const randomUuid = randomUUID as () => UUID;
