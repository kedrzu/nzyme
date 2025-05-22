import { provide } from 'vue';
import type { App } from 'vue';

import { injectionKey } from './createContainer.js';
import type { VueContainer } from './createContainer.js';

/**
 *
 */
export function provideContainer(container: VueContainer, app?: App) {
    if (app) {
        app.provide(injectionKey, container);
    } else {
        provide(injectionKey, container);
    }
}
