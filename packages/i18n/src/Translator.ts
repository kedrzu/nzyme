import { defineService } from '@nzyme/ioc';

import { LanguageContext } from './LanguageContext.js';
import { translateToString } from './translateToString.js';
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
        lang: LanguageContext,
    },
    setup({ lang }): Translator {
        return (translation: Translation<unknown>, params?: unknown) => {
            return translateToString(translation, lang(), params);
        };
    },
});
