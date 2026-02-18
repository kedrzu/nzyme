import { provide } from 'vue';

import { injectionKey } from './injectionKey.js';
import type { VueContainer } from './createContainer.js';

/**
 * Provide a container to the current component.
 * @param container - The container to provide.
 */
export function provideContainer(container: VueContainer) {
    provide(injectionKey, container);
}
