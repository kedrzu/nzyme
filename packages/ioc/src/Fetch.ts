import type { Fetch as FetchShape } from '@nzyme/types/Fetch.js';

import { defineInjectable } from './Injectable.js';

/** Default injectable request transport backed by the current runtime's global fetch. */
export const Fetch = defineInjectable<FetchShape>(() => globalThis.fetch);
