import { defineInterface } from '@nzyme/ioc/Interface.js';
import type { App as AppImport } from 'vue';

/** IoC interface for the Vue application instance. */
export const App = defineInterface<AppImport>({
    name: 'App',
});

/** Vue application instance type alias. */
export type App = AppImport;
