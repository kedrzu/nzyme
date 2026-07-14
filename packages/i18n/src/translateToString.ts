import type { Translation } from '@nzyme/i18n-core/Translation.js';

/**
 * Translate a key.
 * @util
 */
export function translateToString(translation: Translation, lang: string): string;
/**
 * Translate a key with parameters.
 */
export function translateToString<T>(translation: Translation<T>, lang: string, params: T): string;
/**
 * Translate a key.
 */
export function translateToString(translation: Translation<unknown>, lang: string, params?: unknown): string {
    const result = translation(lang, params);
    if (Array.isArray(result)) {
        return result.join('');
    }

    return result || '';
}
