import { defineService } from '@nzyme/ioc';

import { LanguageProvider } from './LanguageProvider.js';
import type { Translation } from './Translation.js';

/**
 *
 */
export interface Translator {
    /**
     * Translate a key.
     */
    (translation: Translation): string;

    /**
     * Translate a key with parameters.
     */
    <T>(translation: Translation<T>, params: T): string;
}

/**
 *
 */
export const Translator = defineService({
    name: 'Translator',
    deps: {
        lang: LanguageProvider,
    },
    setup({ lang }): Translator {
        return (translation: Translation<unknown>, params?: unknown) => {
            const result = translation(lang(), params);
            if (Array.isArray(result)) {
                return result.join('');
            }

            return result || '';
        };
    },
});
