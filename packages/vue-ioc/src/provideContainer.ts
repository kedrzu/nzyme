import { provide } from 'vue';

import type { VueContainer } from './createContainer.js';
import { injectionKey } from './injectionKey.js';

/**
 * Provide a container to the current component.
 * @param container - The container to provide.
 */
export function provideContainer(container: VueContainer) {
    provide(injectionKey, container);
}
