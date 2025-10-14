import { defineInterface } from '@nzyme/ioc';

import type { Language } from './Language.js';

/**
 * A function that provides all available languages.
 */
export type LanguageProvider = () => Language[];

/**
 * A service that provides all available languages.
 */
export const LanguageProvider = defineInterface<LanguageProvider>({
    name: 'LanguageProvider',
});
