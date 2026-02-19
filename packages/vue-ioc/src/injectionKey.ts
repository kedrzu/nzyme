import type { InjectionKey } from 'vue';

import type { VueContainer } from './createContainer.js';

/**
 *
 */
export const injectionKey = Symbol('container') as InjectionKey<VueContainer>;
