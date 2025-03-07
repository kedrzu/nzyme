import type { App as AppImport } from 'vue';

import { defineInterface } from '@nzyme/ioc';

export const App = defineInterface<AppImport>({
    name: 'App',
});

export type App = AppImport;
