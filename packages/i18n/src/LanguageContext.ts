import { defineInterface } from '@nzyme/ioc/Interface.js';

import type { Language } from './Language.js';

/**
 * Provides current language.
 */
export interface LanguageContext {
    (): Language;
}

/**
 * Provides current language.
 */
export const LanguageContext = defineInterface<LanguageContext>({
    name: 'LanguageContext',
});
