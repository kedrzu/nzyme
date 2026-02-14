import { defineNuxtPlugin } from 'nuxt/app';

import { createContainer } from '@nzyme/vue-ioc/createContainer.js';
import { IocPlugin } from '@nzyme/vue-ioc/IocPlugin.js';

import { LocalDatabase } from '../services/LocalDatabase.js';
import { LogStore } from '../services/LogStore.js';

export default defineNuxtPlugin(nuxtApp => {
    const container = createContainer();
    nuxtApp.vueApp.use(IocPlugin, { container });

    // Register services
    container.register(LocalDatabase);
    container.register(LogStore);

    // Initialize LogStore (load from IndexedDB, connect WebSocket)
    const logStore = container.resolve(LogStore);
    void logStore.initialize();
});
