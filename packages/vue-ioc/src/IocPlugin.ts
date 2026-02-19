import type { App } from 'vue';

import { injectionKey } from './injectionKey.js';
import type { VueContainer } from './createContainer.js';

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
