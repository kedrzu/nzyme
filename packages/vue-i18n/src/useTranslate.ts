import type { Translation } from '@nzyme/i18n';

/**
 *
 */
export interface TranslateFunction {
    /**
     * Translate a key.
     */
    (translation: Translation): string | undefined;

    /**
     * Translate a key with parameters.
     */
    <T>(translation: Translation<T>, params: T): string | undefined;
}

/**
 *
 */
export function useTranslate(): TranslateFunction {
    const lang = 'pl';

    return (translation: Translation<unknown>, params?: unknown) => {
        const result = translation(lang, params);
        if (Array.isArray(result)) {
            return result.join('');
        }

        return result;
    };
}
