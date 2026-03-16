import type { InjectionKey } from 'vue';

import type { VueContainer } from './createContainer.js';

/** Vue injection key for providing the IoC container through the component tree. */
export const injectionKey = Symbol('container') as InjectionKey<VueContainer>;
