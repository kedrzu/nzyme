import type { App } from 'vue';

import type { VueContainer } from './createContainer.js';
import { injectionKey } from './injectionKey.js';

/**
 * Options for the IocPlugin.
 */
export interface IocPluginOptions {
    /**
     * The container to provide.
     */
    container: VueContainer;
}

/**
 * Plugin for the Ioc container.
 */
export function IocPlugin(app: App, options: IocPluginOptions) {
    app.provide(injectionKey, options.container);
}
