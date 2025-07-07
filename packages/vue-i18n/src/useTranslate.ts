import { LanguageContext } from '@nzyme/i18n';
import type { Translation } from '@nzyme/i18n';
import { useService } from '@nzyme/vue-ioc';

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
    const lang = useService(LanguageContext);

    return (translation: Translation<unknown>, params?: unknown) => {
        const result = translation(lang(), params);
        if (Array.isArray(result)) {
            return result.join('');
        }

        return result;
    };
}
