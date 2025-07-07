import { defineInterface } from '@nzyme/ioc';

/**
 * Provides current language.
 */
export interface LanguageContext {
    (): string;
}

/**
 * Provides current language.
 */
export const LanguageContext = defineInterface<LanguageContext>({
    name: 'LanguageContext',
});
