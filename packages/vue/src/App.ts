import type { App as AppImport } from 'vue';

import { defineInterface } from '@nzyme/ioc/Interface.js';

/** IoC interface for the Vue application instance. */
export const App = defineInterface<AppImport>({
    name: 'App',
});

/** Vue application instance type alias. */
export type App = AppImport;
