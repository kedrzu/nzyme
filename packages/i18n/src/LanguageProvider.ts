import { defineInterface } from '@nzyme/ioc';

/**
 * A function that provides all available languages.
 */
export type LanguageProvider = () => string[];

/**
 * A service that provides all available languages.
 */
export const LanguageProvider = defineInterface<LanguageProvider>({
    name: 'LanguageProvider',
});
